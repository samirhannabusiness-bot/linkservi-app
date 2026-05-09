import { Router } from "express";
import { db, storesTable, productsTable, productOrdersTable, usersTable, storeWithdrawalsTable, productRatingsTable, businessManagersTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { authenticate, requireRole, requireVerifiedEmail, userHasStoreAccess } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { createNotification } from "../notifications";
import { getCohostCommissionRate } from "./cohost-plans";
import { normalizeProduct } from "../../lib/normalize";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getStoreWithOwnership(storeId: number, cohostId: number) {
  const [store] = await db.select().from(storesTable).where(
    and(eq(storesTable.id, storeId), eq(storesTable.coHostId, cohostId))
  );
  return store ?? null;
}

async function buildStoreStats(storeId: number) {
  const products = await db
    .select({ id: productsTable.id, priceUsd: productsTable.priceUsd, stock: productsTable.stock, isActive: productsTable.isActive })
    .from(productsTable)
    .where(eq(productsTable.storeId, storeId));

  const productIds = products.map(p => p.id);

  let orderStats = { total: 0, pending: 0, payment_pending: 0, payment_confirmed: 0, dispatched: 0, delivered: 0, cancelled: 0, accepted: 0 };
  let totalRevenue = 0;
  let storeEarnings = 0;

  if (productIds.length > 0) {
    const orders = await db
      .select({
        status: productOrdersTable.status,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        storeEarningsAmt: productOrdersTable.storeEarningsAmt,
      })
      .from(productOrdersTable)
      .where(inArray(productOrdersTable.productId, productIds));

    orderStats.total = orders.length;
    for (const o of orders) {
      const s = o.status as keyof typeof orderStats;
      if (s in orderStats) orderStats[s]++;
      if (o.status === "delivered") {
        totalRevenue += o.priceUsdAtMoment ?? 0;
        storeEarnings += o.storeEarningsAmt ?? 0;
      }
    }
  }

  return {
    productCount: products.length,
    activeProductCount: products.filter(p => p.isActive).length,
    orderStats,
    totalRevenueUsd: +totalRevenue.toFixed(2),
    storeEarningsUsd: +storeEarnings.toFixed(2),
  };
}

// ── Public: list all active stores (any logged-in user) ─────────────────────
router.get("/public/stores", authenticate, async (req, res): Promise<void> => {
  try {
    const stores = await db
      .select({
        id: storesTable.id,
        name: storesTable.name,
        description: storesTable.description,
        logoUrl: storesTable.logoUrl,
        ownerName: storesTable.ownerName,
        coHostId: storesTable.coHostId,
        coHostName: usersTable.name,
        isActive: storesTable.isActive,
        createdAt: storesTable.createdAt,
        avgStoreRating: sql<number | null>`(select avg(pr.store_rating) from product_ratings pr where pr.store_id = ${storesTable.id})`,
        countStoreRatings: sql<number>`(select count(*) from product_ratings pr where pr.store_id = ${storesTable.id} and pr.store_rating is not null)`,
        productCount: sql<number>`(select count(*) from products p where p.store_id = ${storesTable.id})`,
      })
      .from(storesTable)
      .leftJoin(usersTable, eq(storesTable.coHostId, usersTable.id))
      .where(eq(storesTable.isActive, true));
    res.json(stores);
  } catch (err) {
    logger.error({ err }, "Failed to list public stores");
    res.status(500).json({ error: "Error al listar tiendas" });
  }
});

// ── Public: get single store + its products ──────────────────────────────────
router.get("/public/stores/:id", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [store] = await db
      .select({
        id: storesTable.id,
        name: storesTable.name,
        description: storesTable.description,
        logoUrl: storesTable.logoUrl,
        ownerName: storesTable.ownerName,
        ownerPhone: storesTable.ownerPhone,
        coHostId: storesTable.coHostId,
        coHostName: usersTable.name,
        isActive: storesTable.isActive,
        createdAt: storesTable.createdAt,
        tagline: storesTable.tagline,
        whatsapp: storesTable.whatsapp,
        instagram: storesTable.instagram,
        city: storesTable.city,
        accentColor: storesTable.accentColor,
        promoText: storesTable.promoText,
        bannerUrl: storesTable.bannerUrl,
        theme: storesTable.theme,
        builderConfig: storesTable.builderConfig,
        avgStoreRating: sql<number | null>`(select avg(pr.store_rating) from product_ratings pr where pr.store_id = ${storesTable.id})`,
        countStoreRatings: sql<number>`(select count(*) from product_ratings pr where pr.store_id = ${storesTable.id} and pr.store_rating is not null)`,
      })
      .from(storesTable)
      .leftJoin(usersTable, eq(storesTable.coHostId, usersTable.id))
      .where(and(eq(storesTable.id, id), eq(storesTable.isActive, true)));

    if (!store) { res.status(404).json({ error: "Tienda no encontrada" }); return; }

    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        priceUsd: productsTable.priceUsd,
        image: productsTable.image,
        category: productsTable.category,
        condition: productsTable.condition,
        hasDelivery: productsTable.hasDelivery,
        latitude: productsTable.latitude,
        longitude: productsTable.longitude,
        stock: productsTable.stock,
        isActive: productsTable.isActive,
        createdAt: productsTable.createdAt,
        avgProductRating: sql<number | null>`(select avg(pr.product_rating) from product_ratings pr where pr.product_id = ${productsTable.id})`,
        countProductRatings: sql<number>`(select count(*) from product_ratings pr where pr.product_id = ${productsTable.id})`,
      })
      .from(productsTable)
      .where(and(eq(productsTable.storeId, id), eq(productsTable.isActive, true)));

    res.json({ ...store, products });
  } catch (err) {
    logger.error({ err }, "Failed to get public store");
    res.status(500).json({ error: "Error al obtener tienda" });
  }
});

// ── Co-host / Worker: list my stores ─────────────────────────────────────────
router.get("/stores", authenticate, requireRole("cohost", "seller", "worker", "admin", "gestor"), async (req, res): Promise<void> => {
  try {
    if (req.user!.role === "admin") {
      const rows = await db.select().from(storesTable);
      res.json(rows);
      return;
    }
    // Owner stores
    const ownedRows = await db.select().from(storesTable).where(eq(storesTable.coHostId, req.user!.id));
    // Stores where the user is an active manager
    const managedIdsRows = await db
      .select({ storeId: businessManagersTable.storeId })
      .from(businessManagersTable)
      .where(and(
        eq(businessManagersTable.userId, req.user!.id),
        eq(businessManagersTable.status, "active"),
      ));
    const managedIds = managedIdsRows.map(r => r.storeId).filter(Boolean) as number[];
    const managedRows = managedIds.length > 0
      ? await db.select().from(storesTable).where(inArray(storesTable.id, managedIds))
      : [];
    // Merge unique by id, then redact sensitive fields on stores the caller doesn't own
    const myUid = req.user!.id;
    const seen = new Set<number>();
    const merged = [...ownedRows, ...managedRows].filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    }).map(s => {
      if (s.coHostId === myUid) return s;
      // Manager-only access: hide payment/financial/owner-PII fields
      return { ...s, paymentDetails: null, ownerCedula: null, balanceUsd: 0 };
    });
    res.json(merged);
  } catch (err) {
    logger.error({ err }, "Failed to list stores");
    res.status(500).json({ error: "Error al listar tiendas" });
  }
});

// ── Co-host / Worker: create store ───────────────────────────────────────────
router.post("/stores", authenticate, requireRole("cohost", "seller", "worker", "admin"), requireVerifiedEmail, async (req, res): Promise<void> => {
  try {
    const {
      name, description, logoUrl, ownerName, ownerPhone, ownerCedula,
      paymentMethod, paymentDetails,
      tagline, city, accentColor, promoText, bannerUrl, theme, builderConfig,
    } = req.body;

    if (!name?.trim()) { res.status(400).json({ error: "El nombre de la tienda es requerido" }); return; }
    if (!ownerName?.trim()) { res.status(400).json({ error: "El nombre del dueño es requerido" }); return; }

    // Auto-compute cohost commission based on plan + monthly volume (frontend value ignored)
    const [userRecord] = await db.select({
      cohostPlan: usersTable.cohostPlan,
      cohostMonthlyVolumeUsd: usersTable.cohostMonthlyVolumeUsd,
    }).from(usersTable).where(eq(usersTable.id, req.user!.id));
    const autoRate = getCohostCommissionRate(userRecord?.cohostPlan ?? "free", userRecord?.cohostMonthlyVolumeUsd ?? 0);
    const autoCommissionPct = +(autoRate * 100).toFixed(2);

    const [store] = await db.insert(storesTable).values({
      name: name.trim(),
      description: description?.trim() ?? null,
      logoUrl: logoUrl ?? null,
      ownerName: ownerName.trim(),
      ownerPhone: ownerPhone?.trim() ?? null,
      ownerCedula: ownerCedula?.trim() ?? null,
      coHostId: req.user!.id,
      platformCommissionPct: 10,
      cohostCommissionPct: autoCommissionPct,
      paymentMethod: paymentMethod ?? null,
      paymentDetails: paymentDetails ? JSON.stringify(paymentDetails) : null,
      tagline: tagline?.trim() ?? null,
      city: city?.trim() ?? null,
      accentColor: accentColor?.trim() ?? null,
      promoText: promoText?.trim() ?? null,
      bannerUrl: bannerUrl ?? null,
      theme: theme?.trim() ?? "moderno",
      builderConfig: builderConfig ? JSON.stringify(builderConfig) : null,
    }).returning();

    res.status(201).json(store);
  } catch (err) {
    logger.error({ err }, "Failed to create store");
    res.status(500).json({ error: "Error al crear tienda" });
  }
});

// ── Co-host / Admin / Manager: get store by id ───────────────────────────────
router.get("/stores/:id", authenticate, requireRole("cohost", "seller", "worker", "admin", "gestor"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, id));
    if (!store) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    const ok = await userHasStoreAccess(req.user!.id, req.user!.role, id);
    if (!ok) { res.status(403).json({ error: "No autorizado" }); return; }
    const isOwnerOrAdmin = req.user!.role === "admin" || store.coHostId === req.user!.id;

    // Resolve effective permissions for this caller on this store. Owners /
    // admins implicitly hold every permission; managers carry an explicit JSON.
    let effectivePermissions = {
      canChat: true,
      canManageOrders: true,
      canManageProducts: true,
      canManageServices: true,
    };
    if (!isOwnerOrAdmin) {
      const [mgr] = await db
        .select({ permissions: businessManagersTable.permissions })
        .from(businessManagersTable)
        .where(and(
          eq(businessManagersTable.storeId, id),
          eq(businessManagersTable.userId, req.user!.id),
          eq(businessManagersTable.status, "active"),
        ));
      let parsed: any = {};
      try { parsed = mgr?.permissions ? JSON.parse(mgr.permissions as any) : {}; } catch { parsed = {}; }
      effectivePermissions = {
        canChat: !!parsed.canChat,
        canManageOrders: !!parsed.canManageOrders,
        canManageProducts: !!parsed.canManageProducts,
        canManageServices: !!parsed.canManageServices,
      };
    }

    const stats = await buildStoreStats(id);
    const payload: any = { ...store, ...stats };
    if (!isOwnerOrAdmin) {
      payload.paymentDetails = null;
      payload.ownerCedula = null;
      payload.balanceUsd = 0;
    }
    // Managers without canManageOrders must not see commercial metrics.
    if (!isOwnerOrAdmin && !effectivePermissions.canManageOrders) {
      payload.orderStats = { total: 0, pending: 0, payment_pending: 0, payment_confirmed: 0, dispatched: 0, delivered: 0, cancelled: 0, accepted: 0 };
      payload.totalRevenueUsd = 0;
      payload.storeEarningsUsd = 0;
    }
    // Surface the caller's effective permissions so the UI can gate actions.
    payload._userPermissions = effectivePermissions;
    payload._isOwner = isOwnerOrAdmin;
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Failed to get store");
    res.status(500).json({ error: "Error al obtener tienda" });
  }
});

// ── Co-host: update store ─────────────────────────────────────────────────────
router.put("/stores/:id", authenticate, requireRole("cohost", "seller", "worker", "admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (req.user!.role !== "admin") {
      const store = await getStoreWithOwnership(id, req.user!.id);
      if (!store) { res.status(404).json({ error: "Tienda no encontrada o no autorizada" }); return; }
    }

    const {
      name, description, logoUrl, ownerName, ownerPhone, ownerCedula,
      platformCommissionPct,
      paymentMethod, paymentDetails, isActive,
      tagline, whatsapp, instagram, city, accentColor, promoText, bannerUrl, theme, builderConfig,
    } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() ?? null;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (ownerName !== undefined) updateData.ownerName = ownerName.trim();
    if (ownerPhone !== undefined) updateData.ownerPhone = ownerPhone?.trim() ?? null;
    if (ownerCedula !== undefined) updateData.ownerCedula = ownerCedula?.trim() ?? null;
    if (platformCommissionPct !== undefined && req.user!.role === "admin") updateData.platformCommissionPct = +platformCommissionPct;
    // Auto-recalculate cohost commission (ignore any frontend value)
    if (req.user!.role !== "admin") {
      const [userRecord] = await db.select({
        cohostPlan: usersTable.cohostPlan,
        cohostMonthlyVolumeUsd: usersTable.cohostMonthlyVolumeUsd,
      }).from(usersTable).where(eq(usersTable.id, req.user!.id));
      const autoRate = getCohostCommissionRate(userRecord?.cohostPlan ?? "free", userRecord?.cohostMonthlyVolumeUsd ?? 0);
      updateData.cohostCommissionPct = +(autoRate * 100).toFixed(2);
    }
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (paymentDetails !== undefined) updateData.paymentDetails = JSON.stringify(paymentDetails);
    if (isActive !== undefined && req.user!.role === "admin") updateData.isActive = isActive;
    // Marketing fields
    if (tagline !== undefined) updateData.tagline = tagline?.trim() ?? null;
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp?.trim() ?? null;
    if (instagram !== undefined) updateData.instagram = instagram?.replace(/^@/, "").trim() ?? null;
    if (city !== undefined) updateData.city = city?.trim() ?? null;
    if (accentColor !== undefined) updateData.accentColor = accentColor?.trim() ?? null;
    if (promoText !== undefined) updateData.promoText = promoText?.trim() ?? null;
    if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl ?? null;
    if (theme !== undefined) updateData.theme = theme?.trim() ?? null;
    if (builderConfig !== undefined) updateData.builderConfig = builderConfig ? JSON.stringify(builderConfig) : null;

    const [updated] = await db.update(storesTable).set(updateData).where(eq(storesTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update store");
    res.status(500).json({ error: "Error al actualizar tienda" });
  }
});

// ── Co-host: get store stats (dashboard) ─────────────────────────────────────
router.get("/stores/:id/stats", authenticate, requireRole("cohost", "seller", "worker", "admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, id));
    if (!store) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    if (req.user!.role !== "admin" && store.coHostId !== req.user!.id) {
      res.status(403).json({ error: "No autorizado" }); return;
    }
    const stats = await buildStoreStats(id);
    res.json({ balanceUsd: store.balanceUsd, ...stats });
  } catch (err) {
    logger.error({ err }, "Failed to get store stats");
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// ── Co-host / Manager: get store products ────────────────────────────────────
router.get("/stores/:id/products", authenticate, requireRole("cohost", "seller", "worker", "admin", "gestor"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, id));
    if (!store) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    const ok = await userHasStoreAccess(req.user!.id, req.user!.role, id);
    if (!ok) { res.status(403).json({ error: "No autorizado" }); return; }
    const products = await db.select().from(productsTable).where(eq(productsTable.storeId, id));
    res.json(products.map(normalizeProduct));
  } catch (err) {
    logger.error({ err }, "Failed to get store products");
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

// ── Co-host / Manager: get store orders ──────────────────────────────────────
router.get("/stores/:id/orders", authenticate, requireRole("cohost", "seller", "worker", "admin", "gestor"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, id));
    if (!store) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    const ok = await userHasStoreAccess(req.user!.id, req.user!.role, id, "canManageOrders");
    if (!ok) { res.status(403).json({ error: "No autorizado para ver pedidos de este negocio" }); return; }

    const products = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.storeId, id));
    if (products.length === 0) { res.json([]); return; }

    const productIds = products.map(p => p.id);
    const orders = await db
      .select({
        id: productOrdersTable.id,
        status: productOrdersTable.status,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        bcvRateAtMoment: productOrdersTable.bcvRateAtMoment,
        storeEarningsAmt: productOrdersTable.storeEarningsAmt,
        platformCommissionAmt: productOrdersTable.platformCommissionAmt,
        cohostCommissionAmt: productOrdersTable.cohostCommissionAmt,
        notes: productOrdersTable.notes,
        deliveryAddress: productOrdersTable.deliveryAddress,
        createdAt: productOrdersTable.createdAt,
        productId: productsTable.id,
        productName: productsTable.name,
        clientId: usersTable.id,
        clientName: usersTable.name,
        clientPhone: usersTable.phone,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .leftJoin(usersTable, eq(productOrdersTable.clientId, usersTable.id))
      .where(inArray(productOrdersTable.productId, productIds))
      .orderBy(productOrdersTable.createdAt);

    res.json(orders.reverse());
  } catch (err) {
    logger.error({ err }, "Failed to get store orders");
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// ── Co-host / Worker: request store balance withdrawal ────────────────────────
router.post("/stores/:id/request-withdrawal", authenticate, requireRole("cohost", "seller", "worker", "admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const store = req.user!.role === "admin"
      ? (await db.select().from(storesTable).where(eq(storesTable.id, id)))[0]
      : await getStoreWithOwnership(id, req.user!.id);

    if (!store) { res.status(404).json({ error: "Tienda no encontrada o no autorizada" }); return; }
    if (store.balanceUsd <= 0) { res.status(400).json({ error: "No hay saldo disponible para retirar" }); return; }

    const amount = store.balanceUsd;

    // Reserve balance → set to 0 while admin processes
    await db.update(storesTable).set({ balanceUsd: 0 }).where(eq(storesTable.id, id));

    // Create withdrawal record so admin can see and process it
    const [withdrawal] = await db.insert(storeWithdrawalsTable).values({
      storeId: id,
      requestedByUserId: req.user!.id,
      amount,
      paymentMethod: store.paymentMethod ?? "pendiente",
      paymentDetails: store.paymentDetails ?? "{}",
      status: "pending",
    }).returning();

    // Notify the requester
    try {
      await createNotification(
        req.user!.id,
        "withdrawal_requested",
        "💸 Solicitud de retiro enviada",
        `Tu solicitud de retiro por $${amount.toFixed(2)} de la tienda "${store.name}" está pendiente de aprobación.`,
        undefined,
        req.user!.role as any
      );
    } catch {}

    // Notify all admins
    try {
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
      for (const admin of admins) {
        await createNotification(
          admin.id,
          "store_withdrawal_requested",
          "🏪 Nuevo retiro de tienda",
          `La tienda "${store.name}" solicitó un retiro de $${amount.toFixed(2)}. Revisa en el panel de retiros.`,
          undefined,
          "admin"
        );
      }
    } catch {}

    res.json({
      message: "Solicitud de retiro registrada. El administrador procesará el pago.",
      withdrawalId: withdrawal.id,
      amount,
      paymentMethod: store.paymentMethod,
      paymentDetails: store.paymentDetails ? JSON.parse(store.paymentDetails) : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to request withdrawal for store");
    res.status(500).json({ error: "Error al solicitar retiro" });
  }
});

// ── Admin: list store withdrawal requests ─────────────────────────────────────
router.get("/admin/store-withdrawals", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: storeWithdrawalsTable.id,
        storeId: storeWithdrawalsTable.storeId,
        storeName: storesTable.name,
        ownerName: storesTable.ownerName,
        requestedByUserId: storeWithdrawalsTable.requestedByUserId,
        requesterName: usersTable.name,
        requesterEmail: usersTable.email,
        requesterRole: usersTable.role,
        requesterPhone: usersTable.phone,
        amount: storeWithdrawalsTable.amount,
        paymentMethod: storeWithdrawalsTable.paymentMethod,
        paymentDetails: storeWithdrawalsTable.paymentDetails,
        status: storeWithdrawalsTable.status,
        adminNotes: storeWithdrawalsTable.adminNotes,
        createdAt: storeWithdrawalsTable.createdAt,
      })
      .from(storeWithdrawalsTable)
      .innerJoin(storesTable, eq(storeWithdrawalsTable.storeId, storesTable.id))
      .innerJoin(usersTable, eq(storeWithdrawalsTable.requestedByUserId, usersTable.id))
      .orderBy(storeWithdrawalsTable.createdAt);

    res.json(rows.reverse().map(r => ({
      ...r,
      paymentDetails: (() => { try { return JSON.parse(r.paymentDetails); } catch { return {}; } })(),
    })));
  } catch (err) {
    logger.error({ err }, "Failed to list store withdrawals");
    res.status(500).json({ error: "Error al listar retiros de tiendas" });
  }
});

// ── Admin: approve store withdrawal ──────────────────────────────────────────
router.post("/admin/store-withdrawals/:id/approve", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [w] = await db.select().from(storeWithdrawalsTable).where(eq(storeWithdrawalsTable.id, id));
    if (!w) { res.status(404).json({ error: "Retiro no encontrado" }); return; }
    if (w.status !== "pending") { res.status(400).json({ error: "Este retiro ya fue procesado" }); return; }

    const [updated] = await db.update(storeWithdrawalsTable)
      .set({ status: "approved", adminNotes: req.body?.notes ?? null })
      .where(eq(storeWithdrawalsTable.id, id))
      .returning();

    // Get store name for notification
    const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, w.storeId));

    try {
      await createNotification(
        w.requestedByUserId,
        "withdrawal_approved",
        "✅ Retiro de tienda aprobado",
        `El retiro de $${w.amount.toFixed(2)} de la tienda "${store?.name}" fue aprobado. Recibirás el pago en breve.`,
        undefined,
        "cohost"
      );
    } catch {}

    res.json({ ...updated, paymentDetails: (() => { try { return JSON.parse(updated.paymentDetails); } catch { return {}; } })() });
  } catch (err) {
    logger.error({ err }, "Failed to approve store withdrawal");
    res.status(500).json({ error: "Error al aprobar retiro" });
  }
});

// ── Admin: reject store withdrawal ────────────────────────────────────────────
router.post("/admin/store-withdrawals/:id/reject", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [w] = await db.select().from(storeWithdrawalsTable).where(eq(storeWithdrawalsTable.id, id));
    if (!w) { res.status(404).json({ error: "Retiro no encontrado" }); return; }
    if (!["pending", "approved"].includes(w.status)) { res.status(400).json({ error: "No se puede rechazar este retiro" }); return; }

    const [updated] = await db.update(storeWithdrawalsTable)
      .set({ status: "rejected", adminNotes: req.body?.notes ?? null })
      .where(eq(storeWithdrawalsTable.id, id))
      .returning();

    // Restore store balance
    await db.update(storesTable)
      .set({ balanceUsd: sql`${storesTable.balanceUsd} + ${w.amount}` })
      .where(eq(storesTable.id, w.storeId));

    const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, w.storeId));

    try {
      const reason = req.body?.notes ? ` Motivo: ${req.body.notes}` : "";
      await createNotification(
        w.requestedByUserId,
        "withdrawal_rejected",
        "❌ Retiro de tienda rechazado — saldo restaurado",
        `El retiro de $${w.amount.toFixed(2)} de la tienda "${store?.name}" fue rechazado.${reason} El saldo fue devuelto.`,
        undefined,
        "cohost"
      );
    } catch {}

    res.json({ ...updated, paymentDetails: (() => { try { return JSON.parse(updated.paymentDetails); } catch { return {}; } })() });
  } catch (err) {
    logger.error({ err }, "Failed to reject store withdrawal");
    res.status(500).json({ error: "Error al rechazar retiro" });
  }
});

// ── Admin: mark store withdrawal as paid ─────────────────────────────────────
router.post("/admin/store-withdrawals/:id/mark-paid", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [w] = await db.select().from(storeWithdrawalsTable).where(eq(storeWithdrawalsTable.id, id));
    if (!w) { res.status(404).json({ error: "Retiro no encontrado" }); return; }
    if (w.status !== "approved") { res.status(400).json({ error: "Solo se pueden marcar como pagados los retiros aprobados" }); return; }

    const [updated] = await db.update(storeWithdrawalsTable)
      .set({ status: "paid", adminNotes: req.body?.notes ?? w.adminNotes })
      .where(eq(storeWithdrawalsTable.id, id))
      .returning();

    const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, w.storeId));

    try {
      await createNotification(
        w.requestedByUserId,
        "withdrawal_paid",
        "💰 ¡Retiro de tienda pagado!",
        `El retiro de $${w.amount.toFixed(2)} de la tienda "${store?.name}" ha sido enviado. Revisa tu cuenta.`,
        undefined,
        "cohost"
      );
    } catch {}

    res.json({ ...updated, paymentDetails: (() => { try { return JSON.parse(updated.paymentDetails); } catch { return {}; } })() });
  } catch (err) {
    logger.error({ err }, "Failed to mark store withdrawal as paid");
    res.status(500).json({ error: "Error al marcar como pagado" });
  }
});

// ── Admin: list all stores ────────────────────────────────────────────────────
router.get("/admin/stores", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const stores = await db
      .select({
        id: storesTable.id,
        name: storesTable.name,
        ownerName: storesTable.ownerName,
        coHostId: storesTable.coHostId,
        coHostName: usersTable.name,
        balanceUsd: storesTable.balanceUsd,
        platformCommissionPct: storesTable.platformCommissionPct,
        cohostCommissionPct: storesTable.cohostCommissionPct,
        isActive: storesTable.isActive,
        createdAt: storesTable.createdAt,
        paymentMethod: storesTable.paymentMethod,
      })
      .from(storesTable)
      .leftJoin(usersTable, eq(storesTable.coHostId, usersTable.id))
      .orderBy(storesTable.createdAt);
    res.json(stores.reverse());
  } catch (err) {
    logger.error({ err }, "Failed to list all stores for admin");
    res.status(500).json({ error: "Error al listar tiendas" });
  }
});

// ── Admin: update store commissions ──────────────────────────────────────────
router.patch("/admin/stores/:id/commissions", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { platformCommissionPct, cohostCommissionPct } = req.body;
    const [updated] = await db.update(storesTable).set({
      platformCommissionPct: platformCommissionPct != null ? +platformCommissionPct : undefined,
      cohostCommissionPct: cohostCommissionPct != null ? +cohostCommissionPct : undefined,
    }).where(eq(storesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update commissions");
    res.status(500).json({ error: "Error al actualizar comisiones" });
  }
});

export default router;
