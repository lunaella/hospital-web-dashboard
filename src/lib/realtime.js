// Thin WebSocket client for the admin real-time feed (server/src/realtime).
// Deliberately its own tiny module rather than a React context/provider —
// NotificationBell and DonorManagement each open their own connection and
// pick out the event types they care about. Two sockets per open admin tab
// instead of one shared one; simple to reason about and fine at this app's
// scale (a handful of admin tabs, not thousands).
import { getToken } from "./apiClient";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const RECONNECT_DELAY_MS = 4000;

function wsUrl() {
  const token = getToken();
  if (!token) return null;
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.searchParams.set("token", token);
  return url.toString();
}

// Calls onEvent(parsedJson) for every message received. Reconnects
// automatically after a drop (network blip, the free-tier backend cold-
// starting, a deploy restarting the server) instead of leaving a dead
// connection with no events ever arriving again for the rest of the tab's
// life. Returns a disconnect function — call it on unmount.
export function connectRealtime(onEvent) {
  let socket = null;
  let stopped = false;
  let reconnectTimer = null;

  function connect() {
    const url = wsUrl();
    if (!url) return; // not logged in — nothing to connect with yet

    socket = new WebSocket(url);

    socket.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data));
      } catch {
        // malformed frame — ignore rather than crash the whole feed
      }
    };

    socket.onclose = () => {
      if (stopped) return;
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    socket.onerror = () => {
      // onclose fires right after this and handles the reconnect — this
      // handler just exists so an error doesn't surface as an uncaught
      // console error for something we're already recovering from.
      socket?.close();
    };
  }

  connect();

  return function disconnect() {
    stopped = true;
    clearTimeout(reconnectTimer);
    socket?.close();
  };
}
