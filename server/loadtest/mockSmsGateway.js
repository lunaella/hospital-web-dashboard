// Stand-in for the Semaphore SMS API during TC-ST-02, so a 500-donor
// broadcast can be tested without sending (or paying for) real texts. It
// answers like Semaphore's POST /api/v4/messages (comma-separated numbers,
// up to 1,000 per call, one record per recipient), after a random delay,
// and counts what it received.
//
//   node loadtest/mockSmsGateway.js                                # every call accepted
//   MOCK_SMS_MODE=limited node loadtest/mockSmsGateway.js          # 120 calls per minute
//   MOCK_SMS_FAIL_FIRST=2 node loadtest/mockSmsGateway.js          # first 2 calls get 429
//
// "limited" works like Semaphore's documented limit: at most MOCK_SMS_LIMIT
// (default 120) calls per rolling minute, extra calls get HTTP 429 with a
// Retry-After header. MOCK_SMS_FAIL_FIRST throttles the first N calls
// regardless, to check that ResQ retries them.

import http from "node:http";

const PORT = Number(process.env.MOCK_SMS_PORT || 4200);
const MODE = process.env.MOCK_SMS_MODE || "unlimited";
const LIMIT = Number(process.env.MOCK_SMS_LIMIT || 120);
const FAIL_FIRST = Number(process.env.MOCK_SMS_FAIL_FIRST || 0);
const MIN_DELAY = 100;
const MAX_DELAY = 800;

let s;
let callTimes;
function reset() {
  s = { mode: MODE, limitPerMinute: MODE === "limited" ? LIMIT : null, failFirst: FAIL_FIRST, calls: 0, callsAccepted: 0, calls429: 0, maxNumbersInOneCall: 0, recipientsAccepted: 0, inFlight: 0, maxInFlight: 0, firstAt: null, lastAt: null, uniqueNumbers: new Set() };
  callTimes = [];
}
reset();

http
  .createServer((req, res) => {
    if (req.url === "/__reset" && req.method === "POST") {
      reset();
      return res.end("{}");
    }
    if (req.url === "/__stats") {
      const { uniqueNumbers, ...rest } = s;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ...rest, uniqueNumbers: uniqueNumbers.size, spanSeconds: s.firstAt ? (s.lastAt - s.firstAt) / 1000 : 0 }));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const now = Date.now();
      s.calls += 1;
      s.firstAt ??= now;
      s.lastAt = now;
      s.inFlight += 1;
      s.maxInFlight = Math.max(s.maxInFlight, s.inFlight);
      const numbers = (new URLSearchParams(body).get("number") || "").split(",").filter(Boolean);
      s.maxNumbersInOneCall = Math.max(s.maxNumbersInOneCall, numbers.length);

      // Decided on arrival, so a burst can't slip past the limit.
      while (callTimes.length && now - callTimes[0] >= 60000) callTimes.shift();
      const overLimit = (MODE === "limited" && callTimes.length >= LIMIT) || s.calls <= FAIL_FIRST;
      if (!overLimit) callTimes.push(now);
      const retryAfter = s.calls <= FAIL_FIRST ? 1 : callTimes.length ? Math.ceil((60000 - (now - callTimes[0])) / 1000) : 1;

      setTimeout(() => {
        s.inFlight -= 1;
        res.setHeader("Content-Type", "application/json");
        if (overLimit) {
          s.calls429 += 1;
          res.statusCode = 429;
          res.setHeader("Retry-After", String(retryAfter));
          return res.end(JSON.stringify({ message: "Too many requests." }));
        }
        s.callsAccepted += 1;
        s.recipientsAccepted += numbers.length;
        for (const n of numbers) s.uniqueNumbers.add(n);
        const type = numbers.length > 1 ? "bulk" : "single";
        res.end(JSON.stringify(numbers.map((recipient, i) => ({ message_id: s.recipientsAccepted - numbers.length + i + 1, recipient, type, status: "Pending" }))));
      }, MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));
    });
  })
  .listen(PORT, () => console.log(`Mock SMS gateway (${MODE}${FAIL_FIRST ? `, first ${FAIL_FIRST} calls throttled` : ""}) on :${PORT}`));
