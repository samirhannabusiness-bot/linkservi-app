import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Strip sslmode from the connection string so pg doesn't override our ssl config
const rawUrl = process.env.DATABASE_URL!.trim();
const normalizedUrl = rawUrl.startsWith("postgres://") ? rawUrl.replace(/^postgres:\/\//, "postgresql://") : rawUrl;
const url = new URL(normalizedUrl);
const sslmode = url.searchParams.get("sslmode");
url.searchParams.delete("sslmode");
url.searchParams.delete("uselibpqcompat");
const cleanUrl = url.toString().replace(/\?$/, "");
const needsSsl = sslmode === "require" || sslmode === "verify" || sslmode === "prefer";

export const pool = new Pool({
  connectionString: cleanUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  // Fail fast if the DB is unreachable — without this, queries hang forever
  // and the frontend spinner spins indefinitely. 10s gives slow handshakes
  // (TLS + Cloud SQL proxy startup) plenty of time, but surfaces real outages.
  connectionTimeoutMillis: 10_000,
  // Cap how long any single query waits for the server. 30s aligns with the
  // Cloud Run request timeout so the request fails before the proxy gives up.
  statement_timeout: 30_000,
  query_timeout: 30_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
