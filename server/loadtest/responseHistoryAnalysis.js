// Response history, new-donor position and request starvation analysis
// (thesis revision matrix: "Define how donor response history is measured,
// and assess new-donor disadvantage and lower-priority request starvation").
//
// Runs the production ranking and crediting code — rankDonorsByResponseTime
// (services/notifications.service.js) and compareRequestsForCredit
// (utils/requestPriority.js) — on simulated data. Seeded, so every run gives
// the same numbers. No database needed.
//
//   node loadtest/responseHistoryAnalysis.js            # tables to stdout
//   node loadtest/responseHistoryAnalysis.js --json out.json
//
// How response history is measured in production
// -----------------------------------------------
// When staff record a donation, the donation is credited to one open request
// of the same blood type at that hospital (compareRequestsForCredit: STAT,
// then ASAP, then Routine; oldest first within a tier) and the donor's
// arrival row (donor_arrivals) is linked to it. A donor's response time for
// that arrival is arrived_at (check-in time) minus the request's created_at.
// Their response history is the average over all their linked arrivals.
// Donors with no linked arrival use FALLBACK_RESPONSE_MINUTES (60). When a
// broadcast goes out, matching eligible donors are ranked by that average,
// ascending; ties go to the donor who has gone longest without donating.

import { writeFileSync } from "node:fs";
import { rankDonorsByResponseTime, FALLBACK_RESPONSE_MINUTES } from "../src/services/notifications.service.js";
import { compareRequestsForCredit } from "../src/utils/requestPriority.js";
import { MinHeap } from "../src/utils/minHeap.js";

// --- seeded random numbers (mulberry32) -----------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const exp = (r, mean) => -Math.log(1 - r()) * mean;
// Log-normal with a given median (minutes) and spread.
const logNormal = (r, median, sigma = 0.8) => {
  const u1 = r() || 1e-12;
  const u2 = r();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return median * Math.exp(sigma * z);
};
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// --- Part 1: where does a new donor land in the ranking? -------------------
// Pool of 1,000 matching donors, a share of them with response history drawn
// from a log-normal with the given median, the rest new (no history).
function newDonorPosition({ medianHistoryMinutes, shareWithHistory, poolSize = 1000, seed = 1 }) {
  const r = rng(seed);
  const donors = [];
  const avg = new Map();
  for (let i = 0; i < poolSize; i++) {
    const id = `d${i}`;
    const hasHistory = r() < shareWithHistory;
    const lastDonationAt = r() < 0.5 ? null : new Date(Date.UTC(2026, 0, 1) + Math.floor(r() * 300) * 86400000);
    donors.push({ id, donor_code: id, lastDonationAt, isNew: !hasHistory });
    if (hasHistory) avg.set(id, logNormal(r, medianHistoryMinutes));
  }
  const ranked = rankDonorsByResponseTime(donors, avg);
  const newPositions = [];
  ranked.forEach((entry, i) => {
    if (entry.donor.isNew) newPositions.push((i + 1) / ranked.length);
  });
  const withHistory = ranked.filter((e) => !e.donor.isNew);
  const fasterThanFallback = withHistory.filter((e) => e.avgResponseMinutes < FALLBACK_RESPONSE_MINUTES).length;
  return {
    medianHistoryMinutes,
    shareWithHistory,
    poolSize,
    newDonors: newPositions.length,
    newDonorMedianPercentile: round(100 * pct(newPositions.sort((a, b) => a - b), 0.5)),
    donorsWithHistoryRankedAheadOfNew: fasterThanFallback,
    shareOfHistoryDonorsAheadOfNew: round((100 * fasterThanFallback) / Math.max(1, withHistory.length)),
  };
}

// --- Part 2: does crediting starve Routine requests? ----------------------
// One hospital, one blood type, 60 simulated days. Requests arrive at random
// (priority mix from the live database: 36 STAT, 17 ASAP, 8 Routine of 61),
// each needing 1–3 units. Donations arrive at random. Each donation is
// credited to one open request with the production rule (or, for
// comparison, strict first-come-first-served). A request is "covered" once
// it has as many credited donations as units needed.
const PRIORITY_MIX = [
  ["EMERGENCY", 36 / 61],
  ["URGENT", 17 / 61],
  ["NORMAL", 8 / 61],
];
function pickPriority(r) {
  let x = r();
  for (const [p, w] of PRIORITY_MIX) {
    if ((x -= w) < 0) return p;
  }
  return "NORMAL";
}
const fifo = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

function simulateCrediting({ supplyRatio, rule, days = 60, requestsPerDay = 4, seed = 7 }) {
  const r = rng(seed);
  const horizon = days * 1440;
  const meanUnits = 2; // 1–3 uniform
  const donationsPerDay = requestsPerDay * meanUnits * supplyRatio;
  const events = [];
  for (let t = exp(r, 1440 / requestsPerDay); t < horizon; t += exp(r, 1440 / requestsPerDay)) {
    events.push({ t, kind: "request", priority: pickPriority(r), units: 1 + Math.floor(r() * 3) });
  }
  for (let t = exp(r, 1440 / donationsPerDay); t < horizon; t += exp(r, 1440 / donationsPerDay)) {
    events.push({ t, kind: "donation" });
  }
  events.sort((a, b) => a.t - b.t);

  const open = [];
  const all = [];
  const compare = rule === "production" ? compareRequestsForCredit : fifo;
  for (const ev of events) {
    if (ev.kind === "request") {
      const req = { priority: ev.priority, createdAt: ev.t, unitsNeeded: ev.units, credited: 0, coveredAt: null };
      open.push(req);
      all.push(req);
      continue;
    }
    // Same as completeAppointment: build a min-heap of the open requests and
    // credit the donation to extractMin().
    const heap = new MinHeap(compare);
    for (const req of open) heap.insert(req);
    const target = heap.extractMin();
    if (!target) continue;
    target.credited++;
    if (target.credited >= target.unitsNeeded) {
      target.coveredAt = ev.t;
      open.splice(open.indexOf(target), 1);
    }
  }

  // Only requests old enough to have had a fair chance (created in the first
  // 50 of 60 days) count toward the waiting-time figures.
  const cutoff = horizon - 10 * 1440;
  const byPriority = {};
  for (const [p] of PRIORITY_MIX) {
    const reqs = all.filter((q) => q.priority === p && q.createdAt < cutoff);
    const waits = reqs.filter((q) => q.coveredAt != null).map((q) => (q.coveredAt - q.createdAt) / 60).sort((a, b) => a - b);
    byPriority[p] = {
      requests: reqs.length,
      coveredPct: round((100 * waits.length) / Math.max(1, reqs.length)),
      medianHours: round(pct(waits, 0.5)),
      p95Hours: round(pct(waits, 0.95)),
    };
  }
  return { rule, supplyRatio, byPriority };
}

// --- run -------------------------------------------------------------------
const part1 = [
  // Live database (2026-11-06): 2 donors with history, averages 1,430.6 and
  // 8,613.8 minutes; 32 app donors. Scaled here to a 1,000-donor pool.
  newDonorPosition({ medianHistoryMinutes: 1430.6, shareWithHistory: 2 / 32 }),
  newDonorPosition({ medianHistoryMinutes: 30, shareWithHistory: 0.5 }),
  newDonorPosition({ medianHistoryMinutes: 60, shareWithHistory: 0.5 }),
  newDonorPosition({ medianHistoryMinutes: 240, shareWithHistory: 0.5 }),
  newDonorPosition({ medianHistoryMinutes: 30, shareWithHistory: 0.9 }),
];

const part2 = [];
for (const supplyRatio of [0.8, 1.0, 1.2, 1.5]) {
  for (const rule of ["production", "fifo"]) part2.push(simulateCrediting({ supplyRatio, rule }));
}

const label = { EMERGENCY: "STAT", URGENT: "ASAP", NORMAL: "Routine" };
console.log(`Fallback for donors with no history: ${FALLBACK_RESPONSE_MINUTES} min\n`);
console.log("Part 1 — new donors' position in a 1,000-donor ranking (1 = first)");
console.log("history median (min) | share with history | new donors | new donors' median position | history donors ranked ahead of new");
for (const p of part1) {
  console.log(
    `${String(p.medianHistoryMinutes).padStart(20)} | ${String(round(100 * p.shareWithHistory) + "%").padStart(18)} | ${String(p.newDonors).padStart(10)} | ${String(p.newDonorMedianPercentile + "%").padStart(27)} | ${p.donorsWithHistoryRankedAheadOfNew} (${p.shareOfHistoryDonorsAheadOfNew}%)`
  );
}
console.log("\nPart 2 — hours until a request has enough credited donations (60 simulated days, 4 requests/day)");
console.log("supply/demand | rule       | priority | requests | covered | median h | 95th pct h");
for (const s of part2) {
  for (const [p, v] of Object.entries(s.byPriority)) {
    console.log(
      `${String(s.supplyRatio).padStart(13)} | ${s.rule.padEnd(10)} | ${label[p].padEnd(8)} | ${String(v.requests).padStart(8)} | ${String(v.coveredPct + "%").padStart(7)} | ${String(v.medianHours).padStart(8)} | ${String(v.p95Hours).padStart(10)}`
    );
  }
}

const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx !== -1) {
  writeFileSync(
    process.argv[jsonIdx + 1],
    JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, fallbackMinutes: FALLBACK_RESPONSE_MINUTES, part1, part2 }, null, 2)
  );
}
