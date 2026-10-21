// Tests for utils/sendQueue.js and the batched senders built on it
// (sendBulkSms in utils/sms.js, sendEmailBatch in utils/email.js). The
// providers are replaced with a stub fetch, so nothing is really sent.
// Run with `npm test` from server/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk, createRateLimiter, retryAfterMs, withRetry } from "../src/utils/sendQueue.js";

// env.js reads these at import time.
process.env.JWT_SECRET ||= "test-secret";
process.env.SEMAPHORE_API_KEY = "test-key";
process.env.RESEND_API_KEY = "test-key";
process.env.SEMAPHORE_CALLS_PER_MINUTE = "1000";
process.env.RESEND_CALLS_PER_SECOND = "1000";
const { sendBulkSms, sendSms } = await import("../src/utils/sms.js");
const { sendEmailBatch } = await import("../src/utils/email.js");

// Replaces fetch for one test; `handler(url, init, callNumber)` returns
// { status, body, headers }.
function stubFetch(t, handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const { status = 200, body = {}, headers = {} } = await handler(String(url), init, calls.length);
    return new Response(JSON.stringify(body), { status, headers });
  };
  t.after(() => (globalThis.fetch = real));
  return calls;
}

const numbersOf = (init) => new URLSearchParams(init.body).get("number").split(",");

test("rate limiter lets at most `limit` calls start per window", async () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 200 });
  const t0 = Date.now();
  const starts = [];
  await Promise.all(Array.from({ length: 7 }, () => limiter.acquire().then(() => starts.push(Date.now() - t0))));
  starts.sort((a, b) => a - b);
  // Any 3 consecutive starts plus the next one must span at least a window.
  for (let i = 3; i < starts.length; i++) assert.ok(starts[i] - starts[i - 3] >= 195, `call ${i} started too early`);
  assert.ok(starts[6] >= 390, "7 calls at 3 per 200 ms need at least two full windows");
});

test("rate limiter serves callers in the order they asked", async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 20 });
  const order = [];
  await Promise.all([1, 2, 3, 4].map((n) => limiter.acquire().then(() => order.push(n))));
  assert.deepEqual(order, [1, 2, 3, 4]);
});

test("withRetry retries temporary failures and stops on success", async () => {
  let n = 0;
  const out = await withRetry(async () => (++n < 3 ? { ok: false, retryable: true, retryAfterMs: 5 } : { ok: true }), { retries: 4 });
  assert.equal(out.ok, true);
  assert.equal(out.attempts, 3);
});

test("withRetry does not retry a permanent failure", async () => {
  let n = 0;
  const out = await withRetry(async () => (n++, { ok: false, retryable: false, error: "bad number" }), { retries: 4 });
  assert.equal(out.ok, false);
  assert.equal(n, 1);
});

test("withRetry gives up after the last retry", async () => {
  const out = await withRetry(async () => ({ ok: false, retryable: true, retryAfterMs: 1, error: "busy" }), { retries: 2 });
  assert.equal(out.ok, false);
  assert.equal(out.attempts, 3);
});

test("Retry-After is read as seconds", () => {
  assert.equal(retryAfterMs(new Headers({ "retry-after": "3" })), 3000);
  assert.equal(retryAfterMs(new Headers()), null);
});

test("chunk splits a list into batches of the given size", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("sendBulkSms sends 2,500 numbers in 3 calls of up to 1,000, in order", async (t) => {
  const calls = stubFetch(t, (url, init) => ({ body: numbersOf(init).map((recipient, i) => ({ message_id: i + 1, recipient })) }));
  const recipients = Array.from({ length: 2500 }, (_, i) => `+63917${String(i).padStart(7, "0")}`);
  const results = await sendBulkSms(recipients, "Test");
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => numbersOf(c.init).length), [1000, 1000, 500]);
  assert.equal(numbersOf(calls[0].init)[0], "639170000000"); // first in the given (min-heap) order
  assert.equal(results.length, 2500);
  assert.ok(results.every((r) => r.ok));
});

test("sendBulkSms retries a throttled call and then succeeds", async (t) => {
  const calls = stubFetch(t, (url, init, n) =>
    n === 1
      ? { status: 429, body: { message: "Too many requests." }, headers: { "Retry-After": "0" } }
      : { body: numbersOf(init).map((recipient, i) => ({ message_id: i + 1, recipient })) }
  );
  const results = await sendBulkSms(["09170000001", "09170000002"], "Test");
  assert.equal(calls.length, 2);
  assert.ok(results.every((r) => r.ok));
});

test("sendBulkSms marks every number failed when retries run out, and says so", async (t) => {
  stubFetch(t, () => ({ status: 429, body: { message: "Too many requests." }, headers: { "Retry-After": "0" } }));
  const results = await sendBulkSms(["09170000001", "09170000002"], "Test", { retries: 2 });
  assert.ok(results.every((r) => !r.ok && r.error === "Too many requests. (after 3 tries)"));
});

test("sendBulkSms does not retry a rejected API key", async (t) => {
  const calls = stubFetch(t, () => ({ status: 401, body: { message: "Invalid API key." } }));
  const results = await sendBulkSms(["09170000001"], "Test");
  assert.equal(calls.length, 1);
  assert.equal(results[0].error, "Invalid API key.");
});

test("sendBulkSms keeps donors with no phone number as failed, without calling for them", async (t) => {
  const calls = stubFetch(t, (url, init) => ({ body: numbersOf(init).map((recipient, i) => ({ message_id: 10 + i, recipient })) }));
  const results = await sendBulkSms(["09170000001", null, "09170000003"], "Test");
  assert.equal(calls.length, 1);
  assert.deepEqual(numbersOf(calls[0].init), ["639170000001", "639170000003"]);
  assert.deepEqual(results.map((r) => r.ok), [true, false, true]);
  assert.equal(results[1].error, "No phone number on file for this donor.");
  assert.equal(results[2].messageId, 11);
});

test("sendSms still sends one text and returns one result", async (t) => {
  stubFetch(t, (url, init) => ({ body: [{ message_id: 7, recipient: numbersOf(init)[0] }] }));
  assert.deepEqual(await sendSms("09170000001", "Code 123456"), { ok: true, messageId: 7, error: null });
});

test("sendEmailBatch sends 250 emails in 3 calls of up to 100 and keeps the same key on retry", async (t) => {
  const keys = [];
  const calls = stubFetch(t, (url, init, n) => {
    keys.push(init.headers["Idempotency-Key"]);
    if (n === 2) return { status: 503, body: { message: "Busy" }, headers: { "Retry-After": "0" } };
    return { body: { data: JSON.parse(init.body).map((_, i) => ({ id: `e${n}-${i}` })) } };
  });
  const emails = Array.from({ length: 250 }, (_, i) => ({ to: `d${i}@test.local`, subject: "S", html: "<p>x</p>" }));
  const results = await sendEmailBatch(emails);
  assert.equal(calls.length, 4); // 3 batches + 1 retry of the second
  assert.ok(calls.every((c) => c.url.endsWith("/emails/batch")));
  assert.equal(keys[1], keys[2], "a retry must reuse the batch's idempotency key");
  assert.notEqual(keys[0], keys[1]);
  assert.ok(results.every((r) => r.ok));
  assert.equal(results[100].messageId, "e3-0");
});
