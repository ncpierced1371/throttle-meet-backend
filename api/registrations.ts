
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache, deleteCache } from '../src/lib/redis';

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
        return await handleGetRegistrations(req, res);
      case 'POST':
        return await handleCreateRegistration(req, res);
      case 'PUT':
        return await handleUpdateRegistration(req, res);
      case 'DELETE':
        return await handleCancelRegistration(req, res);
      default:
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Registrations API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetRegistrations(req: VercelRequest, res: VercelResponse) {
  const { eventId, userId, status, limit = '50', offset = '0' } = req.query;

  let queryText = `
    SELECT er.*, u.display_name, u.profile_image_url, u.car_make, u.car_model, u.car_year,
           e.title as event_title, e.start_date as event_start_date
    FROM throttlemeet.event_registrations er
    LEFT JOIN throttlemeet.users u ON er.user_id = u.id
    LEFT JOIN throttlemeet.events e ON er.event_id = e.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (eventId) {
    queryText += ` AND er.event_id = $${params.length + 1}`;
    params.push(eventId);
  }

  if (userId) {
    queryText += ` AND er.user_id = $${params.length + 1}`;
    params.push(userId);
  }

  if (status) {
    queryText += ` AND er.status = $${params.length + 1}`;
    params.push(status);
  }

  queryText += ` ORDER BY er.registration_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await query(queryText, params);

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

async function handleCreateRegistration(req: VercelRequest, res: VercelResponse) {
  const {
    event_id,
    user_id,
    car_details,
    special_requirements,
    emergency_contact
  } = req.body;

  if (!event_id || !user_id) {
    return res.status(400).json({
      success: false,
      error: 'event_id and user_id are required'
    });
  }

  try {
    // Start transaction
    await query('BEGIN');

    // Check if event exists and has space
    const eventResult = await query(
      `SELECT max_participants, current_participants, requires_approval
       FROM throttlemeet.events WHERE id = $1`,
      [event_id]
    );

    if (eventResult.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const event = eventResult.rows[0];
    
    if (event.max_participants && event.current_participants >= event.max_participants) {
      await query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Event is full' });
    }

    // Check if already registered
    const existingRegistration = await query(
      'SELECT id FROM throttlemeet.event_registrations WHERE event_id = $1 AND user_id = $2',
      [event_id, user_id]
    );

    if (existingRegistration.rows.length > 0) {
      await query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Already registered for this event' });
    }

    // Create registration
    const registrationStatus = event.requires_approval ? 'pending' : 'registered';

    const result = await query(
      `INSERT INTO throttlemeet.event_registrations 
       (event_id, user_id, status, car_details, special_requirements, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [event_id, user_id, registrationStatus, JSON.stringify(car_details), special_requirements, JSON.stringify(emergency_contact)]
    );

    // Update event participant count if automatically approved
    if (registrationStatus === 'registered') {
      await query(
        'UPDATE throttlemeet.events SET current_participants = current_participants + 1 WHERE id = $1',
        [event_id]
      );
    }

    await query('COMMIT');

    // Clear caches
    await deleteCache(`event:${event_id}`);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

async function handleUpdateRegistration(req: VercelRequest, res: VercelResponse) {
  const { registrationId } = req.query;
  const { status, car_details, special_requirements } = req.body;

  if (!registrationId) {
    return res.status(400).json({ success: false, error: 'Registration ID required' });
  }

  try {
    await query('BEGIN');

    // Get current registration
    const currentReg = await query(
      'SELECT * FROM throttlemeet.event_registrations WHERE id = $1',
      [registrationId]
    );

    if (currentReg.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Registration not found' });
    }

    const oldStatus = currentReg.rows[0].status;

    // Update registration
    const updates: any = {};
    const params = [registrationId];
    let paramIndex = 2;

    if (status) {
      updates.status = `$${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (car_details) {
      updates.car_details = `$${paramIndex}`;
      params.push(JSON.stringify(car_details));
      paramIndex++;
    }

    if (special_requirements) {
      updates.special_requirements = `$${paramIndex}`;
      params.push(special_requirements);
      paramIndex++;
    }

    const setClause = Object.keys(updates).map(key => `${key} = ${updates[key]}`).join(', ');

    const result = await query(
      `UPDATE throttlemeet.event_registrations SET ${setClause} WHERE id = $1 RETURNING *`,
      params
    );

    // Update event participant count if status changed
    if (status && status !== oldStatus) {
      const eventId = result.rows[0].event_id;
      
      if (oldStatus === 'registered' && status !== 'registered') {
        // Decrease count
        await query(
          'UPDATE throttlemeet.events SET current_participants = GREATEST(0, current_participants - 1) WHERE id = $1',
          [eventId]
        );
      } else if (oldStatus !== 'registered' && status === 'registered') {
        // Increase count
        await query(
          'UPDATE throttlemeet.events SET current_participants = current_participants + 1 WHERE id = $1',
          [eventId]
        );
      }

      // Clear event cache
      await deleteCache(`event:${eventId}`);
    }

    await query('COMMIT');

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

async function handleCancelRegistration(req: VercelRequest, res: VercelResponse) {
  const { registrationId } = req.query;

  if (!registrationId) {
    return res.status(400).json({ success: false, error: 'Registration ID required' });
  }

  try {
    await query('BEGIN');

    const result = await query(
      'DELETE FROM throttlemeet.event_registrations WHERE id = $1 RETURNING event_id, status',
      [registrationId]
    );

    if (result.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Registration not found' });
    }

    const { event_id, status } = result.rows[0];

    // Update event participant count if was registered
    if (status === 'registered') {
      await query(
        'UPDATE throttlemeet.events SET current_participants = GREATEST(0, current_participants - 1) WHERE id = $1',
        [event_id]
      );
    }

    await query('COMMIT');

    // Clear caches
    await deleteCache(`event:${event_id}`);

    res.status(200).json({
      success: true,
      message: 'Registration cancelled successfully'
    });

  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}
