// Auth + rate-limit del Sync Agent (header `x-api-key`).
// Extraído de routes/integrations.ts para que pairing/telemetry usen el mismo
// middleware sin duplicar la lógica de búsqueda en DB ni los buckets de rate
// limit (compartir el mismo Map evita que un agente abusivo evada el límite
// alternando entre `/products/sync` y `/agent/telemetry`).
import type { Request, Response, NextFunction } from "express";
import { db, integrationConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60; // ↑ desde 30 — pairing+telemetry+sync comparten bucket
const rateBuckets = new Map<string, number[]>();

export function checkAgentRateLimit(apiKey: string): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = (rateBuckets.get(apiKey) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - bucket[0]) };
  }
  bucket.push(now);
  rateBuckets.set(apiKey, bucket);
  return { ok: true, retryAfterMs: 0 };
}

export interface AgentRequest extends Request {
  agentUserId?: number;
  agentIntervalMin?: number;
  agentApiKey?: string;
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const headerKey = req.header("x-api-key") ?? req.header("X-Api-Key");
  if (!headerKey || typeof headerKey !== "string") {
    res.status(401).json({ error: "Falta header x-api-key" });
    return;
  }
  const trimmed = headerKey.trim();
  try {
    const [row] = await db.select({
      userId: integrationConfigsTable.userId,
      intervalMin: integrationConfigsTable.intervalMin,
    })
      .from(integrationConfigsTable)
      .where(eq(integrationConfigsTable.apiKey, trimmed))
      .limit(1);
    if (!row) {
      res.status(401).json({ error: "API Key inválida" });
      return;
    }
    const rl = checkAgentRateLimit(trimmed);
    if (!rl.ok) {
      res.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
      res.status(429).json({
        error: `Rate limit excedido (${RATE_LIMIT_MAX} req/min). Reintenta en ${Math.ceil(rl.retryAfterMs / 1000)}s.`,
      });
      return;
    }
    (req as AgentRequest).agentUserId = row.userId;
    (req as AgentRequest).agentIntervalMin = row.intervalMin;
    (req as AgentRequest).agentApiKey = trimmed;
    next();
  } catch (err: any) {
    logger.error({ err: err?.message }, "apiKeyAuth lookup failed");
    res.status(500).json({ error: "Error verificando API Key" });
  }
}
