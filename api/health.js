import { Pool } from 'pg';
import { Redis } from '@upstash/redis';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 10000,
});
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let dbStatus = 'unknown';
  let redisStatus = 'unknown';

  try {
    const dbResult = await pool.query('SELECT 1');
    dbStatus = dbResult ? 'connected' : 'error';
  } catch (err) {
    dbStatus = 'error';
  }

  try {
    await redis.set('healthcheck', 'ok', { ex: 10 });
    const redisResult = await redis.get('healthcheck');
    redisStatus = redisResult === 'ok' ? 'connected' : 'error';
  } catch (err) {
    redisStatus = 'error';
  }

  res.status(200).json({
    status: dbStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'unhealthy',
    database: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
};
