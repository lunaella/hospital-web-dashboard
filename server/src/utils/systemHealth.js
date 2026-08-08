import { pool } from "../db/pool.js";
import { ensureRedisConnected } from "../db/redis.js";

// Live system health check — replaces the old static system_health_snapshots
// read (that table only ever had the one seeded row; nothing wrote to it).
// Both the Dashboard pill and the Reports "System Health" card call this so
// the three states can never drift out of sync between pages.
//
// Signals used (all measured on the actual request, not simulated):
//   - Postgres reachability + round-trip latency (a real SELECT 1)
//   - Redis reachability + round-trip latency (a real PING) — Redis is the
//     layer that would carry live broadcast fan-out per the architecture
//     (see server/README.md), so its latency is used as the proxy for
//     "notification delivery delay" since there's no separately instrumented
//     notification queue to time in this single-node demo deployment.
//
// Thresholds are deliberately small (ms, not the literal 30s from the
// design spec) because on a local/single-node deployment a real 30s stall
// would mean the process is basically wedged. Scaled-down thresholds keep
// the DEGRADED state actually reachable in a demo (e.g. throttling Docker,
// or a slow query) while preserving the same OPTIMAL / DEGRADED / CRITICAL
// semantics the spec calls for.
const DB_DEGRADED_MS = 200;
const REDIS_DEGRADED_MS = 100;

export async function getLiveSystemHealth() {
  const dbCheck = await timedCheck(() => pool.query("SELECT 1"));
  const redisCheck = await timedCheck(async () => {
    const client = await ensureRedisConnected();
    return client.ping();
  });

  let status;
  let dbSyncStatus;

  if (!dbCheck.ok) {
    status = "CRITICAL";
    dbSyncStatus = "Disconnected";
  } else if (!redisCheck.ok) {
    // Core DB is fine, but the broadcast fan-out layer is down — staff can
    // still work, but new broadcasts won't reach donors in real time.
    status = "DEGRADED";
    dbSyncStatus = "Real-time (notifications impaired)";
  } else if (dbCheck.ms > DB_DEGRADED_MS || redisCheck.ms > REDIS_DEGRADED_MS) {
    status = "DEGRADED";
    dbSyncStatus = "Real-time (elevated latency)";
  } else {
    status = "OPTIMAL";
    dbSyncStatus = "Real-time";
  }

  return {
    overallStatus: status,
    dbSyncStatus,
    dbLatencyMs: dbCheck.ms,
    redisLatencyMs: redisCheck.ms,
    // Was misleadingly called "minHeapLatencyMs" — it's just the Redis/DB
    // ping above, no heap involved. The real min-heap lives in
    // notifications.service.js (see rankDonorsByResponseTime), which powers
    // the "Min-Heap Optimized" badge on the Donor Response Time chart.
    broadcastLatencyMs: redisCheck.ok ? redisCheck.ms : dbCheck.ms,
    recordedAt: new Date().toISOString(),
  };
}

async function timedCheck(fn) {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}
