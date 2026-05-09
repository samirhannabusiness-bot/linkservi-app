import { Router } from "express";
import { db, usersTable, deliveryRequestsTable, deliveryOffersTable } from "@workspace/db";
import { eq, and, inArray, ne, isNotNull, or } from "drizzle-orm";
import { authenticate } from "../../lib/auth";
import { sendPushToUser } from "../push";

const router = Router();

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Notify nearest drivers within radius ─────────────────────────────────────
async function notifyNearbyDrivers(
  requestId: number,
  pickupLat: number,
  pickupLng: number,
  radiusKm: number,
  excludeDriverIds: number[] = [],
  maxDrivers = 8
) {
  const allDrivers = await db
    .select({ id: usersTable.id, name: usersTable.name, lat: usersTable.latitude, lng: usersTable.longitude })
    .from(usersTable)
    .where(
      and(
        isNotNull(usersTable.latitude),
        isNotNull(usersTable.longitude),
        or(
          eq(usersTable.role, "driver"),
          eq(usersTable.secondaryRole, "driver")
        )
      )
    );

  const nearby = allDrivers
    .filter(d => {
      if (!d.lat || !d.lng) return false;
      if (excludeDriverIds.includes(d.id)) return false;
      return haversineKm(pickupLat, pickupLng, d.lat, d.lng) <= radiusKm;
    })
    .sort((a, b) => {
      const da = haversineKm(pickupLat, pickupLng, a.lat!, a.lng!);
      const db2 = haversineKm(pickupLat, pickupLng, b.lat!, b.lng!);
      return da - db2;
    })
    .slice(0, maxDrivers);

  if (nearby.length === 0) return 0;

  await db.insert(deliveryOffersTable).values(
    nearby.map(d => ({ requestId, driverId: d.id, status: "pending" }))
  );

  for (const d of nearby) {
    await sendPushToUser(d.id, {
      title: "📦 Nueva solicitud de delivery",
      body: "Hay una entrega disponible cerca de ti. ¡Acepta rápido!",
      tag: `delivery-${requestId}`,
      url: `/driver/delivery`,
    });
  }

  return nearby.length;
}

// ── POST /api/delivery/requests ───────────────────────────────────────────────
router.post("/delivery/requests", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "client" && user.role !== "worker") {
    res.status(403).json({ error: "Solo clientes pueden solicitar delivery" });
    return;
  }

  const {
    productId, storeId, productName, productImage,
    pickupAddress, pickupLat, pickupLng,
    dropoffAddress, dropoffLat, dropoffLng,
    deliveryFeeUsd = 3, notes,
  } = req.body;

  if (!dropoffAddress || !productName) {
    res.status(400).json({ error: "Dirección de entrega y nombre del producto son requeridos" });
    return;
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  const [request] = await db.insert(deliveryRequestsTable).values({
    productId,
    storeId,
    clientId: user.id,
    productName,
    productImage,
    pickupAddress,
    pickupLat,
    pickupLng,
    dropoffAddress,
    dropoffLat: dropoffLat ?? null,
    dropoffLng: dropoffLng ?? null,
    deliveryFeeUsd,
    platformCommissionUsd: +(deliveryFeeUsd * 0.2).toFixed(2),
    status: "searching",
    currentRadiusKm: 5,
    expiresAt,
  }).returning();

  const lat = pickupLat ?? 10.48;
  const lng = pickupLng ?? -66.87;

  const notified = await notifyNearbyDrivers(request.id, lat, lng, 5);

  res.status(201).json({ ...request, driversNotified: notified });
});

// ── GET /api/delivery/requests/mine ──────────────────────────────────────────
router.get("/delivery/requests/mine", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const rows = await db
    .select()
    .from(deliveryRequestsTable)
    .where(eq(deliveryRequestsTable.clientId, user.id))
    .orderBy(deliveryRequestsTable.createdAt);

  // Enrich assigned requests with driver info
  const result = await Promise.all(rows.map(async (r) => {
    if (!r.assignedDriverId) return r;
    const [driver] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl })
      .from(usersTable).where(eq(usersTable.id, r.assignedDriverId));
    return { ...r, driver };
  }));

  res.json(result);
});

// ── GET /api/delivery/requests/:id ───────────────────────────────────────────
// Client polls for status + triggers radius expansion
router.get("/delivery/requests/:id", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [req2] = await db.select().from(deliveryRequestsTable).where(eq(deliveryRequestsTable.id, id));
  if (!req2) { res.status(404).json({ error: "Not found" }); return; }

  const user = req.user!;
  if (req2.clientId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Radius expansion: if still searching after 45s with no accepted offer, expand
  if (req2.status === "searching") {
    const ageMs = Date.now() - new Date(req2.createdAt).getTime();
    const lastExpansion = req2.lastExpansionAt ? Date.now() - new Date(req2.lastExpansionAt).getTime() : ageMs;
    const MAX_RADIUS_KM = 25;

    if (lastExpansion > 45_000 && req2.currentRadiusKm < MAX_RADIUS_KM) {
      const newRadius = Math.min(req2.currentRadiusKm + 4, MAX_RADIUS_KM);
      const already = await db
        .select({ driverId: deliveryOffersTable.driverId })
        .from(deliveryOffersTable)
        .where(eq(deliveryOffersTable.requestId, id));
      const excludeIds = already.map(o => o.driverId);

      const lat = req2.pickupLat ?? 10.48;
      const lng = req2.pickupLng ?? -66.87;

      await notifyNearbyDrivers(req2.id, lat, lng, newRadius, excludeIds);
      await db.update(deliveryRequestsTable)
        .set({ currentRadiusKm: newRadius, lastExpansionAt: new Date() })
        .where(eq(deliveryRequestsTable.id, id));

      // Mark as expired if max radius reached and still no driver
      if (newRadius >= MAX_RADIUS_KM) {
        await db.update(deliveryRequestsTable)
          .set({ status: "expired" })
          .where(and(eq(deliveryRequestsTable.id, id), eq(deliveryRequestsTable.status, "searching")));
      }
    }
  }

  const [updated] = await db.select().from(deliveryRequestsTable).where(eq(deliveryRequestsTable.id, id));

  let driver = null;
  if (updated.assignedDriverId) {
    [driver] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl })
      .from(usersTable).where(eq(usersTable.id, updated.assignedDriverId));
  }

  res.json({ ...updated, driver });
});

// ── GET /api/delivery/available ───────────────────────────────────────────────
// Driver sees pending offers assigned to them
router.get("/delivery/available", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "driver" && user.secondaryRole !== "driver" && user.role !== "admin") {
    res.status(403).json({ error: "Solo repartidores pueden ver solicitudes" });
    return;
  }

  const offers = await db
    .select({ offer: deliveryOffersTable, request: deliveryRequestsTable })
    .from(deliveryOffersTable)
    .innerJoin(deliveryRequestsTable, eq(deliveryOffersTable.requestId, deliveryRequestsTable.id))
    .where(
      and(
        eq(deliveryOffersTable.driverId, user.id),
        eq(deliveryOffersTable.status, "pending"),
        eq(deliveryRequestsTable.status, "searching")
      )
    )
    .orderBy(deliveryRequestsTable.createdAt);

  res.json(offers.map(r => ({ ...r.request, offerId: r.offer.id })));
});

// ── GET /api/delivery/active ──────────────────────────────────────────────────
// Driver sees their active (assigned) delivery
router.get("/delivery/active", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const rows = await db
    .select()
    .from(deliveryRequestsTable)
    .where(
      and(
        eq(deliveryRequestsTable.assignedDriverId, user.id),
        inArray(deliveryRequestsTable.status, ["assigned", "picked_up", "in_transit"])
      )
    );

  const result = await Promise.all(rows.map(async (r) => {
    const [client] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, r.clientId));
    return { ...r, client };
  }));

  res.json(result);
});

// ── POST /api/delivery/requests/:id/accept ───────────────────────────────────
router.post("/delivery/requests/:id/accept", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role !== "driver" && user.secondaryRole !== "driver") {
    res.status(403).json({ error: "Solo repartidores pueden aceptar solicitudes" });
    return;
  }

  const requestId = Number(req.params.id);
  const [request] = await db.select().from(deliveryRequestsTable).where(eq(deliveryRequestsTable.id, requestId));
  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "searching") { res.status(409).json({ error: "Esta solicitud ya fue asignada o cancelada" }); return; }

  // Verify there's a pending offer for this driver
  const [offer] = await db.select().from(deliveryOffersTable)
    .where(and(eq(deliveryOffersTable.requestId, requestId), eq(deliveryOffersTable.driverId, user.id), eq(deliveryOffersTable.status, "pending")));
  if (!offer) { res.status(403).json({ error: "No tienes oferta activa para esta solicitud" }); return; }

  // Assign driver
  await db.update(deliveryRequestsTable).set({
    status: "assigned",
    assignedDriverId: user.id,
    assignedAt: new Date(),
  }).where(eq(deliveryRequestsTable.id, requestId));

  // Mark this offer as accepted
  await db.update(deliveryOffersTable).set({ status: "accepted", respondedAt: new Date() })
    .where(eq(deliveryOffersTable.id, offer.id));

  // Expire all other pending offers
  await db.update(deliveryOffersTable).set({ status: "expired" })
    .where(and(eq(deliveryOffersTable.requestId, requestId), ne(deliveryOffersTable.id, offer.id), eq(deliveryOffersTable.status, "pending")));

  // Notify client
  await sendPushToUser(request.clientId, {
    title: "🛵 ¡Repartidor encontrado!",
    body: `${user.name} aceptó tu solicitud y está en camino a buscar tu pedido.`,
    tag: `delivery-assigned-${requestId}`,
    url: `/delivery/${requestId}`,
  });

  const [updated] = await db.select().from(deliveryRequestsTable).where(eq(deliveryRequestsTable.id, requestId));
  res.json(updated);
});

// ── POST /api/delivery/requests/:id/reject ───────────────────────────────────
router.post("/delivery/requests/:id/reject", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const requestId = Number(req.params.id);

  await db.update(deliveryOffersTable)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(and(
      eq(deliveryOffersTable.requestId, requestId),
      eq(deliveryOffersTable.driverId, user.id),
      eq(deliveryOffersTable.status, "pending")
    ));

  res.json({ success: true });
});

// ── PUT /api/delivery/requests/:id/status ────────────────────────────────────
router.put("/delivery/requests/:id/status", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const requestId = Number(req.params.id);
  const { status } = req.body as { status: string };

  const allowed = ["picked_up", "in_transit", "delivered", "cancelled"];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }

  const [request] = await db.select().from(deliveryRequestsTable).where(eq(deliveryRequestsTable.id, requestId));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.assignedDriverId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "No autorizado" }); return;
  }

  await db.update(deliveryRequestsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(deliveryRequestsTable.id, requestId));

  const statusMessages: Record<string, { title: string; body: string }> = {
    picked_up:  { title: "📦 Pedido recogido", body: "Tu repartidor ya tiene tu pedido y está en camino." },
    in_transit: { title: "🛵 En camino", body: "Tu pedido está en tránsito. ¡Pronto llegará!" },
    delivered:  { title: "✅ ¡Pedido entregado!", body: "Tu pedido fue entregado exitosamente." },
    cancelled:  { title: "❌ Delivery cancelado", body: "El repartidor canceló el delivery." },
  };

  const msg = statusMessages[status];
  if (msg) {
    await sendPushToUser(request.clientId, { ...msg, tag: `delivery-${requestId}`, url: `/delivery/${requestId}` });
  }

  const [updated] = await db.select().from(deliveryRequestsTable).where(eq(deliveryRequestsTable.id, requestId));
  res.json(updated);
});

// ── POST /api/delivery/requests/:id/cancel ───────────────────────────────────
router.post("/delivery/requests/:id/cancel", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const requestId = Number(req.params.id);

  const [request] = await db.select().from(deliveryRequestsTable).where(eq(deliveryRequestsTable.id, requestId));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.clientId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "No autorizado" }); return;
  }
  if (!["searching", "assigned"].includes(request.status)) {
    res.status(409).json({ error: "No se puede cancelar en este estado" }); return;
  }

  await db.update(deliveryRequestsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(deliveryRequestsTable.id, requestId));

  // Expire all pending offers
  await db.update(deliveryOffersTable)
    .set({ status: "expired" })
    .where(and(eq(deliveryOffersTable.requestId, requestId), eq(deliveryOffersTable.status, "pending")));

  if (request.assignedDriverId) {
    await sendPushToUser(request.assignedDriverId, {
      title: "❌ Delivery cancelado",
      body: "El cliente canceló la solicitud de delivery.",
      tag: `delivery-cancelled-${requestId}`,
    });
  }

  res.json({ success: true });
});

export default router;
