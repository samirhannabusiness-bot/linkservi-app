import { Router } from "express";
import { db, categoriesTable, workersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  const result = await Promise.all(
    categories.map(async (cat) => {
      const count = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(workersTable)
        .where(eq(workersTable.categoryId, cat.id));
      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        color: cat.color,
        workerCount: count[0]?.count ?? 0,
      };
    })
  );
  res.json(result);
});

export default router;
