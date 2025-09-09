
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache } from '../src/lib/redis';
import { Route, ApiResponse } from '../src/types';

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
        return await handleGetRoutes(req, res);
      case 'POST':
        return await handleCreateRoute(req, res);
      case 'PUT':
        return await handleUpdateRoute(req, res);
      case 'DELETE':
        return await handleDeleteRoute(req, res);
      default:
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Routes API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetRoutes(req: VercelRequest, res: VercelResponse) {
  const { 
    routeId, 
    creatorId, 
    difficulty,
    search,
    minRating,
    limit = '20', 
    offset = '0' 
  } = req.query;

  if (routeId) {
    // Get specific route with waypoints
    const cacheKey = `route:${routeId}`;
    let route = await getCache(cacheKey);

    if (!route) {
      const routeResult = await query(
        `SELECT r.*, u.display_name as creator_name 
         FROM throttlemeet.routes r 
         LEFT JOIN throttlemeet.users u ON r.creator_id = u.id 
         WHERE r.id = $1`,
        [routeId]
      );

      if (routeResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Route not found' });
      }

      route = routeResult.rows[0];

      // Get waypoints for this route
      const waypointsResult = await query(
        `SELECT * FROM throttlemeet.route_waypoints 
         WHERE route_id = $1 ORDER BY waypoint_order ASC`,
        [routeId]
      );

      route.waypoints = waypointsResult.rows;

      await setCache(cacheKey, route, 600); // Cache for 10 minutes
    }

    return res.status(200).json({ success: true, data: route });
  }

  // Get multiple routes with filters
  let queryText = `
    SELECT r.*, u.display_name as creator_name,
           COUNT(rr.id) as review_count
    FROM throttlemeet.routes r 
    LEFT JOIN throttlemeet.users u ON r.creator_id = u.id
    LEFT JOIN throttlemeet.route_ratings rr ON r.id = rr.route_id
    WHERE r.is_public = true
  `;
  const params: any[] = [];

  if (creatorId) {
    queryText += ` AND r.creator_id = $${params.length + 1}`;
    params.push(creatorId);
  }

  if (difficulty) {
    queryText += ` AND r.difficulty_level = $${params.length + 1}`;
    params.push(difficulty);
  }

  if (search) {
    queryText += ` AND (r.name ILIKE $${params.length + 1} OR r.description ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  if (minRating) {
    queryText += ` AND r.average_rating >= $${params.length + 1}`;
    params.push(parseFloat(minRating as string));
  }

  queryText += `
    GROUP BY r.id, u.display_name
    ORDER BY r.average_rating DESC, r.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await query(queryText, params);

  // Cache the results
  const cacheKey = `routes:${JSON.stringify(req.query)}`;
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

async function handleCreateRoute(req: VercelRequest, res: VercelResponse) {
  const {
    creator_id,
    name,
    description,
    difficulty_level = 'moderate',
    estimated_duration_minutes,
    total_distance_miles,
    waypoints = []
  } = req.body;

  if (!creator_id || !name) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: creator_id, name'
    });
  }

  // Start transaction
  const client = await query('BEGIN', []);

  try {
    // Create the route
    const routeResult = await query(
      `INSERT INTO throttlemeet.routes (
        creator_id, name, description, difficulty_level,
        estimated_duration_minutes, total_distance_miles
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        creator_id, name, description, difficulty_level,
        estimated_duration_minutes, total_distance_miles
      ]
    );

    const newRoute = routeResult.rows[0];

    // Add waypoints if provided
    if (waypoints.length > 0) {
      for (let i = 0; i < waypoints.length; i++) {
        const waypoint = waypoints[i];
        await query(
          `INSERT INTO throttlemeet.route_waypoints (
            route_id, name, description, waypoint_order,
            waypoint_type
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            newRoute.id,
            waypoint.name,
            waypoint.description,
            i + 1,
            waypoint.type || 'standard'
          ]
        );
      }
    }

    await query('COMMIT', []);

    // Cache the new route
    await setCache(`route:${newRoute.id}`, newRoute, 600);

    res.status(201).json({
      success: true,
      data: newRoute
    });

  } catch (error) {
    await query('ROLLBACK', []);
    throw error;
  }
}

async function handleUpdateRoute(req: VercelRequest, res: VercelResponse) {
  const { routeId } = req.query;
  const updates = req.body;

  if (!routeId) {
    return res.status(400).json({ success: false, error: 'Route ID required' });
  }

  // Build dynamic update query
  const setClause = Object.keys(updates)
    .filter(key => key !== 'waypoints') // Handle waypoints separately
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');

  const values = [routeId, ...Object.keys(updates)
    .filter(key => key !== 'waypoints')
    .map(key => updates[key])];

  const result = await query(
    `UPDATE throttlemeet.routes SET ${setClause}
     WHERE id = $1 RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Route not found' });
  }

  const updatedRoute = result.rows[0];

  // Update cache
  await setCache(`route:${updatedRoute.id}`, updatedRoute, 600);

  res.status(200).json({ success: true, data: updatedRoute });
}

async function handleDeleteRoute(req: VercelRequest, res: VercelResponse) {
  const { routeId } = req.query;

  if (!routeId) {
    return res.status(400).json({ success: false, error: 'Route ID required' });
  }

  const result = await query(
    'DELETE FROM throttlemeet.routes WHERE id = $1 RETURNING id',
    [routeId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Route not found' });
  }

  // Remove from cache
  const cacheKey = `route:${routeId}`;
  await setCache(cacheKey, null, 1); // Effectively delete from cache

  res.status(200).json({
    success: true,
    message: 'Route deleted successfully'
  });
}
