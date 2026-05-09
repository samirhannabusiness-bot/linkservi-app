import type { Request, Response, NextFunction } from "express";
import { db, workersTable, usersTable, categoriesTable, blogArticlesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

const BOT_UA = /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Pinterest|Googlebot|bingbot|DuckDuckBot|Applebot|SkypeUriPreview|redditbot|vkShare|W3C_Validator)/i;

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(opts: {
  title: string;
  description: string;
  imageUrl?: string | null;
  url: string;
  type?: "website" | "article" | "profile";
}): string {
  const { title, description, imageUrl, url, type = "website" } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description.slice(0, 300));
  const img = escapeHtml(imageUrl ?? "https://linkservi.com/opengraph.jpg");
  const u = escapeHtml(url);
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <link rel="canonical" href="${u}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="LinkServi" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="es_VE" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
  </head>
  <body>
    <h1>${t}</h1>
    <p>${d}</p>
    <p><a href="${u}">Ver en LinkServi</a></p>
  </body>
</html>`;
}

function isBot(req: Request): boolean {
  const ua = String(req.headers["user-agent"] ?? "");
  return BOT_UA.test(ua);
}

function absoluteUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.headers.host || "linkservi.com";
  return `${proto}://${host}${req.originalUrl}`;
}

// ── Worker public profile: /workers/:workerId ────────────────────────────────
async function renderWorker(workerId: number, req: Request): Promise<string | null> {
  const rows = await db
    .select({
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
      city: workersTable.city,
      description: workersTable.description,
      categoryName: categoriesTable.name,
      rating: workersTable.rating,
      reviewCount: workersTable.reviewCount,
      isVerified: workersTable.isVerified,
      isAvailable: workersTable.isAvailable,
    })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .leftJoin(categoriesTable, eq(workersTable.categoryId, categoriesTable.id))
    .where(and(eq(workersTable.id, workerId), eq(workersTable.isVerified, true)))
    .limit(1);
  const w = rows[0];
  if (!w) return null;
  const cat = w.categoryName ?? "profesional";
  const city = w.city ? ` en ${w.city}` : "";
  const verified = w.isVerified ? " · Verificado" : "";
  const ratingTxt = w.rating && w.reviewCount ? ` · ${Number(w.rating).toFixed(1)}★ (${w.reviewCount})` : "";
  return renderHtml({
    title: `${w.name} — ${cat}${city} | LinkServi`,
    description: `${w.name}${verified}${ratingTxt}. ${w.description ?? `Contrata ${cat}${city} verificado por LinkServi. Reserva en minutos, paga seguro.`}`,
    imageUrl: w.avatarUrl,
    url: absoluteUrl(req),
    type: "profile",
  });
}

// ── Blog article: /blog/:slug ───────────────────────────────────────────────
async function renderBlogArticle(slug: string, req: Request): Promise<string | null> {
  const rows = await db
    .select({
      title: blogArticlesTable.title,
      excerpt: blogArticlesTable.excerpt,
      coverImageUrl: blogArticlesTable.coverImageUrl,
    })
    .from(blogArticlesTable)
    .where(eq(blogArticlesTable.slug, slug))
    .limit(1);
  const a = rows[0];
  if (!a) return null;
  return renderHtml({
    title: `${a.title} | Blog LinkServi`,
    description: a.excerpt,
    imageUrl: a.coverImageUrl,
    url: absoluteUrl(req),
    type: "article",
  });
}

// ── Middleware ───────────────────────────────────────────────────────────────
// Solo intercepta peticiones de bots de redes/buscadores en rutas públicas con
// contenido propio (perfil de profesional, artículo de blog). Para todo lo demás
// hace next() y deja que el SPA se encargue. Nunca rompe la experiencia humana.
export function seoBotMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api/")) return next();
    if (!isBot(req)) return next();

    try {
      const workerMatch = /^\/workers\/(\d+)/.exec(req.path);
      if (workerMatch) {
        const html = await renderWorker(Number(workerMatch[1]), req);
        if (html) { res.type("html").send(html); return; }
      }
      const blogMatch = /^\/blog\/([a-z0-9-]+)/i.exec(req.path);
      if (blogMatch) {
        const html = await renderBlogArticle(blogMatch[1], req);
        if (html) { res.type("html").send(html); return; }
      }
    } catch (err) {
      logger.warn({ err, path: req.path }, "seo-bot middleware failed — falling through to SPA");
    }
    next();
  };
}
