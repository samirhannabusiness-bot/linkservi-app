import { Router } from "express";
import { db, usersTable, workersTable, bookingsTable, productsTable, productOrdersTable, storesTable, cohostInvitationsTable, userVerificationsTable } from "@workspace/db";
import { eq, inArray, and, or, sql, isNull } from "drizzle-orm";
import { authenticate, requireRole, hashPassword, signToken } from "../../lib/auth";
import { logger } from "../../lib/logger";
import crypto from "crypto";

const router = Router();

// ── Get my managed workers ───────────────────────────────────────────────────
router.get("/cohost/workers", authenticate, requireRole("cohost", "admin"), async (req, res): Promise<void> => {
  try {
    const cohostId = req.user!.id;
    const workers = await db
      .select({
        id: workersTable.id,
        userId: workersTable.userId,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        avatarUrl: usersTable.avatarUrl,
        categoryId: workersTable.categoryId,
        description: workersTable.description,
        servicePrice: workersTable.servicePrice,
        rating: workersTable.rating,
        reviewCount: workersTable.reviewCount,
        completedJobs: workersTable.completedJobs,
        earnings: workersTable.earnings,
        isAvailable: workersTable.isAvailable,
        isVerified: workersTable.isVerified,
        state: workersTable.state,
        city: workersTable.city,
      })
      .from(workersTable)
      .leftJoin(usersTable, eq(workersTable.userId, usersTable.id))
      .where(eq(workersTable.cohostId, cohostId));
    res.json(workers);
  } catch (err) {
    logger.error({ err }, "Failed to list cohost workers");
    res.status(500).json({ error: "Error al listar profesionales" });
  }
});

// ── Create a worker managed by this co-host ──────────────────────────────────
router.post("/cohost/workers", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const { name, email, categoryId, description, servicePrice, state, city } = req.body;
    if (!name || !email) {
      res.status(400).json({ error: "name y email son requeridos" });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing.length > 0) {
      res.status(400).json({ error: "Email ya en uso" });
      return;
    }

    // Create user with worker role and a random password
    const passwordHash = await hashPassword(Math.random().toString(36).slice(2) + "Sl!23");
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash,
      role: "worker",
      state: state ?? null,
      city: city ?? null,
      isActive: true,
    }).returning();

    const [worker] = await db.insert(workersTable).values({
      userId: user.id,
      categoryId: categoryId ? parseInt(categoryId) : null as unknown as number,
      description: description ?? null,
      servicePrice: servicePrice ? parseFloat(servicePrice) : 50,
      cohostId: req.user!.id,
      isAvailable: true,
    }).returning();

    res.status(201).json({ user, worker });
  } catch (err) {
    logger.error({ err }, "Failed to create managed worker");
    res.status(500).json({ error: "Error al crear profesional" });
  }
});

// ── Update a managed worker ──────────────────────────────────────────────────
router.put("/cohost/workers/:workerId", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.workerId);
    const [worker] = await db.select().from(workersTable).where(
      and(eq(workersTable.id, workerId), eq(workersTable.cohostId, req.user!.id))
    );
    if (!worker) { res.status(404).json({ error: "Profesional no encontrado o no autorizado" }); return; }

    const { description, servicePrice, categoryId, isAvailable, state, city } = req.body;
    await db.update(workersTable).set({
      ...(description !== undefined && { description }),
      ...(servicePrice !== undefined && { servicePrice: parseFloat(servicePrice) }),
      ...(categoryId !== undefined && { categoryId: parseInt(categoryId) }),
      ...(isAvailable !== undefined && { isAvailable }),
    }).where(eq(workersTable.id, workerId));

    if (state !== undefined || city !== undefined) {
      await db.update(usersTable).set({
        ...(state !== undefined && { state }),
        ...(city !== undefined && { city }),
      }).where(eq(usersTable.id, worker.userId));
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to update managed worker");
    res.status(500).json({ error: "Error al actualizar profesional" });
  }
});

// ── Delete (deactivate) a managed worker ────────────────────────────────────
router.delete("/cohost/workers/:workerId", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const workerId = parseInt(req.params.workerId);
    const [worker] = await db.select().from(workersTable).where(
      and(eq(workersTable.id, workerId), eq(workersTable.cohostId, req.user!.id))
    );
    if (!worker) { res.status(404).json({ error: "Profesional no encontrado o no autorizado" }); return; }
    await db.update(workersTable).set({ isAvailable: false }).where(eq(workersTable.id, workerId));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete managed worker");
    res.status(500).json({ error: "Error al eliminar profesional" });
  }
});

// ── Get bookings for my managed workers ─────────────────────────────────────
router.get("/cohost/bookings", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const cohostId = req.user!.id;

    // Get my workers' user IDs
    const myWorkers = await db
      .select({ userId: workersTable.userId, workerId: workersTable.id })
      .from(workersTable)
      .where(eq(workersTable.cohostId, cohostId));

    if (myWorkers.length === 0) { res.json([]); return; }

    const workerUserIds = myWorkers.map(w => w.userId);

    const bookings = await db
      .select({
        id: bookingsTable.id,
        status: bookingsTable.status,
        totalAmount: bookingsTable.totalAmount,
        scheduledAt: bookingsTable.scheduledAt,
        createdAt: bookingsTable.createdAt,
        workerEarnings: bookingsTable.workerEarnings,
        workerId: bookingsTable.workerId,
        clientId: bookingsTable.clientId,
        workerName: usersTable.name,
      })
      .from(bookingsTable)
      .leftJoin(usersTable, eq(bookingsTable.workerId, usersTable.id))
      .where(inArray(bookingsTable.workerId, workerUserIds))
      .orderBy(bookingsTable.createdAt);

    res.json(bookings);
  } catch (err) {
    logger.error({ err }, "Failed to list cohost bookings");
    res.status(500).json({ error: "Error al listar solicitudes" });
  }
});

// ── Accept booking on behalf of managed worker ───────────────────────────────
router.post("/cohost/bookings/:id/accept", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
    if (!booking) { res.status(404).json({ error: "Reserva no encontrada" }); return; }

    // Verify the booking's worker is managed by this cohost
    const [worker] = await db.select().from(workersTable).where(
      and(eq(workersTable.userId, booking.workerId), eq(workersTable.cohostId, req.user!.id))
    );
    if (!worker) { res.status(403).json({ error: "No autorizado" }); return; }

    if (booking.status !== "pending") {
      res.status(400).json({ error: "Solo se pueden aceptar reservas pendientes" });
      return;
    }

    const [updated] = await db.update(bookingsTable).set({
      status: "accepted",
      acceptedAt: new Date(),
    }).where(eq(bookingsTable.id, id)).returning();

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to accept booking as cohost");
    res.status(500).json({ error: "Error al aceptar reserva" });
  }
});

// ── Reject booking on behalf of managed worker ───────────────────────────────
router.post("/cohost/bookings/:id/reject", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
    if (!booking) { res.status(404).json({ error: "Reserva no encontrada" }); return; }

    const [worker] = await db.select().from(workersTable).where(
      and(eq(workersTable.userId, booking.workerId), eq(workersTable.cohostId, req.user!.id))
    );
    if (!worker) { res.status(403).json({ error: "No autorizado" }); return; }

    if (booking.status !== "pending") {
      res.status(400).json({ error: "Solo se pueden rechazar reservas pendientes" });
      return;
    }

    const [updated] = await db.update(bookingsTable).set({ status: "cancelled" })
      .where(eq(bookingsTable.id, id)).returning();

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to reject booking as cohost");
    res.status(500).json({ error: "Error al rechazar reserva" });
  }
});

// ── Co-host stats ────────────────────────────────────────────────────────────
router.get("/cohost/stats", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const cohostId = req.user!.id;

    const myWorkers = await db
      .select({ userId: workersTable.userId, earnings: workersTable.earnings })
      .from(workersTable)
      .where(eq(workersTable.cohostId, cohostId));

    const workerUserIds = myWorkers.map(w => w.userId);

    const totalWorkers = myWorkers.length;
    const totalWorkerEarnings = myWorkers.reduce((s, w) => s + (w.earnings ?? 0), 0);

    let activeBookings = 0;
    let completedBookings = 0;
    let estimatedEarnings = 0;

    if (workerUserIds.length > 0) {
      const [active] = await db.select({ count: sql<number>`count(*)` })
        .from(bookingsTable)
        .where(and(
          inArray(bookingsTable.workerId, workerUserIds),
          inArray(bookingsTable.status, ["pending", "accepted", "in_progress"])
        ));
      activeBookings = Number(active?.count ?? 0);

      const [completed] = await db.select({ count: sql<number>`count(*)`, total: sql<number>`sum(worker_earnings)` })
        .from(bookingsTable)
        .where(and(
          inArray(bookingsTable.workerId, workerUserIds),
          eq(bookingsTable.status, "completed")
        ));
      completedBookings = Number(completed?.count ?? 0);
      // Co-host earns 10% of worker earnings by convention
      estimatedEarnings = Number(completed?.total ?? 0) * 0.1;
    }

    const myProducts = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.coHostId, cohostId), eq(productsTable.isActive, true)));

    const [ordersCount] = await db.select({ count: sql<number>`count(*)` })
      .from(productOrdersTable)
      .where(myProducts.length > 0
        ? inArray(productOrdersTable.productId, myProducts.map(p => p.id))
        : sql`false`);

    // Get co-host's product commission balance
    const [cohostUser] = await db
      .select({ productCommissionBalanceUsd: usersTable.productCommissionBalanceUsd })
      .from(usersTable)
      .where(eq(usersTable.id, cohostId));

    res.json({
      totalWorkers,
      activeBookings,
      completedBookings,
      estimatedEarnings: +estimatedEarnings.toFixed(2),
      totalProducts: myProducts.length,
      totalProductOrders: Number(ordersCount?.count ?? 0),
      productCommissionBalanceUsd: +(cohostUser?.productCommissionBalanceUsd ?? 0).toFixed(2),
    });
  } catch (err) {
    logger.error({ err }, "Failed to get cohost stats");
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// ── Co-host: withdraw product commissions ────────────────────────────────────
router.post("/cohost/withdraw-product-commission", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const cohostId = req.user!.id;
    const [cohostUser] = await db.select().from(usersTable).where(eq(usersTable.id, cohostId));
    if (!cohostUser) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

    const balance = cohostUser.productCommissionBalanceUsd ?? 0;
    if (balance <= 0) {
      res.status(400).json({ error: "No hay comisiones disponibles para retirar" }); return;
    }

    // Reset co-host product commission balance
    await db.update(usersTable).set({ productCommissionBalanceUsd: 0 }).where(eq(usersTable.id, cohostId));

    logger.info({ cohostId, amount: balance }, "Co-host product commission withdrawal requested");

    res.json({
      success: true,
      amount: +balance.toFixed(2),
      message: `Retiro de $${balance.toFixed(2)} en comisiones de productos solicitado. El admin procesará el pago.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to withdraw cohost product commissions");
    res.status(500).json({ error: "Error al solicitar retiro" });
  }
});

// ── Co-host: product commission history ─────────────────────────────────────
router.get("/cohost/product-commissions", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const cohostId = req.user!.id;

    // Get all stores managed by this co-host
    const myStores = await db
      .select({ id: storesTable.id, name: storesTable.name })
      .from(storesTable)
      .where(eq(storesTable.coHostId, cohostId));

    if (myStores.length === 0) { res.json([]); return; }

    const storeIds = myStores.map(s => s.id);
    const storeMap = Object.fromEntries(myStores.map(s => [s.id, s.name]));

    // Get delivered orders for products in those stores
    const orders = await db
      .select({
        id: productOrdersTable.id,
        productName: productsTable.name,
        storeId: productsTable.storeId,
        cohostCommissionAmt: productOrdersTable.cohostCommissionAmt,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        status: productOrdersTable.status,
        createdAt: productOrdersTable.createdAt,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(
        and(
          eq(productOrdersTable.status, "delivered"),
          inArray(productsTable.storeId, storeIds)
        )
      )
      .orderBy(productOrdersTable.createdAt);

    const result = orders.map(o => ({
      ...o,
      storeName: o.storeId ? storeMap[o.storeId] : "Sin tienda",
    }));

    res.json(result.reverse());
  } catch (err) {
    logger.error({ err }, "Failed to get cohost product commissions");
    res.status(500).json({ error: "Error al obtener comisiones" });
  }
});

// ── Generate invite code ────────────────────────────────────────────────────
// Cohost must have approved KYC before they can invite workers
router.post("/cohost/invite/generate", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const cohostUserId = req.user!.id;

    // Guard: cohost must have approved KYC
    const [kyc] = await db
      .select({ status: userVerificationsTable.status })
      .from(userVerificationsTable)
      .where(and(
        eq(userVerificationsTable.userId, cohostUserId),
        eq(userVerificationsTable.role, "cohost")
      ));

    if (!kyc || kyc.status !== "approved") {
      res.status(403).json({
        error: "Debes completar tu verificación KYC antes de invitar profesionales.",
        kycStatus: kyc?.status ?? "not_submitted",
      });
      return;
    }

    // Invalidate any previous unused invite from this cohost (optional – you could keep them all)
    const code = crypto.randomBytes(6).toString("hex").toUpperCase(); // 12-char hex e.g. "A1B2C3D4E5F6"
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invite] = await db.insert(cohostInvitationsTable).values({
      cohostUserId,
      code,
      expiresAt,
    }).returning();

    res.json({ code: invite.code, expiresAt: invite.expiresAt });
  } catch (err) {
    logger.error({ err }, "Failed to generate cohost invite");
    res.status(500).json({ error: "Error al generar código de invitación" });
  }
});

// ── List my invites ─────────────────────────────────────────────────────────
router.get("/cohost/invite/list", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const invites = await db
      .select({
        id: cohostInvitationsTable.id,
        code: cohostInvitationsTable.code,
        expiresAt: cohostInvitationsTable.expiresAt,
        usedAt: cohostInvitationsTable.usedAt,
        usedByWorkerId: cohostInvitationsTable.usedByWorkerId,
        workerName: usersTable.name,
        createdAt: cohostInvitationsTable.createdAt,
      })
      .from(cohostInvitationsTable)
      .leftJoin(workersTable, eq(cohostInvitationsTable.usedByWorkerId, workersTable.id))
      .leftJoin(usersTable, eq(workersTable.userId, usersTable.id))
      .where(eq(cohostInvitationsTable.cohostUserId, req.user!.id))
      .orderBy(cohostInvitationsTable.createdAt);

    res.json(invites.map(inv => ({
      ...inv,
      isUsed: !!inv.usedAt,
      isExpired: new Date(inv.expiresAt) < new Date(),
    })));
  } catch (err) {
    logger.error({ err }, "Failed to list cohost invites");
    res.status(500).json({ error: "Error al listar invitaciones" });
  }
});

// ── Validate invite code (public) ───────────────────────────────────────────
router.get("/invite/:code", async (req, res): Promise<void> => {
  try {
    const { code } = req.params;
    const [invite] = await db
      .select({
        id: cohostInvitationsTable.id,
        code: cohostInvitationsTable.code,
        expiresAt: cohostInvitationsTable.expiresAt,
        usedAt: cohostInvitationsTable.usedAt,
        cohostUserId: cohostInvitationsTable.cohostUserId,
        cohostName: usersTable.name,
        cohostAvatar: usersTable.avatarUrl,
      })
      .from(cohostInvitationsTable)
      .leftJoin(usersTable, eq(cohostInvitationsTable.cohostUserId, usersTable.id))
      .where(eq(cohostInvitationsTable.code, code));

    if (!invite) {
      res.status(404).json({ error: "Código de invitación no válido" });
      return;
    }
    if (new Date(invite.expiresAt) < new Date()) {
      res.status(410).json({ error: "Este código ha expirado" });
      return;
    }
    if (invite.usedAt) {
      res.status(409).json({ error: "Este código ya fue utilizado" });
      return;
    }

    res.json({
      code: invite.code,
      cohostName: invite.cohostName,
      cohostAvatar: invite.cohostAvatar,
      expiresAt: invite.expiresAt,
      valid: true,
    });
  } catch (err) {
    logger.error({ err }, "Failed to validate invite code");
    res.status(500).json({ error: "Error al validar invitación" });
  }
});

// ── Accept invite (worker links themselves to a cohost) ─────────────────────
router.post("/invite/:code/accept", authenticate, requireRole("worker"), async (req, res): Promise<void> => {
  try {
    const { code } = req.params;
    const workerUserId = req.user!.id;

    const [invite] = await db
      .select()
      .from(cohostInvitationsTable)
      .where(and(eq(cohostInvitationsTable.code, code), isNull(cohostInvitationsTable.usedAt)));

    if (!invite) {
      res.status(404).json({ error: "Código inválido o ya usado" });
      return;
    }
    if (new Date(invite.expiresAt) < new Date()) {
      res.status(410).json({ error: "Este código ha expirado" });
      return;
    }

    // Find the worker record for this user
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, workerUserId));
    if (!worker) {
      res.status(400).json({ error: "Tu cuenta no tiene perfil de profesional" });
      return;
    }

    // Link the worker to the cohost and mark the invite as used
    await db.update(workersTable).set({ cohostId: invite.cohostUserId }).where(eq(workersTable.id, worker.id));
    await db.update(cohostInvitationsTable).set({
      usedByWorkerId: worker.id,
      usedAt: new Date(),
    }).where(eq(cohostInvitationsTable.id, invite.id));

    res.json({ success: true, message: "¡Te uniste al equipo exitosamente!" });
  } catch (err) {
    logger.error({ err }, "Failed to accept cohost invite");
    res.status(500).json({ error: "Error al aceptar invitación" });
  }
});

export default router;

