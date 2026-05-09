import { Router } from "express";
import {
  db, bookingsTable, workersTable, usersTable, disputeMessagesTable,
} from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { authenticate, requireRole } from "../lib/auth";
import { createNotification } from "./notifications";

const router = Router();

// ── Dispute Chat ───────────────────────────────────────────────────────────────

router.get("/disputes/:bookingId/messages", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const userId = req.user!.id;
  const role = req.user!.role;

  if (role !== "admin") {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, userId));
    const isClient = booking.clientId === userId;
    const isWorker = worker && booking.workerId === worker.id;
    if (!isClient && !isWorker) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
  }

  const rows = await db
    .select({ msg: disputeMessagesTable, sender: usersTable })
    .from(disputeMessagesTable)
    .innerJoin(usersTable, eq(disputeMessagesTable.senderId, usersTable.id))
    .where(eq(disputeMessagesTable.bookingId, bookingId))
    .orderBy(disputeMessagesTable.createdAt);

  res.json(rows.map(r => ({
    id: r.msg.id,
    bookingId: r.msg.bookingId,
    senderId: r.msg.senderId,
    senderName: r.sender.name,
    senderRole: r.msg.senderRole,
    content: r.msg.content,
    createdAt: r.msg.createdAt,
  })));
});

router.post("/disputes/:bookingId/messages", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const { content } = req.body;

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const userId = req.user!.id;
  const role = req.user!.role;

  let senderRole = role;
  if (role !== "admin") {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, userId));
    const isClient = booking.clientId === userId;
    const isWorker = worker && booking.workerId === worker.id;
    if (!isClient && !isWorker) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    senderRole = isClient ? "client" : "worker";
  }

  const [msg] = await db.insert(disputeMessagesTable).values({
    bookingId,
    senderId: userId,
    senderRole,
    content,
  }).returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  // Notify participants
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));

    if (senderRole === "client") {
      if (worker) {
        await createNotification(
          worker.userId, "dispute_message",
          `💬 Mensaje en disputa de ${sender?.name ?? "Cliente"}`,
          content.length > 80 ? content.slice(0, 77) + "…" : content,
          bookingId, "worker"
        );
      }
    } else if (senderRole === "worker") {
      await createNotification(
        booking.clientId, "dispute_message",
        `💬 Mensaje en disputa de ${sender?.name ?? "Profesional"}`,
        content.length > 80 ? content.slice(0, 77) + "…" : content,
        bookingId, "client"
      );
    } else if (senderRole === "admin") {
      await createNotification(
        booking.clientId, "dispute_message",
        "💬 LinkServi intervino en tu disputa",
        content.length > 80 ? content.slice(0, 77) + "…" : content,
        bookingId, "client"
      );
      if (worker) {
        await createNotification(
          worker.userId, "dispute_message",
          "💬 LinkServi intervino en la disputa",
          content.length > 80 ? content.slice(0, 77) + "…" : content,
          bookingId, "worker"
        );
      }
    }
  } catch (e) {}

  res.status(201).json({
    id: msg.id,
    bookingId: msg.bookingId,
    senderId: msg.senderId,
    senderName: sender?.name ?? "Unknown",
    senderRole: msg.senderRole,
    content: msg.content,
    createdAt: msg.createdAt,
  });
});

// ── Admin: set dispute to in_review ──────────────────────────────────────────

router.post("/admin/bookings/:bookingId/dispute/review", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  if (!["disputed"].includes(booking.status)) {
    res.status(400).json({ error: "La disputa debe estar en estado 'disputed' para iniciar revisión" });
    return;
  }

  const [updated] = await db.update(bookingsTable)
    .set({ status: "dispute_in_review" })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));

  try {
    await createNotification(
      booking.clientId, "dispute_in_review",
      "🔍 Tu disputa está en revisión",
      "El equipo LinkServi está analizando tu caso. Te notificaremos cuando haya una resolución.",
      bookingId, "client"
    );
    if (worker) {
      await createNotification(
        worker.userId, "dispute_in_review",
        "🔍 Disputa en revisión",
        "El equipo LinkServi está revisando la disputa. Por favor espera la resolución.",
        bookingId, "worker"
      );
    }
  } catch (e) {}

  res.json(updated);
});

// ── Admin: resolve dispute ────────────────────────────────────────────────────

router.post("/admin/bookings/:bookingId/dispute/resolve", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const { winner } = req.body as { winner: "client" | "worker" };

  if (!["client", "worker"].includes(winner)) {
    res.status(400).json({ error: "winner debe ser 'client' o 'worker'" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Not found" }); return; }

  if (!["disputed", "dispute_in_review"].includes(booking.status)) {
    res.status(400).json({ error: "Solo se pueden resolver disputas activas" });
    return;
  }

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));

  const newStatus = winner === "client" ? "dispute_resolved_client" : "dispute_resolved_worker";

  let extra: Record<string, unknown> = { status: newStatus };

  if (winner === "worker" && booking.totalAmount) {
    // Release payment to worker
    const COMMISSION_RATE = 0.10;
    const amount = booking.totalAmount;
    const commission = amount * COMMISSION_RATE;
    const workerEarnings = amount - commission;
    extra = { ...extra, commission, workerEarnings, completedAt: new Date() };

    if (worker) {
      await db.update(workersTable).set({
        completedJobs: worker.completedJobs + 1,
        earnings: worker.earnings + workerEarnings,
      }).where(eq(workersTable.id, worker.id));
    }
  }

  const [updated] = await db.update(bookingsTable).set(extra).where(eq(bookingsTable.id, bookingId)).returning();

  try {
    if (winner === "client") {
      await createNotification(
        booking.clientId, "dispute_resolved",
        "✅ Disputa resuelta a tu favor",
        "El equipo LinkServi resolvió la disputa a tu favor. El pago al profesional ha sido cancelado.",
        bookingId, "client"
      );
      if (worker) {
        await createNotification(
          worker.userId, "dispute_resolved",
          "❌ Disputa resuelta en favor del cliente",
          "Tras la revisión, LinkServi resolvió la disputa a favor del cliente. El pago no será liberado.",
          bookingId, "worker"
        );
      }
    } else {
      await createNotification(
        booking.clientId, "dispute_resolved",
        "ℹ️ Disputa resuelta a favor del profesional",
        "El equipo LinkServi revisó el caso y determinó que el trabajo fue realizado correctamente. El pago fue liberado al profesional.",
        bookingId, "client"
      );
      if (worker) {
        await createNotification(
          worker.userId, "dispute_resolved",
          "✅ Disputa resuelta a tu favor — pago liberado",
          "LinkServi revisó la disputa y confirmó que realizaste el trabajo. El pago fue liberado a tu wallet.",
          bookingId, "worker"
        );
      }
    }
  } catch (e) {}

  res.json(updated);
});

// ── Admin: get all disputes ───────────────────────────────────────────────────

router.get("/admin/disputes", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };

  const disputeStatuses = ["disputed", "dispute_in_review", "dispute_resolved_client", "dispute_resolved_worker"];
  const filterStatus = status && disputeStatuses.includes(status) ? status : undefined;

  const bookings = await db.select().from(bookingsTable)
    .where(filterStatus
      ? eq(bookingsTable.status, filterStatus)
      : or(
          eq(bookingsTable.status, "disputed"),
          eq(bookingsTable.status, "dispute_in_review"),
          eq(bookingsTable.status, "dispute_resolved_client"),
          eq(bookingsTable.status, "dispute_resolved_worker"),
        )
    )
    .orderBy(bookingsTable.updatedAt);

  const enriched = await Promise.all(bookings.map(async (b) => {
    const [client] = await db.select().from(usersTable).where(eq(usersTable.id, b.clientId));
    const [workerRow] = await db
      .select({ worker: workersTable, user: usersTable })
      .from(workersTable)
      .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
      .where(eq(workersTable.id, b.workerId));
    const msgCount = await db.select().from(disputeMessagesTable).where(eq(disputeMessagesTable.bookingId, b.id));

    return {
      id: b.id,
      clientId: b.clientId,
      workerId: b.workerId,
      clientName: client?.name ?? "Unknown",
      clientEmail: client?.email ?? "",
      workerName: workerRow?.user.name ?? "Unknown",
      workerEmail: workerRow?.user.email ?? "",
      status: b.status,
      disputeReason: b.disputeReason,
      totalAmount: b.totalAmount,
      commission: b.commission,
      workerEarnings: b.workerEarnings,
      paymentProofUrl: b.paymentProofUrl,
      description: b.description,
      address: b.address,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      messageCount: msgCount.length,
    };
  }));

  res.json(enriched);
});

export default router;
