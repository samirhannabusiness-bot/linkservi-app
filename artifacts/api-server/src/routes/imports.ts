import { Router, type IRouter } from "express";
import { db, storesTable, storeImportsTable, importRunsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { authenticate } from "../lib/auth";
import { logger } from "../lib/logger";
import { autoMap, fetchCatalog, findRunningImport, parseInput, runImport, STALE_RUN_TIMEOUT_MS, failStaleRun } from "../services/importer";

const router: IRouter = Router();

// Verify the authenticated user owns the given store (or is admin)
async function assertStoreOwner(userId: number, storeId: number, isAdmin: boolean): Promise<{ coHostId: number } | null> {
  const [store] = await db.select({ coHostId: storesTable.coHostId })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);
  if (!store) return null;
  if (!isAdmin && store.coHostId !== userId) return null;
  return store;
}

// ── POST /api/imports/preview ────────────────────────────────────────────────
// Quick synchronous preview: fetch + parse + auto-map, return first 5 rows + mapping
router.post("/imports/preview", authenticate, async (req, res): Promise<void> => {
  try {
    const { sourceUrl, apiKey, csvContent } = req.body ?? {};
    let raw = "";
    if (csvContent && typeof csvContent === "string") {
      raw = csvContent;
    } else if (sourceUrl && typeof sourceUrl === "string") {
      raw = await fetchCatalog(sourceUrl, apiKey);
    } else {
      res.status(400).json({ error: "Falta sourceUrl o csvContent" });
      return;
    }

    const { rows, format } = parseInput(raw);
    if (rows.length === 0) {
      res.status(400).json({ error: "No se pudieron leer productos del catálogo" });
      return;
    }

    const mapping = autoMap(rows[0]);
    res.json({
      format,
      totalDetected: rows.length,
      mapping,
      sourceColumns: Object.keys(rows[0]),
      preview: rows.slice(0, 5),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Import preview failed");
    res.status(500).json({ error: err?.message ?? "Error generando vista previa" });
  }
});

// ── POST /api/imports/run ────────────────────────────────────────────────────
// Starts an import asynchronously, returns runId immediately
router.post("/imports/run", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const {
      storeId, sourceType, sourceUrl, apiKey, csvContent, mapping,
      autoSync: autoSyncRaw, intervalMin: intervalMinRaw,
    } = req.body ?? {};

    if (!storeId || typeof storeId !== "number") {
      res.status(400).json({ error: "storeId requerido" });
      return;
    }
    if (sourceType !== "url" && sourceType !== "file") {
      res.status(400).json({ error: "sourceType debe ser 'url' o 'file'" });
      return;
    }

    const store = await assertStoreOwner(userId, storeId, userRole === "admin");
    if (!store) {
      res.status(403).json({ error: "No tienes permisos sobre esta tienda" });
      return;
    }

    // ── Concurrent-run guard ────────────────────────────────────────────────
    // If a previous run for this store is still "running", reject the new one
    // unless it has been stuck longer than the watchdog timeout — in which case
    // mark it as failed first, then proceed with the new run.
    const existing = await findRunningImport(storeId);
    if (existing) {
      const ageMs = Date.now() - new Date(existing.startedAt).getTime();
      if (ageMs < STALE_RUN_TIMEOUT_MS) {
        res.status(409).json({
          error: "Ya hay una importación en curso para esta tienda. Espera a que termine.",
          runningRunId: existing.id,
        });
        return;
      }
      await failStaleRun(existing.id, "Tiempo de ejecución excedido (watchdog)");
    }

    // Get raw content (synchronous fetch so we can fail fast)
    let raw = "";
    let source = "";
    if (sourceType === "url") {
      if (!sourceUrl || typeof sourceUrl !== "string") {
        res.status(400).json({ error: "sourceUrl requerido" });
        return;
      }
      raw = await fetchCatalog(sourceUrl, apiKey);
      source = sourceUrl;
    } else {
      if (!csvContent || typeof csvContent !== "string") {
        res.status(400).json({ error: "csvContent requerido" });
        return;
      }
      raw = csvContent;
      source = "upload";
    }

    // Auto-sync is only valid for URL-based imports — file uploads are one-shot.
    // Clamp interval to a sane range (5 min – 24 h).
    const enableAutoSync = sourceType === "url" && autoSyncRaw === true;
    const interval = (() => {
      const n = Number(intervalMinRaw);
      if (!Number.isFinite(n)) return 15;
      return Math.max(5, Math.min(1440, Math.round(n)));
    })();

    // Persist the import config (source of truth for re-runs / auto-sync later)
    const [importRow] = await db.insert(storeImportsTable).values({
      storeId,
      sourceType,
      sourceUrl: sourceType === "url" ? sourceUrl : null,
      apiKey: apiKey || null,
      format: "auto",
      autoSync: enableAutoSync,
      intervalMin: interval,
      fieldMapping: mapping ? JSON.stringify(mapping) : null,
      lastRunAt: new Date(),
    }).returning();

    // Create the run row (status=running, counters=0)
    const [run] = await db.insert(importRunsTable).values({
      importId: importRow.id,
      storeId,
      status: "running",
      totalDetected: 0,
      created: 0,
      updated: 0,
      errors: 0,
    }).returning();

    // Kick off async — don't await so the HTTP response goes back fast
    runImport({
      runId: run.id,
      storeId,
      coHostId: store.coHostId,
      source,
      rawContent: raw,
      mapping,
    }).catch((err) => logger.error({ err: err?.message, runId: run.id }, "Background import crash"));

    res.json({ runId: run.id, importId: importRow.id });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Import run failed");
    res.status(500).json({ error: err?.message ?? "Error iniciando importación" });
  }
});

// ── GET /api/imports/runs/:id ────────────────────────────────────────────────
// Live status for polling
router.get("/imports/runs/:id", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const runId = Number(req.params.id);
    if (!runId) { res.status(400).json({ error: "runId inválido" }); return; }

    const [run] = await db.select().from(importRunsTable).where(eq(importRunsTable.id, runId)).limit(1);
    if (!run) { res.status(404).json({ error: "Run no encontrado" }); return; }

    const ok = await assertStoreOwner(userId, run.storeId, userRole === "admin");
    if (!ok) { res.status(403).json({ error: "Sin permisos" }); return; }

    res.json(run);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error consultando run" });
  }
});

// ── GET /api/imports/runs?storeId=X ──────────────────────────────────────────
// History of runs for a store
router.get("/imports/runs", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const storeId = Number(req.query.storeId);
    if (!storeId) { res.status(400).json({ error: "storeId requerido" }); return; }

    const ok = await assertStoreOwner(userId, storeId, userRole === "admin");
    if (!ok) { res.status(403).json({ error: "Sin permisos" }); return; }

    const runs = await db.select().from(importRunsTable)
      .where(eq(importRunsTable.storeId, storeId))
      .orderBy(desc(importRunsTable.startedAt))
      .limit(20);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error consultando historial" });
  }
});

// ── GET /api/imports/my-stores ───────────────────────────────────────────────
// Returns stores owned by the current user (for the import form's store selector)
router.get("/imports/my-stores", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const stores = await db.select({
      id: storesTable.id,
      name: storesTable.name,
      logoUrl: storesTable.logoUrl,
    }).from(storesTable).where(and(eq(storesTable.coHostId, userId), eq(storesTable.isActive, true)));
    res.json(stores);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error consultando tiendas" });
  }
});

export default router;
