import { Router, type IRouter } from "express";
import {
  db,
  productsTable,
  workersTable,
  storesTable,
  jobProfilesTable,
  usersTable,
} from "@workspace/db";
import { and, eq, ilike, or, sql } from "drizzle-orm";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseFloatSafe(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface SearchHit {
  type: "product" | "worker" | "store" | "job";
  id: number;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  priceUsd?: number | null;
  rating?: number | null;
  isPremium?: boolean;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number | null;
  href: string;
  meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/search/global — unified search across products, workers, stores, jobs
// Query params:
//   q       (required) search term
//   lat,lng (optional) user coordinates for geo-sorting
//   radius  (optional, km) max distance — default no limit
//   limit   (optional) results per type — default 10
//   types   (optional) comma list "product,worker,store,job" — default all
// ─────────────────────────────────────────────────────────────────────────────
router.get("/search/global", async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ q, products: [], workers: [], stores: [], jobs: [] });
      return;
    }

    const lat = parseFloatSafe(req.query.lat);
    const lng = parseFloatSafe(req.query.lng);
    const radius = parseFloatSafe(req.query.radius);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10")) || 10));
    const typesParam = String(req.query.types ?? "product,worker,store,job")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const want = (t: string) => typesParam.includes(t);

    const like = `%${q.replace(/[%_]/g, m => `\\${m}`)}%`;

    // ── Run all queries in parallel ─────────────────────────────────────────
    const [productsRows, workersRows, storesRows, jobsRows] = await Promise.all([
      want("product")
        ? db
            .select({
              id: productsTable.id,
              name: productsTable.name,
              description: productsTable.description,
              priceUsd: productsTable.priceUsd,
              image: productsTable.image,
              category: productsTable.category,
              latitude: productsTable.latitude,
              longitude: productsTable.longitude,
              isPremium: productsTable.isPremium,
              storeId: productsTable.storeId,
              storeName: storesTable.name,
              storeLogoUrl: storesTable.logoUrl,
              hasDelivery: productsTable.hasDelivery,
              listingType: productsTable.listingType,
              stock: productsTable.stock,
            })
            .from(productsTable)
            .leftJoin(storesTable, eq(productsTable.storeId, storesTable.id))
            .where(
              and(
                eq(productsTable.isActive, true),
                or(
                  ilike(productsTable.name, like),
                  ilike(productsTable.description, like),
                  ilike(productsTable.category, like),
                ),
              ),
            )
            .limit(limit * 3)
        : Promise.resolve([] as any[]),

      want("worker")
        ? db
            .select({
              id: workersTable.id,
              userId: workersTable.userId,
              userName: usersTable.name,
              userAvatar: usersTable.avatarUrl,
              skills: workersTable.skills,
              description: workersTable.description,
              rating: workersTable.rating,
              reviewCount: workersTable.reviewCount,
              isPremium: workersTable.isPremium,
              isAvailable: workersTable.isAvailable,
              isVerified: workersTable.isVerified,
              city: workersTable.city,
              servicePrice: workersTable.servicePrice,
              lat: workersTable.lat,
              lng: workersTable.lng,
            })
            .from(workersTable)
            .leftJoin(usersTable, eq(workersTable.userId, usersTable.id))
            .where(
              and(
                eq(workersTable.isVerified, true),
                or(
                  ilike(usersTable.name, like),
                  ilike(workersTable.description, like),
                  sql`array_to_string(${workersTable.skills}, ',') ILIKE ${like}`,
                ),
              ),
            )
            .limit(limit * 3)
        : Promise.resolve([] as any[]),

      want("store")
        ? db
            .select({
              id: storesTable.id,
              name: storesTable.name,
              description: storesTable.description,
              logoUrl: storesTable.logoUrl,
              city: storesTable.city,
              tagline: storesTable.tagline,
            })
            .from(storesTable)
            .where(
              and(
                eq(storesTable.isActive, true),
                or(
                  ilike(storesTable.name, like),
                  ilike(storesTable.description, like),
                  ilike(storesTable.tagline, like),
                ),
              ),
            )
            .limit(limit * 2)
        : Promise.resolve([] as any[]),

      want("job")
        ? db
            .select({
              id: jobProfilesTable.id,
              userId: jobProfilesTable.userId,
              userName: usersTable.name,
              userAvatar: usersTable.avatarUrl,
              city: jobProfilesTable.city,
              skills: jobProfilesTable.skills,
              bio: jobProfilesTable.bio,
              isAvailable: jobProfilesTable.isAvailable,
            })
            .from(jobProfilesTable)
            .leftJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
            .where(
              or(
                ilike(usersTable.name, like),
                ilike(jobProfilesTable.bio, like),
                ilike(jobProfilesTable.city, like),
                ilike(jobProfilesTable.skills, like),
              ),
            )
            .limit(limit * 3)
        : Promise.resolve([] as any[]),
    ]);

    // ── Map + geo-sort + filter by radius ───────────────────────────────────
    const withDistance = <T extends { lat?: number | null; lng?: number | null }>(
      rows: T[],
    ): (T & { distanceKm: number | null })[] =>
      rows.map(r => {
        const rLat = r.lat;
        const rLng = r.lng;
        const dist =
          lat !== null && lng !== null && rLat != null && rLng != null
            ? haversineKm(lat, lng, rLat, rLng)
            : null;
        return { ...r, distanceKm: dist };
      });

    function rankAndTrim<T extends { distanceKm: number | null; isPremium?: boolean }>(
      rows: T[],
    ): T[] {
      let filtered = rows;
      if (radius != null && lat != null && lng != null) {
        filtered = rows.filter(r => r.distanceKm == null || r.distanceKm <= radius);
      }
      filtered.sort((a, b) => {
        const ap = a.isPremium ? 1 : 0;
        const bp = b.isPremium ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const ad = a.distanceKm ?? Number.MAX_SAFE_INTEGER;
        const bd = b.distanceKm ?? Number.MAX_SAFE_INTEGER;
        return ad - bd;
      });
      return filtered.slice(0, limit);
    }

    const products: SearchHit[] = rankAndTrim(
      withDistance(
        productsRows.map((p: any) => ({
          ...p,
          lat: p.latitude,
          lng: p.longitude,
        })),
      ),
    ).map((p: any) => ({
      type: "product",
      id: p.id,
      title: p.name,
      subtitle: p.storeName ?? p.category,
      image: p.image,
      priceUsd: p.priceUsd,
      isPremium: !!p.isPremium,
      lat: p.lat,
      lng: p.lng,
      distanceKm: p.distanceKm,
      href: `/store/products/${p.id}`,
      meta: {
        storeId: p.storeId,
        storeName: p.storeName,
        storeLogoUrl: p.storeLogoUrl,
        hasDelivery: p.hasDelivery,
        listingType: p.listingType,
        stock: p.stock,
        category: p.category,
      },
    }));

    const workers: SearchHit[] = rankAndTrim(withDistance(workersRows)).map((w: any) => ({
      type: "worker",
      id: w.id,
      title: w.userName ?? "Profesional",
      subtitle: (w.skills && w.skills.length > 0 ? w.skills.slice(0, 2).join(" • ") : null) ?? w.city,
      image: w.userAvatar,
      priceUsd: w.servicePrice,
      rating: w.rating,
      isPremium: !!w.isPremium,
      lat: w.lat,
      lng: w.lng,
      distanceKm: w.distanceKm,
      href: `/client/worker/${w.userId}`,
      meta: {
        reviewCount: w.reviewCount,
        isAvailable: w.isAvailable,
        isVerified: w.isVerified,
        city: w.city,
      },
    }));

    const stores: SearchHit[] = rankAndTrim(
      storesRows.map((s: any) => ({ ...s, distanceKm: null, isPremium: false })),
    ).map((s: any) => ({
      type: "store",
      id: s.id,
      title: s.name,
      subtitle: s.tagline ?? s.city ?? s.description?.slice(0, 80),
      image: s.logoUrl,
      href: `/stores/${s.id}`,
      meta: { city: s.city },
    }));

    const parseSkills = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw.map(String);
      if (typeof raw === "string") {
        try {
          const v = JSON.parse(raw);
          return Array.isArray(v) ? v.map(String) : [];
        } catch {
          return raw ? [raw] : [];
        }
      }
      return [];
    };

    const jobs: SearchHit[] = rankAndTrim(
      jobsRows.map((j: any) => ({
        ...j,
        distanceKm: null,
        isPremium: false,
      })),
    ).map((j: any) => {
      const skillsArr = parseSkills(j.skills);
      const name = j.userName ?? "Candidato";
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "c";
      return {
        type: "job" as const,
        id: j.id,
        title: name,
        subtitle: (skillsArr.length > 0 ? skillsArr.slice(0, 3).join(" • ") : null) ?? j.city,
        image: j.userAvatar,
        href: `/jobs/perfil/${slug}-${j.userId}`,
        meta: { city: j.city, isAvailable: j.isAvailable },
      };
    });

    res.json({
      q,
      products,
      workers,
      stores,
      jobs,
      counts: {
        products: products.length,
        workers: workers.length,
        stores: stores.length,
        jobs: jobs.length,
      },
    });
  } catch (err) {
    console.error("[search/global] error:", err);
    res.status(500).json({ error: "Error en la búsqueda" });
  }
});

export default router;
