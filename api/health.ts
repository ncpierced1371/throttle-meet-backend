import { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../src/lib/database';
import { getRedis } from '../src/lib/redis';
import { setCorsHeaders } from '../src/lib/cors';
import { setSecurityHeaders } from '../src/lib/securityHeaders';
import { checkRateLimit } from '../src/lib/rateLimit';
import { logRequest, logError } from '../src/lib/logger';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  setSecurityHeaders(res);
  logRequest(req);

  // Rate limiting: 10 requests per 10 min per IP for health endpoint
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `health:${ip}`, limit: 10, window: 600 });
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', reset: rate.reset });
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Database health check
    let dbStatus = 'unknown';
    let dbLatency = null;
    try {
      const start = Date.now();
      await query('SELECT 1');
      dbLatency = Date.now() - start;
      dbStatus = 'ok';
    } catch (err) {
      dbStatus = 'error';
    }

    // Redis health check
    let redisStatus = 'unknown';
    let redisLatency = null;
    try {
      const start = Date.now();
      const redisInstance = getRedis();
      await redisInstance.ping();
      redisLatency = Date.now() - start;
      redisStatus = 'ok';
    } catch (err) {
      redisStatus = 'error';
    }

    // External service health (Cloudinary)
    let cloudinaryStatus = 'unknown';
    try {
      // Ping Cloudinary API (simulate with env check)
      cloudinaryStatus = process.env.CLOUDINARY_CLOUD_NAME ? 'ok' : 'error';
    } catch (err) {
      cloudinaryStatus = 'error';
    }

    // Performance metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Alerting hooks (placeholder)
    const alerts: string[] = [];
    if (dbStatus !== 'ok') alerts.push('Database unhealthy');
    if (redisStatus !== 'ok') alerts.push('Redis unhealthy');
    if (cloudinaryStatus !== 'ok') alerts.push('Cloudinary unhealthy');
    if (memoryUsage.rss > 500 * 1024 * 1024) alerts.push('High memory usage');

    // Status reporting
    res.status(alerts.length ? 503 : 200).json({
      success: alerts.length === 0,
      status: alerts.length === 0 ? 'healthy' : 'unhealthy',
      db: { status: dbStatus, latency: dbLatency },
      redis: { status: redisStatus, latency: redisLatency },
      cloudinary: { status: cloudinaryStatus },
      memory: memoryUsage,
      uptime,
      alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, 'health');
    res.status(500).json({ success: false, error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}
