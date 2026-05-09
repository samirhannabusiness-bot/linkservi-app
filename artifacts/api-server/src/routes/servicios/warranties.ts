import { Router } from "express";
import {
  db, bookingsTable, serviceWarrantiesTable, usersTable, workersTable,
  notificationsTable, categoriesTable,
} from "@workspace/db";
import { alias } from "drizzle-orm/pg-core";
import { eq, desc, and, lte } from "drizzle-orm";
import { authenticate } from "../../lib/auth";

const router = Router();

// ── Phone-like regex — must match VE formats ─────────────────────────────────
const VE_PHONE_RE =
  /(?:\+?58[\s.\-]?)?(?:0?4(?:1[246]|2[46]))[\s.\-]?\d{3}[\s.\-]?\d{4}/;

// ── Helpers ───────────────────────────────────────────────────────────────────
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1_000;

function withinWarrantyPeriod(completedAt: Date | null | undefined): boolean {
  if (!completedAt) return false;
  return Date.now() - new Date(completedAt).getTime() <= FIFTEEN_DAYS_MS;
}

// ── POST /api/bookings/:id/claim-warranty ─────────────────────────────────────
router.post("/bookings/:id/claim-warranty", authenticate, async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.id;
    const bookingId = parseInt(req.params.id);

    // Fetch booking with joins
    const [booking] = await db
      .select({
        id: bookingsTable.id,
        clientId: bookingsTable.clientId,
        workerId: bookingsTable.workerId,
        status: bookingsTable.status,
        completedAt: bookingsTable.completedAt,
        description: bookingsTable.description,
        categoryId: bookingsTable.categoryId,
        workerUserId: workersTable.userId,
        categoryName: categoriesTable.name,
        clientName: usersTable.name,
      })
      .from(bookingsTable)
      .innerJoin(workersTable, eq(bookingsTable.workerId, workersTable.id))
      .innerJoin(categoriesTable, eq(bookingsTable.categoryId, categoriesTable.id))
      .innerJoin(usersTable, eq(bookingsTable.clientId, usersTable.id))
      .where(eq(bookingsTable.id, bookingId));

    if (!booking) { res.status(404).json({ error: "Servicio no encontrado" }); return; }
    if (booking.clientId !== clientId) { res.status(403).json({ error: "Sin permiso" }); return; }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Solo puedes reclamar garantía de servicios completados" }); return;
    }
    if (!withinWarrantyPeriod(booking.completedAt)) {
      res.status(400).json({ error: "El periodo de garantía de 15 días ha expirado" }); return;
    }

    // Check no active warranty already exists for this booking
    const [existing] = await db
      .select({ id: serviceWarrantiesTable.id, status: serviceWarrantiesTable.status })
      .from(serviceWarrantiesTable)
      .where(eq(serviceWarrantiesTable.bookingId, bookingId));

    if (existing && !["refused", "expired"].includes(existing.status)) {
      res.status(409).json({ error: "Ya existe una garantía activa para este servicio" }); return;
    }

    const serviceName = booking.categoryName;
    const now = new Date();

    // Create warranty record
    const [warranty] = await db.insert(serviceWarrantiesTable).values({
      bookingId,
      clientId,
      workerId: booking.workerId,
      serviceName,
      status: "pending",
      workerNotifiedAt: now,
      claimedAt: now,
    }).returning();

    // Send high-priority notification to worker
    await db.insert(notificationsTable).values({
      userId: booking.workerUserId,
      title: "⚠️ Garantía Solicitada — Acción Requerida",
      body: `El cliente ${booking.clientName} ha activado la Garantía LinkServi por el trabajo en "${serviceName}". Por contrato, debes asistir sin costo adicional. Tienes 24 horas para responder o tu cuenta será suspendida.`,
      type: "warranty_claim",
      relatedId: warranty.id,
      isRead: false,
    });

    // Also notify admin (userId = 1 or first admin — we insert into notifications with type admin_warranty)
    // We'll use type "warranty_admin" and let admin page query by type
    await db.insert(notificationsTable).values({
      userId: 1, // admin user
      title: "🛡 Nueva Garantía LinkServi",
      body: `Cliente: ${booking.clientName} | Servicio: ${serviceName} | ID reserva: ${bookingId}`,
      type: "warranty_admin",
      relatedId: warranty.id,
      isRead: false,
    });

    res.status(201).json({ warranty, message: "Garantía activada. El profesional fue notificado con prioridad alta." });
  } catch (err) {
    console.error("[warranties] claim error:", err);
    res.status(500).json({ error: "Error al activar garantía" });
  }
});

// ── GET /api/warranties/booking/:bookingId — check warranty status ─────────────
router.get("/warranties/booking/:bookingId", authenticate, async (req, res): Promise<void> => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const [warranty] = await db
      .select()
      .from(serviceWarrantiesTable)
      .where(eq(serviceWarrantiesTable.bookingId, bookingId));
    res.json(warranty ?? null);
  } catch {
    res.status(500).json({ error: "Error" });
  }
});

// ── GET /api/admin/warranties — list all warranties ───────────────────────────
router.get("/admin/warranties", authenticate, async (req, res): Promise<void> => {
  if (req.user?.role !== "admin") { res.status(403).json({ error: "Sin permiso" }); return; }
  try {
    const workerUsers = alias(usersTable, "worker_users");
    const rows = await db
      .select({
        id: serviceWarrantiesTable.id,
        bookingId: serviceWarrantiesTable.bookingId,
        serviceName: serviceWarrantiesTable.serviceName,
        status: serviceWarrantiesTable.status,
        claimedAt: serviceWarrantiesTable.claimedAt,
        workerNotifiedAt: serviceWarrantiesTable.workerNotifiedAt,
        workerRespondedAt: serviceWarrantiesTable.workerRespondedAt,
        visitScheduledAt: serviceWarrantiesTable.visitScheduledAt,
        completedAt: serviceWarrantiesTable.completedAt,
        workerBlockedAt: serviceWarrantiesTable.workerBlockedAt,
        notes: serviceWarrantiesTable.notes,
        clientName: usersTable.name,
        workerName: workerUsers.name,
      })
      .from(serviceWarrantiesTable)
      .innerJoin(usersTable, eq(serviceWarrantiesTable.clientId, usersTable.id))
      .innerJoin(workersTable, eq(serviceWarrantiesTable.workerId, workersTable.id))
      .innerJoin(workerUsers, eq(workersTable.userId, workerUsers.id))
      .orderBy(desc(serviceWarrantiesTable.claimedAt));

    res.json(rows);
  } catch (err) {
    console.error("[warranties] admin list error:", err);
    res.status(500).json({ error: "Error al obtener garantías" });
  }
});

// ── PUT /api/admin/warranties/:id — update warranty status ────────────────────
router.put("/admin/warranties/:id", authenticate, async (req, res): Promise<void> => {
  if (req.user?.role !== "admin") { res.status(403).json({ error: "Sin permiso" }); return; }
  try {
    const id = parseInt(req.params.id);
    const { status, notes, visitScheduledAt } = req.body;
    const validStatuses = ["pending", "scheduled", "completed", "refused", "expired"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Estado inválido" }); return;
    }

    const updateData: Record<string, unknown> = { status, notes };
    if (status === "scheduled" && visitScheduledAt) {
      updateData.visitScheduledAt = new Date(visitScheduledAt);
      updateData.workerRespondedAt = new Date();
    }
    if (status === "completed") updateData.completedAt = new Date();

    const [updated] = await db
      .update(serviceWarrantiesTable)
      .set(updateData)
      .where(eq(serviceWarrantiesTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Error al actualizar garantía" });
  }
});

// ── POST /api/admin/warranties/check-unresponsive — block workers >24h ────────
// Call this manually or via a scheduled job
router.post("/admin/warranties/check-unresponsive", authenticate, async (req, res): Promise<void> => {
  if (req.user?.role !== "admin") { res.status(403).json({ error: "Sin permiso" }); return; }
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);

    // Find pending warranties where notified >24h ago and worker hasn't responded
    const overdue = await db
      .select({
        id: serviceWarrantiesTable.id,
        workerId: serviceWarrantiesTable.workerId,
        workerUserId: workersTable.userId,
        serviceName: serviceWarrantiesTable.serviceName,
        clientId: serviceWarrantiesTable.clientId,
      })
      .from(serviceWarrantiesTable)
      .innerJoin(workersTable, eq(serviceWarrantiesTable.workerId, workersTable.id))
      .where(
        and(
          eq(serviceWarrantiesTable.status, "pending"),
          lte(serviceWarrantiesTable.workerNotifiedAt, cutoff)
        )
      );

    let blocked = 0;
    for (const w of overdue) {
      // Mark warranty as "refused"
      await db.update(serviceWarrantiesTable)
        .set({ status: "refused", workerBlockedAt: new Date() })
        .where(eq(serviceWarrantiesTable.id, w.id));

      // Flag worker for suspension (mark isVerified false, verificationStatus = suspended)
      await db.update(workersTable)
        .set({ isVerified: false, verificationStatus: "suspended" })
        .where(eq(workersTable.id, w.workerId));

      // Notify worker
      await db.insert(notificationsTable).values({
        userId: w.workerUserId,
        title: "🚫 Cuenta suspendida por incumplimiento de garantía",
        body: `No respondiste a tiempo la solicitud de garantía del servicio "${w.serviceName}". Tu cuenta ha sido suspendida. Contacta a soporte para resolverlo.`,
        type: "account_suspended",
        relatedId: w.id,
        isRead: false,
      });

      blocked++;
    }

    res.json({ blocked, message: `${blocked} profesional(es) marcado(s) para suspensión` });
  } catch (err) {
    console.error("[warranties] check-unresponsive error:", err);
    res.status(500).json({ error: "Error al procesar garantías vencidas" });
  }
});

export default router;
