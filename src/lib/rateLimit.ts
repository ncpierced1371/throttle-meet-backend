import Redis from 'ioredis';

const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL || '');

export interface RateLimitOptions {
  key: string;
  limit: number;
  window: number; // seconds
}

export async function checkRateLimit({ key, limit, window }: RateLimitOptions): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % window);
  const redisKey = `ratelimit:${key}:${windowStart}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, window);
  }
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    reset: windowStart + window - now
  };
}
