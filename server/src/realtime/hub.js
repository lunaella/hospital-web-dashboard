// Connection registry for the admin real-time feed. Deliberately a flat
// Set, not a per-hospital subscription system — the number of admin
// browser tabs connected at once is small (a handful, not thousands), so
// broadcasting to everyone and letting each client filter by the
// hospitalId already in the event payload is simpler and good enough, with
// nothing here to keep in sync if a client's selected hospital changes.
const clients = new Set();

// Donor app connections, kept apart from `clients` on purpose: admin events
// carry other donors' names and blood types, so a donor socket must never
// receive `broadcast`. Keyed by donor id (a donor can be signed in on more
// than one device) so per-donor events reach only that donor.
const donorClients = new Map();

export function registerClient(ws) {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
}

export function registerDonorClient(ws, donorId) {
  const key = String(donorId);
  if (!donorClients.has(key)) donorClients.set(key, new Set());
  donorClients.get(key).add(ws);
  const remove = () => {
    const set = donorClients.get(key);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) donorClients.delete(key);
  };
  ws.on("close", remove);
  ws.on("error", remove);
}

function sendAll(sockets, payload) {
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(payload);
      } catch {
        // socket died between the readyState check and send — ignore, its
        // own close handler will clean it out of the registry.
      }
    }
  }
}

// Fire-and-forget by design: if a client's socket is mid-close or already
// gone, that admin just gets it on their next poll/refresh instead — same
// fallback behavior as before this feature existed, not a new failure mode.
export function broadcast(event) {
  sendAll(clients, JSON.stringify(event));
}

// Donor events are "something changed, re-fetch" signals — the app reloads
// the real data over REST (see HomeView._handleRealtimeEvent), so keep
// payloads to the event type plus nothing another donor shouldn't see.
export function sendToDonor(donorId, event) {
  const sockets = donorClients.get(String(donorId));
  if (sockets) sendAll(sockets, JSON.stringify(event));
}

export function broadcastToDonors(event) {
  const payload = JSON.stringify(event);
  for (const sockets of donorClients.values()) sendAll(sockets, payload);
}
