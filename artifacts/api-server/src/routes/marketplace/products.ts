import { Router } from "express";
import { db, productsTable, usersTable, storesTable, productRatingsTable, workersTable, userVerificationsTable, productPremiumRequestsTable } from "@workspace/db";
import { eq, and, or, ilike, gte, lte, sql, desc, asc } from "drizzle-orm";
import { authenticate, requireRole, userHasStoreAccess } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { sendProductPremiumPaymentAlert } from "../../lib/email";
import { normalizeProduct } from "../../lib/normalize";

// FASE 1 backend perf — agregación pre-calculada de ratings por producto.
// Reemplaza las dos subqueries correlacionadas (avg + count por fila) por
// una única lectura agrupada de product_ratings que luego se LEFT JOIN-ea.
// Reduce de O(N) sub-lookups a O(1) escaneo agregado del lado de Postgres.
const ratingAggSubquery = db
  .select({
    productId: productRatingsTable.productId,
    avg: sql<number>`avg(${productRatingsTable.productRating})`.as("avg_val"),
    cnt: sql<number>`count(*)`.as("cnt_val"),
  })
  .from(productRatingsTable)
  .groupBy(productRatingsTable.productId)
  .as("rating_agg");

// Sub-query usada por el endpoint de detalle individual (/products/:id).
// Para una sola fila la subquery correlacionada es perfectamente eficiente,
// así que mantenemos la versión inline allí.

const router = Router();

// ── List products (public, sorted by proximity if lat/lng provided) ──────────
//
// FASE 1 backend perf:
//   T001 — Paginación SOFT compatible: sin ?page → modo legacy (devuelve TODO).
//          Si llega ?page, aplicamos LIMIT/OFFSET reales.
//   T002 — JOIN+GROUP BY con `rating_agg` en lugar de subqueries N+1.
//   T003 — Ranking calculado en SQL (ORDER BY) en vez de en JavaScript.
//          El boost premium del 10% se aplica sólo a premiums NO expirados.
//
// El formato de respuesta NO cambia: sigue siendo un array plano de productos.
router.get("/products", async (req, res): Promise<void> => {
  try {
    const {
      lat, lng, category, type, page, limit,
      // FASE 2 T008 — filtros antes en JS, ahora server-side:
      q,            // texto libre (name + description + storeName)
      priceMin,     // USD float
      priceMax,     // USD float
      delivery,     // "true" / "false"
      condition,    // "new" / "used"
      minRating,    // 0..5 — usa rating_agg.avg
      subType,      // depende de `type`: rental_type o product_type
      sort,         // "default" | "nearest" | "price_asc" | "price_desc" | "rating" | "newest"
    } = req.query;

    const conditions = [eq(productsTable.isActive, true)];
    if (category && typeof category === "string") {
      conditions.push(eq(productsTable.category, category));
    }
    if (type === "rental") {
      conditions.push(eq(productsTable.listingType, "rental"));
    } else if (type === "sale") {
      conditions.push(eq(productsTable.listingType, "sale"));
    }

    // ── T008: full-text-ish search (case-insensitive) ────────────────────────
    // Replica el search del frontend (name + description + category + storeName)
    // pero usando ILIKE en Postgres. Para ~miles de filas es perfectamente
    // razonable; si en el futuro escala a millones convendría agregar un GIN
    // index con tsvector — fuera de scope aquí.
    if (typeof q === "string" && q.trim().length > 0) {
      const needle = `%${q.trim()}%`;
      const searchOr = or(
        ilike(productsTable.name, needle),
        ilike(productsTable.description, needle),
        ilike(productsTable.category, needle),
        ilike(storesTable.name, needle),
      );
      if (searchOr) conditions.push(searchOr);
    }

    // Rango de precio en USD. parseFloat tolera vacío (NaN ⇒ no se aplica).
    const priceMinNum = typeof priceMin === "string" ? parseFloat(priceMin) : NaN;
    const priceMaxNum = typeof priceMax === "string" ? parseFloat(priceMax) : NaN;
    if (Number.isFinite(priceMinNum)) {
      conditions.push(gte(productsTable.priceUsd, priceMinNum));
    }
    if (Number.isFinite(priceMaxNum)) {
      conditions.push(lte(productsTable.priceUsd, priceMaxNum));
    }

    if (delivery === "true") conditions.push(eq(productsTable.hasDelivery, true));
    else if (delivery === "false") conditions.push(eq(productsTable.hasDelivery, false));

    if (condition === "new" || condition === "used") {
      conditions.push(eq(productsTable.condition, condition));
    }

    // Sub-tipo: para rental filtra rental_type, para sale filtra product_type.
    // Tolerante a registros legacy: el frontend antes usaba defaults
    // ("tool" para rental, "general" para sale) cuando el valor venía null;
    // replicamos ese contrato con OR (campo = subType OR (campo IS NULL AND subType=default)).
    if (typeof subType === "string" && subType !== "" && subType !== "all") {
      if (type === "rental") {
        const cond = subType === "tool"
          ? or(eq(productsTable.rentalType, "tool"), sql`${productsTable.rentalType} IS NULL`)
          : eq(productsTable.rentalType, subType);
        if (cond) conditions.push(cond);
      } else if (type === "sale") {
        const cond = subType === "general"
          ? or(eq(productsTable.productType, "general"), sql`${productsTable.productType} IS NULL`)
          : eq(productsTable.productType, subType);
        if (cond) conditions.push(cond);
      }
    }

    // ── T003: scoring expression in SQL ──────────────────────────────────────
    // The "premium boost" multiplies the score by 1.1 ONLY for premium rows
    // whose premiumUntil hasn't passed (so expired premiums don't unfairly
    // outrank others). Match the JS auto-expire applied below to the payload.
    const premiumBoost = sql`CASE WHEN ${productsTable.isPremium} = true
      AND (${productsTable.premiumUntil} IS NULL OR ${productsTable.premiumUntil} > NOW())
      THEN 1.1 ELSE 1.0 END`;

    const ratingPart = sql`(COALESCE(${ratingAggSubquery.avg}, 0) * 15
      + COALESCE(${ratingAggSubquery.cnt}, 0) * 2)`;

    // ── T008: minRating filter (depende del JOIN agregado) ───────────────────
    // Productos sin ratings (avg = NULL) son excluidos cuando minRating > 0,
    // igual que la regla previa del frontend (ratingFor(p)=0 < minRating).
    const minRatingNum = typeof minRating === "string" ? parseFloat(minRating) : NaN;
    if (Number.isFinite(minRatingNum) && minRatingNum > 0) {
      conditions.push(sql`COALESCE(${ratingAggSubquery.avg}, 0) >= ${minRatingNum}`);
    }

    const userLatRaw = typeof lat === "string" ? parseFloat(lat) : NaN;
    const userLngRaw = typeof lng === "string" ? parseFloat(lng) : NaN;
    // Robustez (architect FASE 1): rechazar NaN/Infinity y forzar rango
    // geográfico válido. Coords inválidas ⇒ recency-mode (sin proximidad).
    const hasUserCoords = Number.isFinite(userLatRaw)
      && Number.isFinite(userLngRaw)
      && userLatRaw >= -90 && userLatRaw <= 90
      && userLngRaw >= -180 && userLngRaw <= 180;
    const userLatNum = hasUserCoords ? userLatRaw : 0;
    const userLngNum = hasUserCoords ? userLngRaw : 0;

    // Proximity: 1000 / (1 + distKm) when both lat/lng exist; else 0.
    // Recency: epoch / 1e10 (matches the JS scale used previously).
    // El argumento de ASIN se clampa a [0,1] con LEAST/GREATEST para evitar
    // NaN por errores de redondeo flotante en coords antípodas.
    const scoreSql = hasUserCoords
      ? sql`(
          CASE WHEN ${productsTable.latitude} IS NOT NULL
                AND ${productsTable.longitude} IS NOT NULL
            THEN 1000.0 / (1.0 + (
              6371.0 * 2.0 * ASIN(LEAST(1.0, GREATEST(0.0, SQRT(
                POWER(SIN(RADIANS(${productsTable.latitude} - ${userLatNum}) / 2.0), 2)
                + COS(RADIANS(${userLatNum})) * COS(RADIANS(${productsTable.latitude}))
                  * POWER(SIN(RADIANS(${productsTable.longitude} - ${userLngNum}) / 2.0), 2)
              ))))
            ))
            ELSE 0
          END
          + ${ratingPart}
        ) * ${premiumBoost}`
      : sql`(
          EXTRACT(EPOCH FROM ${productsTable.createdAt}) / 1e10
          + ${ratingPart}
        ) * ${premiumBoost}`;

    // ── T001: soft pagination ────────────────────────────────────────────────
    // The frontend currently never sends ?page, so without it we keep returning
    // ALL matching rows (legacy behavior). When ?page is present we apply real
    // LIMIT/OFFSET. We expose pagination metadata via response headers so
    // future clients can opt-in without changing the JSON body shape.
    const wantsPagination = page !== undefined;
    let pageNum = 1;
    let pageSize = 24;
    if (wantsPagination) {
      const parsedPage = parseInt(String(page), 10);
      if (!isNaN(parsedPage) && parsedPage >= 1) pageNum = parsedPage;
      const parsedLimit = parseInt(String(limit), 10);
      if (!isNaN(parsedLimit) && parsedLimit >= 1) {
        pageSize = Math.min(parsedLimit, 100); // hard cap per request
      }
    }

    const baseQuery = db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        priceUsd: productsTable.priceUsd,
        image: productsTable.image,
        images: productsTable.images,
        category: productsTable.category,
        condition: productsTable.condition,
        hasDelivery: productsTable.hasDelivery,
        latitude: productsTable.latitude,
        longitude: productsTable.longitude,
        stock: productsTable.stock,
        coHostId: productsTable.coHostId,
        coHostName: usersTable.name,
        storeId: productsTable.storeId,
        storeName: storesTable.name,
        createdAt: productsTable.createdAt,
        listingType: productsTable.listingType,
        rentalPricePerDay: productsTable.rentalPricePerDay,
        rentalPricePerWeek: productsTable.rentalPricePerWeek,
        rentalDeposit: productsTable.rentalDeposit,
        rentalRules: productsTable.rentalRules,
        blockedDates: productsTable.blockedDates,
        rentalType: productsTable.rentalType,
        productType: productsTable.productType,
        rentalMetadata: productsTable.rentalMetadata,
        productMetadata: productsTable.productMetadata,
        // T002: avg/cnt provienen del JOIN agregado, ya no de subqueries por fila.
        // Se preserva el contrato anterior: avg puede ser null (sin ratings),
        // count se devuelve como 0 (compatibilidad con la vieja correlated subquery).
        avgProductRating: sql<number | null>`${ratingAggSubquery.avg}`,
        countProductRatings: sql<number>`COALESCE(${ratingAggSubquery.cnt}, 0)`,
        isPremium: productsTable.isPremium,
        premiumUntil: productsTable.premiumUntil,
        viewCount: productsTable.viewCount,
        clickCount: productsTable.clickCount,
      })
      .from(productsTable)
      .leftJoin(usersTable, eq(productsTable.coHostId, usersTable.id))
      .leftJoin(storesTable, eq(productsTable.storeId, storesTable.id))
      .leftJoin(ratingAggSubquery, eq(ratingAggSubquery.productId, productsTable.id))
      .where(and(...conditions))
      // Tiebreaker estable por id: sin esto, productos con score idéntico
      // (típico cuando no hay ratings y no hay coords) pueden aparecer en
      // orden distinto entre páginas y duplicarse / saltarse al paginar.
      // T008: si llega ?sort, override del scoring por el sort explícito.
      .orderBy(...(() => {
        if (sort === "price_asc") return [asc(productsTable.priceUsd), desc(productsTable.id)];
        if (sort === "price_desc") return [desc(productsTable.priceUsd), desc(productsTable.id)];
        if (sort === "rating") {
          return [desc(sql`COALESCE(${ratingAggSubquery.avg}, 0)`), desc(productsTable.id)];
        }
        if (sort === "newest") return [desc(productsTable.createdAt), desc(productsTable.id)];
        if (sort === "nearest" && hasUserCoords) {
          // Distancia haversine ASC: misma fórmula que scoreSql pero sin invertir.
          // Productos sin coordenadas se mandan al final con un valor enorme.
          const distSql = sql`
            CASE WHEN ${productsTable.latitude} IS NOT NULL
                  AND ${productsTable.longitude} IS NOT NULL
              THEN 6371.0 * 2.0 * ASIN(LEAST(1.0, GREATEST(0.0, SQRT(
                POWER(SIN(RADIANS(${productsTable.latitude} - ${userLatNum}) / 2.0), 2)
                + COS(RADIANS(${userLatNum})) * COS(RADIANS(${productsTable.latitude}))
                  * POWER(SIN(RADIANS(${productsTable.longitude} - ${userLngNum}) / 2.0), 2)
              ))))
              ELSE 1e9
            END`;
          return [asc(distSql), desc(productsTable.id)];
        }
        // default → ranking compuesto (premium boost + proximity/recency + rating).
        return [desc(scoreSql), desc(productsTable.id)];
      })());

    const rows = wantsPagination
      ? await baseQuery.limit(pageSize).offset((pageNum - 1) * pageSize)
      : await baseQuery;

    // Auto-expire premium en el payload de respuesta. Esto NO afecta el ranking
    // (que ya lo descontó vía SQL), sólo asegura que el cliente no muestre
    // un badge "Premium" sobre un producto cuya suscripción ya expiró.
    const now = new Date();
    rows.forEach(r => {
      if (r.isPremium && r.premiumUntil && new Date(r.premiumUntil) < now) {
        r.isPremium = false;
      }
    });

    if (wantsPagination) {
      // Headers opt-in de paginación. NO cambian el body — los clientes legacy
      // los ignoran. Clientes nuevos pueden leerlos para construir la UI de paginas.
      res.setHeader("X-Page", String(pageNum));
      res.setHeader("X-Page-Size", String(pageSize));
      res.setHeader("X-Has-More", rows.length === pageSize ? "true" : "false");
    }

    res.json(rows.map(normalizeProduct));
  } catch (err) {
    logger.error({ err }, "Failed to list products");
    res.status(500).json({ error: "Error al listar productos" });
  }
});

// ── Trial status (must be BEFORE /products/:id to avoid param clash) ─────────
router.get("/products/trial-status", authenticate, requireRole("cohost", "seller", "admin"), async (req, res): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const existing = await db.select({ id: productPremiumRequestsTable.id })
      .from(productPremiumRequestsTable)
      .where(and(eq(productPremiumRequestsTable.coHostId, userId), eq(productPremiumRequestsTable.pagoMovilRef, "TRIAL-FREE")));
    res.json({ used: existing.length > 0 });
  } catch (err) {
    logger.error({ err }, "Failed to get trial status");
    res.status(500).json({ error: "Error" });
  }
});

// ── Get single product ───────────────────────────────────────────────────────
router.get("/products/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        priceUsd: productsTable.priceUsd,
        image: productsTable.image,
        images: productsTable.images,
        category: productsTable.category,
        condition: productsTable.condition,
        hasDelivery: productsTable.hasDelivery,
        latitude: productsTable.latitude,
        longitude: productsTable.longitude,
        isActive: productsTable.isActive,
        coHostId: productsTable.coHostId,
        coHostName: usersTable.name,
        storeId: productsTable.storeId,
        createdAt: productsTable.createdAt,
        listingType: productsTable.listingType,
        rentalPricePerDay: productsTable.rentalPricePerDay,
        rentalPricePerWeek: productsTable.rentalPricePerWeek,
        rentalDeposit: productsTable.rentalDeposit,
        rentalRules: productsTable.rentalRules,
        blockedDates: productsTable.blockedDates,
        rentalType: productsTable.rentalType,
        productType: productsTable.productType,
        rentalMetadata: productsTable.rentalMetadata,
        productMetadata: productsTable.productMetadata,
        avgProductRating: sql<number | null>`(select avg(pr.product_rating) from product_ratings pr where pr.product_id = ${productsTable.id})`,
        countProductRatings: sql<number>`(select count(*) from product_ratings pr where pr.product_id = ${productsTable.id})`,
      })
      .from(productsTable)
      .leftJoin(usersTable, eq(productsTable.coHostId, usersTable.id))
      .where(eq(productsTable.id, id));

    if (!row) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    res.json(normalizeProduct(row));
  } catch (err) {
    logger.error({ err }, "Failed to get product");
    res.status(500).json({ error: "Error al obtener producto" });
  }
});

// ── Create product (cohost / seller / worker / manager / admin) ──────────────
router.post("/products", authenticate, requireRole("cohost", "seller", "admin", "worker", "gestor"), async (req, res): Promise<void> => {
  try {
    // ── KYC gate: sellers and cohosts must be verified before listing products ─
    const actingRole = req.user!.role;
    if (actingRole === "seller" || actingRole === "cohost") {
      const [kyc] = await db
        .select({ status: userVerificationsTable.status })
        .from(userVerificationsTable)
        .where(eq(userVerificationsTable.userId, req.user!.id));
      if (!kyc || kyc.status !== "approved") {
        res.status(403).json({
          error: "Debes verificar tu identidad (KYC) antes de publicar productos en el mercado.",
          kycStatus: kyc?.status ?? "not_submitted",
        });
        return;
      }
    }

    const { name, description, priceUsd, image, images, category, condition, hasDelivery, latitude, longitude, storeId, stock,
      listingType, rentalPricePerDay, rentalPricePerWeek, rentalDeposit, rentalRules, blockedDates,
      rentalType, productType, rentalMetadata, productMetadata } = req.body;
    if (!name || !priceUsd || !category) {
      res.status(400).json({ error: "name, priceUsd y category son requeridos" });
      return;
    }
    if (listingType === "rental" && !rentalPricePerDay) {
      res.status(400).json({ error: "El precio por día es requerido para publicaciones de alquiler" });
      return;
    }
    // Validate images array (max 5, all strings)
    const imagesArr: string[] = Array.isArray(images) ? images.filter((u: any) => typeof u === "string").slice(0, 5) : [];

    // Non-admin users must provide a storeId — products always belong to a store
    if (req.user!.role !== "admin" && !storeId) {
      res.status(400).json({ error: "Debes seleccionar una tienda para el producto" });
      return;
    }

    // ── Resolve store + coHostId BEFORE quota check ──────────────────────────
    // The free-tier limit must be evaluated against the STORE OWNER's product
    // count, not the acting user — otherwise a manager could bypass the cap of
    // a non-premium owner by publishing under their own (empty) identity.
    let resolvedCoHostId = req.user!.id;
    let resolvedStoreId: number | null = storeId ? parseInt(storeId) : null;

    if (resolvedStoreId) {
      const [store] = await db.select().from(storesTable).where(eq(storesTable.id, resolvedStoreId));
      if (!store) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
      // Verify access: owner, admin, or active manager with canManageProducts
      const ok = await userHasStoreAccess(req.user!.id, req.user!.role, resolvedStoreId, "canManageProducts");
      if (!ok) {
        res.status(403).json({ error: "No tienes permiso para agregar productos a esta tienda" }); return;
      }
      resolvedCoHostId = store.coHostId;
    }

    // ── Free-tier product limit (Pilar 4: ServiMarket Limits) ────────────────
    // Evaluate quota against the resolved owner of the products (resolvedCoHostId).
    if (req.user!.role !== "admin") {
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(productsTable)
        .where(and(eq(productsTable.coHostId, resolvedCoHostId), eq(productsTable.isActive, true)));

      if (Number(cnt) >= 5) {
        // Check whether the OWNER (not necessarily the acting user) holds an active premium plan
        const [usr] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedCoHostId));
        const isPremiumCohost =
          usr?.cohostPlan === "premium" &&
          !!usr?.cohostPlanExpiresAt &&
          new Date(usr.cohostPlanExpiresAt) > new Date();

        let isPremiumWorker = false;
        if (usr?.role === "worker") {
          const [wrk] = await db
            .select({ isPremium: workersTable.isPremium, premiumUntil: workersTable.premiumUntil })
            .from(workersTable)
            .where(eq(workersTable.userId, resolvedCoHostId));
          isPremiumWorker =
            !!wrk?.isPremium &&
            !!wrk?.premiumUntil &&
            new Date(wrk.premiumUntil) > new Date();
        }

        if (!isPremiumCohost && !isPremiumWorker) {
          res.status(403).json({
            error: "Has alcanzado el límite de 5 productos activos. Actualiza a Premium para publicar productos ilimitados.",
            code: "PRODUCT_LIMIT_REACHED",
          });
          return;
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const [product] = await db.insert(productsTable).values({
      name,
      description: description ?? null,
      priceUsd: parseFloat(priceUsd),
      image: imagesArr[0] ?? image ?? null,
      images: imagesArr,
      category,
      condition: condition ?? "new",
      hasDelivery: hasDelivery ?? false,
      coHostId: resolvedCoHostId,
      storeId: resolvedStoreId,
      stock: stock != null ? parseInt(stock) : null,
      latitude: latitude != null ? parseFloat(latitude) : null,
      longitude: longitude != null ? parseFloat(longitude) : null,
      isActive: true,
      listingType: listingType === "rental" ? "rental" : "sale",
      rentalPricePerDay: rentalPricePerDay != null ? parseFloat(rentalPricePerDay) : null,
      rentalPricePerWeek: rentalPricePerWeek != null ? parseFloat(rentalPricePerWeek) : null,
      rentalDeposit: rentalDeposit != null ? parseFloat(rentalDeposit) : null,
      rentalRules: rentalRules ?? null,
      blockedDates: Array.isArray(blockedDates) ? blockedDates.filter((d: any) => typeof d === "string") : [],
      rentalType: rentalType ?? "tool",
      productType: productType ?? "general",
      rentalMetadata: rentalMetadata ?? null,
      productMetadata: productMetadata ?? null,
    }).returning();

    // ── Auto-trial: activate 48h Premium on user's very first product ─────────
    let autoTrialActivated = false;
    if (product.listingType === "sale" && req.user!.role !== "admin") {
      try {
        const [{ cnt }] = await db
          .select({ cnt: sql<number>`count(*)` })
          .from(productsTable)
          .where(eq(productsTable.coHostId, req.user!.id));
        if (Number(cnt) === 1) {
          const [trialRow] = await db
            .select({ id: productPremiumRequestsTable.id })
            .from(productPremiumRequestsTable)
            .where(and(
              eq(productPremiumRequestsTable.coHostId, req.user!.id),
              eq(productPremiumRequestsTable.pagoMovilRef, "TRIAL-FREE")
            ));
          if (!trialRow) {
            const trialUntil = new Date();
            trialUntil.setHours(trialUntil.getHours() + 48);
            await Promise.all([
              db.update(productsTable)
                .set({ isPremium: true, premiumUntil: trialUntil })
                .where(eq(productsTable.id, product.id)),
              db.insert(productPremiumRequestsTable).values({
                productId: product.id,
                coHostId:  req.user!.id,
                months: 0,
                amountUsd: 0,
                pagoMovilPhone: "TRIAL",
                pagoMovilRef: "TRIAL-FREE",
                status: "approved",
              }),
            ]);
            autoTrialActivated = true;
          }
        }
      } catch { /* silent — trial is non-critical */ }
    }

    res.status(201).json({ ...normalizeProduct(product), autoTrialActivated });
  } catch (err) {
    logger.error({ err }, "Failed to create product");
    res.status(500).json({ error: "Error al crear producto" });
  }
});

// ── Update product (owner, admin, or manager with canManageProducts) ────────
router.put("/products/:id", authenticate, requireRole("cohost", "seller", "admin", "gestor", "worker"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    if (req.user!.role !== "admin") {
      const isOwner = existing.coHostId === req.user!.id;
      let allowed = isOwner;
      if (!allowed && existing.storeId) {
        allowed = await userHasStoreAccess(req.user!.id, req.user!.role, existing.storeId, "canManageProducts");
      }
      if (!allowed) { res.status(403).json({ error: "No autorizado" }); return; }
    }
    const { name, description, priceUsd, image, images, category, condition, hasDelivery, latitude, longitude, isActive, storeId, stock,
      listingType, rentalPricePerDay, rentalPricePerWeek, rentalDeposit, rentalRules, blockedDates,
      rentalType, productType, rentalMetadata, productMetadata } = req.body;
    // ── Security: if storeId is being changed, revalidate access on the destination store
    if (req.user!.role !== "admin" && storeId !== undefined && storeId !== null) {
      const newStoreId = parseInt(storeId);
      if (Number.isFinite(newStoreId) && newStoreId !== existing.storeId) {
        const okDest = await userHasStoreAccess(req.user!.id, req.user!.role, newStoreId, "canManageProducts");
        if (!okDest) { res.status(403).json({ error: "No autorizado para mover el producto a esa tienda" }); return; }
      }
    }
    const imagesArr: string[] | undefined = Array.isArray(images) ? images.filter((u: any) => typeof u === "string").slice(0, 5) : undefined;
    const [updated] = await db.update(productsTable).set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(priceUsd !== undefined && { priceUsd: parseFloat(priceUsd) }),
      ...(imagesArr !== undefined && { images: imagesArr, image: imagesArr[0] ?? null }),
      ...(imagesArr === undefined && image !== undefined && { image }),
      ...(category !== undefined && { category }),
      ...(condition !== undefined && { condition }),
      ...(hasDelivery !== undefined && { hasDelivery }),
      ...(latitude !== undefined && { latitude: latitude != null ? parseFloat(latitude) : null }),
      ...(longitude !== undefined && { longitude: longitude != null ? parseFloat(longitude) : null }),
      ...(isActive !== undefined && { isActive }),
      ...(storeId !== undefined && { storeId: storeId ? parseInt(storeId) : null }),
      ...(stock !== undefined && { stock: stock != null ? parseInt(stock) : null }),
      ...(listingType !== undefined && { listingType: listingType === "rental" ? "rental" : "sale" }),
      ...(rentalPricePerDay !== undefined && { rentalPricePerDay: rentalPricePerDay != null ? parseFloat(rentalPricePerDay) : null }),
      ...(rentalPricePerWeek !== undefined && { rentalPricePerWeek: rentalPricePerWeek != null ? parseFloat(rentalPricePerWeek) : null }),
      ...(rentalDeposit !== undefined && { rentalDeposit: rentalDeposit != null ? parseFloat(rentalDeposit) : null }),
      ...(rentalRules !== undefined && { rentalRules: rentalRules ?? null }),
      ...(blockedDates !== undefined && { blockedDates: Array.isArray(blockedDates) ? blockedDates.filter((d: any) => typeof d === "string") : [] }),
      ...(rentalType !== undefined && { rentalType }),
      ...(productType !== undefined && { productType }),
      ...(rentalMetadata !== undefined && { rentalMetadata: rentalMetadata ?? null }),
      ...(productMetadata !== undefined && { productMetadata: productMetadata ?? null }),
    }).where(eq(productsTable.id, id)).returning();
    res.json(normalizeProduct(updated));
  } catch (err) {
    logger.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

// ── Delete product (owner, admin, or manager with canManageProducts) ────────
router.delete("/products/:id", authenticate, requireRole("cohost", "seller", "admin", "gestor", "worker"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    if (req.user!.role !== "admin") {
      const isOwner = existing.coHostId === req.user!.id;
      let allowed = isOwner;
      if (!allowed && existing.storeId) {
        allowed = await userHasStoreAccess(req.user!.id, req.user!.role, existing.storeId, "canManageProducts");
      }
      if (!allowed) { res.status(403).json({ error: "No autorizado" }); return; }
    }
    await db.update(productsTable).set({ isActive: false }).where(eq(productsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Error al eliminar producto" });
  }
});

// ── My products (cohost) ─────────────────────────────────────────────────────
router.get("/cohost/products", authenticate, requireRole("cohost", "seller", "admin"), async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.coHostId, req.user!.id));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to list cohost products");
    res.status(500).json({ error: "Error al listar productos" });
  }
});

// ── Track product view (public, fire-and-forget) ──────────────────────────────
router.post("/products/:id/track-view", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      await db
        .update(productsTable)
        .set({ viewCount: sql`${productsTable.viewCount} + 1` })
        .where(eq(productsTable.id, id));
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ── Track product click (public, fire-and-forget) ─────────────────────────────
router.post("/products/:id/track-click", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      await db
        .update(productsTable)
        .set({ clickCount: sql`${productsTable.clickCount} + 1` })
        .where(eq(productsTable.id, id));
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ── Get premium status + stats for my product ─────────────────────────────────
router.get("/products/:id/premium/status", authenticate, requireRole("cohost", "seller", "admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [product] = await db
      .select({
        id: productsTable.id,
        isPremium: productsTable.isPremium,
        premiumUntil: productsTable.premiumUntil,
        viewCount: productsTable.viewCount,
        clickCount: productsTable.clickCount,
        coHostId: productsTable.coHostId,
      })
      .from(productsTable)
      .where(eq(productsTable.id, id));

    if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    if (req.user!.role !== "admin" && product.coHostId !== req.user!.id) {
      res.status(403).json({ error: "No autorizado" }); return;
    }

    // Auto-expire check
    const isActive = product.isPremium && product.premiumUntil && new Date(product.premiumUntil) > new Date();

    // Get latest pending/approved request
    const [latestRequest] = await db
      .select()
      .from(productPremiumRequestsTable)
      .where(eq(productPremiumRequestsTable.productId, id))
      .orderBy(sql`${productPremiumRequestsTable.createdAt} desc`)
      .limit(1);

    res.json({
      isPremium: isActive,
      premiumUntil: product.premiumUntil,
      viewCount: product.viewCount,
      clickCount: product.clickCount,
      pendingRequest: latestRequest?.status === "pending" ? latestRequest : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get premium status");
    res.status(500).json({ error: "Error al obtener estado premium" });
  }
});

// ── Request product premium via Pago Móvil ────────────────────────────────────
router.post("/products/:id/premium/request", authenticate, requireRole("cohost", "seller", "admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) { res.status(404).json({ error: "Producto no encontrado" }); return; }
    if (req.user!.role !== "admin" && product.coHostId !== req.user!.id) {
      res.status(403).json({ error: "No autorizado" }); return;
    }

    const { months, amountUsd, pagoMovilPhone, pagoMovilBank, pagoMovilRef, receiptUrl } = req.body;
    if (!months || !amountUsd || !pagoMovilPhone || !pagoMovilRef) {
      res.status(400).json({ error: "months, amountUsd, pagoMovilPhone y pagoMovilRef son requeridos" });
      return;
    }

    // Prevent duplicate pending requests
    const [existing] = await db
      .select()
      .from(productPremiumRequestsTable)
      .where(and(
        eq(productPremiumRequestsTable.productId, id),
        sql`${productPremiumRequestsTable.status} = 'pending'`
      ));
    if (existing) {
      res.status(400).json({ error: "Ya tienes una solicitud pendiente para este producto" });
      return;
    }

    const [request] = await db.insert(productPremiumRequestsTable).values({
      productId: id,
      coHostId: req.user!.id,
      months: parseInt(months),
      amountUsd: parseFloat(amountUsd),
      pagoMovilPhone,
      pagoMovilBank: pagoMovilBank ?? null,
      pagoMovilRef,
      receiptUrl: receiptUrl ?? null,
      status: "pending",
    }).returning();

    sendProductPremiumPaymentAlert({
      userName: req.user!.name,
      userEmail: req.user!.email,
      userId: req.user!.id,
      productName: product.name,
      productId: product.id,
      months: parseInt(months),
      amountUsd: parseFloat(amountUsd),
      pagoMovilRef,
      pagoMovilPhone,
    }).catch(err => logger.warn({ err, productId: product.id }, "❌ EMAIL FAILED — premium payment alert"));

    res.status(201).json(request);
  } catch (err) {
    logger.error({ err }, "Failed to create product premium request");
    res.status(500).json({ error: "Error al enviar solicitud" });
  }
});

// ── Free 48h premium trial — once per user, sale products only ────────────────
router.post("/products/:id/premium/trial", authenticate, requireRole("cohost", "seller", "admin"), async (req, res): Promise<void> => {
  try {
    const productId = parseInt(req.params.id);
    const userId = (req as any).user.id;

    const [product] = await db.select({
      id: productsTable.id, coHostId: productsTable.coHostId,
      isPremium: productsTable.isPremium, premiumUntil: productsTable.premiumUntil,
      listingType: productsTable.listingType,
    }).from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.coHostId, userId)));

    if (!product) { res.status(403).json({ error: "No autorizado" }); return; }
    if (product.listingType === "rental") { res.status(400).json({ error: "La prueba gratuita es solo para productos de venta" }); return; }

    const now = new Date();
    if (product.isPremium && product.premiumUntil && new Date(product.premiumUntil) > now) {
      res.status(400).json({ error: "Este producto ya tiene Premium activo" }); return;
    }

    const existing = await db.select({ id: productPremiumRequestsTable.id })
      .from(productPremiumRequestsTable)
      .where(and(eq(productPremiumRequestsTable.coHostId, userId), eq(productPremiumRequestsTable.pagoMovilRef, "TRIAL-FREE")));

    if (existing.length > 0) { res.status(409).json({ error: "Ya usaste tu período de prueba gratuita de 48 horas" }); return; }

    const premiumUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    await db.update(productsTable).set({ isPremium: true, premiumUntil }).where(eq(productsTable.id, productId));
    await db.insert(productPremiumRequestsTable).values({
      productId, coHostId: userId, months: 0, amountUsd: 0,
      pagoMovilPhone: "TRIAL", pagoMovilBank: "TRIAL", pagoMovilRef: "TRIAL-FREE",
      status: "approved", adminNotes: "Período de prueba gratuita 48h (activación automática)",
    });

    res.json({ ok: true, premiumUntil: premiumUntil.toISOString() });
  } catch (err) {
    logger.error({ err }, "Failed to activate premium trial");
    res.status(500).json({ error: "Error al activar período de prueba" });
  }
});

export default router;
