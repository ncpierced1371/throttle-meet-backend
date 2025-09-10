import { Pool } from 'pg';
import { Redis } from '@upstash/redis';
import jwt from 'jsonwebtoken';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 10000,
});
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const JWT_SECRET = process.env.JWT_SECRET;

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // JWT auth for user-specific features
  let userId = null;
  if (req.headers.authorization) {
    const token = req.headers.authorization.split(' ')[1];
    const payload = verifyToken(token);
    if (payload) userId = payload.userId;
  }

  // GET: search
  const {
    q, type, near, filters, sort, autocomplete, trending, recent, suggestions
  } = req.query;

  // Autocomplete
  if (autocomplete) {
    let ac = await redis.get(`search:autocomplete:${autocomplete}`);
    if (!ac) {
      const result = await pool.query(
        `SELECT DISTINCT content FROM social_posts WHERE content ILIKE $1 LIMIT 10`,
        [`%${autocomplete}%`]
      );
      ac = result.rows.map(r => r.content);
      await redis.set(`search:autocomplete:${autocomplete}`, ac, { ex: 3600 });
    }
    return res.status(200).json({ success: true, autocomplete: ac });
  }

  // Trending searches
  if (trending) {
    let trend = await redis.get('search:trending');
    if (!trend) {
      const result = await pool.query(
        `SELECT term, count FROM search_terms ORDER BY count DESC LIMIT 10`
      );
      trend = result.rows;
      await redis.set('search:trending', trend, { ex: 900 });
    }
    return res.status(200).json({ success: true, trending: trend });
  }

  // Recent searches
  if (recent && userId) {
    let rec = await redis.get(`search:recent:${userId}`);
    if (!rec) {
      const result = await pool.query(
        `SELECT term FROM user_search_history WHERE user_id = $1 ORDER BY searched_at DESC LIMIT 10`,
        [userId]
      );
      rec = result.rows.map(r => r.term);
      await redis.set(`search:recent:${userId}`, rec, { ex: 1800 });
    }
    return res.status(200).json({ success: true, recent: rec });
  }

  // Suggestions
  if (suggestions) {
    let sugg = await redis.get('search:suggestions');
    if (!sugg) {
      const result = await pool.query(
        `SELECT DISTINCT hashtag FROM social_posts WHERE hashtag IS NOT NULL LIMIT 10`
      );
      sugg = result.rows.map(r => r.hashtag);
      await redis.set('search:suggestions', sugg, { ex: 1800 });
    }
    return res.status(200).json({ success: true, suggestions: sugg });
  }

  // Main search
  if (q) {
    let cacheKey = `search:${type || 'all'}:${q}:${near || ''}:${filters || ''}:${sort || ''}`;
    let results = await redis.get(cacheKey);
    if (!results) {
      let queries = [];
      let params = [];
      let idx = 1;
      // Users
      if (!type || type === 'users' || type === 'all') {
        queries.push(`SELECT 'user' as type, id, display_name, car_make, car_model, bio, location, ts_rank_cd(tsv, plainto_tsquery($${idx})) as rank FROM users WHERE tsv @@ plainto_tsquery($${idx})`);
        params.push(q);
        idx++;
      }
      // Events
      if (!type || type === 'events' || type === 'all') {
        queries.push(`SELECT 'event' as type, id, title, description, rally_type, location, ts_rank_cd(tsv, plainto_tsquery($${idx})) as rank FROM events WHERE tsv @@ plainto_tsquery($${idx})`);
        params.push(q);
        idx++;
      }
      // Routes
      if (!type || type === 'routes' || type === 'all') {
        queries.push(`SELECT 'route' as type, id, name, description, category, difficulty, path, ts_rank_cd(tsv, plainto_tsquery($${idx})) as rank FROM routes WHERE tsv @@ plainto_tsquery($${idx})`);
        params.push(q);
        idx++;
      }
      // Posts
      if (!type || type === 'posts' || type === 'all') {
        queries.push(`SELECT 'post' as type, id, content, hashtags, user_id, ts_rank_cd(tsv, plainto_tsquery($${idx})) as rank FROM social_posts WHERE tsv @@ plainto_tsquery($${idx})`);
        params.push(q);
        idx++;
      }
      // Combine queries
      let sql = queries.join(' UNION ALL ') + ' ORDER BY rank DESC LIMIT 50';
      const result = await pool.query(sql, params);
      results = result.rows;
      await redis.set(cacheKey, results, { ex: 1800 });
      // Save search term for analytics
      await pool.query('INSERT INTO search_terms (term, count) VALUES ($1, 1) ON CONFLICT (term) DO UPDATE SET count = search_terms.count + 1', [q]);
      if (userId) await pool.query('INSERT INTO user_search_history (user_id, term) VALUES ($1, $2)', [userId, q]);
    }
    return res.status(200).json({ success: true, results });
  }

  // Spatial search
  if (near) {
    // near = "lat,lng,radius_km,type"
    const [lat, lng, radius, t] = near.split(',');
    let sql = '';
    let params = [lng, lat, radius];
    if (!t || t === 'events') {
      sql = `SELECT id, title, description, rally_type, location, ST_Distance(location, ST_MakePoint($1, $2)::geography) as distance FROM events WHERE ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3 * 1000) ORDER BY distance ASC LIMIT 50`;
    } else if (t === 'routes') {
      sql = `SELECT id, name, description, category, difficulty, path, ST_Distance(ST_StartPoint(path), ST_MakePoint($1, $2)::geography) as distance FROM routes WHERE ST_DWithin(ST_StartPoint(path), ST_MakePoint($1, $2)::geography, $3 * 1000) ORDER BY distance ASC LIMIT 50`;
    } else if (t === 'users') {
      sql = `SELECT id, display_name, car_make, car_model, location, ST_Distance(location, ST_MakePoint($1, $2)::geography) as distance FROM users WHERE ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3 * 1000) ORDER BY distance ASC LIMIT 50`;
    }
    const result = await pool.query(sql, params);
    return res.status(200).json({ success: true, results: result.rows });
  }

  res.status(400).json({ success: false, error: 'Invalid search request' });
}
