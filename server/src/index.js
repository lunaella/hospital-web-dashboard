import http from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { attachRealtime } from "./realtime/socketServer.js";

// Switched from app.listen() to an explicit http.Server so the WebSocket
// upgrade handler (attachRealtime) can share the same port instead of
// needing a second one — Render only exposes one port per service anyway.
const server = http.createServer(app);
attachRealtime(server);

server.listen(env.port, () => {
  console.log(`ResQ API listening on http://localhost:${env.port}`);
});
