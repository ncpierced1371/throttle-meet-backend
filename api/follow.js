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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // JWT auth for protected ops
  let userId = null;
  if (req.headers.authorization) {
    const token = req.headers.authorization.split(' ')[1];
    const payload = verifyToken(token);
    if (payload) userId = payload.userId;
  }

  // GET: followers, following, mutuals, suggestions, counts
  if (req.method === 'GET') {
    const { id, followers, following, mutuals, suggestions, counts, recent } = req.query;
    if (followers) {
      let list = await redis.get(`followers:${followers}`);
      if (!list) {
        const result = await pool.query('SELECT followers FROM users WHERE id = $1', [followers]);
        list = result.rows[0]?.followers || [];
        await redis.set(`followers:${followers}`, list, { ex: 900 });
      }
      return res.status(200).json({ success: true, followers: list });
    }
    if (following) {
      let list = await redis.get(`following:${following}`);
      if (!list) {
        const result = await pool.query('SELECT following FROM users WHERE id = $1', [following]);
        list = result.rows[0]?.following || [];
        await redis.set(`following:${following}`, list, { ex: 900 });
      }
      return res.status(200).json({ success: true, following: list });
    }
    if (mutuals) {
      let mutual = await redis.get(`mutuals:${mutuals}`);
      if (!mutual) {
        const result = await pool.query('SELECT followers, following FROM users WHERE id = $1', [mutuals]);
        const f = result.rows[0]?.followers || [];
        const g = result.rows[0]?.following || [];
        mutual = f.filter(x => g.includes(x));
        await redis.set(`mutuals:${mutuals}`, mutual, { ex: 600 });
      }
      return res.status(200).json({ success: true, mutuals: mutual });
    }
    if (suggestions) {
      let list = await redis.get(`suggestions:${suggestions}`);
      if (!list) {
        // Suggest by car interests, events, routes, proximity
        const result = await pool.query(
          `SELECT id, display_name, car_make, car_model FROM users WHERE id != $1 ORDER BY RANDOM() LIMIT 20`,
          [suggestions]
        );
        list = result.rows;
        await redis.set(`suggestions:${suggestions}`, list, { ex: 1800 });
      }
      return res.status(200).json({ success: true, suggestions: list });
    }
    if (counts) {
      let count = await redis.get(`follow_counts:${counts}`);
      if (!count) {
        const result = await pool.query('SELECT array_length(followers,1) as follower_count, array_length(following,1) as following_count FROM users WHERE id = $1', [counts]);
        count = result.rows[0];
        await redis.set(`follow_counts:${counts}`, count, { ex: 300 });
      }
      return res.status(200).json({ success: true, counts: count });
    }
    if (recent) {
      // Recent follow activity
      const result = await pool.query(
        `SELECT * FROM follow_activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [recent]
      );
      return res.status(200).json({ success: true, recent: result.rows });
    }
    // List all followers/following for user
    if (id) {
      const result = await pool.query('SELECT followers, following FROM users WHERE id = $1', [id]);
      return res.status(200).json({ success: true, followers: result.rows[0]?.followers || [], following: result.rows[0]?.following || [] });
    }
    res.status(400).json({ success: false, error: 'Invalid query' });
    return;
  }

  // POST: follow, batch follow, import
  if (req.method === 'POST') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { targetId, batch, importList } = req.body;
    if (targetId) {
      if (targetId === userId) return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
      try {
        // Prevent duplicate
        const result = await pool.query('SELECT following FROM users WHERE id = $1', [userId]);
        if (result.rows[0].following?.includes(targetId)) return res.status(200).json({ success: true });
        await pool.query('UPDATE users SET following = following || $1::jsonb WHERE id = $2', [JSON.stringify([targetId]), userId]);
        await pool.query('UPDATE users SET followers = followers || $1::jsonb WHERE id = $2', [JSON.stringify([userId]), targetId]);
        await pool.query('INSERT INTO follow_activity (user_id, target_id, action) VALUES ($1,$2,$3)', [userId, targetId, 'follow']);
        await redis.set(`followers:${targetId}`, null, { ex: 1 });
        await redis.set(`following:${userId}`, null, { ex: 1 });
        await redis.set(`follow_counts:${userId}`, null, { ex: 1 });
        await redis.set(`follow_counts:${targetId}`, null, { ex: 1 });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Follow failed' });
      }
    }
    if (batch && Array.isArray(batch)) {
      try {
        for (const tid of batch) {
          if (tid !== userId) {
            await pool.query('UPDATE users SET following = following || $1::jsonb WHERE id = $2', [JSON.stringify([tid]), userId]);
            await pool.query('UPDATE users SET followers = followers || $1::jsonb WHERE id = $2', [JSON.stringify([userId]), tid]);
            await pool.query('INSERT INTO follow_activity (user_id, target_id, action) VALUES ($1,$2,$3)', [userId, tid, 'follow']);
            await redis.set(`followers:${tid}`, null, { ex: 1 });
            await redis.set(`following:${userId}`, null, { ex: 1 });
            await redis.set(`follow_counts:${userId}`, null, { ex: 1 });
            await redis.set(`follow_counts:${tid}`, null, { ex: 1 });
          }
        }
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Batch follow failed' });
      }
    }
    if (importList && Array.isArray(importList)) {
      // Import follows from other platforms
      try {
        for (const tid of importList) {
          if (tid !== userId) {
            await pool.query('UPDATE users SET following = following || $1::jsonb WHERE id = $2', [JSON.stringify([tid]), userId]);
            await pool.query('UPDATE users SET followers = followers || $1::jsonb WHERE id = $2', [JSON.stringify([userId]), tid]);
            await pool.query('INSERT INTO follow_activity (user_id, target_id, action) VALUES ($1,$2,$3)', [userId, tid, 'import']);
            await redis.set(`followers:${tid}`, null, { ex: 1 });
            await redis.set(`following:${userId}`, null, { ex: 1 });
            await redis.set(`follow_counts:${userId}`, null, { ex: 1 });
            await redis.set(`follow_counts:${tid}`, null, { ex: 1 });
          }
        }
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Import failed' });
      }
    }
    res.status(400).json({ success: false, error: 'Invalid follow request' });
    return;
  }

  // DELETE: unfollow, block
  if (req.method === 'DELETE') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { targetId, block } = req.body;
    if (targetId) {
      if (targetId === userId) return res.status(400).json({ success: false, error: 'Cannot unfollow yourself' });
      try {
        await pool.query('UPDATE users SET following = (SELECT jsonb_agg(e) FROM jsonb_array_elements(following) e WHERE e != $1) WHERE id = $2', [targetId, userId]);
        await pool.query('UPDATE users SET followers = (SELECT jsonb_agg(e) FROM jsonb_array_elements(followers) e WHERE e != $1) WHERE id = $2', [userId, targetId]);
        await pool.query('INSERT INTO follow_activity (user_id, target_id, action) VALUES ($1,$2,$3)', [userId, targetId, 'unfollow']);
        await redis.set(`followers:${targetId}`, null, { ex: 1 });
        await redis.set(`following:${userId}`, null, { ex: 1 });
        await redis.set(`follow_counts:${userId}`, null, { ex: 1 });
        await redis.set(`follow_counts:${targetId}`, null, { ex: 1 });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Unfollow failed' });
      }
    }
    if (block) {
      // Block user
      try {
        await pool.query('UPDATE users SET blocked = blocked || $1::jsonb WHERE id = $2', [JSON.stringify([block]), userId]);
        await pool.query('INSERT INTO follow_activity (user_id, target_id, action) VALUES ($1,$2,$3)', [userId, block, 'block']);
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Block failed' });
      }
    }
    res.status(400).json({ success: false, error: 'Invalid unfollow/block request' });
    return;
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
