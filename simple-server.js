const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '🚀 ThrottleMeet API is running!',
    environment: 'development'
  });
});

// Basic API routes
app.get('/api/v1/events', (req, res) => {
  res.json({
    success: true,
    data: {
      events: [],
      message: 'Events endpoint working!'
    }
  });
});

app.get('/api/v1/routes', (req, res) => {
  res.json({
    success: true,
    data: {
      routes: [],
      message: 'Routes endpoint working!'
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 ThrottleMeet API server running on http://localhost:${port}`);
  console.log(`📝 Environment: development`);
  console.log(`✅ Server started successfully!`);
});

module.exports = app;