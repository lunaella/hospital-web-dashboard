import { WebSocketServer } from "ws";
import { verifySessionToken } from "../utils/jwt.js";
import { ensureRedisConnected } from "../db/redis.js";
import { registerClient } from "./hub.js";

// Admin-only real-time feed at /ws — pushes appointment book/cancel events
// (see donorPortal.controller.js) so the Appointment View and notification
// bell update without a manual refresh or waiting on the next poll.
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

    const token = url.searchParams.get("token");
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

    // Same donor-token rejection requireAuth does — this channel is
    // admin-only.
    if (payload.role === "donor" || payload.role === "donor_pending") {
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
