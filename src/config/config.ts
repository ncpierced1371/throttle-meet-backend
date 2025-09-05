import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

interface Config {
  // Server
  nodeEnv: string;
  port: number;
  host: string;

  // Database
  databaseUrl: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };

  // Redis (optional for development)
  redis: {
    url: string;
    host: string;
    port: number;
    password?: string;
    enabled: boolean;
  };

  // JWT
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };

  // External APIs
  apple: {
    teamId: string;
    clientId: string;
    keyId: string;
    privateKeyPath: string;
  };

  facebook: {
    appId: string;
    appSecret: string;
  };

  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };

  weather: {
    apiKey: string;
  };

  // Rate limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // CORS
  corsOrigin: string;

  // Logging
  logLevel: string;
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || 'localhost',

  // PostgreSQL configuration
  databaseUrl: process.env.DATABASE_URL || 'postgresql://jeremy:@localhost:5432/throttlemeet_dev',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'throttlemeet_dev',
    user: process.env.DB_USER || 'jeremy',
    password: process.env.DB_PASSWORD || ''
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    enabled: process.env.REDIS_ENABLED !== 'false'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_for_throttlemeet_development_please_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  apple: {
    teamId: process.env.APPLE_TEAM_ID || '',
    clientId: process.env.APPLE_CLIENT_ID || 'com.throttlemeet.app',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/AuthKey.p8')
  },

  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || ''
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || ''
  },

  weather: {
    apiKey: process.env.WEATHER_API_KEY || ''
  },

  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080',
  logLevel: process.env.LOG_LEVEL || 'debug'
};

// Only validate critical variables for production
const requiredVars = process.env.NODE_ENV === 'production' ? ['JWT_SECRET', 'DATABASE_URL'] : [];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}