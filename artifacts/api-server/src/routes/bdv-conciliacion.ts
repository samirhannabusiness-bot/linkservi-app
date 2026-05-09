import { Router } from "express";
import {
  db,
  bookingsTable,
  workersTable,
  usersTable,
  categoriesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../lib/auth";
import { createNotification } from "./notifications";
import { logger } from "../lib/logger";

const router = Router();

const BDV_API_URL =
  process.env.BDV_API_URL ??
  "https://bdvconciliacionqa.banvenez.com:444/getMovement/v2";
const BDV_API_KEY = process.env.BDV_API_KEY ?? "";
const BDV_DESTINATION_PHONE =
  process.env.BDV_DESTINATION_PHONE ?? "04127141363";

async function getCurrentBcvRate(): Promise<number> {
  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? 8080}/api/bcv-rate`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const data = await res.json() as { rate: number };
    return data.rate ?? 0;
  } catch {
    return 0;
  }
}

async function enrichBooking(booking: typeof bookingsTable.$inferSelect) {
  const [client] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, booking.clientId));
  const [workerRow] = await db
    .select({ worker: workersTable, user: usersTable })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .where(eq(workersTable.id, booking.workerId));
  const [category] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.id, booking.categoryId));
  return {
    ...booking,
    clientName: client?.name ?? "Cliente",
    workerName: workerRow?.user?.name ?? "Profesional",
    workerUserId: workerRow?.user?.id ?? null,
    categoryName: category?.name ?? "Servicio",
  };
}

// ── POST /api/payments/bdv/verify ─────────────────────────────────────────────
// Client submits Pago Móvil data → BDV verifies in real time →
// if confirmed: booking auto-moves to payment_confirmed (no admin needed)
router.post(
  "/payments/bdv/verify",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.id;
    const {
      bookingId,
      cedulaPagador,
      telefonoPagador,
      referencia,
      fechaPago,
      importe,
      bancoOrigen,
    } = req.body;

    if (
      !bookingId ||
      !cedulaPagador ||
      !telefonoPagador ||
      !referencia ||
      !fechaPago ||
      !importe ||
      !bancoOrigen
    ) {
      res.status(400).json({ error: "Todos los campos son obligatorios" });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId));

    if (!booking) {
      res.status(404).json({ error: "Reserva no encontrada" });
      return;
    }
    if (booking.clientId !== userId) {
      res.status(403).json({ error: "No tienes acceso a esta reserva" });
      return;
    }
    if (booking.status !== "accepted") {
      res.status(400).json({
        error:
          "La reserva no está en estado de pago pendiente (debe estar 'accepted')",
      });
      return;
    }
    if (!BDV_API_KEY) {
      res
        .status(500)
        .json({ error: "API BDV no configurada. Contacta a soporte." });
      return;
    }

    try {
      logger.info({ bookingId, referencia, importe }, "🏦 BDV verify request");

      const bdvRes = await fetch(BDV_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": BDV_API_KEY,
        },
        body: JSON.stringify({
          cedulaPagador,
          telefonoPagador,
          telefonoDestino: BDV_DESTINATION_PHONE,
          referencia,
          fechaPago,
          importe: String(importe),
          bancoOrigen,
          reqCed: false,
        }),
      });

      const bdvData = (await bdvRes.json()) as {
        code: number;
        message: string;
        data?: { status: string; amount: string; reason: string } | null;
        status: number;
      };

      logger.info({ bdvData, bookingId }, "🏦 BDV response");

      if (bdvData.code === 1000) {
        // ── Validate amount against agreed service price (production only) ────
        const isQaEnv = BDV_API_URL.toLowerCase().includes("qa");
        if (!isQaEnv) {
          const servicePrice = booking.agreedPrice ?? booking.totalAmount;
          if (servicePrice && servicePrice > 0) {
            const bcvRate = await getCurrentBcvRate();
            if (bcvRate > 0) {
              const expectedBs = servicePrice * bcvRate;
              const submittedBs = Number(importe);
              const tolerance = 0.10; // allow 10% below for intraday rate fluctuations
              if (submittedBs < expectedBs * (1 - tolerance)) {
                logger.warn(
                  { bookingId, expectedBs: expectedBs.toFixed(2), submittedBs, bcvRate },
                  "⚠️ BDV amount mismatch — possible underpayment"
                );
                res.status(400).json({
                  success: false,
                  confirmed: false,
                  code: "AMOUNT_MISMATCH",
                  error: `El monto verificado (Bs. ${submittedBs.toFixed(2)}) es inferior al precio acordado del servicio (Bs. ${expectedBs.toFixed(2)} a tasa BCV de hoy). Verifica que realizaste el pago completo.`,
                });
                return;
              }
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        const [updated] = await db
          .update(bookingsTable)
          .set({
            status: "payment_confirmed",
            paymentMethod: "pago_movil",
            paymentAmount: Number(importe),
            paymentReference: referencia,
            paymentNote: `BDV verificado automáticamente. Ref: ${referencia} | Cédula: ${cedulaPagador} | Banco: ${bancoOrigen}`,
            paymentRejectedReason: null,
          })
          .where(eq(bookingsTable.id, bookingId))
          .returning();

        const enriched = await enrichBooking(updated);

        await createNotification(
          booking.clientId,
          "payment_confirmed",
          "✅ Pago verificado por BDV",
          `Tu pago de Bs. ${importe} para ${enriched.categoryName} fue verificado automáticamente por el Banco de Venezuela. El profesional puede iniciar el servicio.`,
          bookingId,
          "client"
        );

        if (enriched.workerUserId) {
          await createNotification(
            enriched.workerUserId,
            "payment_confirmed",
            "💰 Pago confirmado — ¡Puedes iniciar!",
            `BDV confirmó el pago de ${enriched.categoryName}. Ya puedes iniciar el trabajo.`,
            bookingId,
            "worker"
          );
        }

        res.json({
          success: true,
          confirmed: true,
          message: "Pago verificado y confirmado automáticamente por BDV",
          amount: bdvData.data?.amount,
          reason: bdvData.data?.reason,
        });
      } else {
        res.json({
          success: false,
          confirmed: false,
          code: bdvData.code,
          message:
            bdvData.message ??
            "No se encontró la transacción. Verifica los datos ingresados.",
        });
      }
    } catch (err: any) {
      logger.error({ err, bookingId }, "BDV API error");
      res
        .status(500)
        .json({
          error:
            "No se pudo conectar con BDV. Intenta de nuevo o usa el método manual.",
          detail: err.message,
        });
    }
  }
);

export default router;
