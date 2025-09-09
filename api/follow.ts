
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache, deleteCache } from '../src/lib/redis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGetFollowData(req, res);
      case 'POST':
        return await handleFollowUser(req, res);
      case 'DELETE':
        return await handleUnfollowUser(req, res);
      default:
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Follow API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetFollowData(req: VercelRequest, res: VercelResponse) {
  const { userId, type, limit = '20', offset = '0' } = req.query;

  if (!userId || !type) {
    return res.status(400).json({
      success: false,
      error: 'User ID and type (followers/following/suggestions) required'
    });
  }

  const cacheKey = `follow:${type}:${userId}:${limit}:${offset}`;
  let cachedData = await getCache(cacheKey);

  if (cachedData) {
    return res.status(200).json({
      success: true,
      data: cachedData.data,
      meta: cachedData.meta
    });
  }

  let result;

  switch (type) {
    case 'followers':
      result = await getFollowers(userId as string, parseInt(limit as string), parseInt(offset as string));
      break;
    case 'following':
      result = await getFollowing(userId as string, parseInt(limit as string), parseInt(offset as string));
      break;
    case 'suggestions':
      result = await getSuggestions(userId as string, parseInt(limit as string), parseInt(offset as string));
      break;
    default:
      return res.status(400).json({ success: false, error: 'Invalid type' });
  }

  // Cache the results
  await setCache(cacheKey, result, 300); // Cache for 5 minutes

  res.status(200).json({
    success: true,
    data: result.data,
    meta: result.meta
  });
}

async function handleFollowUser(req: VercelRequest, res: VercelResponse) {
  const { follower_id, following_id } = req.body;

  if (!follower_id || !following_id) {
    return res.status(400).json({
      success: false,
      error: 'Both follower_id and following_id required'
    });
  }

  if (follower_id === following_id) {
    return res.status(400).json({
      success: false,
      error: 'Users cannot follow themselves'
    });
  }

  // Check if already following
  const existingFollow = await query(
    `SELECT u.following_user_ids FROM throttlemeet.users u WHERE u.id = $1`,
    [follower_id]
  );

  if (existingFollow.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Follower user not found' });
  }

  const currentFollowing = existingFollow.rows[0].following_user_ids || [];
  if (currentFollowing.includes(following_id)) {
    return res.status(409).json({
      success: false,
      error: 'Already following this user'
    });
  }

  try {
    // Start transaction
    await query('BEGIN');

    // Add to follower's following list
    await query(
      `UPDATE throttlemeet.users 
       SET following_user_ids = following_user_ids || $1::jsonb,
           following_count = following_count + 1
       WHERE id = $2`,
      [JSON.stringify([following_id]), follower_id]
    );

    // Add to following user's followers list
    await query(
      `UPDATE throttlemeet.users 
       SET follower_user_ids = follower_user_ids || $1::jsonb,
           follower_count = follower_count + 1
       WHERE id = $2`,
      [JSON.stringify([follower_id]), following_id]
    );

    await query('COMMIT');

    // Clear relevant caches
    await deleteCache(`follow:followers:${following_id}:*`);
    await deleteCache(`follow:following:${follower_id}:*`);
    await deleteCache(`user:${follower_id}`);
    await deleteCache(`user:${following_id}`);

    res.status(200).json({
      success: true,
      message: 'Successfully followed user'
    });

  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

async function handleUnfollowUser(req: VercelRequest, res: VercelResponse) {
  const { follower_id, following_id } = req.body;

  if (!follower_id || !following_id) {
    return res.status(400).json({
      success: false,
      error: 'Both follower_id and following_id required'
    });
  }

  try {
    // Start transaction
    await query('BEGIN');

    // Remove from follower's following list
    await query(
      `UPDATE throttlemeet.users 
       SET following_user_ids = following_user_ids - $1,
           following_count = GREATEST(0, following_count - 1)
       WHERE id = $2`,
      [following_id, follower_id]
    );

    // Remove from following user's followers list
    await query(
      `UPDATE throttlemeet.users 
       SET follower_user_ids = follower_user_ids - $1,
           follower_count = GREATEST(0, follower_count - 1)
       WHERE id = $2`,
      [follower_id, following_id]
    );

    await query('COMMIT');

    // Clear relevant caches
    await deleteCache(`follow:followers:${following_id}:*`);
    await deleteCache(`follow:following:${follower_id}:*`);
    await deleteCache(`user:${follower_id}`);
    await deleteCache(`user:${following_id}`);

    res.status(200).json({
      success: true,
      message: 'Successfully unfollowed user'
    });

  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

// Helper functions

async function getFollowers(userId: string, limit: number, offset: number) {
  const userResult = await query(
    'SELECT follower_user_ids FROM throttlemeet.users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const followerIds = userResult.rows[0].follower_user_ids || [];

  if (followerIds.length === 0) {
    return {
      data: [],
      meta: { total: 0, limit, offset }
    };
  }

  // Get paginated followers
  const paginatedIds = followerIds.slice(offset, offset + limit);

  const followersResult = await query(
    `SELECT id, display_name, profile_image_url, car_make, car_model, car_year,
            follower_count, following_count, is_verified
     FROM throttlemeet.users 
     WHERE id = ANY($1::uuid[])
     ORDER BY display_name`,
    [paginatedIds]
  );

  return {
    data: followersResult.rows,
    meta: {
      total: followerIds.length,
      limit,
      offset
    }
  };
}

async function getFollowing(userId: string, limit: number, offset: number) {
  const userResult = await query(
    'SELECT following_user_ids FROM throttlemeet.users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const followingIds = userResult.rows[0].following_user_ids || [];

  if (followingIds.length === 0) {
    return {
      data: [],
      meta: { total: 0, limit, offset }
    };
  }

  // Get paginated following users
  const paginatedIds = followingIds.slice(offset, offset + limit);

  const followingResult = await query(
    `SELECT id, display_name, profile_image_url, car_make, car_model, car_year,
            follower_count, following_count, is_verified
     FROM throttlemeet.users 
     WHERE id = ANY($1::uuid[])
     ORDER BY display_name`,
    [paginatedIds]
  );

  return {
    data: followingResult.rows,
    meta: {
      total: followingIds.length,
      limit,
      offset
    }
  };
}

async function getSuggestions(userId: string, limit: number, offset: number) {
  // Get user's following list and interests
  const userResult = await query(
    `SELECT following_user_ids, automotive_interests, car_make, car_model
     FROM throttlemeet.users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const { following_user_ids = [], automotive_interests = [], car_make, car_model } = userResult.rows[0];
  const excludeIds = [...following_user_ids, userId];

  // Get suggestions based on similar interests and cars
  const suggestionsResult = await query(
    `SELECT u.id, u.display_name, u.profile_image_url, u.car_make, u.car_model, u.car_year,
            u.follower_count, u.following_count, u.is_verified,
            u.automotive_interests,
            -- Calculate similarity score
            CASE 
              WHEN u.car_make = $2 AND u.car_model = $3 THEN 3
              WHEN u.car_make = $2 THEN 2
              ELSE 1
            END as car_similarity
     FROM throttlemeet.users u
     WHERE u.id != ALL($1::uuid[])
       AND u.follower_count > 0
     ORDER BY 
       car_similarity DESC,
       u.follower_count DESC,
       u.created_at DESC
     LIMIT $4 OFFSET $5`,
    [excludeIds, car_make, car_model, limit, offset]
  );

  // Calculate total count for pagination
  const countResult = await query(
    `SELECT COUNT(*) as total
     FROM throttlemeet.users u
     WHERE u.id != ALL($1::uuid[])
       AND u.follower_count > 0`,
    [excludeIds]
  );

  return {
    data: suggestionsResult.rows,
    meta: {
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    }
  };
}
