
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache } from '../src/lib/redis';
import { Event, ApiResponse } from '../src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
    console.error('Events API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetEvents(req: VercelRequest, res: VercelResponse) {
  const { 
    eventId, 
    organizerId, 
    rallyType, 
    status = 'upcoming',
    limit = '20', 
    offset = '0',
    search
  } = req.query;

  if (eventId) {
    // Get specific event
    const cacheKey = `event:${eventId}`;
    let event = await getCache(cacheKey);

    if (!event) {
      const result = await query(
        `SELECT e.*, u.display_name as organizer_name 
         FROM throttlemeet.events e 
         LEFT JOIN throttlemeet.users u ON e.organizer_id = u.id 
         WHERE e.id = $1`,
        [eventId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Event not found' });
      }

      event = result.rows[0];
      await setCache(cacheKey, event, 600); // Cache for 10 minutes
    }

    return res.status(200).json({ success: true, data: event });
  }

  // Get multiple events with filters
  let queryText = `
    SELECT e.*, u.display_name as organizer_name,
           COUNT(er.id) as registration_count
    FROM throttlemeet.events e 
    LEFT JOIN throttlemeet.users u ON e.organizer_id = u.id
    LEFT JOIN throttlemeet.event_registrations er ON e.id = er.event_id AND er.status = 'registered'
    WHERE 1=1
  `;
  const params: any[] = [];

  if (organizerId) {
    queryText += ` AND e.organizer_id = $${params.length + 1}`;
    params.push(organizerId);
  }

  if (rallyType) {
    queryText += ` AND e.rally_type = $${params.length + 1}`;
    params.push(rallyType);
  }

  if (status) {
    queryText += ` AND e.status = $${params.length + 1}`;
    params.push(status);
  }

  if (search) {
    queryText += ` AND (e.title ILIKE $${params.length + 1} OR e.description ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  queryText += `
    GROUP BY e.id, u.display_name
    ORDER BY e.start_date ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await query(queryText, params);

  // Cache the results
  const cacheKey = `events:${JSON.stringify(req.query)}`;
  await setCache(cacheKey, result.rows, 300); // Cache for 5 minutes

  res.status(200).json({
    success: true,
    data: result.rows,
    meta: {
      total: result.rowCount,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    }
  });
}

async function handleCreateEvent(req: VercelRequest, res: VercelResponse) {
  const {
    title,
    description,
    organizer_id,
    rally_type,
    start_date,
    end_date,
    location_name,
    location_address,
    max_participants,
    entry_fee = 0,
    is_public = true,
    requires_approval = false
  } = req.body;

  if (!title || !organizer_id || !rally_type) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: title, organizer_id, rally_type'
    });
  }

  const result = await query(
    `INSERT INTO throttlemeet.events (
      title, description, organizer_id, rally_type, start_date, end_date,
      location_name, location_address, max_participants, entry_fee,
      is_public, requires_approval
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      title, description, organizer_id, rally_type, start_date, end_date,
      location_name, location_address, max_participants, entry_fee,
      is_public, requires_approval
    ]
  );

  const newEvent = result.rows[0];

  // Cache the new event
  await setCache(`event:${newEvent.id}`, newEvent, 600);

  res.status(201).json({
    success: true,
    data: newEvent
  });
}

async function handleUpdateEvent(req: VercelRequest, res: VercelResponse) {
  const { eventId } = req.query;
  const updates = req.body;

  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Event ID required' });
  }

  // Build dynamic update query
  const setClause = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');

  const values = [eventId, ...Object.values(updates)];

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
  const { eventId } = req.query;

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
