import { Router } from "express";
import { db, productOrdersTable, productsTable, usersTable, storesTable, productRatingsTable, businessManagersTable } from "@workspace/db";
import { eq, and, inArray, sql, or } from "drizzle-orm";
import { getCohostCommissionRate } from "./cohost-plans";
import { authenticate, requireRole, requireVerifiedEmail, userHasStoreAccess } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { createNotification } from "../notifications";
import { sendProductOrderEmail } from "../../lib/email";

const router = Router();

// FASE CHECKOUT MODERNO — canonical status mapper.
// Legacy DB statuses still drive logic; canonical strings are exposed in
// API responses (`statusCanonical`) so the new UI can render Amazon-style
// labels without needing a DB migration.
//   pending        → buyer placed order, no proof yet (or rejected)
//   paid           → admin verified payment, escrow funded
//   shipped        → seller marked dispatched
//   delivered      → buyer confirmed reception, funds released
//   released       → alias for delivered (kept for forward compat)
//   cancelled      → cancelled at any step
export function canonicalizeStatus(dbStatus: string): "pending" | "paid" | "shipped" | "delivered" | "released" | "cancelled" {
  switch (dbStatus) {
    case "pending":
    case "accepted":
    case "payment_pending":
      return "pending";
    case "payment_confirmed":
      return "paid";
    case "dispatched":
      return "shipped";
    case "delivered":
      return "delivered";
    case "released":
      return "released";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

// Helper: get current BCV rate from the running server
async function getCurrentBcvRate(): Promise<number> {
  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? 8080}/api/bcv-rate`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 36;
    const data = await res.json() as { rate: number };
    return data.rate ?? 36;
  } catch {
    return 36;
  }
}

// Helper: verify co-host owns the order's product, or is an active manager
// of the order's store with `canManageOrders` permission.
async function getOrderWithOwnership(
  orderId: number,
  userId: number,
  skipOwnershipCheck = false,
  userRole: string = "",
) {
  const [row] = await db
    .select({
      id: productOrdersTable.id,
      coHostId: productsTable.coHostId,
      storeId: productsTable.storeId,
      status: productOrdersTable.status,
      clientId: productOrdersTable.clientId,
      priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
    })
    .from(productOrdersTable)
    .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
    .where(eq(productOrdersTable.id, orderId));
  if (!row) return null;
  if (skipOwnershipCheck) return row;
  if (row.coHostId === userId) return row;
  // Manager fallback: needs an active manager row for the order's store with canManageOrders
  if (row.storeId) {
    const ok = await userHasStoreAccess(userId, userRole, row.storeId, "canManageOrders");
    if (ok) return row;
  }
  return null;
}

// Helper: enrich order for notifications
async function getOrderEnriched(orderId: number) {
  const [row] = await db
    .select({
      id: productOrdersTable.id,
      clientId: productOrdersTable.clientId,
      status: productOrdersTable.status,
      priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
      productName: productsTable.name,
      coHostId: productsTable.coHostId,
      clientName: usersTable.name,
    })
    .from(productOrdersTable)
    .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
    .leftJoin(usersTable, eq(productOrdersTable.clientId, usersTable.id))
    .where(eq(productOrdersTable.id, orderId));
  return row ?? null;
}

// ── Client creates product order ─────────────────────────────────────────────
router.post("/product-orders", authenticate, requireRole("client", "worker", "cohost", "admin"), requireVerifiedEmail, async (req, res): Promise<void> => {
  try {
    const { productId, notes, deliveryAddress } = req.body;
    if (!productId) { res.status(400).json({ error: "productId es requerido" }); return; }
    if (!deliveryAddress) { res.status(400).json({ error: "La dirección de entrega es requerida" }); return; }

    const [product] = await db.select().from(productsTable).where(
      and(eq(productsTable.id, parseInt(productId)), eq(productsTable.isActive, true))
    );
    if (!product) { res.status(404).json({ error: "Producto no encontrado o inactivo" }); return; }

    const bcvRate = await getCurrentBcvRate();

    const [order] = await db.insert(productOrdersTable).values({
      productId: product.id,
      clientId: req.user!.id,
      priceUsdAtMoment: product.priceUsd,
      bcvRateAtMoment: bcvRate,
      status: "pending",
      notes: notes ?? null,
      deliveryAddress,
    }).returning();

    // Notify co-host
    if (product.coHostId) {
      await createNotification(
        product.coHostId,
        "new_product_order",
        "🛍 Nuevo pedido de producto",
        `Tienes un nuevo pedido para "${product.name}". Revísalo y acéptalo.`,
        undefined, undefined,
        `/cohost/orders`,
      );
    }

    // Send emails to buyer + seller
    {
      let sellerEmail: string | null = null;
      let sellerName: string | null = null;
      if (product.coHostId) {
        const [seller] = await db.select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable).where(eq(usersTable.id, product.coHostId));
        sellerEmail = seller?.email ?? null;
        sellerName  = seller?.name  ?? null;
      }
      sendProductOrderEmail({
        buyerEmail:  req.user!.email,
        buyerName:   req.user!.name,
        sellerEmail,
        sellerName,
        productName: product.name,
        priceUsd:    product.priceUsd,
        orderId:     order.id,
      }).catch(err => logger.warn({ err, orderId: order.id }, "❌ EMAIL FAILED — product order notification"));
    }

    res.status(201).json({ ...order, priceBsAtMoment: +(product.priceUsd * bcvRate).toFixed(2) });
  } catch (err) {
    logger.error({ err }, "Failed to create product order");
    res.status(500).json({ error: "Error al crear solicitud" });
  }
});

// ── Client lists their own orders ────────────────────────────────────────────
router.get("/product-orders/mine", authenticate, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: productOrdersTable.id,
        status: productOrdersTable.status,
        groupId: productOrdersTable.groupId,
        quantity: productOrdersTable.quantity,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        bcvRateAtMoment: productOrdersTable.bcvRateAtMoment,
        notes: productOrdersTable.notes,
        deliveryAddress: productOrdersTable.deliveryAddress,
        paymentProofUrl: productOrdersTable.paymentProofUrl,
        paymentMethod: productOrdersTable.paymentMethod,
        paymentAmount: productOrdersTable.paymentAmount,
        paymentReference: productOrdersTable.paymentReference,
        paymentRejectedReason: productOrdersTable.paymentRejectedReason,
        createdAt: productOrdersTable.createdAt,
        updatedAt: productOrdersTable.updatedAt,
        productId: productsTable.id,
        productName: productsTable.name,
        productImage: productsTable.image,
        productCategory: productsTable.category,
        hasDelivery: productsTable.hasDelivery,
        storeId: productsTable.storeId,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(eq(productOrdersTable.clientId, req.user!.id))
      .orderBy(productOrdersTable.updatedAt);

    // Fetch which orders already have ratings
    const orderIds = rows.map(r => r.id);
    const rated = orderIds.length > 0
      ? await db
          .select({ productOrderId: productRatingsTable.productOrderId })
          .from(productRatingsTable)
          .where(inArray(productRatingsTable.productOrderId, orderIds))
      : [];
    const ratedSet = new Set(rated.map(r => r.productOrderId));

    res.json(rows.reverse().map(r => ({
      ...r,
      hasRated: ratedSet.has(r.id),
      statusCanonical: canonicalizeStatus(r.status),
    })));
  } catch (err) {
    logger.error({ err }, "Failed to list client product orders");
    res.status(500).json({ error: "Error al listar solicitudes" });
  }
});

// ── Co-host / seller / manager lists orders for their products ───────────────
router.get("/product-orders/cohost", authenticate, requireRole("cohost", "seller", "admin", "gestor", "worker"), async (req, res): Promise<void> => {
  try {
    // Owner products
    const ownedProducts = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.coHostId, req.user!.id));

    // Stores where user is an active manager with canManageOrders
    const mgrRows = await db
      .select({ storeId: businessManagersTable.storeId, permissions: businessManagersTable.permissions })
      .from(businessManagersTable)
      .where(and(
        eq(businessManagersTable.userId, req.user!.id),
        eq(businessManagersTable.status, "active"),
      ));
    const managedStoreIds = mgrRows.filter(m => {
      try {
        const perms = JSON.parse(m.permissions ?? "{}");
        return !!perms.canManageOrders;
      } catch { return false; }
    }).map(m => m.storeId).filter(Boolean) as number[];

    let managedProductIds: number[] = [];
    if (managedStoreIds.length > 0) {
      const rows = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(inArray(productsTable.storeId, managedStoreIds));
      managedProductIds = rows.map(r => r.id);
    }

    const myProductIds = Array.from(new Set([...ownedProducts.map(p => p.id), ...managedProductIds]));
    if (myProductIds.length === 0) { res.json([]); return; }

    const rows = await db
      .select({
        id: productOrdersTable.id,
        status: productOrdersTable.status,
        groupId: productOrdersTable.groupId,
        quantity: productOrdersTable.quantity,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        bcvRateAtMoment: productOrdersTable.bcvRateAtMoment,
        notes: productOrdersTable.notes,
        deliveryAddress: productOrdersTable.deliveryAddress,
        paymentProofUrl: productOrdersTable.paymentProofUrl,
        paymentMethod: productOrdersTable.paymentMethod,
        paymentAmount: productOrdersTable.paymentAmount,
        paymentRejectedReason: productOrdersTable.paymentRejectedReason,
        createdAt: productOrdersTable.createdAt,
        updatedAt: productOrdersTable.updatedAt,
        productId: productsTable.id,
        productName: productsTable.name,
        productImage: productsTable.image,
        hasDelivery: productsTable.hasDelivery,
        clientId: usersTable.id,
        clientName: usersTable.name,
        clientPhone: usersTable.phone,
        platformCommissionAmt: productOrdersTable.platformCommissionAmt,
        cohostCommissionAmt: productOrdersTable.cohostCommissionAmt,
        storeEarningsAmt: productOrdersTable.storeEarningsAmt,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .leftJoin(usersTable, eq(productOrdersTable.clientId, usersTable.id))
      .where(inArray(productOrdersTable.productId, myProductIds))
      .orderBy(productOrdersTable.updatedAt);

    res.json(rows.reverse().map(r => ({ ...r, statusCanonical: canonicalizeStatus(r.status) })));
  } catch (err) {
    logger.error({ err }, "Failed to list cohost product orders");
    res.status(500).json({ error: "Error al listar solicitudes" });
  }
});

// ── Admin: list all pending-payment product orders ───────────────────────────
router.get("/product-orders/admin", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: productOrdersTable.id,
        status: productOrdersTable.status,
        groupId: productOrdersTable.groupId,
        quantity: productOrdersTable.quantity,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        bcvRateAtMoment: productOrdersTable.bcvRateAtMoment,
        paymentProofUrl: productOrdersTable.paymentProofUrl,
        paymentMethod: productOrdersTable.paymentMethod,
        paymentAmount: productOrdersTable.paymentAmount,
        paymentReference: productOrdersTable.paymentReference,
        paymentRejectedReason: productOrdersTable.paymentRejectedReason,
        deliveryAddress: productOrdersTable.deliveryAddress,
        notes: productOrdersTable.notes,
        createdAt: productOrdersTable.createdAt,
        updatedAt: productOrdersTable.updatedAt,
        productId: productsTable.id,
        productName: productsTable.name,
        clientId: usersTable.id,
        clientName: usersTable.name,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .leftJoin(usersTable, eq(productOrdersTable.clientId, usersTable.id))
      .orderBy(productOrdersTable.updatedAt);
    res.json(rows.reverse().map(r => ({ ...r, statusCanonical: canonicalizeStatus(r.status) })));
  } catch (err) {
    logger.error({ err }, "Failed to list all product orders for admin");
    res.status(500).json({ error: "Error al listar pedidos" });
  }
});

// ── Co-host / manager: accept order — DEPRECATED no-op alias ────────────────
// FASE CHECKOUT MODERNO: seller acceptance is removed. New orders skip the
// "accepted" state entirely. We keep this endpoint as a 200 no-op so any old
// cohost UI / mobile client calling it does not crash.
router.post("/product-orders/:id/accept", authenticate, requireRole("cohost", "seller", "admin", "gestor", "worker"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const isAdmin = req.user!.role === "admin";
    const order = await getOrderWithOwnership(id, req.user!.id, isAdmin, req.user!.role);
    if (!order) { res.status(404).json({ error: "Pedido no encontrado o no autorizado" }); return; }
    // Return current row, no state change. Idempotent.
    const [current] = await db.select().from(productOrdersTable).where(eq(productOrdersTable.id, id));
    res.json(current);
  } catch (err) {
    logger.error({ err }, "Accept no-op failed");
    res.status(500).json({ error: "Error al procesar pedido" });
  }
});

// ── Co-host / Client / Manager: cancel order ─────────────────────────────────
router.post("/product-orders/:id/cancel", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [orderRow] = await db
      .select({
        id: productOrdersTable.id,
        clientId: productOrdersTable.clientId,
        status: productOrdersTable.status,
        coHostId: productsTable.coHostId,
        storeId: productsTable.storeId,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(eq(productOrdersTable.id, id));

    if (!orderRow) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

    const isAdmin = req.user!.role === "admin";
    const isClient = req.user!.role === "client" && orderRow.clientId === req.user!.id;
    const isCohost = (req.user!.role === "cohost" || req.user!.role === "seller") && orderRow.coHostId === req.user!.id;
    // Manager fallback: needs canManageOrders for the order's store.
    let isManager = false;
    if (!isClient && !isCohost && !isAdmin && orderRow.storeId) {
      isManager = await userHasStoreAccess(req.user!.id, req.user!.role, orderRow.storeId, "canManageOrders");
    }
    if (!isClient && !isCohost && !isAdmin && !isManager) {
      res.status(403).json({ error: "No autorizado" }); return;
    }

    const cancelableStatuses = ["pending", "accepted", "payment_pending"];
    if (!cancelableStatuses.includes(orderRow.status)) {
      res.status(400).json({ error: "No se puede cancelar un pedido ya despachado o entregado" }); return;
    }

    const [updated] = await db.update(productOrdersTable).set({ status: "cancelled" }).where(eq(productOrdersTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to cancel product order");
    res.status(500).json({ error: "Error al cancelar pedido" });
  }
});

// ── Client: submit payment proof → payment_pending ───────────────────────────
router.post("/product-orders/:id/submit-proof", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [orderRow] = await db
      .select({
        id: productOrdersTable.id,
        clientId: productOrdersTable.clientId,
        status: productOrdersTable.status,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        productName: productsTable.name,
        coHostId: productsTable.coHostId,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(eq(productOrdersTable.id, id));

    if (!orderRow) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
    if (orderRow.clientId !== req.user!.id) { res.status(403).json({ error: "No autorizado" }); return; }
    // FASE CHECKOUT: accept step skipped — allow proof from "pending" too.
    // Legacy "accepted" still allowed for any old orders mid-flight.
    if (!["pending", "accepted"].includes(orderRow.status)) {
      res.status(400).json({ error: "Solo se puede subir comprobante cuando el pedido está pendiente" }); return;
    }

    const { proofUrl, method, paymentAmount, paymentReference } = req.body;
    if (!proofUrl) { res.status(400).json({ error: "Se requiere imagen del comprobante" }); return; }
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      res.status(400).json({ error: "Ingresa el monto que pagaste" }); return;
    }

    const [updated] = await db.update(productOrdersTable).set({
      status: "payment_pending",
      paymentProofUrl: proofUrl,
      paymentMethod: method ?? null,
      paymentAmount: Number(paymentAmount),
      paymentReference: paymentReference ?? null,
      paymentRejectedReason: null,
    }).where(eq(productOrdersTable.id, id)).returning();

    // Notify client
    await createNotification(
      orderRow.clientId,
      "payment_submitted",
      "🧾 Comprobante recibido",
      `Tu comprobante para "${orderRow.productName}" fue recibido. LinkServi lo verificará en breve (máx. 30 min).`,
      undefined, undefined,
      `/client/product-orders`,
    );

    // Notify admins
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    const [clientRow] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, orderRow.clientId));
    for (const admin of admins) {
      await createNotification(
        admin.id,
        "admin_payment_proof",
        "💳 Comprobante de pedido de tienda",
        `${clientRow?.name ?? "Cliente"} subió comprobante para "${orderRow.productName}" (${method ?? "no especificado"}${paymentAmount ? ` · $${Number(paymentAmount).toFixed(2)}` : ""}). Verifica.`,
        undefined, undefined,
        `/admin/product-orders`,
      );
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to submit payment proof for product order");
    res.status(500).json({ error: "Error al enviar comprobante" });
  }
});

// ── Admin: confirm payment → payment_confirmed ────────────────────────────────
router.post("/product-orders/:id/confirm-payment", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [orderRow] = await db
      .select({
        id: productOrdersTable.id,
        clientId: productOrdersTable.clientId,
        status: productOrdersTable.status,
        productName: productsTable.name,
        coHostId: productsTable.coHostId,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(eq(productOrdersTable.id, id));

    if (!orderRow) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
    if (orderRow.status !== "payment_pending") {
      res.status(400).json({ error: "El pedido no está en revisión de pago" }); return;
    }

    const [updated] = await db.update(productOrdersTable).set({
      status: "payment_confirmed",
      paymentRejectedReason: null,
    }).where(eq(productOrdersTable.id, id)).returning();

    // Notify client
    await createNotification(
      orderRow.clientId,
      "payment_confirmed",
      "✅ Pago verificado",
      `Tu pago para "${orderRow.productName}" fue confirmado. El vendedor preparará tu pedido.`,
      undefined, undefined,
      `/client/product-orders`,
    );
    // Notify co-host
    if (orderRow.coHostId) {
      await createNotification(
        orderRow.coHostId,
        "payment_confirmed",
        "💰 Pago confirmado — prepara el pedido",
        `El pago del pedido #${id} para "${orderRow.productName}" fue verificado. Ya puedes despacharlo.`,
        undefined, undefined,
        `/cohost/orders`,
      );
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to confirm product order payment");
    res.status(500).json({ error: "Error al confirmar pago" });
  }
});

// ── Admin: reject payment → back to accepted ──────────────────────────────────
router.post("/product-orders/:id/reject-payment", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    const [orderRow] = await db
      .select({
        id: productOrdersTable.id,
        clientId: productOrdersTable.clientId,
        status: productOrdersTable.status,
        productName: productsTable.name,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(eq(productOrdersTable.id, id));

    if (!orderRow) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
    if (orderRow.status !== "payment_pending") {
      res.status(400).json({ error: "El pedido no está en revisión de pago" }); return;
    }

    const [updated] = await db.update(productOrdersTable).set({
      status: "accepted",
      paymentProofUrl: null,
      paymentRejectedReason: reason ?? "Comprobante inválido o no verificable.",
    }).where(eq(productOrdersTable.id, id)).returning();

    await createNotification(
      orderRow.clientId,
      "payment_rejected",
      "❌ Comprobante rechazado",
      `Tu comprobante para "${orderRow.productName}" fue rechazado. Motivo: ${reason ?? "inválido o no verificable"}. Por favor sube uno nuevo.`,
      undefined, undefined,
      `/client/product-orders`,
    );

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to reject product order payment");
    res.status(500).json({ error: "Error al rechazar comprobante" });
  }
});

// ── Co-host: mark as dispatched → status: dispatched ─────────────────────────
// Only allowed after payment_confirmed
router.post("/product-orders/:id/dispatch", authenticate, requireRole("cohost", "seller", "admin", "gestor", "worker"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const isAdmin = req.user!.role === "admin";
    const order = await getOrderWithOwnership(id, req.user!.id, isAdmin, req.user!.role);
    if (!order) { res.status(404).json({ error: "Pedido no encontrado o no autorizado" }); return; }
    if (order.status !== "payment_confirmed") {
      res.status(400).json({ error: "Solo se pueden despachar pedidos con pago confirmado" }); return;
    }

    const [updated] = await db.update(productOrdersTable).set({ status: "dispatched" }).where(eq(productOrdersTable.id, id)).returning();

    if (order.clientId) {
      const enriched = await getOrderEnriched(id);
      await createNotification(
        order.clientId,
        "product_order_dispatched",
        "🚚 Tu pedido está en camino",
        `Tu pedido de "${enriched?.productName ?? "producto"}" fue despachado. Confirma la recepción cuando llegue.`,
        undefined, undefined,
        `/client/product-orders`,
      );
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to dispatch product order");
    res.status(500).json({ error: "Error al marcar como despachado" });
  }
});

// ── Client: confirm delivery → status: delivered (payment released + commissions) ─
router.post("/product-orders/:id/confirm-delivery", authenticate, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  try {
    const [orderRow] = await db
      .select({
        id: productOrdersTable.id,
        clientId: productOrdersTable.clientId,
        status: productOrdersTable.status,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        productId: productOrdersTable.productId,
        storeId: productsTable.storeId,
        coHostId: productsTable.coHostId,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(eq(productOrdersTable.id, id));

    if (!orderRow) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
    if (orderRow.clientId !== req.user!.id) { res.status(403).json({ error: "No autorizado" }); return; }

    // ── Idempotency: already delivered → return data without side effects ────────
    // Handles duplicate form submissions / network retries gracefully.
    if (orderRow.status === "delivered") {
      logger.info({ op: "confirm-delivery", id }, "Idempotent return: already delivered");
      const [existing] = await db.select().from(productOrdersTable).where(eq(productOrdersTable.id, id));
      res.json({ ...existing, paymentReleased: true }); return;
    }

    // ── State machine: only "dispatched" → "delivered" is a valid transition ────
    if (orderRow.status !== "dispatched") {
      res.status(400).json({ error: "Solo se pueden confirmar pedidos en camino" }); return;
    }

    const price = orderRow.priceUsdAtMoment;
    const effectiveCohostId = orderRow.coHostId ?? null;

    logger.info({ op: "confirm-delivery", id, price }, "Starting transaction");

    // ── Atomic transaction: credit all balances + mark order delivered ─────────
    // All money movements and the status change happen together.
    // If any credit fails → rollback → order stays in "dispatched" → no double credit.
    //
    // Concurrent protection: the final UPDATE uses `AND status = 'dispatched'` so
    // if a concurrent request already delivered this order, it matches 0 rows and
    // we detect it before returning. All prior credits inside the same transaction
    // are rolled back automatically.
    const { updated, platformCommissionAmt, cohostCommissionAmt, storeEarningsAmt } =
      await db.transaction(async (tx) => {
        // Resolve co-host commission rate from current plan inside the transaction
        let cohostRate = 0.05; // default: free plan
        if (effectiveCohostId) {
          const [cohostUser] = await tx
            .select({ cohostPlan: usersTable.cohostPlan, cohostMonthlyVolumeUsd: usersTable.cohostMonthlyVolumeUsd })
            .from(usersTable)
            .where(eq(usersTable.id, effectiveCohostId));
          if (cohostUser) {
            cohostRate = getCohostCommissionRate(cohostUser.cohostPlan, cohostUser.cohostMonthlyVolumeUsd ?? 0);
          }
        }

        let platformAmt = +(price * 0.10).toFixed(4); // always 10%
        let cohostAmt   = +(price * cohostRate).toFixed(4);
        let storeAmt    = +(price - platformAmt - cohostAmt).toFixed(4);

        if (orderRow.storeId) {
          const [store] = await tx.select().from(storesTable).where(eq(storesTable.id, orderRow.storeId));
          if (store) {
            platformAmt = +(price * (store.platformCommissionPct / 100)).toFixed(4);
            cohostAmt   = +(price * cohostRate).toFixed(4);
            storeAmt    = +(price - platformAmt - cohostAmt).toFixed(4);

            // Credit store balance
            await tx.update(storesTable).set({
              balanceUsd: sql`${storesTable.balanceUsd} + ${storeAmt}`,
            }).where(eq(storesTable.id, orderRow.storeId));

            // Credit co-host's commission
            if (store.coHostId) {
              await tx.update(usersTable).set({
                productCommissionBalanceUsd: sql`${usersTable.productCommissionBalanceUsd} + ${cohostAmt}`,
                cohostMonthlyVolumeUsd: sql`${usersTable.cohostMonthlyVolumeUsd} + ${price}`,
              }).where(eq(usersTable.id, store.coHostId));
            }
          }
        } else if (effectiveCohostId) {
          // Legacy: product without store — credit commission directly to co-host
          await tx.update(usersTable).set({
            productCommissionBalanceUsd: sql`${usersTable.productCommissionBalanceUsd} + ${cohostAmt}`,
            cohostMonthlyVolumeUsd: sql`${usersTable.cohostMonthlyVolumeUsd} + ${price}`,
          }).where(eq(usersTable.id, effectiveCohostId));
        }

        // Mark order as delivered — only if still in "dispatched" state.
        // If a concurrent request already delivered it, 0 rows are returned
        // and the entire transaction (including all credits above) is rolled back.
        const [deliveredOrder] = await tx.update(productOrdersTable).set({
          status: "delivered",
          platformCommissionAmt: platformAmt,
          cohostCommissionAmt: cohostAmt,
          storeEarningsAmt: storeAmt,
        }).where(and(eq(productOrdersTable.id, id), eq(productOrdersTable.status, "dispatched"))).returning();

        if (!deliveredOrder) {
          throw Object.assign(new Error("Concurrent delivery detected"), { code: "ALREADY_DELIVERED" });
        }

        return { updated: deliveredOrder, platformCommissionAmt: platformAmt, cohostCommissionAmt: cohostAmt, storeEarningsAmt: storeAmt };
      });

    logger.info({ op: "confirm-delivery", id }, "Transaction success");
    res.json({ ...updated, paymentReleased: true, platformCommissionAmt, cohostCommissionAmt, storeEarningsAmt });
  } catch (err: any) {
    if (err?.code === "ALREADY_DELIVERED") {
      logger.info({ op: "confirm-delivery", id }, "Idempotent return: concurrent delivery detected inside transaction");
      const [existing] = await db.select().from(productOrdersTable).where(eq(productOrdersTable.id, id));
      res.json({ ...existing, paymentReleased: true }); return;
    }
    logger.error({ op: "confirm-delivery", id, err }, "Transaction failed");
    res.status(500).json({ error: "Error al confirmar recepción" });
  }
});

// ── Client: submit rating after delivery ─────────────────────────────────────
router.post("/product-orders/:id/rate", authenticate, async (req, res): Promise<void> => {
  try {
    const orderId = parseInt(req.params.id);
    const { productRating, storeRating, comment } = req.body;

    // Validate ratings
    if (!productRating || productRating < 1 || productRating > 5) {
      res.status(400).json({ error: "Calificación de producto inválida (1-5)" }); return;
    }
    if (storeRating !== undefined && storeRating !== null && (storeRating < 1 || storeRating > 5)) {
      res.status(400).json({ error: "Calificación de tienda inválida (1-5)" }); return;
    }

    // Load the order + verify ownership + verify it's delivered
    const [orderRow] = await db
      .select({
        id: productOrdersTable.id,
        clientId: productOrdersTable.clientId,
        status: productOrdersTable.status,
        productId: productOrdersTable.productId,
        storeId: productsTable.storeId,
        productName: productsTable.name,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(eq(productOrdersTable.id, orderId));

    if (!orderRow) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
    if (orderRow.clientId !== req.user!.id) { res.status(403).json({ error: "No autorizado" }); return; }
    if (orderRow.status !== "delivered") {
      res.status(400).json({ error: "Solo puedes calificar pedidos entregados" }); return;
    }

    // Check no duplicate
    const existing = await db
      .select({ id: productRatingsTable.id })
      .from(productRatingsTable)
      .where(eq(productRatingsTable.productOrderId, orderId));
    if (existing.length > 0) {
      res.status(409).json({ error: "Ya calificaste este pedido" }); return;
    }

    const [rating] = await db.insert(productRatingsTable).values({
      productOrderId: orderId,
      productId: orderRow.productId!,
      storeId: orderRow.storeId ?? null,
      clientId: req.user!.id,
      productRating: parseInt(productRating),
      storeRating: storeRating != null ? parseInt(storeRating) : null,
      comment: comment?.trim() || null,
    }).returning();

    res.status(201).json(rating);
  } catch (err) {
    logger.error({ err }, "Failed to submit product rating");
    res.status(500).json({ error: "Error al enviar calificación" });
  }
});

export default router;
