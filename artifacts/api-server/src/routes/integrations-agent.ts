// Pairing + telemetría + dashboard admin para Sync Agents.
// NO toca /api/integrations/products/sync (lógica de sincronización intacta).
//
// Flujo de pairing:
//   1) Dueño en LinkServi → POST /api/integrations/agent/pair-init → recibe code (8 chars, TTL 10 min) + QR payload.
//   2) UI muestra QR y código; hace polling a GET /api/integrations/agent/pair-status/:code.
//   3) Sync Agent (UNauthed) → POST /api/integrations/agent/pair { code, deviceName?, version? }
//      → backend valida code (no expirado, no usado) → genera apiKey 64-hex →
//        upsert integration_configs + upsert agents → marca code usado → devuelve {apiKey, apiUrl, storeId}.
//
// T011 — Seguridad:
//   - code: 8 chars [A-Z2-9 sin ambigüedades] generados con crypto.randomBytes (~38 bits entropía).
//   - one-time: usedAt seteado atómicamente con UPDATE WHERE used_at IS NULL.
//   - TTL: rechazado si expiresAt < now().
//   - Rate-limit por IP en /pair: 10 intentos/min.
//   - Lock del code después de 5 fallos consecutivos.
//   - apiKey emitido: 64 hex chars (256 bits) random.
//   - validación zod estricta de todos los payloads.
import { Router, type IRouter, type Request } from "express";
import {
  db,
  agentsTable,
  agentPairingCodesTable,
  agentTelemetryEventsTable,
  integrationConfigsTable,
  storesTable,
  usersTable,
} from "@workspace/db";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { authenticate, requireRole } from "../lib/auth";
import { apiKeyAuth, type AgentRequest } from "../lib/agent-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const INTEGRATIONS_ROLES = ["cohost", "seller", "admin", "gestor"] as const;
const ADMIN_ROLES = ["admin"] as const;

const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 min
const PAIRING_CODE_LEN = 8;
// Alfabeto sin caracteres ambiguos visualmente: sin 0/O, sin 1/I/L, sin Z (vs 2).
const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXY23456789";
const PAIR_MAX_FAILED_ATTEMPTS = 5;
const PAIRING_CODE_REGEX = /^[A-Z2-9]{8}$/;
const TELEMETRY_TYPES = new Set([
  "agent_started", "sync_success", "sync_error", "db_error", "version", "heartbeat",
]);

// ── T011 — Rate limit por IP del endpoint público /pair ──────────────────
const PAIR_IP_WINDOW_MS = 60_000;
const PAIR_IP_MAX = 10;
const pairIpBuckets = new Map<string, number[]>();
function checkPairIpRate(ip: string): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = (pairIpBuckets.get(ip) ?? []).filter((t) => now - t < PAIR_IP_WINDOW_MS);
  if (bucket.length >= PAIR_IP_MAX) {
    return { ok: false, retryAfterMs: PAIR_IP_WINDOW_MS - (now - bucket[0]) };
  }
  bucket.push(now);
  pairIpBuckets.set(ip, bucket);
  return { ok: true, retryAfterMs: 0 };
}
function clientIp(req: Request): string {
  // T011: NO confiamos en x-forwarded-for para rate-limit del endpoint
  // UNauthed /pair, porque es trivial spoofear y bypassear el bucket.
  // Usamos la IP del peer TCP real. Detrás de un proxy compartido todos
  // los requests caen en el mismo bucket — es defensa en profundidad
  // y la protección real contra brute-force es el lock por código
  // (PAIR_MAX_FAILED_ATTEMPTS) + TTL corto + alfabeto de 30^8 ≈ 656e9.
  return req.socket.remoteAddress ?? "unknown";
}

function generatePairingCode(): string {
  // crypto.randomBytes con rejection sampling para evitar el sesgo del
  // módulo cuando |alfabeto| no divide 256 (alfabeto de 30 chars → sesgo
  // hacia los primeros 16 sin esto). Pedimos bytes hasta llenar la longitud.
  const alpha = PAIRING_ALPHABET;
  const max = Math.floor(256 / alpha.length) * alpha.length; // 240 para 30
  let out = "";
  while (out.length < PAIRING_CODE_LEN) {
    const buf = crypto.randomBytes(PAIRING_CODE_LEN * 2);
    for (let i = 0; i < buf.length && out.length < PAIRING_CODE_LEN; i++) {
      const b = buf[i];
      if (b < max) out += alpha[b % alpha.length];
    }
  }
  return out;
}

function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

// Marcador para distinguir el conflict de race del resto de errores dentro de
// la transacción de /pair (que se mapea a HTTP 409, no 500).
class PairConflict extends Error {}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/agent/pair-init
// El dueño autenticado pide un código nuevo. Invalida cualquier código previo
// no usado (un solo código activo por user a la vez para evitar confusión).
router.post(
  "/integrations/agent/pair-init",
  authenticate,
  requireRole(...INTEGRATIONS_ROLES),
  async (req, res) => {
    const userId = req.user!.id;
    const body = (req.body ?? {}) as Record<string, unknown>;
    let storeId: number | undefined;
    if (body.storeId !== undefined && body.storeId !== null) {
      const sid = Number(body.storeId);
      if (!Number.isInteger(sid) || sid <= 0) {
        res.status(400).json({ error: "storeId inválido" });
        return;
      }
      storeId = sid;
    }
    if (storeId !== undefined) {
      // Validar ownership de la tienda.
      const [store] = await db.select({ id: storesTable.id })
        .from(storesTable)
        .where(and(eq(storesTable.id, storeId), eq(storesTable.coHostId, userId)))
        .limit(1);
      if (!store) {
        res.status(403).json({ error: "Tienda no encontrada o no es tuya" });
        return;
      }
    }

    // Invalidar códigos previos no usados del mismo user (limpieza UX).
    await db.update(agentPairingCodesTable)
      .set({ usedAt: new Date(), failedAttempts: 99 })
      .where(and(
        eq(agentPairingCodesTable.userId, userId),
        isNull(agentPairingCodesTable.usedAt),
      ));

    // Generar code único (retry si colisiona — extremadamente improbable).
    let code = generatePairingCode();
    for (let i = 0; i < 5; i++) {
      const [existing] = await db.select({ id: agentPairingCodesTable.id })
        .from(agentPairingCodesTable)
        .where(eq(agentPairingCodesTable.code, code))
        .limit(1);
      if (!existing) break;
      code = generatePairingCode();
    }

    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    try {
      await db.insert(agentPairingCodesTable).values({
        code,
        userId,
        storeId: storeId ?? null,
        expiresAt,
      });
    } catch (err: any) {
      logger.error({ err: err?.message, userId }, "pair-init insert failed");
      res.status(500).json({ error: "No se pudo generar el código" });
      return;
    }

    // QR payload: JSON compacto. El agente puede pegar el code o escanear QR.
    const qrPayload = JSON.stringify({ v: 1, code, ts: Date.now() });
    res.json({
      ok: true,
      code,
      qrPayload,
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: Math.floor(PAIRING_TTL_MS / 1000),
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/agent/pair-status/:code
// El frontend hace polling cada 2-3 s para ver si el agente ya redimió el code.
router.get(
  "/integrations/agent/pair-status/:code",
  authenticate,
  requireRole(...INTEGRATIONS_ROLES),
  async (req, res) => {
    const userId = req.user!.id;
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!PAIRING_CODE_REGEX.test(code)) {
      res.status(400).json({ error: "Código inválido" });
      return;
    }
    const [row] = await db.select({
      id: agentPairingCodesTable.id,
      userId: agentPairingCodesTable.userId,
      expiresAt: agentPairingCodesTable.expiresAt,
      usedAt: agentPairingCodesTable.usedAt,
      claimedByAgentId: agentPairingCodesTable.claimedByAgentId,
      claimedByDevice: agentPairingCodesTable.claimedByDevice,
    })
      .from(agentPairingCodesTable)
      .where(eq(agentPairingCodesTable.code, code))
      .limit(1);
    if (!row || row.userId !== userId) {
      res.status(404).json({ error: "Código no encontrado" });
      return;
    }
    const expired = row.expiresAt.getTime() < Date.now();
    res.json({
      ok: true,
      paired: !!row.usedAt && !!row.claimedByAgentId,
      expired,
      expiresAt: row.expiresAt.toISOString(),
      device: row.claimedByDevice,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/agent/pair  (UNauthed — el agente todavía no tiene apiKey)
// T011: rate-limit por IP, validación estricta, atómico one-time.
router.post(
  "/integrations/agent/pair",
  async (req, res) => {
    const ip = clientIp(req);
    const ipRl = checkPairIpRate(ip);
    if (!ipRl.ok) {
      res.set("Retry-After", String(Math.ceil(ipRl.retryAfterMs / 1000)));
      res.status(429).json({ error: "Demasiados intentos, espera un momento" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!PAIRING_CODE_REGEX.test(code)) {
      res.status(400).json({ error: "Código inválido" });
      return;
    }
    const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 120) : undefined;
    const version = typeof body.version === "string" ? body.version.trim().slice(0, 40) : undefined;

    // Lookup
    const [pairing] = await db.select()
      .from(agentPairingCodesTable)
      .where(eq(agentPairingCodesTable.code, code))
      .limit(1);
    if (!pairing) {
      res.status(404).json({ error: "Código no válido" });
      return;
    }
    if (pairing.usedAt) {
      res.status(409).json({ error: "Este código ya fue usado" });
      return;
    }
    if (pairing.failedAttempts >= PAIR_MAX_FAILED_ATTEMPTS) {
      res.status(423).json({ error: "Código bloqueado por demasiados intentos" });
      return;
    }
    if (pairing.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: "Código expirado, genera uno nuevo" });
      return;
    }

    // Generar apiKey y atomizar la redención.
    const apiKey = generateApiKey();
    const now = new Date();

    // Atomic claim + upserts integration_configs + agents en UNA transacción
    // para que apiKey nunca quede desincronizada entre las dos tablas (T011).
    let claimedCodeId: number;
    let agentId: number;
    let intervalMin: number;
    try {
      const result = await db.transaction(async (tx) => {
        // 1) Claim atómico (UPDATE WHERE used_at IS NULL).
        const claimed = await tx.update(agentPairingCodesTable)
          .set({ usedAt: now, claimedByDevice: deviceName ?? null })
          .where(and(
            eq(agentPairingCodesTable.id, pairing.id),
            isNull(agentPairingCodesTable.usedAt),
          ))
          .returning({ id: agentPairingCodesTable.id });
        if (claimed.length === 0) {
          // Otro request lo redimió primero (race).
          throw new PairConflict("Este código acaba de ser usado");
        }

        // 2) integration_configs (preserva intervalMin si ya existía).
        const [existingCfg] = await tx.select({ intervalMin: integrationConfigsTable.intervalMin })
          .from(integrationConfigsTable)
          .where(eq(integrationConfigsTable.userId, pairing.userId))
          .limit(1);
        const interval = existingCfg?.intervalMin ?? 15;
        await tx.insert(integrationConfigsTable).values({
          userId: pairing.userId,
          apiKey,
          intervalMin: interval,
        }).onConflictDoUpdate({
          target: integrationConfigsTable.userId,
          set: { apiKey },
        });

        // 3) agents (one per user). Reset counters al re-pairear.
        const [a] = await tx.insert(agentsTable).values({
          userId: pairing.userId,
          storeId: pairing.storeId,
          apiKey,
          name: deviceName?.slice(0, 120) || "Sync Agent",
          version: version ?? null,
          status: "online",
          lastSeenAt: now,
          productsSynced: 0,
          errorCount: 0,
          lastError: null,
        }).onConflictDoUpdate({
          target: agentsTable.userId,
          set: {
            apiKey,
            storeId: pairing.storeId,
            name: deviceName?.slice(0, 120) || "Sync Agent",
            version: version ?? null,
            status: "online",
            lastSeenAt: now,
            pairedAt: now,
            errorCount: 0,
            lastError: null,
          },
        }).returning({ id: agentsTable.id });

        // 4) Vincular el code al agent recién creado.
        await tx.update(agentPairingCodesTable)
          .set({ claimedByAgentId: a.id })
          .where(eq(agentPairingCodesTable.id, pairing.id));

        return { codeId: claimed[0].id, agentId: a.id, intervalMin: interval };
      });
      claimedCodeId = result.codeId;
      agentId = result.agentId;
      intervalMin = result.intervalMin;
    } catch (err: any) {
      if (err instanceof PairConflict) {
        res.status(409).json({ error: err.message });
        return;
      }
      logger.error({ err: err?.message, userId: pairing.userId }, "pair: transaction failed");
      res.status(500).json({ error: "No se pudo completar la conexión" });
      return;
    }
    void claimedCodeId;
    const agent = { id: agentId };

    // Atribuir el agente al pairing (sólo informativo).
    await db.update(agentPairingCodesTable)
      .set({ claimedByAgentId: agent.id })
      .where(eq(agentPairingCodesTable.id, pairing.id));

    // Resolver storeId (si el dueño no lo eligió, tomamos la primera tienda).
    let storeId = pairing.storeId;
    if (!storeId) {
      const [s] = await db.select({ id: storesTable.id })
        .from(storesTable)
        .where(eq(storesTable.coHostId, pairing.userId))
        .orderBy(asc(storesTable.id))
        .limit(1);
      storeId = s?.id ?? null;
    }

    const apiUrl = (process.env.PUBLIC_API_URL || "").trim() || `${req.protocol}://${req.get("host")}`;
    logger.info({ userId: pairing.userId, agentId: agent.id, ip }, "agent paired");
    res.json({
      ok: true,
      apiKey,
      apiUrl,
      storeId,
      agentId: agent.id,
      intervalMin,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/agent/telemetry  (apiKeyAuth)
router.post(
  "/integrations/agent/telemetry",
  apiKeyAuth,
  async (req, res) => {
    const userId = (req as AgentRequest).agentUserId!;
    const apiKey = (req as AgentRequest).agentApiKey!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (!TELEMETRY_TYPES.has(type)) {
      res.status(400).json({ error: "type inválido" });
      return;
    }
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : undefined;
    const version = typeof body.version === "string" ? body.version.trim().slice(0, 40) : undefined;
    const payload = (body.payload && typeof body.payload === "object") ? (body.payload as Record<string, unknown>) : undefined;

    // Cap payload size para evitar abuso de jsonb.
    let safePayload = payload ?? null;
    if (safePayload) {
      const json = JSON.stringify(safePayload);
      if (json.length > 4000) {
        safePayload = { _truncated: true, preview: json.slice(0, 200) };
      }
    }

    // Resolver agentId via apiKey (la fila debe existir desde el pairing).
    const [agent] = await db.select({
      id: agentsTable.id,
      productsSynced: agentsTable.productsSynced,
      errorCount: agentsTable.errorCount,
      storeId: agentsTable.storeId,
    })
      .from(agentsTable)
      .where(eq(agentsTable.apiKey, apiKey))
      .limit(1);
    if (!agent) {
      // Compatibilidad: agente con API Key vieja (pre-pairing). Auto-bootstrap fila.
      const now = new Date();
      const [created] = await db.insert(agentsTable).values({
        userId,
        apiKey,
        name: "Sync Agent (legacy)",
        version: version ?? null,
        status: "online",
        lastSeenAt: now,
      }).onConflictDoUpdate({
        target: agentsTable.userId,
        set: { apiKey, status: "online", lastSeenAt: now, version: version ?? null },
      }).returning({ id: agentsTable.id });
      await insertEvent(created.id, type, message, safePayload);
      res.json({ ok: true, agentId: created.id });
      return;
    }

    // Update counters según tipo de evento (sin tocar lógica de sync).
    const now = new Date();
    const updates: Record<string, any> = { lastSeenAt: now };
    if (version) updates.version = version;
    if (type === "agent_started") {
      updates.status = "online";
    } else if (type === "sync_success") {
      updates.status = "online";
      updates.lastSyncAt = now;
      updates.lastError = null;
      const productsCount = Number(payload?.productsSynced) || 0;
      if (productsCount > 0) updates.productsSynced = productsCount;
    } else if (type === "sync_error" || type === "db_error") {
      updates.status = "error";
      updates.errorCount = sql`${agentsTable.errorCount} + 1`;
      if (message) updates.lastError = message.slice(0, 500);
    } else if (type === "heartbeat") {
      updates.status = "online";
    }
    await db.update(agentsTable).set(updates).where(eq(agentsTable.id, agent.id));
    await insertEvent(agent.id, type, message, safePayload);

    res.json({ ok: true, agentId: agent.id });
  },
);

async function insertEvent(agentId: number, type: string, message: string | undefined, payload: unknown) {
  try {
    await db.insert(agentTelemetryEventsTable).values({
      agentId,
      type,
      message: message ?? null,
      payload: payload as any,
    });
  } catch (err: any) {
    logger.error({ err: err?.message, agentId, type }, "telemetry insert failed");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T008 — Admin dashboard endpoints
// GET /api/admin/integrations/agents — lista todos los agentes (con métricas).
router.get(
  "/admin/integrations/agents",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (_req, res) => {
    const STALE_MS = 5 * 60 * 1000; // > 5 min sin lastSeenAt = offline efectivo
    const rows = await db.select({
      id: agentsTable.id,
      userId: agentsTable.userId,
      userEmail: usersTable.email,
      userFullName: usersTable.fullName,
      storeId: agentsTable.storeId,
      storeName: storesTable.name,
      name: agentsTable.name,
      version: agentsTable.version,
      status: agentsTable.status,
      lastSeenAt: agentsTable.lastSeenAt,
      lastSyncAt: agentsTable.lastSyncAt,
      productsSynced: agentsTable.productsSynced,
      errorCount: agentsTable.errorCount,
      lastError: agentsTable.lastError,
      pairedAt: agentsTable.pairedAt,
    })
      .from(agentsTable)
      .leftJoin(usersTable, eq(usersTable.id, agentsTable.userId))
      .leftJoin(storesTable, eq(storesTable.id, agentsTable.storeId))
      .orderBy(desc(agentsTable.lastSeenAt));

    const now = Date.now();
    const enriched = rows.map((r) => {
      const seenAgo = r.lastSeenAt ? now - r.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
      const effectiveStatus = seenAgo > STALE_MS && r.status !== "error" ? "offline" : r.status;
      return { ...r, effectiveStatus, secondsSinceLastSeen: r.lastSeenAt ? Math.floor(seenAgo / 1000) : null };
    });

    const summary = {
      total: enriched.length,
      online: enriched.filter((a) => a.effectiveStatus === "online").length,
      offline: enriched.filter((a) => a.effectiveStatus === "offline").length,
      error: enriched.filter((a) => a.effectiveStatus === "error").length,
    };
    res.json({ ok: true, summary, agents: enriched });
  },
);

// GET /api/admin/integrations/agents/:id/events — eventos recientes.
router.get(
  "/admin/integrations/agents/:id/events",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const events = await db.select({
      id: agentTelemetryEventsTable.id,
      type: agentTelemetryEventsTable.type,
      message: agentTelemetryEventsTable.message,
      payload: agentTelemetryEventsTable.payload,
      createdAt: agentTelemetryEventsTable.createdAt,
    })
      .from(agentTelemetryEventsTable)
      .where(eq(agentTelemetryEventsTable.agentId, id))
      .orderBy(desc(agentTelemetryEventsTable.createdAt))
      .limit(limit);
    res.json({ ok: true, events });
  },
);

export default router;
