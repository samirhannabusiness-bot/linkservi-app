import { Router } from "express";
import {
  db,
  clientRatingsTable,
  bookingsTable,
  workersTable,
  usersTable,
  CLIENT_RATING_TAGS,
} from "@workspace/db";
import { eq, and, count, avg, sql } from "drizzle-orm";
import { authenticate } from "../../lib/auth";

const router = Router();

const VALID_TAG_KEYS = CLIENT_RATING_TAGS.map((t) => t.key);

// POST /api/client-ratings — worker rates client after service completion
router.post("/client-ratings", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;

  if (user.role !== "worker" && user.secondaryRole !== "worker") {
    res.status(403).json({ error: "Solo los profesionales pueden calificar clientes" });
    return;
  }

  const { bookingId, rating, tags } = req.body;

  if (!bookingId || !rating) {
    res.status(400).json({ error: "Faltan campos requeridos" });
    return;
  }
  if (rating < 1 || rating > 5) {
    res.status(400).json({ error: "La calificación debe ser entre 1 y 5" });
    return;
  }

  const cleanTags: string[] = Array.isArray(tags)
    ? tags.filter((t: string) => VALID_TAG_KEYS.includes(t as typeof VALID_TAG_KEYS[number]))
    : [];

  // Get the worker record for this user
  const [workerRow] = await db
    .select({ id: workersTable.id })
    .from(workersTable)
    .where(eq(workersTable.userId, user.id));

  if (!workerRow) {
    res.status(403).json({ error: "Perfil de profesional no encontrado" });
    return;
  }

  // Verify the booking exists, is completed, and belongs to this worker
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));

  if (!booking) {
    res.status(404).json({ error: "Reserva no encontrada" });
    return;
  }
  if (booking.workerId !== workerRow.id) {
    res.status(403).json({ error: "No realizaste este servicio" });
    return;
  }
  if (booking.status !== "completed") {
    res.status(400).json({ error: "Solo puedes calificar servicios completados" });
    return;
  }

  // Check for duplicate
  const [existing] = await db
    .select({ id: clientRatingsTable.id })
    .from(clientRatingsTable)
    .where(
      and(
        eq(clientRatingsTable.bookingId, bookingId),
        eq(clientRatingsTable.workerId, workerRow.id),
      ),
    );

  if (existing) {
    res.status(409).json({ error: "Ya calificaste a este cliente por este servicio" });
    return;
  }

  const [created] = await db
    .insert(clientRatingsTable)
    .values({
      bookingId,
      workerId: workerRow.id,
      clientId: booking.clientId,
      rating,
      tags: cleanTags,
    })
    .returning();

  res.status(201).json({ id: created.id });
});

// GET /api/client-ratings/client/:clientId — public client reputation stats
router.get("/client-ratings/client/:clientId", authenticate, async (req, res): Promise<void> => {
  const clientId = parseInt(req.params.clientId as string, 10);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  // Aggregate rating stats
  const [stats] = await db
    .select({
      avgRating: avg(clientRatingsTable.rating),
      totalRatings: count(),
    })
    .from(clientRatingsTable)
    .where(eq(clientRatingsTable.clientId, clientId));

  // All ratings for tag counting
  const allRatings = await db
    .select({ tags: clientRatingsTable.tags })
    .from(clientRatingsTable)
    .where(eq(clientRatingsTable.clientId, clientId));

  const tagCounts: Record<string, number> = {};
  for (const row of allRatings) {
    for (const tag of row.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  // Count completed services as client
  const [completedRow] = await db
    .select({ cnt: count() })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.clientId, clientId),
        eq(bookingsTable.status, "completed"),
      ),
    );

  // Count total bookings as client (for payment rate calculation)
  const [totalRow] = await db
    .select({ cnt: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.clientId, clientId));

  // Paid bookings (payment_confirmed, in_progress, finished, completed) 
  const [paidRow] = await db
    .select({ cnt: count() })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.clientId, clientId),
        sql`${bookingsTable.status} IN ('payment_confirmed','in_progress','finished','completed')`,
      ),
    );

  const completedCount = completedRow?.cnt ?? 0;
  const totalCount = totalRow?.cnt ?? 0;
  const paidCount = paidRow?.cnt ?? 0;
  const paymentRate = totalCount > 0 ? Math.round((Number(paidCount) / Number(totalCount)) * 100) : null;

  res.json({
    avgRating: stats?.avgRating ? Math.round(Number(stats.avgRating) * 10) / 10 : null,
    totalRatings: Number(stats?.totalRatings ?? 0),
    tagCounts,
    completedServices: Number(completedCount),
    paymentRate,
  });
});

// GET /api/client-ratings/booking/:bookingId/rated — check if worker already rated client
router.get("/client-ratings/booking/:bookingId/rated", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const bookingId = parseInt(req.params.bookingId as string, 10);

  if (user.role !== "worker" && user.secondaryRole !== "worker") {
    res.json({ rated: false });
    return;
  }

  const [workerRow] = await db
    .select({ id: workersTable.id })
    .from(workersTable)
    .where(eq(workersTable.userId, user.id));

  if (!workerRow) {
    res.json({ rated: false });
    return;
  }

  const [existing] = await db
    .select({ id: clientRatingsTable.id })
    .from(clientRatingsTable)
    .where(
      and(
        eq(clientRatingsTable.bookingId, bookingId),
        eq(clientRatingsTable.workerId, workerRow.id),
      ),
    );

  res.json({ rated: !!existing });
});

export default router;
