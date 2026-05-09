import { Router } from "express";
import { db, blogArticlesTable, type BlogArticle } from "@workspace/db";
import { eq, and, desc, sql, ne } from "drizzle-orm";
import { authenticate, requireRole } from "../lib/auth";
import { slugify } from "../lib/slugify";
import { pingIndexNow } from "../lib/indexnow";

const router = Router();

function estimateReadMinutes(md: string): number {
  const words = md.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

async function uniqueSlug(title: string, excludeId?: number): Promise<string> {
  const base = slugify(title) || "articulo";
  let candidate = base;
  let n = 1;
  while (true) {
    const existing = await db
      .select({ id: blogArticlesTable.id })
      .from(blogArticlesTable)
      .where(eq(blogArticlesTable.slug, candidate))
      .limit(1);
    if (existing.length === 0 || existing[0].id === excludeId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

// ── PUBLIC ────────────────────────────────────────────────────────────────────
// GET /api/blog/articles?vertical=&tag=&limit=&offset=
router.get("/blog/articles", async (req, res) => {
  try {
    const { vertical, limit = "20", offset = "0" } = req.query;
    const conds = [eq(blogArticlesTable.isPublished, true)];
    if (typeof vertical === "string" && vertical.length > 0) {
      conds.push(eq(blogArticlesTable.vertical, vertical));
    }
    const items = await db
      .select({
        id: blogArticlesTable.id,
        slug: blogArticlesTable.slug,
        title: blogArticlesTable.title,
        excerpt: blogArticlesTable.excerpt,
        coverImageUrl: blogArticlesTable.coverImageUrl,
        coverAlt: blogArticlesTable.coverAlt,
        category: blogArticlesTable.category,
        vertical: blogArticlesTable.vertical,
        tags: blogArticlesTable.tags,
        authorName: blogArticlesTable.authorName,
        readMinutes: blogArticlesTable.readMinutes,
        publishedAt: blogArticlesTable.publishedAt,
      })
      .from(blogArticlesTable)
      .where(and(...conds))
      .orderBy(desc(blogArticlesTable.publishedAt))
      .limit(Math.min(50, Number(limit) || 20))
      .offset(Number(offset) || 0);
    res.json({ items });
  } catch (err) {
    console.error("[blog] list error:", err);
    res.status(500).json({ error: "Error al cargar artículos" });
  }
});

// GET /api/blog/articles/:slug
router.get("/blog/articles/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const rows = await db
      .select()
      .from(blogArticlesTable)
      .where(and(eq(blogArticlesTable.slug, slug), eq(blogArticlesTable.isPublished, true)))
      .limit(1);
    const article = rows[0];
    if (!article) return res.status(404).json({ error: "Artículo no encontrado" });

    // increment views (fire and forget)
    db.update(blogArticlesTable)
      .set({ views: sql`${blogArticlesTable.views} + 1` })
      .where(eq(blogArticlesTable.id, article.id))
      .catch(() => {});

    // related: same vertical, exclude this one
    const related = await db
      .select({
        id: blogArticlesTable.id,
        slug: blogArticlesTable.slug,
        title: blogArticlesTable.title,
        excerpt: blogArticlesTable.excerpt,
        coverImageUrl: blogArticlesTable.coverImageUrl,
        readMinutes: blogArticlesTable.readMinutes,
      })
      .from(blogArticlesTable)
      .where(
        and(
          eq(blogArticlesTable.isPublished, true),
          eq(blogArticlesTable.vertical, article.vertical),
          ne(blogArticlesTable.id, article.id),
        ),
      )
      .orderBy(desc(blogArticlesTable.publishedAt))
      .limit(3);

    res.json({ article, related });
  } catch (err) {
    console.error("[blog] detail error:", err);
    res.status(500).json({ error: "Error al cargar el artículo" });
  }
});

// ── ADMIN CRUD ────────────────────────────────────────────────────────────────
router.get(
  "/admin/blog/articles",
  authenticate,
  requireRole("admin"),
  async (_req, res) => {
    try {
      const items = await db
        .select()
        .from(blogArticlesTable)
        .orderBy(desc(blogArticlesTable.updatedAt));
      res.json({ items });
    } catch (err) {
      console.error("[admin/blog] list error:", err);
      res.status(500).json({ error: "Error al listar artículos" });
    }
  },
);

router.post(
  "/admin/blog/articles",
  authenticate,
  requireRole("admin"),
  async (req: any, res) => {
    try {
      const {
        title,
        excerpt = "",
        contentMd = "",
        coverImageUrl,
        coverAlt,
        metaTitle,
        metaDescription,
        category = "general",
        tags = [],
        vertical = "servicios",
        isPublished = false,
      } = req.body || {};
      if (!title || typeof title !== "string") {
        return res.status(400).json({ error: "Título requerido" });
      }
      const slug = await uniqueSlug(title);
      const readMinutes = estimateReadMinutes(contentMd);
      const [row] = await db
        .insert(blogArticlesTable)
        .values({
          slug,
          title,
          excerpt: excerpt || title.slice(0, 160),
          contentMd,
          coverImageUrl: coverImageUrl || null,
          coverAlt: coverAlt || title,
          metaTitle: metaTitle || title,
          metaDescription: metaDescription || excerpt || title.slice(0, 160),
          category,
          tags: Array.isArray(tags) ? tags : [],
          vertical,
          authorId: req.user?.id ?? null,
          authorName: req.user?.name ?? "Equipo LinkServi",
          readMinutes,
          isPublished: !!isPublished,
          publishedAt: isPublished ? new Date() : null,
        })
        .returning();

      if (row.isPublished) {
        pingIndexNow([
          `https://linkservi.com/blog/${row.slug}`,
          `https://linkservi.com/blog`,
        ]);
      }
      res.status(201).json({ article: row });
    } catch (err: any) {
      console.error("[admin/blog] create error:", err);
      res.status(500).json({ error: "Error al crear artículo" });
    }
  },
);

router.put(
  "/admin/blog/articles/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido" });
      const existing = (
        await db.select().from(blogArticlesTable).where(eq(blogArticlesTable.id, id)).limit(1)
      )[0];
      if (!existing) return res.status(404).json({ error: "No encontrado" });

      const {
        title,
        excerpt,
        contentMd,
        coverImageUrl,
        coverAlt,
        metaTitle,
        metaDescription,
        category,
        tags,
        vertical,
        isPublished,
      } = req.body || {};

      const updates: Partial<BlogArticle> = {};
      if (typeof title === "string" && title !== existing.title) {
        updates.title = title;
        updates.slug = await uniqueSlug(title, id);
      }
      if (typeof excerpt === "string") updates.excerpt = excerpt;
      if (typeof contentMd === "string") {
        updates.contentMd = contentMd;
        updates.readMinutes = estimateReadMinutes(contentMd);
      }
      if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl || null;
      if (coverAlt !== undefined) updates.coverAlt = coverAlt || null;
      if (metaTitle !== undefined) updates.metaTitle = metaTitle || null;
      if (metaDescription !== undefined) updates.metaDescription = metaDescription || null;
      if (typeof category === "string") updates.category = category;
      if (Array.isArray(tags)) updates.tags = tags;
      if (typeof vertical === "string") updates.vertical = vertical;
      if (typeof isPublished === "boolean") {
        updates.isPublished = isPublished;
        if (isPublished && !existing.publishedAt) updates.publishedAt = new Date();
      }

      const [row] = await db
        .update(blogArticlesTable)
        .set(updates)
        .where(eq(blogArticlesTable.id, id))
        .returning();

      if (row.isPublished) {
        pingIndexNow([
          `https://linkservi.com/blog/${row.slug}`,
          `https://linkservi.com/blog`,
        ]);
      }
      res.json({ article: row });
    } catch (err) {
      console.error("[admin/blog] update error:", err);
      res.status(500).json({ error: "Error al actualizar" });
    }
  },
);

router.delete(
  "/admin/blog/articles/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido" });
      await db.delete(blogArticlesTable).where(eq(blogArticlesTable.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin/blog] delete error:", err);
      res.status(500).json({ error: "Error al eliminar" });
    }
  },
);

export default router;
