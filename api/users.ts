
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { generateToken, authenticateToken } from '../src/lib/auth';
import { setCache, getCache } from '../src/lib/redis';
import { User, ApiResponse } from '../src/types';

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
        return await handleGetUsers(req, res);
      case 'POST':
        return await handleCreateUser(req, res);
      case 'PUT':
        return await handleUpdateUser(req, res);
      default:
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetUsers(req: VercelRequest, res: VercelResponse) {
  const { userId, search, limit = '20', offset = '0' } = req.query;

  if (userId) {
    // Get specific user
    const cacheKey = `user:${userId}`;
    let user = await getCache(cacheKey);

    if (!user) {
      const result = await query(
        'SELECT * FROM throttlemeet.users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      user = result.rows[0];
      await setCache(cacheKey, user, 300); // Cache for 5 minutes
    }

    return res.status(200).json({ success: true, data: user });
  }

  // Get multiple users
  let queryText = 'SELECT * FROM throttlemeet.users WHERE 1=1';
  const params: any[] = [];

  if (search) {
    queryText += ' AND (display_name ILIKE $' + (params.length + 1) + ' OR email ILIKE $' + (params.length + 1) + ')';
    params.push(`%${search}%`);
  }

  queryText += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
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

async function handleCreateUser(req: VercelRequest, res: VercelResponse) {
  const {
    email,
    display_name,
    auth_provider,
    apple_user_id,
    facebook_user_id,
    first_name,
    last_name,
    car_make,
    car_model,
    car_year
  } = req.body;

  if (!email || !display_name || !auth_provider) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: email, display_name, auth_provider'
    });
  }

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM throttlemeet.users WHERE email = $1',
    [email]
  );

  if (existingUser.rows.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'User already exists with this email'
    });
  }

  // Create new user
  const result = await query(
    `INSERT INTO throttlemeet.users (
      email, display_name, auth_provider, apple_user_id, facebook_user_id,
      first_name, last_name, car_make, car_model, car_year
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      email, display_name, auth_provider, apple_user_id, facebook_user_id,
      first_name, last_name, car_make, car_model, car_year
    ]
  );

  const newUser = result.rows[0];

  // Generate JWT token
  const token = generateToken({ userId: newUser.id, email: newUser.email });

  // Cache the user
  await setCache(`user:${newUser.id}`, newUser, 3600);

  res.status(201).json({
    success: true,
    data: {
      user: newUser,
      token
    }
  });
}

async function handleUpdateUser(req: VercelRequest, res: VercelResponse) {
  // This would need authentication middleware in a real implementation
  const { userId } = req.query;
  const updates = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID required' });
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
