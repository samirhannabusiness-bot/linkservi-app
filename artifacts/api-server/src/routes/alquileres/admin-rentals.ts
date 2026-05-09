import { Router } from "express";
import {
  db, rentalsTable, usersTable, productsTable, userVerificationsTable,
  deliveryOrdersTable, notificationsTable,
} from "@workspace/db";
import { eq, desc, and, or, not, lte, gte, ne } from "drizzle-orm";
import { authenticate } from "../../lib/auth";
import { createNotification } from "../notifications";
import { logger } from "../../lib/logger";

const router = Router();

// ── Middleware helpers ────────────────────────────────────────────────────────
function adminOnly(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") { res.status(403).json({ error: "Solo admin" }); return; }
  next();
}

// ── KYC guard — returns true if the user has an approved verification ─────────
async function isKycApproved(userId: number): Promise<boolean> {
  const [v] = await db
    .select({ status: userVerificationsTable.status })
    .from(userVerificationsTable)
    .where(eq(userVerificationsTable.userId, userId))
    .limit(1);
  return v?.status === "approved";
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── GET /api/rentals/mine ─────────────────────────────────────────────────────
// Returns rentals where the authenticated user is client OR owner.
// Filters pushed to SQL; no in-memory filtering needed.
router.get("/rentals/mine", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const rows = await db
      .select({
        id: rentalsTable.id,
        productId: rentalsTable.productId,
        clientId: rentalsTable.clientId,
        ownerId: rentalsTable.ownerId,
        startDate: rentalsTable.startDate,
        endDate: rentalsTable.endDate,
        days: rentalsTable.days,
        dailyRate: rentalsTable.dailyRate,
        subtotal: rentalsTable.subtotal,
        commission: rentalsTable.commission,
        depositAmount: rentalsTable.depositAmount,
        depositStatus: rentalsTable.depositStatus,
        status: rentalsTable.status,
        clientNotes: rentalsTable.clientNotes,
        productName: rentalsTable.productName,
        ownerName: rentalsTable.ownerName,
        clientName: rentalsTable.clientName,
        contractUrl: rentalsTable.contractUrl,
        hasDelivery: rentalsTable.hasDelivery,
        createdAt: rentalsTable.createdAt,
      })
      .from(rentalsTable)
      .where(or(eq(rentalsTable.clientId, uid), eq(rentalsTable.ownerId, uid)))
      .orderBy(desc(rentalsTable.createdAt));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener alquileres" });
  }
});

// ── GET /admin/rentals ────────────────────────────────────────────────────────
// Filters pushed to SQL WHERE clause — no in-memory filtering.
router.get("/admin/rentals", authenticate, adminOnly, async (req, res): Promise<void> => {
  try {
    const { status, depositStatus } = req.query;

    const conditions: any[] = [];
    if (status && typeof status === "string") {
      conditions.push(eq(rentalsTable.status, status));
    }
    if (depositStatus && typeof depositStatus === "string") {
      conditions.push(eq(rentalsTable.depositStatus, depositStatus));
    }

    const rows = await db
      .select({
        id: rentalsTable.id,
        productId: rentalsTable.productId,
        clientId: rentalsTable.clientId,
        ownerId: rentalsTable.ownerId,
        startDate: rentalsTable.startDate,
        endDate: rentalsTable.endDate,
        days: rentalsTable.days,
        dailyRate: rentalsTable.dailyRate,
        subtotal: rentalsTable.subtotal,
        commission: rentalsTable.commission,
        depositAmount: rentalsTable.depositAmount,
        depositStatus: rentalsTable.depositStatus,
        status: rentalsTable.status,
        productName: rentalsTable.productName,
        ownerName: rentalsTable.ownerName,
        clientName: rentalsTable.clientName,
        clientNotes: rentalsTable.clientNotes,
        contractUrl: rentalsTable.contractUrl,
        hasDelivery: rentalsTable.hasDelivery,
        createdAt: rentalsTable.createdAt,
      })
      .from(rentalsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(rentalsTable.createdAt));

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error al obtener alquileres" });
  }
});

// ── GET /admin/rentals/stats ──────────────────────────────────────────────────
router.get("/admin/rentals/stats", authenticate, adminOnly, async (req, res): Promise<void> => {
  try {
    const allRentals = await db.select({
      commission: rentalsTable.commission,
      depositAmount: rentalsTable.depositAmount,
      depositStatus: rentalsTable.depositStatus,
      status: rentalsTable.status,
      productName: rentalsTable.productName,
      createdAt: rentalsTable.createdAt,
    }).from(rentalsTable);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const commissionsToday = allRentals
      .filter(r => new Date(r.createdAt) >= today)
      .reduce((sum, r) => sum + (r.commission ?? 0), 0);

    const totalDepositsHeld = allRentals
      .filter(r => r.depositStatus === "held")
      .reduce((sum, r) => sum + (r.depositAmount ?? 0), 0);

    const totalCommissions = allRentals.reduce((sum, r) => sum + (r.commission ?? 0), 0);
    const activeRentals = allRentals.filter(r => r.status === "active").length;
    const pendingRentals = allRentals.filter(r => r.status === "pending").length;
    const completedRentals = allRentals.filter(r => r.status === "completed").length;
    const disputedRentals = allRentals.filter(r => r.status === "disputed").length;

    const productCounts: Record<string, number> = {};
    for (const r of allRentals) {
      productCounts[r.productName] = (productCounts[r.productName] ?? 0) + 1;
    }
    const topProducts = Object.entries(productCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    res.json({
      commissionsToday: +commissionsToday.toFixed(2),
      totalCommissions: +totalCommissions.toFixed(2),
      totalDepositsHeld: +totalDepositsHeld.toFixed(2),
      activeRentals,
      pendingRentals,
      completedRentals,
      disputedRentals,
      totalRentals: allRentals.length,
      topProducts,
    });
  } catch {
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// ── PUT /admin/rentals/:id/deposit ────────────────────────────────────────────
router.put("/admin/rentals/:id/deposit", authenticate, adminOnly, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { depositStatus } = req.body;

    if (!["held", "released", "retained"].includes(depositStatus)) {
      res.status(400).json({ error: "Estado de depósito inválido" }); return;
    }

    const [rental] = await db
      .update(rentalsTable)
      .set({ depositStatus, updatedAt: new Date() })
      .where(eq(rentalsTable.id, id))
      .returning();

    if (!rental) { res.status(404).json({ error: "Alquiler no encontrado" }); return; }

    const depositLabel: Record<string, string> = { held: "En custodia", released: "Devuelto", retained: "Retenido" };
    const msg = `Depósito de "${ rental.productName }" cambiado a: ${depositLabel[depositStatus]}.`;
    await Promise.allSettled([
      createNotification(rental.clientId, "rental_deposit", "Actualización de depósito", msg, undefined, "client", "/store-chat"),
      createNotification(rental.ownerId, "rental_deposit", "Actualización de depósito", msg, undefined, "cohost", "/store-chat"),
    ]);

    res.json({ ok: true, rental });
  } catch {
    res.status(500).json({ error: "Error al actualizar depósito" });
  }
});

// ── PUT /admin/rentals/:id/status ─────────────────────────────────────────────
// On cancellation: unblocks dates in product.blockedDates and notifies all parties.
// On activation: notifies all parties.
router.put("/admin/rentals/:id/status", authenticate, adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  try {
    const { status } = req.body;

    const validStatuses = ["pending", "active", "completed", "disputed", "cancelled"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Estado inválido" }); return;
    }

    // ── Read current state before transaction (for idempotency + state machine) ─
    const [current] = await db.select({ id: rentalsTable.id, status: rentalsTable.status })
      .from(rentalsTable).where(eq(rentalsTable.id, id)).limit(1);

    if (!current) { res.status(404).json({ error: "Alquiler no encontrado" }); return; }

    // ── Idempotency: already in requested state → return without side effects ────
    // Handles duplicate admin clicks / double form submissions gracefully.
    if (current.status === status) {
      logger.info({ op: "rental-status", id, status }, "Idempotent return: already in target status");
      const [rental] = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
      res.json({ ok: true, rental }); return;
    }

    // ── State machine: validate the requested transition ──────────────────────
    // Cancelled is a terminal state — no further transitions allowed.
    if (current.status === "cancelled") {
      res.status(400).json({ error: "No se puede cambiar el estado de un alquiler cancelado" }); return;
    }

    logger.info({ op: "rental-status", id, from: current.status, to: status }, "Starting transaction");

    // ── Update rental status + free blocked dates atomically on cancellation ──
    // Both writes are in a single transaction: if freeing the dates fails,
    // the status change is rolled back — preventing a cancelled-but-still-blocked state.
    //
    // Concurrent protection: the WHERE clause includes `status != target` so if
    // a concurrent request already applied this change, 0 rows are returned and
    // we return idempotently without double-processing cancellation logic.
    const rental = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(rentalsTable)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(rentalsTable.id, id), ne(rentalsTable.status, status)))
        .returning();

      if (!updated) {
        // Concurrent request already applied this transition → signal idempotent return
        throw Object.assign(new Error("Concurrent status update detected"), { code: "ALREADY_UPDATED" });
      }

      if (status === "cancelled") {
        const datesToFree = dateRange(updated.startDate, updated.endDate);
        const [product] = await tx
          .select({ blockedDates: productsTable.blockedDates })
          .from(productsTable)
          .where(eq(productsTable.id, updated.productId))
          .limit(1);

        if (product) {
          const freed = (product.blockedDates ?? []).filter(d => !datesToFree.includes(d));
          await tx
            .update(productsTable)
            .set({ blockedDates: freed, updatedAt: new Date() })
            .where(eq(productsTable.id, updated.productId));
        }
      }

      return updated;
    });

    logger.info({ op: "rental-status", id, status }, "Transaction success");

    // ── Notify all parties (outside transaction — best-effort) ────────────────
    const statusLabel: Record<string, string> = {
      pending: "Pendiente",
      active: "Activo",
      completed: "Completado",
      disputed: "En disputa",
      cancelled: "Cancelado",
    };
    const msg = `El alquiler de "${rental.productName}" fue marcado como: ${statusLabel[status]}.`;

    await Promise.allSettled([
      createNotification(rental.clientId, `rental_${status}`, "Estado de alquiler actualizado", msg, undefined, "client", "/store-chat"),
      createNotification(rental.ownerId, `rental_${status}`, "Estado de alquiler actualizado", msg, undefined, "cohost", "/store-chat"),
    ]);

    res.json({ ok: true, rental });
  } catch (err: any) {
    if (err?.code === "ALREADY_UPDATED") {
      logger.info({ op: "rental-status", id }, "Idempotent return: concurrent update detected inside transaction");
      const [rental] = await db.select().from(rentalsTable).where(eq(rentalsTable.id, id));
      res.json({ ok: true, rental }); return;
    }
    logger.error({ op: "rental-status", id, err }, "Transaction failed");
    res.status(500).json({ error: "Error al actualizar estado" });
  }
});

// ── POST /admin/rentals — create rental ───────────────────────────────────────
// Security hardening:
//   1. Owner is derived from product.coHostId — cannot be spoofed via body.
//   2. productId must exist and be a rental listing.
//   3. Owner must have approved KYC.
//   4. No overlapping active/pending rentals allowed for same product + dates.
//   5. Blocked dates auto-synced on product after creation.
//   6. Notifications sent to owner, client, and admin.
//   7. Delivery order created if hasDelivery = true.
router.post("/admin/rentals", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const {
      productId,
      startDate, endDate, days, dailyRate, weeklyRate,
      subtotal, depositAmount,
      clientNotes, productName, ownerName, clientName,
      hasDelivery, deliveryAddress, pickupAddress,
    } = req.body;

    // ── 1. Validate productId ───────────────────────────────────────────────
    if (!productId || isNaN(parseInt(productId))) {
      res.status(400).json({ error: "productId inválido" }); return;
    }
    const pid = parseInt(productId);

    const [product] = await db
      .select({ id: productsTable.id, coHostId: productsTable.coHostId, listingType: productsTable.listingType, name: productsTable.name, blockedDates: productsTable.blockedDates })
      .from(productsTable)
      .where(and(eq(productsTable.id, pid), eq(productsTable.isActive, true)))
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Producto no encontrado o no activo" }); return;
    }

    // ── 2. Derive ownerId from product (prevent body spoofing) ───────────────
    const ownerId = product.coHostId;

    // ── 3. KYC gate: owner must be verified ──────────────────────────────────
    const ownerVerified = await isKycApproved(ownerId);
    if (!ownerVerified && req.user!.role !== "admin") {
      res.status(403).json({
        error: "El propietario del producto no tiene verificación KYC aprobada. El alquiler no puede procesarse.",
        kycStatus: "not_approved",
      }); return;
    }

    // ── 4. Date overlap check — no double booking ─────────────────────────────
    if (!startDate || !endDate) {
      res.status(400).json({ error: "startDate y endDate son requeridos" }); return;
    }

    const overlapping = await db
      .select({ id: rentalsTable.id })
      .from(rentalsTable)
      .where(
        and(
          eq(rentalsTable.productId, pid),
          not(eq(rentalsTable.status, "cancelled")),
          lte(rentalsTable.startDate, endDate),
          gte(rentalsTable.endDate, startDate),
        )
      )
      .limit(1);

    if (overlapping.length > 0) {
      res.status(409).json({
        error: "El producto ya tiene una reserva activa para esas fechas. Por favor, elige otras fechas.",
        conflict: true,
      }); return;
    }

    // ── 5. Calculate commission and resolve display names ────────────────────
    const commission = +(parseFloat(subtotal) * 0.15).toFixed(2);

    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ownerId)).limit(1);
    const [client] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid)).limit(1);

    // ── 6-7. Atomic transaction: rental + blocked dates + delivery order ──────
    // If any of these writes fails, the whole set is rolled back — no partial state.
    // Notifications are intentionally kept OUTSIDE the transaction: a notification
    // failure must never roll back a successfully created rental.
    const newDates = dateRange(startDate, endDate);
    const existingDates = product.blockedDates ?? [];
    const mergedDates = Array.from(new Set([...existingDates, ...newDates])).sort();

    const rental = await db.transaction(async (tx) => {
      // 6a. Insert rental record
      const [created] = await tx.insert(rentalsTable).values({
        productId: pid,
        clientId: uid,
        ownerId,
        startDate,
        endDate,
        days: parseInt(days),
        dailyRate: parseFloat(dailyRate),
        weeklyRate: weeklyRate != null ? parseFloat(weeklyRate) : null,
        subtotal: parseFloat(subtotal),
        commission,
        depositAmount: parseFloat(depositAmount),
        depositStatus: "held",
        status: "pending",
        clientNotes: clientNotes ?? null,
        productName: productName ?? product.name,
        ownerName: ownerName ?? owner?.name ?? "",
        clientName: clientName ?? client?.name ?? "",
        hasDelivery: !!hasDelivery,
      }).returning();

      // 6b. Block the reserved dates on the product (prevents double booking)
      await tx
        .update(productsTable)
        .set({ blockedDates: mergedDates, updatedAt: new Date() })
        .where(eq(productsTable.id, pid));

      // 6c. Create delivery order inside the transaction if requested
      // If this fails, the rental and blocked dates are rolled back too.
      if (hasDelivery) {
        await tx.insert(deliveryOrdersTable).values({
          rentalId: created.id,
          clientId: uid,
          ownerId,
          productName: created.productName,
          pickupAddress: pickupAddress ?? null,
          deliveryAddress: deliveryAddress ?? null,
          status: "pending_assignment",
        });
      }

      return created;
    });

    // ── 8. Notify owner, client, and admin (outside transaction — best-effort) ─
    const notifMsg = `Se ha creado una solicitud de alquiler para "${rental.productName}" del ${startDate} al ${endDate}.`;
    await Promise.allSettled([
      createNotification(ownerId, "rental_created", "Nueva Solicitud de Alquiler", notifMsg, undefined, "cohost", "/store-chat"),
      createNotification(uid, "rental_created", "Alquiler Solicitado", notifMsg, undefined, "client", "/store-chat"),
      createNotification(1, "rental_created", `Alquiler #${rental.id} creado`, notifMsg, undefined, "admin", "/admin/rentals"),
    ]);

    if (hasDelivery) {
      createNotification(
        1,
        "delivery_order_created",
        "Nueva Orden de Delivery",
        `Alquiler #${rental.id} de "${rental.productName}" requiere asignación de motorizado.`,
        undefined, "admin", "/admin/rentals"
      ).catch(() => {});
    }

    res.status(201).json(rental);
  } catch (err) {
    console.error("[rentals] create error:", err);
    res.status(500).json({ error: "Error al crear alquiler" });
  }
});

// ── PATCH /api/rentals/:id/contract-url ──────────────────────────────────────
// Called by the client after uploading the PDF to Object Storage.
// Only the client or owner of this rental can call this.
router.patch("/rentals/:id/contract-url", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const uid = req.user!.id;
    const { contractUrl } = req.body;

    if (!contractUrl || typeof contractUrl !== "string") {
      res.status(400).json({ error: "contractUrl es requerido" }); return;
    }

    // Verify the requester is a party to this rental
    const [existing] = await db
      .select({ id: rentalsTable.id, clientId: rentalsTable.clientId, ownerId: rentalsTable.ownerId })
      .from(rentalsTable)
      .where(eq(rentalsTable.id, id))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Alquiler no encontrado" }); return; }

    const isParty = existing.clientId === uid || existing.ownerId === uid || req.user!.role === "admin";
    if (!isParty) { res.status(403).json({ error: "Sin acceso a este alquiler" }); return; }

    const [updated] = await db
      .update(rentalsTable)
      .set({ contractUrl, updatedAt: new Date() })
      .where(eq(rentalsTable.id, id))
      .returning();

    res.json({ ok: true, contractUrl: updated.contractUrl });
  } catch {
    res.status(500).json({ error: "Error al guardar contrato" });
  }
});

// ── GET /admin/delivery-orders — admin view of pending deliveries ─────────────
router.get("/admin/delivery-orders", authenticate, adminOnly, async (req, res): Promise<void> => {
  try {
    const { status } = req.query;
    const conditions: any[] = status && typeof status === "string"
      ? [eq(deliveryOrdersTable.status, status)]
      : [];

    const rows = await db
      .select()
      .from(deliveryOrdersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(deliveryOrdersTable.createdAt));

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error al obtener órdenes de delivery" });
  }
});

// ── PUT /admin/delivery-orders/:id/status ────────────────────────────────────
router.put("/admin/delivery-orders/:id/status", authenticate, adminOnly, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { status, assignedDriverId } = req.body;
    const validStatuses = ["pending_assignment", "assigned", "in_transit", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Estado inválido" }); return;
    }

    const [order] = await db
      .update(deliveryOrdersTable)
      .set({ status, ...(assignedDriverId ? { assignedDriverId } : {}), updatedAt: new Date() })
      .where(eq(deliveryOrdersTable.id, id))
      .returning();

    if (!order) { res.status(404).json({ error: "Orden no encontrada" }); return; }

    const statusLabel: Record<string, string> = {
      pending_assignment: "Pendiente de asignación",
      assigned: "Motorizado asignado",
      in_transit: "En camino",
      delivered: "Entregado",
      cancelled: "Cancelado",
    };

    const msg = `Tu entrega de "${order.productName}" está: ${statusLabel[status]}.`;
    await Promise.allSettled([
      createNotification(order.clientId, `delivery_${status}`, "Actualización de Delivery", msg, undefined, "client"),
      createNotification(order.ownerId, `delivery_${status}`, "Actualización de Delivery", msg, undefined, "cohost"),
    ]);

    res.json({ ok: true, order });
  } catch {
    res.status(500).json({ error: "Error al actualizar orden" });
  }
});

export default router;
