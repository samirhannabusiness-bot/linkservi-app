import { Router } from "express";
import { db, bookingsTable, reviewsTable, workersTable, usersTable, userVerificationsTable, cohostInvitationsTable, eventsTable } from "@workspace/db";
import { eq, and, sql, count, avg, sum, isNotNull } from "drizzle-orm";
import { authenticate, requireRole, requireAdminRole } from "../lib/auth";
import { subDays, startOfWeek, format } from "date-fns";

const router = Router();

// GET /api/workers/me/analytics — detailed analytics for the logged-in worker
router.get("/workers/me/analytics", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "worker" && user.secondaryRole !== "worker") {
    res.status(403).json({ error: "Solo los profesionales pueden ver sus analíticas" });
    return;
  }

  const [workerRow] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.userId, user.id));

  if (!workerRow) { res.status(404).json({ error: "Perfil de profesional no encontrado" }); return; }

  const wId = workerRow.id;

  // ── Booking status breakdown ─────────────────────────────────────────────
  const statusRows = await db
    .select({ status: bookingsTable.status, cnt: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.workerId, wId))
    .groupBy(bookingsTable.status);

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.cnt);

  // ── Weekly earnings (last 8 weeks) ───────────────────────────────────────
  const weeklyEarnings: { week: string; earnings: number; jobs: number }[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const weekStart = startOfWeek(subDays(now, i * 7), { weekStartsOn: 1 });
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [row] = await db
      .select({ total: sum(bookingsTable.workerEarnings), jobs: count() })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.workerId, wId),
          eq(bookingsTable.status, "completed"),
          sql`${bookingsTable.completedAt} >= ${weekStart.toISOString()}`,
          sql`${bookingsTable.completedAt} < ${weekEnd.toISOString()}`,
        ),
      );

    weeklyEarnings.push({
      week: format(weekStart, "dd MMM"),
      earnings: Math.round(Number(row?.total ?? 0) * 100) / 100,
      jobs: Number(row?.jobs ?? 0),
    });
  }

  // ── Monthly earnings (last 6 months) ────────────────────────────────────
  const monthlyEarnings: { month: string; earnings: number; jobs: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);

    const [row] = await db
      .select({ total: sum(bookingsTable.workerEarnings), jobs: count() })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.workerId, wId),
          eq(bookingsTable.status, "completed"),
          sql`${bookingsTable.completedAt} >= ${d.toISOString()}`,
          sql`${bookingsTable.completedAt} < ${nextMonth.toISOString()}`,
        ),
      );

    monthlyEarnings.push({
      month: format(d, "MMM yyyy"),
      earnings: Math.round(Number(row?.total ?? 0) * 100) / 100,
      jobs: Number(row?.jobs ?? 0),
    });
  }

  // ── Review trend (last 10 reviews) ───────────────────────────────────────
  const recentReviews = await db
    .select({ rating: reviewsTable.rating, createdAt: reviewsTable.createdAt })
    .from(reviewsTable)
    .where(eq(reviewsTable.workerId, wId))
    .orderBy(sql`${reviewsTable.createdAt} DESC`)
    .limit(10);

  // ── Acceptance rate ───────────────────────────────────────────────────────
  const total = Object.values(byStatus).reduce((s, v) => s + v, 0);
  const accepted = (byStatus["accepted"] ?? 0) + (byStatus["payment_pending"] ?? 0)
    + (byStatus["payment_confirmed"] ?? 0) + (byStatus["in_progress"] ?? 0)
    + (byStatus["finished"] ?? 0) + (byStatus["completed"] ?? 0);
  const rejected = byStatus["cancelled"] ?? 0;
  const acceptanceRate = total > 0 ? Math.round((accepted / Math.max(1, accepted + rejected)) * 100) : null;

  // ── All-time totals ───────────────────────────────────────────────────────
  const totalEarnings = Math.max(0, (workerRow.earnings ?? 0) * 0.9);
  const completedJobs = workerRow.completedJobs ?? 0;
  const avgRating = workerRow.rating ?? 0;

  res.json({
    totalEarnings,
    completedJobs,
    avgRating,
    reviewCount: workerRow.reviewCount ?? 0,
    acceptanceRate,
    byStatus,
    weeklyEarnings,
    monthlyEarnings,
    recentReviews: recentReviews.map((r) => ({
      rating: r.rating,
      date: r.createdAt,
    })),
  });
});

// ─── Admin Executive Analytics ──────────────────────────────────────────────
// GET /api/admin/analytics?period=24h|7d|30d
router.get("/admin/analytics", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Acceso solo para admins" });
    return;
  }

  const period = (req.query.period as string) ?? "30d";
  const now = new Date();

  let periodStart: Date;
  let prevPeriodStart: Date;
  let days: number;

  if (period === "24h") {
    periodStart = subDays(now, 1);
    prevPeriodStart = subDays(now, 2);
    days = 1;
  } else if (period === "7d") {
    periodStart = subDays(now, 7);
    prevPeriodStart = subDays(now, 14);
    days = 7;
  } else {
    periodStart = subDays(now, 30);
    prevPeriodStart = subDays(now, 60);
    days = 30;
  }

  // ── GMV (current vs prev period) ────────────────────────────────────────
  const [gmvRow] = await db
    .select({ gmv: sum(bookingsTable.totalAmount) })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        sql`${bookingsTable.completedAt} >= ${periodStart.toISOString()}`,
        sql`${bookingsTable.completedAt} < ${now.toISOString()}`,
      ),
    );

  const [gmvPrevRow] = await db
    .select({ gmv: sum(bookingsTable.totalAmount) })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        sql`${bookingsTable.completedAt} >= ${prevPeriodStart.toISOString()}`,
        sql`${bookingsTable.completedAt} < ${periodStart.toISOString()}`,
      ),
    );

  const gmv = Number(gmvRow?.gmv ?? 0);
  const gmvPrev = Number(gmvPrevRow?.gmv ?? 0);
  const gmvGrowth = gmvPrev > 0 ? ((gmv - gmvPrev) / gmvPrev) * 100 : 0;

  // ── New users (CAC proxy) ────────────────────────────────────────────────
  const [newUsersRow] = await db
    .select({ cnt: count() })
    .from(usersTable)
    .where(sql`${usersTable.createdAt} >= ${periodStart.toISOString()}`);

  const [newUsersPrevRow] = await db
    .select({ cnt: count() })
    .from(usersTable)
    .where(
      and(
        sql`${usersTable.createdAt} >= ${prevPeriodStart.toISOString()}`,
        sql`${usersTable.createdAt} < ${periodStart.toISOString()}`,
      ),
    );

  const newUsers = Number(newUsersRow?.cnt ?? 0);
  const newUsersPrev = Number(newUsersPrevRow?.cnt ?? 0);
  const userGrowth = newUsersPrev > 0 ? ((newUsers - newUsersPrev) / newUsersPrev) * 100 : 0;

  // ── Total users (all time) ───────────────────────────────────────────────
  const [totalUsersRow] = await db
    .select({ cnt: count() })
    .from(usersTable)
    .where(sql`${usersTable.role} != 'admin'`);

  const totalUsers = Number(totalUsersRow?.cnt ?? 0);

  // ── Completed bookings in period ─────────────────────────────────────────
  const [completedRow] = await db
    .select({ cnt: count() })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        sql`${bookingsTable.completedAt} >= ${periodStart.toISOString()}`,
      ),
    );

  const [completedPrevRow] = await db
    .select({ cnt: count() })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        sql`${bookingsTable.completedAt} >= ${prevPeriodStart.toISOString()}`,
        sql`${bookingsTable.completedAt} < ${periodStart.toISOString()}`,
      ),
    );

  const completedBookings = Number(completedRow?.cnt ?? 0);
  const completedPrev = Number(completedPrevRow?.cnt ?? 0);
  const bookingGrowth = completedPrev > 0 ? ((completedBookings - completedPrev) / completedPrev) * 100 : 0;

  // ── Churn Rate (users with no bookings in period vs all users before period) ──
  const [activeInPeriod] = await db
    .select({ cnt: count() })
    .from(bookingsTable)
    .where(
      sql`${bookingsTable.createdAt} >= ${periodStart.toISOString()}`,
    );

  const activeClientIds = new Set<number>();
  const activeSample = await db
    .select({ clientId: bookingsTable.clientId })
    .from(bookingsTable)
    .where(sql`${bookingsTable.createdAt} >= ${periodStart.toISOString()}`);
  activeSample.forEach(r => activeClientIds.add(r.clientId));

  const [clientsBeforePeriod] = await db
    .select({ cnt: count() })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "client"),
        sql`${usersTable.createdAt} < ${periodStart.toISOString()}`,
      ),
    );

  const totalClientsBeforePeriod = Number(clientsBeforePeriod?.cnt ?? 0);
  const churnRate = totalClientsBeforePeriod > 0
    ? Math.max(0, Math.min(100, ((totalClientsBeforePeriod - activeClientIds.size) / totalClientsBeforePeriod) * 100))
    : 0;

  // ── Platform commission (revenue) ────────────────────────────────────────
  const [commRow] = await db
    .select({ comm: sum(bookingsTable.commission) })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        sql`${bookingsTable.completedAt} >= ${periodStart.toISOString()}`,
      ),
    );

  const commissions = Number(commRow?.comm ?? 0);

  // ── Role breakdown ───────────────────────────────────────────────────────
  const roleRows = await db
    .select({ role: usersTable.role, cnt: count() })
    .from(usersTable)
    .where(sql`${usersTable.role} != 'admin'`)
    .groupBy(usersTable.role);

  const roleBreakdown = roleRows.map(r => ({ role: r.role, count: Number(r.cnt) }));

  // ── Daily trend (last N days) ────────────────────────────────────────────
  const numDays = Math.min(days, 30);
  const dailyUsers: { date: string; users: number }[] = [];
  const dailyRevenue: { date: string; gmv: number; commission: number }[] = [];

  for (let i = numDays - 1; i >= 0; i--) {
    const dayStart = subDays(now, i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const [uRow] = await db
      .select({ cnt: count() })
      .from(usersTable)
      .where(
        and(
          sql`${usersTable.createdAt} >= ${dayStart.toISOString()}`,
          sql`${usersTable.createdAt} <= ${dayEnd.toISOString()}`,
        ),
      );

    const [rRow] = await db
      .select({ gmv: sum(bookingsTable.totalAmount), comm: sum(bookingsTable.commission) })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.status, "completed"),
          sql`${bookingsTable.completedAt} >= ${dayStart.toISOString()}`,
          sql`${bookingsTable.completedAt} <= ${dayEnd.toISOString()}`,
        ),
      );

    const label = format(dayStart, numDays <= 1 ? "HH:mm" : numDays <= 7 ? "EEE dd" : "dd MMM");
    dailyUsers.push({ date: label, users: Number(uRow?.cnt ?? 0) });
    dailyRevenue.push({
      date: label,
      gmv: Math.round(Number(rRow?.gmv ?? 0) * 100) / 100,
      commission: Math.round(Number(rRow?.comm ?? 0) * 100) / 100,
    });
  }

  // ── Pending verifications ────────────────────────────────────────────────
  const [pendingVerRow] = await db
    .select({ cnt: count() })
    .from(userVerificationsTable)
    .where(eq(userVerificationsTable.status, "pending"));

  res.json({
    period,
    periodStart: periodStart.toISOString(),
    gmv,
    gmvGrowth,
    newUsers,
    userGrowth,
    totalUsers,
    completedBookings,
    bookingGrowth,
    churnRate,
    commissions,
    roleBreakdown,
    dailyUsers,
    dailyRevenue,
    pendingVerifications: Number(pendingVerRow?.cnt ?? 0),
  });
});

// ─── Admin Co-Host Teams View ────────────────────────────────────────────────
// GET /api/admin/cohost-teams
// Returns verified workers grouped by their Co-Host parent (if any).
// Also includes workers with no cohost (cohostId IS NULL).
router.get("/admin/cohost-teams", authenticate, requireAdminRole("super_admin", "soporte"), async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Acceso solo para admins" });
    return;
  }

  try {
    // All workers + their cohost parent info (two self-joins on users table via raw SQL aliases)
    const rows = await db
      .select({
        workerId: workersTable.id,
        workerUserId: workersTable.userId,
        workerName: sql<string>`wu.name`,
        workerEmail: sql<string>`wu.email`,
        workerPhone: sql<string>`wu.phone`,
        workerAvatar: sql<string>`wu.avatar_url`,
        isVerified: workersTable.isVerified,
        verificationStatus: workersTable.verificationStatus,
        cohostUserId: workersTable.cohostId,
        cohostName: sql<string>`cu.name`,
        cohostEmail: sql<string>`cu.email`,
        cohostAvatar: sql<string>`cu.avatar_url`,
        state: sql<string>`wu.state`,
        city: sql<string>`wu.city`,
        completedJobs: workersTable.completedJobs,
        rating: workersTable.rating,
      })
      .from(workersTable)
      .leftJoin(sql`users wu`, sql`wu.id = ${workersTable.userId}`)
      .leftJoin(sql`users cu`, sql`cu.id = ${workersTable.cohostId}`)
      .orderBy(workersTable.cohostId, workersTable.id);

    // Group by cohostUserId
    const grouped: Record<string, { cohost: any; workers: any[] }> = {};

    for (const row of rows) {
      const key = row.cohostUserId ? String(row.cohostUserId) : "__none__";
      if (!grouped[key]) {
        grouped[key] = {
          cohost: row.cohostUserId
            ? { id: row.cohostUserId, name: row.cohostName, email: row.cohostEmail, avatar: row.cohostAvatar }
            : null,
          workers: [],
        };
      }
      grouped[key].workers.push({
        id: row.workerId,
        userId: row.workerUserId,
        name: row.workerName,
        email: row.workerEmail,
        phone: row.workerPhone,
        avatar: row.workerAvatar,
        isVerified: row.isVerified,
        verificationStatus: row.verificationStatus,
        state: row.state,
        city: row.city,
        completedJobs: row.completedJobs,
        rating: row.rating,
      });
    }

    // Also fetch cohost KYC status
    const cohostIds = Object.values(grouped)
      .filter(g => g.cohost)
      .map(g => g.cohost.id as number);

    const cohostKyc: Record<number, string> = {};
    if (cohostIds.length > 0) {
      const kycRows = await db
        .select({ userId: userVerificationsTable.userId, status: userVerificationsTable.status })
        .from(userVerificationsTable)
        .where(eq(userVerificationsTable.role, "cohost"));
      for (const k of kycRows) {
        cohostKyc[k.userId] = k.status;
      }
    }

    const result = Object.values(grouped).map(g => ({
      ...g,
      cohost: g.cohost
        ? { ...g.cohost, kycStatus: cohostKyc[g.cohost.id] ?? "not_submitted" }
        : null,
    }));

    // Sort: groups with cohost first, then ungrouped
    result.sort((a, b) => {
      if (a.cohost && !b.cohost) return -1;
      if (!a.cohost && b.cohost) return 1;
      return (a.cohost?.name ?? "").localeCompare(b.cohost?.name ?? "");
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener equipos" });
  }
});

// ─── GET /api/workers/me/contact-stats ─────────────────────────────────────
// Returns contact & view counts for the authenticated worker (for dashboard feedback)
router.get("/workers/me/contact-stats", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "worker" && user.secondaryRole !== "worker") {
    res.status(403).json({ error: "Solo profesionales" });
    return;
  }

  const [workerRow] = await db
    .select({ id: workersTable.id, portfolioPhotos: workersTable.portfolioPhotos, description: workersTable.description, avatarUrl: usersTable.avatarUrl })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .where(eq(workersTable.userId, user.id));

  if (!workerRow) { res.status(404).json({ error: "Perfil no encontrado" }); return; }

  const wId = workerRow.id;
  const since7d = subDays(new Date(), 7).toISOString();
  const since30d = subDays(new Date(), 30).toISOString();

  // contact_clicks for this worker
  const [c7] = await db
    .select({ cnt: count() })
    .from(eventsTable)
    .where(sql`${eventsTable.event} = 'contact_click' AND ${eventsTable.createdAt} >= ${since7d} AND (${eventsTable.meta}::json->>'workerId')::int = ${wId}`);

  const [c30] = await db
    .select({ cnt: count() })
    .from(eventsTable)
    .where(sql`${eventsTable.event} = 'contact_click' AND ${eventsTable.createdAt} >= ${since30d} AND (${eventsTable.meta}::json->>'workerId')::int = ${wId}`);

  // profile_view events
  const [v7] = await db
    .select({ cnt: count() })
    .from(eventsTable)
    .where(sql`${eventsTable.event} = 'profile_view' AND ${eventsTable.createdAt} >= ${since7d} AND (${eventsTable.meta}::json->>'workerId')::int = ${wId}`);

  // overall max contacts in last 30 days (to determine if this worker is top)
  const allContacts = await db
    .select({ cnt: count() })
    .from(eventsTable)
    .where(sql`${eventsTable.event} = 'contact_click' AND ${eventsTable.createdAt} >= ${since30d}`)
    .groupBy(sql`(${eventsTable.meta}::json->>'workerId')::int`)
    .orderBy(sql`count(*) DESC`)
    .limit(1);

  const maxGlobal = Number(allContacts[0]?.cnt ?? 0);
  const myContacts30 = Number(c30?.cnt ?? 0);
  const isTopProfile = maxGlobal >= 3 && myContacts30 >= Math.max(3, maxGlobal * 0.4);

  // Profile completeness tips
  const photos: string[] = (workerRow.portfolioPhotos as string[] | null) ?? [];
  const tips: string[] = [];
  if (!workerRow.avatarUrl) tips.push("Agrega una foto de perfil profesional");
  if (photos.length < 2) tips.push("Sube fotos de tus trabajos anteriores");
  if (!workerRow.description || workerRow.description.length < 60) tips.push("Amplía tu descripción con más detalles de tus servicios");

  res.json({
    contactsLast7d: Number(c7?.cnt ?? 0),
    contactsLast30d: myContacts30,
    profileViewsLast7d: Number(v7?.cnt ?? 0),
    isTopProfile,
    tips,
  });
});

export default router;

