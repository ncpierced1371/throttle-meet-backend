export function getCache(key: string): Promise<any>;
export function setCache(key: string, value: any, ttl?: number): Promise<void>;
