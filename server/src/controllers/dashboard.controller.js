import { pool } from "../db/pool.js";
import { ensureRedisConnected } from "../db/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getLiveSystemHealth } from "../utils/systemHealth.js";

const STATS_CACHE_KEY = "dashboard:stats";
const STATS_CACHE_TTL_SECONDS = 8; // short TTL: keeps concurrent admins off Postgres without serving stale data long

// "Active Donors" (Arrived vs In-Transit) has no dedicated dispatch table
// yet — this approximates it from donor_arrivals (arrived) and confirmed
// appointments scheduled for today that haven't arrived yet (in-transit).
// Revisit once a real dispatch/tracking table exists.
export const getStats = asyncHandler(async (req, res) => {
  const redis = await ensureRedisConnected();
  const cached = await redis.get(STATS_CACHE_KEY);
  if (cached) return res.json(JSON.parse(cached));

  const [codeRed, unitsNeeded, arrivedToday, inTransitToday, fulfillmentRate] = await Promise.all([
    pool.query(
      "SELECT count(*)::int AS count FROM blood_requests WHERE priority = 'EMERGENCY' AND status IN ('OPEN','PARTIALLY_FULFILLED')"
    ),
    pool.query(
      "SELECT coalesce(sum(units_needed - units_fulfilled), 0)::int AS total FROM blood_requests WHERE status IN ('OPEN','PARTIALLY_FULFILLED')"
    ),
    pool.query(
      "SELECT count(*)::int AS count FROM donor_arrivals WHERE arrived_at >= now() - INTERVAL '24 hours'"
    ),
    pool.query(
      "SELECT count(*)::int AS count FROM appointments WHERE status = 'confirmed' AND scheduled_at::date = current_date"
    ),
    pool.query(`
      SELECT coalesce(avg(units_fulfilled::numeric / NULLIF(units_needed, 0)) * 100, 0)::numeric(5,1) AS pct
      FROM blood_requests
      WHERE created_at >= now() - INTERVAL '24 hours'
    `),
  ]);

  const payload = {
    codeRedBroadcasts: codeRed.rows[0].count,
    unitsNeeded: unitsNeeded.rows[0].total,
    activeDonors: {
      arrived: arrivedToday.rows[0].count,
      inTransit: inTransitToday.rows[0].count,
    },
    fulfillmentRatePct: Number(fulfillmentRate.rows[0].pct),
  };

  await redis.set(STATS_CACHE_KEY, JSON.stringify(payload), "EX", STATS_CACHE_TTL_SECONDS);
  res.json(payload);
});

// Live Match Monitoring: active broadcasts, most urgent/newest first.
export const getMonitoring = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      request_code AS id,
      blood_type AS "bloodType",
      priority,
      ward,
      units_needed AS "unitsNeeded",
      units_fulfilled AS "unitsFulfilled",
      round(units_fulfilled::numeric / NULLIF(units_needed, 0) * 100)::int AS pct,
      extract(epoch FROM (now() - created_at))::int AS seconds_open
    FROM blood_requests
    WHERE status IN ('OPEN', 'PARTIALLY_FULFILLED')
    ORDER BY
      CASE priority WHEN 'EMERGENCY' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END,
      created_at DESC
  `);
  res.json(rows);
});

export const getStock = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT blood_type AS type, units_available AS units, status FROM blood_stock_status ORDER BY blood_type"
  );
  res.json(rows);
});

// Powers the "System Health" pill at the top of the dashboard. Shares the
// same live check as /api/reports/system-health so the two pages can never
// disagree about which of the three states is currently showing.
export const getHealth = asyncHandler(async (req, res) => {
  res.json(await getLiveSystemHealth());
});

export const getArrivals = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const { rows } = await pool.query(
    `SELECT d.name, d.blood_type AS "bloodType", d.avatar_url AS avatar, a.arrived_at AS "arrivedAt"
     FROM donor_arrivals a
     JOIN donors d ON d.id = a.donor_id
     ORDER BY a.arrived_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});
