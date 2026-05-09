import { db, legacyRedirectsTable, systemAlertsTable } from "@workspace/db";
import { sql, gte, eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";

const ALERT_TYPE = "worker_sunset_ready";
const SUNSET_24H_THRESHOLD = 5;          // <5 redirects in last 24h
const SPAM_GUARD_MS = 24 * 60 * 60 * 1000; // 1 alert per day max
const SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000; // check every 6h

export interface LegacyWorkerStatus {
  last24h: number;
  last7d: number;
  uniqueUsers: number;
  readyForRemoval: boolean;
}

/**
 * Compute current legacy /worker traffic snapshot.
 * readyForRemoval = (last24h < 5) OR (last7d == 0)
 */
export async function computeLegacyWorkerStatus(): Promise<LegacyWorkerStatus> {
  const since7  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

  let last24;
  let last7;
  try {
    [last24] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyRedirectsTable)
      .where(gte(legacyRedirectsTable.createdAt, since24));

    [last7] = await db
      .select({
        count:       sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${legacyRedirectsTable.userId})::int`,
      })
      .from(legacyRedirectsTable)
      .where(gte(legacyRedirectsTable.createdAt, since7));
  } catch (err) {
    const message = String((err as any)?.message ?? err);
    if (message.includes('relation "legacy_redirects" does not exist')) {
      logger.warn("[legacy-worker-alerts] legacy_redirects table missing");
      return { last24h: 0, last7d: 0, uniqueUsers: 0, readyForRemoval: false };
    }
    throw err;
  }

  const last24h = last24?.count ?? 0;
  const last7d  = last7?.count ?? 0;
  const uniqueUsers = last7?.uniqueUsers ?? 0;
  const readyForRemoval = last24h < SUNSET_24H_THRESHOLD || last7d === 0;

  return { last24h, last7d, uniqueUsers, readyForRemoval };
}

/**
 * Best-effort webhook fanout. Silent on failure — never throws.
 */
async function postWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.LEGACY_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[legacy-worker-alerts] webhook returned non-2xx");
    }
  } catch (err) {
    logger.warn({ err }, "[legacy-worker-alerts] webhook delivery failed");
  }
}

/**
 * Emit an alert if criteria met AND no alert was sent in the last 24h.
 * Persists the alert in `system_alerts` so the spam-guard survives restarts.
 */
export async function maybeEmitWorkerSunsetAlert(): Promise<{ emitted: boolean; status: LegacyWorkerStatus }> {
  const status = await computeLegacyWorkerStatus();

  if (!status.readyForRemoval) {
    return { emitted: false, status };
  }

  // Spam-guard: was an alert already sent in the last 24h?
  const cutoff = new Date(Date.now() - SPAM_GUARD_MS);
  const [recent] = await db
    .select({ id: systemAlertsTable.id })
    .from(systemAlertsTable)
    .where(and(eq(systemAlertsTable.type, ALERT_TYPE), gte(systemAlertsTable.sentAt, cutoff)))
    .orderBy(desc(systemAlertsTable.sentAt))
    .limit(1);

  if (recent) {
    return { emitted: false, status };
  }

  const payload = {
    event:     ALERT_TYPE,
    last24h:   status.last24h,
    last7d:    status.last7d,
    timestamp: new Date().toISOString(),
  };

  // OPCIÓN 1: console.log (always)
  logger.info(payload, "[migration] /worker ready for removal");

  // OPCIÓN 2: webhook fanout (only if env set)
  await postWebhook(payload);

  // Persist so we don't re-alert tomorrow within 24h.
  try {
    await db.insert(systemAlertsTable).values({ type: ALERT_TYPE, payload });
  } catch (err) {
    logger.warn({ err }, "[legacy-worker-alerts] failed to persist alert state");
  }

  return { emitted: true, status };
}

/**
 * Periodic checker — runs every 6h. Errors are swallowed to avoid crashing
 * the server on transient DB issues.
 */
export function startLegacyWorkerAlertScheduler(): void {
  const tick = async () => {
    try {
      const result = await maybeEmitWorkerSunsetAlert();
      if (result.emitted) {
        logger.info({ status: result.status }, "[legacy-worker-alerts] sunset alert emitted");
      }
    } catch (err) {
      const message = String((err as any)?.message ?? err);
      if (message.includes("connect ETIMEDOUT") || message.includes("ECONNREFUSED") || message.includes("ENETUNREACH")) {
        logger.warn({ err }, "[legacy-worker-alerts] scheduler paused: database unavailable");
        return;
      }
      logger.error({ err }, "[legacy-worker-alerts] scheduler tick failed");
    }
  };

  // First check after 1 minute (give DB pool time to warm up), then every 6h.
  setTimeout(tick, 60 * 1000);
  setInterval(tick, SCHEDULER_INTERVAL_MS);
  logger.info("🔔 Legacy /worker sunset alert scheduler started — first check in 60s");
}
