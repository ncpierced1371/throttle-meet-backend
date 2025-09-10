interface EnvConfig {
  NODE_ENV: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  UPSTASH_REDIS_REST_URL: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  API_KEY?: string;
}

export function getEnv(): EnvConfig {
  const env = process.env;
  if (!env.NODE_ENV || !env.DATABASE_URL || !env.JWT_SECRET || !env.UPSTASH_REDIS_REST_URL) {
    throw new Error('Missing required environment variables');
  }
  return {
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL,
    JWT_SECRET: env.JWT_SECRET,
    UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
    API_KEY: env.API_KEY,
  };
}
