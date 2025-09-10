module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Simple health check without external dependencies for now
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: process.env.DATABASE_URL ? 'configured' : 'not configured',
        redis: process.env.UPSTASH_REDIS_REST_URL ? 'configured' : 'not configured'
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
};
