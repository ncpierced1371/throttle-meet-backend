
import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { getRedis } from '../src/lib/redis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Test database connection
    let databaseStatus = 'disconnected';
    try {
      await query('SELECT 1');
      databaseStatus = 'connected';
    } catch (error) {
      console.error('Database health check failed:', error);
      databaseStatus = 'error';
    }

    // Test Redis connection
    let redisStatus = 'disconnected';
    try {
      const redis = getRedis();
      await redis.ping();
      redisStatus = 'connected';
    } catch (error) {
      console.error('Redis health check failed:', error);
      redisStatus = 'error';
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: databaseStatus,
        redis: redisStatus
      },
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    res.status(200).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}
