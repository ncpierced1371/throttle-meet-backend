import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache } from '../src/lib/redis';
import { setCorsHeaders } from '../src/lib/cors';
import { setSecurityHeaders } from '../src/lib/securityHeaders';
import { checkRateLimit } from '../src/lib/rateLimit';
import { logRequest, logError } from '../src/lib/logger';

interface CreatePostRequest {
  author_id: string;
  content: string;
  post_type?: string;
  image_urls?: string[];
  hashtags?: string[];
  mentioned_users?: string[];
  associated_event_id?: string;
  associated_route_id?: string;
  location_name?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  setSecurityHeaders(res);
  logRequest(req);

  // Rate limiting: 60 requests per 10 min per IP for posts endpoints
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `posts:${ip}`, limit: 60, window: 600 });
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
    logError(error, 'posts');
    res.status(500).json({ success: false, error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

async function handleGetPosts(req: VercelRequest, res: VercelResponse) {
  const { postId, authorId, hashtag, search, limit = '20', offset = '0' } = req.query as {
    postId?: string;
    authorId?: string;
    hashtag?: string;
    search?: string;
    limit?: string;
    offset?: string;
  };

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
  const body = req.body as CreatePostRequest;
  const { author_id, content, post_type = 'text', image_urls = [], hashtags = [], mentioned_users = [], associated_event_id, associated_route_id, location_name } = body;
  if (!author_id || !content) {
    return res.status(400).json({ success: false, error: 'Missing required fields: author_id, content' });
  }
  // Content sanitization (basic XSS prevention)
  const sanitizedContent = String(content).replace(/[<>]/g, '');
  // Spam prevention: limit post length
  if (sanitizedContent.length > 2000) {
    return res.status(400).json({ success: false, error: 'Post content too long' });
  }
  // TODO: Add more advanced spam detection if needed
  const result = await query(
    `INSERT INTO throttlemeet.social_posts (
      author_id, content, post_type, image_urls, hashtags, mentioned_users,
      associated_event_id, associated_route_id, location_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      author_id, sanitizedContent, post_type, JSON.stringify(image_urls),
      JSON.stringify(hashtags), JSON.stringify(mentioned_users),
      associated_event_id, associated_route_id, location_name
    ]
  );
  const newPost = result.rows[0];
  await query('UPDATE throttlemeet.users SET post_count = post_count + 1 WHERE id = $1', [author_id]);
  await setCache(`post:${newPost.id}`, newPost, 300);
  res.status(201).json({ success: true, data: newPost });
}

async function handleUpdatePost(req: VercelRequest, res: VercelResponse) {
  const { postId } = req.query as { postId?: string };
  const body = req.body as Partial<CreatePostRequest>;
  if (!postId) {
    return res.status(400).json({ success: false, error: 'Post ID required' });
  }
  // Content sanitization
  if (body.content && String(body.content).length > 2000) {
    return res.status(400).json({ success: false, error: 'Post content too long' });
  }
  const sanitizedContent = body.content ? String(body.content).replace(/[<>]/g, '') : undefined;

  // Build dynamic update query
  const setClause = Object.keys(body)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');

  const values = [postId, ...Object.values(body)];

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
  const { postId } = req.query as { postId?: string };
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
