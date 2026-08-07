import { pool } from "../db/pool.js";
import { ensureRedisConnected } from "../db/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getLiveSystemHealth } from "../utils/systemHealth.js";
import { hospitalIdParam } from "../utils/hospitalScope.js";

const STATS_CACHE_TTL_SECONDS = 8; // short TTL: keeps concurrent admins off Postgres without serving stale data long

// "Active Donors" (Arrived vs In-Transit) has no dedicated dispatch table
// yet — this approximates it from donor_arrivals (arrived) and confirmed
// appointments scheduled for today that haven't arrived yet (in-transit).
// Revisit once a real dispatch/tracking table exists.
//
// Every query here is scoped to one hospital via ?hospitalId=<uuid>, or
// aggregated across every hospital when it's omitted/"all" — the cache key
// has to vary the same way, or switching hospitals in the UI would just
// serve back whichever hospital happened to populate the cache first.
export const getStats = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);
  const cacheKey = `dashboard:stats:${hospitalId ?? "all"}`;

  const redis = await ensureRedisConnected();
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const hospitalClause = hospitalId ? "AND hospital_id = $1" : "";
  const params = hospitalId ? [hospitalId] : [];

  const [codeRed, unitsNeeded, arrivedToday, inTransitToday, fulfillmentRate] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS count FROM blood_requests WHERE priority = 'EMERGENCY' AND status IN ('OPEN','PARTIALLY_FULFILLED') ${hospitalClause}`,
      params
    ),
    pool.query(
      `SELECT coalesce(sum(units_needed - units_fulfilled), 0)::int AS total FROM blood_requests WHERE status IN ('OPEN','PARTIALLY_FULFILLED') ${hospitalClause}`,
      params
    ),
    pool.query(
      `SELECT count(*)::int AS count FROM donor_arrivals WHERE arrived_at >= now() - INTERVAL '24 hours' ${hospitalClause}`,
      params
    ),
    pool.query(
      `SELECT count(*)::int AS count FROM appointments WHERE status = 'confirmed' AND scheduled_at::date = current_date ${hospitalClause}`,
      params
    ),
    pool.query(
      `SELECT coalesce(avg(units_fulfilled::numeric / NULLIF(units_needed, 0)) * 100, 0)::numeric(5,1) AS pct
       FROM blood_requests
       WHERE created_at >= now() - INTERVAL '24 hours' ${hospitalClause}`,
      params
    ),
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

  await redis.set(cacheKey, JSON.stringify(payload), "EX", STATS_CACHE_TTL_SECONDS);
  res.json(payload);
});

// Live Match Monitoring: active broadcasts, most urgent/newest first.
export const getMonitoring = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);
  const hospitalClause = hospitalId ? "AND hospital_id = $1" : "";
  const params = hospitalId ? [hospitalId] : [];

  const { rows } = await pool.query(
    `SELECT
      request_code AS id,
      blood_type AS "bloodType",
      priority,
      ward,
      units_needed AS "unitsNeeded",
      units_fulfilled AS "unitsFulfilled",
      round(units_fulfilled::numeric / NULLIF(units_needed, 0) * 100)::int AS pct,
      extract(epoch FROM (now() - created_at))::int AS seconds_open
    FROM blood_requests
    WHERE status IN ('OPEN', 'PARTIALLY_FULFILLED') ${hospitalClause}
    ORDER BY
      CASE priority WHEN 'EMERGENCY' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END,
      created_at DESC`,
    params
  );
  res.json(rows);
});

export const getStock = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);

  if (hospitalId) {
    const { rows } = await pool.query(
      `SELECT bss.blood_type AS type, bss.units_available AS units, bss.status,
              bi.critical_threshold AS "criticalThreshold", bi.low_threshold AS "lowThreshold"
       FROM blood_stock_status bss
       JOIN blood_inventory bi ON bi.hospital_id = bss.hospital_id AND bi.blood_type = bss.blood_type
       WHERE bss.hospital_id = $1
       ORDER BY bss.blood_type`,
      [hospitalId]
    );
    return res.json(rows);
  }

  // "All Hospitals": sum units and thresholds across every hospital per
  // blood type, then re-derive CRITICAL/LOW/STABLE from those combined
  // thresholds. This is a system-wide rollup, not any one hospital's real
  // thresholds — the closest meaningful "total supply" view when no single
  // hospital is selected.
  const { rows } = await pool.query(`
    SELECT
      blood_type AS type,
      sum(units_available)::int AS units,
      CASE
        WHEN sum(units_available) <= sum(critical_threshold) THEN 'CRITICAL'
        WHEN sum(units_available) <= sum(low_threshold) THEN 'LOW'
        ELSE 'STABLE'
      END::text AS status
    FROM blood_inventory
    GROUP BY blood_type
    ORDER BY blood_type
  `);
  res.json(rows);
});

// Lets an admin tune when a blood type flips to LOW/CRITICAL for a specific
// hospital, instead of living with the seeded defaults forever. Thresholds
// are per (hospital, blood type) — there's no single "critical" number that
// makes sense across every hospital or every blood type (a hospital that
// transfuses 20 O+ units/day needs a different bar than one that transfuses
// 2/day), so this intentionally doesn't touch the "All Hospitals" aggregate
// view, which is a derived rollup, not a row an admin can edit directly.
export const updateStockThreshold = asyncHandler(async (req, res) => {
  const { bloodType } = req.params;
  const { hospitalId, criticalThreshold, lowThreshold } = req.body;

  if (!hospitalId) {
    return res.status(400).json({ error: "hospitalId is required." });
  }
  const critical = Number(criticalThreshold);
  const low = Number(lowThreshold);
  if (!Number.isInteger(critical) || critical < 0 || !Number.isInteger(low) || low < 0) {
    return res.status(400).json({ error: "criticalThreshold and lowThreshold must be non-negative whole numbers." });
  }
  if (critical > low) {
    return res.status(400).json({ error: "criticalThreshold cannot be higher than lowThreshold." });
  }

  const { rows } = await pool.query(
    `UPDATE blood_inventory
     SET critical_threshold = $1, low_threshold = $2
     WHERE hospital_id = $3 AND blood_type = $4
     RETURNING blood_type AS type, units_available AS units, critical_threshold AS "criticalThreshold", low_threshold AS "lowThreshold"`,
    [critical, low, hospitalId, bloodType]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "No inventory row for that hospital and blood type." });
  }
  res.json(rows[0]);
});

// Powers the "System Health" pill at the top of the dashboard. Shares the
// same live check as /api/reports/system-health so the two pages can never
// disagree about which of the three states is currently showing. This is
// infrastructure health, not per-hospital data, so it isn't hospital-scoped.
export const getHealth = asyncHandler(async (req, res) => {
  res.json(await getLiveSystemHealth());
});

export const getArrivals = asyncHandler(async (req, res) => {
  const hospitalId = hospitalIdParam(req);
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const hospitalClause = hospitalId ? "AND a.hospital_id = $2" : "";
  const params = hospitalId ? [limit, hospitalId] : [limit];

  const { rows } = await pool.query(
    `SELECT d.name, d.blood_type AS "bloodType", d.avatar_url AS avatar, a.arrived_at AS "arrivedAt"
     FROM donor_arrivals a
     JOIN donors d ON d.id = a.donor_id
     WHERE true ${hospitalClause}
     ORDER BY a.arrived_at DESC
     LIMIT $1`,
    params
  );
  res.json(rows);
});
