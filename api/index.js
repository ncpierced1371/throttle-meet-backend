module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Route handling
  const { url, method } = req;

  if (url === '/api' && method === 'GET') {
    res.json({
      message: 'ThrottleMeet Backend API',
      endpoints: ['/api/health', '/api/users', '/api/events', '/api/routes'],
      timestamp: new Date().toISOString()
    });
  } else if (url.startsWith('/api/health')) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(404).json({
      error: 'Not found'
    });
  }
};
