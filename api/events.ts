import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache } from '../src/lib/redis';
import { setCorsHeaders } from '../src/lib/cors';
import { setSecurityHeaders } from '../src/lib/securityHeaders';
import { checkRateLimit } from '../src/lib/rateLimit';
import { logRequest, logError } from '../src/lib/logger';

interface CreateEventRequest {
  title: string;
  description: string;
  rally_type: string;
  start_date: string;
  end_date: string;
  location: { lat: number; lng: number };
  max_participants: number;
  requirements?: Record<string, any>;
  organizer_id: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  setSecurityHeaders(res);
  logRequest(req);

  // Rate limiting: 30 requests per 10 min per IP for events endpoints
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `events:${ip}`, limit: 30, window: 600 });
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', reset: rate.reset });
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGetEvents(req, res);
      case 'POST':
        return await handleCreateEvent(req, res);
      case 'PUT':
        return await handleUpdateEvent(req, res);
      case 'DELETE':
        return await handleDeleteEvent(req, res);
      default:
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    logError(error, 'events');
    res.status(500).json({ success: false, error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

async function handleGetEvents(req: VercelRequest, res: VercelResponse) {
  const { eventId, organizerId, nearLat, nearLng, radius = '50', limit = '20', offset = '0' } = req.query as {
    eventId?: string;
    organizerId?: string;
    nearLat?: string;
    nearLng?: string;
    radius?: string;
    limit?: string;
    offset?: string;
  };
  // Location-based query optimization
  if (eventId) {
    let event = await getCache(`event:${eventId}`);
    if (!event) {
      const result = await query('SELECT * FROM throttlemeet.events WHERE id = $1', [eventId]);
      event = result.rows[0];
      await setCache(`event:${eventId}`, event, 300);
    }
    return res.status(200).json({ success: true, event });
  }
  if (nearLat && nearLng) {
    // Find events within radius (km) using PostGIS
    const result = await query(
      `SELECT *, ST_Distance(location, ST_MakePoint($1, $2)::geography) AS distance
       FROM throttlemeet.events
       WHERE ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3 * 1000)
       ORDER BY distance ASC
       LIMIT $4 OFFSET $5`,
      [nearLng, nearLat, radius, limit, offset]
    );
    return res.status(200).json({ success: true, events: result.rows });
  }
  // Organizer events
  if (organizerId) {
    const result = await query('SELECT * FROM throttlemeet.events WHERE organizer_id = $1 LIMIT $2 OFFSET $3', [organizerId, limit, offset]);
    return res.status(200).json({ success: true, events: result.rows });
  }
  // Popular events (cache)
  let events = await getCache('events:popular');
  if (!events) {
    const result = await query('SELECT * FROM throttlemeet.events ORDER BY start_date DESC LIMIT $1 OFFSET $2', [limit, offset]);
    events = result.rows;
    await setCache('events:popular', events, 300);
  }
  return res.status(200).json({ success: true, events });
}

async function handleCreateEvent(req: VercelRequest, res: VercelResponse) {
  const body = req.body as CreateEventRequest;
  const { title, description, rally_type, start_date, end_date, location, max_participants, requirements = {}, organizer_id } = body;
  if (!title || !description || !rally_type || !start_date || !end_date || !location || !max_participants || !organizer_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  // Basic input validation
  if (title.length > 100 || description.length > 2000) {
    return res.status(400).json({ success: false, error: 'Title/description too long' });
  }
  if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return res.status(400).json({ success: false, error: 'Invalid location' });
  }
  // Create event
  const result = await query(
    `INSERT INTO throttlemeet.events (
      title, description, rally_type, start_date, end_date, location, max_participants, requirements, organizer_id
    ) VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography, $8, $9, $10)
    RETURNING *`,
    [title, description, rally_type, start_date, end_date, location.lng, location.lat, max_participants, requirements, organizer_id]
  );
  const newEvent = result.rows[0];
  await setCache(`event:${newEvent.id}`, newEvent, 300);
  res.status(201).json({ success: true, data: newEvent });
}

async function handleUpdateEvent(req: VercelRequest, res: VercelResponse) {
  const { eventId } = req.query as { eventId?: string };
  const body = req.body as Partial<CreateEventRequest>;
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Event ID required' });
  }
  // Basic input validation
  if (body.title && body.title.length > 100) {
    return res.status(400).json({ success: false, error: 'Title too long' });
  }
  if (body.description && body.description.length > 2000) {
    return res.status(400).json({ success: false, error: 'Description too long' });
  }
  // Build dynamic update query
  const setClause = Object.keys(body)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');

  const values = [eventId, ...Object.values(body)];

  const result = await query(
    `UPDATE throttlemeet.events SET ${setClause}, updated_at = NOW() 
     WHERE id = $1 RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Event not found' });
  }

  const updatedEvent = result.rows[0];

  // Update cache
  await setCache(`event:${updatedEvent.id}`, updatedEvent, 600);

  res.status(200).json({ success: true, data: updatedEvent });
}

async function handleDeleteEvent(req: VercelRequest, res: VercelResponse) {
  const { eventId } = req.query as { eventId?: string };
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Event ID required' });
  }

  const result = await query(
    'DELETE FROM throttlemeet.events WHERE id = $1 RETURNING id',
    [eventId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Event not found' });
  }

  // Remove from cache
  const cacheKey = `event:${eventId}`;
  await setCache(cacheKey, null, 1); // Effectively delete from cache

  res.status(200).json({
    success: true,
    message: 'Event deleted successfully'
  });
}
