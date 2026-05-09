import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { db, legacyRedirectsTable } from "@workspace/db";
import { sql, gte, desc } from "drizzle-orm";
import crypto from "crypto";
import { authenticate, requireRole } from "../lib/auth";
import { computeLegacyWorkerStatus } from "../lib/legacy-worker-alerts";

const router = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "";

const MAX_LEN = 512;
const truncate = (v: unknown, n = MAX_LEN): string | null => {
  if (typeof v !== "string") return null;
  return v.length > n ? v.slice(0, n) : v;
};

const hashIp = (ip: string | undefined): string | null => {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
};

// Best-effort token parse — NEVER blocks, NEVER throws upward. Stale/invalid
// tokens fall through as anonymous so we keep counting redirects accurately.
const tryExtractUserId = (req: Request): number | null => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !JWT_SECRET) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: number };
    return typeof payload?.userId === "number" ? payload.userId : null;
  } catch {
    return null;
  }
};

router.post("/logs/legacy-worker-redirect", async (req: Request, res: Response) => {
  try {
    const { fromPath, toPath } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof fromPath !== "string" || typeof toPath !== "string") {
      res.status(400).json({ ok: false, error: "fromPath and toPath required" });
      return;
    }
    if (!fromPath.startsWith("/worker")) {
      res.status(204).end();
      return;
    }

    const userId = tryExtractUserId(req);
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      || req.socket.remoteAddress
      || undefined;

    await db.insert(legacyRedirectsTable).values({
      fromPath: truncate(fromPath, MAX_LEN)!,
      toPath:   truncate(toPath, MAX_LEN)!,
      userId,
      userAgent: truncate(req.headers["user-agent"]),
      referer:   truncate(req.headers["referer"]),
      ipHash:    hashIp(ip),
    });
    res.status(204).end();
  } catch (err) {
    console.error("[logs/legacy-worker-redirect]", err);
    res.status(204).end();
  }
});

router.get(
  "/admin/legacy-worker/stats",
  authenticate,
  requireRole("admin"),
  async (_req: Request, res: Response) => {
    try {
      const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [totals] = await db
        .select({
          total: sql<number>`count(*)::int`,
          uniqueUsers: sql<number>`count(distinct ${legacyRedirectsTable.userId})::int`,
        })
        .from(legacyRedirectsTable);

      const [last7] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(legacyRedirectsTable)
        .where(gte(legacyRedirectsTable.createdAt, since7));

      const [last24] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(legacyRedirectsTable)
        .where(gte(legacyRedirectsTable.createdAt, since24));

      const byDay = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${legacyRedirectsTable.createdAt}), 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
          uniqueUsers: sql<number>`count(distinct ${legacyRedirectsTable.userId})::int`,
        })
        .from(legacyRedirectsTable)
        .where(gte(legacyRedirectsTable.createdAt, since7))
        .groupBy(sql`date_trunc('day', ${legacyRedirectsTable.createdAt})`)
        .orderBy(sql`date_trunc('day', ${legacyRedirectsTable.createdAt}) desc`);

      const topPaths = await db
        .select({
          fromPath: legacyRedirectsTable.fromPath,
          count: sql<number>`count(*)::int`,
        })
        .from(legacyRedirectsTable)
        .where(gte(legacyRedirectsTable.createdAt, since7))
        .groupBy(legacyRedirectsTable.fromPath)
        .orderBy(desc(sql`count(*)`))
        .limit(20);

      const [authedSplit] = await db
        .select({
          authed: sql<number>`count(*) filter (where ${legacyRedirectsTable.userId} is not null)::int`,
          anon:   sql<number>`count(*) filter (where ${legacyRedirectsTable.userId} is null)::int`,
        })
        .from(legacyRedirectsTable)
        .where(gte(legacyRedirectsTable.createdAt, since7));

      res.json({
        ok: true,
        total: totals?.total ?? 0,
        uniqueUsers: totals?.uniqueUsers ?? 0,
        last24h: last24?.count ?? 0,
        last7d: last7?.count ?? 0,
        authedLast7d: authedSplit?.authed ?? 0,
        anonLast7d: authedSplit?.anon ?? 0,
        byDay,
        topPaths,
        sunsetCriteria: {
          dailyThreshold: 5,
          consecutiveDaysAtZero: 7,
          ready: (last24?.count ?? 0) < 5,
        },
      });
    } catch (err) {
      console.error("[admin/legacy-worker/stats]", err);
      res.status(500).json({ ok: false, error: "stats_failed" });
    }
  },
);

// ── Phase 2: lightweight status endpoint for sunset readiness ───────────────
router.get(
  "/admin/legacy-worker/status",
  authenticate,
  requireRole("admin"),
  async (_req: Request, res: Response) => {
    try {
      const status = await computeLegacyWorkerStatus();
      res.json({ ok: true, ...status });
    } catch (err) {
      console.error("[admin/legacy-worker/status]", err);
      res.status(500).json({ ok: false, error: "status_failed" });
    }
  },
);

export default router;
