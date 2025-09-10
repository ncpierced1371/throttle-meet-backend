import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache } from '../src/lib/redis';
import { setCorsHeaders } from '../src/lib/cors';
import { setSecurityHeaders } from '../src/lib/securityHeaders';
import { checkRateLimit } from '../src/lib/rateLimit';
import { logRequest, logError } from '../src/lib/logger';

interface CreateRouteRequest {
  name: string;
  description: string;
  geometry: { type: string; coordinates: any };
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  distance_km: number;
  difficulty?: string;
  creator_id: string;
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function isValidGeometry(geometry: any): boolean {
  // Only allow LineString or MultiLineString for routes
  if (!geometry || !geometry.type || !geometry.coordinates) return false;
  return (
    geometry.type === 'LineString' || geometry.type === 'MultiLineString'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  setSecurityHeaders(res);
  logRequest(req);

  // Rate limiting: 30 requests per 10 min per IP for routes endpoints
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `routes:${ip}`, limit: 30, window: 600 });
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
    logError(error, 'routes');
    res.status(500).json({ success: false, error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

async function handleGetRoutes(req: VercelRequest, res: VercelResponse) {
  const { routeId, nearLat, nearLng, radius = '100', limit = '20', offset = '0' } = req.query as {
    routeId?: string;
    nearLat?: string;
    nearLng?: string;
    radius?: string;
    limit?: string;
    offset?: string;
  };
  // Spatial query optimization
  if (routeId) {
    let route = await getCache(`route:${routeId}`);
    if (!route) {
      const result = await query('SELECT * FROM throttlemeet.routes WHERE id = $1', [routeId]);
      route = result.rows[0];
      await setCache(`route:${routeId}`, route, 300);
    }
    return res.status(200).json({ success: true, route });
  }
  if (nearLat && nearLng) {
    // Find routes within radius (km) using PostGIS
    const result = await query(
      `SELECT *, ST_Distance(geometry, ST_MakePoint($1, $2)::geography) AS distance
       FROM throttlemeet.routes
       WHERE ST_DWithin(geometry, ST_MakePoint($1, $2)::geography, $3 * 1000)
       ORDER BY distance ASC
       LIMIT $4 OFFSET $5`,
      [nearLng, nearLat, radius, limit, offset]
    );
    return res.status(200).json({ success: true, routes: result.rows });
  }
  // Popular routes (cache)
  let routes = await getCache('routes:popular');
  if (!routes) {
    const result = await query('SELECT * FROM throttlemeet.routes ORDER BY distance_km DESC LIMIT $1 OFFSET $2', [limit, offset]);
    routes = result.rows;
    await setCache('routes:popular', routes, 300);
  }
  return res.status(200).json({ success: true, routes });
}

async function handleCreateRoute(req: VercelRequest, res: VercelResponse) {
  const body = req.body as CreateRouteRequest;
  const { name, description, geometry, start_location, end_location, distance_km, difficulty = 'moderate', creator_id } = body;
  if (!name || !description || !geometry || !start_location || !end_location || !distance_km || !creator_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  // Geometry and coordinate validation
  if (!isValidGeometry(geometry)) {
    return res.status(400).json({ success: false, error: 'Invalid geometry type' });
  }
  if (!isValidCoordinate(start_location.lat, start_location.lng) || !isValidCoordinate(end_location.lat, end_location.lng)) {
    return res.status(400).json({ success: false, error: 'Invalid start/end coordinates' });
  }
  // Create route
  const result = await query(
    `INSERT INTO throttlemeet.routes (
      name, description, geometry, start_location, end_location, distance_km, difficulty, creator_id
    ) VALUES ($1, $2, ST_GeomFromGeoJSON($3), ST_MakePoint($4, $5)::geography, ST_MakePoint($6, $7)::geography, $8, $9, $10)
    RETURNING *`,
    [name, description, JSON.stringify(geometry), start_location.lng, start_location.lat, end_location.lng, end_location.lat, distance_km, difficulty, creator_id]
  );
  const newRoute = result.rows[0];
  await setCache(`route:${newRoute.id}`, newRoute, 300);
  res.status(201).json({ success: true, data: newRoute });
}

async function handleUpdateRoute(req: VercelRequest, res: VercelResponse) {
  const { routeId } = req.query as { routeId?: string };
  const body = req.body as Partial<CreateRouteRequest>;
  if (!routeId) {
    return res.status(400).json({ success: false, error: 'Route ID required' });
  }
  // Geometry and coordinate validation
  if (body.geometry && !isValidGeometry(body.geometry)) {
    return res.status(400).json({ success: false, error: 'Invalid geometry type' });
  }
  if (body.start_location && !isValidCoordinate(body.start_location.lat, body.start_location.lng)) {
    return res.status(400).json({ success: false, error: 'Invalid start coordinates' });
  }
  if (body.end_location && !isValidCoordinate(body.end_location.lat, body.end_location.lng)) {
    return res.status(400).json({ success: false, error: 'Invalid end coordinates' });
  }
  // Build dynamic update query
  const setClause = Object.keys(body)
    .filter(key => key !== 'waypoints') // Handle waypoints separately
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');

  const values = [routeId, ...Object.keys(body)
    .filter(key => key !== 'waypoints')
    .map(key => (body as any)[key])];

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
  const { routeId } = req.query as { routeId?: string };
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
