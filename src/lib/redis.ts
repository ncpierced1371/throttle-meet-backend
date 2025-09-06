import Redis from "ioredis";
export let redis: Redis | null = null;

export function initRedis(url?: string) {
  if (!url) return null;
  redis = new Redis(url, { tls: url.startsWith("rediss://") ? {} : undefined });
  return redis;
}
