import knex from 'knex';
import { config } from '../config/config';
import { logger } from '../utils/logger';

// Database connection - PostgreSQL only
const knexConfig = {
  client: 'pg',
  connection: config.databaseUrl,
  migrations: {
    directory: './database/migrations',
    extension: 'ts'
  },
  seeds: {
    directory: './database/seeds',
    extension: 'ts'
  },
  pool: {
    min: 2,
    max: config.nodeEnv === 'production' ? 20 : 10,
    createTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000,
    idleTimeoutMillis: 600000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  acquireConnectionTimeout: 60000
};

export const db = knex(knexConfig);

// Redis connection (optional for development)
let redis: any = null;

if (config.redis.enabled) {
  try {
    const { createClient } = require('redis');
    
    redis = createClient({
      url: config.redis.url,
      password: config.redis.password
    });

    redis.on('error', (err: any) => {
      logger.error('Redis Client Error', err);
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('ready', () => {
      logger.info('Redis ready to accept commands');
    });
  } catch (error) {
    logger.warn('Redis not available, continuing without Redis', error);
    redis = null;
  }
} else {
  logger.info('Redis disabled for development mode');
}

export { redis };

// Initialize connections
export const initializeConnections = async (): Promise<void> => {
  try {
    // Test database connection
    await db.raw('SELECT 1');
    logger.info('PostgreSQL database connected successfully');

    // Connect to Redis if available
    if (redis) {
      await redis.connect();
      logger.info('Redis connection established');
    }
    
    logger.info('All database connections established');
  } catch (error) {
    logger.error('Database connection failed', error);
    throw error;
  }
};

// Graceful shutdown
export const closeConnections = async (): Promise<void> => {
  try {
    await db.destroy();
    if (redis) {
      await redis.disconnect();
    }
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections', error);
  }
};