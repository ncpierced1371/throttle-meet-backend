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

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.query;
  if (action === 'login') {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const user = result.rows[0];
      // TODO: Add password hash check
      const token = generateToken({ userId: user.id, email: user.email });
      await redis.set(`session:${user.id}`, token, { ex: 86400 });
      return res.status(200).json({ success: true, token });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Login failed' });
    }
  }
  if (action === 'signup') {
    const { email, password, display_name } = req.body;
    if (!email || !password || !display_name) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    try {
      const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (exists.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'User already exists' });
      }
      const result = await pool.query(
        'INSERT INTO users (email, password, display_name) VALUES ($1, $2, $3) RETURNING id',
        [email, password, display_name]
      );
      const userId = result.rows[0].id;
      const token = generateToken({ userId, email });
      await redis.set(`session:${userId}`, token, { ex: 86400 });
      return res.status(201).json({ success: true, token });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Signup failed' });
    }
  }
  if (action === 'apple') {
    const { identityToken } = req.body;
    if (!identityToken) {
      return res.status(400).json({ success: false, error: 'Apple identity token required' });
    }
    // TODO: Validate Apple identity token
    // On success, create/find user and return JWT
    return res.status(501).json({ success: false, error: 'Apple Sign In not implemented yet' });
  }
  if (action === 'facebook') {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Facebook access token required' });
    }
    // TODO: Validate Facebook access token
    // On success, create/find user and return JWT
    return res.status(501).json({ success: false, error: 'Facebook Login not implemented yet' });
  }
  if (action === 'verify') {
    const { token } = req.body;
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    return res.status(200).json({ success: true, payload });
  }
  res.status(400).json({ success: false, error: 'Invalid action' });
}
