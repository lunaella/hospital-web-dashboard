import Redis from "ioredis";
import { env } from "../config/env.js";

// lazyConnect: don't open the socket until the first command is issued —
// keeps server startup instant even if Redis isn't up yet.
export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

let connecting = null;
export async function ensureRedisConnected() {
  if (redis.status === "ready") return redis;
  if (!connecting) connecting = redis.connect().catch((err) => {
    connecting = null;
    throw err;
  });
  await connecting;
  return redis;
}
