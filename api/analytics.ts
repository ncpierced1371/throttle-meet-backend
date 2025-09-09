
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
    const { type, period = '30d', userId, eventId } = req.query;

    // Check cache first
    const cacheKey = `analytics:${type}:${period}:${userId || 'global'}:${eventId || ''}`;
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        cached: true
      });
    }

    let analytics;

    switch (type) {
      case 'overview':
        analytics = await getOverviewAnalytics();
        break;
      case 'users':
        analytics = await getUserAnalytics(period as string);
        break;
      case 'events':
        analytics = await getEventAnalytics(period as string);
        break;
      case 'routes':
        analytics = await getRouteAnalytics(period as string);
        break;
      case 'social':
        analytics = await getSocialAnalytics(period as string);
        break;
      case 'user_profile':
        if (!userId) {
          return res.status(400).json({ success: false, error: 'User ID required for user profile analytics' });
        }
        analytics = await getUserProfileAnalytics(userId as string, period as string);
        break;
      case 'event_performance':
        if (!eventId) {
          return res.status(400).json({ success: false, error: 'Event ID required for event performance analytics' });
        }
        analytics = await getEventPerformanceAnalytics(eventId as string);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid analytics type' });
    }

    // Cache results
    const cacheTime = type === 'overview' ? 300 : 600; // 5-10 minutes
    await setCache(cacheKey, analytics, cacheTime);

    res.status(200).json({
      success: true,
      data: analytics,
      cached: false
    });

  } catch (error) {
    console.error('Analytics API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function getOverviewAnalytics() {
  const results = await Promise.all([
    query('SELECT COUNT(*) as total FROM throttlemeet.users'),
    query('SELECT COUNT(*) as total FROM throttlemeet.events'),
    query('SELECT COUNT(*) as total FROM throttlemeet.routes'),
    query('SELECT COUNT(*) as total FROM throttlemeet.social_posts'),
    query('SELECT COUNT(*) as total FROM throttlemeet.event_registrations WHERE status = \'registered\''),
    query(`SELECT COUNT(*) as total FROM throttlemeet.users 
           WHERE last_active_at >= NOW() - INTERVAL '7 days'`),
  ]);

  return {
    users: {
      total: parseInt(results[0].rows[0].total),
      active_weekly: parseInt(results[5].rows[0].total)
    },
    events: {
      total: parseInt(results[1].rows[0].total)
    },
    routes: {
      total: parseInt(results[2].rows[0].total)
    },
    posts: {
      total: parseInt(results[3].rows[0].total)
    },
    registrations: {
      total: parseInt(results[4].rows[0].total)
    }
  };
}

async function getUserAnalytics(period: string) {
  const intervalMap: { [key: string]: string } = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    '1y': '1 year'
  };

  const interval = intervalMap[period] || '30 days';

  const results = await Promise.all([
    // New users over time
    query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM throttlemeet.users
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
    
    // User activity
    query(`
      SELECT DATE(last_active_at) as date, COUNT(*) as count
      FROM throttlemeet.users
      WHERE last_active_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(last_active_at)
      ORDER BY date
    `),
    
    // Top car makes
    query(`
      SELECT car_make, COUNT(*) as count
      FROM throttlemeet.users
      WHERE car_make IS NOT NULL
      GROUP BY car_make
      ORDER BY count DESC
      LIMIT 10
    `)
  ]);

  return {
    new_users: results[0].rows,
    active_users: results[1].rows,
    popular_cars: results[2].rows,
    period: period
  };
}

async function getEventAnalytics(period: string) {
  const intervalMap: { [key: string]: string } = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    '1y': '1 year'
  };

  const interval = intervalMap[period] || '30 days';

  const results = await Promise.all([
    // Events created over time
    query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM throttlemeet.events
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
    
    // Events by rally type
    query(`
      SELECT rally_type, COUNT(*) as count
      FROM throttlemeet.events
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY rally_type
      ORDER BY count DESC
    `),
    
    // Registration trends
    query(`
      SELECT DATE(registration_date) as date, COUNT(*) as count
      FROM throttlemeet.event_registrations
      WHERE registration_date >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(registration_date)
      ORDER BY date
    `)
  ]);

  return {
    events_created: results[0].rows,
    events_by_type: results[1].rows,
    registrations: results[2].rows,
    period: period
  };
}

async function getRouteAnalytics(period: string) {
  const intervalMap: { [key: string]: string } = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    '1y': '1 year'
  };

  const interval = intervalMap[period] || '30 days';

  const results = await Promise.all([
    // Routes created over time
    query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM throttlemeet.routes
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
    
    // Routes by difficulty
    query(`
      SELECT difficulty_level, COUNT(*) as count,
             AVG(average_rating) as avg_rating
      FROM throttlemeet.routes
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY difficulty_level
      ORDER BY count DESC
    `),
    
    // Top rated routes
    query(`
      SELECT r.name, r.average_rating, r.total_ratings, u.display_name as creator
      FROM throttlemeet.routes r
      LEFT JOIN throttlemeet.users u ON r.creator_id = u.id
      WHERE r.total_ratings >= 5
      ORDER BY r.average_rating DESC, r.total_ratings DESC
      LIMIT 10
    `)
  ]);

  return {
    routes_created: results[0].rows,
    routes_by_difficulty: results[1].rows,
    top_rated: results[2].rows,
    period: period
  };
}

async function getSocialAnalytics(period: string) {
  const intervalMap: { [key: string]: string } = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    '1y': '1 year'
  };

  const interval = intervalMap[period] || '30 days';

  const results = await Promise.all([
    // Posts created over time
    query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM throttlemeet.social_posts
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
    
    // Engagement metrics
    query(`
      SELECT 
        DATE(created_at) as date,
        SUM(like_count) as total_likes,
        SUM(comment_count) as total_comments,
        SUM(share_count) as total_shares
      FROM throttlemeet.social_posts
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
    
    // Top hashtags
    query(`
      SELECT hashtag, COUNT(*) as count
      FROM (
        SELECT jsonb_array_elements_text(hashtags) as hashtag
        FROM throttlemeet.social_posts
        WHERE created_at >= NOW() - INTERVAL '${interval}'
      ) hashtag_list
      GROUP BY hashtag
      ORDER BY count DESC
      LIMIT 20
    `)
  ]);

  return {
    posts_created: results[0].rows,
    engagement: results[1].rows,
    trending_hashtags: results[2].rows,
    period: period
  };
}

async function getUserProfileAnalytics(userId: string, period: string) {
  const intervalMap: { [key: string]: string } = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    '1y': '1 year'
  };

  const interval = intervalMap[period] || '30 days';

  const results = await Promise.all([
    // User's posts over time
    query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM throttlemeet.social_posts
      WHERE author_id = $1 AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [userId]),
    
    // User's events
    query(`
      SELECT COUNT(*) as organized, 
             (SELECT COUNT(*) FROM throttlemeet.event_registrations WHERE user_id = $1) as attended
      FROM throttlemeet.events
      WHERE organizer_id = $1
    `, [userId]),
    
    // User's routes
    query(`
      SELECT COUNT(*) as created,
             AVG(average_rating) as avg_rating,
             SUM(total_ratings) as total_reviews
      FROM throttlemeet.routes
      WHERE creator_id = $1
    `, [userId]),
    
    // Follower growth (simplified - would need historical data for accurate tracking)
    query(`
      SELECT following_count, follower_count, post_count, achievement_points
      FROM throttlemeet.users
      WHERE id = $1
    `, [userId])
  ]);

  return {
    posts: results[0].rows,
    events: results[1].rows[0],
    routes: results[2].rows[0],
    social_stats: results[3].rows[0],
    period: period
  };
}

async function getEventPerformanceAnalytics(eventId: string) {
  const results = await Promise.all([
    // Event details
    query(`
      SELECT e.*, u.display_name as organizer_name
      FROM throttlemeet.events e
      LEFT JOIN throttlemeet.users u ON e.organizer_id = u.id
      WHERE e.id = $1
    `, [eventId]),
    
    // Registration timeline
    query(`
      SELECT DATE(registration_date) as date, COUNT(*) as registrations
      FROM throttlemeet.event_registrations
      WHERE event_id = $1
      GROUP BY DATE(registration_date)
      ORDER BY date
    `, [eventId]),
    
    // Registration status breakdown
    query(`
      SELECT status, COUNT(*) as count
      FROM throttlemeet.event_registrations
      WHERE event_id = $1
      GROUP BY status
    `, [eventId]),
    
    // Participant car breakdown
    query(`
      SELECT 
        car_details->>'make' as car_make,
        COUNT(*) as count
      FROM throttlemeet.event_registrations
      WHERE event_id = $1 AND car_details IS NOT NULL
      GROUP BY car_details->>'make'
      ORDER BY count DESC
    `, [eventId])
  ]);

  return {
    event: results[0].rows[0],
    registration_timeline: results[1].rows,
    registration_status: results[2].rows,
    participant_cars: results[3].rows
  };
}
