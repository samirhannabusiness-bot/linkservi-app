import { Router } from "express";
import { db, reviewsTable, workersTable, usersTable, bookingsTable, categoriesTable } from "@workspace/db";
import { eq, avg, count, sql, and } from "drizzle-orm";
import { authenticate } from "../../lib/auth";

const router = Router();

// POST /api/reviews — anti-fraud validated
router.post("/reviews", authenticate, async (req, res): Promise<void> => {
  const { bookingId, workerId, rating, comment } = req.body;

  if (!bookingId || !workerId || !rating) {
    res.status(400).json({ error: "Faltan campos requeridos" });
    return;
  }
  if (rating < 1 || rating > 5) {
    res.status(400).json({ error: "La calificación debe ser entre 1 y 5" });
    return;
  }

  // Verify booking exists, is completed, and belongs to this client
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));

  if (!booking) {
    res.status(404).json({ error: "Reserva no encontrada" });
    return;
  }
  if (booking.clientId !== req.user!.id) {
    res.status(403).json({ error: "No tienes permiso para calificar esta reserva" });
    return;
  }
  if (booking.status !== "completed") {
    res.status(400).json({ error: "Solo puedes calificar servicios completados" });
    return;
  }
  if (booking.workerId !== workerId) {
    res.status(400).json({ error: "El profesional no coincide con la reserva" });
    return;
  }

  // Check for duplicate review
  const [existing] = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.bookingId, bookingId));

  if (existing) {
    res.status(409).json({ error: "Ya calificaste este servicio" });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({ bookingId, workerId, clientId: req.user!.id, rating, comment: comment?.trim() || null })
    .returning();

  // Recalculate worker stats
  const stats = await db
    .select({ avg: avg(reviewsTable.rating), count: count() })
    .from(reviewsTable)
    .where(eq(reviewsTable.workerId, workerId));

  await db
    .update(workersTable)
    .set({
      rating: Math.round((Number(stats[0]?.avg ?? 0) * 10)) / 10,
      reviewCount: stats[0]?.count ?? 0,
    })
    .where(eq(workersTable.id, workerId));

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));

  res.status(201).json({
    id: review.id,
    bookingId: review.bookingId,
    workerId: review.workerId,
    clientId: review.clientId,
    clientName: client?.name ?? "Usuario",
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  });
});

// GET /api/reviews/worker/:workerId — with distribution stats, newest first
router.get("/reviews/worker/:workerId", async (req, res): Promise<void> => {
  const workerId = parseInt(req.params.workerId as string, 10);
  if (isNaN(workerId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const rows = await db
    .select({
      review: reviewsTable,
      client: usersTable,
      category: categoriesTable,
    })
    .from(reviewsTable)
    .innerJoin(usersTable, eq(reviewsTable.clientId, usersTable.id))
    .leftJoin(bookingsTable, eq(reviewsTable.bookingId, bookingsTable.id))
    .leftJoin(categoriesTable, eq(bookingsTable.categoryId, categoriesTable.id))
    .where(eq(reviewsTable.workerId, workerId))
    .orderBy(sql`${reviewsTable.createdAt} DESC`);

  // Rating distribution
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach((r) => {
    const star = r.review.rating as 1 | 2 | 3 | 4 | 5;
    if (star >= 1 && star <= 5) distribution[star]++;
  });

  const reviews = rows.map((r) => ({
    id: r.review.id,
    bookingId: r.review.bookingId,
    workerId: r.review.workerId,
    clientId: r.review.clientId,
    clientName: r.client.name,
    clientAvatarUrl: r.client.avatarUrl ?? null,
    rating: r.review.rating,
    comment: r.review.comment,
    serviceName: r.category?.name ?? null,
    createdAt: r.review.createdAt,
    verified: true, // every review in DB passed the anti-fraud check
  }));

  res.json({ reviews, distribution, total: reviews.length });
});

// GET /api/reviews/booking/:bookingId — check if review exists for a booking
router.get("/reviews/booking/:bookingId", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId as string, 10);
  const [review] = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.bookingId, bookingId));

  res.json({ hasReview: !!review, reviewId: review?.id ?? null });
});

export default router;
