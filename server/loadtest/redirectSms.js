// Preloaded into a local test server for TC-ST-02 (node --import
// ./loadtest/redirectSms.js src/index.js) so its calls to Semaphore go to
// loadtest/mockSmsGateway.js instead. Only api.semaphore.co is redirected;
// the server code itself is unchanged.

const MOCK = process.env.MOCK_SMS_URL || "http://localhost:4200";
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://api.semaphore.co/")) {
    return realFetch(MOCK + new URL(url).pathname, init);
  }
  return realFetch(input, init);
};
