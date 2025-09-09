
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache } from '../src/lib/redis';
import { SocialPost, ApiResponse } from '../src/types';

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
        return await handleGetPosts(req, res);
      case 'POST':
        return await handleCreatePost(req, res);
      case 'PUT':
        return await handleUpdatePost(req, res);
      case 'DELETE':
        return await handleDeletePost(req, res);
      default:
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Posts API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetPosts(req: VercelRequest, res: VercelResponse) {
  const { 
    postId, 
    authorId, 
    hashtag,
    search,
    limit = '20', 
    offset = '0' 
  } = req.query;

  if (postId) {
    // Get specific post with comments
    const cacheKey = `post:${postId}`;
    let post = await getCache(cacheKey);

    if (!post) {
      const postResult = await query(
        `SELECT p.*, u.display_name as author_name, u.profile_image_url as author_image
         FROM throttlemeet.social_posts p 
         LEFT JOIN throttlemeet.users u ON p.author_id = u.id 
         WHERE p.id = $1`,
        [postId]
      );

      if (postResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      post = postResult.rows[0];

      // Get comments for this post
      const commentsResult = await query(
        `SELECT c.*, u.display_name as author_name, u.profile_image_url as author_image
         FROM throttlemeet.comments c 
         LEFT JOIN throttlemeet.users u ON c.author_id = u.id 
         WHERE c.post_id = $1 
         ORDER BY c.created_at ASC`,
        [postId]
      );

      post.comments = commentsResult.rows;

      await setCache(cacheKey, post, 300); // Cache for 5 minutes
    }

    return res.status(200).json({ success: true, data: post });
  }

  // Get multiple posts (social feed)
  let queryText = `
    SELECT p.*, u.display_name as author_name, u.profile_image_url as author_image,
           u.car_make, u.car_model, u.car_year
    FROM throttlemeet.social_posts p 
    LEFT JOIN throttlemeet.users u ON p.author_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (authorId) {
    queryText += ` AND p.author_id = $${params.length + 1}`;
    params.push(authorId);
  }

  if (hashtag) {
    queryText += ` AND p.hashtags ? $${params.length + 1}`;
    params.push(hashtag);
  }

  if (search) {
    queryText += ` AND p.content ILIKE $${params.length + 1}`;
    params.push(`%${search}%`);
  }

  queryText += `
    ORDER BY p.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await query(queryText, params);

  // Cache the feed results
  const cacheKey = `posts_feed:${JSON.stringify(req.query)}`;
  await setCache(cacheKey, result.rows, 180); // Cache for 3 minutes

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

async function handleCreatePost(req: VercelRequest, res: VercelResponse) {
  const {
    author_id,
    content,
    post_type = 'text',
    image_urls = [],
    hashtags = [],
    mentioned_users = [],
    associated_event_id,
    associated_route_id,
    location_name
  } = req.body;

  if (!author_id || !content) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: author_id, content'
    });
  }

  const result = await query(
    `INSERT INTO throttlemeet.social_posts (
      author_id, content, post_type, image_urls, hashtags, mentioned_users,
      associated_event_id, associated_route_id, location_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      author_id, content, post_type, JSON.stringify(image_urls), 
      JSON.stringify(hashtags), JSON.stringify(mentioned_users),
      associated_event_id, associated_route_id, location_name
    ]
  );

  const newPost = result.rows[0];

  // Update user's post count
  await query(
    'UPDATE throttlemeet.users SET post_count = post_count + 1 WHERE id = $1',
    [author_id]
  );

  // Cache the new post
  await setCache(`post:${newPost.id}`, newPost, 300);

  res.status(201).json({
    success: true,
    data: newPost
  });
}

async function handleUpdatePost(req: VercelRequest, res: VercelResponse) {
  const { postId } = req.query;
  const updates = req.body;

  if (!postId) {
    return res.status(400).json({ success: false, error: 'Post ID required' });
  }

  // Build dynamic update query
  const setClause = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');

  const values = [postId, ...Object.values(updates)];

  const result = await query(
    `UPDATE throttlemeet.social_posts SET ${setClause}, updated_at = NOW() 
     WHERE id = $1 RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }

  const updatedPost = result.rows[0];

  // Update cache
  await setCache(`post:${updatedPost.id}`, updatedPost, 300);

  res.status(200).json({ success: true, data: updatedPost });
}

async function handleDeletePost(req: VercelRequest, res: VercelResponse) {
  const { postId } = req.query;

  if (!postId) {
    return res.status(400).json({ success: false, error: 'Post ID required' });
  }

  const result = await query(
    'DELETE FROM throttlemeet.social_posts WHERE id = $1 RETURNING author_id',
    [postId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }

  const authorId = result.rows[0].author_id;

  // Update user's post count
  await query(
    'UPDATE throttlemeet.users SET post_count = GREATEST(0, post_count - 1) WHERE id = $1',
    [authorId]
  );

  // Remove from cache
  const cacheKey = `post:${postId}`;
  await setCache(cacheKey, null, 1); // Effectively delete from cache

  res.status(200).json({
    success: true,
    message: 'Post deleted successfully'
  });
}
