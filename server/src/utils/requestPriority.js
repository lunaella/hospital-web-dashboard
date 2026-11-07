// Order used to pick which open request a collected donation is credited
// to (completeAppointment, donors.controller.js): most urgent tier first
// (STAT, then ASAP, then Routine), then the oldest request within a tier.
// Shared with loadtest/responseHistoryAnalysis.js so the simulation runs
// the same rule as production.
const PRIORITY_RANK = { EMERGENCY: 0, URGENT: 1, NORMAL: 2 };

export function compareRequestsForCredit(a, b) {
  const rankA = PRIORITY_RANK[a.priority] ?? 2;
  const rankB = PRIORITY_RANK[b.priority] ?? 2;
  if (rankA !== rankB) return rankA - rankB;
  return new Date(a.createdAt) - new Date(b.createdAt);
}
