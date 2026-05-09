import { db, storeImportsTable, importRunsTable, storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { runImport, fetchCatalog, findRunningImport } from "./importer";

// ─────────────────────────────────────────────────────────────────────────────
// Auto-sync scheduler para importaciones de catálogos
// Se ejecuta periódicamente (ver index.ts). En cada tick:
//   1. Lista todos los store_imports con autoSync=true cuyo URL esté definido
//   2. Filtra los que ya cumplieron su intervalMin desde lastRunAt
//   3. Descarga el catálogo (vía fetchCatalog: SSRF-hardened con DNS-rebind
//      defense, redirect manual y límite de 50 MB), crea un import_run y
//      dispara runImport() — usando el coHostId real del dueño de la tienda.
// El catálogo solo se intenta cuando sourceType="url" y hay sourceUrl. Los
// imports de archivo (CSV/XLSX subidos) no tienen contenido reutilizable, así
// que se ignoran aunque autoSync esté on.
// ─────────────────────────────────────────────────────────────────────────────

export async function runDueAutoSyncs(): Promise<{ launched: number; skipped: number; failed: number }> {
  const now = Date.now();
  let all;
  try {
    all = await db.select().from(storeImportsTable).where(eq(storeImportsTable.autoSync, true));
  } catch (err) {
    const message = String((err as any)?.message ?? err);
    if (message.includes('relation "store_imports" does not exist')) {
      logger.warn("🛒 Auto-sync scheduler skipped — store_imports table missing");
      return { launched: 0, skipped: 0, failed: 0 };
    }
    throw err;
  }

  let launched = 0, skipped = 0, failed = 0;

  for (const imp of all) {
    // Solo URL importers son re-ejecutables sin nuevo upload
    if (imp.sourceType !== "url" || !imp.sourceUrl) { skipped++; continue; }
    // Respetar intervalo
    const intervalMs = Math.max(5, imp.intervalMin) * 60_000;
    const last = imp.lastRunAt ? imp.lastRunAt.getTime() : 0;
    if (last > 0 && now - last < intervalMs) { skipped++; continue; }

    // Evitar disparar si ya hay una run "running" para esta tienda (un import
    // anterior aún en proceso, o un run manual del usuario).
    const inFlight = await findRunningImport(imp.storeId);
    if (inFlight) { skipped++; continue; }

    try {
      // Resolver el coHostId real del dueño de la tienda (no usar 0, rompería
      // la FK products.coHostId → users.id al insertar productos nuevos).
      const [store] = await db.select({ coHostId: storesTable.coHostId })
        .from(storesTable)
        .where(eq(storesTable.id, imp.storeId))
        .limit(1);
      if (!store) {
        failed++;
        logger.warn({ importId: imp.id, storeId: imp.storeId }, "Auto-sync: store no existe, deshabilitando");
        await db.update(storeImportsTable).set({ autoSync: false }).where(eq(storeImportsTable.id, imp.id));
        continue;
      }

      // SSRF-hardened fetch (DNS rebinding defense + redirect manual + cap 50 MB)
      const raw = await fetchCatalog(imp.sourceUrl, imp.apiKey ?? undefined);

      const [run] = await db.insert(importRunsTable).values({
        storeId: imp.storeId,
        importId: imp.id,
        status: "running",
      }).returning();

      // Disparamos sin await para no bloquear el ciclo del cron en una run lenta.
      runImport({
        runId: run.id,
        storeId: imp.storeId,
        coHostId: store.coHostId,
        source: imp.sourceType,
        rawContent: raw,
        mapping: imp.fieldMapping ? JSON.parse(imp.fieldMapping) : undefined,
      }).catch((err) => {
        logger.error({ err, importId: imp.id, runId: run.id }, "Auto-sync runImport failed");
      });

      await db.update(storeImportsTable)
        .set({ lastRunAt: new Date() })
        .where(eq(storeImportsTable.id, imp.id));

      launched++;
    } catch (err) {
      failed++;
      logger.warn({ err, importId: imp.id, url: imp.sourceUrl }, "Auto-sync URL fetch failed");
    }
  }

  return { launched, skipped, failed };
}

let scheduler: NodeJS.Timeout | null = null;
let isRunning = false;
let dbUnavailable = false;

// Wrapper con mutex: si una tick anterior aún está corriendo (por imports lentos
// o picos de carga), saltamos esta tick para evitar duplicar import_runs y
// dobles llamadas al runImport del mismo store_imports row.
async function tick(): Promise<void> {
  if (isRunning) {
    logger.debug("🛒 Auto-sync tick saltada — anterior aún en ejecución");
    return;
  }
  if (dbUnavailable) {
    return;
  }
  isRunning = true;
  try {
    const res = await runDueAutoSyncs();
    if (res.launched > 0) logger.info(res, "🛒 Import auto-sync tick");
  } catch (err) {
    const message = String((err as any)?.message ?? err);
    if (message.includes("connect ETIMEDOUT") || message.includes("ECONNREFUSED") || message.includes("ENETUNREACH")) {
      dbUnavailable = true;
      logger.warn({ err }, "🛒 Auto-sync scheduler paused: database unavailable");
      return;
    }
    logger.error({ err }, "Import scheduler crash");
  } finally {
    isRunning = false;
  }
}

export function startImportScheduler(intervalMs: number = 60_000): void {
  if (scheduler) return;
  // primer disparo a los 30 s para no chocar con el boot
  setTimeout(() => { void tick(); }, 30_000);
  scheduler = setInterval(() => { void tick(); }, intervalMs);
  logger.info({ intervalMs }, "🛒 Import auto-sync scheduler started");
}
