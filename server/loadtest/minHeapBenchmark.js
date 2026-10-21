// Times the min-heap at growing sizes, to show insert/extract scale as
// O(log n), and times the real donor-ranking step for a broadcast.
//
//   node loadtest/minHeapBenchmark.js            # prints a table
//   node loadtest/minHeapBenchmark.js --json     # machine-readable
//
// Each size is run 7 times and the median is reported.

import { performance } from "node:perf_hooks";
import { MinHeap } from "../src/utils/minHeap.js";
import { rankDonorsByResponseTime } from "../src/services/notifications.service.js";

const SIZES = [100, 1_000, 10_000, 100_000, 1_000_000];
const DONOR_SIZES = [100, 1_000, 10_000, 100_000];
const RUNS = 7;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function time(fn) {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

function heapRun(n) {
  const rand = rng(n);
  const values = Array.from({ length: n }, () => rand());
  const inserts = [], extracts = [], first10 = [], sorts = [], sortFirst10 = [];
  for (let r = 0; r < RUNS; r++) {
    const heap = new MinHeap();
    inserts.push(time(() => { for (const v of values) heap.insert(v); }));
    // Who's next: the first 10 fastest, the way dispatch would pull them.
    first10.push(time(() => { for (let i = 0; i < 10; i++) heap.extractMin(); }));
    extracts.push(time(() => { while (heap.size) heap.extractMin(); }));
    let sorted;
    sorts.push(time(() => { sorted = [...values].sort((a, b) => a - b); }));
    sortFirst10.push(time(() => { [...values].sort((a, b) => a - b).slice(0, 10); }));
  }
  const insertMs = median(inserts);
  const extractMs = median(extracts) + median(first10);
  return {
    n,
    insertAllMs: insertMs,
    extractAllMs: extractMs,
    insertPerOpUs: (insertMs * 1000) / n,
    extractPerOpUs: (extractMs * 1000) / n,
    heapFirst10Ms: insertMs + median(first10),
    sortAllMs: median(sorts),
    sortFirst10Ms: median(sortFirst10),
    log2n: Math.log2(n),
  };
}

function donorRun(n) {
  const rand = rng(n + 1);
  const donors = Array.from({ length: n }, (_, i) => ({
    id: `d${i}`,
    lastDonationAt: rand() < 0.3 ? null : new Date(Date.UTC(2025, 0, 1) + Math.floor(rand() * 600) * 86400000).toISOString(),
  }));
  const avg = new Map(donors.filter(() => rand() < 0.7).map((d) => [d.id, rand() * 120]));
  const runs = [];
  for (let r = 0; r < RUNS; r++) runs.push(time(() => rankDonorsByResponseTime(donors, avg)));
  return { donors: n, rankMs: median(runs) };
}

// Warm up the JIT so the first size isn't penalized.
heapRun(10_000);
const heap = SIZES.map(heapRun);
const ranking = DONOR_SIZES.map(donorRun);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ node: process.version, runs: RUNS, heap, ranking }, null, 1));
} else {
  console.table(heap.map((h) => ({
    items: h.n, "insert all (ms)": h.insertAllMs.toFixed(2), "extract all (ms)": h.extractAllMs.toFixed(2),
    "insert µs/op": h.insertPerOpUs.toFixed(3), "extract µs/op": h.extractPerOpUs.toFixed(3),
    "heap top-10 (ms)": h.heapFirst10Ms.toFixed(2), "sort top-10 (ms)": h.sortFirst10Ms.toFixed(2),
  })));
  console.table(ranking.map((r) => ({ donors: r.donors, "rank for broadcast (ms)": r.rankMs.toFixed(2) })));
}
process.exit(0);
