import Redis from "ioredis";
import { env } from "../config/env.js";

// lazyConnect: don't open the socket until the first command is issued —
// keeps server startup instant even if Redis isn't up yet.
export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  // A managed Redis instance that was just suspended (e.g. Render free-tier
  // billing suspension) can stay flaky for several seconds after it reports
  // itself "resumed" — low retry budgets here used to make commands issued
  // during that window fail outright instead of riding it out.
  maxRetriesPerRequest: 8,
  retryStrategy: (times) => Math.min(times * 300, 3000),
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

let connectPromise = null;

// Waits for Redis to be in a usable ("ready") state before a caller issues
// a command. Handles two different situations that both matter here:
//
// 1. The very first connection (status "wait", since lazyConnect delays it
//    until first use) — kicks off redis.connect() once and waits on it.
// 2. A later drop and reconnect (status "connecting"/"reconnecting"/"close"
//    after the instance was suspended and came back) — ioredis reconnects
//    on its own via retryStrategy, so calling connect() again here would
//    just throw "Redis is already connecting/connected". The old version
//    of this function cached the *first* connect() promise forever and
//    reused it on every later call; since that promise was already
//    resolved, it returned immediately without checking redis.status,
//    letting callers issue commands against a socket that wasn't actually
//    ready yet — this is what let a stale-Redis window right after a
//    suspend/resume turn into an auth failure instead of a brief delay.
export async function ensureRedisConnected() {
  if (redis.status === "ready") return redis;

  if (redis.status === "wait") {
    if (!connectPromise) {
      connectPromise = redis.connect().catch((err) => {
        connectPromise = null;
        throw err;
      });
    }
    await connectPromise;
    return redis;
  }

  // Already (re)connecting on its own — wait for it to actually finish
  // rather than trusting a cached promise from a previous connect() call.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Redis to reconnect"));
    }, 8000);
    function cleanup() {
      clearTimeout(timer);
      redis.off("ready", onReady);
      redis.off("error", onError);
    }
    function onReady() {
      cleanup();
      resolve();
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    redis.once("ready", onReady);
    redis.once("error", onError);
  });
  return redis;
}
