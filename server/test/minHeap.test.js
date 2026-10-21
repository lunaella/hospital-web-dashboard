// Tests for utils/minHeap.js and the two places it decides something:
// ranking donors for a broadcast (notifications.service.js) and crediting a
// donor's arrival to an open request (donors.controller.js). Run with
// `npm test` from server/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MinHeap } from "../src/utils/minHeap.js";
import { rankDonorsByResponseTime } from "../src/services/notifications.service.js";

// Small seeded random generator, so a failure can be reproduced.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Every parent is <= its children: the property the heap depends on.
function assertHeapInvariant(heap) {
  const a = heap.items;
  for (let i = 0; i < a.length; i++) {
    for (const child of [2 * i + 1, 2 * i + 2]) {
      if (child < a.length) assert.ok(heap.compare(a[i], a[child]) <= 0, `parent ${i} > child ${child}`);
    }
  }
}

test("empty heap", () => {
  const heap = new MinHeap();
  assert.equal(heap.size, 0);
  assert.equal(heap.peek(), undefined);
  assert.equal(heap.extractMin(), undefined);
});

test("single item", () => {
  const heap = new MinHeap();
  heap.insert(7);
  assert.equal(heap.peek(), 7);
  assert.equal(heap.extractMin(), 7);
  assert.equal(heap.size, 0);
});

test("peek returns the minimum without removing it", () => {
  const heap = new MinHeap();
  for (const n of [5, 3, 9, 1, 4]) heap.insert(n);
  assert.equal(heap.peek(), 1);
  assert.equal(heap.size, 5);
});

test("duplicates and negatives come out in order", () => {
  const heap = new MinHeap();
  for (const n of [3, -1, 3, 0, -1, 2]) heap.insert(n);
  assert.deepEqual(heap.drainToSortedArray(), [-1, -1, 0, 2, 3, 3]);
});

test("1,000 random lists drain in the same order as a sort", () => {
  const rand = rng(42);
  for (let t = 0; t < 1000; t++) {
    const n = Math.floor(rand() * 200);
    const values = Array.from({ length: n }, () => Math.floor(rand() * 100) - 50);
    const heap = new MinHeap();
    for (const v of values) heap.insert(v);
    assertHeapInvariant(heap);
    assert.deepEqual(heap.drainToSortedArray(), [...values].sort((a, b) => a - b));
  }
});

test("heap stays valid through mixed inserts and extracts", () => {
  const rand = rng(7);
  const heap = new MinHeap();
  const mirror = [];
  for (let step = 0; step < 5000; step++) {
    if (mirror.length === 0 || rand() < 0.6) {
      const v = Math.floor(rand() * 1000);
      heap.insert(v);
      mirror.push(v);
    } else {
      mirror.sort((a, b) => a - b);
      assert.equal(heap.extractMin(), mirror.shift());
    }
    assertHeapInvariant(heap);
    assert.equal(heap.size, mirror.length);
  }
});

test("custom comparator orders objects", () => {
  const heap = new MinHeap((a, b) => a.minutes - b.minutes);
  for (const [name, minutes] of [["B", 30], ["A", 12], ["C", 45]]) heap.insert({ name, minutes });
  assert.deepEqual(heap.drainToSortedArray().map((x) => x.name), ["A", "B", "C"]);
});

// ---- Broadcast ranking: fastest historical responders are notified first.

const donor = (id, lastDonationAt = null) => ({ id, lastDonationAt });

test("donors are ranked by average response time, fastest first", () => {
  const donors = [donor("slow"), donor("fast"), donor("mid")];
  const avg = new Map([["slow", 50], ["fast", 12], ["mid", 25]]);
  const ranked = rankDonorsByResponseTime(donors, avg);
  assert.deepEqual(ranked.map((r) => r.donor.id), ["fast", "mid", "slow"]);
  assert.deepEqual(ranked.map((r) => r.avgResponseMinutes), [12, 25, 50]);
});

test("a donor with no history is placed at the 60-minute fallback", () => {
  const ranked = rankDonorsByResponseTime([donor("new"), donor("quick"), donor("late")], new Map([["quick", 20], ["late", 90]]));
  assert.deepEqual(ranked.map((r) => r.donor.id), ["quick", "new", "late"]);
  assert.equal(ranked[1].avgResponseMinutes, 60);
});

test("ties go to the donor who is most overdue (never donated first)", () => {
  const donors = [donor("recent", "2026-09-01T00:00:00Z"), donor("never"), donor("older", "2026-03-01T00:00:00Z")];
  const ranked = rankDonorsByResponseTime(donors, new Map());
  assert.deepEqual(ranked.map((r) => r.donor.id), ["never", "older", "recent"]);
});

// Donors who tie on both keys (same average and same last donation) may
// come out in either order, so this compares the ranking keys, not ids.
test("2,000 donors are ranked in the same order as a full sort", () => {
  const rand = rng(99);
  const donors = Array.from({ length: 2000 }, (_, i) => donor(`d${i}`, rand() < 0.3 ? null : new Date(Date.UTC(2025, 0, 1) + Math.floor(rand() * 600) * 86400000).toISOString()));
  const avg = new Map(donors.filter(() => rand() < 0.7).map((d) => [d.id, Math.round(rand() * 120)]));
  const rankMs = (d) => (d.lastDonationAt ? new Date(d.lastDonationAt).getTime() : -1);
  const key = (d) => `${avg.get(d.id) ?? 60}|${rankMs(d)}`;
  const ranked = rankDonorsByResponseTime(donors, avg).map((r) => key(r.donor));
  const expected = [...donors]
    .sort((a, b) => (avg.get(a.id) ?? 60) - (avg.get(b.id) ?? 60) || rankMs(a) - rankMs(b))
    .map(key);
  assert.equal(ranked.length, 2000);
  assert.deepEqual(ranked, expected);
});

// ---- Arrival crediting: the same comparator as completeAppointment.

const priorityRank = { EMERGENCY: 0, URGENT: 1 };
const requestCompare = (a, b) => {
  const rankA = priorityRank[a.priority] ?? 2;
  const rankB = priorityRank[b.priority] ?? 2;
  if (rankA !== rankB) return rankA - rankB;
  return new Date(a.createdAt) - new Date(b.createdAt);
};

test("an arrival is credited to Emergency before Urgent before Normal", () => {
  const heap = new MinHeap(requestCompare);
  heap.insert({ code: "N", priority: "NORMAL", createdAt: "2026-10-01T08:00:00Z" });
  heap.insert({ code: "U", priority: "URGENT", createdAt: "2026-10-01T08:00:00Z" });
  heap.insert({ code: "E", priority: "EMERGENCY", createdAt: "2026-10-01T09:00:00Z" });
  assert.equal(heap.extractMin().code, "E");
  assert.equal(heap.extractMin().code, "U");
  assert.equal(heap.extractMin().code, "N");
});

test("within the same priority, the oldest request is credited first", () => {
  const heap = new MinHeap(requestCompare);
  heap.insert({ code: "newer", priority: "URGENT", createdAt: "2026-10-02T08:00:00Z" });
  heap.insert({ code: "older", priority: "URGENT", createdAt: "2026-10-01T08:00:00Z" });
  assert.equal(heap.extractMin().code, "older");
});
