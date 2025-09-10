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

  // GET: user profile, search, followers/following
  if (req.method === 'GET') {
    const { id, search, followers, following } = req.query;
    if (id) {
      // Try Redis cache first
      let user = await redis.get(`user:${id}`);
      if (!user) {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
        user = result.rows[0];
        await redis.set(`user:${id}`, user, { ex: 1800 });
      }
      return res.status(200).json({ success: true, user });
    }
    if (search) {
      // Search by name, car, interests
      const result = await pool.query(
        `SELECT * FROM users WHERE display_name ILIKE $1 OR car_make ILIKE $1 OR car_model ILIKE $1 OR interests::text ILIKE $1 LIMIT 20`,
        [`%${search}%`]
      );
      return res.status(200).json({ success: true, users: result.rows });
    }
    if (followers) {
      const result = await pool.query('SELECT followers FROM users WHERE id = $1', [followers]);
      return res.status(200).json({ success: true, followers: result.rows[0]?.followers || [] });
    }
    if (following) {
      const result = await pool.query('SELECT following FROM users WHERE id = $1', [following]);
      return res.status(200).json({ success: true, following: result.rows[0]?.following || [] });
    }
    // List all users
    const result = await pool.query('SELECT * FROM users LIMIT 50');
    return res.status(200).json({ success: true, users: result.rows });
  }

  // POST: create user
  if (req.method === 'POST') {
    const { email, password, display_name, car_make, car_model, car_year, interests } = req.body;
    if (!email || !password || !display_name) return res.status(400).json({ success: false, error: 'Missing required fields' });
    try {
      const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (exists.rows.length > 0) return res.status(409).json({ success: false, error: 'User already exists' });
      const result = await pool.query(
        'INSERT INTO users (email, password, display_name, car_make, car_model, car_year, interests) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [email, password, display_name, car_make, car_model, car_year, interests || []]
      );
      await redis.set(`user:${result.rows[0].id}`, result.rows[0], { ex: 1800 });
      return res.status(201).json({ success: true, user: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'User creation failed' });
    }
  }

  // PUT: update user (protected)
  if (req.method === 'PUT') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const updates = req.body;
    const fields = Object.keys(updates).filter(k => ['display_name','car_make','car_model','car_year','interests'].includes(k));
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
    const setClause = fields.map((k,i) => `${k} = $${i+2}`).join(', ');
    const values = [userId, ...fields.map(k => updates[k])];
    try {
      const result = await pool.query(`UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`, values);
      await redis.set(`user:${userId}`, result.rows[0], { ex: 1800 });
      return res.status(200).json({ success: true, user: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'User update failed' });
    }
  }

  // DELETE: remove user (protected)
  if (req.method === 'DELETE') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      await redis.set(`user:${userId}`, null, { ex: 1 });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'User deletion failed' });
    }
  }

  // Follow/unfollow logic
  if (req.method === 'PATCH') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { targetId, action } = req.body;
    if (!targetId || !['follow','unfollow'].includes(action)) return res.status(400).json({ success: false, error: 'Invalid follow action' });
    try {
      if (action === 'follow') {
        await pool.query('UPDATE users SET following = following || $1::jsonb WHERE id = $2', [JSON.stringify([targetId]), userId]);
        await pool.query('UPDATE users SET followers = followers || $1::jsonb WHERE id = $2', [JSON.stringify([userId]), targetId]);
      } else {
        await pool.query('UPDATE users SET following = (SELECT jsonb_agg(e) FROM jsonb_array_elements(following) e WHERE e != $1) WHERE id = $2', [targetId, userId]);
        await pool.query('UPDATE users SET followers = (SELECT jsonb_agg(e) FROM jsonb_array_elements(followers) e WHERE e != $1) WHERE id = $2', [userId, targetId]);
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Follow/unfollow failed' });
    }
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
