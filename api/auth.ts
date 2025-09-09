
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { generateToken, verifyToken } from '../src/lib/auth';
import { setCache, getCache } from '../src/lib/redis';

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
    const { action } = req.query;

    switch (action) {
      case 'login':
        return await handleLogin(req, res);
      case 'signup':
        return await handleSignup(req, res);
      case 'apple':
        return await handleAppleSignIn(req, res);
      case 'facebook':
        return await handleFacebookLogin(req, res);
      case 'verify':
        return await handleTokenVerification(req, res);
      case 'refresh':
        return await handleTokenRefresh(req, res);
      default:
        res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Auth API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email required'
    });
  }

  // Find user by email
  const result = await query(
    'SELECT * FROM throttlemeet.users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const user = result.rows[0];

  // Generate token
  const token = generateToken({ userId: user.id, email: user.email });

  // Update last active
  await query(
    'UPDATE throttlemeet.users SET last_active_at = NOW() WHERE id = $1',
    [user.id]
  );

  // Cache user session
  await setCache(`session:${user.id}`, { userId: user.id, email: user.email }, 86400); // 24 hours

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        profile_image_url: user.profile_image_url,
        car_make: user.car_make,
        car_model: user.car_model,
        car_year: user.car_year
      },
      token
    }
  });
}

async function handleSignup(req: VercelRequest, res: VercelResponse) {
  const {
    email,
    display_name,
    auth_provider,
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
      email, display_name, auth_provider, first_name, last_name,
      car_make, car_model, car_year
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [email, display_name, auth_provider, first_name, last_name, car_make, car_model, car_year]
  );

  const newUser = result.rows[0];

  // Generate token
  const token = generateToken({ userId: newUser.id, email: newUser.email });

  // Cache user
  await setCache(`user:${newUser.id}`, newUser, 3600);
  await setCache(`session:${newUser.id}`, { userId: newUser.id, email: newUser.email }, 86400);

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: newUser.id,
        email: newUser.email,
        display_name: newUser.display_name,
        profile_image_url: newUser.profile_image_url,
        car_make: newUser.car_make,
        car_model: newUser.car_model,
        car_year: newUser.car_year
      },
      token
    }
  });
}

async function handleAppleSignIn(req: VercelRequest, res: VercelResponse) {
  const { 
    apple_user_id, 
    email, 
    display_name,
    first_name,
    last_name 
  } = req.body;

  if (!apple_user_id) {
    return res.status(400).json({
      success: false,
      error: 'Apple User ID required'
    });
  }

  // Check if user exists by Apple ID
  let result = await query(
    'SELECT * FROM throttlemeet.users WHERE apple_user_id = $1',
    [apple_user_id]
  );

  let user;

  if (result.rows.length === 0) {
    // Create new user
    if (!email || !display_name) {
      return res.status(400).json({
        success: false,
        error: 'Email and display name required for new user'
      });
    }

    const createResult = await query(
      `INSERT INTO throttlemeet.users (
        email, display_name, auth_provider, apple_user_id, 
        first_name, last_name, email_verified
      ) VALUES ($1, $2, 'apple', $3, $4, $5, true)
      RETURNING *`,
      [email, display_name, apple_user_id, first_name, last_name]
    );

    user = createResult.rows[0];
  } else {
    user = result.rows[0];
    
    // Update last active
    await query(
      'UPDATE throttlemeet.users SET last_active_at = NOW() WHERE id = $1',
      [user.id]
    );
  }

  // Generate token
  const token = generateToken({ userId: user.id, email: user.email });

  // Cache user session
  await setCache(`session:${user.id}`, { userId: user.id, email: user.email }, 86400);

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        profile_image_url: user.profile_image_url,
        car_make: user.car_make,
        car_model: user.car_model,
        car_year: user.car_year
      },
      token,
      isNewUser: result.rows.length === 0
    }
  });
}

async function handleFacebookLogin(req: VercelRequest, res: VercelResponse) {
  const { 
    facebook_user_id, 
    email, 
    display_name,
    first_name,
    last_name,
    profile_image_url
  } = req.body;

  if (!facebook_user_id) {
    return res.status(400).json({
      success: false,
      error: 'Facebook User ID required'
    });
  }

  // Check if user exists by Facebook ID
  let result = await query(
    'SELECT * FROM throttlemeet.users WHERE facebook_user_id = $1',
    [facebook_user_id]
  );

  let user;

  if (result.rows.length === 0) {
    // Create new user
    if (!email || !display_name) {
      return res.status(400).json({
        success: false,
        error: 'Email and display name required for new user'
      });
    }

    const createResult = await query(
      `INSERT INTO throttlemeet.users (
        email, display_name, auth_provider, facebook_user_id, 
        first_name, last_name, profile_image_url, is_facebook_linked, email_verified
      ) VALUES ($1, $2, 'facebook', $3, $4, $5, $6, true, true)
      RETURNING *`,
      [email, display_name, facebook_user_id, first_name, last_name, profile_image_url]
    );

    user = createResult.rows[0];
  } else {
    user = result.rows[0];
    
    // Update last active and profile image
    await query(
      `UPDATE throttlemeet.users SET 
       last_active_at = NOW(), 
       profile_image_url = COALESCE($1, profile_image_url)
       WHERE id = $2`,
      [profile_image_url, user.id]
    );
  }

  // Generate token
  const token = generateToken({ userId: user.id, email: user.email });

  // Cache user session
  await setCache(`session:${user.id}`, { userId: user.id, email: user.email }, 86400);

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        profile_image_url: user.profile_image_url,
        car_make: user.car_make,
        car_model: user.car_model,
        car_year: user.car_year
      },
      token,
      isNewUser: result.rows.length === 0
    }
  });
}

async function handleTokenVerification(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required'
    });
  }

  try {
    const payload = verifyToken(token);
    
    // Check if session exists in cache
    const session = await getCache(`session:${payload.userId}`);
    
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Session expired'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId: payload.userId,
        email: payload.email,
        valid: true
      }
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
}

async function handleTokenRefresh(req: VercelRequest, res: VercelResponse) {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token required'
    });
  }

  try {
    const payload = verifyToken(refresh_token);
    
    // Generate new access token
    const newToken = generateToken({ userId: payload.userId, email: payload.email });

    res.status(200).json({
      success: true,
      data: {
        token: newToken
      }
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
}
