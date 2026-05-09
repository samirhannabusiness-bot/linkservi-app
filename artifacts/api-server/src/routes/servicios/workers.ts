import { Router } from "express";
import { db, usersTable, workersTable, categoriesTable, bookingsTable, eventsTable } from "@workspace/db";
import { eq, and, isNotNull, sql, count } from "drizzle-orm";
import { authenticate, requireRole } from "../../lib/auth";
import { subDays } from "date-fns";

const router = Router();

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Proximity tier (lower = closer to client) ────────────────────────────────
// Partitions workers into geographic groups. Within each tier, smartScore decides.
function getProximityTier(
  workerLat: number | null,
  workerLng: number | null,
  workerState: string | null,
  workerCity: string | null,
  clientLat?: number | null,
  clientLng?: number | null,
  clientState?: string,
  clientCity?: string,
): number {
  const NEAR_KM = 25;
  if (clientLat && clientLng && workerLat && workerLng) {
    const dist = haversineDistance(clientLat, clientLng, workerLat, workerLng);
    if (dist <= NEAR_KM) return 0;
    const sameCity = clientCity && workerCity && clientCity.toLowerCase() === workerCity.toLowerCase();
    const sameState = clientState && workerState && clientState.toLowerCase() === workerState.toLowerCase();
    if (sameCity) return 1;
    if (sameState) return 2;
    return 3;
  }
  const sameCity = clientCity && workerCity && clientCity.toLowerCase() === workerCity.toLowerCase();
  const sameState = clientState && workerState && clientState.toLowerCase() === workerState.toLowerCase();
  if (sameCity) return 0;
  if (sameState) return 1;
  return 2;
}

// ── Smart quality score (0–100+ range) ───────────────────────────────────────
// Signal weights (base 100 pts):
//   availability 20 | contacts 20 | completed jobs 20 | rating 20 | reviews 5 | profile 10 | verified 5
// New signals:
//   response time +15/<5 min, +10/<15 min | unanswered penalty −2/pending (cap −10)
//   recent contact temporal boost +5 | rotation jitter 0–2
// Premium boost: ×1.10 (gentle, never dominates)
function computeSmartScore(params: {
  isAvailable: boolean;
  contactScore: number;
  maxContactScore: number;
  completedJobs: number;
  rating: number | null;
  reviewCount: number;
  hasAvatar: boolean;
  hasDescription: boolean;
  hasPortfolioPhotos: boolean;
  isVerified: boolean;
  isPremiumActive: boolean;
  // ── new signals ──
  avgResponseMinutes: number | null;
  unansweredCount: number;
  hasRecentContact: boolean;
  rotationJitter: number;          // deterministic 0–2 pts, seeded per worker+time-bucket
}): number {
  // 1. Availability (20 pts)
  const availPts = params.isAvailable ? 20 : 0;

  // 2. Contact demand — last 30d, normalized (20 pts)
  const contactNorm = params.maxContactScore > 0
    ? Math.min(1, params.contactScore / params.maxContactScore)
    : 0;
  const contactPts = contactNorm * 20;

  // 3. Completed jobs — log scale, new workers not buried (20 pts)
  const jobPts = params.completedJobs > 0
    ? Math.min(20, (Math.log1p(params.completedJobs) / Math.log1p(20)) * 20)
    : 0;

  // 4. Rating (20 pts) — credibility grows with review count
  const ratingWeight = params.reviewCount >= 3 ? 1 : params.reviewCount / 3;
  const ratingPts = ((params.rating ?? 0) / 5) * 20 * ratingWeight;

  // 5. Review volume — social proof tiebreaker (5 pts, log scale)
  const reviewPts = params.reviewCount > 0
    ? Math.min(5, (Math.log1p(params.reviewCount) / Math.log1p(50)) * 5)
    : 0;

  // 6. Profile completeness (10 pts)
  let profilePts = 0;
  if (params.hasAvatar) profilePts += 4;
  if (params.hasDescription) profilePts += 4;
  if (params.hasPortfolioPhotos) profilePts += 2;

  // 7. KYC verified (5 pts)
  const verifiedPts = params.isVerified ? 5 : 0;

  // 8. Response time — rewarded only when worker is available (max 15 pts)
  //    <5 min → +15 pts; <15 min → +10 pts; otherwise 0
  let responseTimePts = 0;
  if (params.isAvailable && params.avgResponseMinutes != null) {
    if (params.avgResponseMinutes < 5) responseTimePts = 15;
    else if (params.avgResponseMinutes < 15) responseTimePts = 10;
  }

  // 9. Unanswered penalty — stale pending requests signal poor engagement (−2 each, cap −10)
  const penaltyPts = Math.max(-10, params.unansweredCount * -2);

  // 10. Temporal boost — just received a contact in the last 30 min (+5 pts)
  //     Rewards responsive workers: they move up temporarily while active
  const temporalBoostPts = params.hasRecentContact ? 5 : 0;

  // 11. Rotation jitter (0–2 pts) — deterministic micro-variation prevents top-lock
  //     Same worker keeps the same jitter within a 10-min bucket, so results are stable
  //     but never perfectly frozen. High-quality workers are unaffected (~2% swing max).
  const jitterPts = params.rotationJitter;

  const base =
    availPts + contactPts + jobPts + ratingPts + reviewPts + profilePts + verifiedPts
    + responseTimePts + penaltyPts + temporalBoostPts + jitterPts;

  // Premium: gentle +10% — cannot catapult a bad profile over a great one
  return params.isPremiumActive ? base * 1.10 : base;
}

function formatWorkerResponse(w: { worker: typeof workersTable.$inferSelect; user: typeof usersTable.$inferSelect; category: typeof categoriesTable.$inferSelect | null }, distance: number | null) {
  return {
    id: w.worker.id,
    userId: w.worker.userId,
    name: w.user.name,
    avatarUrl: w.user.avatarUrl,
    categoryId: w.worker.categoryId,
    categoryName: w.category?.name ?? null,
    description: w.worker.description,
    skills: w.worker.skills,
    hourlyRate: w.worker.hourlyRate,
    basePrice: w.worker.basePrice,
    servicePrice: w.worker.servicePrice,
    pricingType: w.worker.pricingType,
    baseVisitFee: w.worker.baseVisitFee,
    fixedPrice: w.worker.fixedPrice,
    rating: w.worker.rating,
    reviewCount: w.worker.reviewCount,
    isAvailable: w.worker.isAvailable,
    isVerified: w.worker.isVerified,
    isPremium: w.worker.isPremium,
    premiumUntil: w.worker.premiumUntil,
    state: w.worker.state ?? w.user.state ?? null,
    city: w.worker.city ?? w.user.city ?? null,
    lat: w.worker.lat,
    lng: w.worker.lng,
    distance,
    completedJobs: w.worker.completedJobs,
    portfolioPhotos: w.worker.portfolioPhotos ?? [],
  };
}

router.get("/workers", async (req, res): Promise<void> => {
  const { categoryId, lat, lng, available, state, city } = req.query as {
    categoryId?: string;
    lat?: string;
    lng?: string;
    available?: string;
    state?: string;
    city?: string;
  };

  const conditions = [];
  // Gate 2 — KYC: only verified workers are visible to clients
  conditions.push(eq(workersTable.isVerified, true));
  if (categoryId) conditions.push(eq(workersTable.categoryId, parseInt(categoryId)));
  if (available === "true") conditions.push(eq(workersTable.isAvailable, true));

  let workers;
  try {
    workers = await db
      .select({
        worker: workersTable,
        user: usersTable,
        category: categoriesTable,
      })
      .from(workersTable)
      .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
      .leftJoin(categoriesTable, eq(workersTable.categoryId, categoriesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
  } catch (err) {
    const message = String((err as any)?.message ?? err);
    if (message.includes('relation "workers" does not exist')) {
      res.json([]);
      return;
    }
    throw err;
  }

  const clientLat = lat ? parseFloat(lat) : null;
  const clientLng = lng ? parseFloat(lng) : null;
  const clientState = state ?? undefined;
  const clientCity = city ?? undefined;

  // ── Run all ranking signal queries in parallel ──────────────────────────
  const since30d  = subDays(new Date(), 30);
  const since30m  = new Date(Date.now() - 30 * 60 * 1000);
  const cutoff30m = new Date(Date.now() - 30 * 60 * 1000); // same, named for clarity
  const since24h  = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const safeQuery = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await promise;
    } catch (err) {
      const message = String((err as any)?.message ?? err);
      if (message.includes('relation "bookings" does not exist') || message.includes('relation "events" does not exist')) {
        return fallback;
      }
      throw err;
    }
  };

  const [responseTimeRows, contactRows, penaltyRows, recentContactRows, recentActivity24hRows] = await Promise.all([
    safeQuery(
      db.select({
        workerId: bookingsTable.workerId,
        avgMinutes: sql<number>`
          ROUND(AVG(EXTRACT(EPOCH FROM (${bookingsTable.acceptedAt} - ${bookingsTable.createdAt})) / 60))::int
        `,
      })
      .from(bookingsTable)
      .where(sql`${bookingsTable.acceptedAt} IS NOT NULL AND ${bookingsTable.status} NOT IN ('cancelled','rejected')`)
      .groupBy(bookingsTable.workerId)
      .having(sql`COUNT(*) >= 1`),
      []
    ),

    safeQuery(
      db.select({
        workerId: sql<number>`(${eventsTable.meta}::json->>'workerId')::int`,
        cnt: count(),
      })
      .from(eventsTable)
      .where(sql`${eventsTable.event} = 'contact_click' AND ${eventsTable.createdAt} >= ${since30d.toISOString()}`)
      .groupBy(sql`(${eventsTable.meta}::json->>'workerId')::int`),
      []
    ),

    safeQuery(
      db.select({
        workerId: bookingsTable.workerId,
        cnt: count(),
      })
      .from(bookingsTable)
      .where(sql`${bookingsTable.status} = 'pending' AND ${bookingsTable.createdAt} < ${cutoff30m.toISOString()}`)
      .groupBy(bookingsTable.workerId),
      []
    ),

    safeQuery(
      db.select({
        workerId: sql<number>`(${eventsTable.meta}::json->>'workerId')::int`,
      })
      .from(eventsTable)
      .where(sql`${eventsTable.event} = 'contact_click' AND ${eventsTable.createdAt} >= ${since30m.toISOString()}`)
      .groupBy(sql`(${eventsTable.meta}::json->>'workerId')::int`),
      []
    ),

    safeQuery(
      db.select({
        workerId: sql<number>`(${eventsTable.meta}::json->>'workerId')::int`,
      })
      .from(eventsTable)
      .where(sql`${eventsTable.event} = 'contact_click' AND ${eventsTable.createdAt} >= ${since24h.toISOString()}`)
      .groupBy(sql`(${eventsTable.meta}::json->>'workerId')::int`),
      []
    ),
  ]);

  const responseTimeMap = new Map<number, number>();
  for (const r of responseTimeRows) {
    if (r.workerId && r.avgMinutes != null && r.avgMinutes > 0) {
      responseTimeMap.set(r.workerId, Number(r.avgMinutes));
    }
  }

  const contactMap = new Map<number, number>();
  for (const r of contactRows) {
    if (r.workerId) contactMap.set(r.workerId, Number(r.cnt));
  }
  const maxContacts = Math.max(0, ...contactMap.values());
  const topThreshold = maxContacts >= 3 ? Math.max(3, maxContacts * 0.4) : 9999;

  const penaltyMap = new Map<number, number>();
  for (const r of penaltyRows) {
    if (r.workerId) penaltyMap.set(r.workerId, Number(r.cnt));
  }

  const recentContactSet = new Set<number>();
  for (const r of recentContactRows) {
    if (r.workerId) recentContactSet.add(r.workerId);
  }

  const recentActivity24hSet = new Set<number>();
  for (const r of recentActivity24hRows) {
    if (r.workerId) recentActivity24hSet.add(r.workerId);
  }

  // Rotation seed: changes every 10 min → stable within a window, fresh each period
  const timeBucket = Math.floor(Date.now() / (10 * 60 * 1000));

  const result = workers
    .filter((w) => w.user.isActive)
    .map((w) => {
      const distance =
        clientLat && clientLng && w.worker.lat && w.worker.lng
          ? haversineDistance(clientLat, clientLng, w.worker.lat, w.worker.lng)
          : null;
      const workerState = w.worker.state ?? w.user.state ?? null;
      const workerCity = w.worker.city ?? w.user.city ?? null;

      const proximityTier = getProximityTier(
        w.worker.lat ?? null,
        w.worker.lng ?? null,
        workerState,
        workerCity,
        clientLat,
        clientLng,
        clientState,
        clientCity,
      );

      const contactScore = contactMap.get(w.worker.id) ?? 0;
      const isTopProfile = contactScore >= topThreshold;

      const premiumActive = w.worker.isPremium &&
        w.worker.premiumUntil != null &&
        new Date(w.worker.premiumUntil) > new Date();

      const photos = (w.worker.portfolioPhotos as string[] | null) ?? [];

      // Deterministic jitter: same worker→same value within a 10-min bucket.
      // Uses sin(workerId × prime × timeBucket) to distribute evenly 0–2 pts.
      const rotationJitter = (Math.sin(w.worker.id * 7919 + timeBucket) * 0.5 + 0.5) * 2;

      const smartScore = computeSmartScore({
        isAvailable: w.worker.isAvailable ?? false,
        contactScore,
        maxContactScore: maxContacts,
        completedJobs: w.worker.completedJobs ?? 0,
        rating: w.worker.rating,
        reviewCount: w.worker.reviewCount ?? 0,
        hasAvatar: !!w.user.avatarUrl,
        hasDescription: !!(w.worker.description && w.worker.description.length >= 20),
        hasPortfolioPhotos: photos.length > 0,
        isVerified: w.worker.isVerified ?? false,
        isPremiumActive: premiumActive,
        avgResponseMinutes: responseTimeMap.get(w.worker.id) ?? null,
        unansweredCount: penaltyMap.get(w.worker.id) ?? 0,
        hasRecentContact: recentContactSet.has(w.worker.id),
        rotationJitter,
      });

      const avgResponseMinutes = responseTimeMap.get(w.worker.id) ?? null;

      return {
        ...formatWorkerResponse(w, distance),
        contactScore,
        isTopProfile,
        smartScore: Math.round(smartScore * 10) / 10,
        avgResponseMinutes,
        hasRecentContact: recentContactSet.has(w.worker.id),
        hasRecentActivity24h: recentActivity24hSet.has(w.worker.id),
        unansweredCount: penaltyMap.get(w.worker.id) ?? 0,
        _proximityTier: proximityTier,
      };
    });

  // ── Final sort ───────────────────────────────────────────────────────────────
  // 1. Proximity tier (geographic grouping) — local workers always before distant ones
  // 2. Smart score (descending) — availability + contacts + jobs + rating + profile + premium
  // Low-quality profiles can never leapfrog high-quality ones within the same tier.
  result.sort((a, b) => {
    if (a._proximityTier !== b._proximityTier) return a._proximityTier - b._proximityTier;
    return b.smartScore - a.smartScore;
  });

  res.json(result.map(({ _proximityTier, ...rest }) => rest));
});

router.get("/workers/me", authenticate, requireRole("worker"), async (req, res): Promise<void> => {
  const [worker] = await db
    .select({ worker: workersTable, user: usersTable })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .where(eq(workersTable.userId, req.user!.id));

  if (!worker) {
    res.status(404).json({ error: "Worker profile not found" });
    return;
  }

  res.json({
    id: worker.worker.id,
    userId: worker.worker.userId,
    categoryId: worker.worker.categoryId,
    description: worker.worker.description,
    skills: worker.worker.skills,
    hourlyRate: worker.worker.hourlyRate,
    basePrice: worker.worker.basePrice,
    servicePrice: worker.worker.servicePrice,
    pricingType: worker.worker.pricingType,
    baseVisitFee: worker.worker.baseVisitFee,
    fixedPrice: worker.worker.fixedPrice,
    rating: worker.worker.rating,
    reviewCount: worker.worker.reviewCount,
    isAvailable: worker.worker.isAvailable,
    isVerified: worker.worker.isVerified,
    isPremium: worker.worker.isPremium,
    premiumUntil: worker.worker.premiumUntil,
    // Return "not_submitted" when no photos have been uploaded yet so the KYC wall
    // shows "Verifica tu identidad" (not "Cuenta en revisión") for new workers.
    verificationStatus: (worker.worker.documentImageUrl && worker.worker.selfieImageUrl)
      ? worker.worker.verificationStatus
      : "not_submitted",
    state: worker.worker.state ?? worker.user.state ?? null,
    city: worker.worker.city ?? worker.user.city ?? null,
    lat: worker.worker.lat,
    lng: worker.worker.lng,
    completedJobs: worker.worker.completedJobs,
    earnings: worker.worker.earnings,
    portfolioPhotos: worker.worker.portfolioPhotos ?? [],
  });
});

router.put("/workers/me", authenticate, requireRole("worker"), async (req, res): Promise<void> => {
  const { categoryId, description, skills, hourlyRate, pricingType, baseVisitFee, fixedPrice, basePrice, servicePrice, state, city, portfolioPhotos } = req.body;
  const [worker] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.userId, req.user!.id));

  if (!worker) {
    res.status(404).json({ error: "Worker profile not found" });
    return;
  }

  const [updated] = await db
    .update(workersTable)
    .set({
      ...(categoryId !== undefined && { categoryId }),
      ...(description !== undefined && { description }),
      ...(skills !== undefined && { skills }),
      ...(hourlyRate !== undefined && { hourlyRate }),
      ...(basePrice !== undefined && { basePrice }),
      ...(servicePrice !== undefined && { servicePrice }),
      ...(pricingType !== undefined && { pricingType }),
      ...(baseVisitFee !== undefined && { baseVisitFee }),
      ...(fixedPrice !== undefined && { fixedPrice }),
      ...(state !== undefined && { state }),
      ...(city !== undefined && { city }),
      ...(Array.isArray(portfolioPhotos) && { portfolioPhotos }),
    })
    .where(eq(workersTable.id, worker.id))
    .returning();

  res.json({
    id: updated.id,
    userId: updated.userId,
    categoryId: updated.categoryId,
    description: updated.description,
    skills: updated.skills,
    hourlyRate: updated.hourlyRate,
    basePrice: updated.basePrice,
    servicePrice: updated.servicePrice,
    pricingType: updated.pricingType,
    baseVisitFee: updated.baseVisitFee,
    fixedPrice: updated.fixedPrice,
    rating: updated.rating,
    reviewCount: updated.reviewCount,
    isAvailable: updated.isAvailable,
    isVerified: updated.isVerified,
    isPremium: updated.isPremium,
    premiumUntil: updated.premiumUntil,
    verificationStatus: updated.verificationStatus,
    state: updated.state,
    city: updated.city,
    lat: updated.lat,
    lng: updated.lng,
    completedJobs: updated.completedJobs,
    earnings: updated.earnings,
    portfolioPhotos: updated.portfolioPhotos ?? [],
  });
});

// Update worker GPS location
router.put("/workers/me/location", authenticate, requireRole("worker"), async (req, res): Promise<void> => {
  const { lat, lng } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat and lng must be numbers" });
    return;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "Invalid coordinates" });
    return;
  }
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
  if (!worker) { res.status(404).json({ error: "Worker profile not found" }); return; }

  const [updated] = await db
    .update(workersTable)
    .set({ lat, lng })
    .where(eq(workersTable.id, worker.id))
    .returning();
  res.json({ id: updated.id, lat: updated.lat, lng: updated.lng });
});

router.put("/workers/me/availability", authenticate, requireRole("worker"), async (req, res): Promise<void> => {
  const { isAvailable } = req.body;
  if (typeof isAvailable !== "boolean") {
    res.status(400).json({ error: "isAvailable must be a boolean" });
    return;
  }

  const [worker] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.userId, req.user!.id));

  if (!worker) {
    res.status(404).json({ error: "Worker profile not found" });
    return;
  }

  const [updated] = await db
    .update(workersTable)
    .set({ isAvailable })
    .where(eq(workersTable.id, worker.id))
    .returning();

  res.json({
    id: updated.id,
    userId: updated.userId,
    categoryId: updated.categoryId,
    description: updated.description,
    skills: updated.skills,
    hourlyRate: updated.hourlyRate,
    rating: updated.rating,
    reviewCount: updated.reviewCount,
    isAvailable: updated.isAvailable,
    isVerified: updated.isVerified,
    isPremium: updated.isPremium,
    verificationStatus: updated.verificationStatus,
    state: updated.state,
    city: updated.city,
    lat: updated.lat,
    lng: updated.lng,
    completedJobs: updated.completedJobs,
    earnings: updated.earnings,
  });
});

router.get("/workers/:workerId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const workerId = parseInt(rawId, 10);

  const [result] = await db
    .select({
      worker: workersTable,
      user: usersTable,
      category: categoriesTable,
    })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .leftJoin(categoriesTable, eq(workersTable.categoryId, categoriesTable.id))
    .where(eq(workersTable.id, workerId));

  if (!result) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  // Calculate average response time in minutes (createdAt → acceptedAt)
  const responseTimesRaw = await db
    .select({
      createdAt: bookingsTable.createdAt,
      acceptedAt: bookingsTable.acceptedAt,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.workerId, workerId),
        isNotNull(bookingsTable.acceptedAt),
      )
    );

  let avgResponseMinutes: number | null = null;
  if (responseTimesRaw.length > 0) {
    const totalMinutes = responseTimesRaw.reduce((sum, b) => {
      if (!b.acceptedAt || !b.createdAt) return sum;
      const diffMs = new Date(b.acceptedAt).getTime() - new Date(b.createdAt).getTime();
      return sum + diffMs / 60000;
    }, 0);
    avgResponseMinutes = Math.round(totalMinutes / responseTimesRaw.length);
  }

  res.json({
    ...formatWorkerResponse(result, null),
    avgResponseMinutes,
  });
});

export default router;
