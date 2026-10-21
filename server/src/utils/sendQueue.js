// Shared pacing and retry for calls to the SMS and email providers, so a
// large broadcast stays under their published rate limits (Semaphore: 120
// calls per minute on /messages; Resend: 10 requests per second per team)
// instead of firing every call at once and having the excess rejected.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// At most `limit` calls start in any rolling `windowMs`. Callers await
// acquire() before each call; waiting callers are served in arrival order,
// so a broadcast's batches go out in the min-heap order they were queued.
export function createRateLimiter({ limit, windowMs }) {
  const started = [];
  let queue = Promise.resolve();

  function acquire() {
    const turn = queue.then(async () => {
      for (;;) {
        const now = Date.now();
        while (started.length && now - started[0] >= windowMs) started.shift();
        if (started.length < limit) {
          started.push(now);
          return;
        }
        await sleep(windowMs - (now - started[0]) + 5);
      }
    });
    queue = turn.catch(() => {});
    return turn;
  }

  return { acquire };
}

// Retries `attempt()` while it reports a temporary failure. `attempt`
// resolves to { ok, retryable, retryAfterMs, ...result }; anything not
// retryable (bad number, bad API key) is returned straight away. Waits for
// the provider's Retry-After when it sends one, otherwise backs off
// 2 s, 4 s, 8 s ... capped at maxDelayMs.
export async function withRetry(attempt, { retries = 3, baseDelayMs = 2000, maxDelayMs = 30000 } = {}) {
  let result;
  let attempts = 0;
  for (let i = 0; i <= retries; i++) {
    attempts += 1;
    result = await attempt(i);
    if (result.ok || !result.retryable || i === retries) break;
    const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** i);
    await sleep(Math.min(maxDelayMs, result.retryAfterMs ?? backoff));
  }
  return { ...result, attempts };
}

// Retry-After is seconds (or an HTTP date); returns milliseconds or null.
export function retryAfterMs(headers) {
  const value = headers?.get?.("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

// HTTP statuses worth trying again: throttled, or the provider having a
// temporary problem.
export const isRetryableStatus = (status) => status === 429 || status >= 500;

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
