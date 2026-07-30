import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getLiveSystemHealth } from "../utils/systemHealth.js";

// Donor Response Time chart: average minutes-to-resolve per day, last 7 days.
export const getResponseTimeSeries = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      d::date AS date,
      coalesce(round(avg(
        extract(epoch FROM (r.resolved_at - r.created_at)) / 60
      )::numeric, 1), NULL) AS "avgMinutes"
    FROM generate_series(current_date - INTERVAL '6 days', current_date, INTERVAL '1 day') d
    LEFT JOIN blood_requests r
      ON r.resolved_at IS NOT NULL AND r.resolved_at::date = d::date
    GROUP BY d
    ORDER BY d
  `);
  res.json(rows);
});

// Recent Fulfillment Log
export const getFulfillmentLog = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { rows } = await pool.query(
    `SELECT
       request_code AS "reqId",
       priority,
       priority = 'EMERGENCY' AS "hasEllipse",
       blood_type AS blood,
       CASE
         WHEN resolved_at IS NOT NULL THEN round(extract(epoch FROM (resolved_at - created_at)) / 60)::text || ' m'
         ELSE round(extract(epoch FROM (now() - created_at)) / 60)::text || ' m'
       END AS time,
       system_rating AS rating
     FROM blood_requests
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

// Fulfillment Rate donut: avg(units_fulfilled/units_needed) grouped by
// priority tier, across all requests (not just resolved ones) so partially
// fulfilled emergencies still count against the rate.
export const getFulfillmentBreakdown = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      priority,
      round(avg(units_fulfilled::numeric / NULLIF(units_needed, 0)) * 100)::int AS pct
    FROM blood_requests
    GROUP BY priority
  `);
  const byPriority = Object.fromEntries(rows.map((r) => [r.priority, r.pct]));
  res.json({
    emergency: byPriority.EMERGENCY ?? 0,
    urgent: byPriority.URGENT ?? 0,
    normal: byPriority.NORMAL ?? 0,
  });
});

// Live-checked, not read from the old static system_health_snapshots table
// (that table only ever had the one seeded demo row and nothing wrote to
// it). See utils/systemHealth.js for how OPTIMAL/DEGRADED/CRITICAL is
// derived from real Postgres/Redis reachability and latency.
export const getSystemHealth = asyncHandler(async (req, res) => {
  res.json(await getLiveSystemHealth());
});

// KPI cards: Units Processed, Mean Response Time, Active Donors Reach —
// each compared against the prior 24h window for the trend indicator.
export const getKpis = asyncHandler(async (req, res) => {
  const [unitsProcessed, meanResponseTime, activeDonors] = await Promise.all([
    pool.query(`
      SELECT
        coalesce(sum(units_fulfilled) FILTER (WHERE created_at >= now() - INTERVAL '24 hours'), 0)::int AS current,
        coalesce(sum(units_fulfilled) FILTER (WHERE created_at >= now() - INTERVAL '48 hours' AND created_at < now() - INTERVAL '24 hours'), 0)::int AS previous
      FROM blood_requests
    `),
    pool.query(`
      SELECT
        round(avg(extract(epoch FROM (resolved_at - created_at)) / 60) FILTER (WHERE resolved_at >= now() - INTERVAL '24 hours'), 1) AS current,
        round(avg(extract(epoch FROM (resolved_at - created_at)) / 60) FILTER (WHERE resolved_at >= now() - INTERVAL '48 hours' AND resolved_at < now() - INTERVAL '24 hours'), 1) AS previous
      FROM blood_requests
      WHERE resolved_at IS NOT NULL
    `),
    pool.query(`
      SELECT
        count(DISTINCT donor_id) FILTER (WHERE arrived_at >= now() - INTERVAL '24 hours')::int AS current,
        count(DISTINCT donor_id) FILTER (WHERE arrived_at >= now() - INTERVAL '48 hours' AND arrived_at < now() - INTERVAL '24 hours')::int AS previous
      FROM donor_arrivals
    `),
  ]);

  function withTrend(current, previous) {
    const c = Number(current ?? 0);
    const p = Number(previous ?? 0);
    const pct = p === 0 ? null : Math.round(((c - p) / p) * 1000) / 10;
    return { value: c, trendPct: pct };
  }

  res.json({
    unitsProcessed: withTrend(unitsProcessed.rows[0].current, unitsProcessed.rows[0].previous),
    meanResponseTimeMinutes: withTrend(meanResponseTime.rows[0].current, meanResponseTime.rows[0].previous),
    activeDonorsReach: withTrend(activeDonors.rows[0].current, activeDonors.rows[0].previous),
  });
});

// Demand Forecast card: per-blood-type units requested in the last 48h vs
// the 48h before that. This is a simple trend-continuation heuristic (the
// most recent measured swing is assumed to persist) rather than a real
// statistical forecasting model — an honest, explainable choice appropriate
// for this system's data volume. The "advisory" pick leans on actual
// current stock levels (blood_stock_status), not just the trend, so it
// still makes sense even when demand has been flat.
export const getDemandForecast = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    WITH types AS (
      SELECT unnest(enum_range(NULL::blood_type)) AS blood_type
    ),
    recent AS (
      SELECT blood_type, coalesce(sum(units_needed), 0)::int AS units
      FROM blood_requests
      WHERE created_at >= now() - INTERVAL '48 hours'
      GROUP BY blood_type
    ),
    previous AS (
      SELECT blood_type, coalesce(sum(units_needed), 0)::int AS units
      FROM blood_requests
      WHERE created_at >= now() - INTERVAL '96 hours' AND created_at < now() - INTERVAL '48 hours'
      GROUP BY blood_type
    )
    SELECT
      t.blood_type AS "bloodType",
      coalesce(r.units, 0) AS "recentUnits",
      coalesce(p.units, 0) AS "previousUnits",
      s.units_available AS "unitsAvailable",
      s.status AS "stockStatus"
    FROM types t
    LEFT JOIN recent r ON r.blood_type = t.blood_type
    LEFT JOIN previous p ON p.blood_type = t.blood_type
    LEFT JOIN blood_stock_status s ON s.blood_type = t.blood_type
    ORDER BY t.blood_type
  `);

  const withTrend = rows.map((r) => ({
    ...r,
    pctChange: r.previousUnits > 0 ? Math.round(((r.recentUnits - r.previousUnits) / r.previousUnits) * 100) : null,
    isNewDemand: r.previousUnits === 0 && r.recentUnits > 0,
  }));

  const rising = withTrend
    .filter((r) => r.pctChange != null && r.pctChange > 0)
    .sort((a, b) => b.pctChange - a.pctChange);
  const emerging = withTrend.filter((r) => r.isNewDemand).sort((a, b) => b.recentUnits - a.recentUnits);

  const headline = rising[0]
    ? { kind: "increase", bloodType: rising[0].bloodType, pctChange: rising[0].pctChange }
    : emerging[0]
      ? { kind: "new", bloodType: emerging[0].bloodType, units: emerging[0].recentUnits }
      : null;

  const advisoryTypes = withTrend
    .filter((r) => r.stockStatus === "CRITICAL" || r.stockStatus === "LOW")
    .sort((a, b) => {
      if (a.stockStatus !== b.stockStatus) return a.stockStatus === "CRITICAL" ? -1 : 1;
      return (b.pctChange ?? 0) - (a.pctChange ?? 0);
    })
    .slice(0, 2)
    .map((r) => r.bloodType);

  res.json({ headline, advisoryTypes });
});
