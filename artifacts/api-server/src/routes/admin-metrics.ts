import { Router } from "express";
import {
  db, bookingsTable, categoriesTable, workersTable, usersTable,
  productOrdersTable, rentalsTable, productsTable,
} from "@workspace/db";
import { eq, and, sql, count, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../lib/auth";

const router = Router();

router.get("/admin/metrics", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  // ── Yesterday revenue ─────────────────────────────────────────────────────
  const [yesterdayRes] = await db
    .select({
      total:      sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
      commission: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)`,
      cnt:        sql<string>`COUNT(*)`,
    })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt}::date = CURRENT_DATE - INTERVAL '1 day'`,
    ));

  // ── Today count ───────────────────────────────────────────────────────────
  const [todayCountRes] = await db
    .select({ cnt: sql<string>`COUNT(*)` })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt}::date = CURRENT_DATE`,
    ));

  // ── Last week revenue (Mon–Sun of previous ISO week) ──────────────────────
  const [lastWeekRes] = await db
    .select({
      total:      sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
      commission: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)`,
    })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt} >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')`,
      sql`${bookingsTable.completedAt} <  date_trunc('week', CURRENT_DATE)`,
    ));

  // ── Revenue by category (all-time + this_week vs last_week) ───────────────
  const categories = await db.select().from(categoriesTable);
  const revenueByCategory = await Promise.all(
    categories.map(async (cat) => {
      const [r] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
          cnt:   count(),
        })
        .from(bookingsTable)
        .where(and(eq(bookingsTable.categoryId, cat.id), eq(bookingsTable.status, "completed")));

      const [thisWeekR] = await db
        .select({ total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)` })
        .from(bookingsTable)
        .where(and(
          eq(bookingsTable.categoryId, cat.id),
          eq(bookingsTable.status, "completed"),
          sql`${bookingsTable.completedAt} >= date_trunc('week', CURRENT_DATE)`,
        ));

      const [lastWeekR] = await db
        .select({ total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)` })
        .from(bookingsTable)
        .where(and(
          eq(bookingsTable.categoryId, cat.id),
          eq(bookingsTable.status, "completed"),
          sql`${bookingsTable.completedAt} >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')`,
          sql`${bookingsTable.completedAt} <  date_trunc('week', CURRENT_DATE)`,
        ));

      return {
        categoryName:    cat.name,
        revenue:         Number(r?.total       ?? 0),
        count:           Number(r?.cnt         ?? 0),
        revenueThisWeek: Number(thisWeekR?.total ?? 0),
        revenueLastWeek: Number(lastWeekR?.total ?? 0),
      };
    })
  );

  // ── Top workers by revenue ─────────────────────────────────────────────────
  const workerRevRows = await db
    .select({
      workerId:  bookingsTable.workerId,
      revenue:   sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
      jobCount:  count(),
    })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "completed"))
    .groupBy(bookingsTable.workerId)
    .orderBy(desc(sql`SUM(${bookingsTable.totalAmount})`))
    .limit(5);

  const topWorkers = await Promise.all(
    workerRevRows.map(async (row) => {
      const [workerRec] = await db
        .select({ user: usersTable })
        .from(workersTable)
        .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
        .where(eq(workersTable.id, row.workerId));
      return {
        workerId:  row.workerId,
        name:      workerRec?.user.name      ?? "Desconocido",
        avatarUrl: workerRec?.user.avatarUrl ?? null,
        revenue:   Number(row.revenue),
        jobCount:  Number(row.jobCount),
      };
    })
  );

  // ── Top products by orders ─────────────────────────────────────────────────
  const topProductRows = await db
    .select({
      productId: productOrdersTable.productId,
      name:      productsTable.name,
      orders:    count(),
      revenue:   sql<string>`COALESCE(SUM(${productOrdersTable.paymentAmount}), 0)`,
    })
    .from(productOrdersTable)
    .innerJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
    .where(eq(productOrdersTable.status, "delivered"))
    .groupBy(productOrdersTable.productId, productsTable.name)
    .orderBy(desc(count()))
    .limit(5);

  const topProducts = topProductRows.map(r => ({
    productId: r.productId,
    name:      r.name,
    orders:    Number(r.orders),
    revenue:   Number(r.revenue),
  }));

  // ── Store revenue (product orders) ────────────────────────────────────────
  const [storeRes] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${productOrdersTable.paymentAmount}), 0)`,
      cnt:   count(),
    })
    .from(productOrdersTable)
    .where(eq(productOrdersTable.status, "delivered"));

  const [storeTotalRes] = await db
    .select({ cnt: count() })
    .from(productOrdersTable);

  // ── Rental revenue ────────────────────────────────────────────────────────
  const [rentalRes] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${rentalsTable.subtotal}), 0)`,
      cnt:   count(),
    })
    .from(rentalsTable)
    .where(eq(rentalsTable.status, "completed"));

  const [rentalTotalRes] = await db
    .select({ cnt: count() })
    .from(rentalsTable);

  // ── Conversion rates ──────────────────────────────────────────────────────
  const [totalBookingsRes] = await db.select({ cnt: count() }).from(bookingsTable);
  const [completedBookingsRes] = await db
    .select({ cnt: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "completed"));

  // ── Daily revenue trend — last 7 days (for projection) ────────────────────
  const dailyRows = await db
    .select({
      day:     sql<string>`${bookingsTable.completedAt}::date`,
      revenue: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
      commission: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)`,
      cnt:     sql<string>`COUNT(*)`,
    })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt}::date >= CURRENT_DATE - INTERVAL '6 days'`,
    ))
    .groupBy(sql`${bookingsTable.completedAt}::date`)
    .orderBy(sql`${bookingsTable.completedAt}::date`);

  // Fill in missing days with 0 so the chart always has 7 entries
  const dailyMap: Record<string, { revenue: number; commission: number; cnt: number }> = {};
  for (const row of dailyRows) {
    dailyMap[row.day] = { revenue: Number(row.revenue), commission: Number(row.commission), cnt: Number(row.cnt) };
  }
  const dailyTrend: { day: string; revenue: number; commission: number; cnt: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("es-VE", { weekday: "short", day: "numeric" });
    dailyTrend.push({
      day: label,
      revenue:    dailyMap[key]?.revenue    ?? 0,
      commission: dailyMap[key]?.commission ?? 0,
      cnt:        dailyMap[key]?.cnt        ?? 0,
    });
  }

  res.json({
    revenueYesterday:     Number(yesterdayRes?.total      ?? 0),
    commissionsYesterday: Number(yesterdayRes?.commission ?? 0),
    bookingsYesterday:    Number(yesterdayRes?.cnt        ?? 0),
    bookingsToday:        Number(todayCountRes?.cnt       ?? 0),

    revenueLastWeek:      Number(lastWeekRes?.total      ?? 0),
    commissionsLastWeek:  Number(lastWeekRes?.commission ?? 0),

    revenueByCategory: revenueByCategory.filter(c => c.count > 0),
    topProducts,

    topWorkers,

    storeRevenue:      Number(storeRes?.total ?? 0),
    storeOrdersDone:   Number(storeRes?.cnt   ?? 0),
    storeOrdersTotal:  Number(storeTotalRes?.cnt ?? 0),

    rentalRevenue:     Number(rentalRes?.total ?? 0),
    rentalsDone:       Number(rentalRes?.cnt   ?? 0),
    rentalsTotal:      Number(rentalTotalRes?.cnt ?? 0),

    bookingsTotal:     Number(totalBookingsRes?.cnt     ?? 0),
    bookingsDone:      Number(completedBookingsRes?.cnt ?? 0),

    dailyTrend,
  });
});

export default router;
