import { db, productsTable, importRunsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// ── Field mapping heuristics ─────────────────────────────────────────────────
// Maps incoming column names (lowercased) to our canonical product fields.
const FIELD_ALIASES: Record<string, string[]> = {
  externalId: ["id", "sku", "external_id", "externalid", "product_id", "productid", "code", "codigo"],
  name:       ["name", "title", "product_name", "productname", "nombre", "producto"],
  description:["description", "desc", "descripcion", "details", "detalle"],
  priceUsd:   ["price", "cost", "amount", "precio", "valor", "price_usd", "priceusd", "unit_price"],
  image:      ["image", "image_url", "imageurl", "photo", "thumbnail", "imagen", "foto", "picture"],
  category:   ["category", "categoria", "type", "tipo", "department", "departamento"],
  stock:      ["stock", "qty", "quantity", "inventory", "inventario", "cantidad", "available"],
};

export type RawRow = Record<string, unknown>;
export type FieldMapping = Record<string, string>; // canonical → source column

/** Detects which source column corresponds to each canonical field. */
export function autoMap(sample: RawRow): FieldMapping {
  if (!sample) return {};
  const cols = Object.keys(sample);
  const lower = cols.map((c) => c.toLowerCase().trim());
  const result: FieldMapping = {};

  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = lower.indexOf(alias);
      if (idx !== -1) {
        result[canonical] = cols[idx];
        break;
      }
    }
  }
  return result;
}

/** Parses CSV text into array of row objects. Handles quoted fields with commas/newlines. */
export function parseCSV(text: string): RawRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => { cur.push(field); field = ""; };
  const pushRow = () => { if (cur.length || field !== "") { pushField(); rows.push(cur); cur = []; } };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { pushField(); i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { pushRow(); i++; continue; }
    field += ch; i++;
  }
  pushRow();

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.length > 0 && r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: RawRow = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] ?? ""; });
      return obj;
    });
}

/** Detects format and parses input into rows. */
export function parseInput(raw: string): { rows: RawRow[]; format: "json" | "csv" } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      const rows = Array.isArray(data) ? data : (data.products || data.items || data.data || []);
      return { rows: rows as RawRow[], format: "json" };
    } catch {
      // fall through to CSV
    }
  }
  return { rows: parseCSV(raw), format: "csv" };
}

/** Coerces a value to number, returns null if invalid. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : null;
}

/** Maps a raw row to a product insert payload using the mapping. */
function mapRow(row: RawRow, mapping: FieldMapping): {
  externalId: string | null;
  name: string;
  description: string | null;
  priceUsd: number;
  image: string | null;
  category: string;
  stock: number | null;
} | null {
  const get = (canonical: string): unknown => mapping[canonical] ? row[mapping[canonical]] : undefined;

  const name = String(get("name") ?? "").trim();
  const price = num(get("priceUsd"));
  if (!name || price === null || price <= 0) return null;

  const externalId = get("externalId");
  const stock = num(get("stock"));
  const image = String(get("image") ?? "").trim() || null;
  const category = String(get("category") ?? "general").trim() || "general";
  const description = String(get("description") ?? "").trim() || null;

  return {
    externalId: externalId ? String(externalId).trim() : null,
    name: name.slice(0, 200),
    description: description?.slice(0, 2000) ?? null,
    priceUsd: price,
    image,
    category: category.slice(0, 80),
    stock,
  };
}

/** Runs an import end-to-end. Updates the import_run row in real-time. */
export async function runImport(opts: {
  runId: number;
  storeId: number;
  coHostId: number;
  source: string;
  rawContent: string;
  mapping?: FieldMapping;
}): Promise<void> {
  const { runId, storeId, coHostId, source, rawContent, mapping: providedMapping } = opts;
  const errors: { row: number; message: string }[] = [];
  let created = 0, updated = 0;

  try {
    const { rows } = parseInput(rawContent);
    const mapping = providedMapping ?? (rows.length > 0 ? autoMap(rows[0]) : {});

    await db.update(importRunsTable)
      .set({ totalDetected: rows.length })
      .where(eq(importRunsTable.id, runId));

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRow(rows[i], mapping);
      if (!mapped) {
        errors.push({ row: i + 2, message: "Producto inválido (falta nombre o precio)" });
        continue;
      }

      try {
        // Atomic upsert: ON CONFLICT (store_id, external_id) DO UPDATE.
        // The unique index on (storeId, externalId) makes concurrent imports safe.
        // For NULL externalId, Postgres treats each NULL as distinct → multiple rows OK.
        const updateSet = {
          name: mapped.name,
          description: mapped.description,
          priceUsd: mapped.priceUsd,
          image: mapped.image,
          category: mapped.category,
          stock: mapped.stock,
          source,
          lastSyncedAt: new Date(),
        };
        const inserted = await db.insert(productsTable).values({
          ...updateSet,
          coHostId,
          storeId,
          externalId: mapped.externalId,
          condition: "new",
          listingType: "sale",
        }).onConflictDoUpdate({
          target: [productsTable.storeId, productsTable.externalId],
          set: updateSet,
        }).returning({ id: productsTable.id, createdAt: productsTable.createdAt, updatedAt: productsTable.updatedAt });

        // RETURNING gives us createdAt; if it equals updatedAt, this was an INSERT.
        const row = inserted[0];
        if (row && row.createdAt && row.updatedAt && row.createdAt.getTime() === row.updatedAt.getTime()) {
          created++;
        } else {
          updated++;
        }

        // Update progress every 25 rows for live polling
        if ((i + 1) % 25 === 0) {
          await db.update(importRunsTable)
            .set({ created, updated, errors: errors.length })
            .where(eq(importRunsTable.id, runId));
        }
      } catch (err: any) {
        errors.push({ row: i + 2, message: err?.message?.slice(0, 200) ?? "Error desconocido" });
      }
    }

    await db.update(importRunsTable).set({
      status: "completed",
      created,
      updated,
      errors: errors.length,
      errorLog: errors.length > 0 ? JSON.stringify(errors.slice(0, 100)) : null,
      finishedAt: new Date(),
    }).where(eq(importRunsTable.id, runId));

    logger.info({ runId, storeId, created, updated, errors: errors.length }, "Import completed");
  } catch (err: any) {
    logger.error({ runId, err: err?.message }, "Import failed");
    await db.update(importRunsTable).set({
      status: "failed",
      created,
      updated,
      errors: errors.length + 1,
      errorLog: JSON.stringify([...errors.slice(0, 99), { row: 0, message: err?.message ?? "Fallo general" }]),
      finishedAt: new Date(),
    }).where(eq(importRunsTable.id, runId));
  }
}

// ── SSRF protection ──────────────────────────────────────────────────────────
// Block private, link-local, loopback, and cloud-metadata IP ranges to prevent
// import-from-URL from pivoting into the internal network or AWS/GCP metadata.

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],         // current network
  ["10.0.0.0", 8],        // RFC1918
  ["100.64.0.0", 10],     // CGNAT
  ["127.0.0.0", 8],       // loopback
  ["169.254.0.0", 16],    // link-local + AWS/GCP metadata (169.254.169.254)
  ["172.16.0.0", 12],     // RFC1918
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],    // RFC1918
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],       // multicast
  ["240.0.0.0", 4],       // reserved
  ["255.255.255.255", 32],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    return (ipInt & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Loopback ::1, unspecified ::, link-local fe80::/10, unique-local fc00::/7
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4-mapped (::ffff:x.x.x.x) — extract IPv4 and re-check
  const m = lower.match(/^::ffff:([0-9a-f.:]+)$/);
  if (m && isIP(m[1]) === 4) return isBlockedIPv4(m[1]);
  return false;
}

async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error("URL inválida"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Solo se permiten URLs http(s)");
  }
  const host = parsed.hostname;
  // Already an IP? Validate it directly (no DNS lookup).
  const family = isIP(host);
  if (family === 4 && isBlockedIPv4(host)) throw new Error("URL apunta a una IP privada/restringida");
  if (family === 6 && isBlockedIPv6(host)) throw new Error("URL apunta a una IP privada/restringida");
  if (family === 0) {
    // Resolve all addresses; reject if ANY one is private (DNS rebinding defense).
    let addrs: { address: string; family: number }[] = [];
    try { addrs = await lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error("No se pudo resolver el dominio"); }
    for (const a of addrs) {
      if (a.family === 4 && isBlockedIPv4(a.address)) throw new Error("El dominio resuelve a una IP privada/restringida");
      if (a.family === 6 && isBlockedIPv6(a.address)) throw new Error("El dominio resuelve a una IP privada/restringida");
    }
  }
  return parsed;
}

/** Fetches catalog content from a remote URL. SSRF-hardened. */
export async function fetchCatalog(url: string, apiKey?: string): Promise<string> {
  const headers: Record<string, string> = { "User-Agent": "LinkServi-InstantStore/1.0" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  // Validate origin URL + every redirect hop (manual redirect handling).
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertSafePublicUrl(current);
    const res = await fetch(current, { headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("Redirect sin Location");
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el catálogo`);

    const text = await res.text();
    if (text.length > 50 * 1024 * 1024) throw new Error("Catálogo demasiado grande (>50MB)");
    return text;
  }
  throw new Error("Demasiadas redirecciones");
}

// Re-export for routes to mark a stale "running" import as failed via watchdog.
export const STALE_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export async function failStaleRun(runId: number, reason: string): Promise<void> {
  await db.update(importRunsTable).set({
    status: "failed",
    errorLog: JSON.stringify([{ row: 0, message: reason }]),
    finishedAt: new Date(),
  }).where(eq(importRunsTable.id, runId));
}

// Helper for routes: detect if an import is already running for a store.
export async function findRunningImport(storeId: number): Promise<{ id: number; startedAt: Date } | null> {
  const [row] = await db.select({ id: importRunsTable.id, startedAt: importRunsTable.startedAt })
    .from(importRunsTable)
    .where(sql`${importRunsTable.storeId} = ${storeId} AND ${importRunsTable.status} = 'running'`)
    .limit(1);
  return row ?? null;
}
