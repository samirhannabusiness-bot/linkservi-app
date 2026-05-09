import { Router } from "express";
import { z } from "zod";
import {
  db,
  bookingsTable,
  workersTable,
  usersTable,
  categoriesTable,
  userVerificationsTable,
  eventsTable,
} from "@workspace/db";
import { eq, and, aliasedTable, sql, ne, desc } from "drizzle-orm";
import { subMinutes } from "date-fns";
import { authenticate } from "../../lib/auth";
import { createNotification } from "../notifications";
import { logger } from "../../lib/logger";
import { sendNewBookingEmail } from "../../lib/email";

const router = Router();

// ── Input validation schemas (defensive — replaces console.error/500 with 400) ─
// Strings are length-capped to avoid DoS via huge payloads; numbers are
// coerced and range-checked. Schemas are intentionally permissive about
// optional fields so we don't break existing clients.
const createBookingSchema = z.object({
  workerId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive(),
  description: z.string().trim().min(1).max(2000),
  address: z.string().trim().min(1).max(500),
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  estimatedHours: z.coerce.number().min(0).max(720).optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable().or(z.literal("")),
  clientBudget: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  bookingType: z.enum(["service", "inquiry"]).optional(),
  serviceId: z.coerce.number().int().positive().optional().nullable(),
  autoAccept: z.boolean().optional(),
  fixedPrice: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
}).passthrough();

const disputeSchema = z.object({
  reason: z.string().trim().min(3).max(2000).optional(),
}).passthrough();

const counterOfferSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
}).passthrough();

const counterOfferRespondSchema = z.object({
  accept: z.boolean(),
}).passthrough();

function badRequest(res: any, err: z.ZodError) {
  const first = err.issues[0];
  res.status(400).json({
    error: first?.message ?? "Datos inválidos",
    field: first?.path?.join(".") ?? null,
  });
}

// ── Aliased table for worker's user record (avoids ambiguous join) ────────────
const workerUsersTable = aliasedTable(usersTable, "wu");

// ── Optimized single-booking enrichment (3 queries → used only for mutations) ─
async function enrichBooking(booking: typeof bookingsTable.$inferSelect) {
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, booking.clientId));
  const [workerRow] = await db
    .select({ worker: workersTable, user: usersTable })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .where(eq(workersTable.id, booking.workerId));
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, booking.categoryId));
  return bookingToResponse(booking, client?.name ?? "Unknown", workerRow?.user.name ?? "Unknown", workerRow?.worker.userId, category?.name ?? "Unknown");
}

// ── Aliased table for user_verifications (LEFT JOIN — optional) ───────────────
const clientVerifTable = aliasedTable(userVerificationsTable, "cv");

// ── Single JOIN list enrichment (used for GET /bookings — avoids N+1) ─────────
async function enrichBookingsList(conditions: ReturnType<typeof eq>[]) {
  const rows = await db
    .select({
      booking: bookingsTable,
      clientName: usersTable.name,
      clientPlan: usersTable.clientPlan,
      clientPremiumUntil: usersTable.clientPremiumUntil,
      workerName: workerUsersTable.name,
      workerUserId: workersTable.userId,
      categoryName: categoriesTable.name,
      clientVerificationStatus: clientVerifTable.status,
    })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.clientId, usersTable.id))
    .innerJoin(workersTable, eq(bookingsTable.workerId, workersTable.id))
    .innerJoin(workerUsersTable, eq(workersTable.userId, workerUsersTable.id))
    .innerJoin(categoriesTable, eq(bookingsTable.categoryId, categoriesTable.id))
    .leftJoin(clientVerifTable, eq(bookingsTable.clientId, clientVerifTable.userId))
    .where(and(...conditions))
    .orderBy(
      // Premium clients first (premium > free alphabetically when DESC)
      sql`CASE WHEN ${usersTable.clientPlan} = 'premium' AND ${usersTable.clientPremiumUntil} > NOW() THEN 0 ELSE 1 END`,
      bookingsTable.createdAt,
    );

  return rows.map(r =>
    bookingToResponse(
      r.booking,
      r.clientName ?? "Unknown",
      r.workerName ?? "Unknown",
      r.workerUserId,
      r.categoryName ?? "Unknown",
      r.clientPlan ?? "free",
      r.clientPremiumUntil ?? null,
      r.clientVerificationStatus ?? "not_submitted",
    )
  );
}

function bookingToResponse(
  booking: typeof bookingsTable.$inferSelect,
  clientName: string,
  workerName: string,
  workerUserId: number | undefined,
  categoryName: string,
  clientPlan: string = "free",
  clientPremiumUntil: Date | null = null,
  clientVerificationStatus: string = "not_submitted",
) {
  const isPremiumClient = clientPlan === "premium" && !!clientPremiumUntil && new Date(clientPremiumUntil) > new Date();
  const clientIsVerified = clientVerificationStatus === "approved";
  return {
    id: booking.id,
    clientId: booking.clientId,
    workerId: booking.workerId,
    categoryId: booking.categoryId,
    clientName,
    clientPlan,
    isPremiumClient,
    clientIsVerified,
    clientVerificationStatus,
    workerName,
    workerUserId,
    categoryName,
    description: booking.description,
    address: booking.address,
    lat: booking.lat,
    lng: booking.lng,
    status: booking.status,
    estimatedHours: booking.estimatedHours,
    totalAmount: booking.totalAmount,
    clientBudget: booking.clientBudget,
    agreedPrice: booking.agreedPrice,
    commission: booking.commission,
    workerEarnings: booking.workerEarnings,
    paymentProofUrl: booking.paymentProofUrl,
    paymentRejectedReason: booking.paymentRejectedReason,
    paymentMethod: booking.paymentMethod,
    paymentNote: booking.paymentNote,
    paymentAmount: booking.paymentAmount,
    paymentReference: booking.paymentReference,
    bcvRateUsed: booking.bcvRateUsed,
    bcvAmountBs: booking.bcvAmountBs,
    acceptedAt: booking.acceptedAt,
    disputeReason: booking.disputeReason,
    scheduledAt: booking.scheduledAt,
    startedAt: booking.startedAt,
    finishedAt: booking.finishedAt,
    completedAt: booking.completedAt,
    createdAt: booking.createdAt,
    workerCounterOffer: booking.workerCounterOffer,
    counterOfferStatus: booking.counterOfferStatus,
    bookingType: booking.bookingType,
    serviceId: booking.serviceId,
  };
}

// Helper: get all admin user IDs for notifications
async function getAdminUserIds(): Promise<number[]> {
  const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
  return admins.map(a => a.id);
}

// Helper: get worker record for authenticated user
async function getWorkerForUser(userId: number) {
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, userId));
  return worker ?? null;
}

// ── Authorization helpers ─────────────────────────────────────────────────────
async function assertClientOwnsBooking(booking: typeof bookingsTable.$inferSelect, userId: number, res: any): Promise<boolean> {
  if (booking.clientId !== userId) {
    res.status(403).json({ error: "No tienes permiso para realizar esta acción en esta solicitud." });
    return false;
  }
  return true;
}

async function assertWorkerOwnsBooking(booking: typeof bookingsTable.$inferSelect, userId: number, res: any): Promise<boolean> {
  const worker = await getWorkerForUser(userId);
  if (!worker || worker.id !== booking.workerId) {
    res.status(403).json({ error: "No tienes permiso para realizar esta acción en esta solicitud." });
    return false;
  }
  return true;
}

// ── List bookings (N+1 fixed with single JOIN query) ─────────────────────────
router.get("/bookings", authenticate, async (req, res): Promise<void> => {
  const { status, role } = req.query as { status?: string; role?: string };
  const userId = req.user!.id;

  let conditions: ReturnType<typeof eq>[] = [];

  if (role === "worker") {
    const worker = await getWorkerForUser(userId);
    if (!worker) { res.json([]); return; }
    conditions = [eq(bookingsTable.workerId, worker.id)];
  } else {
    conditions = [eq(bookingsTable.clientId, userId)];
  }

  if (status) conditions.push(eq(bookingsTable.status, status));

  const enriched = await enrichBookingsList(conditions);
  res.json(enriched);
});

// ── Create booking ────────────────────────────────────────────────────────────
router.post("/bookings", authenticate, async (req, res): Promise<void> => {
  const parsed = createBookingSchema.safeParse(req.body ?? {});
  if (!parsed.success) { badRequest(res, parsed.error); return; }
  const { workerId, categoryId, description, address, lat, lng, estimatedHours, scheduledAt, clientBudget, bookingType, serviceId, autoAccept, fixedPrice } = parsed.data;

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, workerId));
  if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

  // ── Confianza Total: client must have submitted identity verification ──────
  const [clientVerif] = await db
    .select({ status: userVerificationsTable.status })
    .from(userVerificationsTable)
    .where(eq(userVerificationsTable.userId, req.user!.id));
  const clientVerifStatus = clientVerif?.status ?? "not_submitted";
  if (clientVerifStatus === "not_submitted" || clientVerifStatus === "rejected") {
    res.status(403).json({
      error: "Debes verificar tu identidad antes de solicitar servicios. LinkServi garantiza la seguridad de todos.",
      code: "CLIENT_NOT_VERIFIED",
      verificationStatus: clientVerifStatus,
    });
    return;
  }

  const type = bookingType === "inquiry" ? "inquiry" : "service";
  const totalAmount = type === "inquiry"
    ? 0
    : (clientBudget ? Number(clientBudget) : (worker.servicePrice ?? worker.hourlyRate ?? 0));

  // autoAccept: when client books a fixed-price menu service, bypass worker acceptance
  const isAutoAccept = autoAccept === true && fixedPrice && Number(fixedPrice) > 0;
  const agreedAmt = isAutoAccept ? Number(fixedPrice) : null;

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      clientId: req.user!.id,
      workerId,
      categoryId,
      description,
      address,
      lat: lat ?? null,
      lng: lng ?? null,
      estimatedHours: estimatedHours ?? null,
      totalAmount: agreedAmt ?? totalAmount,
      clientBudget: clientBudget ? Number(clientBudget) : null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: isAutoAccept ? "accepted" : "pending",
      acceptedAt: isAutoAccept ? new Date() : null,
      agreedPrice: agreedAmt,
      bookingType: type,
      serviceId: serviceId ? Number(serviceId) : null,
    })
    .returning();

  const enriched = await enrichBooking(booking);

  // Send email to worker
  {
    const [workerUser] = await db.select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, worker.userId));
    if (workerUser) {
      sendNewBookingEmail({
        workerEmail:  workerUser.email,
        workerName:   workerUser.name,
        clientName:   enriched.clientName,
        categoryName: enriched.categoryName,
        description,
        address,
        budgetUsd:    totalAmount || null,
        bookingId:    booking.id,
        isPremium:    worker.isPremium ?? false,
      }).catch(err => logger.warn({ err, bookingId: booking.id }, "❌ EMAIL FAILED — new booking notification"));
    }
  }

  try {
    if (isAutoAccept) {
      await createNotification(
        worker.userId,
        "new_booking",
        "⚡ Reserva directa recibida",
        `${enriched.clientName} reservó tu servicio por $${agreedAmt?.toFixed(2)}. El pago está en proceso.`,
        booking.id,
        "worker"
      );
      await createNotification(
        req.user!.id,
        "booking_accepted",
        "✅ Reserva confirmada — realiza tu pago",
        `Tu reserva de ${enriched.categoryName} por $${agreedAmt?.toFixed(2)} está lista. Completa el pago para comenzar.`,
        booking.id,
        "client"
      );
    } else {
      // Premium Early Access: notify Premium workers immediately, free workers after 30s delay.
      const notifyWorker = () => createNotification(
        worker.userId,
        "new_booking",
        worker.isPremium ? "⭐ Nueva solicitud — acceso prioritario" : "🔔 Nueva solicitud de servicio",
        `${enriched.clientName} solicita ${enriched.categoryName}. ¡Revisa y acepta ahora!`,
        booking.id,
        "worker"
      );
      if (worker.isPremium) {
        await notifyWorker();
      } else {
        setTimeout(() => { notifyWorker().catch(() => {}); }, 30_000);
      }

      // ── Multi-envío: after 15 min, if still pending notify top-3 similar workers ──
      // These workers receive an "oportunidad disponible" alert — NOT the booking itself.
      setTimeout(async () => {
        try {
          const [current] = await db
            .select({ status: bookingsTable.status })
            .from(bookingsTable)
            .where(eq(bookingsTable.id, booking.id));
          if (current?.status !== "pending") return;

          const alternatives = await db
            .select({ userId: workersTable.userId, name: usersTable.name })
            .from(workersTable)
            .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
            .where(and(
              eq(workersTable.categoryId, booking.categoryId),
              eq(workersTable.isAvailable, true),
              eq(workersTable.isVerified, true),
              ne(workersTable.id, workerId),
            ))
            .orderBy(desc(workersTable.rating))
            .limit(3);

          for (const alt of alternatives) {
            await createNotification(
              alt.userId,
              "new_opportunity",
              "📣 Cliente buscando en tu área",
              `Un cliente necesita ${enriched.categoryName} ahora mismo. ¡Actívate y gana más oportunidades!`,
              null,
              "worker"
            );
          }
        } catch (_) {}
      }, 10 * 60 * 1000);
    }
  } catch (e) {}

  res.status(201).json(enriched);
});

// ── Get single booking ────────────────────────────────────────────────────────
router.get("/bookings/:bookingId", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  res.json(await enrichBooking(booking));
});

// ── Accept (worker) → accepted ────────────────────────────────────────────────
router.post("/bookings/:bookingId/accept", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: only the assigned worker can accept
  if (req.user!.role !== "admin") {
    const ok = await assertWorkerOwnsBooking(booking, req.user!.id, res);
    if (!ok) return;
  }

  const [workerUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!workerUser?.avatarUrl) {
    res.status(403).json({ error: "Debes agregar una foto de perfil antes de aceptar trabajos.", code: "NO_AVATAR" });
    return;
  }

  // Gate 3 — KYC: only identity-verified workers can accept jobs
  const [workerRow] = await db.select({ isVerified: workersTable.isVerified })
    .from(workersTable)
    .where(eq(workersTable.userId, req.user!.id));
  if (!workerRow?.isVerified) {
    res.status(403).json({
      error: "Debes completar tu verificación de identidad antes de aceptar trabajos.",
      code: "NOT_VERIFIED",
    });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);
  try {
    await createNotification(
      booking.clientId,
      "booking_accepted",
      "✅ Servicio aceptado — realiza tu pago",
      `${enriched.workerName} aceptó tu solicitud de ${enriched.categoryName}. Ahora debes pagar a LinkServi para continuar.`,
      bookingId,
      "client"
    );
  } catch (e) {}

  res.json(enriched);
});

// ── Client submits payment proof → payment_pending ────────────────────────────
const MAX_PROOF_BYTES = 2 * 1024 * 1024; // 2MB raw → ~2.7MB base64

router.post("/bookings/:bookingId/submit-proof", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: only the booking client can submit proof
  if (req.user!.role !== "admin") {
    const ok = await assertClientOwnsBooking(booking, req.user!.id, res);
    if (!ok) return;
  }

  if (booking.status !== "accepted") {
    res.status(400).json({ error: "Solo se puede subir comprobante cuando el servicio está aceptado" });
    return;
  }

  const { proofUrl, method, paymentAmount, paymentReference, bcvRateUsed, bcvAmountBs } = req.body;
  // Accept either proofUrl (GCS object path — preferred) or legacy proofBase64
  const proofBase64Legacy = req.body.proofBase64 as string | undefined;
  const finalProofUrl = proofUrl ?? proofBase64Legacy ?? null;
  if (!finalProofUrl) { res.status(400).json({ error: "Se requiere imagen del comprobante" }); return; }

  // If legacy base64, enforce size limit; GCS uploads are already limited at the storage layer
  if (!proofUrl && proofBase64Legacy) {
    const estimatedBytes = Math.ceil((proofBase64Legacy.length * 3) / 4);
    if (estimatedBytes > MAX_PROOF_BYTES) {
      res.status(400).json({ error: `La imagen del comprobante es demasiado grande. Máximo permitido: 2MB.` });
      return;
    }
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({
      status: "payment_pending",
      paymentProofUrl: finalProofUrl,
      paymentMethod: method ?? null,
      paymentAmount: paymentAmount ? Number(paymentAmount) : null,
      paymentReference: paymentReference ?? null,
      bcvRateUsed: bcvRateUsed ? Number(bcvRateUsed) : null,
      bcvAmountBs: bcvAmountBs ? Number(bcvAmountBs) : null,
    })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));
  try {
    await createNotification(
      booking.clientId,
      "payment_submitted",
      "📤 Comprobante enviado — en revisión",
      `Tu comprobante de pago para ${enriched.categoryName} fue recibido. El equipo LinkServi lo verificará en breve (máx. 30 min).`,
      bookingId,
      "client"
    );
    if (worker) {
      await createNotification(
        worker.userId,
        "payment_pending",
        "⏳ Pago del cliente en verificación",
        `El cliente envió su comprobante para ${enriched.categoryName}. Espera la confirmación de LinkServi antes de iniciar.`,
        bookingId,
        "worker"
      );
    }
    const adminIds = await getAdminUserIds();
    await Promise.all(adminIds.map(adminId =>
      createNotification(
        adminId,
        "admin_payment_proof",
        "🔔 Comprobante de pago recibido",
        `${enriched.clientName} subió un comprobante para "${enriched.categoryName}" (${method ?? "método no especificado"}${paymentAmount ? ` · $${Number(paymentAmount).toFixed(2)}` : ""}). Requiere verificación.`,
        bookingId,
        "admin"
      )
    ));
  } catch (e) {}

  res.json(enriched);
});

// ── Admin confirms payment → payment_confirmed ────────────────────────────────
router.post("/bookings/:bookingId/confirm-payment", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Solo los administradores pueden confirmar pagos." });
    return;
  }

  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }
  if (booking.status !== "payment_pending") {
    res.status(400).json({ error: "El booking no está pendiente de verificación de pago" });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "payment_confirmed", paymentRejectedReason: null })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));

  try {
    await createNotification(booking.clientId, "payment_confirmed", "✅ Pago verificado por LinkServi",
      `Tu pago para ${enriched.categoryName} fue verificado. El profesional puede iniciar el servicio ahora.`, bookingId, "client");
    if (worker) {
      await createNotification(worker.userId, "payment_confirmed", "💰 Pago confirmado — ¡Puedes iniciar!",
        `LinkServi confirmó el pago de ${enriched.categoryName}. Ya puedes iniciar el trabajo.`, bookingId, "worker");
    }
  } catch (e) {}

  res.json(enriched);
});

// ── Admin rejects payment → back to accepted ──────────────────────────────────
router.post("/bookings/:bookingId/reject-payment", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Solo los administradores pueden rechazar pagos." });
    return;
  }

  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }
  if (booking.status !== "payment_pending") {
    res.status(400).json({ error: "El booking no está pendiente de verificación de pago" });
    return;
  }

  const { reason } = req.body;
  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "accepted", paymentProofUrl: null, paymentRejectedReason: reason ?? "Comprobante inválido o no verificable." })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);
  try {
    await createNotification(booking.clientId, "payment_rejected", "❌ Comprobante rechazado",
      `Tu comprobante para ${enriched.categoryName} no fue validado. Razón: ${reason ?? "Inválido"}. Por favor sube uno nuevo.`, bookingId, "client");
  } catch (e) {}

  res.json(enriched);
});

// ── Reject (worker) → cancelled ───────────────────────────────────────────────
router.post("/bookings/:bookingId/reject", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: only the assigned worker (or admin) can reject
  if (req.user!.role !== "admin") {
    const ok = await assertWorkerOwnsBooking(booking, req.user!.id, res);
    if (!ok) return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "cancelled" })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);
  try {
    await createNotification(booking.clientId, "booking_cancelled", "❌ Solicitud no disponible",
      `${enriched.workerName} no puede atender tu solicitud de ${enriched.categoryName} en este momento.`, bookingId, "client");
  } catch (e) {}

  res.json(enriched);
});

// ── Start work (worker) → in_progress  ───────────────────────────────────────
router.post("/bookings/:bookingId/start", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: only the assigned worker (or admin) can start
  if (req.user!.role !== "admin") {
    const ok = await assertWorkerOwnsBooking(booking, req.user!.id, res);
    if (!ok) return;
  }

  if (booking.status !== "payment_confirmed") {
    res.status(400).json({ error: "El pago debe estar confirmado por LinkServi antes de iniciar el trabajo." });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "in_progress", startedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);
  try {
    await createNotification(booking.clientId, "booking_started", "🔧 Trabajo en progreso",
      `${enriched.workerName} ha iniciado el trabajo de ${enriched.categoryName}. ¡Todo bajo control!`, bookingId, "client");
  } catch (e) {}

  res.json(enriched);
});

// ── Worker finishes → finished ────────────────────────────────────────────────
router.post("/bookings/:bookingId/finish", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: only the assigned worker (or admin) can finish
  if (req.user!.role !== "admin") {
    const ok = await assertWorkerOwnsBooking(booking, req.user!.id, res);
    if (!ok) return;
  }

  if (booking.status !== "in_progress") {
    res.status(400).json({ error: "El trabajo debe estar en progreso para poder marcarlo como finalizado." });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "finished", finishedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);
  try {
    await createNotification(booking.clientId, "booking_finished", "🏁 Trabajo finalizado — confirma la calidad",
      `${enriched.workerName} completó el trabajo de ${enriched.categoryName}. Confirma que quedaste satisfecho con el servicio.`, bookingId, "client");
  } catch (e) {}

  res.json(enriched);
});

// ── Client confirms work → completed (payment released to worker) ─────────────
router.post("/bookings/:bookingId/complete", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: only the booking client (or admin) can confirm completion
  if (req.user!.role !== "admin") {
    const ok = await assertClientOwnsBooking(booking, req.user!.id, res);
    if (!ok) return;
  }

  // ── Idempotency: already in final state → return data without side effects ───
  // Handles duplicate clicks / network retries gracefully.
  if (booking.status === "completed") {
    logger.info({ op: "complete-booking", bookingId }, "Idempotent return: already completed");
    const enriched = await enrichBooking(booking as any);
    res.json(enriched); return;
  }

  // ── State machine: only "finished" → "completed" is a valid transition ────────
  if (booking.status !== "finished") {
    res.status(400).json({ error: "El trabajo debe estar finalizado para poder confirmarlo." });
    return;
  }

  const amount = booking.totalAmount ?? 0;
  const COMMISSION_RATE = 0.10;
  const commission = amount * COMMISSION_RATE;
  const workerEarnings = amount - commission;

  const extra: Record<string, unknown> = {
    status: "completed",
    completedAt: new Date(),
    commission,
    workerEarnings,
  };
  if (req.body?.paymentMethod) extra.paymentMethod = req.body.paymentMethod;
  if (req.body?.paymentNote) extra.paymentNote = req.body.paymentNote;

  logger.info({ op: "complete-booking", bookingId }, "Starting transaction");

  try {
    // ── Atomic transaction: mark booking completed + credit worker earnings ──────
    // If either write fails, both are rolled back — no booking marked complete
    // without the worker receiving their earnings, and no earnings credited
    // without the booking being recorded as complete.
    //
    // Concurrent protection: the WHERE clause includes `status = 'finished'` so
    // if a concurrent request already completed this booking, the UPDATE matches
    // 0 rows and we detect + handle it before crediting earnings a second time.
    const [updated, worker] = await db.transaction(async (tx) => {
      const [completedBooking] = await tx
        .update(bookingsTable)
        .set(extra)
        .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "finished")))
        .returning();

      if (!completedBooking) {
        // Concurrent request already completed → signal idempotent return
        throw Object.assign(new Error("Concurrent completion detected"), { code: "ALREADY_COMPLETED" });
      }

      const [workerRow] = await tx.select().from(workersTable).where(eq(workersTable.id, booking.workerId));

      if (workerRow && amount > 0) {
        // Atomic SQL increment — avoids race condition when two bookings complete simultaneously
        await tx.update(workersTable).set({
          completedJobs: sql`${workersTable.completedJobs} + 1`,
          earnings: sql`${workersTable.earnings} + ${workerEarnings}`,
        }).where(eq(workersTable.id, workerRow.id));
      }

      return [completedBooking, workerRow ?? null] as const;
    });

    logger.info({ op: "complete-booking", bookingId }, "Transaction success");

    const enriched = await enrichBooking(updated);
    try {
      await createNotification(booking.clientId, "booking_completed", "🎉 Pago confirmado — ¡Gracias!",
        `Tu pago por ${enriched.categoryName} fue registrado. ¡Califica a ${enriched.workerName}!`, bookingId, "client");
      if (worker) {
        await createNotification(worker.userId, "payment_received", "💰 Pago liberado a tu wallet",
          `El cliente confirmó el pago por ${enriched.categoryName}. Los fondos ya están en tu billetera.`, bookingId, "worker");
      }
    } catch (e) {}

    res.json(enriched);
  } catch (err: any) {
    if (err?.code === "ALREADY_COMPLETED") {
      logger.info({ op: "complete-booking", bookingId }, "Idempotent return: concurrent completion detected inside transaction");
      const enriched = await enrichBooking(booking as any);
      res.json(enriched); return;
    }
    logger.error({ op: "complete-booking", bookingId, err }, "Transaction failed");
    res.status(500).json({ error: "Error al completar la reserva" });
  }
});

// ── Client opens dispute ──────────────────────────────────────────────────────
router.post("/bookings/:bookingId/dispute", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  if (!Number.isFinite(bookingId) || bookingId <= 0) { res.status(400).json({ error: "ID de reserva inválido" }); return; }
  const parsed = disputeSchema.safeParse(req.body ?? {});
  if (!parsed.success) { badRequest(res, parsed.error); return; }
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: only the booking client (or admin) can open a dispute
  if (req.user!.role !== "admin") {
    const ok = await assertClientOwnsBooking(booking, req.user!.id, res);
    if (!ok) return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "disputed", disputeReason: parsed.data.reason ?? "Disputa abierta por el cliente" })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const enriched = await enrichBooking(updated);
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));
    if (worker) {
      await createNotification(worker.userId, "booking_disputed", "⚠️ Disputa abierta por el cliente",
        `El cliente abrió una disputa para ${enriched.categoryName}. El equipo LinkServi revisará el caso.`, bookingId, "worker");
    }
    await createNotification(booking.clientId, "booking_disputed", "⚠️ Disputa registrada",
      `Tu disputa fue registrada. El equipo de LinkServi la revisará en menos de 24 horas.`, bookingId, "client");
  } catch (e) {}

  res.json(enriched);
});

// ── Cancel booking ────────────────────────────────────────────────────────────
router.post("/bookings/:bookingId/cancel", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  // Ownership: client can cancel their own, worker can cancel their own, admin can cancel any
  if (req.user!.role !== "admin") {
    const userId = req.user!.id;
    if (booking.clientId !== userId) {
      const worker = await getWorkerForUser(userId);
      if (!worker || worker.id !== booking.workerId) {
        res.status(403).json({ error: "No tienes permiso para cancelar esta solicitud." });
        return;
      }
    }
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "cancelled" })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichBooking(updated));
});

// ── Counter-offer: worker proposes a different price ─────────────────────────
router.post("/bookings/:bookingId/counter-offer", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const user = req.user!;
  if (user.role !== "worker" && user.secondaryRole !== "worker") { res.status(403).json({ error: "Solo los profesionales pueden proponer precios" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Reserva no encontrada" }); return; }
  if (!await assertWorkerOwnsBooking(booking, user.id, res)) return;
  if (booking.status !== "pending") { res.status(400).json({ error: "Solo puedes proponer precio en solicitudes pendientes" }); return; }

  const parsedCO = counterOfferSchema.safeParse(req.body ?? {});
  if (!parsedCO.success) { res.status(400).json({ error: "Monto inválido" }); return; }
  const { amount } = parsedCO.data;

  const [updated] = await db
    .update(bookingsTable)
    .set({ workerCounterOffer: Number(amount), counterOfferStatus: "pending" })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  await createNotification(
    booking.clientId,
    "counter_offer",
    "💬 El profesional propone un precio",
    `Para tu solicitud, el profesional propone $${Number(amount).toFixed(2)} como precio final. Puedes aceptar o rechazar.`,
    bookingId,
    "client",
  );

  res.json(await enrichBooking(updated));
});

// ── Counter-offer: client responds (accept / reject) ─────────────────────────
router.post("/bookings/:bookingId/counter-offer/respond", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const user = req.user!;
  if (user.role !== "client") { res.status(403).json({ error: "Solo los clientes pueden responder a propuestas" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Reserva no encontrada" }); return; }
  if (!await assertClientOwnsBooking(booking, user.id, res)) return;
  if (booking.counterOfferStatus !== "pending") { res.status(400).json({ error: "No hay una propuesta pendiente" }); return; }

  const parsedResp = counterOfferRespondSchema.safeParse(req.body ?? {});
  if (!parsedResp.success) { badRequest(res, parsedResp.error); return; }
  const { accept } = parsedResp.data;
  const [workerRow] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));

  if (accept) {
    // Accept: move to accepted + lock in the counter-offer amount
    const now = new Date();
    const totalAmount = booking.workerCounterOffer ?? booking.agreedPrice ?? booking.totalAmount ?? 0;
    const commission = Math.round(totalAmount * 0.1 * 100) / 100;
    const workerEarnings = Math.round((totalAmount - commission) * 100) / 100;

    const [updated] = await db
      .update(bookingsTable)
      .set({
        status: "accepted",
        counterOfferStatus: "accepted",
        totalAmount,
        agreedPrice: totalAmount,
        commission,
        workerEarnings,
        acceptedAt: now,
      })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    if (workerRow) {
      await createNotification(
        workerRow.userId,
        "counter_offer_accepted",
        "✅ Propuesta aceptada",
        `El cliente aceptó tu precio de $${totalAmount.toFixed(2)}. ¡Ahora espera el pago para comenzar!`,
        bookingId,
        "worker",
      );
    }
    res.json(await enrichBooking(updated));
  } else {
    // Reject: clear counter offer, booking goes back to normal pending
    const [updated] = await db
      .update(bookingsTable)
      .set({ workerCounterOffer: null, counterOfferStatus: "rejected" })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    if (workerRow) {
      await createNotification(
        workerRow.userId,
        "counter_offer_rejected",
        "❌ Propuesta rechazada",
        `El cliente rechazó tu propuesta de precio. Puedes aceptar al precio original o rechazar la solicitud.`,
        bookingId,
        "worker",
      );
    }
    res.json(await enrichBooking(updated));
  }
});

// ── Auto-cancel expired payment windows (every 60s) ───────────────────────────
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

export async function autoExpireAcceptedBookings() {
  const cutoff = new Date(Date.now() - PAYMENT_WINDOW_MS);

  // Use a DB-level date filter to avoid full table scan
  const { lt } = await import("drizzle-orm");
  const expired = await db
    .select()
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "accepted"),
      lt(bookingsTable.acceptedAt, cutoff)
    ));

  for (const b of expired) {
    try {
      await db
        .update(bookingsTable)
        .set({ status: "cancelled" })
        .where(eq(bookingsTable.id, b.id));

      await createNotification(b.clientId, "payment_expired", "⏰ Tiempo de pago vencido",
        "El tiempo para realizar el pago expiró y tu solicitud fue cancelada automáticamente. Puedes crear una nueva solicitud cuando estés listo.",
        b.id, "client");

      const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, b.workerId));
      if (worker) {
        await createNotification(worker.userId, "payment_expired", "⏰ Solicitud cancelada por tiempo",
          "El cliente no realizó el pago a tiempo. La solicitud fue cancelada automáticamente.", b.id, "worker");
      }
    } catch (e) {}
  }
}

// ── Auto-confirm finished bookings (escrow release after 35 min) ──────────────
// Implements the fintech-style "client has 35 min to dispute, otherwise the
// payment is auto-released to the worker" flow. Mirrors the manual confirm
// transition in POST /bookings/:id/complete (commission, worker earnings,
// completedJobs increment) inside an atomic transaction.
export const FINISHED_AUTO_CONFIRM_MS = 35 * 60 * 1000;

export async function autoConfirmFinishedBookings() {
  const cutoff = new Date(Date.now() - FINISHED_AUTO_CONFIRM_MS);
  const { lt } = await import("drizzle-orm");

  const eligible = await db
    .select()
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "finished"),
      lt(bookingsTable.finishedAt, cutoff),
    ));

  for (const b of eligible) {
    try {
      const amount = b.totalAmount ?? 0;
      const COMMISSION_RATE = 0.10;
      const commission = amount * COMMISSION_RATE;
      const workerEarnings = amount - commission;

      const result = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(bookingsTable)
          .set({
            status: "completed",
            completedAt: new Date(),
            commission,
            workerEarnings,
            paymentMethod: b.paymentMethod ?? "auto_confirmed",
          })
          .where(and(eq(bookingsTable.id, b.id), eq(bookingsTable.status, "finished")))
          .returning();

        if (!updated) return null;

        const [workerRow] = await tx.select().from(workersTable).where(eq(workersTable.id, b.workerId));
        if (workerRow && amount > 0) {
          await tx.update(workersTable).set({
            completedJobs: sql`${workersTable.completedJobs} + 1`,
            earnings: sql`${workersTable.earnings} + ${workerEarnings}`,
          }).where(eq(workersTable.id, workerRow.id));
        }
        return { updated, worker: workerRow ?? null };
      });

      if (!result) continue;

      try {
        await createNotification(b.clientId, "booking_auto_confirmed",
          "✅ Servicio confirmado automáticamente",
          "Pasaron 35 minutos sin reportes y el pago se liberó al profesional. Si tienes algún problema, contacta soporte.",
          b.id, "client");
        if (result.worker) {
          await createNotification(result.worker.userId, "payment_auto_released",
            "💰 Pago liberado automáticamente",
            "El cliente no reportó problemas en 35 minutos. Tu pago ya está en tu billetera.",
            b.id, "worker");
        }
      } catch (e) {}
    } catch (e) {}
  }
}

// ── GET /bookings/:bookingId/alternatives ─────────────────────────────────────
// Returns top-3 available workers in same category with response-time signals.
// Sorted: respondiendo ahora → avgResponseMinutes ASC → rating DESC.
router.get("/bookings/:bookingId/alternatives", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db
    .select({ workerId: bookingsTable.workerId, categoryId: bookingsTable.categoryId, clientId: bookingsTable.clientId })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));

  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.clientId !== req.user!.id && req.user!.role !== "admin") {
    res.status(403).json({ error: "No autorizado" }); return;
  }

  const candidates = await db
    .select({
      id: workersTable.id,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
      rating: workersTable.rating,
      reviewCount: workersTable.reviewCount,
      completedJobs: workersTable.completedJobs,
      isAvailable: workersTable.isAvailable,
      isPremium: workersTable.isPremium,
      categoryId: workersTable.categoryId,
    })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .where(and(
      eq(workersTable.categoryId, booking.categoryId),
      eq(workersTable.isVerified, true),
      ne(workersTable.id, booking.workerId),
    ))
    .orderBy(desc(workersTable.rating))
    .limit(8);

  if (candidates.length === 0) { res.json([]); return; }

  const ids = candidates.map(c => c.id);
  const since30m = subMinutes(new Date(), 30);

  // Parallel signal queries
  const [responseRows, recentContactRows] = await Promise.all([
    // Avg response time: median of (accepted_at - created_at) for each worker
    db.execute(sql`
      SELECT worker_id, ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60))::int AS avg_minutes
      FROM bookings
      WHERE worker_id = ANY(${sql.raw(`ARRAY[${ids.join(",")}]`)})
        AND status IN ('accepted','completed')
        AND updated_at IS NOT NULL AND created_at IS NOT NULL
      GROUP BY worker_id
    `),
    // Recent contact: any contact_click event in last 30 min per worker
    db.select({
        workerId: sql<number>`(${eventsTable.payload}->>'workerId')::int`,
      })
      .from(eventsTable)
      .where(sql`${eventsTable.event} = 'contact_click' AND ${eventsTable.createdAt} >= ${since30m.toISOString()}`),
  ]);

  const responseTimeMap = new Map<number, number>();
  for (const row of (responseRows as any).rows ?? responseRows) {
    responseTimeMap.set(Number(row.worker_id), Number(row.avg_minutes));
  }

  const recentContactSet = new Set<number>(
    (recentContactRows as any[]).map(r => Number(r.workerId)).filter(Boolean)
  );

  const enriched = candidates.map(c => ({
    ...c,
    avgResponseMinutes: responseTimeMap.get(c.id) ?? null,
    hasRecentContact: recentContactSet.has(c.id),
  }));

  // Sort: respondiendo ahora → faster response → higher rating
  enriched.sort((a, b) => {
    if (a.hasRecentContact !== b.hasRecentContact) return a.hasRecentContact ? -1 : 1;
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
    const aMin = a.avgResponseMinutes ?? 9999;
    const bMin = b.avgResponseMinutes ?? 9999;
    if (aMin !== bMin) return aMin - bMin;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  res.json(enriched.slice(0, 3));
});

export default router;
