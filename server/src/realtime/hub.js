// Connection registry for the admin real-time feed. Deliberately a flat
// Set, not a per-hospital subscription system — the number of admin
// browser tabs connected at once is small (a handful, not thousands), so
// broadcasting to everyone and letting each client filter by the
// hospitalId already in the event payload is simpler and good enough, with
// nothing here to keep in sync if a client's selected hospital changes.
const clients = new Set();

export function registerClient(ws) {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
}

// Fire-and-forget by design: if a client's socket is mid-close or already
// gone, that admin just gets it on their next poll/refresh instead — same
// fallback behavior as before this feature existed, not a new failure mode.
export function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(payload);
      } catch {
        // socket died between the readyState check and send — ignore, its
        // own close handler will clean it out of `clients`.
      }
    }
  }
}
