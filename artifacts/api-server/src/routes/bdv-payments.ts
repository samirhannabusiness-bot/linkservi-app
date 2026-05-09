import { Router } from "express";
import {
  db,
  bdvPaymentNotificationsTable,
  bdvC2pTransactionsTable,
  bookingsTable,
  productOrdersTable,
  orderGroupsTable,
  customOrdersTable,
  usersTable,
  workersTable,
  transportRidesTable,
  jobSubscriptionsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { authenticate, requireVerifiedEmail } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Server-side pricing tables — the SOLE source of truth for plan amounts ────
// These MUST mirror the UI tables (ClientPlanPage / WorkerPremiumModal /
// CoHostPlanPage). Client-supplied amounts are NEVER trusted.
const CLIENT_PREMIUM_TIERS: Record<number, number> = {
  1: 4.99, 3: 13.47, 6: 23.95, 12: 41.92,
};
const WORKER_PREMIUM_TIERS: Record<number, number> = {
  1: 4.99, 3: 13.47, 6: 23.95, 12: 41.92,
};
const COHOST_PLAN_TIERS: Record<number, number> = {
  1: 20, 3: 54, 6: 96, 12: 168,
};
const JOB_SUBSCRIPTION_TIERS: Record<string, { amountUsd: number; days: number }> = {
  worker_featured:  { amountUsd: 1, days: 30 },
  business_premium: { amountUsd: 2, days: 30 },
};

// Tolerated rounding gap between client-displayed VES and server-recomputed
// VES (BCV rate may have drifted between modal-open and submit). 2% is generous
// but still stops underpayment-to-unlock attempts.
const PRICE_TOLERANCE_PCT = 0.02;

async function getCurrentBcvRate(): Promise<number> {
  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? 8080}/api/bcv-rate`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { rate: number };
    return data.rate ?? 0;
  } catch {
    return 0;
  }
}

// ── Configuración ──────────────────────────────────────────────────────────────
const BDV_C2P_BASE =
  process.env.BDV_C2P_BASE_URL ??
  "https://bdvconciliacionqa.banvenez.com:444/BankMobilePaymentC2P/MultipleAccounts";

const BDV_C2P_API_KEY = process.env.BDV_API_KEY ?? "";

// Clave que nosotros generamos y le damos al banco para autenticar su webhook
const BDV_WEBHOOK_API_KEY = process.env.BDV_WEBHOOK_API_KEY ?? "";

// Datos del comercio (LinkServi)
const COMMERCE_PHONE = process.env.BDV_COMMERCE_PHONE ?? "04148301798";

// ── Helper: llamar al BDV C2P ─────────────────────────────────────────────────
async function bdvC2pFetch(path: string, body: object) {
  const url = `${BDV_C2P_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": BDV_C2P_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return res.json() as Promise<{ code: string; message: string; data: any; status: number }>;
}

// ── POST /api/payments/bdv/notify ─────────────────────────────────────────────
// Webhook: BDV nos avisa cuando entra un pago móvil a nuestra cuenta.
// El banco envía nuestra API key en el header X-API-Key.
// Siempre respondemos 200 con el código correcto (00, 01 o 99).
router.post("/payments/bdv/notify", async (req, res): Promise<void> => {
  const rawPayload = JSON.stringify(req.body);
  const incomingKey = req.headers["x-api-key"] as string | undefined;

  logger.info({ body: req.body }, "BDV webhook received");

  // Validar API key
  if (!incomingKey || incomingKey !== BDV_WEBHOOK_API_KEY) {
    logger.warn({ incomingKey }, "BDV webhook: invalid API key");
    res.status(200).json({
      codigo: "99",
      mensajeCliente: "Corrija el API KEY",
      mensajeSistema: "Error en API KEY",
    });
    return;
  }

  const {
    bancoOrdenante,
    referenciaBancoOrdenante,
    idCliente,
    numeroCliente,
    idComercio,
    numeroComercio,
    fecha,
    hora,
    monto,
  } = req.body;

  if (!referenciaBancoOrdenante || !monto) {
    res.status(200).json({
      codigo: "99",
      mensajeCliente: "Datos incompletos",
      mensajeSistema: "Error en API KEY",
    });
    return;
  }

  try {
    // Idempotencia: verificar si ya procesamos esta referencia
    const existing = await db
      .select({ id: bdvPaymentNotificationsTable.id, status: bdvPaymentNotificationsTable.status })
      .from(bdvPaymentNotificationsTable)
      .where(eq(bdvPaymentNotificationsTable.referenciaBancoOrdenante, referenciaBancoOrdenante))
      .limit(1);

    if (existing.length > 0) {
      logger.info({ referenciaBancoOrdenante }, "BDV webhook: duplicate notification");
      res.status(200).json({
        codigo: "01",
        mensajeCliente: "Pago previamente recibido",
        mensajeSistema: "Renotificado",
      });
      return;
    }

    // Guardar la notificación
    await db.insert(bdvPaymentNotificationsTable).values({
      referenciaBancoOrdenante,
      bancoOrdenante: bancoOrdenante ?? null,
      idCliente: idCliente ?? null,
      numeroCliente: numeroCliente ?? null,
      idComercio: idComercio ?? null,
      numeroComercio: numeroComercio ?? null,
      fecha: fecha ?? null,
      hora: hora ?? null,
      monto: parseFloat(String(monto)),
      status: "received",
      rawPayload,
    });

    logger.info({ referenciaBancoOrdenante, monto }, "BDV webhook: new payment saved");

    res.status(200).json({
      codigo: "00",
      mensajeCliente: "Aprobado",
      mensajeSistema: "Notificado",
    });
  } catch (err: any) {
    logger.error({ err, referenciaBancoOrdenante }, "BDV webhook DB error");
    // Aún así respondemos 200 para que el banco no reintente indefinidamente
    res.status(200).json({
      codigo: "00",
      mensajeCliente: "Aprobado",
      mensajeSistema: "Notificado",
    });
  }
});

// ── GET /api/payments/bdv/notifications ───────────────────────────────────────
// Admin: lista notificaciones recibidas del BDV
router.get("/payments/bdv/notifications", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  const notifications = await db
    .select()
    .from(bdvPaymentNotificationsTable)
    .orderBy(bdvPaymentNotificationsTable.createdAt)
    .limit(100);

  res.json({ notifications });
});

// ── POST /api/payments/bdv/c2p/otp ────────────────────────────────────────────
// Paso 1: Enviar OTP al cliente. El BDV manda la clave de pago al teléfono del cliente.
router.post("/payments/bdv/c2p/otp", authenticate, requireVerifiedEmail, async (req, res): Promise<void> => {
  const { customerDocumentId } = req.body;

  if (!customerDocumentId) {
    res.status(400).json({ error: "Se requiere la cédula del cliente" });
    return;
  }

  try {
    const bdvRes = await bdvC2pFetch("/paymentkey", { customerDocumentId });
    logger.info({ bdvRes, customerDocumentId }, "BDV C2P OTP");

    if (bdvRes.code === "1000") {
      res.json({ success: true, message: "OTP enviado al cliente por el banco" });
    } else {
      res.status(400).json({
        success: false,
        code: bdvRes.code,
        message: bdvRes.message ?? "No se pudo enviar el OTP",
      });
    }
  } catch (err: any) {
    logger.error({ err }, "BDV C2P OTP error");
    res.status(500).json({ error: "No se pudo conectar con BDV", detail: err.message });
  }
});

// ── Domain bridge: aplica efectos en la app tras aprobar el cobro ─────────────
// Cada referenceType marca su entidad como pagada/activada usando los datos del
// banco. Si esto falla, intentamos /annul para devolverle el dinero al cliente.
type DomainResult =
  | { ok: true; details?: any; _domainAppliedInline?: boolean }
  | { ok: false; error: string };

// ── PRICE DERIVATION (server-trusted) ─────────────────────────────────────────
// Returns the authoritative USD amount for a given referenceType+referenceId.
// `metadata` is consulted ONLY for plan tier selection (months); price is
// looked up from the server-side tiers above.
type DerivedPrice =
  | { ok: true; amountUsd: number; planMonths?: number }
  | { ok: false; status: number; error: string };

async function deriveExpectedAmountUsd(args: {
  userId: number;
  referenceType: string;
  referenceId: number | null | undefined;
  metadata: any;
}): Promise<DerivedPrice> {
  const { userId, referenceType, referenceId, metadata } = args;

  switch (referenceType) {
    case "booking": {
      if (!referenceId) return { ok: false, status: 400, error: "Falta referenceId del booking" };
      const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, referenceId)).limit(1);
      if (!b) return { ok: false, status: 404, error: "Booking no encontrado" };
      if (b.clientId !== userId) return { ok: false, status: 403, error: "Este booking no es tuyo" };
      const usd = Number(b.agreedPrice ?? b.totalAmount ?? 0);
      if (!usd || usd <= 0) return { ok: false, status: 400, error: "Booking sin monto definido" };
      return { ok: true, amountUsd: usd };
    }
    case "product_order": {
      if (!referenceId) return { ok: false, status: 400, error: "Falta referenceId del pedido" };
      const [o] = await db.select().from(productOrdersTable).where(eq(productOrdersTable.id, referenceId)).limit(1);
      if (!o) return { ok: false, status: 404, error: "Pedido no encontrado" };
      if (o.clientId !== userId) return { ok: false, status: 403, error: "Este pedido no es tuyo" };
      const usd = Number(o.priceUsdAtMoment ?? 0);
      if (!usd || usd <= 0) return { ok: false, status: 400, error: "Pedido sin precio" };
      return { ok: true, amountUsd: usd };
    }
    case "custom_order": {
      if (!referenceId) return { ok: false, status: 400, error: "Falta referenceId del pedido custom" };
      const [o] = await db.select().from(customOrdersTable).where(eq(customOrdersTable.id, referenceId)).limit(1);
      if (!o) return { ok: false, status: 404, error: "Pedido custom no encontrado" };
      if (o.clientId !== userId) return { ok: false, status: 403, error: "Este pedido no es tuyo" };
      const usd = Number(o.priceUsd ?? 0);
      if (!usd || usd <= 0) return { ok: false, status: 400, error: "Pedido custom sin precio" };
      return { ok: true, amountUsd: usd };
    }
    case "client_premium":
    case "worker_premium": {
      const months = Number(metadata?.planMonths ?? Math.round(Number(metadata?.days ?? 0) / 30));
      const table = referenceType === "client_premium" ? CLIENT_PREMIUM_TIERS : WORKER_PREMIUM_TIERS;
      const usd = table[months];
      if (!usd) return { ok: false, status: 400, error: "Plan inválido. Debe ser 1, 3, 6 o 12 meses." };
      return { ok: true, amountUsd: usd, planMonths: months };
    }
    case "cohost_plan": {
      const months = Number(metadata?.planMonths);
      const usd = COHOST_PLAN_TIERS[months];
      if (!usd) return { ok: false, status: 400, error: "Plan inválido. Debe ser 1, 3, 6 o 12 meses." };
      return { ok: true, amountUsd: usd, planMonths: months };
    }
    case "ride": {
      if (!referenceId) return { ok: false, status: 400, error: "Falta referenceId del viaje" };
      const [r] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, referenceId)).limit(1);
      if (!r) return { ok: false, status: 404, error: "Viaje no encontrado" };
      if (r.clientId !== userId) return { ok: false, status: 403, error: "Este viaje no es tuyo" };
      if (r.status !== "completed") return { ok: false, status: 400, error: "Solo se puede pagar un viaje completado" };
      if (r.paymentStatus === "paid") return { ok: false, status: 409, error: "Este viaje ya fue pagado" };
      const usd = Number(r.fareUsd ?? 0);
      if (!usd || usd <= 0) return { ok: false, status: 400, error: "Viaje sin tarifa definida" };
      return { ok: true, amountUsd: usd };
    }
    case "order_group": {
      if (!referenceId) return { ok: false, status: 400, error: "Falta referenceId del pedido grupal" };
      const [g] = await db.select().from(orderGroupsTable).where(eq(orderGroupsTable.id, referenceId)).limit(1);
      if (!g) return { ok: false, status: 404, error: "Pedido grupal no encontrado" };
      if (g.clientId !== userId) return { ok: false, status: 403, error: "Este pedido no es tuyo" };
      if (g.paymentStatus === "confirmed") return { ok: false, status: 409, error: "Este pedido ya fue pagado" };
      const usd = Number(g.totalUsd ?? 0);
      if (!usd || usd <= 0) return { ok: false, status: 400, error: "Pedido sin monto definido" };
      return { ok: true, amountUsd: usd };
    }
    case "worker_featured":
    case "business_premium": {
      const tier = JOB_SUBSCRIPTION_TIERS[referenceType];
      if (!tier) return { ok: false, status: 400, error: "Tipo de suscripción inválido" };
      return { ok: true, amountUsd: tier.amountUsd };
    }
    default:
      return { ok: false, status: 400, error: `referenceType no soportado: ${referenceType}` };
  }
}

async function applyDomainEffect(args: {
  userId: number;
  referenceType: string | null | undefined;
  referenceId: number | null | undefined;
  metadata: any;
  amountVes: number;
  referencia: string | null;
  endToEndId: string | null;
  /** ID de la transacción C2P recién aprobada — necesario para FK de
      paymentTransactionId en flows de dominio (e.g. ride). */
  transactionId: number;
}): Promise<DomainResult> {
  const { userId, referenceType, referenceId, metadata, referencia, endToEndId } = args;
  if (!referenceType) return { ok: true }; // sin efecto de dominio (cobro genérico)

  const paymentRef = referencia ?? endToEndId ?? null;

  try {
    switch (referenceType) {
      case "booking": {
        if (!referenceId) return { ok: false, error: "Falta referenceId del booking" };
        const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, referenceId)).limit(1);
        if (!b) return { ok: false, error: "Booking no encontrado" };
        if (b.clientId !== userId) return { ok: false, error: "Este booking no es tuyo" };
        if (!["accepted", "payment_pending"].includes(b.status))
          return { ok: false, error: `Booking en estado ${b.status}, no se puede pagar` };
        await db.update(bookingsTable)
          .set({
            status: "payment_confirmed",
            paymentMethod: "c2p",
            paymentReference: paymentRef,
          })
          .where(eq(bookingsTable.id, referenceId));
        return { ok: true, details: { bookingId: referenceId } };
      }

      case "product_order": {
        if (!referenceId) return { ok: false, error: "Falta referenceId del pedido" };
        const [o] = await db.select().from(productOrdersTable).where(eq(productOrdersTable.id, referenceId)).limit(1);
        if (!o) return { ok: false, error: "Pedido no encontrado" };
        if (o.clientId !== userId) return { ok: false, error: "Este pedido no es tuyo" };
        // Valid prior states for C2P payment: accepted (payment requested) or
        // payment_pending (manual proof under review can be superseded by C2P).
        // 'pending' is BEFORE seller acceptance — cannot pay yet.
        if (!["accepted", "payment_pending"].includes(o.status))
          return { ok: false, error: `Pedido en estado ${o.status}, no se puede pagar` };
        await db.update(productOrdersTable)
          .set({ status: "payment_confirmed", paymentMethod: "c2p", paymentReference: paymentRef })
          .where(eq(productOrdersTable.id, referenceId));
        return { ok: true, details: { orderId: referenceId } };
      }

      case "custom_order": {
        if (!referenceId) return { ok: false, error: "Falta referenceId del pedido custom" };
        const [o] = await db.select().from(customOrdersTable).where(eq(customOrdersTable.id, referenceId)).limit(1);
        if (!o) return { ok: false, error: "Pedido custom no encontrado" };
        if (o.clientId !== userId) return { ok: false, error: "Este pedido no es tuyo" };
        if (!["payment_pending", "payment_rejected"].includes(o.status))
          return { ok: false, error: `Pedido en estado ${o.status}, no se puede pagar` };
        await db.update(customOrdersTable)
          .set({ status: "paid", paymentMethod: "c2p" })
          .where(eq(customOrdersTable.id, referenceId));
        return { ok: true, details: { customOrderId: referenceId } };
      }

      case "client_premium": {
        // Months trusted from server-derived price step (metadata.planMonths
        // already validated against CLIENT_PREMIUM_TIERS).
        const months = Number(metadata?.planMonths);
        if (!months || ![1, 3, 6, 12].includes(months))
          return { ok: false, error: "Plan inválido" };
        const days = months * 30;
        const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await db.update(usersTable)
          .set({
            clientPlan: "premium",
            clientPremiumUntil: until,
            clientPremiumDiscount: 0.05,
          })
          .where(eq(usersTable.id, userId));
        return { ok: true, details: { activatedUntil: until.toISOString(), months } };
      }

      case "worker_premium": {
        const months = Number(metadata?.planMonths);
        if (!months || ![1, 3, 6, 12].includes(months))
          return { ok: false, error: "Plan inválido" };
        const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, userId)).limit(1);
        if (!worker) return { ok: false, error: "No tienes perfil de profesional" };
        const days = months * 30;
        const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await db.update(workersTable)
          .set({ isPremium: true, premiumUntil: until })
          .where(eq(workersTable.id, worker.id));
        return { ok: true, details: { workerId: worker.id, activatedUntil: until.toISOString(), months } };
      }

      case "cohost_plan": {
        const planMonths = Number(metadata?.planMonths);
        if (!planMonths || ![1, 3, 6, 12].includes(planMonths))
          return { ok: false, error: "metadata.planMonths debe ser 1, 3, 6 o 12" };
        const until = new Date(Date.now() + planMonths * 30 * 24 * 60 * 60 * 1000);
        await db.update(usersTable)
          .set({ cohostPlan: "premium", cohostPlanExpiresAt: until })
          .where(eq(usersTable.id, userId));
        return { ok: true, details: { activatedUntil: until.toISOString(), planMonths } };
      }

      case "worker_featured":
      case "business_premium": {
        const tier = JOB_SUBSCRIPTION_TIERS[referenceType];
        if (!tier) return { ok: false, error: "Tipo de suscripción inválido" };
        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + tier.days * 24 * 60 * 60 * 1000);
        // Caducar pendientes previas del mismo tipo (idempotencia + housekeeping)
        await db.update(jobSubscriptionsTable)
          .set({ status: "expired" })
          .where(and(
            eq(jobSubscriptionsTable.userId, userId),
            eq(jobSubscriptionsTable.type, referenceType),
            eq(jobSubscriptionsTable.status, "pending_payment"),
          ));
        const [sub] = await db.insert(jobSubscriptionsTable).values({
          userId,
          type: referenceType,
          startDate,
          endDate,
          amountUsd: tier.amountUsd,
          status: "active",
        }).returning({ id: jobSubscriptionsTable.id });
        return {
          ok: true,
          details: {
            jobSubscriptionId: sub.id,
            type: referenceType,
            activatedUntil: endDate.toISOString(),
            paymentRef,
          },
        };
      }

      case "order_group": {
        if (!referenceId) return { ok: false, error: "Falta referenceId del pedido grupal" };
        const [g] = await db.select().from(orderGroupsTable).where(eq(orderGroupsTable.id, referenceId)).limit(1);
        if (!g) return { ok: false, error: "Pedido grupal no encontrado" };
        if (g.clientId !== userId) return { ok: false, error: "Este pedido no es tuyo" };
        if (g.paymentStatus === "confirmed") return { ok: true, details: { groupId: referenceId, alreadyConfirmed: true } };
        if (!["pending", "submitted", "rejected"].includes(g.paymentStatus))
          return { ok: false, error: `Pedido en estado ${g.paymentStatus}, no se puede pagar` };
        await db.transaction(async (tx) => {
          await tx.update(orderGroupsTable)
            .set({ paymentStatus: "confirmed", paymentMethod: "c2p", paymentReference: paymentRef, paidAt: new Date() })
            .where(eq(orderGroupsTable.id, referenceId));
          await tx.update(productOrdersTable)
            .set({ status: "payment_confirmed", paymentMethod: "c2p", paymentReference: paymentRef })
            .where(eq(productOrdersTable.groupId, referenceId));
        });
        return { ok: true, details: { groupId: referenceId } };
      }

      case "ride": {
        if (!referenceId) return { ok: false, error: "Falta referenceId del viaje" };
        const [r] = await db.select().from(transportRidesTable).where(eq(transportRidesTable.id, referenceId)).limit(1);
        if (!r) return { ok: false, error: "Viaje no encontrado" };
        if (r.clientId !== userId) return { ok: false, error: "Este viaje no es tuyo" };
        // Idempotencia: si ya está pagado (cobro previo), no recalcular nada
        // ni tocar la fila del ride. Devolvemos ok sin marcar `_domainAppliedInline`
        // para que el caller actualice domainStatus="applied" en ESTA txn nueva.
        if (r.paymentStatus === "paid") {
          return { ok: true, details: { rideId: r.id, alreadyPaid: true } };
        }
        const fareUsd = Number(r.fareUsd ?? 0);
        const commissionPct = Number(r.commissionPct ?? 15);
        const commissionUsd = Math.round(fareUsd * (commissionPct / 100) * 100) / 100;
        const driverEarningsUsd = Math.round((fareUsd - commissionUsd) * 100) / 100;
        // ── Atomicidad ride + txn.domainStatus ──────────────────────────────
        // Persistimos paymentTransactionId y marcamos paymentStatus="paid" en
        // la misma transacción en que cerramos bdv_c2p_transactions.domainStatus
        // a "applied". Si una falla, ambas rollback → no quedan estados a
        // medias entre dinero capturado y viaje no actualizado.
        await db.transaction(async (tx) => {
          await tx.update(transportRidesTable)
            .set({
              paymentStatus: "paid",
              commissionUsd,
              driverEarningsUsd,
              paidAt: new Date(),
              paymentTransactionId: args.transactionId,
            })
            .where(eq(transportRidesTable.id, r.id));
          await tx.update(bdvC2pTransactionsTable)
            .set({ domainStatus: "applied", updatedAt: new Date() })
            .where(eq(bdvC2pTransactionsTable.id, args.transactionId));
        });
        return {
          ok: true,
          details: {
            rideId: r.id,
            fareUsd,
            commissionUsd,
            driverEarningsUsd,
            commissionPct,
            paymentTransactionId: args.transactionId,
          },
          _domainAppliedInline: true,
        };
      }

      default:
        return { ok: false, error: `referenceType no soportado: ${referenceType}` };
    }
  } catch (err: any) {
    logger.error({ err, referenceType, referenceId }, "Domain effect failed");
    return { ok: false, error: err?.message ?? "Error aplicando efecto de dominio" };
  }
}

// ── POST /api/payments/bdv/c2p/process ────────────────────────────────────────
// Paso 2: Procesar el cobro C2P con el OTP que ingresó el cliente.
// Si la operación tiene referenceType, después de aprobar el cobro aplicamos
// la acción de dominio (marcar booking pagado, activar premium, etc.).
// Si la acción falla, intentamos anular para devolverle el dinero al cliente.
router.post("/payments/bdv/c2p/process", authenticate, requireVerifiedEmail, async (req, res): Promise<void> => {
  const {
    customerDocumentId,
    customerPhone,
    amount: clientAmountRaw,
    customerBankCode,
    concept,
    otp,
    referenceType,
    referenceId,
    metadata,
  } = req.body;

  if (!customerDocumentId || !customerPhone || !customerBankCode || !otp) {
    res.status(400).json({ error: "Faltan campos obligatorios" });
    return;
  }

  // ── 1. Server-side authoritative price derivation ────────────────────────────
  // For any referenceType we IGNORE the client-supplied amount and recompute
  // it from the database (booking/order) or from the server-side plan tier
  // tables. The client value is only used as a sanity check.
  let amountVes: number;
  // Canonical metadata — populated by the server, NOT trusted from the client.
  let canonicalMetadata: Record<string, any> = {};
  if (referenceType) {
    const rate = await getCurrentBcvRate();
    if (rate <= 0) {
      res.status(503).json({ error: "Tasa BCV no disponible. Intenta en unos segundos." });
      return;
    }
    const derived = await deriveExpectedAmountUsd({
      userId: req.user!.id,
      referenceType,
      referenceId,
      metadata,
    });
    if (!derived.ok) {
      res.status(derived.status).json({ error: derived.error });
      return;
    }
    const expectedVes = derived.amountUsd * rate;
    amountVes = Math.round(expectedVes * 100) / 100;

    // Build server-trusted metadata. For premium/cohost we set planMonths
    // canonically (overriding any client value, including the legacy `days`
    // shape) so applyDomainEffect always activates the correct duration.
    if (derived.planMonths) {
      canonicalMetadata = { planMonths: derived.planMonths, expectedAmountUsd: derived.amountUsd };
    } else {
      canonicalMetadata = { expectedAmountUsd: derived.amountUsd };
    }

    // Sanity check vs client value to detect tampering or rate drift.
    const clientVes = parseFloat(String(clientAmountRaw ?? expectedVes));
    if (Number.isFinite(clientVes) && clientVes > 0) {
      const drift = Math.abs(clientVes - expectedVes) / expectedVes;
      if (drift > PRICE_TOLERANCE_PCT) {
        logger.warn(
          { userId: req.user!.id, referenceType, referenceId, expectedVes, clientVes, drift },
          "C2P: client amount differs from server-derived — using server value",
        );
      }
    }

  } else {
    // Generic charge (no referenceType) — use client-supplied amount.
    amountVes = parseFloat(String(clientAmountRaw));
    if (!Number.isFinite(amountVes) || amountVes <= 0) {
      res.status(400).json({ error: "Monto inválido" });
      return;
    }
  }

  // Use canonical metadata for premium/cohost so the domain effect is correct.
  // For non-plan referenceTypes we also include any safe client metadata.
  const effectiveMetadata = referenceType
    ? canonicalMetadata
    : (metadata && typeof metadata === "object" ? metadata : {});
  const metadataStr = JSON.stringify(effectiveMetadata);

  // ── 2. Race-safe idempotency + insert pending row ──────────────────────────
  // We need: (a) only one /process attempt in-flight per (refType, refId)
  // for booking/product/custom orders, and (b) reject if already paid.
  //
  // Strategy: open a SHORT db transaction, take a per-reference advisory
  // transaction lock (auto-released on COMMIT — same session guaranteed by
  // Drizzle's transaction client), check for any blocking row, and insert
  // the new "pending" row. Concurrent callers either block on the lock and
  // then see the new pending row (→ 409), or race ahead and lose the
  // pre-check on this commit.
  //
  // After commit, the long-running BDV call happens outside the transaction
  // so we don't hold a DB connection for seconds. The "pending" row itself
  // serves as the persistent guard against a second concurrent attempt.
  let txn: typeof bdvC2pTransactionsTable.$inferSelect;
  try {
    const inserted = await db.transaction(async (tx) => {
      // Decide the lock+blocker scope for this request:
      //  - booking/product_order/custom_order: lock per (refType, refId).
      //    These are one-shot purchases; any non-annulled approved row OR a
      //    pending row blocks new attempts (avoids duplicate debit).
      //  - client_premium / worker_premium / cohost_plan: lock per (user, refType).
      //    Renewals are allowed (don't block on prior approved+applied), but
      //    we serialize to prevent double-tap charging in the same instant.
      const isRecurringPlan =
        referenceType === "client_premium" ||
        referenceType === "worker_premium" ||
        referenceType === "cohost_plan" ||
        referenceType === "worker_featured" ||
        referenceType === "business_premium";
      const isOneShot =
        referenceType &&
        !isRecurringPlan &&
        !!referenceId;

      if (isOneShot || isRecurringPlan) {
        const lockKey = isOneShot
          ? `c2p:${referenceType}:${referenceId}`
          : `c2p:${referenceType}:user:${req.user!.id}`;
        let h = 0;
        for (let i = 0; i < lockKey.length; i++) h = (h * 31 + lockKey.charCodeAt(i)) | 0;
        // pg_advisory_xact_lock auto-releases on COMMIT/ROLLBACK on the
        // same session — safe with pooled connections inside a tx.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${h}::bigint)`);

        if (isOneShot) {
          const existing = await tx
            .select({
              id: bdvC2pTransactionsTable.id,
              status: bdvC2pTransactionsTable.status,
              domainStatus: bdvC2pTransactionsTable.domainStatus,
              annulled: bdvC2pTransactionsTable.annulled,
            })
            .from(bdvC2pTransactionsTable)
            .where(and(
              eq(bdvC2pTransactionsTable.referenceType, referenceType!),
              eq(bdvC2pTransactionsTable.referenceId, referenceId!),
            ));
          // Block if ANY non-annulled approved row exists (regardless of
          // domainStatus) or any pending row. This prevents a second debit
          // even when the first one's domain effect failed and could not be
          // rolled back — those need manual support handling, not retry.
          const blocking = existing.find(
            (e) =>
              (e.status === "approved" && !e.annulled) ||
              e.status === "pending",
          );
          if (blocking) {
            const err = new Error("C2P_BLOCKING") as Error & { __blocking: typeof blocking };
            (err as any).__blocking = blocking;
            throw err;
          }
        } else {
          // Recurring plan: only block if SAME user has a pending C2P for
          // SAME plan type still in flight (prevents accidental double-tap).
          const existing = await tx
            .select({
              id: bdvC2pTransactionsTable.id,
              status: bdvC2pTransactionsTable.status,
            })
            .from(bdvC2pTransactionsTable)
            .where(and(
              eq(bdvC2pTransactionsTable.referenceType, referenceType!),
              eq(bdvC2pTransactionsTable.initiatedByUserId, req.user!.id),
            ));
          const blocking = existing.find((e) => e.status === "pending");
          if (blocking) {
            const err = new Error("C2P_BLOCKING") as Error & { __blocking: typeof blocking };
            (err as any).__blocking = { ...blocking, status: "pending" };
            throw err;
          }
        }
      }

      const [row] = await tx
        .insert(bdvC2pTransactionsTable)
        .values({
          initiatedByUserId: req.user!.id,
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
          customerDocumentId,
          customerPhone,
          customerBankCode,
          amount: amountVes,
          concept: concept ?? "Pago LinkServi",
          coinType: "VES",
          status: "pending",
          metadata: metadataStr,
        })
        .returning();
      return row;
    });
    txn = inserted;
  } catch (e: any) {
    if (e?.message === "C2P_BLOCKING") {
      const blocking = e.__blocking;
      res.status(409).json({
        error:
          blocking.status === "pending"
            ? "Hay otra solicitud en curso para esta operación. Espera unos segundos."
            : "Esta operación ya fue pagada anteriormente.",
        transactionId: blocking.id,
      });
      return;
    }
    logger.error({ err: e, referenceType, referenceId }, "C2P pre-flight insert failed");
    res.status(500).json({ error: "No se pudo iniciar el cobro. Intenta de nuevo." });
    return;
  }

  try {
    const bdvRes = await bdvC2pFetch("/process", {
      customerDocumentId,
      customerNumberInstrument: customerPhone,
      amount: amountVes.toFixed(2),
      customerBankCode,
      concept: concept ?? "Pago LinkServi",
      otp,
      coinType: "VES",
      operationType: "CELE",
      commerceNumberInstrument: COMMERCE_PHONE,
    });

    logger.info({ bdvRes, txnId: txn.id }, "BDV C2P process response");

    if (bdvRes.code !== "1000") {
      await db.update(bdvC2pTransactionsTable)
        .set({
          status: "rejected",
          bdvCode: bdvRes.code,
          bdvMessage: bdvRes.message,
          updatedAt: new Date(),
        })
        .where(eq(bdvC2pTransactionsTable.id, txn.id));

      res.status(400).json({
        success: false,
        transactionId: txn.id,
        code: bdvRes.code,
        message: bdvRes.message ?? "El banco rechazó el cobro",
      });
      return;
    }

    // Cobro aprobado por el banco
    const endToEndId = bdvRes.data?.endToEndId ?? null;
    const referencia = bdvRes.data?.referencia ?? null;

    await db.update(bdvC2pTransactionsTable)
      .set({
        status: "approved",
        bdvCode: bdvRes.code,
        bdvMessage: bdvRes.message,
        endToEndId,
        referencia,
        bdvDate: bdvRes.data?.date ?? null,
        updatedAt: new Date(),
      })
      .where(eq(bdvC2pTransactionsTable.id, txn.id));

    // Aplicar efecto de dominio (si aplica) — usa metadata canónica del servidor
    const domain = await applyDomainEffect({
      userId: req.user!.id,
      referenceType,
      referenceId,
      metadata: effectiveMetadata,
      amountVes,
      referencia,
      endToEndId,
      transactionId: txn.id,
    });

    if (domain.ok) {
      // Si el case del dominio ya cerró domainStatus="applied" dentro de su
      // propia transacción atómica (e.g. ride), no duplicamos el update aquí.
      if (!domain._domainAppliedInline) {
        await db.update(bdvC2pTransactionsTable)
          .set({ domainStatus: "applied", updatedAt: new Date() })
          .where(eq(bdvC2pTransactionsTable.id, txn.id));
      }

      res.json({
        success: true,
        transactionId: txn.id,
        endToEndId,
        referencia,
        date: bdvRes.data?.date,
        domain: domain.details,
        message: "Pago procesado exitosamente",
      });
      return;
    }

    // El cobro fue exitoso pero el efecto de dominio falló: intentamos anular
    logger.warn({ txnId: txn.id, domainError: domain.error }, "Domain action failed, attempting annul");
    let rollbackOk = false;
    if (endToEndId) {
      try {
        const annulRes = await bdvC2pFetch("/annulment", { endToEndId, referenceOrigin: null });
        if (annulRes.code === "1000") {
          rollbackOk = true;
          await db.update(bdvC2pTransactionsTable)
            .set({ annulled: true, annulledAt: new Date(), updatedAt: new Date() })
            .where(eq(bdvC2pTransactionsTable.id, txn.id));
        }
      } catch (annulErr: any) {
        logger.error({ annulErr, txnId: txn.id }, "Annul attempt failed");
      }
    }

    await db.update(bdvC2pTransactionsTable)
      .set({
        domainStatus: rollbackOk ? "rolled_back" : "domain_failed_no_rollback",
        domainError: domain.error,
        updatedAt: new Date(),
      })
      .where(eq(bdvC2pTransactionsTable.id, txn.id));

    res.status(500).json({
      success: false,
      transactionId: txn.id,
      message: rollbackOk
        ? `El banco aprobó el cobro pero no se pudo activar tu compra: ${domain.error}. Te devolvimos el dinero automáticamente.`
        : `El banco aprobó el cobro pero no se pudo activar tu compra: ${domain.error}. Contacta a soporte con la referencia ${referencia ?? endToEndId ?? "N/A"} para resolverlo.`,
      domainError: domain.error,
      rolledBack: rollbackOk,
    });
  } catch (err: any) {
    await db.update(bdvC2pTransactionsTable)
      .set({ status: "error", bdvMessage: err.message, updatedAt: new Date() })
      .where(eq(bdvC2pTransactionsTable.id, txn.id));

    logger.error({ err, txnId: txn.id }, "BDV C2P process error");
    res.status(500).json({ error: "No se pudo conectar con BDV", detail: err.message });
  }
});

// ── POST /api/payments/bdv/c2p/annul ─────────────────────────────────────────
// Paso 3 (opcional): Anular una transacción C2P aprobada.
// Authz: only the user who initiated the transaction OR an admin may annul.
// Anti-fraud: if the domain effect was already applied (premium activated,
// booking unlocked) we refuse to refund — admins must reverse the domain
// effect first via the admin tools.
router.post("/payments/bdv/c2p/annul", authenticate, async (req, res): Promise<void> => {
  const { transactionId } = req.body;

  if (!transactionId) {
    res.status(400).json({ error: "Se requiere transactionId" });
    return;
  }

  const [txn] = await db
    .select()
    .from(bdvC2pTransactionsTable)
    .where(eq(bdvC2pTransactionsTable.id, transactionId))
    .limit(1);

  if (!txn) {
    res.status(404).json({ error: "Transacción no encontrada" });
    return;
  }

  // Ownership / admin check
  const isOwner = txn.initiatedByUserId === req.user!.id;
  const isAdmin = req.user!.role === "admin";
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Sin acceso a esta transacción" });
    return;
  }

  // Block self-service refund-after-unlock
  if (!isAdmin && txn.domainStatus === "applied") {
    res.status(409).json({
      error:
        "Esta transacción ya activó tu compra. Para reembolso contacta a soporte de LinkServi.",
    });
    return;
  }

  if (!txn.endToEndId) {
    res.status(400).json({ error: "La transacción no tiene endToEndId para anular" });
    return;
  }

  if (txn.annulled) {
    res.status(400).json({ error: "Esta transacción ya fue anulada" });
    return;
  }

  try {
    const bdvRes = await bdvC2pFetch("/annulment", {
      endToEndId: txn.endToEndId,
      referenceOrigin: null,
    });

    logger.info({ bdvRes, txnId: txn.id }, "BDV C2P annul response");

    if (bdvRes.code === "1000") {
      await db
        .update(bdvC2pTransactionsTable)
        .set({ annulled: true, annulledAt: new Date(), updatedAt: new Date() })
        .where(eq(bdvC2pTransactionsTable.id, txn.id));

      res.json({ success: true, message: "Transacción anulada exitosamente" });
    } else {
      res.status(400).json({
        success: false,
        code: bdvRes.code,
        message: bdvRes.message ?? "No se pudo anular",
      });
    }
  } catch (err: any) {
    logger.error({ err, txnId: txn.id }, "BDV C2P annul error");
    res.status(500).json({ error: "No se pudo conectar con BDV", detail: err.message });
  }
});

// ── GET /api/payments/bdv/c2p/transactions ────────────────────────────────────
// Admin: lista transacciones C2P
router.get("/payments/bdv/c2p/transactions", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  const transactions = await db
    .select()
    .from(bdvC2pTransactionsTable)
    .orderBy(bdvC2pTransactionsTable.createdAt)
    .limit(100);

  res.json({ transactions });
});

export default router;
