import { Router } from "express";
import { db, urgentRequestsTable, workersTable, usersTable, categoriesTable, bookingsTable } from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { authenticate } from "../../lib/auth";
import { createNotification } from "../notifications";

const router = Router();

// Auto-expire requests older than 2 hours
async function expireOldRequests() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await db
    .update(urgentRequestsTable)
    .set({ status: "expired" })
    .where(and(eq(urgentRequestsTable.status, "open"), lt(urgentRequestsTable.expiresAt, new Date())));
}

// ── Client: create urgent request ─────────────────────────────────────────────
router.post("/urgent", authenticate, async (req, res): Promise<void> => {
  try {
    const { description, address, categoryId, lat, lng } = req.body;
    if (!description?.trim() || !address?.trim()) {
      res.status(400).json({ error: "Descripción y dirección son requeridas" }); return;
    }

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    const [request] = await db
      .insert(urgentRequestsTable)
      .values({
        clientId: req.user!.id,
        categoryId: categoryId ? Number(categoryId) : null,
        description: description.trim(),
        address: address.trim(),
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null,
        status: "open",
        expiresAt,
      })
      .returning();

    // Notify all available workers
    const workers = await db
      .select({ userId: workersTable.userId })
      .from(workersTable)
      .where(eq(workersTable.isAvailable, true));

    const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    const clientName = client?.name ?? "Un cliente";

    for (const w of workers) {
      await createNotification(
        w.userId,
        "urgent_request",
        "🚨 Solicitud urgente cercana",
        `${clientName} necesita ayuda urgente: "${description.trim().slice(0, 60)}"`,
        undefined,
        "worker",
        "/professional/urgencias"
      );
    }

    res.status(201).json(request);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al crear solicitud urgente" });
  }
});

// ── Worker: see open urgent requests ─────────────────────────────────────────
router.get("/urgent/open", authenticate, async (req, res): Promise<void> => {
  try {
    await expireOldRequests();
    const rows = await db
      .select({
        request: urgentRequestsTable,
        clientName: usersTable.name,
        clientAvatar: usersTable.avatarUrl,
        categoryName: categoriesTable.name,
        categoryIcon: categoriesTable.icon,
      })
      .from(urgentRequestsTable)
      .leftJoin(usersTable, eq(urgentRequestsTable.clientId, usersTable.id))
      .leftJoin(categoriesTable, eq(urgentRequestsTable.categoryId, categoriesTable.id))
      .where(eq(urgentRequestsTable.status, "open"))
      .orderBy(desc(urgentRequestsTable.createdAt))
      .limit(30);

    res.json(rows.map(r => ({
      ...r.request,
      clientName: r.clientName,
      clientAvatar: r.clientAvatar,
      categoryName: r.categoryName,
      categoryIcon: r.categoryIcon,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener solicitudes" });
  }
});

// ── Worker: claim a request ───────────────────────────────────────────────────
router.post("/urgent/:id/claim", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);

    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
    if (!worker) { res.status(404).json({ error: "Perfil de profesional no encontrado" }); return; }

    const [existing] = await db.select().from(urgentRequestsTable).where(eq(urgentRequestsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (existing.status !== "open") { res.status(409).json({ error: "Esta solicitud ya fue tomada" }); return; }

    // Create a booking (inquiry type) so both parties have a chat room
    const categoryId = existing.categoryId ?? worker.categoryId ?? 1;
    const [booking] = await db
      .insert(bookingsTable)
      .values({
        clientId: existing.clientId,
        workerId: worker.id,
        categoryId,
        description: `🚨 Urgencia: ${existing.description}`,
        address: existing.address,
        lat: existing.lat ?? null,
        lng: existing.lng ?? null,
        bookingType: "inquiry",
        status: "accepted",
        acceptedAt: new Date(),
      })
      .returning();

    // Mark the urgent request as claimed and link the booking
    const [updated] = await db
      .update(urgentRequestsTable)
      .set({ status: "claimed", workerId: worker.id, claimedAt: new Date(), bookingId: booking.id })
      .where(and(eq(urgentRequestsTable.id, id), eq(urgentRequestsTable.status, "open")))
      .returning();

    if (!updated) {
      // Rollback the booking if race condition
      await db.delete(bookingsTable).where(eq(bookingsTable.id, booking.id));
      res.status(409).json({ error: "Esta solicitud ya fue tomada por otro profesional" }); return;
    }

    // Notify client with direct link to the chat
    const [workerUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    await createNotification(
      existing.clientId,
      "urgent_claimed",
      "✅ ¡Profesional en camino! Abre el chat",
      `${workerUser?.name ?? "Un profesional"} aceptó tu urgencia. Coordinen los detalles y el precio en el chat.`,
      booking.id,
      "client",
      `/client/chat/${booking.id}`
    );

    res.json({ ...updated, bookingId: booking.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al reclamar solicitud" });
  }
});

// ── Client: cancel own request ────────────────────────────────────────────────
router.post("/urgent/:id/cancel", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const [updated] = await db
      .update(urgentRequestsTable)
      .set({ status: "cancelled" })
      .where(and(eq(urgentRequestsTable.id, id), eq(urgentRequestsTable.clientId, req.user!.id), eq(urgentRequestsTable.status, "open")))
      .returning();
    if (!updated) { res.status(404).json({ error: "Solicitud no encontrada o ya procesada" }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al cancelar solicitud" });
  }
});

// ── Client: own requests history ──────────────────────────────────────────────
router.get("/urgent/client", authenticate, async (req, res): Promise<void> => {
  try {
    await expireOldRequests();
    const rows = await db
      .select({
        request: urgentRequestsTable,
        categoryName: categoriesTable.name,
        categoryIcon: categoriesTable.icon,
        workerName: usersTable.name,
        workerAvatar: usersTable.avatarUrl,
      })
      .from(urgentRequestsTable)
      .leftJoin(categoriesTable, eq(urgentRequestsTable.categoryId, categoriesTable.id))
      .leftJoin(workersTable, eq(urgentRequestsTable.workerId, workersTable.id))
      .leftJoin(usersTable, eq(workersTable.userId, usersTable.id))
      .where(eq(urgentRequestsTable.clientId, req.user!.id))
      .orderBy(desc(urgentRequestsTable.createdAt))
      .limit(20);

    res.json(rows.map(r => ({
      ...r.request,
      categoryName: r.categoryName,
      categoryIcon: r.categoryIcon,
      workerName: r.workerName,
      workerAvatar: r.workerAvatar,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener historial" });
  }
});

// ── Worker: claimed requests ──────────────────────────────────────────────────
router.get("/urgent/worker", authenticate, async (req, res): Promise<void> => {
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
    if (!worker) { res.json([]); return; }

    const rows = await db
      .select({
        request: urgentRequestsTable,
        clientName: usersTable.name,
        clientAvatar: usersTable.avatarUrl,
        categoryName: categoriesTable.name,
        categoryIcon: categoriesTable.icon,
      })
      .from(urgentRequestsTable)
      .leftJoin(usersTable, eq(urgentRequestsTable.clientId, usersTable.id))
      .leftJoin(categoriesTable, eq(urgentRequestsTable.categoryId, categoriesTable.id))
      .where(eq(urgentRequestsTable.workerId, worker.id))
      .orderBy(desc(urgentRequestsTable.createdAt))
      .limit(20);

    res.json(rows.map(r => ({
      ...r.request,
      clientName: r.clientName,
      clientAvatar: r.clientAvatar,
      categoryName: r.categoryName,
      categoryIcon: r.categoryIcon,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener solicitudes" });
  }
});

export default router;
