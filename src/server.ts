
// This file is now for local development only.
// All production API endpoints must be implemented in /api/*.ts for Vercel compatibility.

import express from 'express';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';

const app = express();

// Example: local-only health check (not used in production)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

const port = config.port || 3001;
const host = config.host || 'localhost';

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, host, () => {
    logger.info(`Local dev server running on http://${host}:${port}`);
  });
}