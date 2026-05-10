import { Router } from "express";
import { db, usersTable, workersTable, bookingsTable, categoriesTable, reviewsTable, storesTable, storeWithdrawalsTable, productRatingsTable, productsTable } from "@workspace/db";
import { eq, and, or, ilike, sql, count, sum, inArray, desc, isNotNull } from "drizzle-orm";
import { authenticate, requireRole, requireAdminRole, getEffectiveAdminRole } from "../lib/auth";
import { createNotification } from "./notifications";
import { logger } from "../lib/logger";

const router = Router();

router.get("/admin/dashboard", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [totalUsersRes] = await db.select({ count: count() }).from(usersTable);
  const [totalWorkersRes] = await db.select({ count: count() }).from(workersTable);
  const [totalClientsRes] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.role, "client"));
  const [pendingRes] = await db
    .select({ count: count() })
    .from(workersTable)
    .where(eq(workersTable.verificationStatus, "pending"));
  const [totalBookingsRes] = await db.select({ count: count() }).from(bookingsTable);
  const [activeRes] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(or(eq(bookingsTable.status, "accepted"), eq(bookingsTable.status, "in_progress")));
  const [completedRes] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "completed"));

  // Use COALESCE so bookings without a stored commission still contribute 10% of totalAmount
  const [revenueRes] = await db
    .select({ total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)` })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "completed"));

  const [commissionRes] = await db
    .select({ total: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)` })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "completed"));

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfWeek = new Date(now);
  firstOfWeek.setDate(now.getDate() - now.getDay());
  firstOfWeek.setHours(0, 0, 0, 0);

  const [monthlyRes] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
      commission: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)`,
    })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.status, "completed"), sql`${bookingsTable.completedAt} >= ${firstOfMonth}`));

  const [weeklyRes] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
      commission: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)`,
    })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.status, "completed"), sql`${bookingsTable.completedAt} >= ${firstOfWeek}`));

  const [todayRes] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
      commission: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)`,
    })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.status, "completed"), sql`${bookingsTable.completedAt}::date = CURRENT_DATE`));

  const categories = await db.select().from(categoriesTable);
  const bookingsByCategory = await Promise.all(
    categories.map(async (cat) => {
      const [res] = await db
        .select({ count: count() })
        .from(bookingsTable)
        .where(eq(bookingsTable.categoryId, cat.id));
      return { categoryName: cat.name, count: res?.count ?? 0 };
    })
  );

  const recentBookings = await db
    .select()
    .from(bookingsTable)
    .orderBy(bookingsTable.createdAt)
    .limit(10);

  const enrichedRecent = await Promise.all(
    recentBookings.map(async (b) => {
      const [client] = await db.select().from(usersTable).where(eq(usersTable.id, b.clientId));
      const [workerRec] = await db
        .select({ user: usersTable })
        .from(workersTable)
        .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
        .where(eq(workersTable.id, b.workerId));
      const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, b.categoryId));
      return {
        id: b.id,
        clientId: b.clientId,
        workerId: b.workerId,
        categoryId: b.categoryId,
        clientName: client?.name ?? "Unknown",
        workerName: workerRec?.user.name ?? "Unknown",
        categoryName: category?.name ?? "Unknown",
        description: b.description,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        status: b.status,
        estimatedHours: b.estimatedHours,
        totalAmount: b.totalAmount,
        paymentProofUrl: b.paymentProofUrl,
        paymentRejectedReason: b.paymentRejectedReason,
        paymentMethod: b.paymentMethod,
        scheduledAt: b.scheduledAt,
        completedAt: b.completedAt,
        createdAt: b.createdAt,
      };
    })
  );

  // Escrow: money locked in active bookings (payment confirmed, in progress, finished)
  const [escrowRes] = await db
    .select({ total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)` })
    .from(bookingsTable)
    .where(inArray(bookingsTable.status, ["payment_confirmed", "in_progress", "finished"]));

  // Pending withdrawals count
  const [pendingWithdrawalsRes] = await db
    .select({ count: count() })
    .from(storeWithdrawalsTable)
    .where(eq(storeWithdrawalsTable.status, "pending"));

  // Open disputes count
  const [openDisputesRes] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(inArray(bookingsTable.status, ["disputed", "dispute_in_review"]));

  // Active stores count
  const [activeStoresRes] = await db
    .select({ count: count() })
    .from(storesTable)
    .where(eq(storesTable.isActive, true));

  const topWorkers = await db
    .select({ worker: workersTable, user: usersTable, category: categoriesTable })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .leftJoin(categoriesTable, eq(workersTable.categoryId, categoriesTable.id))
    .where(eq(workersTable.isVerified, true))
    .orderBy(workersTable.rating)
    .limit(5);

  res.json({
    totalUsers: totalUsersRes?.count ?? 0,
    totalWorkers: totalWorkersRes?.count ?? 0,
    totalClients: totalClientsRes?.count ?? 0,
    pendingVerifications: pendingRes?.count ?? 0,
    totalBookings: totalBookingsRes?.count ?? 0,
    activeBookings: activeRes?.count ?? 0,
    completedBookings: completedRes?.count ?? 0,
    totalRevenue: Number(revenueRes?.total ?? 0),
    totalCommissions: Number(commissionRes?.total ?? 0),
    revenueThisMonth: Number(monthlyRes?.total ?? 0),
    commissionsThisMonth: Number(monthlyRes?.commission ?? 0),
    revenueThisWeek: Number(weeklyRes?.total ?? 0),
    commissionsThisWeek: Number(weeklyRes?.commission ?? 0),
    revenueToday: Number(todayRes?.total ?? 0),
    commissionsToday: Number(todayRes?.commission ?? 0),
    escrowAmount: Number(escrowRes?.total ?? 0),
    pendingWithdrawals: pendingWithdrawalsRes?.count ?? 0,
    openDisputes: openDisputesRes?.count ?? 0,
    activeStores: activeStoresRes?.count ?? 0,
    bookingsByCategory,
    recentBookings: enrichedRecent,
    topWorkers: topWorkers.map((w) => ({
      id: w.worker.id,
      userId: w.worker.userId,
      name: w.user.name,
      avatarUrl: w.user.avatarUrl,
      categoryId: w.worker.categoryId,
      categoryName: w.category?.name ?? null,
      description: w.worker.description,
      skills: w.worker.skills,
      hourlyRate: w.worker.hourlyRate,
      rating: w.worker.rating,
      reviewCount: w.worker.reviewCount,
      isAvailable: w.worker.isAvailable,
      isVerified: w.worker.isVerified,
      lat: w.worker.lat,
      lng: w.worker.lng,
      distance: null,
      completedJobs: w.worker.completedJobs,
    })),
  });
});

router.get("/admin/users", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const { role, search } = req.query as { role?: string; search?: string };
  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, role));
  if (search) conditions.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`)));

  const users = await db
    .select()
    .from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(usersTable.createdAt);

  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      avatarUrl: u.avatarUrl,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }))
  );
});

router.put("/admin/users/:userId", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  const { isActive, role } = req.body;
  const [updated] = await db
    .update(usersTable)
    .set({ ...(isActive !== undefined && { isActive }), ...(role && { role }) })
    .where(eq(usersTable.id, userId))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
    role: updated.role,
    avatarUrl: updated.avatarUrl,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  });
});

// ─── Admin: delete (anonymize) a user ────────────────────────────────────────
router.delete("/admin/users/:userId", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const userId = parseInt(raw, 10);
    if (isNaN(userId)) { res.status(400).json({ error: "ID de usuario inválido" }); return; }
    const adminUser = (req as any).user;

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!existing) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
    if (existing.role === "admin") { res.status(403).json({ error: "No se puede eliminar un administrador" }); return; }

    const anonymizedEmail = `deleted_${userId}_${Date.now()}@deleted.local`;
    await db
      .update(usersTable)
      .set({
        email: anonymizedEmail,
        name: "Usuario eliminado",
        phone: null,
        avatarUrl: null,
        passwordHash: "deleted",
        isActive: false,
        provider: "deleted",
        providerId: null,
        state: null,
        city: null,
        referralCode: null,
        passwordResetToken: null,
      })
      .where(eq(usersTable.id, userId));

    logger.info({
      action: "admin_delete_user",
      targetUserId: userId,
      targetEmail: existing.email,
      adminId: adminUser?.id,
      adminEmail: adminUser?.email,
    }, `Admin ${adminUser?.email} deleted user ${existing.email} (id: ${userId})`);

    res.json({ ok: true, message: "Usuario eliminado correctamente" });
  } catch (err: any) {
    logger.error({ err, userId: req.params.userId }, "Error deleting user");
    res.status(500).json({ error: err?.message ?? "Error interno al eliminar usuario" });
  }
});

router.get("/admin/workers/pending", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  // Solo profesionales pendientes QUE YA HAYAN SUBIDO sus dos documentos.
  // Antes mostrábamos a todos los pendientes (incluso sin documentos), lo
  // que invitaba al admin a aprobarlos en blanco. La cola unificada
  // (/admin/verifications) es la única fuente de verdad para KYC; este
  // endpoint queda como vista complementaria solo para casos con docs.
  const rows = await db
    .select({ worker: workersTable, user: usersTable })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .where(and(
      eq(workersTable.verificationStatus, "pending"),
      isNotNull(workersTable.documentImageUrl),
      isNotNull(workersTable.selfieImageUrl),
    ));
  res.json(
    rows.map(({ worker: w, user: u }) => ({
      id: w.id,
      userId: w.userId,
      workerName: u.name,
      workerEmail: u.email,
      workerPhone: u.phone,
      categoryId: w.categoryId,
      description: w.description,
      skills: w.skills,
      hourlyRate: w.hourlyRate,
      rating: w.rating,
      reviewCount: w.reviewCount,
      isAvailable: w.isAvailable,
      isVerified: w.isVerified,
      verificationStatus: w.verificationStatus,
      verificationNotes: w.verificationNotes,
      documentType: w.documentType,
      documentNumber: w.documentNumber,
      documentImageUrl: w.documentImageUrl,
      selfieImageUrl: w.selfieImageUrl,
      emergencyContact: w.emergencyContact,
      emergencyPhone: w.emergencyPhone,
      lat: w.lat,
      lng: w.lng,
      completedJobs: w.completedJobs,
      earnings: w.earnings,
    }))
  );
});

router.post("/admin/workers/:workerId/verify", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const workerId = parseInt(raw, 10);
  const { approved, notes } = req.body;

  // ── GUARDIA: NUNCA aprobar sin documentos ─────────────────────────────────
  // Antes este endpoint permitía aprobar a un profesional que jamás subió
  // documento ni selfie. Eso saltaba el sistema unificado de KYC y dejaba
  // verificados a usuarios sin haber pasado por revisión real. Bug detectado
  // en producción (Ramón, 5/10/26): activó rol pero su verificación se
  // aprobó vacía. Ahora forzamos validar fotos antes de aprobar.
  if (approved === true) {
    const [w] = await db.select().from(workersTable).where(eq(workersTable.id, workerId));
    if (!w) { res.status(404).json({ error: "Worker not found" }); return; }
    if (!w.documentImageUrl || !w.selfieImageUrl) {
      res.status(400).json({
        error: "Este profesional no ha subido sus documentos. No puede ser aprobado hasta que complete su verificación de identidad (cédula + selfie).",
      });
      return;
    }
  }

  const [updated] = await db
    .update(workersTable)
    .set({
      isVerified: approved === true,
      verificationStatus: approved === true ? "approved" : "rejected",
      verificationNotes: notes ?? null,
    })
    .where(eq(workersTable.id, workerId))
    .returning();

  // Notify worker
  try {
    if (approved) {
      await createNotification(updated.userId, "verification_approved", "✅ Perfil verificado", "¡Felicitaciones! Tu perfil ha sido verificado. Ahora aparecerás como profesional verificado en ServiLink.");
    } else {
      await createNotification(updated.userId, "verification_rejected", "❌ Verificación rechazada", notes ? `Tu verificación fue rechazada: ${notes}` : "Tu verificación fue rechazada. Actualiza tus documentos e intenta de nuevo.");
    }
  } catch (e) {}
  if (!updated) { res.status(404).json({ error: "Worker not found" }); return; }
  res.json({
    id: updated.id,
    userId: updated.userId,
    categoryId: updated.categoryId,
    description: updated.description,
    skills: updated.skills,
    hourlyRate: updated.hourlyRate,
    rating: updated.rating,
    reviewCount: updated.reviewCount,
    isAvailable: updated.isAvailable,
    isVerified: updated.isVerified,
    verificationStatus: updated.verificationStatus,
    lat: updated.lat,
    lng: updated.lng,
    completedJobs: updated.completedJobs,
    earnings: updated.earnings,
  });
});

// Grant or revoke Premium status for a worker
router.post("/admin/workers/:workerId/premium", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const workerId = parseInt(raw, 10);
  const { isPremium, days } = req.body;

  const premiumUntil = isPremium && days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  const [updated] = await db
    .update(workersTable)
    .set({ isPremium: isPremium === true, premiumUntil })
    .where(eq(workersTable.id, workerId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Worker not found" }); return; }

  try {
    if (isPremium) {
      await createNotification(
        updated.userId,
        "premium_granted",
        "⭐ ¡Eres trabajador Premium!",
        `Tu cuenta ha sido actualizada a Premium. Tendrás visibilidad prioritaria en toda Venezuela${days ? ` por ${days} días` : ""}.`
      );
    } else {
      await createNotification(
        updated.userId,
        "premium_revoked",
        "ℹ️ Estado Premium actualizado",
        "Tu estado Premium ha sido actualizado."
      );
    }
  } catch (e) {}

  res.json({ id: updated.id, isPremium: updated.isPremium, premiumUntil: updated.premiumUntil });
});

// List all workers (admin view) with premium info
router.get("/admin/workers", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({ worker: workersTable, user: usersTable })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .orderBy(workersTable.createdAt);

  res.json(rows.map(({ worker: w, user: u }) => ({
    id: w.id,
    userId: w.userId,
    workerName: u.name,
    workerEmail: u.email,
    workerPhone: u.phone,
    categoryId: w.categoryId,
    rating: w.rating,
    reviewCount: w.reviewCount,
    isAvailable: w.isAvailable,
    isVerified: w.isVerified,
    isPremium: w.isPremium,
    premiumUntil: w.premiumUntil,
    verificationStatus: w.verificationStatus,
    state: w.state ?? u.state ?? null,
    city: w.city ?? u.city ?? null,
    completedJobs: w.completedJobs,
    earnings: w.earnings,
  })));
});

router.get("/admin/bookings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };
  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(status ? eq(bookingsTable.status, status) : undefined)
    .orderBy(bookingsTable.createdAt);

  const enriched = await Promise.all(
    bookings.map(async (b) => {
      const [client] = await db.select().from(usersTable).where(eq(usersTable.id, b.clientId));
      const [workerRec] = await db
        .select({ user: usersTable })
        .from(workersTable)
        .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
        .where(eq(workersTable.id, b.workerId));
      const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, b.categoryId));
      return {
        id: b.id,
        clientId: b.clientId,
        workerId: b.workerId,
        categoryId: b.categoryId,
        clientName: client?.name ?? "Unknown",
        workerName: workerRec?.user.name ?? "Unknown",
        categoryName: category?.name ?? "Unknown",
        description: b.description,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        status: b.status,
        estimatedHours: b.estimatedHours,
        totalAmount: b.totalAmount,
        paymentProofUrl: b.paymentProofUrl,
        paymentRejectedReason: b.paymentRejectedReason,
        paymentMethod: b.paymentMethod,
        paymentAmount: b.paymentAmount,
        paymentReference: b.paymentReference,
        acceptedAt: b.acceptedAt,
        commission: b.commission,
        workerEarnings: b.workerEarnings,
        agreedPrice: b.agreedPrice,
        scheduledAt: b.scheduledAt,
        completedAt: b.completedAt,
        createdAt: b.createdAt,
      };
    })
  );
  res.json(enriched);
});

// Toggle store active/suspended status
router.patch("/admin/stores/:id/suspend", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const storeId = parseInt(req.params.id, 10);
  const { isActive } = req.body;
  const [updated] = await db
    .update(storesTable)
    .set({ isActive: isActive === true })
    .where(eq(storesTable.id, storeId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Store not found" }); return; }
  res.json({ id: updated.id, isActive: updated.isActive });
});

router.post("/admin/categories", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const { name, description, icon, color } = req.body;
  if (!name || !icon) {
    res.status(400).json({ error: "name and icon are required" });
    return;
  }
  const [cat] = await db
    .insert(categoriesTable)
    .values({ name, description: description ?? null, icon, color: color ?? "#3B82F6" })
    .returning();
  res.status(201).json({ id: cat.id, name: cat.name, description: cat.description, icon: cat.icon, color: cat.color, workerCount: 0 });
});

// ─── Admin: product ratings list ────────────────────────────────────────────
router.get("/admin/product-ratings", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const ratings = await db
    .select({
      id: productRatingsTable.id,
      productRating: productRatingsTable.productRating,
      storeRating: productRatingsTable.storeRating,
      comment: productRatingsTable.comment,
      createdAt: productRatingsTable.createdAt,
      productName: productsTable.name,
      clientName: usersTable.name,
      clientEmail: usersTable.email,
    })
    .from(productRatingsTable)
    .leftJoin(productsTable, eq(productRatingsTable.productId, productsTable.id))
    .leftJoin(usersTable, eq(productRatingsTable.clientId, usersTable.id))
    .orderBy(desc(productRatingsTable.createdAt));
  res.json(ratings);
});

// ─── Admin: delete a product rating ─────────────────────────────────────────
router.delete("/admin/product-ratings/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [deleted] = await db.delete(productRatingsTable).where(eq(productRatingsTable.id, id)).returning({ id: productRatingsTable.id });
  if (!deleted) { res.status(404).json({ error: "Calificación no encontrada" }); return; }
  res.json({ ok: true });
});

// ─── Admin Collaborators ─────────────────────────────────────────────────────
// GET /api/admin/collaborators — list all admin users
router.get("/admin/collaborators", authenticate, requireRole("admin"), requireAdminRole("super_admin"), async (_req, res): Promise<void> => {
  const admins = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      avatarUrl: usersTable.avatarUrl,
      adminRole: usersTable.adminRole,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .orderBy(usersTable.createdAt);

  res.json(
    admins.map((u) => ({
      ...u,
      adminRole: u.adminRole ?? "super_admin",
    }))
  );
});

// POST /api/admin/collaborators — grant admin access to an existing user
router.post("/admin/collaborators", authenticate, requireRole("admin"), requireAdminRole("super_admin"), async (req, res): Promise<void> => {
  const { email, adminRole } = req.body;
  const validRoles = ["super_admin", "soporte", "finanzas"];
  if (!email || !adminRole || !validRoles.includes(adminRole)) {
    res.status(400).json({ error: "Email y rol son requeridos. Roles válidos: super_admin, soporte, finanzas" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase()));
  if (!target) {
    res.status(404).json({ error: "No se encontró ningún usuario con ese correo" });
    return;
  }
  if (target.role === "admin" && (target.adminRole ?? "super_admin") === "super_admin" && target.id === req.user!.id) {
    res.status(400).json({ error: "No puedes modificar tu propio rol de super administrador" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role: "admin", adminRole })
    .where(eq(usersTable.id, target.id))
    .returning();

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    avatarUrl: updated.avatarUrl,
    adminRole: updated.adminRole ?? "super_admin",
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  });
});

// PUT /api/admin/collaborators/:id — change adminRole
router.put("/admin/collaborators/:id", authenticate, requireRole("admin"), requireAdminRole("super_admin"), async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  const { adminRole } = req.body;
  const validRoles = ["super_admin", "soporte", "finanzas"];
  if (!adminRole || !validRoles.includes(adminRole)) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }
  if (userId === req.user!.id) {
    res.status(400).json({ error: "No puedes cambiar tu propio rol" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ adminRole })
    .where(and(eq(usersTable.id, userId), eq(usersTable.role, "admin")))
    .returning();

  if (!updated) { res.status(404).json({ error: "Colaborador no encontrado" }); return; }
  res.json({ id: updated.id, name: updated.name, adminRole: updated.adminRole ?? "super_admin" });
});

// DELETE /api/admin/collaborators/:id — revoke admin access
router.delete("/admin/collaborators/:id", authenticate, requireRole("admin"), requireAdminRole("super_admin"), async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (userId === req.user!.id) {
    res.status(400).json({ error: "No puedes revocar tu propio acceso" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role: "client", adminRole: null })
    .where(and(eq(usersTable.id, userId), eq(usersTable.role, "admin")))
    .returning();

  if (!updated) { res.status(404).json({ error: "Colaborador no encontrado" }); return; }
  res.json({ ok: true, id: updated.id });
});

// GET /api/admin/collaborators/search — search user by email (for invitation)
router.get("/admin/collaborators/search", authenticate, requireRole("admin"), requireAdminRole("super_admin"), async (req, res): Promise<void> => {
  const { email } = req.query as { email?: string };
  if (!email || email.trim().length < 3) {
    res.status(400).json({ error: "Ingresa al menos 3 caracteres del correo" });
    return;
  }

  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, adminRole: usersTable.adminRole, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(ilike(usersTable.email, `%${email.trim()}%`))
    .limit(5);

  res.json(users.map((u) => ({
    ...u,
    adminRole: u.role === "admin" ? (u.adminRole ?? "super_admin") : null,
    isAdmin: u.role === "admin",
  })));
});

export default router;
