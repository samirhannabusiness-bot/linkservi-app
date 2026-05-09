import { Router } from "express";
import { db, withdrawalsTable, workersTable, usersTable, bookingsTable } from "@workspace/db";
import { eq, desc, and, inArray, sum, or } from "drizzle-orm";
import { authenticate, requireBasicProfile } from "../lib/auth";
import { createNotification } from "./notifications";

const router = Router();

const MIN_WITHDRAWAL = 5; // USD
const COMMISSION_RATE = 0.10;

// Helpers ─────────────────────────────────────────────────────────────────────

/** Convert a net withdrawal amount to the gross deduction needed on worker.earnings */
function netToGross(netAmount: number) {
  return netAmount / (1 - COMMISSION_RATE); // netAmount / 0.9
}

/** Available net balance = gross earnings * (1 - commission) */
function availableNet(grossEarnings: number) {
  return grossEarnings * (1 - COMMISSION_RATE);
}

// ── Worker: create withdrawal request ────────────────────────────────────────

router.post("/withdrawals", authenticate, requireBasicProfile, async (req, res): Promise<void> => {
  if (req.user!.role !== "worker" && req.user!.secondaryRole !== "worker") {
    res.status(403).json({ error: "Solo los profesionales pueden solicitar retiros" });
    return;
  }

  const { amount, method, paymentDetails } = req.body;
  const netAmount = Number(amount);

  if (!amount || isNaN(netAmount) || netAmount < MIN_WITHDRAWAL) {
    res.status(400).json({ error: `El monto mínimo de retiro es $${MIN_WITHDRAWAL}` });
    return;
  }

  const VALID_METHODS = ["pago_movil", "binance", "zelle"];
  if (!method || !VALID_METHODS.includes(method)) {
    res.status(400).json({ error: "Método de pago inválido" });
    return;
  }

  if (!paymentDetails || typeof paymentDetails !== "object") {
    res.status(400).json({ error: "Datos de pago requeridos" });
    return;
  }

  if (method === "pago_movil") {
    if (!paymentDetails.banco || !paymentDetails.telefono || !paymentDetails.cedula) {
      res.status(400).json({ error: "Pago Móvil requiere banco, teléfono y cédula" });
      return;
    }
  } else if (method === "binance") {
    if (!paymentDetails.binanceId) {
      res.status(400).json({ error: "Binance requiere correo o ID de Binance" });
      return;
    }
  } else if (method === "zelle") {
    if (!paymentDetails.email) {
      res.status(400).json({ error: "Zelle requiere correo electrónico" });
      return;
    }
  }

  // Fetch worker
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
  if (!worker) {
    res.status(404).json({ error: "Perfil de profesional no encontrado" });
    return;
  }

  // Block withdrawals if worker has active disputed bookings
  const activeDisputes = await db.select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.workerId, worker.id),
      or(eq(bookingsTable.status, "disputed"), eq(bookingsTable.status, "dispute_in_review"))
    ));
  if (activeDisputes.length > 0) {
    res.status(403).json({
      error: `No puedes retirar fondos mientras tengas ${activeDisputes.length} disputa(s) activa(s). Espera la resolución del administrador.`,
    });
    return;
  }

  // Check net balance (earnings already includes previous deductions)
  const netBalance = availableNet(worker.earnings);
  if (netAmount > netBalance + 0.001) { // tiny epsilon for float safety
    res.status(400).json({
      error: `Saldo insuficiente. Tu saldo disponible es $${netBalance.toFixed(2)}`,
    });
    return;
  }

  // ── ATOMIC: reserve funds + create record in a single DB transaction ────────
  // If the INSERT fails for any reason, the earnings deduction is rolled back.
  const grossDeduction = netToGross(netAmount);
  const newEarnings = Math.max(0, worker.earnings - grossDeduction);

  let withdrawal: typeof withdrawalsTable.$inferSelect;
  try {
    const result = await db.transaction(async (tx) => {
      await tx.update(workersTable)
        .set({ earnings: newEarnings })
        .where(eq(workersTable.id, worker.id));
      const [w] = await tx.insert(withdrawalsTable).values({
        workerId: worker.id,
        userId: req.user!.id,
        amount: netAmount,
        method,
        paymentDetails: JSON.stringify(paymentDetails),
        status: "pending",
      }).returning();
      return w;
    });
    withdrawal = result;
  } catch (err) {
    res.status(500).json({ error: "Error al procesar el retiro. Tu saldo no fue modificado." });
    return;
  }

  try {
    const METHOD_LABELS: Record<string, string> = { pago_movil: "Pago Móvil", binance: "Binance", zelle: "Zelle" };
    const methodLabel = METHOD_LABELS[method as string] ?? method;
    await createNotification(
      req.user!.id,
      "withdrawal_requested",
      "💸 Solicitud de retiro enviada",
      `Tu solicitud de retiro por $${netAmount.toFixed(2)} vía ${methodLabel} está siendo procesada. Tu saldo fue reservado.`,
      undefined, "worker",
      `/professional/withdrawals`,
    );
  } catch {}

  res.status(201).json({
    ...withdrawal,
    paymentDetails: JSON.parse(withdrawal.paymentDetails),
    remainingBalance: availableNet(newEarnings),
  });
});

// ── Worker: list own withdrawals ─────────────────────────────────────────────

router.get("/withdrawals", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "worker" && req.user!.secondaryRole !== "worker") {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
  if (!worker) { res.json([]); return; }

  const withdrawals = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.workerId, worker.id))
    .orderBy(desc(withdrawalsTable.createdAt));

  res.json(withdrawals.map(w => ({
    ...w,
    paymentDetails: JSON.parse(w.paymentDetails),
  })));
});

// ── Admin: list all withdrawals ───────────────────────────────────────────────

router.get("/admin/withdrawals", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  const withdrawals = await db
    .select({
      withdrawal: withdrawalsTable,
      user: { id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone },
    })
    .from(withdrawalsTable)
    .innerJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
    .orderBy(desc(withdrawalsTable.createdAt));

  res.json(withdrawals.map(({ withdrawal, user }) => ({
    ...withdrawal,
    paymentDetails: JSON.parse(withdrawal.paymentDetails),
    workerName: user.name,
    workerEmail: user.email,
    workerPhone: user.phone,
  })));
});

// ── Admin: approve ────────────────────────────────────────────────────────────
// Earnings already deducted at creation — just change status.

router.post("/admin/withdrawals/:id/approve", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  const id = parseInt(req.params.id as string, 10);
  const [w] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!w) { res.status(404).json({ error: "Retiro no encontrado" }); return; }

  if (w.status !== "pending") {
    res.status(400).json({ error: `No se puede aprobar un retiro en estado "${w.status}"` });
    return;
  }

  const [updated] = await db.update(withdrawalsTable)
    .set({ status: "approved", adminNotes: req.body?.notes ?? null })
    .where(eq(withdrawalsTable.id, id))
    .returning();

  try {
    await createNotification(
      w.userId,
      "withdrawal_approved",
      "✅ Retiro aprobado",
      `Tu retiro por $${w.amount.toFixed(2)} fue aprobado. Recibirás el pago en breve.`,
      undefined, "worker",
      `/professional/withdrawals`,
    );
  } catch {}

  res.json({ ...updated, paymentDetails: JSON.parse(updated.paymentDetails) });
});

// ── Admin: reject ─────────────────────────────────────────────────────────────
// RESTORE the reserved earnings back to the worker.

router.post("/admin/withdrawals/:id/reject", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  const id = parseInt(req.params.id as string, 10);
  const [w] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!w) { res.status(404).json({ error: "Retiro no encontrado" }); return; }

  if (!["pending", "approved"].includes(w.status)) {
    res.status(400).json({ error: `No se puede rechazar un retiro en estado "${w.status}"` });
    return;
  }

  const [updated] = await db.update(withdrawalsTable)
    .set({ status: "rejected", adminNotes: req.body?.notes ?? null })
    .where(eq(withdrawalsTable.id, id))
    .returning();

  // ── RESTORE the reserved earnings back ────────────────────────────────────
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, w.workerId));
  if (worker) {
    const grossRestore = netToGross(w.amount);
    await db.update(workersTable)
      .set({ earnings: worker.earnings + grossRestore })
      .where(eq(workersTable.id, worker.id));
  }

  try {
    const reason = req.body?.notes ? ` Motivo: ${req.body.notes}` : "";
    await createNotification(
      w.userId,
      "withdrawal_rejected",
      "❌ Retiro rechazado — saldo restaurado",
      `Tu solicitud de retiro por $${w.amount.toFixed(2)} no fue aprobada.${reason} El monto fue devuelto a tu saldo.`,
      undefined, "worker",
      `/professional/withdrawals`,
    );
  } catch {}

  res.json({ ...updated, paymentDetails: JSON.parse(updated.paymentDetails) });
});

// ── Admin: mark as paid ───────────────────────────────────────────────────────
// Earnings already deducted at creation — just change status to paid.

router.post("/admin/withdrawals/:id/mark-paid", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  const id = parseInt(req.params.id as string, 10);
  const [w] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!w) { res.status(404).json({ error: "Retiro no encontrado" }); return; }

  if (w.status !== "approved") {
    res.status(400).json({ error: `Solo se pueden marcar como pagados los retiros aprobados (estado actual: "${w.status}")` });
    return;
  }

  const [updated] = await db.update(withdrawalsTable)
    .set({ status: "paid", adminNotes: req.body?.notes ?? w.adminNotes })
    .where(eq(withdrawalsTable.id, id))
    .returning();

  try {
    await createNotification(
      w.userId,
      "withdrawal_paid",
      "💰 ¡Retiro pagado!",
      `Tu retiro por $${w.amount.toFixed(2)} ha sido enviado. Revisa tu cuenta.`,
      undefined, "worker",
      `/professional/withdrawals`,
    );
  } catch {}

  res.json({ ...updated, paymentDetails: JSON.parse(updated.paymentDetails) });
});

export default router;
