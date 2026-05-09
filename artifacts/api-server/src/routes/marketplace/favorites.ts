import { Router } from "express";
import { db, clientFavoritesTable, workersTable, usersTable, categoriesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate } from "../../lib/auth";

const router = Router();

// POST /api/favorites/:workerId — toggle favorite
router.post("/favorites/:workerId", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "client") {
    res.status(403).json({ error: "Solo los clientes pueden guardar favoritos" });
    return;
  }
  const workerId = parseInt(req.params.workerId as string, 10);
  if (isNaN(workerId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db
    .select({ id: clientFavoritesTable.id })
    .from(clientFavoritesTable)
    .where(and(eq(clientFavoritesTable.clientId, user.id), eq(clientFavoritesTable.workerId, workerId)));

  if (existing) {
    await db.delete(clientFavoritesTable).where(eq(clientFavoritesTable.id, existing.id));
    res.json({ favorited: false });
  } else {
    await db.insert(clientFavoritesTable).values({ clientId: user.id, workerId });
    res.json({ favorited: true });
  }
});

// GET /api/favorites — list client favorites with full worker data
router.get("/favorites", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "client") { res.json([]); return; }

  const rows = await db
    .select({
      fav: clientFavoritesTable,
      worker: workersTable,
      user: usersTable,
      category: categoriesTable,
    })
    .from(clientFavoritesTable)
    .innerJoin(workersTable, eq(clientFavoritesTable.workerId, workersTable.id))
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .leftJoin(categoriesTable, eq(workersTable.categoryId, categoriesTable.id))
    .where(eq(clientFavoritesTable.clientId, user.id))
    .orderBy(sql`${clientFavoritesTable.createdAt} DESC`);

  res.json(rows.map((r) => ({
    id: r.worker.id,
    userId: r.worker.userId,
    name: r.user.name,
    avatarUrl: r.user.avatarUrl,
    categoryName: r.category?.name ?? null,
    rating: r.worker.rating,
    reviewCount: r.worker.reviewCount,
    completedJobs: r.worker.completedJobs,
    isAvailable: r.worker.isAvailable,
    isVerified: r.worker.isVerified,
    isPremium: r.worker.isPremium,
    servicePrice: r.worker.servicePrice,
    state: r.worker.state,
    city: r.worker.city,
    favoritedAt: r.fav.createdAt,
  })));
});

// GET /api/favorites/:workerId/status — check if worker is favorited
router.get("/favorites/:workerId/status", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "client") { res.json({ favorited: false }); return; }
  const workerId = parseInt(req.params.workerId as string, 10);
  const [existing] = await db
    .select({ id: clientFavoritesTable.id })
    .from(clientFavoritesTable)
    .where(and(eq(clientFavoritesTable.clientId, user.id), eq(clientFavoritesTable.workerId, workerId)));
  res.json({ favorited: !!existing });
});

export default router;
