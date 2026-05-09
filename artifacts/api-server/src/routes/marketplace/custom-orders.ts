import { Router } from "express";
import { db, customOrdersTable, storesTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, requireRole, requireAdminRole, requireVerifiedEmail } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { createNotification } from "../notifications";

const router = Router();

// ── Client: create custom order (with payment proof already included) ─────────
router.post("/custom-orders", authenticate, requireVerifiedEmail, async (req, res): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const {
      storeId,
      productName,
      imageUrl,
      priceUsd,
      hasDelivery,
      deliveryAddress,
      notes,
      paymentProofUrl,
      paymentMethod,
      paymentAmount,
      paymentReference,
    } = req.body;

    if (!storeId || !productName || !priceUsd || !paymentProofUrl) {
      res.status(400).json({ error: "Faltan campos obligatorios" }); return;
    }

    // Get the store's cohost
    const [store] = await db
      .select({ id: storesTable.id, coHostId: storesTable.coHostId, name: storesTable.name })
      .from(storesTable)
      .where(eq(storesTable.id, Number(storeId)));

    if (!store) { res.status(404).json({ error: "Tienda no encontrada" }); return; }

    const [order] = await db
      .insert(customOrdersTable)
      .values({
        storeId: Number(storeId),
        clientId: userId,
        coHostId: store.coHostId,
        productName: productName.trim(),
        imageUrl: imageUrl ?? null,
        priceUsd: Number(priceUsd),
        hasDelivery: Boolean(hasDelivery),
        deliveryAddress: deliveryAddress?.trim() || null,
        notes: notes?.trim() || null,
        status: "payment_pending",
        paymentProofUrl,
        paymentMethod: paymentMethod ?? null,
        paymentAmount: paymentAmount ? Number(paymentAmount) : null,
        paymentReference: paymentReference?.trim() || null,
      })
      .returning();

    // Respond immediately — notification is fire-and-forget
    res.status(201).json(order);

    // Notify cohost (non-blocking — must not affect the response)
    createNotification(
      store.coHostId,
      "order_update",
      `Nuevo pedido: ${productName}`,
      `Un cliente envió un comprobante de pago — $${Number(priceUsd).toFixed(2)} USD. Revisa el pedido.`,
      undefined,
      undefined,
      `/cohost/orders`,
    ).catch(notifErr => logger.warn({ notifErr }, "Could not send cohost notification for custom order"));

  } catch (err: any) {
    logger.error({ err, msg: err?.message, stack: err?.stack }, "Failed to create custom order");
    res.status(500).json({ error: "Error al crear el pedido" });
  }
});

// ── Client: list my custom orders ────────────────────────────────────────────
router.get("/custom-orders/my", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const orders = await db
      .select({
        id: customOrdersTable.id,
        storeId: customOrdersTable.storeId,
        productName: customOrdersTable.productName,
        imageUrl: customOrdersTable.imageUrl,
        priceUsd: customOrdersTable.priceUsd,
        hasDelivery: customOrdersTable.hasDelivery,
        status: customOrdersTable.status,
        paymentMethod: customOrdersTable.paymentMethod,
        paymentRejectedReason: customOrdersTable.paymentRejectedReason,
        notes: customOrdersTable.notes,
        createdAt: customOrdersTable.createdAt,
        storeName: storesTable.name,
      })
      .from(customOrdersTable)
      .leftJoin(storesTable, eq(customOrdersTable.storeId, storesTable.id))
      .where(eq(customOrdersTable.clientId, userId))
      .orderBy(desc(customOrdersTable.createdAt));

    res.json(orders);
  } catch (err) {
    logger.error({ err }, "Failed to list client custom orders");
    res.status(500).json({ error: "Error al cargar pedidos" });
  }
});

// ── CoHost: list custom orders for my stores ─────────────────────────────────
router.get("/custom-orders/cohost", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const cohostId = (req as any).user.id;
    const orders = await db
      .select({
        id: customOrdersTable.id,
        productName: customOrdersTable.productName,
        imageUrl: customOrdersTable.imageUrl,
        priceUsd: customOrdersTable.priceUsd,
        hasDelivery: customOrdersTable.hasDelivery,
        status: customOrdersTable.status,
        paymentMethod: customOrdersTable.paymentMethod,
        paymentProofUrl: customOrdersTable.paymentProofUrl,
        paymentAmount: customOrdersTable.paymentAmount,
        paymentReference: customOrdersTable.paymentReference,
        notes: customOrdersTable.notes,
        deliveryAddress: customOrdersTable.deliveryAddress,
        createdAt: customOrdersTable.createdAt,
        storeName: storesTable.name,
        clientName: usersTable.name,
      })
      .from(customOrdersTable)
      .leftJoin(storesTable, eq(customOrdersTable.storeId, storesTable.id))
      .leftJoin(usersTable, eq(customOrdersTable.clientId, usersTable.id))
      .where(eq(customOrdersTable.coHostId, cohostId))
      .orderBy(desc(customOrdersTable.createdAt));

    res.json(orders);
  } catch (err) {
    logger.error({ err }, "Failed to list cohost custom orders");
    res.status(500).json({ error: "Error al cargar pedidos" });
  }
});

// ── Admin: list all custom orders ────────────────────────────────────────────
router.get("/custom-orders/admin", authenticate, requireAdminRole("super_admin", "soporte", "finanzas"), async (req, res): Promise<void> => {
  try {
    const orders = await db
      .select({
        id: customOrdersTable.id,
        productName: customOrdersTable.productName,
        imageUrl: customOrdersTable.imageUrl,
        priceUsd: customOrdersTable.priceUsd,
        hasDelivery: customOrdersTable.hasDelivery,
        status: customOrdersTable.status,
        paymentMethod: customOrdersTable.paymentMethod,
        paymentProofUrl: customOrdersTable.paymentProofUrl,
        paymentAmount: customOrdersTable.paymentAmount,
        paymentReference: customOrdersTable.paymentReference,
        paymentRejectedReason: customOrdersTable.paymentRejectedReason,
        notes: customOrdersTable.notes,
        deliveryAddress: customOrdersTable.deliveryAddress,
        createdAt: customOrdersTable.createdAt,
        updatedAt: customOrdersTable.updatedAt,
        storeName: storesTable.name,
        clientName: usersTable.name,
      })
      .from(customOrdersTable)
      .leftJoin(storesTable, eq(customOrdersTable.storeId, storesTable.id))
      .leftJoin(usersTable, eq(customOrdersTable.clientId, usersTable.id))
      .orderBy(desc(customOrdersTable.createdAt));

    res.json(orders);
  } catch (err) {
    logger.error({ err }, "Failed to list admin custom orders");
    res.status(500).json({ error: "Error al cargar pedidos" });
  }
});

// ── CoHost: mark order as dispatched ─────────────────────────────────────────
router.post("/custom-orders/:id/dispatch", authenticate, requireRole("cohost"), async (req, res): Promise<void> => {
  try {
    const orderId = parseInt(req.params.id);
    const cohostId = (req as any).user.id;

    const [order] = await db
      .select()
      .from(customOrdersTable)
      .where(and(eq(customOrdersTable.id, orderId), eq(customOrdersTable.coHostId, cohostId)));

    if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }
    if (order.status !== "paid") { res.status(400).json({ error: "Solo se pueden despachar pedidos con pago confirmado" }); return; }

    await db.update(customOrdersTable)
      .set({ status: "dispatched" })
      .where(eq(customOrdersTable.id, orderId));

    res.json({ ok: true });

    createNotification(
      order.clientId,
      "order_update",
      `Tu pedido "${order.productName}" está en camino`,
      `El vendedor despachó tu pedido. ¡Pronto lo recibirás!`,
      undefined,
      undefined,
      `/my-custom-orders`,
    ).catch(e => logger.warn({ e }, "Could not notify client on dispatch"));

  } catch (err) {
    logger.error({ err }, "Failed to dispatch custom order");
    res.status(500).json({ error: "Error al marcar como despachado" });
  }
});

// ── Admin: approve payment ────────────────────────────────────────────────────
router.post("/custom-orders/:id/approve", authenticate, requireAdminRole("super_admin", "soporte", "finanzas"), async (req, res): Promise<void> => {
  try {
    const orderId = parseInt(req.params.id);
    const [order] = await db.select().from(customOrdersTable).where(eq(customOrdersTable.id, orderId));
    if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

    await db.update(customOrdersTable)
      .set({ status: "paid" })
      .where(eq(customOrdersTable.id, orderId));

    res.json({ ok: true });

    createNotification(
      order.clientId,
      "order_update",
      `Pago verificado: ${order.productName}`,
      `¡Tu comprobante fue aceptado! El vendedor preparará tu pedido.`,
      undefined,
      undefined,
      `/my-custom-orders`,
    ).catch(e => logger.warn({ e }, "Could not notify client on approve"));

    createNotification(
      order.coHostId,
      "order_update",
      `Pedido confirmado: ${order.productName}`,
      `El pago fue verificado. Prepara el pedido para el cliente.`,
      undefined,
      undefined,
      `/cohost/orders`,
    ).catch(e => logger.warn({ e }, "Could not notify cohost on approve"));

  } catch (err) {
    logger.error({ err }, "Failed to approve custom order");
    res.status(500).json({ error: "Error al aprobar pedido" });
  }
});

// ── Admin: reject payment ─────────────────────────────────────────────────────
router.post("/custom-orders/:id/reject", authenticate, requireAdminRole("super_admin", "soporte", "finanzas"), async (req, res): Promise<void> => {
  try {
    const orderId = parseInt(req.params.id);
    const { reason } = req.body;

    const [order] = await db.select().from(customOrdersTable).where(eq(customOrdersTable.id, orderId));
    if (!order) { res.status(404).json({ error: "Pedido no encontrado" }); return; }

    await db.update(customOrdersTable)
      .set({ status: "payment_rejected", paymentRejectedReason: reason ?? null })
      .where(eq(customOrdersTable.id, orderId));

    res.json({ ok: true });

    createNotification(
      order.clientId,
      "order_update",
      `Comprobante rechazado: ${order.productName}`,
      reason ? `Motivo: ${reason}. Vuelve al chat para reenviar el pago.` : `Tu comprobante no pudo ser verificado. Vuelve al chat para reenviar.`,
      undefined,
      undefined,
      `/my-custom-orders`,
    ).catch(e => logger.warn({ e }, "Could not notify client on reject"));

  } catch (err) {
    logger.error({ err }, "Failed to reject custom order payment");
    res.status(500).json({ error: "Error al rechazar pago" });
  }
});

export default router;
