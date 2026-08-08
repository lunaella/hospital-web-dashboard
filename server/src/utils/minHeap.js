// A real binary min-heap (array-backed, 0-indexed: children of i are at
// 2i+1/2i+2, parent is at floor((i-1)/2)) — insert and extractMin are both
// O(log n), peek is O(1). Generic over any comparable key via `compareFn`,
// same convention as Array.prototype.sort: negative if a sorts before b.
//
// Used by notifications.service.js to rank donors matching a new broadcast
// by their historical average response time, so the fastest-typical
// responders are identified and notified first without fully sorting the
// whole matching-donor list up front.
export class MinHeap {
  constructor(compareFn = (a, b) => a - b) {
    this.items = [];
    this.compare = compareFn;
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  insert(value) {
    this.items.push(value);
    this.#bubbleUp(this.items.length - 1);
  }

  extractMin() {
    if (this.items.length === 0) return undefined;
    const min = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this.#bubbleDown(0);
    }
    return min;
  }

  // Drains the heap into a fully priority-ordered array — repeated
  // extractMin, O(n log n) total, same asymptotic cost as a sort but built
  // from genuine heap operations rather than delegating to Array#sort.
  drainToSortedArray() {
    const result = [];
    while (this.size > 0) result.push(this.extractMin());
    return result;
  }

  #bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.items[i], this.items[parent]) >= 0) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }

  #bubbleDown(i) {
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}
