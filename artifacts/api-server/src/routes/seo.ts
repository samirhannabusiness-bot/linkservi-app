import { Router } from "express";
import { db, workersTable, usersTable, categoriesTable, blogArticlesTable, jobProfilesTable, userVerificationsTable } from "@workspace/db";
import { eq, and, desc, isNotNull, ilike, sql } from "drizzle-orm";
import { workerSlug, parseIdFromSlug, slugify } from "../lib/slugify";
import { getIndexNowKey } from "../lib/indexnow";

const router = Router();

const VENEZUELA_CITIES = [
  "Caracas",
  "Maracaibo",
  "Valencia",
  "Barquisimeto",
  "Maracay",
  "Ciudad Guayana",
  "San Cristóbal",
  "Maturín",
  "Barcelona",
  "Puerto La Cruz",
  "Petare",
  "Mérida",
  "Cabimas",
  "Cumaná",
  "Los Teques",
  "Punto Fijo",
  "Coro",
  "Acarigua",
  "Guarenas",
  "Guatire",
];

// GET /api/seo/categories — slug, name, count of available workers
router.get("/seo/categories", async (_req, res) => {
  try {
    const cats = await db.select().from(categoriesTable);
    const items = cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: slugify(c.name),
      icon: c.icon,
      color: c.color,
    }));
    res.json({ items });
  } catch (err) {
    console.error("[seo/categories]", err);
    res.status(500).json({ error: "Error" });
  }
});

// GET /api/seo/cities — list of supported cities
router.get("/seo/cities", (_req, res) => {
  res.json({
    items: VENEZUELA_CITIES.map((c) => ({ name: c, slug: slugify(c) })),
  });
});

// GET /api/seo/workers/by-category/:catSlug?city=
router.get("/seo/workers/by-category/:catSlug", async (req, res) => {
  try {
    const catSlug = String(req.params.catSlug);
    const cityParam = req.query.city ? slugify(String(req.query.city)) : null;

    const cats = await db.select().from(categoriesTable);
    const cat = cats.find((c) => slugify(c.name) === catSlug);
    if (!cat) return res.json({ category: null, workers: [] });

    const conds = [
      eq(workersTable.categoryId, cat.id),
      eq(workersTable.isAvailable, true),
      eq(workersTable.isVerified, true),
    ];
    if (cityParam) {
      const cityName = VENEZUELA_CITIES.find((c) => slugify(c) === cityParam);
      if (cityName) conds.push(ilike(workersTable.city, `%${cityName}%`));
    }
    const workers = await db
      .select({
        id: workersTable.id,
        userId: workersTable.userId,
        description: workersTable.description,
        skills: workersTable.skills,
        rating: workersTable.rating,
        reviewCount: workersTable.reviewCount,
        completedJobs: workersTable.completedJobs,
        servicePrice: workersTable.servicePrice,
        basePrice: workersTable.basePrice,
        city: workersTable.city,
        state: workersTable.state,
        isPremium: workersTable.isPremium,
        portfolioPhotos: workersTable.portfolioPhotos,
        userName: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(workersTable)
      .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
      .where(and(...conds))
      .orderBy(desc(workersTable.isPremium), desc(workersTable.rating))
      .limit(50);

    const enriched = workers.map((w) => ({
      ...w,
      slug: workerSlug(w.userName, w.id),
    }));

    res.json({
      category: { id: cat.id, name: cat.name, slug: slugify(cat.name), icon: cat.icon, color: cat.color },
      workers: enriched,
    });
  } catch (err) {
    console.error("[seo/by-category]", err);
    res.status(500).json({ error: "Error" });
  }
});

// GET /api/seo/worker/:slug
router.get("/seo/worker/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const id = parseIdFromSlug(slug);
    if (!id) return res.status(404).json({ error: "No encontrado" });

    const rows = await db
      .select({
        id: workersTable.id,
        userId: workersTable.userId,
        description: workersTable.description,
        skills: workersTable.skills,
        rating: workersTable.rating,
        reviewCount: workersTable.reviewCount,
        completedJobs: workersTable.completedJobs,
        servicePrice: workersTable.servicePrice,
        basePrice: workersTable.basePrice,
        hourlyRate: workersTable.hourlyRate,
        city: workersTable.city,
        state: workersTable.state,
        isPremium: workersTable.isPremium,
        isVerified: workersTable.isVerified,
        isAvailable: workersTable.isAvailable,
        portfolioPhotos: workersTable.portfolioPhotos,
        categoryId: workersTable.categoryId,
        userName: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        categoryName: categoriesTable.name,
      })
      .from(workersTable)
      .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
      .leftJoin(categoriesTable, eq(workersTable.categoryId, categoriesTable.id))
      .where(and(
        eq(workersTable.id, id),
        eq(workersTable.isVerified, true),
        eq(workersTable.isAvailable, true),
      ))
      .limit(1);

    const w = rows[0];
    if (!w) return res.status(404).json({ error: "No encontrado" });

    res.json({
      worker: {
        ...w,
        slug: workerSlug(w.userName, w.id),
        categorySlug: w.categoryName ? slugify(w.categoryName) : null,
      },
    });
  } catch (err) {
    console.error("[seo/worker]", err);
    res.status(500).json({ error: "Error" });
  }
});

// GET /seo/job-profile/:slug — public job profile for SEO
router.get("/seo/job-profile/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug);

    // Build shared SELECT fields
    const profileFields = {
      id: jobProfilesTable.id,
      userId: jobProfilesTable.userId,
      bio: jobProfilesTable.bio,
      videoUrl: jobProfilesTable.videoUrl,
      city: jobProfilesTable.city,
      skills: jobProfilesTable.skills,
      workExperience: jobProfilesTable.workExperience,
      isAvailable: jobProfilesTable.isAvailable,
      subscriptionEnd: jobProfilesTable.subscriptionEnd,
      createdAt: jobProfilesTable.createdAt,
      userName: usersTable.name,
      userAvatar: usersTable.avatarUrl,
      isVerified: sql<boolean>`EXISTS (
        SELECT 1 FROM user_verifications uv
        WHERE uv.user_id = ${jobProfilesTable.userId}
        AND uv.status = 'approved'
      )`,
    } as const;

    let rows: Array<{
      id: number; userId: number; bio: string; videoUrl: string | null;
      city: string; skills: string; workExperience: string;
      isAvailable: boolean; subscriptionEnd: Date | null; createdAt: Date;
      userName: string; userAvatar: string | null; isVerified: boolean;
    }> = [];

    // Primary lookup: slug ends with numeric userId (e.g. "samir-hanna-1")
    const userId = parseIdFromSlug(slug);
    if (userId) {
      rows = await db
        .select(profileFields)
        .from(jobProfilesTable)
        .innerJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
        .where(eq(jobProfilesTable.userId, userId))
        .limit(1);
    }

    // Fallback: slug without ID — match by slugified name prefix (e.g. "samir-hanna")
    if (!rows.length) {
      const allProfiles = await db
        .select(profileFields)
        .from(jobProfilesTable)
        .innerJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
        .limit(500);
      const match = allProfiles.find(p =>
        workerSlug(p.userName, p.userId).startsWith(slug) ||
        slugify(p.userName) === slug
      );
      if (match) rows = [match];
    }

    const profile = rows[0];
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado" });

    let skills: string[] = [];
    let workExperience: { company: string; role: string; years: number }[] = [];
    try { skills = JSON.parse(profile.skills); } catch { /* ignore */ }
    try { workExperience = JSON.parse(profile.workExperience as string); } catch { /* ignore */ }

    res.json({
      profile: {
        ...profile,
        skills,
        workExperience,
        slug: workerSlug(profile.userName, profile.userId),
        isFeatured: profile.subscriptionEnd ? new Date(profile.subscriptionEnd) > new Date() : false,
      },
    });
  } catch (err) {
    console.error("[seo/job-profile]", err);
    res.status(500).json({ error: "Error" });
  }
});

// GET /sitemap.xml — dynamic
router.get("/sitemap.xml", async (_req, res) => {
  try {
    const HOST = "https://linkservi.com";
    const today = new Date().toISOString().split("T")[0];

    const [cats, articles, workers, jobProfiles] = await Promise.all([
      db.select().from(categoriesTable),
      db
        .select({
          slug: blogArticlesTable.slug,
          updatedAt: blogArticlesTable.updatedAt,
          publishedAt: blogArticlesTable.publishedAt,
        })
        .from(blogArticlesTable)
        .where(eq(blogArticlesTable.isPublished, true))
        .orderBy(desc(blogArticlesTable.publishedAt)),
      db
        .select({
          id: workersTable.id,
          userName: usersTable.name,
          updatedAt: workersTable.updatedAt,
          categoryId: workersTable.categoryId,
          city: workersTable.city,
        })
        .from(workersTable)
        .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
        .where(and(eq(workersTable.isVerified, true), eq(workersTable.isAvailable, true)))
        .limit(2000),
      db
        .select({ userId: jobProfilesTable.userId, userName: usersTable.name })
        .from(jobProfilesTable)
        .innerJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
        .where(eq(jobProfilesTable.isAvailable, true))
        .limit(2000),
    ]);

    type SitemapEntry = { loc: string; lastmod: string; changefreq: string; priority: string };
    const entries: SitemapEntry[] = [];

    // Static pages
    entries.push({ loc: `${HOST}/`, lastmod: today, changefreq: "daily", priority: "1.0" });
    entries.push({ loc: `${HOST}/blog`, lastmod: today, changefreq: "daily", priority: "0.9" });
    entries.push({ loc: `${HOST}/store`, lastmod: today, changefreq: "weekly", priority: "0.8" });
    entries.push({ loc: `${HOST}/jobs`, lastmod: today, changefreq: "weekly", priority: "0.8" });
    entries.push({ loc: `${HOST}/search`, lastmod: today, changefreq: "weekly", priority: "0.7" });

    // Blog articles — highest SEO value after home
    for (const a of articles) {
      const lastmod = a.updatedAt
        ? a.updatedAt.toISOString().split("T")[0]
        : (a.publishedAt ? a.publishedAt.toISOString().split("T")[0] : today);
      entries.push({
        loc: `${HOST}/blog/${a.slug}`,
        lastmod,
        changefreq: "daily",
        priority: "0.8",
      });
    }

    // Category + city pages — SOLO incluimos páginas con contenido real (≥1 worker verificado y disponible)
    // Esto evita thin content / soft-404 por miles de páginas vacías indexadas.
    const catsWithWorkers = new Set<number>();
    const catCityPairs = new Set<string>(); // `${categoryId}|${citySlug}`
    for (const w of workers) {
      if (!w.categoryId) continue;
      catsWithWorkers.add(w.categoryId);
      if (!w.city) continue;
      const wCityLower = w.city.toLowerCase();
      for (const city of VENEZUELA_CITIES) {
        if (wCityLower.includes(city.toLowerCase())) {
          catCityPairs.add(`${w.categoryId}|${slugify(city)}`);
        }
      }
    }

    for (const cat of cats) {
      if (!catsWithWorkers.has(cat.id)) continue;
      const cs = slugify(cat.name);
      entries.push({ loc: `${HOST}/servicios/${cs}`, lastmod: today, changefreq: "weekly", priority: "0.7" });
      for (const city of VENEZUELA_CITIES) {
        const citySlug = slugify(city);
        if (!catCityPairs.has(`${cat.id}|${citySlug}`)) continue;
        entries.push({ loc: `${HOST}/servicios/${cs}/${citySlug}`, lastmod: today, changefreq: "weekly", priority: "0.6" });
      }
    }

    // Worker profiles
    for (const w of workers) {
      const lastmod = w.updatedAt ? w.updatedAt.toISOString().split("T")[0] : today;
      entries.push({ loc: `${HOST}/p/${workerSlug(w.userName, w.id)}`, lastmod, changefreq: "weekly", priority: "0.6" });
    }

    // Job profiles
    for (const jp of jobProfiles) {
      entries.push({ loc: `${HOST}/jobs/perfil/${workerSlug(jp.userName, jp.userId)}`, lastmod: today, changefreq: "weekly", priority: "0.6" });
    }

    const urlTags = entries
      .map(
        (e) =>
          `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
      )
      .join("\n");

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urlTags +
      "\n</urlset>";

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=1800");
    res.send(xml);
  } catch (err) {
    console.error("[sitemap]", err);
    res.status(500).send("");
  }
});

// IndexNow key file — required by IndexNow protocol
router.get("/:key.txt", (req, res, next) => {
  const key = getIndexNowKey();
  if (req.params.key === key) {
    res.setHeader("Content-Type", "text/plain");
    return res.send(key);
  }
  next();
});

export default router;
