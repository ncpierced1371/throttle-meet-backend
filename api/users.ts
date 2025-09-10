
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { generateToken, verifyToken } from '../src/lib/auth';

interface AuthPayload {
  userId: string;
  email: string;
  role: 'admin' | 'moderator' | 'user';
}
import { setCache, getCache } from '../src/lib/redis';
import { validateFields } from '../src/lib/validation';
import { setCorsHeaders } from '../src/lib/cors';
import { setSecurityHeaders } from '../src/lib/securityHeaders';
import { checkRateLimit } from '../src/lib/rateLimit';
import { logRequest, logError } from '../src/lib/logger';
import { checkRole } from '../src/lib/roleAuth';
import { User, ApiResponse } from '../src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  setSecurityHeaders(res);
  logRequest(req);

  // Rate limiting: 100 requests per 10 min per IP for data endpoints
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `users:${ip}`, limit: 100, window: 600 });
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
        return await handleGetUsers(req, res);
      case 'POST':
        return await handleCreateUser(req, res);
      case 'PUT':
        return await handleUpdateUser(req, res);
      default:
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    logError(error, 'users');
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetUsers(req: VercelRequest, res: VercelResponse) {
  // Validate query params
  const { userId, search, limit = '20', offset = '0' } = req.query as { userId?: string; search?: string; limit?: string; offset?: string };

  // Role-based access: only admin can list all users
  const authHeader = req.headers['authorization'];
  let userRole: 'admin' | 'moderator' | 'user' = 'user';
  if (authHeader) {
    const token = authHeader.split(' ')[1];
  const payload = token ? verifyToken(token) : null;
    if (payload && ['admin', 'moderator', 'user'].includes(payload.role || '')) {
      userRole = payload.role as 'admin' | 'moderator' | 'user';
    } else if (payload && payload.role) {
      return res.status(403).json({ success: false, error: 'Invalid user role' });
    }
  }

  if (userId) {
    // Get specific user
    const cacheKey = `user:${userId}`;
    let user = await getCache(cacheKey);
    if (!user) {
      const result = await query('SELECT * FROM throttlemeet.users WHERE id = $1', [userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      user = result.rows[0];
      await setCache(cacheKey, user, 300);
    }
    return res.status(200).json({ success: true, data: user });
  }

  if (!checkRole({ role: userRole }, ['admin'])) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  // Get multiple users
  let queryText = 'SELECT * FROM throttlemeet.users WHERE 1=1';
  const params: any[] = [];
  if (search) {
    queryText += ' AND (display_name ILIKE $' + (params.length + 1) + ' OR email ILIKE $' + (params.length + 1) + ')';
    params.push(`%${search}%`);
  }
  queryText += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
  params.push(parseInt(limit), parseInt(offset));
  const result = await query(queryText, params);
  res.status(200).json({
    success: true,
    data: result.rows,
    meta: {
      total: result.rowCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
}

async function handleCreateUser(req: VercelRequest, res: VercelResponse) {
  // Rate limit: 10 requests per 10 min per IP for signup
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `signup:${ip}`, limit: 10, window: 600 });
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', reset: rate.reset });
  }

  // Validate and sanitize input
  const body = req.body as Record<string, any>;
  const required = ['email', 'display_name', 'auth_provider'];
  const missing = validateFields(body, required);
  if (missing.length > 0) {
    return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
  }
  // Email validation
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }
  // XSS prevention
  body.display_name = String(body.display_name).replace(/[<>]/g, '');

  // Check if user already exists
  const existingUser = await query('SELECT id FROM throttlemeet.users WHERE email = $1', [body.email]);
  if (existingUser.rows.length > 0) {
    return res.status(409).json({ success: false, error: 'User already exists with this email' });
  }

  // Create new user
  const result = await query(
    `INSERT INTO throttlemeet.users (
      email, display_name, auth_provider, apple_user_id, facebook_user_id,
      first_name, last_name, car_make, car_model, car_year
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      body.email, body.display_name, body.auth_provider, body.apple_user_id, body.facebook_user_id,
      body.first_name, body.last_name, body.car_make, body.car_model, body.car_year
    ]
  );
  const newUser = result.rows[0];
  // Generate JWT token
  const token = generateToken({ userId: newUser.id, email: newUser.email, role: 'user' });
  // Cache the user
  await setCache(`user:${newUser.id}`, newUser, 3600);
  res.status(201).json({ success: true, data: { user: newUser, token } });
}

async function handleUpdateUser(req: VercelRequest, res: VercelResponse) {
  // Auth required
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Authorization required' });
  }
  const token = authHeader.split(' ')[1];
  const payload = token ? verifyToken(token) : null;
  if (!payload || !payload.userId) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  const userId = req.query['userId'] || payload.userId;
  const updates = req.body as Record<string, any>;
  // Only allow user to update own profile or admin
  if (String(userId) !== String(payload.userId) && (!payload.role || payload.role !== 'admin')) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  // Validate/sanitize updates
  if (updates.display_name) {
    updates.display_name = String(updates.display_name).replace(/[<>]/g, '');
  }
  // Build dynamic update query
  const setClause = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  const values = [userId, ...Object.values(updates)];
  const result = await query(
    `UPDATE throttlemeet.users SET ${setClause}, last_active_at = NOW() 
     WHERE id = $1 RETURNING *`,
    values
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  const updatedUser = result.rows[0];
  // Update cache
  await setCache(`user:${updatedUser.id}`, updatedUser, 3600);
  res.status(200).json({ success: true, data: updatedUser });
}
