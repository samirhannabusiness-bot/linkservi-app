/**
 * Multi-store cart checkout (FASE CHECKOUT MODERNO).
 *
 * Endpoints:
 *   POST /api/order-groups                       — buyer: create group + child orders atomically
 *   POST /api/order-groups/:id/submit-proof      — buyer: upload single proof for the whole group
 *   POST /api/order-groups/:id/confirm-payment   — admin: verify proof → all children → paid
 *   POST /api/order-groups/:id/reject-payment    — admin: reject proof → group back to pending
 *   GET  /api/order-groups/mine                  — buyer: list own groups (with children + product info)
 *   GET  /api/order-groups/:id                   — buyer or admin: detailed view
 *
 * Escrow + per-order release flow (dispatch / confirm-delivery) lives in
 * product-orders.ts and is unchanged. Each child uses the existing release
 * logic when the buyer confirms reception.
 */
import { Router } from "express";
import {
  db,
  orderGroupsTable,
  productOrdersTable,
  productsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { authenticate, requireRole, requireVerifiedEmail } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { createNotification } from "../notifications";

const router = Router();

// ── Helper: get current BCV rate from running server ─────────────────────────
async function getCurrentBcvRate(): Promise<number> {
  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? 8080}/api/bcv-rate`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 36;
    const data = (await res.json()) as { rate: number };
    return data.rate ?? 36;
  } catch {
    return 36;
  }
}

// ── Helper: load group + children + product info ─────────────────────────────
async function loadGroupFull(groupId: number) {
  const [group] = await db.select().from(orderGroupsTable).where(eq(orderGroupsTable.id, groupId));
  if (!group) return null;
  const items = await db
    .select({
      id: productOrdersTable.id,
      productId: productOrdersTable.productId,
      quantity: productOrdersTable.quantity,
      priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
      status: productOrdersTable.status,
      groupId: productOrdersTable.groupId,
      productName: productsTable.name,
      productImage: productsTable.image,
      storeId: productsTable.storeId,
      coHostId: productsTable.coHostId,
    })
    .from(productOrdersTable)
    .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
    .where(eq(productOrdersTable.groupId, groupId));
  return { ...group, items };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/order-groups — Buyer creates a multi-store cart checkout.
// Body: { items: [{ productId, quantity }], deliveryAddress, notes? }
// Atomic: validate every product is active, snapshot prices, write group +
// children inside a transaction. No seller acceptance step.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/order-groups",
  authenticate,
  requireRole("client", "worker", "cohost", "admin"),
  requireVerifiedEmail,
  async (req, res): Promise<void> => {
    try {
      const { items, deliveryAddress, notes } = req.body as {
        items?: Array<{ productId: number; quantity: number }>;
        deliveryAddress?: string;
        notes?: string;
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "El carrito está vacío" });
        return;
      }
      if (!deliveryAddress || !deliveryAddress.trim()) {
        res.status(400).json({ error: "La dirección de entrega es requerida" });
        return;
      }

      // Normalise + dedupe by productId (sum quantities)
      const lineMap = new Map<number, number>();
      for (const it of items) {
        const pid = Number(it?.productId);
        const qty = Math.max(1, Math.floor(Number(it?.quantity ?? 1)));
        if (!Number.isFinite(pid) || pid <= 0) continue;
        lineMap.set(pid, (lineMap.get(pid) ?? 0) + qty);
      }
      if (lineMap.size === 0) {
        res.status(400).json({ error: "El carrito no contiene productos válidos" });
        return;
      }

      // Load every requested product (validate active + price snapshot)
      const productIds = [...lineMap.keys()];
      const products = await db
        .select()
        .from(productsTable)
        .where(and(inArray(productsTable.id, productIds), eq(productsTable.isActive, true)));

      if (products.length !== productIds.length) {
        const found = new Set(products.map((p) => p.id));
        const missing = productIds.filter((id) => !found.has(id));
        res.status(400).json({
          error: `Producto(s) no disponibles: ${missing.join(", ")}`,
          missing,
        });
        return;
      }

      const bcvRate = await getCurrentBcvRate();
      const totalUsd = products.reduce((sum, p) => {
        const qty = lineMap.get(p.id) ?? 1;
        return sum + +(p.priceUsd * qty).toFixed(4);
      }, 0);

      // Atomic write — group + children together
      const result = await db.transaction(async (tx) => {
        const [group] = await tx
          .insert(orderGroupsTable)
          .values({
            clientId: req.user!.id,
            totalUsd: +totalUsd.toFixed(4),
            bcvRateAtMoment: bcvRate,
            paymentStatus: "pending",
            deliveryAddress,
            notes: notes ?? null,
          })
          .returning();

        const childRows = products.map((p) => ({
          productId: p.id,
          clientId: req.user!.id,
          groupId: group.id,
          quantity: lineMap.get(p.id) ?? 1,
          priceUsdAtMoment: p.priceUsd,
          bcvRateAtMoment: bcvRate,
          status: "pending",
          deliveryAddress,
          notes: notes ?? null,
        }));
        const children = await tx.insert(productOrdersTable).values(childRows).returning();
        return { group, children };
      });

      // Best-effort notifications. We never fail the request if notifications fail
      // because the durable order-group + child orders have already committed.
      try {
        const cohostByOrder = new Map<number, { coHostId: number | null; productName: string }>();
        for (const p of products) {
          cohostByOrder.set(p.id, { coHostId: p.coHostId ?? null, productName: p.name });
        }
        for (const child of result.children) {
          const meta = cohostByOrder.get(child.productId);
          if (meta?.coHostId) {
            await createNotification(
              meta.coHostId,
              "product_order_created",
              "🛒 Nuevo pedido recibido",
              `Tienes un nuevo pedido para "${meta.productName}" (cantidad: ${child.quantity}). Esperando confirmación de pago del cliente.`,
              undefined,
              undefined,
              `/cohost/orders`,
            );
          }
        }
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, groupId: result.group.id }, "Order-group created but cohost notifications failed");
      }

      res.status(201).json({
        group: result.group,
        orders: result.children,
      });
    } catch (err) {
      logger.error({ err }, "Failed to create order group");
      res.status(500).json({ error: "Error al crear el pedido" });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/order-groups/:id/submit-proof — Buyer uploads single payment proof.
// Body: { proofUrl, method, paymentAmount, paymentReference? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/order-groups/:id/submit-proof", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [group] = await db.select().from(orderGroupsTable).where(eq(orderGroupsTable.id, id));
    if (!group) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    if (group.clientId !== req.user!.id) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }
    if (!["pending", "rejected"].includes(group.paymentStatus)) {
      res.status(400).json({ error: "Este pedido ya tiene un comprobante en revisión o confirmado" });
      return;
    }

    const { proofUrl, method, paymentAmount, paymentReference } = req.body;
    if (!proofUrl) {
      res.status(400).json({ error: "Se requiere imagen del comprobante" });
      return;
    }
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      res.status(400).json({ error: "Ingresa el monto que pagaste" });
      return;
    }

    const [updated] = await db
      .update(orderGroupsTable)
      .set({
        paymentStatus: "submitted",
        paymentProofUrl: proofUrl,
        paymentMethod: method ?? null,
        paymentAmount: Number(paymentAmount),
        paymentReference: paymentReference ?? null,
        paymentRejectedReason: null,
      })
      .where(eq(orderGroupsTable.id, id))
      .returning();

    // Best-effort notifications. The proof has already been durably saved.
    try {
      await createNotification(
        group.clientId,
        "payment_submitted",
        "🧾 Comprobante recibido",
        `Tu comprobante para el pedido #${id} fue recibido. LinkServi lo verificará en breve (máx. 30 min).`,
        undefined,
        undefined,
        `/client/product-orders`,
      );
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
      for (const admin of admins) {
        await createNotification(
          admin.id,
          "admin_payment_proof",
          "💳 Comprobante de carrito",
          `Cliente subió comprobante para el pedido #${id} ($${Number(paymentAmount).toFixed(2)}). Verifica.`,
          undefined,
          undefined,
          `/admin/product-orders`,
        );
      }
    } catch (notifyErr) {
      logger.warn({ err: notifyErr, groupId: id }, "Proof submitted but notifications failed");
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to submit proof for order group");
    res.status(500).json({ error: "Error al enviar comprobante" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/order-groups/:id/confirm-payment — Admin verifies the proof.
// Side effects: group → confirmed, EVERY child product_order → payment_confirmed.
// Notifies buyer + each co-host of a confirmed sub-order.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/order-groups/:id/confirm-payment",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      const full = await loadGroupFull(id);
      if (!full) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }
      if (full.paymentStatus !== "submitted") {
        res.status(400).json({ error: "Este pedido no está en revisión de pago" });
        return;
      }

      const { updated } = await db.transaction(async (tx) => {
        const [updatedGroup] = await tx
          .update(orderGroupsTable)
          .set({
            paymentStatus: "confirmed",
            paymentRejectedReason: null,
            paidAt: new Date(),
          })
          .where(eq(orderGroupsTable.id, id))
          .returning();
        await tx
          .update(productOrdersTable)
          .set({ status: "payment_confirmed" })
          .where(eq(productOrdersTable.groupId, id));
        return { updated: updatedGroup };
      });

      // Best-effort notifications. Group + child orders already committed.
      try {
        await createNotification(
          full.clientId,
          "payment_confirmed",
          "✅ Pago verificado",
          `Tu pago para el pedido #${id} fue confirmado. Las tiendas prepararán tus productos.`,
          undefined,
          undefined,
          `/client/product-orders`,
        );
        const cohosts = new Set<number>();
        for (const it of full.items) {
          if (it.coHostId) cohosts.add(it.coHostId);
        }
        for (const cid of cohosts) {
          await createNotification(
            cid,
            "payment_confirmed",
            "💰 Pago confirmado — prepara los pedidos",
            `El pago de un pedido (#${id}) fue verificado. Despacha las unidades cuando estén listas.`,
            undefined,
            undefined,
            `/cohost/orders`,
          );
        }
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, groupId: id }, "Payment confirmed but notifications failed");
      }

      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Failed to confirm payment for order group");
      res.status(500).json({ error: "Error al confirmar pago" });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/order-groups/:id/reject-payment — Admin rejects the proof.
// Group → rejected, children stay at "pending" so buyer can re-submit.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/order-groups/:id/reject-payment",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;
      const [group] = await db.select().from(orderGroupsTable).where(eq(orderGroupsTable.id, id));
      if (!group) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }
      if (group.paymentStatus !== "submitted") {
        res.status(400).json({ error: "Este pedido no está en revisión de pago" });
        return;
      }
      const [updated] = await db
        .update(orderGroupsTable)
        .set({
          paymentStatus: "rejected",
          paymentProofUrl: null,
          paymentRejectedReason: reason ?? "Comprobante inválido o no verificable.",
        })
        .where(eq(orderGroupsTable.id, id))
        .returning();
      await createNotification(
        group.clientId,
        "payment_rejected",
        "❌ Comprobante rechazado",
        `Tu comprobante para el pedido #${id} fue rechazado. Motivo: ${reason ?? "inválido o no verificable"}. Sube uno nuevo.`,
        undefined,
        undefined,
        `/client/product-orders`,
      );
      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Failed to reject payment for order group");
      res.status(500).json({ error: "Error al rechazar comprobante" });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/order-groups/mine — buyer's own groups (most recent first).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/order-groups/mine", authenticate, async (req, res): Promise<void> => {
  try {
    const groups = await db
      .select()
      .from(orderGroupsTable)
      .where(eq(orderGroupsTable.clientId, req.user!.id))
      .orderBy(desc(orderGroupsTable.id));
    if (groups.length === 0) {
      res.json([]);
      return;
    }
    const groupIds = groups.map((g) => g.id);
    const items = await db
      .select({
        id: productOrdersTable.id,
        groupId: productOrdersTable.groupId,
        productId: productOrdersTable.productId,
        quantity: productOrdersTable.quantity,
        priceUsdAtMoment: productOrdersTable.priceUsdAtMoment,
        status: productOrdersTable.status,
        productName: productsTable.name,
        productImage: productsTable.image,
        storeId: productsTable.storeId,
      })
      .from(productOrdersTable)
      .leftJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(inArray(productOrdersTable.groupId, groupIds));
    const byGroup = new Map<number, typeof items>();
    for (const it of items) {
      const k = it.groupId!;
      if (!byGroup.has(k)) byGroup.set(k, [] as any);
      byGroup.get(k)!.push(it);
    }
    res.json(groups.map((g) => ({ ...g, items: byGroup.get(g.id) ?? [] })));
  } catch (err) {
    logger.error({ err }, "Failed to list buyer order groups");
    res.status(500).json({ error: "Error al listar pedidos" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/order-groups/:id — buyer or admin can view.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/order-groups/:id", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const full = await loadGroupFull(id);
    if (!full) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    const isAdmin = req.user!.role === "admin";
    if (!isAdmin && full.clientId !== req.user!.id) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }
    res.json(full);
  } catch (err) {
    logger.error({ err }, "Failed to fetch order group");
    res.status(500).json({ error: "Error al cargar pedido" });
  }
});

export default router;
