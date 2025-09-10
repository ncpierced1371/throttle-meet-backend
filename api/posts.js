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

const POST_TYPES = [
  'text','photo','video','check_in','modification','review','question','achievement'
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

  // GET: post details, feed, trending, hashtag, user posts
  if (req.method === 'GET') {
    const { id, feed, trending, hashtag, user } = req.query;
    if (id) {
      let post = await redis.get(`post:${id}`);
      if (!post) {
        const result = await pool.query('SELECT * FROM social_posts WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Post not found' });
        post = result.rows[0];
        // Get comments
        const comments = await pool.query('SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC', [id]);
        post.comments = comments.rows;
        await redis.set(`post:${id}`, post, { ex: 180 });
      }
      return res.status(200).json({ success: true, post });
    }
    if (feed) {
      let posts = await redis.get(`feed:user:${feed}`);
      if (!posts) {
        const result = await pool.query(
          `SELECT * FROM social_posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
          [feed]
        );
        posts = result.rows;
        await redis.set(`feed:user:${feed}`, posts, { ex: 300 });
      }
      return res.status(200).json({ success: true, posts });
    }
    if (trending) {
      let posts = await redis.get('posts:trending');
      if (!posts) {
        const result = await pool.query(
          `SELECT * FROM social_posts ORDER BY like_count DESC, comment_count DESC, created_at DESC LIMIT 20`
        );
        posts = result.rows;
        await redis.set('posts:trending', posts, { ex: 600 });
      }
      return res.status(200).json({ success: true, posts });
    }
    if (hashtag) {
      let posts = await redis.get(`posts:hashtag:${hashtag}`);
      if (!posts) {
        const result = await pool.query(
          `SELECT * FROM social_posts WHERE hashtags @> $1::jsonb ORDER BY created_at DESC LIMIT 50`,
          [JSON.stringify([hashtag])]
        );
        posts = result.rows;
        await redis.set(`posts:hashtag:${hashtag}`, posts, { ex: 1800 });
      }
      return res.status(200).json({ success: true, posts });
    }
    if (user) {
      let posts = await redis.get(`posts:user:${user}`);
      if (!posts) {
        const result = await pool.query('SELECT * FROM social_posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [user]);
        posts = result.rows;
        await redis.set(`posts:user:${user}`, posts, { ex: 900 });
      }
      return res.status(200).json({ success: true, posts });
    }
    // List all posts
    const result = await pool.query('SELECT * FROM social_posts ORDER BY created_at DESC LIMIT 50');
    return res.status(200).json({ success: true, posts: result.rows });
  }

  // POST: create post, like, comment, report, save
  if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'create') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { type, content, hashtags, media, event_id, route_id, car_id, location } = req.body;
      if (!type || !content) return res.status(400).json({ success: false, error: 'Missing required fields' });
      if (!POST_TYPES.includes(type)) return res.status(400).json({ success: false, error: 'Invalid post type' });
      try {
        const result = await pool.query(
          `INSERT INTO social_posts (user_id, type, content, hashtags, media, event_id, route_id, car_id, location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [userId, type, content, hashtags || [], media || [], event_id, route_id, car_id, location]
        );
        await redis.set(`post:${result.rows[0].id}`, result.rows[0], { ex: 180 });
        return res.status(201).json({ success: true, post: result.rows[0] });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Post creation failed' });
      }
    }
    if (action === 'like') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { post_id } = req.body;
      if (!post_id) return res.status(400).json({ success: false, error: 'Missing post_id' });
      try {
        await pool.query('UPDATE social_posts SET like_count = like_count + 1 WHERE id = $1', [post_id]);
        await redis.set(`post:${post_id}`, null, { ex: 1 });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Like failed' });
      }
    }
    if (action === 'comment') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { post_id, content, parent_id } = req.body;
      if (!post_id || !content) return res.status(400).json({ success: false, error: 'Missing fields' });
      try {
        await pool.query(
          `INSERT INTO comments (post_id, user_id, content, parent_id) VALUES ($1,$2,$3,$4)`,
          [post_id, userId, content, parent_id || null]
        );
        await redis.set(`post:${post_id}`, null, { ex: 1 });
        return res.status(201).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Comment failed' });
      }
    }
    if (action === 'save') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { post_id } = req.body;
      if (!post_id) return res.status(400).json({ success: false, error: 'Missing post_id' });
      try {
        await pool.query('UPDATE social_posts SET saved_by = saved_by || $1::jsonb WHERE id = $2', [JSON.stringify([userId]), post_id]);
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Save failed' });
      }
    }
    if (action === 'report') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { post_id, reason } = req.body;
      if (!post_id || !reason) return res.status(400).json({ success: false, error: 'Missing fields' });
      try {
        await pool.query('UPDATE social_posts SET reports = reports || $1::jsonb WHERE id = $2', [JSON.stringify([{ userId, reason }]), post_id]);
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Report failed' });
      }
    }
    // TODO: Add share, mention, analytics, scheduled, live, story
    return res.status(400).json({ success: false, error: 'Invalid action' });
  }

  // PUT: update post (owner only)
  if (req.method === 'PUT') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id, updates } = req.body;
    if (!id || !updates) return res.status(400).json({ success: false, error: 'Missing id/updates' });
    const fields = Object.keys(updates).filter(k => ['content','hashtags','media'].includes(k));
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
    const setClause = fields.map((k,i) => `${k} = $${i+3}`).join(', ');
    const values = [id, userId, ...fields.map(k => updates[k])];
    try {
      const result = await pool.query(`UPDATE social_posts SET ${setClause} WHERE id = $1 AND user_id = $2 RETURNING *`, values);
      await redis.set(`post:${id}`, result.rows[0], { ex: 180 });
      return res.status(200).json({ success: true, post: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Post update failed' });
    }
  }

  // DELETE: remove post (owner only)
  if (req.method === 'DELETE') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
    try {
      await pool.query('DELETE FROM social_posts WHERE id = $1 AND user_id = $2', [id, userId]);
      await redis.set(`post:${id}`, null, { ex: 1 });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Post deletion failed' });
    }
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
