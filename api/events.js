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

const RALLY_TYPES = [
  'car_meet', 'track_day', 'car_show', 'cruise', 'drag_race', 'autocross', 'road_rally', 'cars_and_coffee'
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

  // GET: event details, list, search, analytics
  if (req.method === 'GET') {
    const { id, type, near, user, analytics } = req.query;
    if (id) {
      // Try Redis cache first
      let event = await redis.get(`event:${id}`);
      if (!event) {
        const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Event not found' });
        event = result.rows[0];
        await redis.set(`event:${id}`, event, { ex: 300 });
      }
      // Get participants
      const participants = await pool.query('SELECT * FROM event_registrations WHERE event_id = $1 AND status = $2', [id, 'confirmed']);
      event.participants = participants.rows;
      return res.status(200).json({ success: true, event });
    }
    if (type && RALLY_TYPES.includes(type)) {
      // List by type, cache
      let events = await redis.get(`events:type:${type}`);
      if (!events) {
        const result = await pool.query('SELECT * FROM events WHERE rally_type = $1 ORDER BY start_date DESC LIMIT 50', [type]);
        events = result.rows;
        await redis.set(`events:type:${type}`, events, { ex: 900 });
      }
      return res.status(200).json({ success: true, events });
    }
    if (near) {
      // near = "lat,lng,distance_km"
      const [lat, lng, dist] = near.split(',').map(Number);
      const result = await pool.query(
        `SELECT *, ST_Distance(location, ST_MakePoint($1, $2)::geography) AS distance
         FROM events WHERE ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3 * 1000)
         ORDER BY distance ASC LIMIT 50`,
        [lng, lat, dist]
      );
      return res.status(200).json({ success: true, events: result.rows });
    }
    if (user) {
      // User's registered events, cache
      let events = await redis.get(`events:user:${user}`);
      if (!events) {
        const result = await pool.query(
          `SELECT e.* FROM events e JOIN event_registrations r ON e.id = r.event_id WHERE r.user_id = $1`,
          [user]
        );
        events = result.rows;
        await redis.set(`events:user:${user}`, events, { ex: 1800 });
      }
      return res.status(200).json({ success: true, events });
    }
    if (analytics) {
      // Simple analytics: type counts, attendance rates
      const typeCounts = await pool.query('SELECT rally_type, COUNT(*) FROM events GROUP BY rally_type');
      const attendance = await pool.query('SELECT event_id, COUNT(*) FROM event_registrations WHERE status = $1 GROUP BY event_id', ['confirmed']);
      return res.status(200).json({ success: true, analytics: { typeCounts: typeCounts.rows, attendance: attendance.rows } });
    }
    // List all events
    const result = await pool.query('SELECT * FROM events ORDER BY start_date DESC LIMIT 50');
    return res.status(200).json({ success: true, events: result.rows });
  }

  // POST: create event, register/unregister
  if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'create') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { title, description, rally_type, start_date, end_date, location, max_participants, requirements, organizer_id } = req.body;
      if (!title || !rally_type || !start_date || !location || !organizer_id) return res.status(400).json({ success: false, error: 'Missing required fields' });
      if (!RALLY_TYPES.includes(rally_type)) return res.status(400).json({ success: false, error: 'Invalid rally type' });
      try {
        const result = await pool.query(
          `INSERT INTO events (title, description, rally_type, start_date, end_date, location, max_participants, requirements, organizer_id) VALUES ($1,$2,$3,$4,$5,ST_MakePoint($6,$7)::geography,$8,$9,$10) RETURNING *`,
          [title, description, rally_type, start_date, end_date, location.lng, location.lat, max_participants, requirements || {}, organizer_id]
        );
        await redis.set(`event:${result.rows[0].id}`, result.rows[0], { ex: 300 });
        return res.status(201).json({ success: true, event: result.rows[0] });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Event creation failed' });
      }
    }
    if (action === 'register') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { event_id, car_make, car_model, car_year, emergency_contact, requirements } = req.body;
      if (!event_id || !car_make || !car_model || !car_year || !emergency_contact) return res.status(400).json({ success: false, error: 'Missing required fields' });
      try {
        // Check capacity
        const event = await pool.query('SELECT max_participants FROM events WHERE id = $1', [event_id]);
        const count = await pool.query('SELECT COUNT(*) FROM event_registrations WHERE event_id = $1 AND status = $2', [event_id, 'confirmed']);
        let status = 'confirmed';
        if (parseInt(count.rows[0].count) >= event.rows[0].max_participants) status = 'waitlisted';
        const result = await pool.query(
          `INSERT INTO event_registrations (event_id, user_id, car_make, car_model, car_year, emergency_contact, requirements, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [event_id, userId, car_make, car_model, car_year, emergency_contact, requirements || {}, status]
        );
        await redis.set(`events:user:${userId}`, null, { ex: 1 }); // Invalidate cache
        await redis.set(`event:${event_id}`, null, { ex: 1 });
        return res.status(201).json({ success: true, registration: result.rows[0] });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Registration failed' });
      }
    }
    if (action === 'unregister') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const { event_id } = req.body;
      if (!event_id) return res.status(400).json({ success: false, error: 'Missing event_id' });
      try {
        await pool.query('DELETE FROM event_registrations WHERE event_id = $1 AND user_id = $2', [event_id, userId]);
        await redis.set(`events:user:${userId}`, null, { ex: 1 });
        await redis.set(`event:${event_id}`, null, { ex: 1 });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Unregister failed' });
      }
    }
    // TODO: Add check-in, photos, QR, sharing, recurring, weather
    return res.status(400).json({ success: false, error: 'Invalid action' });
  }

  // PUT: update event (organizer only)
  if (req.method === 'PUT') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id, updates } = req.body;
    if (!id || !updates) return res.status(400).json({ success: false, error: 'Missing id/updates' });
    const fields = Object.keys(updates).filter(k => ['title','description','rally_type','start_date','end_date','max_participants','requirements'].includes(k));
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
    const setClause = fields.map((k,i) => `${k} = $${i+3}`).join(', ');
    const values = [id, userId, ...fields.map(k => updates[k])];
    try {
      const result = await pool.query(`UPDATE events SET ${setClause} WHERE id = $1 AND organizer_id = $2 RETURNING *`, values);
      await redis.set(`event:${id}`, result.rows[0], { ex: 300 });
      return res.status(200).json({ success: true, event: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Event update failed' });
    }
  }

  // DELETE: remove event (organizer only)
  if (req.method === 'DELETE') {
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
    try {
      await pool.query('DELETE FROM events WHERE id = $1 AND organizer_id = $2', [id, userId]);
      await redis.set(`event:${id}`, null, { ex: 1 });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Event deletion failed' });
    }
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
