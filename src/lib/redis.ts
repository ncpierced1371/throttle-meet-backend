import { Redis as UpstashRedis } from '@upstash/redis';

let redis: UpstashRedis | null = null;

export const getRedis = (): UpstashRedis => {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error('Redis environment variables are not set');
    }

    redis = new UpstashRedis({
      url,
      token,
    });
  }
  return redis;
};

export const setCache = async (key: string, value: any, ttl: number = 3600) => {
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(value), { ex: ttl });
  } catch (error) {
    console.error('Redis set error:', error);
  }
};

export const getCache = async (key: string) => {
  try {
    const redis = getRedis();
    const value = await redis.get(key);
    return value ? JSON.parse(value as string) : null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
};

export const deleteCache = async (key: string) => {
  try {
    const redis = getRedis();
    await redis.del(key);
  } catch (error) {
    console.error('Redis delete error:', error);
  }
};
