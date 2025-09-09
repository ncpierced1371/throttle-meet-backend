
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { setCache, getCache } from '../src/lib/redis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { 
      q: searchQuery, 
      type, 
      limit = '20', 
      offset = '0',
      filters 
    } = req.query;

    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) required'
      });
    }

    const query_text = (searchQuery as string).toLowerCase().trim();

    if (query_text.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Check cache first
    const cacheKey = `search:${type || 'all'}:${query_text}:${limit}:${offset}:${filters || ''}`;
    const cachedResults = await getCache(cacheKey);

    if (cachedResults) {
      return res.status(200).json({
        success: true,
        data: cachedResults.data,
        meta: cachedResults.meta
      });
    }

    let results;

    switch (type) {
      case 'users':
        results = await searchUsers(query_text, parseInt(limit as string), parseInt(offset as string));
        break;
      case 'events':
        results = await searchEvents(query_text, parseInt(limit as string), parseInt(offset as string), filters as string);
        break;
      case 'routes':
        results = await searchRoutes(query_text, parseInt(limit as string), parseInt(offset as string), filters as string);
        break;
      case 'posts':
        results = await searchPosts(query_text, parseInt(limit as string), parseInt(offset as string));
        break;
      default:
        results = await searchAll(query_text, parseInt(limit as string), parseInt(offset as string));
    }

    // Cache results for 10 minutes
    await setCache(cacheKey, results, 600);

    res.status(200).json({
      success: true,
      data: results.data,
      meta: results.meta
    });

  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function searchUsers(searchQuery: string, limit: number, offset: number) {
  const result = await query(
    `SELECT id, display_name, profile_image_url, bio, car_make, car_model, car_year,
            follower_count, following_count, is_verified,
            ts_rank(
              to_tsvector('english', display_name || ' ' || COALESCE(bio, '') || ' ' || 
                         COALESCE(car_make, '') || ' ' || COALESCE(car_model, '')),
              plainto_tsquery('english', $1)
            ) as rank
     FROM throttlemeet.users
     WHERE to_tsvector('english', display_name || ' ' || COALESCE(bio, '') || ' ' || 
                      COALESCE(car_make, '') || ' ' || COALESCE(car_model, ''))
           @@ plainto_tsquery('english', $1)
        OR display_name ILIKE $2
        OR email ILIKE $2
     ORDER BY rank DESC, follower_count DESC
     LIMIT $3 OFFSET $4`,
    [searchQuery, `%${searchQuery}%`, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM throttlemeet.users
     WHERE to_tsvector('english', display_name || ' ' || COALESCE(bio, '') || ' ' || 
                      COALESCE(car_make, '') || ' ' || COALESCE(car_model, ''))
           @@ plainto_tsquery('english', $1)
        OR display_name ILIKE $2
        OR email ILIKE $2`,
    [searchQuery, `%${searchQuery}%`]
  );

  return {
    data: result.rows,
    meta: {
      type: 'users',
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    }
  };
}

async function searchEvents(searchQuery: string, limit: number, offset: number, filters?: string) {
  let filterClause = '';
  const params = [searchQuery, `%${searchQuery}%`, limit, offset];

  if (filters) {
    try {
      const filterObj = JSON.parse(filters);
      if (filterObj.rally_type) {
        filterClause += ` AND e.rally_type = $${params.length + 1}`;
        params.push(filterObj.rally_type);
      }
      if (filterObj.status) {
        filterClause += ` AND e.status = $${params.length + 1}`;
        params.push(filterObj.status);
      }
    } catch (e) {
      // Ignore invalid filter JSON
    }
  }

  const result = await query(
    `SELECT e.*, u.display_name as organizer_name,
            COUNT(er.id) as registration_count,
            ts_rank(
              to_tsvector('english', e.title || ' ' || COALESCE(e.description, '') || ' ' || 
                         COALESCE(e.location_name, '')),
              plainto_tsquery('english', $1)
            ) as rank
     FROM throttlemeet.events e
     LEFT JOIN throttlemeet.users u ON e.organizer_id = u.id
     LEFT JOIN throttlemeet.event_registrations er ON e.id = er.event_id AND er.status = 'registered'
     WHERE (to_tsvector('english', e.title || ' ' || COALESCE(e.description, '') || ' ' || 
                       COALESCE(e.location_name, ''))
           @@ plainto_tsquery('english', $1)
        OR e.title ILIKE $2
        OR e.description ILIKE $2)
       AND e.is_public = true
       ${filterClause}
     GROUP BY e.id, u.display_name
     ORDER BY rank DESC, e.start_date ASC
     LIMIT $3 OFFSET $4`,
    params
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM throttlemeet.events e
     WHERE (to_tsvector('english', e.title || ' ' || COALESCE(e.description, '') || ' ' || 
                       COALESCE(e.location_name, ''))
           @@ plainto_tsquery('english', $1)
        OR e.title ILIKE $2
        OR e.description ILIKE $2)
       AND e.is_public = true
       ${filterClause}`,
    params.slice(0, -2) // Remove limit and offset for count
  );

  return {
    data: result.rows,
    meta: {
      type: 'events',
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    }
  };
}

async function searchRoutes(searchQuery: string, limit: number, offset: number, filters?: string) {
  let filterClause = '';
  const params = [searchQuery, `%${searchQuery}%`, limit, offset];

  if (filters) {
    try {
      const filterObj = JSON.parse(filters);
      if (filterObj.difficulty_level) {
        filterClause += ` AND r.difficulty_level = $${params.length + 1}`;
        params.push(filterObj.difficulty_level);
      }
      if (filterObj.min_rating) {
        filterClause += ` AND r.average_rating >= $${params.length + 1}`;
        params.push(parseFloat(filterObj.min_rating));
      }
    } catch (e) {
      // Ignore invalid filter JSON
    }
  }

  const result = await query(
    `SELECT r.*, u.display_name as creator_name,
            COUNT(rr.id) as review_count,
            ts_rank(
              to_tsvector('english', r.name || ' ' || COALESCE(r.description, '')),
              plainto_tsquery('english', $1)
            ) as rank
     FROM throttlemeet.routes r
     LEFT JOIN throttlemeet.users u ON r.creator_id = u.id
     LEFT JOIN throttlemeet.route_ratings rr ON r.id = rr.route_id
     WHERE (to_tsvector('english', r.name || ' ' || COALESCE(r.description, ''))
           @@ plainto_tsquery('english', $1)
        OR r.name ILIKE $2
        OR r.description ILIKE $2)
       AND r.is_public = true
       ${filterClause}
     GROUP BY r.id, u.display_name
     ORDER BY rank DESC, r.average_rating DESC
     LIMIT $3 OFFSET $4`,
    params
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM throttlemeet.routes r
     WHERE (to_tsvector('english', r.name || ' ' || COALESCE(r.description, ''))
           @@ plainto_tsquery('english', $1)
        OR r.name ILIKE $2
        OR r.description ILIKE $2)
       AND r.is_public = true
       ${filterClause}`,
    params.slice(0, -2)
  );

  return {
    data: result.rows,
    meta: {
      type: 'routes',
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    }
  };
}

async function searchPosts(searchQuery: string, limit: number, offset: number) {
  const result = await query(
    `SELECT p.*, u.display_name as author_name, u.profile_image_url as author_image,
            u.car_make, u.car_model, u.car_year,
            ts_rank(
              to_tsvector('english', p.content),
              plainto_tsquery('english', $1)
            ) as rank
     FROM throttlemeet.social_posts p
     LEFT JOIN throttlemeet.users u ON p.author_id = u.id
     WHERE to_tsvector('english', p.content) @@ plainto_tsquery('english', $1)
        OR p.content ILIKE $2
        OR p.hashtags ? $1
     ORDER BY rank DESC, p.created_at DESC
     LIMIT $3 OFFSET $4`,
    [searchQuery, `%${searchQuery}%`, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM throttlemeet.social_posts p
     WHERE to_tsvector('english', p.content) @@ plainto_tsquery('english', $1)
        OR p.content ILIKE $2
        OR p.hashtags ? $1`,
    [searchQuery, `%${searchQuery}%`]
  );

  return {
    data: result.rows,
    meta: {
      type: 'posts',
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    }
  };
}

async function searchAll(searchQuery: string, limit: number, offset: number) {
  // Search across all content types with smaller limits each
  const perTypeLimit = Math.ceil(limit / 4);

  const [users, events, routes, posts] = await Promise.all([
    searchUsers(searchQuery, perTypeLimit, 0),
    searchEvents(searchQuery, perTypeLimit, 0),
    searchRoutes(searchQuery, perTypeLimit, 0),
    searchPosts(searchQuery, perTypeLimit, 0)
  ]);

  // Combine and sort by relevance
  const combinedResults = [
    ...users.data.map(item => ({ ...item, content_type: 'user' })),
    ...events.data.map(item => ({ ...item, content_type: 'event' })),
    ...routes.data.map(item => ({ ...item, content_type: 'route' })),
    ...posts.data.map(item => ({ ...item, content_type: 'post' }))
  ].sort((a, b) => (b.rank || 0) - (a.rank || 0));

  const totalResults = users.meta.total + events.meta.total + routes.meta.total + posts.meta.total;

  return {
    data: {
      users: users.data,
      events: events.data,
      routes: routes.data,
      posts: posts.data,
      combined: combinedResults.slice(offset, offset + limit)
    },
    meta: {
      type: 'all',
      total: totalResults,
      limit,
      offset,
      breakdown: {
        users: users.meta.total,
        events: events.meta.total,
        routes: routes.meta.total,
        posts: posts.meta.total
      }
    }
  };
}
