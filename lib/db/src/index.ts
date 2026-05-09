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
// Force SSL when running on Cloud Run (K_SERVICE is set automatically by GCP)
// because Cloud SQL public IP always requires encryption — pg_hba.conf rejects
// unencrypted connections. Locally we honor the sslmode query parameter.
const isCloudRun = !!process.env.K_SERVICE;
const needsSsl = isCloudRun || sslmode === "require" || sslmode === "verify-full" || sslmode === "verify-ca" || sslmode === "prefer";

export const pool = new Pool({
  connectionString: cleanUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db pool] idle client error:", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
