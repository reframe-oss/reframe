import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export const getCache = async (key: string): Promise<any> => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis cache get failure, falling back to database:", err);
    return null;
  }
};

export const setCache = async (key: string, value: any, ttl: number = 3600): Promise<void> => {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    console.error("Redis cache set failure:", err);
  }
};
