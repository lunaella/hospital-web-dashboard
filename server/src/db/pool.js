import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

// Pool connects lazily on first query — importing this module never
// blocks server startup even if Postgres isn't reachable yet.
export const pool = new Pool({
  connectionString: env.databaseUrl,
});

pool.on("error", (err) => {
  // Idle client errors (e.g. connection dropped) shouldn't crash the process.
  console.error("Unexpected Postgres pool error:", err.message);
});

export async function query(text, params) {
  return pool.query(text, params);
}
