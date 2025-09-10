import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { generateToken, verifyToken } from '../src/lib/auth';
import { setCache, getCache } from '../src/lib/redis';
import { setCorsHeaders } from '../src/lib/cors';
import { setSecurityHeaders } from '../src/lib/securityHeaders';
import { checkRateLimit } from '../src/lib/rateLimit';
import { logRequest, logError } from '../src/lib/logger';
import { validateFields } from '../src/lib/validation';

// Request interfaces
interface LoginRequest { email: string; password?: string; }
interface SignupRequest {
  email: string;
  display_name: string;
  auth_provider: string;
  first_name?: string;
  last_name?: string;
  car_make?: string;
  car_model?: string;
  car_year?: string;
}
interface AppleSignInRequest {
  apple_user_id: string;
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
}
interface FacebookLoginRequest {
  facebook_user_id: string;
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
}
interface TokenRefreshRequest { refresh_token: string; }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  setSecurityHeaders(res);
  logRequest(req);

  // Rate limiting: 30 requests per 10 min per IP for auth endpoints
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `auth:${ip}`, limit: 30, window: 600 });
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', reset: rate.reset });
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { action } = req.query as { action?: string };
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
    logError(error, 'auth');
    res.status(500).json({ success: false, error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `login:${ip}`, limit: 10, window: 600 });
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: 'Too many login attempts', reset: rate.reset });
  }
  const body = req.body as LoginRequest;
  const { email } = body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }
  const result = await query('SELECT * FROM throttlemeet.users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    await setCache(`lockout:${email}`, { failed: true, ts: Date.now() }, 600);
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  const user = result.rows[0];
  const lockout = await getCache(`lockout:${email}`);
  if (lockout && lockout.failed) {
    return res.status(403).json({ success: false, error: 'Account temporarily locked due to failed attempts' });
  }
  const token = generateToken({ userId: user.id, email: user.email, role: user.role || 'user' });
  await query('UPDATE throttlemeet.users SET last_active_at = NOW() WHERE id = $1', [user.id]);
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
        car_year: user.car_year,
        role: user.role || 'user'
      },
      token
    }
  });
}

async function handleSignup(req: VercelRequest, res: VercelResponse) {
  const body = req.body as SignupRequest;
  const { email, display_name, auth_provider, first_name, last_name, car_make, car_model, car_year } = body;
  if (!email || !display_name || !auth_provider) {
    return res.status(400).json({ success: false, error: 'Missing required fields: email, display_name, auth_provider' });
  }
  const existingUser = await query('SELECT id FROM throttlemeet.users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    return res.status(409).json({ success: false, error: 'User already exists with this email' });
  }
  const result = await query(
    `INSERT INTO throttlemeet.users (
      email, display_name, auth_provider, first_name, last_name,
      car_make, car_model, car_year
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [email, display_name, auth_provider, first_name, last_name, car_make, car_model, car_year]
  );
  const newUser = result.rows[0];
  const token = generateToken({ userId: newUser.id, email: newUser.email, role: newUser.role || 'user' });
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
        car_year: newUser.car_year,
        role: newUser.role || 'user'
      },
      token
    }
  });
}

async function handleAppleSignIn(req: VercelRequest, res: VercelResponse) {
  const body = req.body as AppleSignInRequest;
  const { apple_user_id, email, display_name, first_name, last_name } = body;
  if (!apple_user_id) {
    return res.status(400).json({ success: false, error: 'Apple User ID required' });
  }
  let result = await query('SELECT * FROM throttlemeet.users WHERE apple_user_id = $1', [apple_user_id]);
  let user;
  if (result.rows.length === 0) {
    if (!email || !display_name) {
      return res.status(400).json({ success: false, error: 'Email and display name required for new user' });
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
    await query('UPDATE throttlemeet.users SET last_active_at = NOW() WHERE id = $1', [user.id]);
  }
  const token = generateToken({ userId: user.id, email: user.email, role: user.role || 'user' });
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
        car_year: user.car_year,
        role: user.role || 'user'
      },
      token,
      isNewUser: result.rows.length === 0
    }
  });
}

async function handleFacebookLogin(req: VercelRequest, res: VercelResponse) {
  const body = req.body as FacebookLoginRequest;
  const { facebook_user_id, email, display_name, first_name, last_name, profile_image_url } = body;
  if (!facebook_user_id) {
    return res.status(400).json({ success: false, error: 'Facebook User ID required' });
  }
  let result = await query('SELECT * FROM throttlemeet.users WHERE facebook_user_id = $1', [facebook_user_id]);
  let user;
  if (result.rows.length === 0) {
    if (!email || !display_name) {
      return res.status(400).json({ success: false, error: 'Email and display name required for new user' });
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
    await query(
      `UPDATE throttlemeet.users SET 
       last_active_at = NOW(), 
       profile_image_url = COALESCE($1, profile_image_url)
       WHERE id = $2`,
      [profile_image_url, user.id]
    );
  }
  const token = generateToken({ userId: user.id, email: user.email, role: user.role || 'user' });
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
        car_year: user.car_year,
        role: user.role || 'user'
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
    return res.status(401).json({ success: false, error: 'Access token required' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  const session = await getCache(`session:${payload.userId}`);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Session expired' });
  }
  res.status(200).json({
    success: true,
    data: {
      userId: payload.userId,
      email: payload.email,
      valid: true
    }
  });
}

async function handleTokenRefresh(req: VercelRequest, res: VercelResponse) {
  const body = req.body as TokenRefreshRequest;
  const { refresh_token } = body;
  if (!refresh_token) {
    return res.status(400).json({ success: false, error: 'Refresh token required' });
  }
  const payload = verifyToken(refresh_token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
  const newToken = generateToken({ userId: payload.userId, email: payload.email, role: payload.role || 'user' });
  res.status(200).json({
    success: true,
    data: {
      token: newToken
    }
  });
}
