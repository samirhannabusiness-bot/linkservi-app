import { Router } from "express";
import {
  db,
  usersTable,
  driverLocationsTable,
  transportRidesTable,
  rideRatingsTable,
  chatMessagesTable,
  bdvC2pTransactionsTable,
} from "@workspace/db";
import { eq, and, inArray, gte, sql, desc, asc, avg, count } from "drizzle-orm";
import { userHasRole } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { sendPushToUser } from "./push";
import { emitToRoom, getIO } from "../lib/socket";
import { logger } from "../lib/logger";

const router: ReturnType<typeof Router> = Router();

// ── Haversine distance (km) ─────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Single source of truth para "soy conductor". Considera el array canónico
// users.roles[] además de role/secondaryRole legacy. Pasamos el AuthUser
// completo para que userHasRole() pueda inspeccionar las 3 fuentes.
function isDriver(user: { role?: string | null; secondaryRole?: string | null; roles?: string[] | null }): boolean {
  return userHasRole(user as any, "driver");
}

// Validación geográfica: lat/lng finitos y dentro de rangos válidos
function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

// Cuántos minutos consideramos que un heartbeat sigue siendo "activo"
const HEARTBEAT_TTL_MIN = 2;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drivers/heartbeat
// El conductor envía su posición cada 5–10 s mientras está en línea.
// Body: { lat, lng, heading?, speedKph?, isOnline }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/drivers/heartbeat", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!isDriver(user)) {
    res.status(403).json({ error: "Solo conductores pueden enviar heartbeat" });
    return;
  }
  // Verificación progresiva: el conductor debe tener email verificado antes de
  // ponerse online y empezar a recibir solicitudes. No bloqueamos heartbeats
  // con isOnline=false (cierre de sesión) — sólo el "go online" real.
  const wantsOnline = req.body?.isOnline !== false;
  if (wantsOnline && !user.emailVerified) {
    res.status(403).json({
      error: "Debes verificar tu correo para activarte como conductor",
      code: "EMAIL_NOT_VERIFIED",
      action: { label: "Verificar ahora", href: "/verify-email" },
    });
    return;
  }

  const { lat, lng, heading, speedKph, isOnline } = req.body as {
    lat: number; lng: number; heading?: number; speedKph?: number; isOnline?: boolean;
  };

  if (!isValidLatLng(lat, lng)) {
    res.status(400).json({ error: "lat y lng deben ser coordenadas válidas" });
    return;
  }
  if (heading !== undefined && heading !== null && (typeof heading !== "number" || !Number.isFinite(heading))) {
    res.status(400).json({ error: "heading inválido" }); return;
  }
  if (speedKph !== undefined && speedKph !== null && (typeof speedKph !== "number" || !Number.isFinite(speedKph) || speedKph < 0)) {
    res.status(400).json({ error: "speedKph inválido" }); return;
  }

  const online = isOnline !== false;
  const now = new Date();

  // Upsert (insert ... on conflict do update). driverId es PK.
  await db
    .insert(driverLocationsTable)
    .values({
      driverId: user.id,
      lat,
      lng,
      heading: heading ?? null,
      speedKph: speedKph ?? null,
      isOnline: online,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: driverLocationsTable.driverId,
      set: {
        lat,
        lng,
        heading: heading ?? null,
        speedKph: speedKph ?? null,
        isOnline: online,
        updatedAt: now,
      },
    });

  // Emite a todos los clientes que estén mirando el mapa de transporte
  const payload = {
    driverId: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    lat,
    lng,
    heading: heading ?? null,
    isOnline: online,
    updatedAt: now.toISOString(),
  };
  emitToRoom("transport:nearby", "driver:location", payload);

  // Si está en un viaje activo, emite también a la sala del viaje
  const [activeRide] = await db
    .select({ id: transportRidesTable.id })
    .from(transportRidesTable)
    .where(
      and(
        eq(transportRidesTable.driverId, user.id),
        inArray(transportRidesTable.status, ["accepted", "in_progress"]),
      ),
    )
    .limit(1);
  if (activeRide) {
    emitToRoom(`ride:${activeRide.id}`, "driver:location", payload);
  }

  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drivers/offline — el conductor cierra sesión / sale de línea
// ─────────────────────────────────────────────────────────────────────────────
router.post("/drivers/offline", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!isDriver(user)) {
    res.status(403).json({ error: "Solo conductores" });
    return;
  }
  await db
    .update(driverLocationsTable)
    .set({ isOnline: false, updatedAt: new Date() })
    .where(eq(driverLocationsTable.driverId, user.id));
  emitToRoom("transport:nearby", "driver:offline", { driverId: user.id });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drivers/nearby?lat=...&lng=...&radius=5
// Devuelve conductores online dentro del radio (km), ordenados por cercanía.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/drivers/nearby", authenticate, async (req, res): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(Math.max(Number(req.query.radius ?? 5), 0.1), 50);

  if (!isValidLatLng(lat, lng)) {
    res.status(400).json({ error: "lat y lng deben ser coordenadas válidas" });
    return;
  }
  if (!Number.isFinite(radius)) {
    res.status(400).json({ error: "radius inválido" }); return;
  }

  const since = new Date(Date.now() - HEARTBEAT_TTL_MIN * 60 * 1000);
  const rows = await db
    .select({
      driverId: driverLocationsTable.driverId,
      lat: driverLocationsTable.lat,
      lng: driverLocationsTable.lng,
      heading: driverLocationsTable.heading,
      updatedAt: driverLocationsTable.updatedAt,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(driverLocationsTable)
    .innerJoin(usersTable, eq(usersTable.id, driverLocationsTable.driverId))
    .where(
      and(
        eq(driverLocationsTable.isOnline, true),
        gte(driverLocationsTable.updatedAt, since),
      ),
    );

  const nearby = rows
    .map(r => ({ ...r, distanceKm: haversineKm(lat, lng, r.lat, r.lng) }))
    .filter(r => r.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 50);

  res.json(nearby);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transport/rides — el cliente solicita un viaje
// ─────────────────────────────────────────────────────────────────────────────
router.post("/transport/rides", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  // Verificación progresiva: solicitar un viaje notifica a todos los conductores
  // online y crea costo operativo / spam si no se exige verificación.
  if (!user.emailVerified) {
    res.status(403).json({
      error: "Debes verificar tu correo para solicitar viajes",
      code: "EMAIL_NOT_VERIFIED",
      action: { label: "Verificar ahora", href: "/verify-email" },
    });
    return;
  }
  const {
    pickupAddress, pickupLat, pickupLng,
    dropoffAddress, dropoffLat, dropoffLng,
    fareUsd, notes,
  } = req.body as {
    pickupAddress: string; pickupLat: number; pickupLng: number;
    dropoffAddress: string; dropoffLat: number; dropoffLng: number;
    fareUsd?: number; notes?: string;
  };

  if (
    typeof pickupAddress !== "string" || !pickupAddress.trim() ||
    typeof dropoffAddress !== "string" || !dropoffAddress.trim() ||
    !isValidLatLng(pickupLat, pickupLng) ||
    !isValidLatLng(dropoffLat, dropoffLng)
  ) {
    res.status(400).json({ error: "Pickup y dropoff (dirección + coordenadas) son requeridos y deben ser válidos" });
    return;
  }
  if (fareUsd !== undefined && fareUsd !== null && (typeof fareUsd !== "number" || !Number.isFinite(fareUsd) || fareUsd < 0 || fareUsd > 10_000)) {
    res.status(400).json({ error: "fareUsd inválido" }); return;
  }

  // Bloquea al cliente si ya tiene un viaje activo
  const existing = await db
    .select({ id: transportRidesTable.id, status: transportRidesTable.status })
    .from(transportRidesTable)
    .where(
      and(
        eq(transportRidesTable.clientId, user.id),
        inArray(transportRidesTable.status, ["searching", "accepted", "in_progress"]),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Ya tienes un viaje en curso", rideId: existing[0].id });
    return;
  }

  const distanceKm = +haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng).toFixed(2);
  const fare = typeof fareUsd === "number" && fareUsd > 0
    ? fareUsd
    : +Math.max(2, distanceKm * 0.8 + 1).toFixed(2);

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min para encontrar conductor

  let ride: typeof transportRidesTable.$inferSelect;
  try {
    const inserted = await db
      .insert(transportRidesTable)
      .values({
        clientId: user.id,
        pickupAddress, pickupLat, pickupLng,
        dropoffAddress, dropoffLat, dropoffLng,
        status: "searching",
        fareUsd: fare,
        distanceKm,
        notes: notes ?? null,
        expiresAt,
      })
      .returning();
    ride = inserted[0];
  } catch (err) {
    // 23505 = unique_violation (índice parcial ride_unique_active_client_idx)
    // postgres-js a veces anida el código en err.cause; chequeamos ambos
    // niveles + fallback por message para no degradar a 500 bajo concurrencia.
    const e = err as { code?: string; cause?: { code?: string }; message?: string } | null;
    const code = e?.code ?? e?.cause?.code;
    if (code === "23505" || (typeof e?.message === "string" && e.message.includes("23505"))) {
      res.status(409).json({ error: "Ya tienes un viaje en curso" });
      return;
    }
    throw err;
  }

  // Notifica push a conductores cercanos online
  const since = new Date(Date.now() - HEARTBEAT_TTL_MIN * 60 * 1000);
  const onlineDrivers = await db
    .select({
      driverId: driverLocationsTable.driverId,
      lat: driverLocationsTable.lat,
      lng: driverLocationsTable.lng,
    })
    .from(driverLocationsTable)
    .where(and(eq(driverLocationsTable.isOnline, true), gte(driverLocationsTable.updatedAt, since)));

  const candidateRadiusKm = 7;
  const targets = onlineDrivers
    .map(d => ({ ...d, distance: haversineKm(pickupLat, pickupLng, d.lat, d.lng) }))
    .filter(d => d.distance <= candidateRadiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  for (const t of targets) {
    await sendPushToUser(t.driverId, {
      title: "🚗 Nueva carrera disponible",
      body: `Pickup a ${t.distance.toFixed(1)} km · ${pickupAddress}`,
      tag: `ride-${ride.id}`,
      url: "/driver/transport",
    });
  }

  // Emite la oferta solo a la sala protegida de conductores (no a clientes).
  // `transport:drivers` requiere role==="driver" en el JWT (validado en socket.ts).
  emitToRoom("transport:drivers", "ride:request", {
    rideId: ride.id,
    pickupAddress, pickupLat, pickupLng,
    dropoffAddress, dropoffLat, dropoffLng,
    fareUsd: fare,
    distanceKm,
  });

  res.status(201).json({ ...ride, driversNotified: targets.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transport/rides/active — viaje activo del usuario actual
// (cliente o conductor)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transport/rides/active", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;

  const isClientSide = !isDriver(user);
  const filterField = isClientSide ? transportRidesTable.clientId : transportRidesTable.driverId;

  const [ride] = await db
    .select()
    .from(transportRidesTable)
    .where(
      and(
        eq(filterField, user.id),
        inArray(transportRidesTable.status, ["searching", "accepted", "in_progress"]),
      ),
    )
    .orderBy(sql`${transportRidesTable.createdAt} DESC`)
    .limit(1);

  if (!ride) { res.json(null); return; }

  // Adjunta info del otro lado del viaje
  let driver = null;
  let client = null;
  if (ride.driverId) {
    [driver] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ride.driverId));
  }
  [client] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, ride.clientId));

  res.json({ ...ride, driver, client });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transport/rides/:id — detalle de un viaje (cualquier estado)
// Permisos: cliente, conductor del viaje o admin.
// Necesario para que ActiveRidePage pueda mostrar el viaje aún cuando ya está
// completado (la consulta /active filtra completed/cancelled).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transport/rides/:id", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }

  const [ride] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  if (!ride) { res.status(404).json({ error: "Viaje no encontrado" }); return; }

  const isAdmin = user.role === "admin";
  if (!isAdmin && user.id !== ride.clientId && user.id !== ride.driverId) {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }

  let driver = null;
  let client = null;
  if (ride.driverId) {
    [driver] = await db.select({
      id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl,
    }).from(usersTable).where(eq(usersTable.id, ride.driverId));
  }
  [client] = await db.select({
    id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(eq(usersTable.id, ride.clientId));

  // ── paymentIssue ─────────────────────────────────────────────────────────
  // Si existe una transacción C2P para este ride en estado "domain_failed_no_rollback"
  // (banco aprobó el cobro pero no se pudo activar el pago Y la anulación falló),
  // el cliente ya está debitado. La UI debe mostrar tarjeta de soporte en lugar
  // del botón "Pagar" (el backend ya bloquea el reintento en oneShotKey, pero
  // el usuario merece ver la causa). Solo se incluye si el ride NO está pagado.
  let paymentIssue: null | {
    transactionId: number;
    referencia: string | null;
    domainError: string | null;
    createdAt: Date;
  } = null;
  if (ride.paymentStatus !== "paid") {
    const stuck = await db.select({
      id: bdvC2pTransactionsTable.id,
      referencia: bdvC2pTransactionsTable.referencia,
      domainError: bdvC2pTransactionsTable.domainError,
      createdAt: bdvC2pTransactionsTable.createdAt,
    })
      .from(bdvC2pTransactionsTable)
      .where(and(
        eq(bdvC2pTransactionsTable.referenceType, "ride"),
        eq(bdvC2pTransactionsTable.referenceId, ride.id),
        eq(bdvC2pTransactionsTable.domainStatus, "domain_failed_no_rollback"),
      ))
      .orderBy(desc(bdvC2pTransactionsTable.createdAt))
      .limit(1);
    if (stuck.length > 0) {
      paymentIssue = {
        transactionId: stuck[0].id,
        referencia: stuck[0].referencia,
        domainError: stuck[0].domainError,
        createdAt: stuck[0].createdAt,
      };
    }
  }

  res.json({ ...ride, driver, client, paymentIssue });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transport/rides/:id/accept — el conductor acepta
// ─────────────────────────────────────────────────────────────────────────────
router.post("/transport/rides/:id/accept", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!isDriver(user)) {
    res.status(403).json({ error: "Solo conductores pueden aceptar carreras" });
    return;
  }
  // Verificación progresiva: aceptar carreras es una acción crítica con dinero
  // y contraparte humana. Aunque heartbeat ya gatea ponerse online, blindamos
  // también accept para defensa en capas (si el socket alguna vez bypassea
  // el flujo de heartbeat).
  if (!user.emailVerified) {
    res.status(403).json({
      error: "Debes verificar tu correo para aceptar carreras",
      code: "EMAIL_NOT_VERIFIED",
      action: { label: "Verificar ahora", href: "/verify-email" },
    });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }

  // Bloquear si el conductor ya tiene un viaje activo (chequeo previo).
  // Aún si dos requests pasaran simultáneamente, el UPDATE atómico de abajo
  // garantiza que solo uno gana la carrera.
  const [conflict] = await db
    .select({ id: transportRidesTable.id })
    .from(transportRidesTable)
    .where(
      and(
        eq(transportRidesTable.driverId, user.id),
        inArray(transportRidesTable.status, ["accepted", "in_progress"]),
      ),
    )
    .limit(1);
  if (conflict) {
    res.status(409).json({ error: "Ya tienes un viaje activo. Termínalo primero." });
    return;
  }

  // ── UPDATE CONDICIONAL ATÓMICO ──────────────────────────────────────────
  // Solo actualizamos si el viaje sigue en `searching` y aún no tiene driver.
  // Si dos conductores compiten por el MISMO ride, solo el primero recibe
  // filas afectadas; el segundo recibe 0 filas → 409.
  // Si el MISMO driver intenta aceptar dos rides distintos en paralelo, el
  // índice parcial `ride_unique_active_driver_idx` lanza 23505 → 409.
  let accepted: (typeof transportRidesTable.$inferSelect)[];
  try {
    accepted = await db
      .update(transportRidesTable)
      .set({ status: "accepted", driverId: user.id, acceptedAt: new Date() })
      .where(
        and(
          eq(transportRidesTable.id, id),
          eq(transportRidesTable.status, "searching"),
          sql`${transportRidesTable.driverId} IS NULL`,
          // No permitir aceptar rides ya expirados (5 min sin matchear)
          sql`(${transportRidesTable.expiresAt} IS NULL OR ${transportRidesTable.expiresAt} > NOW())`,
        ),
      )
      .returning();
  } catch (err) {
    // Mismo manejo robusto que en POST /transport/rides (ver comentario allí).
    const e = err as { code?: string; cause?: { code?: string }; message?: string } | null;
    const code = e?.code ?? e?.cause?.code;
    if (code === "23505" || (typeof e?.message === "string" && e.message.includes("23505"))) {
      res.status(409).json({ error: "Ya tienes un viaje activo. Termínalo primero." });
      return;
    }
    throw err;
  }

  if (accepted.length === 0) {
    // Comprobamos si el ride existe para diferenciar 404 vs 409
    const [exists] = await db
      .select({ id: transportRidesTable.id })
      .from(transportRidesTable)
      .where(eq(transportRidesTable.id, id))
      .limit(1);
    if (!exists) { res.status(404).json({ error: "Viaje no encontrado" }); return; }
    res.status(409).json({ error: "Esta carrera ya no está disponible" });
    return;
  }

  const ride = accepted[0];

  await sendPushToUser(ride.clientId, {
    title: "🚗 ¡Conductor en camino!",
    body: `${user.name} aceptó tu carrera y va hacia el punto de recogida.`,
    tag: `ride-accepted-${id}`,
    url: `/transport/ride/${id}`,
  });

  emitToRoom(`ride:${id}`, "ride:accepted", {
    rideId: id,
    driverId: user.id,
    driverName: user.name,
  });
  // Notifica a otros conductores que la carrera ya no está disponible.
  emitToRoom("transport:drivers", "ride:taken", { rideId: id });

  const [updated] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/transport/rides/:id/status — start | complete
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/transport/rides/:id/status", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const id = Number(req.params.id);
  const { status } = req.body as { status: string };

  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }
  if (!["in_progress", "completed"].includes(status)) {
    res.status(400).json({ error: "Estado inválido" }); return;
  }

  // Authz: solo el driver del ride o admin pueden cambiar estado
  const [ride] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  if (!ride) { res.status(404).json({ error: "Viaje no encontrado" }); return; }
  if (ride.driverId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Solo el conductor asignado puede cambiar el estado" }); return;
  }

  // ── COMPARE-AND-SET ATÓMICO ─────────────────────────────────────────────
  // Incluimos el estado de origen requerido en el WHERE. Si el ride ya está
  // cancelled / completed / cualquier otro estado, el UPDATE devuelve 0
  // filas y respondemos 409 — sin TOCTOU.
  const fromStatus = status === "in_progress" ? "accepted" : "in_progress";
  const patch: Record<string, unknown> = { status };
  if (status === "in_progress") patch.startedAt = new Date();
  if (status === "completed") {
    patch.completedAt = new Date();
    // Pre-cálculo de comisión y ganancia del conductor (auditoría).
    // El cobro real al cliente se hace por C2P aparte; al pagar, applyDomainEffect
    // los recalcula y marca paymentStatus='paid'. Esto solo deja los montos
    // visibles en la UI desde el momento de completado.
    const fareUsd = Number(ride.fareUsd ?? 0);
    const commissionPct = Number(ride.commissionPct ?? 15);
    const commissionUsd = Math.round(fareUsd * (commissionPct / 100) * 100) / 100;
    const driverEarningsUsd = Math.round((fareUsd - commissionUsd) * 100) / 100;
    patch.commissionUsd = commissionUsd;
    patch.driverEarningsUsd = driverEarningsUsd;
  }

  const updatedRows = await db
    .update(transportRidesTable)
    .set(patch)
    .where(
      and(
        eq(transportRidesTable.id, id),
        eq(transportRidesTable.status, fromStatus),
      ),
    )
    .returning();

  if (updatedRows.length === 0) {
    res.status(409).json({
      error: status === "in_progress"
        ? "Solo se puede iniciar un viaje aceptado"
        : "Solo se puede completar un viaje en progreso",
    });
    return;
  }

  if (status === "in_progress") {
    await sendPushToUser(ride.clientId, {
      title: "🚦 Viaje iniciado",
      body: "Tu viaje comenzó. ¡Buen camino!",
      tag: `ride-started-${id}`,
      url: `/transport/ride/${id}`,
    });
  }
  if (status === "completed") {
    await sendPushToUser(ride.clientId, {
      title: "✅ Viaje completado",
      body: "Llegaste a tu destino. ¡Gracias por viajar con LinkServi!",
      tag: `ride-completed-${id}`,
      url: `/transport/ride/${id}`,
    });
  }

  emitToRoom(`ride:${id}`, "ride:status", { rideId: id, status });

  const [updated] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transport/rides/:id/cancel — cliente o conductor cancelan
// ─────────────────────────────────────────────────────────────────────────────
router.post("/transport/rides/:id/cancel", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const id = Number(req.params.id);
  const { reason } = (req.body ?? {}) as { reason?: string };

  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }

  // Authz: solo participantes (cliente, driver) o admin
  const [ride] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  if (!ride) { res.status(404).json({ error: "Viaje no encontrado" }); return; }

  const isParticipant = ride.clientId === user.id || ride.driverId === user.id;
  if (!isParticipant && user.role !== "admin") {
    res.status(403).json({ error: "No participas en este viaje" }); return;
  }

  // ── COMPARE-AND-SET ATÓMICO ─────────────────────────────────────────────
  // Solo cancelamos si el estado actual sigue siendo cancellable.
  // Esto evita race con complete / otra cancelación simultánea.
  const cancelledRows = await db
    .update(transportRidesTable)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: reason ?? null,
    })
    .where(
      and(
        eq(transportRidesTable.id, id),
        inArray(transportRidesTable.status, ["searching", "accepted", "in_progress"]),
      ),
    )
    .returning();

  if (cancelledRows.length === 0) {
    res.status(409).json({ error: "Este viaje ya finalizó" });
    return;
  }

  // Notificar al otro lado
  const otherId = user.id === ride.clientId ? ride.driverId : ride.clientId;
  if (otherId) {
    await sendPushToUser(otherId, {
      title: "❌ Viaje cancelado",
      body: reason || "El viaje fue cancelado.",
      tag: `ride-cancelled-${id}`,
      url: `/transport/ride/${id}`,
    });
  }

  emitToRoom(`ride:${id}`, "ride:status", { rideId: id, status: "cancelled" });

  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transport/rides/:id/rate — calificación post-viaje
// El cliente califica al conductor; el conductor califica al cliente.
// Body: { rating: 1..5, comment?: string }
// La dirección se infiere del rol en el ride: client→driver o driver→client.
// Solo permitido cuando status='completed'. Una calificación por dirección.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/transport/rides/:id/rate", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const id = Number(req.params.id);
  const { rating, comment } = (req.body ?? {}) as { rating?: number; comment?: string };

  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    res.status(400).json({ error: "rating debe ser un entero entre 1 y 5" });
    return;
  }
  const cleanComment = (typeof comment === "string" ? comment.trim() : "").slice(0, 500) || null;

  const [ride] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  if (!ride) { res.status(404).json({ error: "Viaje no encontrado" }); return; }
  if (ride.status !== "completed") {
    res.status(400).json({ error: "Solo se puede calificar un viaje completado" });
    return;
  }

  let direction: "client_to_driver" | "driver_to_client";
  let rateeId: number;
  if (user.id === ride.clientId) {
    if (!ride.driverId) { res.status(400).json({ error: "El viaje no tiene conductor asignado" }); return; }
    direction = "client_to_driver";
    rateeId = ride.driverId;
  } else if (user.id === ride.driverId) {
    direction = "driver_to_client";
    rateeId = ride.clientId;
  } else {
    res.status(403).json({ error: "Solo el cliente o conductor del viaje pueden calificar" });
    return;
  }

  try {
    const [inserted] = await db.insert(rideRatingsTable).values({
      rideId: id,
      raterId: user.id,
      rateeId,
      direction,
      rating: r,
      comment: cleanComment,
    }).returning();
    res.json(inserted);
  } catch (err) {
    // Unique violation (rideId, direction) → ya calificado.
    // postgres-js a veces anida el código en err.cause; chequeamos ambos
    // niveles por seguridad. También nos cubrimos contra mensajes que
    // contengan "23505" cuando el código no esté expuesto.
    const e = err as { code?: string; cause?: { code?: string }; message?: string } | null;
    const code = e?.code ?? e?.cause?.code;
    if (code === "23505" || (typeof e?.message === "string" && e.message.includes("23505"))) {
      res.status(409).json({ error: "Ya calificaste este viaje" });
      return;
    }
    logger.error({ err, rideId: id, userId: user.id }, "Error guardando rating de viaje");
    res.status(500).json({ error: "Error guardando calificación" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transport/rides/:id/rating — devuelve las calificaciones del viaje
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transport/rides/:id/rating", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }

  const [ride] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  if (!ride) { res.status(404).json({ error: "Viaje no encontrado" }); return; }
  if (user.id !== ride.clientId && user.id !== ride.driverId && user.role !== "admin") {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }

  const ratings = await db.select().from(rideRatingsTable).where(eq(rideRatingsTable.rideId, id));
  res.json({
    clientToDriver: ratings.find((x) => x.direction === "client_to_driver") ?? null,
    driverToClient: ratings.find((x) => x.direction === "driver_to_client") ?? null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transport/drivers/:id/rating — promedio público de un conductor
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transport/drivers/:id/rating", authenticate, async (req, res): Promise<void> => {
  const driverId = Number(req.params.id);
  if (!Number.isInteger(driverId) || driverId <= 0) {
    res.status(400).json({ error: "id inválido" }); return;
  }

  const [agg] = await db
    .select({
      avg: avg(rideRatingsTable.rating),
      total: count(rideRatingsTable.id),
    })
    .from(rideRatingsTable)
    .where(and(
      eq(rideRatingsTable.rateeId, driverId),
      eq(rideRatingsTable.direction, "client_to_driver"),
    ));

  res.json({
    average: agg?.avg ? Number(agg.avg) : null,
    total: Number(agg?.total ?? 0),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transport/rides/:id/messages — chat del viaje
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transport/rides/:id/messages", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }

  const [ride] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  if (!ride) { res.status(404).json({ error: "Viaje no encontrado" }); return; }
  if (user.id !== ride.clientId && user.id !== ride.driverId && user.role !== "admin") {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.rideId, id))
    .orderBy(asc(chatMessagesTable.createdAt));
  res.json(messages);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transport/rides/:id/messages — enviar mensaje en el viaje
// Body: { content: string }
// Solo se permite mientras el viaje está activo (accepted | in_progress) o
// recién completado (para confirmar entrega/agradecer).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/transport/rides/:id/messages", authenticate, async (req, res): Promise<void> => {
  const user = req.user!;
  const id = Number(req.params.id);
  const { content } = (req.body ?? {}) as { content?: string };

  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }
  const text = (typeof content === "string" ? content : "").trim().slice(0, 2000);
  if (!text) { res.status(400).json({ error: "Mensaje vacío" }); return; }

  const [ride] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, id));
  if (!ride) { res.status(404).json({ error: "Viaje no encontrado" }); return; }
  if (user.id !== ride.clientId && user.id !== ride.driverId) {
    res.status(403).json({ error: "Solo cliente o conductor pueden chatear" }); return;
  }
  if (!["accepted", "in_progress", "completed"].includes(ride.status)) {
    res.status(400).json({ error: "El viaje no está activo" }); return;
  }
  if (!ride.driverId) {
    res.status(400).json({ error: "Aún no hay conductor asignado" }); return;
  }

  const [msg] = await db.insert(chatMessagesTable).values({
    rideId: id,
    senderId: user.id,
    content: text,
  }).returning();

  // Notifica al otro lado vía socket en la sala del ride
  emitToRoom(`ride:${id}`, "new_message", msg);
  res.json(msg);
});

// Asegúrate de que getIO se invoque tarde para no romper el import en boot
try { void getIO; void logger; } catch { /* noop */ }

export default router;
