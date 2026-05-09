import { Router } from "express";
import { db, servicePhotosTable, bookingsTable, workersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../../lib/auth";

const router = Router();

const VALID_TYPES = ["before", "after"];

// POST /api/service-photos — worker uploads before/after photo
router.post("/service-photos", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "worker" && user.secondaryRole !== "worker") {
    res.status(403).json({ error: "Solo los profesionales pueden subir fotos de servicio" });
    return;
  }

  const { bookingId, photoType, imageUrl } = req.body;
  if (!bookingId || !photoType || !imageUrl) {
    res.status(400).json({ error: "Faltan campos: bookingId, photoType, imageUrl" });
    return;
  }
  if (!VALID_TYPES.includes(photoType)) {
    res.status(400).json({ error: "photoType debe ser 'before' o 'after'" });
    return;
  }

  const [workerRow] = await db
    .select({ id: workersTable.id })
    .from(workersTable)
    .where(eq(workersTable.userId, user.id));

  if (!workerRow) { res.status(403).json({ error: "Perfil de profesional no encontrado" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Reserva no encontrada" }); return; }
  if (booking.workerId !== workerRow.id) { res.status(403).json({ error: "No perteneces a esta reserva" }); return; }

  // Validate status: before photos only before in_progress, after photos only when finished/completed
  if (photoType === "before" && !["pending", "accepted", "payment_pending", "payment_confirmed"].includes(booking.status)) {
    res.status(400).json({ error: "Las fotos 'antes' se suben antes de iniciar el servicio" });
    return;
  }
  if (photoType === "after" && !["in_progress", "finished", "completed"].includes(booking.status)) {
    res.status(400).json({ error: "Las fotos 'después' se suben durante o después del servicio" });
    return;
  }

  const [photo] = await db
    .insert(servicePhotosTable)
    .values({ bookingId, workerId: workerRow.id, uploadedByUserId: user.id, photoType, imageUrl })
    .returning();

  res.status(201).json(photo);
});

// GET /api/service-photos/booking/:bookingId — list photos for a booking
router.get("/service-photos/booking/:bookingId", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  if (isNaN(bookingId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const user = req.user!;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Reserva no encontrada" }); return; }

  // Only booking participants can see photos
  if (user.role !== "admin") {
    const [workerRow] = await db
      .select({ id: workersTable.id })
      .from(workersTable)
      .where(eq(workersTable.userId, user.id));

    const isClient = booking.clientId === user.id;
    const isWorker = workerRow && booking.workerId === workerRow.id;
    if (!isClient && !isWorker) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
  }

  const photos = await db
    .select()
    .from(servicePhotosTable)
    .where(eq(servicePhotosTable.bookingId, bookingId))
    .orderBy(servicePhotosTable.createdAt);

  res.json(photos);
});

export default router;
