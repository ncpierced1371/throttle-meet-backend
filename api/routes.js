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

const CATEGORIES = [
  'scenic','mountain','coastal','desert','canyon','track','urban','back_roads'
];
const DIFFICULTY = [
  'beginner','intermediate','advanced','expert','extreme'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

  // GET: route details, list, search, user routes
  if (req.method === 'GET') {
    const { id, category, difficulty, search, user, popular } = req.query;
    if (id) {
      // Try Redis cache first
      let route = await redis.get(`route:${id}`);
      if (!route) {
        const result = await pool.query('SELECT * FROM routes WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Route not found' });
        route = result.rows[0];
        // Get waypoints
        const waypoints = await pool.query('SELECT * FROM route_waypoints WHERE route_id = $1 ORDER BY waypoint_order ASC', [id]);
        route.waypoints = waypoints.rows;
        // Get ratings/reviews
        const ratings = await pool.query('SELECT * FROM route_ratings WHERE route_id = $1', [id]);
        route.ratings = ratings.rows;
        await redis.set(`route:${id}`, route, { ex: 900 });
      }
      return res.status(200).json({ success: true, route });
    }
    if (category && CATEGORIES.includes(category)) {
      let routes = await redis.get(`routes:cat:${category}`);
      if (!routes) {
        const result = await pool.query('SELECT * FROM routes WHERE category = $1 ORDER BY created_at DESC LIMIT 50', [category]);
        routes = result.rows;
        await redis.set(`routes:cat:${category}`, routes, { ex: 1800 });
      }
      return res.status(200).json({ success: true, routes });
    }
    if (difficulty && DIFFICULTY.includes(difficulty)) {
      const result = await pool.query('SELECT * FROM routes WHERE difficulty = $1 ORDER BY created_at DESC LIMIT 50', [difficulty]);
      return res.status(200).json({ success: true, routes: result.rows });
    }
    if (search) {
      let routes = await redis.get(`routes:search:${search}`);
      if (!routes) {
        const result = await pool.query(
          `SELECT * FROM routes WHERE name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1 LIMIT 50`,
          [`%${search}%`]
        );
        routes = result.rows;
        await redis.set(`routes:search:${search}`, routes, { ex: 600 });
      }
      return res.status(200).json({ success: true, routes });
    }
    if (user) {
      let routes = await redis.get(`routes:user:${user}`);
      if (!routes) {
        const result = await pool.query('SELECT * FROM routes WHERE creator_id = $1 ORDER BY created_at DESC LIMIT 50', [user]);
        routes = result.rows;
        await redis.set(`routes:user:${user}`, routes, { ex: 3600 });
      }
      return res.status(200).json({ success: true, routes });
    }
    if (popular) {
      let routes = await redis.get('routes:popular');
      if (!routes) {
        const result = await pool.query('SELECT * FROM routes ORDER BY average_rating DESC, review_count DESC LIMIT 20');
        routes = result.rows;
        await redis.set('routes:popular', routes, { ex: 1800 });
      }
      return res.status(200).json({ success: true, routes });
    }
    // List all routes
    const result = await pool.query('SELECT * FROM routes ORDER BY created_at DESC LIMIT 50');
    return res.status(200).json({ success: true, routes: result.rows });
  }

  // POST: create route, add rating/review
  if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'create') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { name, description, category, difficulty, waypoints, surface, season, traffic, creator_id, path } = req.body;
      if (!name || !category || !difficulty || !waypoints || !creator_id || !path) return res.status(400).json({ success: false, error: 'Missing required fields' });
      if (!CATEGORIES.includes(category) || !DIFFICULTY.includes(difficulty)) return res.status(400).json({ success: false, error: 'Invalid category/difficulty' });
      try {
        // path: array of [lng,lat] pairs
        const lineString = `LINESTRING(${path.map(([lng,lat]) => `${lng} ${lat}`).join(',')})`;
        const result = await pool.query(
          `INSERT INTO routes (name, description, category, difficulty, surface, season, traffic, creator_id, path) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,ST_GeomFromText($9,4326)) RETURNING *`,
          [name, description, category, difficulty, surface, season, traffic, creator_id, lineString]
        );
        // Add waypoints
        for (let i = 0; i < waypoints.length; i++) {
          const wp = waypoints[i];
          await pool.query(
            `INSERT INTO route_waypoints (route_id, name, description, waypoint_order, lat, lng, type) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [result.rows[0].id, wp.name, wp.description, i+1, wp.lat, wp.lng, wp.type || 'poi']
          );
        }
        await redis.set(`route:${result.rows[0].id}`, result.rows[0], { ex: 900 });
        return res.status(201).json({ success: true, route: result.rows[0] });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Route creation failed' });
      }
    }
    if (action === 'rate') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { route_id, rating, review, safety, car_type, photos, best_time, season } = req.body;
      if (!route_id || !rating) return res.status(400).json({ success: false, error: 'Missing required fields' });
      try {
        await pool.query(
          `INSERT INTO route_ratings (route_id, user_id, rating, review, safety, car_type, photos, best_time, season) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [route_id, userId, rating, review, safety, car_type, photos || [], best_time, season]
        );
        await redis.set(`route:${route_id}`, null, { ex: 1 });
        return res.status(201).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Rating failed' });
      }
    }
    // TODO: Add GPX/KML export, sharing, traffic, weather
    return res.status(400).json({ success: false, error: 'Invalid action' });
  }

  // PUT: update route (creator only)
  if (req.method === 'PUT') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id, updates } = req.body;
    if (!id || !updates) return res.status(400).json({ success: false, error: 'Missing id/updates' });
    const fields = Object.keys(updates).filter(k => ['name','description','category','difficulty','surface','season','traffic'].includes(k));
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
    const setClause = fields.map((k,i) => `${k} = $${i+3}`).join(', ');
    const values = [id, userId, ...fields.map(k => updates[k])];
    try {
      const result = await pool.query(`UPDATE routes SET ${setClause} WHERE id = $1 AND creator_id = $2 RETURNING *`, values);
      await redis.set(`route:${id}`, result.rows[0], { ex: 900 });
      return res.status(200).json({ success: true, route: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Route update failed' });
    }
  }

  // DELETE: remove route (creator only)
  if (req.method === 'DELETE') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
    try {
      await pool.query('DELETE FROM routes WHERE id = $1 AND creator_id = $2', [id, userId]);
      await redis.set(`route:${id}`, null, { ex: 1 });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Route deletion failed' });
    }
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
