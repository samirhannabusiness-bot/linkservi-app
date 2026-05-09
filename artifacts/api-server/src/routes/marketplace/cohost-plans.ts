import { Router } from "express";
import { db, usersTable, cohostPlanRequestsTable, productOrdersTable, productsTable, storesTable, storeWithdrawalsTable, workersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../../lib/auth";
import { logger } from "../../lib/logger";

const router = Router();

// ── Commission tier helper (exported for use in product-orders) ────────────────
// Cohost EARNS commission:  Free=5%, Premium=6-10% (volume-based)
// Seller PAYS platform fee: Free=10%, Premium=7%
export function getCohostCommissionRate(plan: string, monthlyVolumeUsd: number): number {
  if (plan !== "premium") return 0.05;
  if (monthlyVolumeUsd >= 5000) return 0.10;
  if (monthlyVolumeUsd >= 1000) return 0.075;
  return 0.06;
}

// Seller platform fee (what the platform charges the seller per sale)
export function getSellerPlatformFee(plan: string): number {
  return plan === "premium" ? 0.07 : 0.10; // 10% free, 7% premium
}

// ── GET /api/user/my-commission ───────────────────────────────────────────────
// Returns current commission rate for cohost or seller
router.get("/user/my-commission", authenticate, requireRole("cohost", "seller"), async (req, res): Promise<void> => {
  try {
    if (req.user!.role === "seller") {
      const [sellerUser] = await db
        .select({ cohostPlan: usersTable.cohostPlan, cohostMonthlyVolumeUsd: usersTable.cohostMonthlyVolumeUsd })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id));
      const plan = sellerUser?.cohostPlan ?? "free";
      const monthlyVolumeUsd = sellerUser?.cohostMonthlyVolumeUsd ?? 0;
      const fee = getSellerPlatformFee(plan);
      res.json({ commissionPct: +(fee * 100).toFixed(0), plan, monthlyVolumeUsd, isSeller: true });
      return;
    }
    const [user] = await db
      .select({
        cohostPlan: usersTable.cohostPlan,
        cohostMonthlyVolumeUsd: usersTable.cohostMonthlyVolumeUsd,
        cohostPlanExpiresAt: usersTable.cohostPlanExpiresAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
    let plan = user.cohostPlan;
    if (plan === "premium" && user.cohostPlanExpiresAt && new Date(user.cohostPlanExpiresAt) < new Date()) {
      await db.update(usersTable).set({ cohostPlan: "free" }).where(eq(usersTable.id, req.user!.id));
      plan = "free";
    }
    const monthlyVolumeUsd = user.cohostMonthlyVolumeUsd ?? 0;
    const rate = getCohostCommissionRate(plan, monthlyVolumeUsd);
    res.json({ commissionPct: +(rate * 100).toFixed(2), plan, monthlyVolumeUsd });
  } catch (err) {
    logger.error({ err }, "Failed to get commission rate");
    res.status(500).json({ error: "Error al obtener comisión" });
  }
});

// ── GET /api/user/earnings ────────────────────────────────────────────────────
// Earnings summary stats for seller or cohost
router.get("/user/earnings", authenticate, requireRole("cohost", "seller"), async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    // Aggregate delivered orders for products owned by this user
    const [stats] = await db
      .select({
        totalSold: sql<number>`coalesce(sum(${productOrdersTable.priceUsdAtMoment}), 0)`,
        totalEarned: sql<number>`coalesce(sum(${productOrdersTable.storeEarningsAmt}), 0)`,
        completedCount: sql<number>`count(*)`,
        avgOrder: sql<number>`coalesce(avg(${productOrdersTable.priceUsdAtMoment}), 0)`,
        totalCommissionEarned: sql<number>`coalesce(sum(${productOrdersTable.cohostCommissionAmt}), 0)`,
        platformCut: sql<number>`coalesce(sum(${productOrdersTable.platformCommissionAmt}), 0)`,
      })
      .from(productOrdersTable)
      .innerJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(and(
        eq(productsTable.coHostId, userId),
        eq(productOrdersTable.status, "delivered"),
      ));

    // Cohost-specific: count stores and workers
    let storeCount = 0;
    let workerCount = 0;
    if (role === "cohost") {
      const [sc] = await db
        .select({ count: sql<number>`count(*)` })
        .from(storesTable)
        .where(eq(storesTable.coHostId, userId));
      storeCount = Number(sc?.count ?? 0);

      const [wc] = await db
        .select({ count: sql<number>`count(*)` })
        .from(workersTable)
        .where(eq(workersTable.cohostId, userId));
      workerCount = Number(wc?.count ?? 0);
    }

    res.json({
      totalSold: Number(stats?.totalSold ?? 0),
      totalEarned: Number(stats?.totalEarned ?? 0),
      completedCount: Number(stats?.completedCount ?? 0),
      avgOrder: Number(stats?.avgOrder ?? 0),
      totalCommissionEarned: Number(stats?.totalCommissionEarned ?? 0),
      platformCut: Number(stats?.platformCut ?? 0),
      storeCount,
      workerCount,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get earnings");
    res.status(500).json({ error: "Error al obtener ganancias" });
  }
});

// ── GET /api/user/transactions ────────────────────────────────────────────────
// Transaction history for seller or cohost (sales + withdrawals)
router.get("/user/transactions", authenticate, requireRole("cohost", "seller"), async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Sales: all product orders (any status) for this user's products
    const sales = await db
      .select({
        id: productOrdersTable.id,
        date: productOrdersTable.createdAt,
        amount: productOrdersTable.priceUsdAtMoment,
        storeEarnings: productOrdersTable.storeEarningsAmt,
        commissionAmt: productOrdersTable.cohostCommissionAmt,
        platformAmt: productOrdersTable.platformCommissionAmt,
        status: productOrdersTable.status,
        description: productsTable.name,
        storeName: storesTable.name,
      })
      .from(productOrdersTable)
      .innerJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .innerJoin(storesTable, eq(productsTable.storeId, storesTable.id))
      .where(eq(productsTable.coHostId, userId))
      .orderBy(desc(productOrdersTable.createdAt))
      .limit(100);

    // Withdrawals
    const withdrawals = await db
      .select({
        id: storeWithdrawalsTable.id,
        date: storeWithdrawalsTable.createdAt,
        amount: storeWithdrawalsTable.amount,
        status: storeWithdrawalsTable.status,
        storeName: storesTable.name,
      })
      .from(storeWithdrawalsTable)
      .innerJoin(storesTable, eq(storeWithdrawalsTable.storeId, storesTable.id))
      .where(eq(storeWithdrawalsTable.requestedByUserId, userId))
      .orderBy(desc(storeWithdrawalsTable.createdAt))
      .limit(50);

    const txSales = sales.map(s => ({
      id: `sale-${s.id}`,
      date: s.date,
      type: "venta" as const,
      amount: s.amount,
      netAmount: s.storeEarnings,
      commissionAmt: s.commissionAmt,
      platformAmt: s.platformAmt,
      status: s.status,
      description: s.description ?? "Producto",
      storeName: s.storeName ?? "",
    }));

    const txWithdrawals = withdrawals.map(w => ({
      id: `withdrawal-${w.id}`,
      date: w.date,
      type: "retiro" as const,
      amount: w.amount,
      netAmount: w.amount,
      commissionAmt: null,
      platformAmt: null,
      status: w.status,
      description: `Retiro — ${w.storeName}`,
      storeName: w.storeName ?? "",
    }));

    const all = [...txSales, ...txWithdrawals].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json(all);
  } catch (err) {
    logger.error({ err }, "Failed to get transactions");
    res.status(500).json({ error: "Error al obtener transacciones" });
  }
});

// ── GET /api/user/premium-preview ────────────────────────────────────────────
// Calculates "lost earnings" from NOT being on Premium, for free-plan users
router.get("/user/premium-preview", authenticate, requireRole("cohost", "seller"), async (req, res): Promise<void> => {
  try {
    const [user] = await db
      .select({
        cohostPlan: usersTable.cohostPlan,
        cohostMonthlyVolumeUsd: usersTable.cohostMonthlyVolumeUsd,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

    const plan = user.cohostPlan ?? "free";
    const monthlyVolumeUsd = user.cohostMonthlyVolumeUsd ?? 0;
    const PLAN_COST_USD = 20;
    const isSeller = req.user!.role === "seller";

    if (isSeller) {
      // Seller perspective: they PAY platform fee, Premium reduces it 10%→7%
      const currentFee = getSellerPlatformFee(plan);       // 0.10
      const premiumFee = getSellerPlatformFee("premium");  // 0.07
      const currentFeePaid = +(monthlyVolumeUsd * currentFee).toFixed(2);
      const premiumFeePaid = +(monthlyVolumeUsd * premiumFee).toFixed(2);
      const potentialSavings = +(currentFeePaid - premiumFeePaid).toFixed(2); // how much less they'd pay
      const savingsRatePerDollar = currentFee - premiumFee; // 0.03
      const salesNeededToBreakEven = +(PLAN_COST_USD / savingsRatePerDollar).toFixed(0); // ~667
      const remainingSalesNeeded = Math.max(0, +(salesNeededToBreakEven - monthlyVolumeUsd).toFixed(0));

      res.json({
        plan,
        monthlyVolumeUsd,
        currentRate: +(currentFee * 100).toFixed(1),       // 10%
        premiumRate: +(premiumFee * 100).toFixed(1),        // 7%
        currentFeePaid,
        premiumFeePaid,
        potentialSavings,                                   // savings per month
        lostEarnings: potentialSavings,                     // alias for banner reuse
        planCostUsd: PLAN_COST_USD,
        salesNeededToBreakEven,                             // ~667
        remainingSalesNeeded,
        alreadyPremium: plan === "premium",
        isSeller: true,
        nextTierLabel: "",
        nextTierRate: 7,
      });
      return;
    }

    // Cohost perspective: they EARN commission, Premium increases it
    const currentRate = getCohostCommissionRate(plan, monthlyVolumeUsd);
    const premiumRate = getCohostCommissionRate("premium", monthlyVolumeUsd);
    const currentCommissionEarned = +(monthlyVolumeUsd * currentRate).toFixed(2);
    const premiumCommissionWouldEarn = +(monthlyVolumeUsd * premiumRate).toFixed(2);
    const lostEarnings = +(premiumCommissionWouldEarn - currentCommissionEarned).toFixed(2);
    const extraRatePerDollar = premiumRate - currentRate;
    const salesNeededToBreakEven = extraRatePerDollar > 0
      ? +(PLAN_COST_USD / extraRatePerDollar).toFixed(0)
      : 999999;
    const remainingSalesNeeded = Math.max(0, +(salesNeededToBreakEven - monthlyVolumeUsd).toFixed(0));
    let nextTierLabel = "";
    let nextTierRate = premiumRate;
    if (monthlyVolumeUsd < 1000) { nextTierLabel = "$1,000/mes → 7.5%"; nextTierRate = 0.075; }
    else if (monthlyVolumeUsd < 5000) { nextTierLabel = "$5,000/mes → 10%"; nextTierRate = 0.10; }

    res.json({
      plan, monthlyVolumeUsd,
      currentRate: +(currentRate * 100).toFixed(1),
      premiumRate: +(premiumRate * 100).toFixed(1),
      currentCommissionEarned, premiumCommissionWouldEarn, lostEarnings,
      planCostUsd: PLAN_COST_USD, salesNeededToBreakEven, remainingSalesNeeded,
      alreadyPremium: plan === "premium",
      isSeller: false,
      nextTierLabel,
      nextTierRate: +(nextTierRate * 100).toFixed(1),
    });
  } catch (err) {
    logger.error({ err }, "Failed to get premium preview");
    res.status(500).json({ error: "Error al calcular vista previa" });
  }
});

// ── GET /api/cohost/plan ──────────────────────────────────────────────────────
// Returns full plan info + current commission rate
router.get("/cohost/plan", authenticate, requireRole("cohost", "seller"), async (req, res): Promise<void> => {
  try {
    const [user] = await db
      .select({
        cohostPlan: usersTable.cohostPlan,
        cohostPlanExpiresAt: usersTable.cohostPlanExpiresAt,
        cohostMonthlyVolumeUsd: usersTable.cohostMonthlyVolumeUsd,
        cohostVolumeResetAt: usersTable.cohostVolumeResetAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

    // Auto-expire plan if past expiry date
    let plan = user.cohostPlan;
    if (plan === "premium" && user.cohostPlanExpiresAt && new Date(user.cohostPlanExpiresAt) < new Date()) {
      await db.update(usersTable).set({ cohostPlan: "free" }).where(eq(usersTable.id, req.user!.id));
      plan = "free";
    }

    // Reset monthly volume if past reset date (every 30 days)
    let monthlyVolumeUsd = user.cohostMonthlyVolumeUsd ?? 0;
    if (user.cohostVolumeResetAt && new Date(user.cohostVolumeResetAt) < new Date()) {
      await db.update(usersTable).set({
        cohostMonthlyVolumeUsd: 0,
        cohostVolumeResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).where(eq(usersTable.id, req.user!.id));
      monthlyVolumeUsd = 0;
    }

    const commissionRate = getCohostCommissionRate(plan, monthlyVolumeUsd);

    // Get pending upgrade request if any
    const [pendingRequest] = await db
      .select()
      .from(cohostPlanRequestsTable)
      .where(eq(cohostPlanRequestsTable.cohostId, req.user!.id))
      .orderBy(desc(cohostPlanRequestsTable.createdAt))
      .limit(1);

    res.json({
      plan,
      planExpiresAt: user.cohostPlanExpiresAt,
      monthlyVolumeUsd,
      volumeResetAt: user.cohostVolumeResetAt,
      commissionRate,
      commissionPct: +(commissionRate * 100).toFixed(1),
      pendingRequest: pendingRequest?.status === "pending" ? pendingRequest : null,
      lastRequest: pendingRequest ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch cohost plan");
    res.status(500).json({ error: "Error al obtener información del plan" });
  }
});

// ── POST /api/cohost/plan/request-upgrade ─────────────────────────────────────
// Submit a premium upgrade request with payment proof
router.post("/cohost/plan/request-upgrade", authenticate, requireRole("cohost", "seller"), async (req, res): Promise<void> => {
  try {
    const { planMonths, paymentMethod, transactionRef, receiptUrl } = req.body;

    if (!planMonths || ![1, 3, 6, 12].includes(Number(planMonths))) {
      res.status(400).json({ error: "Duración inválida (1, 3, 6 o 12 meses)" }); return;
    }
    if (!paymentMethod) {
      res.status(400).json({ error: "Método de pago requerido" }); return;
    }
    if (!transactionRef && !receiptUrl) {
      res.status(400).json({ error: "Proporciona un comprobante de pago o referencia de transacción" }); return;
    }

    // Check if there's already a pending request
    const [existing] = await db
      .select()
      .from(cohostPlanRequestsTable)
      .where(eq(cohostPlanRequestsTable.cohostId, req.user!.id))
      .orderBy(desc(cohostPlanRequestsTable.createdAt))
      .limit(1);

    if (existing?.status === "pending") {
      res.status(400).json({ error: "Ya tienes una solicitud de upgrade pendiente de revisión" }); return;
    }

    // Price: $20/month
    const MONTHLY_PRICE = 20;
    const amount = MONTHLY_PRICE * Number(planMonths);

    const [request] = await db.insert(cohostPlanRequestsTable).values({
      cohostId: req.user!.id,
      planMonths: Number(planMonths),
      amount,
      paymentMethod,
      transactionRef: transactionRef ?? null,
      receiptUrl: receiptUrl ?? null,
      status: "pending",
    }).returning();

    res.status(201).json(request);
  } catch (err) {
    logger.error({ err }, "Failed to create cohost plan request");
    res.status(500).json({ error: "Error al enviar solicitud de upgrade" });
  }
});

// ── GET /api/admin/cohost-plan-requests ───────────────────────────────────────
router.get("/admin/cohost-plan-requests", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const requests = await db
      .select({
        id: cohostPlanRequestsTable.id,
        cohostId: cohostPlanRequestsTable.cohostId,
        cohostName: usersTable.name,
        cohostEmail: usersTable.email,
        cohostPlan: usersTable.cohostPlan,
        planMonths: cohostPlanRequestsTable.planMonths,
        amount: cohostPlanRequestsTable.amount,
        paymentMethod: cohostPlanRequestsTable.paymentMethod,
        transactionRef: cohostPlanRequestsTable.transactionRef,
        receiptUrl: cohostPlanRequestsTable.receiptUrl,
        status: cohostPlanRequestsTable.status,
        adminNotes: cohostPlanRequestsTable.adminNotes,
        createdAt: cohostPlanRequestsTable.createdAt,
      })
      .from(cohostPlanRequestsTable)
      .leftJoin(usersTable, eq(cohostPlanRequestsTable.cohostId, usersTable.id))
      .orderBy(desc(cohostPlanRequestsTable.createdAt));

    res.json(requests);
  } catch (err) {
    logger.error({ err }, "Failed to fetch cohost plan requests");
    res.status(500).json({ error: "Error al obtener solicitudes de planes" });
  }
});

// ── POST /api/admin/cohost-plan-requests/:id/approve ──────────────────────────
router.post("/admin/cohost-plan-requests/:id/approve", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const reqId = parseInt(req.params.id);
    const { adminNotes } = req.body;

    const [planReq] = await db
      .select()
      .from(cohostPlanRequestsTable)
      .where(eq(cohostPlanRequestsTable.id, reqId));

    if (!planReq) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (planReq.status !== "pending") { res.status(400).json({ error: "Esta solicitud ya fue procesada" }); return; }

    // Fetch current expiry for the co-host (extend if already premium)
    const [cohost] = await db
      .select({ cohostPlan: usersTable.cohostPlan, cohostPlanExpiresAt: usersTable.cohostPlanExpiresAt })
      .from(usersTable)
      .where(eq(usersTable.id, planReq.cohostId));

    const now = new Date();
    const baseDate = (cohost?.cohostPlan === "premium" && cohost?.cohostPlanExpiresAt && new Date(cohost.cohostPlanExpiresAt) > now)
      ? new Date(cohost.cohostPlanExpiresAt)
      : now;

    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + planReq.planMonths * 30);

    // Activate premium for co-host
    await db.update(usersTable).set({
      cohostPlan: "premium",
      cohostPlanExpiresAt: newExpiry,
      // Start volume tracking if not started
      cohostVolumeResetAt: cohost?.cohostPlanExpiresAt
        ? undefined
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).where(eq(usersTable.id, planReq.cohostId));

    // Mark request as approved
    const [updated] = await db.update(cohostPlanRequestsTable).set({
      status: "approved",
      adminNotes: adminNotes ?? null,
    }).where(eq(cohostPlanRequestsTable.id, reqId)).returning();

    res.json({ ...updated, planExpiresAt: newExpiry });
  } catch (err) {
    logger.error({ err }, "Failed to approve cohost plan request");
    res.status(500).json({ error: "Error al aprobar solicitud" });
  }
});

// ── POST /api/admin/cohost-plan-requests/:id/reject ───────────────────────────
router.post("/admin/cohost-plan-requests/:id/reject", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const reqId = parseInt(req.params.id);
    const { adminNotes } = req.body;

    const [planReq] = await db
      .select()
      .from(cohostPlanRequestsTable)
      .where(eq(cohostPlanRequestsTable.id, reqId));

    if (!planReq) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (planReq.status !== "pending") { res.status(400).json({ error: "Esta solicitud ya fue procesada" }); return; }

    const [updated] = await db.update(cohostPlanRequestsTable).set({
      status: "rejected",
      adminNotes: adminNotes ?? null,
    }).where(eq(cohostPlanRequestsTable.id, reqId)).returning();

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to reject cohost plan request");
    res.status(500).json({ error: "Error al rechazar solicitud" });
  }
});

export default router;
