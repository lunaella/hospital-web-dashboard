import { WebSocketServer } from "ws";
import { verifySessionToken } from "../utils/jwt.js";
import { ensureRedisConnected } from "../db/redis.js";
import { pool } from "../db/pool.js";
import { registerClient, registerDonorClient } from "./hub.js";

// Real-time feed at /ws. Admin connections get appointment book/cancel
// events (see donorPortal.controller.js) so the Appointment View and
// notification bell update without a manual refresh or waiting on the next
// poll. Donor app connections get only their own appointment/eligibility
// changes plus new-broadcast signals (see hub.js's sendToDonor).
//
// Auth mirrors requireAuth (middleware/auth.js): same JWT + Redis
// session:{jti} check, just done once at connect time instead of per
// request — there's no per-message auth on a WebSocket, so a session
// that gets revoked mid-connection stays connected until the socket
// closes on its own. Acceptable here: this channel only ever pushes
// non-sensitive "an appointment changed" pings, never anything a revoked
// session shouldn't have already seen.
//
// A browser's native WebSocket can't send custom headers, so the token
// travels as a query param (?token=...) instead of an Authorization
// header — same reason browser-based WS auth almost always ends up this
// way. It's sent over wss:// in production (Render terminates TLS), so
// this is no more exposed than the token already is in every REST request.
export function attachRealtime(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== "/ws") {
      // Not our path — leave it alone rather than destroying the socket,
      // in case something else ever needs the upgrade event too.
      return;
    }

    // Native clients (the Flutter donor app) can send headers, so they use
    // Authorization and keep the token out of the URL (and out of any
    // proxy/access logs that record it). The browser dashboard falls back
    // to ?token=.
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : url.searchParams.get("token");
    if (!token) {
      socket.destroy();
      return;
    }

    let payload;
    try {
      payload = verifySessionToken(token);
    } catch {
      socket.destroy();
      return;
    }

    // Donor app: same checks as requireDonorAuth (middleware/donorAuth.js),
    // then registered on the donor side of the hub, which only ever gets
    // that donor's own events — never the admin feed.
    if (payload.role === "donor") {
      try {
        const redis = await ensureRedisConnected();
        const sessionExists = await redis.get(`donor_session:${payload.jti}`);
        const { rows } = sessionExists
          ? await pool.query("SELECT id FROM donors WHERE id = $1", [payload.sub])
          : { rows: [] };
        if (!rows[0]) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          registerDonorClient(ws, rows[0].id);
        });
      } catch {
        socket.destroy();
      }
      return;
    }

    // A phone-verified-but-unregistered token has no donor record yet.
    if (payload.role === "donor_pending") {
      socket.destroy();
      return;
    }

    try {
      const redis = await ensureRedisConnected();
      const sessionExists = await redis.get(`session:${payload.jti}`);
      if (!sessionExists) {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      registerClient(ws);
    });
  });

  return wss;
}
