// ─────────────────────────────────────────────────────────────────────────────
// Production migration runner — invoked by Cloud Build (db-migrate step).
//
// Applies every .sql file in /migrations alphabetically against the database
// pointed to by DB_URL. Migrations are idempotent (CREATE ... IF NOT EXISTS,
// ALTER ... ADD COLUMN IF NOT EXISTS) so this is safe to run on every build.
//
// We use Node + `pg` instead of `psql` because libpq's URL parser is strict
// about special characters in the password (=, &, +, etc.) which the Node
// `pg` parser handles correctly.
// ─────────────────────────────────────────────────────────────────────────────
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DB_URL;
if (!url) {
  console.error("ERROR: DB_URL environment variable is empty");
  process.exit(1);
}

const dir = process.env.MIGRATIONS_DIR || "/workspace/migrations";
if (!fs.existsSync(dir)) {
  console.error(`ERROR: migrations directory not found: ${dir}`);
  process.exit(1);
}

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No .sql files found — nothing to do.");
  } else {
    console.log(`Applying ${files.length} migration(s) from ${dir} ...`);
    for (const f of files) {
      console.log(`-> ${f}`);
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      await client.query(sql);
    }
    console.log("OK All migrations applied successfully.");
  }
} catch (err) {
  console.error("MIGRATION FAILED:", err.message);
  if (err.position) console.error("  position:", err.position);
  if (err.detail) console.error("  detail:", err.detail);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
