import { Router } from "express";
import { db, chatMessagesTable, chatOffersTable, usersTable, bookingsTable, workersTable, systemAlertsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate, requireVerifiedEmail } from "../../lib/auth";
import { sendPushToUser } from "../push";
import { emitToRoom } from "../../lib/socket";
import { createNotification } from "../notifications";
import { filterMessage } from "../../lib/messageFilter";

const router = Router();

// Authz: el usuario actual debe ser cliente del booking o el worker dueño del
// booking. Devuelve null si el booking no existe (404) y false si el usuario
// no es participante (403). Antes faltaba este chequeo y permitía un IDOR
// donde cualquier autenticado podía leer/escribir el chat de cualquier booking.
async function getBookingParticipation(bookingId: number, userId: number) {
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) return { booking: null, isParticipant: false } as const;
  if (booking.clientId === userId) return { booking, isParticipant: true } as const;
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));
  return { booking, isParticipant: !!worker && worker.userId === userId } as const;
}

// ── Get messages for a booking ────────────────────────────────────────────────
router.get("/chat/:bookingId", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId;
  const bookingId = parseInt(raw, 10);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "bookingId inválido" }); return;
  }

  const { booking, isParticipant } = await getBookingParticipation(bookingId, req.user!.id);
  if (!booking) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (!isParticipant) { res.status(403).json({ error: "No tienes acceso a este chat" }); return; }

  const messages = await db
    .select({ message: chatMessagesTable, sender: usersTable })
    .from(chatMessagesTable)
    .innerJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
    .where(eq(chatMessagesTable.bookingId, bookingId))
    .orderBy(chatMessagesTable.createdAt);

  res.json(
    messages.map((m) => ({
      id: m.message.id,
      bookingId: m.message.bookingId,
      senderId: m.message.senderId,
      senderName: m.sender.name,
      content: m.message.content,
      createdAt: m.message.createdAt,
      type: "message",
    }))
  );
});

// ── Send message ──────────────────────────────────────────────────────────────
// requireVerifiedEmail: evita que cuentas recién creadas (sin verificar) usen
// el chat para spam/phishing. La lectura sigue abierta (algunos clientes ven
// historial antes de poder responder), pero enviar requiere email validado.
router.post("/chat/:bookingId", authenticate, requireVerifiedEmail, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId;
  const bookingId = parseInt(raw, 10);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    res.status(400).json({ error: "bookingId inválido" }); return;
  }
  const { content } = req.body;
  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  // Authz contra IDOR — solo cliente o worker del booking pueden enviar.
  const { booking, isParticipant } = await getBookingParticipation(bookingId, req.user!.id);
  if (!booking) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (!isParticipant) { res.status(403).json({ error: "No tienes acceso a este chat" }); return; }

  // ── Anti-bypass content filter ────────────────────────────────────────────
  // Replaces phone numbers, emails, social handles and "contáctame por
  // WhatsApp" evasions with [contacto bloqueado]. Redacts (no longer blocks)
  // so the conversation flows naturally and the worker/client can't argue
  // they "tried to send" a message that never arrived. When filtered, we
  // also log to system_alerts for the admin's anti-bypass audit panel.
  const rawContent = content;
  const { content: filtered, wasFiltered } = filterMessage(rawContent);
  if (wasFiltered) {
    try {
      await db.insert(systemAlertsTable).values({
        type: "CHAT_BYPASS_ATTEMPT",
        payload: {
          channel: "booking_chat",
          bookingId,
          senderId: req.user!.id,
          rawContent,
          filteredContent: filtered,
        },
      });
    } catch { /* logging failure is non-critical */ }
  }

  const [message] = await db
    .insert(chatMessagesTable)
    .values({ bookingId, senderId: req.user!.id, content: filtered })
    .returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));

  emitToRoom(`booking:${bookingId}`, "new_message", {
    id: message.id,
    bookingId: message.bookingId,
    senderId: message.senderId,
    senderName: sender?.name ?? "",
    content: message.content,
    createdAt: message.createdAt,
    type: "message",
  });

  try {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (booking) {
      const senderId = req.user!.id;
      const isClient = booking.clientId === senderId;

      if (isClient) {
        const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));
        if (worker) {
          await sendPushToUser(worker.userId, {
            title: `💬 Mensaje de ${sender?.name ?? "Cliente"}`,
            body: content.length > 80 ? content.slice(0, 77) + "…" : content,
            tag: `chat-${bookingId}`,
            url: `/professional/chat/${bookingId}`,
          });
        }
      } else {
        await sendPushToUser(booking.clientId, {
          title: `💬 Mensaje de ${sender?.name ?? "Profesional"}`,
          body: content.length > 80 ? content.slice(0, 77) + "…" : content,
          tag: `chat-${bookingId}`,
          url: `/client/chat/${bookingId}`,
        });
      }
    }
  } catch (e) {}

  res.status(201).json({
    id: message.id,
    bookingId: message.bookingId,
    senderId: message.senderId,
    senderName: sender?.name ?? "Unknown",
    content: message.content,
    createdAt: message.createdAt,
    type: "message",
    wasFiltered,
  });
});

// ── Get offers for a booking ──────────────────────────────────────────────────
router.get("/chat/:bookingId/offers", authenticate, async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId;
    const bookingId = parseInt(raw, 10);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: "bookingId inválido" }); return;
    }

    // Authz contra IDOR — coherente con GET/POST /chat/:bookingId.
    // Sin esto, cualquier autenticado podía leer ofertas (precios) de cualquier booking.
    const { booking, isParticipant } = await getBookingParticipation(bookingId, req.user!.id);
    if (!booking) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (!isParticipant) { res.status(403).json({ error: "No tienes acceso a este chat" }); return; }

    const offers = await db
      .select()
      .from(chatOffersTable)
      .where(eq(chatOffersTable.bookingId, bookingId))
      .orderBy(chatOffersTable.createdAt);

    res.json(offers);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener ofertas" });
  }
});

// ── Worker creates offer ──────────────────────────────────────────────────────
router.post("/chat/:bookingId/offers", authenticate, async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId;
    const bookingId = parseInt(raw, 10);

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }

    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));
    if (!worker || worker.userId !== req.user!.id) {
      res.status(403).json({ error: "Solo el profesional puede crear ofertas" }); return;
    }

    const { price, description } = req.body;
    if (typeof price !== "number" || price <= 0) {
      res.status(400).json({ error: "El precio debe ser mayor a 0" }); return;
    }
    if (!description || typeof description !== "string" || description.trim().length === 0) {
      res.status(400).json({ error: "La descripción es requerida" }); return;
    }

    const [offer] = await db
      .insert(chatOffersTable)
      .values({
        bookingId,
        workerId: worker.userId,
        clientId: booking.clientId,
        price,
        description: description.trim(),
        status: "pending",
      })
      .returning();

    // Auto-send a system message in the chat notifying about the offer
    await db.insert(chatMessagesTable).values({
      bookingId,
      senderId: worker.userId,
      content: `💼 Oferta enviada: ${description.trim()} — $${price.toFixed(2)} USD`,
    });

    // Notify client
    try {
      await sendPushToUser(booking.clientId, {
        title: "💼 Nueva oferta recibida",
        body: `$${price.toFixed(2)} USD — ${description.trim()}`,
        tag: `offer-${bookingId}`,
        url: `/client/chat/${bookingId}`,
      });
      await createNotification(
        booking.clientId, "offer_received", "💼 Nueva oferta recibida",
        `El profesional ofrece: ${description.trim()} por $${price.toFixed(2)} USD`,
        bookingId, "client"
      );
    } catch (e) {}

    res.status(201).json(offer);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al crear oferta" });
  }
});

// ── Client accepts offer ──────────────────────────────────────────────────────
router.put("/chat/:bookingId/offers/:offerId/accept", authenticate, async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId;
    const bookingId = parseInt(raw, 10);
    const rawOffer = Array.isArray(req.params.offerId) ? req.params.offerId[0] : req.params.offerId;
    const offerId = parseInt(rawOffer, 10);

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (booking.clientId !== req.user!.id) {
      res.status(403).json({ error: "Solo el cliente puede aceptar ofertas" }); return;
    }

    const [offer] = await db
      .select()
      .from(chatOffersTable)
      .where(and(eq(chatOffersTable.id, offerId), eq(chatOffersTable.bookingId, bookingId)));
    if (!offer) { res.status(404).json({ error: "Oferta no encontrada" }); return; }
    if (offer.status !== "pending") {
      res.status(400).json({ error: "Esta oferta ya fue respondida" }); return;
    }

    // Accept offer
    await db.update(chatOffersTable)
      .set({ status: "accepted" })
      .where(eq(chatOffersTable.id, offerId));

    // Update booking price with the offer.
    // Also promote status from "pending" → "accepted" so the client can proceed
    // to payment immediately (chat offers are often the first/only acceptance step
    // in inquiry-type bookings where the worker negotiates before formally accepting).
    const isPending = booking.status === "pending";
    await db.update(bookingsTable)
      .set({
        agreedPrice: offer.price,
        totalAmount: offer.price,
        clientBudget: offer.price,
        ...(isPending ? { status: "accepted" as const, acceptedAt: new Date() } : {}),
      })
      .where(eq(bookingsTable.id, bookingId));

    // System message in chat
    await db.insert(chatMessagesTable).values({
      bookingId,
      senderId: req.user!.id,
      content: `✅ Oferta aceptada: $${offer.price.toFixed(2)} USD — ${offer.description}`,
    });

    // Notify worker
    try {
      const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, booking.workerId));
      if (worker) {
        await sendPushToUser(worker.userId, {
          title: "✅ El cliente aceptó tu oferta",
          body: `$${offer.price.toFixed(2)} USD — ${offer.description}`,
          tag: `offer-accepted-${bookingId}`,
          url: `/professional/chat/${bookingId}`,
        });
        await createNotification(
          worker.userId, "offer_accepted", "✅ Oferta aceptada",
          `El cliente aceptó tu oferta de $${offer.price.toFixed(2)} USD`,
          bookingId, "worker"
        );
      }
    } catch (e) {}

    res.json({ ok: true, price: offer.price });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al aceptar oferta" });
  }
});

// ── Client rejects offer ──────────────────────────────────────────────────────
router.put("/chat/:bookingId/offers/:offerId/reject", authenticate, async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId;
    const bookingId = parseInt(raw, 10);
    const rawOffer = Array.isArray(req.params.offerId) ? req.params.offerId[0] : req.params.offerId;
    const offerId = parseInt(rawOffer, 10);

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (booking.clientId !== req.user!.id) {
      res.status(403).json({ error: "Solo el cliente puede rechazar ofertas" }); return;
    }

    const [offer] = await db
      .select()
      .from(chatOffersTable)
      .where(and(eq(chatOffersTable.id, offerId), eq(chatOffersTable.bookingId, bookingId)));
    if (!offer) { res.status(404).json({ error: "Oferta no encontrada" }); return; }
    if (offer.status !== "pending") {
      res.status(400).json({ error: "Esta oferta ya fue respondida" }); return;
    }

    await db.update(chatOffersTable)
      .set({ status: "rejected" })
      .where(eq(chatOffersTable.id, offerId));

    // System message in chat
    await db.insert(chatMessagesTable).values({
      bookingId,
      senderId: req.user!.id,
      content: `❌ Oferta rechazada — El cliente puede pedir una nueva propuesta.`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al rechazar oferta" });
  }
});

export default router;
