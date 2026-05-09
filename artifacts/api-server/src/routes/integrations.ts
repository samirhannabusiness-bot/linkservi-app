import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { authenticate, requireRole } from "../lib/auth";
import { apiKeyAuth } from "../lib/agent-auth";
import { db, productsTable, storesTable, importRunsTable, integrationConfigsTable } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

// Sync Agent SAINT — endpoints para la UI de integraciones + ingesta del agente local.
//
// Estado simulado por usuario para `/status` (config, métricas, logs en vivo).
// La persistencia REAL de productos vive en `productsTable` y se hace vía
// upsert por (storeId, externalId).

type IntervalMin = 5 | 15 | 30 | 60;
type Status = "active" | "disconnected" | "syncing";
type LogKind = "success" | "warning" | "progress";

interface InMemoryConfig {
  apiKey: string | null;
  intervalMin: IntervalMin;
  updatedAt: string;
}

interface LogEntry {
  id: string;
  kind: LogKind;
  title: string;
  detail: string;
  timestamp: string;
}

interface InMemoryState {
  status: Status;
  lastSyncAt: string;
  productsSynced: number;
  config: InMemoryConfig;
  recentEvents: LogEntry[];
  cachedStoreId: number | null; // resolvemos lazy en el primer push
}

const ALLOWED_INTERVALS: IntervalMin[] = [5, 15, 30, 60];
const MAX_EVENTS = 20;
const MAX_BATCH = 5000;

// Estado en memoria para métricas/logs en vivo (no crítico — sobrevive sólo al
// proceso). La AUTH y la config persistente viven en `integration_configs`.
const stateByUser = new Map<number, InMemoryState>();

// Rate-limit ahora vive en lib/agent-auth.ts y lo aplica el middleware
// `apiKeyAuth` compartido. Los endpoints de pairing/telemetría también lo usan.

function getOrInit(userId: number): InMemoryState {
  let s = stateByUser.get(userId);
  if (!s) {
    s = {
      status: "disconnected",
      lastSyncAt: new Date(0).toISOString(),
      productsSynced: 0,
      config: { apiKey: null, intervalMin: 15, updatedAt: new Date().toISOString() },
      recentEvents: [],
      cachedStoreId: null,
    };
    stateByUser.set(userId, s);
  }
  return s;
}

function pushEvent(s: InMemoryState, kind: LogKind, title: string, detail: string) {
  const entry: LogEntry = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    detail,
    timestamp: new Date().toISOString(),
  };
  s.recentEvents = [entry, ...s.recentEvents].slice(0, MAX_EVENTS);
}

function maskKey(k: string | null): string | null {
  if (!k) return null;
  return "••••••••" + k.slice(-4);
}

function buildLogs(s: InMemoryState): LogEntry[] {
  if (!s.config.apiKey) return [];
  if (s.recentEvents.length > 0) return s.recentEvents;
  return [
    {
      id: "log-placeholder",
      kind: "progress",
      title: "Esperando primer push del Sync Agent",
      detail: "Inicia el agente local para ver eventos en vivo aquí.",
      timestamp: new Date().toISOString(),
    },
  ];
}

const INTEGRATIONS_ROLES = ["cohost", "seller", "admin", "gestor"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Validación de payload (JS plano, sin dependencias). Soporta `price` (spec) y
// `priceUsd` (legacy/agente actual).
type NormalizedProduct = {
  sku: string;
  name: string;
  priceUsd: number;
  stock: number | null;
  description: string | null;
  category: string;
  image: string | null;
};

function validateProduct(raw: unknown): { ok: true; value: NormalizedProduct } | { ok: false; message: string; sku: string | null } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "no es un objeto", sku: null };
  const r = raw as Record<string, unknown>;
  const sku = typeof r.sku === "string" ? r.sku.trim() : "";
  if (!sku) return { ok: false, message: "sku requerido", sku: null };
  if (sku.length > 120) return { ok: false, message: "sku > 120 chars", sku };
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return { ok: false, message: "name requerido", sku };
  if (name.length > 500) return { ok: false, message: "name > 500 chars", sku };
  const priceRaw = r.price ?? r.priceUsd;
  const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) return { ok: false, message: "price/priceUsd inválido", sku };
  let stock: number | null = null;
  if (r.stock !== undefined && r.stock !== null) {
    const sn = typeof r.stock === "number" ? r.stock : Number(r.stock);
    if (!Number.isFinite(sn) || sn < 0 || sn > 1_000_000 || !Number.isInteger(sn)) {
      return { ok: false, message: "stock debe ser entero entre 0 y 1.000.000", sku };
    }
    stock = sn;
  }
  const description = typeof r.description === "string" && r.description.trim().length > 0
    ? r.description.trim().slice(0, 2000)
    : null;
  const category = typeof r.category === "string" && r.category.trim().length > 0
    ? r.category.trim().slice(0, 80)
    : "general";
  const image = typeof r.image === "string" && r.image.trim().length > 0
    ? r.image.trim().slice(0, 2000)
    : null;
  return {
    ok: true,
    value: { sku, name, priceUsd: +price.toFixed(4), stock, description, category, image },
  };
}

function validateSyncBody(body: unknown): { ok: true; value: { products: unknown[]; storeId?: number; agent?: { version?: string; host?: string } } } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "body debe ser un objeto JSON" };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.products)) return { ok: false, message: "Body debe incluir { products: [...] }" };
  if (b.products.length === 0) return { ok: false, message: "Lista de productos vacía" };
  if (b.products.length > MAX_BATCH) return { ok: false, message: `Máximo ${MAX_BATCH} productos por batch` };
  let storeId: number | undefined;
  if (b.storeId !== undefined && b.storeId !== null) {
    const sid = Number(b.storeId);
    if (!Number.isInteger(sid) || sid <= 0) return { ok: false, message: "storeId inválido" };
    storeId = sid;
  }
  let agent: { version?: string; host?: string } | undefined;
  if (b.agent && typeof b.agent === "object") {
    const a = b.agent as Record<string, unknown>;
    agent = {};
    if (typeof a.version === "string") agent.version = a.version.slice(0, 40);
    if (typeof a.host === "string") agent.host = a.host.slice(0, 40);
  }
  return { ok: true, value: { products: b.products, storeId, agent } };
}

// Resuelve el storeId asociado al userId del agente. Cachea para próximos pushes.
async function resolveStoreId(userId: number, requestedStoreId?: number): Promise<{ storeId: number } | { error: string; status: number }> {
  const s = getOrInit(userId);

  if (requestedStoreId) {
    // Si el agente indica storeId explícito, validar ownership.
    const [store] = await db.select({ id: storesTable.id })
      .from(storesTable)
      .where(and(eq(storesTable.id, requestedStoreId), eq(storesTable.coHostId, userId)))
      .limit(1);
    if (!store) return { error: "storeId no pertenece al dueño de la API Key", status: 403 };
    s.cachedStoreId = store.id;
    return { storeId: store.id };
  }

  if (s.cachedStoreId) {
    // Verificar que la tienda sigue existiendo y siendo del mismo user (defensivo, barato).
    const [store] = await db.select({ id: storesTable.id })
      .from(storesTable)
      .where(and(eq(storesTable.id, s.cachedStoreId), eq(storesTable.coHostId, userId)))
      .limit(1);
    if (store) return { storeId: store.id };
    s.cachedStoreId = null; // invalidar y reintentar
  }

  const stores = await db.select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.coHostId, userId))
    .orderBy(asc(storesTable.id))
    .limit(1);
  if (stores.length === 0) {
    return {
      error: "No tienes ninguna tienda registrada. Crea una tienda en tu panel antes de sincronizar.",
      status: 422,
    };
  }
  s.cachedStoreId = stores[0].id;
  return { storeId: stores[0].id };
}

const router: IRouter = Router();

// Hidrata el estado en memoria con la config persistida (lazy).
async function hydrateState(userId: number): Promise<InMemoryState> {
  const s = getOrInit(userId);
  if (s.config.apiKey) return s; // ya hidratado
  const [row] = await db.select({ apiKey: integrationConfigsTable.apiKey, intervalMin: integrationConfigsTable.intervalMin, updatedAt: integrationConfigsTable.updatedAt })
    .from(integrationConfigsTable)
    .where(eq(integrationConfigsTable.userId, userId))
    .limit(1);
  if (row) {
    s.config = {
      apiKey: row.apiKey,
      intervalMin: row.intervalMin as IntervalMin,
      updatedAt: row.updatedAt.toISOString(),
    };
    s.status = "active";
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/status
router.get(
  "/integrations/status",
  authenticate,
  requireRole(...INTEGRATIONS_ROLES),
  async (req, res) => {
    const userId = req.user!.id;
    const s = await hydrateState(userId);
    res.json({
      status: s.status,
      lastSyncAt: s.lastSyncAt,
      productsSynced: s.productsSynced,
      config: { ...s.config, apiKey: maskKey(s.config.apiKey) },
      logs: buildLogs(s),
      agent: {
        version: "1.0.0-preview",
        downloadUrl: "/downloads/LinkServi-Sync-Agent-Setup-1.0.0.exe",
        docsUrl: "https://linkservi.com/docs/sync-agent",
      },
    });
  },
);

// POST /api/integrations/config — persiste apiKey + intervalMin en DB.
router.post(
  "/integrations/config",
  authenticate,
  requireRole(...INTEGRATIONS_ROLES),
  async (req, res) => {
    const userId = req.user!.id;
    const { apiKey, intervalMin } = req.body ?? {};
    const s = await hydrateState(userId);

    const interval = Number(intervalMin);
    if (!ALLOWED_INTERVALS.includes(interval as IntervalMin)) {
      res.status(400).json({ error: "Frecuencia inválida (5, 15, 30 o 60 minutos)" });
      return;
    }

    let nextApiKey = s.config.apiKey;
    if (apiKey !== undefined && apiKey !== null) {
      if (typeof apiKey !== "string") {
        res.status(400).json({ error: "apiKey debe ser texto" });
        return;
      }
      const trimmed = apiKey.trim();
      if (trimmed.length === 0) {
        res.status(400).json({ error: "La API Key no puede estar vacía" });
        return;
      }
      if (trimmed.length < 8) {
        res.status(400).json({ error: "La API Key debe tener al menos 8 caracteres" });
        return;
      }
      // Aislamiento multi-tenant: si la apiKey ya pertenece a otro user, 409.
      const [conflict] = await db.select({ userId: integrationConfigsTable.userId })
        .from(integrationConfigsTable)
        .where(eq(integrationConfigsTable.apiKey, trimmed))
        .limit(1);
      if (conflict && conflict.userId !== userId) {
        res.status(409).json({ error: "Esa API Key ya está en uso por otra cuenta. Genera una distinta." });
        return;
      }
      nextApiKey = trimmed;
    } else if (!s.config.apiKey) {
      res.status(400).json({ error: "Debes ingresar la API Key del Sync Agent" });
      return;
    }

    // Upsert en DB (cascade cubrirá el delete del user).
    try {
      await db.insert(integrationConfigsTable).values({
        userId,
        apiKey: nextApiKey!,
        intervalMin: interval,
      }).onConflictDoUpdate({
        target: integrationConfigsTable.userId,
        set: { apiKey: nextApiKey!, intervalMin: interval },
      });
    } catch (err: any) {
      logger.error({ userId, err: err?.message }, "integration_configs upsert failed");
      res.status(500).json({ error: "Error guardando configuración" });
      return;
    }

    s.config = {
      apiKey: nextApiKey,
      intervalMin: interval as IntervalMin,
      updatedAt: new Date().toISOString(),
    };
    s.status = "active";
    s.lastSyncAt = new Date().toISOString();
    pushEvent(s, "success", "Configuración actualizada", `Intervalo: ${interval} min`);
    stateByUser.set(userId, s);

    res.json({ ok: true, config: { ...s.config, apiKey: maskKey(s.config.apiKey) } });
  },
);

// POST /api/integrations/sync — disparo manual desde la UI (mock visual)
router.post(
  "/integrations/sync",
  authenticate,
  requireRole(...INTEGRATIONS_ROLES),
  async (req, res) => {
    const userId = req.user!.id;
    const s = await hydrateState(userId);
    if (!s.config.apiKey) {
      res.status(409).json({ error: "Configura primero la API Key del Sync Agent antes de sincronizar." });
      return;
    }
    if (s.status === "syncing") {
      res.status(409).json({ error: "Ya hay una sincronización en curso." });
      return;
    }
    s.status = "syncing";
    pushEvent(s, "progress", "Sincronización manual iniciada", "Disparada desde el panel web");
    stateByUser.set(userId, s);
    setTimeout(() => {
      const cur = stateByUser.get(userId);
      if (!cur) return;
      cur.status = "active";
      cur.lastSyncAt = new Date().toISOString();
      stateByUser.set(userId, cur);
    }, 3000);
    res.json({ ok: true });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/agent/ping — validación rápida de la API Key.
//
// Lo usa el botón "Validar conexión a LinkServi" de la UI local del agente
// para confirmar, ANTES del primer ciclo de sync, que la API Key + apiUrl
// están bien y que el dueño tiene una tienda registrada.
//
// Auth: header `x-api-key`. NO consume el rate limit del push (el rate limit
// del apiKeyAuth sí cuenta — 30/min compartidos — para prevenir abuso).
//
// Respuesta: { ok: true, intervalMin, stores: [{id, name}] }
//   - stores vacío indica al frontend "tienes que crear una tienda primero".
router.get("/integrations/agent/ping", apiKeyAuth, async (req, res): Promise<void> => {
  const userId = (req as any).agentUserId as number;
  const intervalMin = (req as any).agentIntervalMin as number;
  try {
    const stores = await db.select({ id: storesTable.id, name: storesTable.name })
      .from(storesTable)
      .where(eq(storesTable.coHostId, userId))
      .orderBy(asc(storesTable.id))
      .limit(20);
    res.json({
      ok: true,
      intervalMin,
      stores,
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err?.message, userId }, "ping failed");
    res.status(500).json({ error: "Error consultando tiendas" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/products/sync — endpoint REAL del agente.
//
// Auth: header `x-api-key`. Rate limit: 30 req/min por key.
// Body: { products: [{sku, name, price|priceUsd, stock?, description?, category?, image?}], storeId?, agent? }
//
// Lógica: para cada producto, busca por (storeId, externalId=sku):
//   - existe + sin cambios → SKIP
//   - existe + cambió price/stock/name/description/category → UPDATE
//   - no existe → CREATE
// Persiste un import_runs con métricas. Devuelve { updated, created, skipped, errors }.
router.post("/integrations/products/sync", apiKeyAuth, async (req, res): Promise<void> => {
  const userId = (req as any).agentUserId as number;
  const startedAt = Date.now();

  // 1) Validar shape del body
  const parsed = validateSyncBody(req.body ?? {});
  if (!parsed.ok) {
    res.status(parsed.message.includes("Máximo") ? 413 : 400).json({ error: parsed.message });
    return;
  }
  const body = parsed.value;

  // 2) Resolver storeId del dueño de la apiKey
  const resolved = await resolveStoreId(userId, body.storeId);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const storeId = resolved.storeId;

  // 3) Validar cada producto individualmente (no rompemos el batch entero por un row malo)
  const validProducts: NormalizedProduct[] = [];
  const validationErrors: Array<{ index: number; sku: string | null; message: string }> = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < body.products.length; i++) {
    const r = validateProduct(body.products[i]);
    if (!r.ok) {
      validationErrors.push({ index: i, sku: r.sku, message: r.message });
      continue;
    }
    if (seenSkus.has(r.value.sku)) {
      validationErrors.push({ index: i, sku: r.value.sku, message: "sku duplicado en el batch" });
      continue;
    }
    seenSkus.add(r.value.sku);
    validProducts.push(r.value);
  }

  if (validProducts.length === 0) {
    res.status(400).json({
      error: "Ningún producto válido en el batch",
      errors: validationErrors.slice(0, 20),
    });
    return;
  }

  // 4) Crear import_run (status=running)
  const [runRow] = await db.insert(importRunsTable).values({
    storeId,
    status: "running",
    totalDetected: body.products.length,
  }).returning({ id: importRunsTable.id });
  const runId = runRow.id;

  // 5) Bulk fetch de productos existentes para este store con esos SKUs
  const incomingSkus = validProducts.map((p) => p.sku);
  const existingRows = await db.select({
    id: productsTable.id,
    externalId: productsTable.externalId,
    name: productsTable.name,
    description: productsTable.description,
    priceUsd: productsTable.priceUsd,
    stock: productsTable.stock,
    category: productsTable.category,
    image: productsTable.image,
  })
    .from(productsTable)
    .where(and(eq(productsTable.storeId, storeId), inArray(productsTable.externalId, incomingSkus)));

  const existingBySku = new Map<string, (typeof existingRows)[number]>();
  for (const r of existingRows) {
    if (r.externalId) existingBySku.set(r.externalId, r);
  }

  // 6) Diff: clasificar en created / updated / skipped
  const toCreate: typeof validProducts = [];
  const toUpdate: Array<{ id: number; patch: Partial<{ name: string; description: string | null; priceUsd: number; stock: number | null; category: string; image: string | null }> }> = [];
  let skipped = 0;

  for (const p of validProducts) {
    const existing = existingBySku.get(p.sku);
    if (!existing) {
      toCreate.push(p);
      continue;
    }
    const patch: any = {};
    if (existing.name !== p.name) patch.name = p.name;
    if ((existing.description ?? null) !== p.description) patch.description = p.description;
    if (Math.abs((existing.priceUsd ?? 0) - p.priceUsd) > 0.0001) patch.priceUsd = p.priceUsd;
    if ((existing.stock ?? null) !== p.stock) patch.stock = p.stock;
    if (existing.category !== p.category) patch.category = p.category;
    if ((existing.image ?? null) !== p.image) patch.image = p.image;
    if (Object.keys(patch).length === 0) {
      skipped++;
    } else {
      toUpdate.push({ id: existing.id, patch });
    }
  }

  // 7) Persistir. Hacemos INSERT bulk + UPDATEs individuales (por patch heterogéneo).
  const persistErrors: Array<{ sku: string | null; message: string }> = [];
  let created = 0;
  let updated = 0;
  const now = new Date();
  const source = `sync-agent:${(body.agent?.version ?? "unknown")}`;

  if (toCreate.length > 0) {
    try {
      const inserted = await db.insert(productsTable).values(
        toCreate.map((p) => ({
          name: p.name,
          description: p.description,
          priceUsd: p.priceUsd,
          image: p.image,
          category: p.category,
          coHostId: userId,
          storeId,
          externalId: p.sku,
          stock: p.stock,
          condition: "new",
          listingType: "sale",
          source,
          lastSyncedAt: now,
        })),
      ).onConflictDoNothing({ target: [productsTable.storeId, productsTable.externalId] })
        .returning({ id: productsTable.id });
      created = inserted.length;
      // Si onConflictDoNothing absorbió alguno (race con otro push), lo marcamos como skip silencioso.
      const racedOut = toCreate.length - created;
      if (racedOut > 0) skipped += racedOut;
    } catch (err: any) {
      persistErrors.push({ sku: null, message: `Bulk insert falló: ${err?.message?.slice(0, 200) ?? "error"}` });
    }
  }

  for (const u of toUpdate) {
    try {
      await db.update(productsTable)
        .set({ ...u.patch, source, lastSyncedAt: now })
        .where(eq(productsTable.id, u.id));
      updated++;
    } catch (err: any) {
      persistErrors.push({ sku: null, message: `Update id=${u.id} falló: ${err?.message?.slice(0, 200) ?? "error"}` });
    }
  }

  // 8) Cerrar import_run
  const totalErrors = validationErrors.length + persistErrors.length;
  await db.update(importRunsTable).set({
    status: totalErrors > 0 ? "completed" : "completed",
    created,
    updated,
    errors: totalErrors,
    errorLog: totalErrors > 0
      ? JSON.stringify([
          ...validationErrors.slice(0, 50).map((e) => ({ row: e.index + 1, message: `${e.sku ?? "?"}: ${e.message}` })),
          ...persistErrors.slice(0, 50).map((e) => ({ row: 0, message: e.message })),
        ])
      : null,
    finishedAt: new Date(),
  }).where(eq(importRunsTable.id, runId));

  // 9) Actualizar estado en memoria + push event
  const s = getOrInit(userId);
  s.status = "active";
  s.lastSyncAt = new Date().toISOString();
  s.productsSynced = created + updated + skipped;
  pushEvent(
    s,
    totalErrors > 0 ? "warning" : "success",
    totalErrors > 0 ? "Sincronización con avisos" : "Sincronización exitosa",
    `+${created} creados, ${updated} actualizados, ${skipped} sin cambios` +
      (totalErrors > 0 ? `, ${totalErrors} errores` : "") +
      (body.agent?.version ? ` · Agente v${body.agent.version}` : ""),
  );
  stateByUser.set(userId, s);

  const tookMs = Date.now() - startedAt;
  logger.info({ userId, storeId, runId, created, updated, skipped, errors: totalErrors, tookMs }, "Sync agent push");

  // 10) Respuesta (formato spec)
  res.json({
    ok: true,
    runId,
    storeId,
    received: body.products.length,
    valid: validProducts.length,
    invalid: validationErrors.length,
    created,
    updated,
    skipped,
    errors: totalErrors,
    errorSample: totalErrors > 0
      ? [...validationErrors.slice(0, 5), ...persistErrors.slice(0, 5)]
      : [],
    intervalMin: s.config.intervalMin,
    tookMs,
    serverTime: new Date().toISOString(),
  });
});

export default router;
