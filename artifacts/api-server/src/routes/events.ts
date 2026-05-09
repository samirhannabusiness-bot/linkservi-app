import { Router } from "express";
import { db, eventsTable, workersTable, usersTable } from "@workspace/db";
import { eq, and, sql, count, gte, inArray } from "drizzle-orm";
import { authenticate } from "../lib/auth";
import jwt from "jsonwebtoken";
import { subDays } from "date-fns";

const router = Router();

function tryGetUserId(authHeader?: string): number | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), secret) as { userId: number };
    return payload.userId ?? null;
  } catch { return null; }
}

// ── POST /api/events — fire-and-forget event tracking ─────────────────────────
// No auth required. Fails silently to never block the user flow.
router.post("/events", async (req, res): Promise<void> => {
  try {
    const { event, meta, sessionId } = req.body;
    if (!event || typeof event !== "string") { res.json({ ok: true }); return; }

    const userId = tryGetUserId(req.headers.authorization);

    await db.insert(eventsTable).values({
      event: event.slice(0, 64),
      userId: userId ?? null,
      meta: meta ? JSON.stringify(meta).slice(0, 512) : null,
      sessionId: sessionId ? String(sessionId).slice(0, 64) : null,
    });

    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ── GET /api/admin/analytics/conversion ───────────────────────────────────────
// Conversion funnel metrics for the admin panel.
router.get("/admin/analytics/conversion", authenticate, async (req, res): Promise<void> => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Solo admin" }); return;
    }

    const period = (req.query.period as string) ?? "7d";
    const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;
    const since = subDays(new Date(), days);

    const countEvent = async (evt: string) => {
      const [row] = await db
        .select({ cnt: count() })
        .from(eventsTable)
        .where(and(
          eq(eventsTable.event, evt),
          gte(eventsTable.createdAt, since),
        ));
      return Number(row?.cnt ?? 0);
    };

    const countEventUnique = async (evt: string) => {
      const [row] = await db
        .select({ cnt: sql<number>`COUNT(DISTINCT COALESCE(session_id, CAST(id AS text)))` })
        .from(eventsTable)
        .where(and(
          eq(eventsTable.event, evt),
          gte(eventsTable.createdAt, since),
        ));
      return Number(row?.cnt ?? 0);
    };

    const [
      searchClicks,
      contactClicks,
      loginWallRegister,
      loginWallLogin,
      bookingSent,
      profileViews,
    ] = await Promise.all([
      countEvent("search_click"),
      countEvent("contact_click"),
      countEvent("loginwall_register"),
      countEvent("loginwall_login"),
      countEvent("booking_sent"),
      countEvent("profile_view"),
    ]);

    const contactRate = profileViews > 0 ? +((contactClicks / profileViews) * 100).toFixed(1) : null;
    const bookingRate = contactClicks > 0 ? +((bookingSent / contactClicks) * 100).toFixed(1) : null;
    const registrationRate = (loginWallRegister + loginWallLogin) > 0
      ? +((loginWallRegister / (loginWallRegister + loginWallLogin)) * 100).toFixed(1)
      : null;

    res.json({
      period,
      searchClicks,
      contactClicks,
      loginWallRegister,
      loginWallLogin,
      bookingSent,
      profileViews,
      contactRate,
      bookingRate,
      registrationRate,
      funnel: [
        { step: "Buscaron profesional", count: searchClicks, key: "search" },
        { step: "Vieron perfil",         count: profileViews,  key: "profile" },
        { step: "Intentaron contactar",  count: contactClicks, key: "contact" },
        { step: "Completaron registro",  count: loginWallRegister + loginWallLogin, key: "register" },
        { step: "Enviaron solicitud",    count: bookingSent,   key: "booking" },
      ],
    });
  } catch (err) {
    console.error("[conversion analytics]", err);
    res.status(500).json({ error: "Error" });
  }
});

// ── GET /api/admin/analytics/top-profiles ─────────────────────────────────────
// Returns top workers by profile_view and contact_click events.
router.get("/admin/analytics/top-profiles", authenticate, async (req, res): Promise<void> => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Solo admin" }); return;
    }

    const period = (req.query.period as string) ?? "7d";
    const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;
    const since = subDays(new Date(), days);

    // Extract workerId from JSON meta using PostgreSQL JSON operator
    // meta is stored as text, so cast to json then extract 'workerId'
    const topViewed = await db.execute(sql`
      SELECT
        (meta::json->>'workerId')::int AS worker_id,
        COUNT(*) AS views
      FROM events
      WHERE event = 'profile_view'
        AND created_at >= ${since}
        AND meta IS NOT NULL
        AND meta::json->>'workerId' IS NOT NULL
      GROUP BY (meta::json->>'workerId')::int
      ORDER BY views DESC
      LIMIT 5
    `);

    const topContacted = await db.execute(sql`
      SELECT
        (meta::json->>'workerId')::int AS worker_id,
        COUNT(*) AS contacts
      FROM events
      WHERE event = 'contact_click'
        AND created_at >= ${since}
        AND meta IS NOT NULL
        AND meta::json->>'workerId' IS NOT NULL
      GROUP BY (meta::json->>'workerId')::int
      ORDER BY contacts DESC
      LIMIT 5
    `);

    // Resolve worker names + avatars for the found IDs
    const allWorkerIds = Array.from(new Set([
      ...(topViewed.rows as any[]).map(r => Number(r.worker_id)),
      ...(topContacted.rows as any[]).map(r => Number(r.worker_id)),
    ])).filter(Boolean);

    let workerNames: Record<number, { name: string; avatar: string | null }> = {};

    if (allWorkerIds.length > 0) {
      const workers = await db
        .select({
          workerId: workersTable.id,
          name: usersTable.name,
          avatar: usersTable.avatarUrl,
        })
        .from(workersTable)
        .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
        .where(inArray(workersTable.id, allWorkerIds));

      for (const w of workers) {
        workerNames[w.workerId] = { name: w.name ?? "Profesional", avatar: w.avatar ?? null };
      }
    }

    const enrich = (rows: any[], countField: string) =>
      rows.map(r => ({
        workerId: Number(r.worker_id),
        count: Number(r[countField]),
        name: workerNames[Number(r.worker_id)]?.name ?? `Worker #${r.worker_id}`,
        avatar: workerNames[Number(r.worker_id)]?.avatar ?? null,
      }));

    res.json({
      topViewed: enrich(topViewed.rows as any[], "views"),
      topContacted: enrich(topContacted.rows as any[], "contacts"),
    });
  } catch (err) {
    console.error("[top-profiles]", err);
    res.status(500).json({ error: "Error al obtener top perfiles" });
  }
});

export default router;
