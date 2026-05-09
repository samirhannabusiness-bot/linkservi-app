import { Router } from "express";
import { db, premiumRequestsTable, workersTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../lib/auth";
import { createNotification } from "./notifications";

const router = Router();

const DURATION_MAP: Record<number, { days: number; amount: number }> = {
  1:  { days: 30,  amount: 4.99  },
  3:  { days: 90,  amount: 13.47 },
  6:  { days: 180, amount: 23.95 },
  12: { days: 365, amount: 41.92 },
};

// ── Worker: submit premium payment request ────────────────────────────────────

router.post("/premium-requests", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "worker" && req.user!.secondaryRole !== "worker") {
    res.status(403).json({ error: "Solo los profesionales pueden solicitar Premium" });
    return;
  }

  const worker = await db.query.workersTable.findFirst({
    where: eq(workersTable.userId, req.user!.id),
  });
  if (!worker) { res.status(404).json({ error: "Perfil de profesional no encontrado" }); return; }

  const existing = await db.query.premiumRequestsTable.findFirst({
    where: eq(premiumRequestsTable.workerId, worker.id),
  });
  if (existing && existing.status === "pending") {
    res.status(409).json({ error: "Ya tienes una solicitud Premium pendiente de revisión" });
    return;
  }

  const { paymentMethod, transactionRef, receiptUrl, planMonths } = req.body;

  if (!paymentMethod) {
    res.status(400).json({ error: "El método de pago es requerido" });
    return;
  }

  const months = Number(planMonths) || 1;
  const duration = DURATION_MAP[months] ?? DURATION_MAP[1];

  const [created] = await db
    .insert(premiumRequestsTable)
    .values({
      workerId: worker.id,
      userId: req.user!.id,
      paymentMethod,
      transactionRef: transactionRef || null,
      receiptUrl: receiptUrl || null,
      days: duration.days,
      amount: duration.amount,
      status: "pending",
    })
    .returning();

  try {
    await createNotification(
      req.user!.id,
      "premium_request",
      "⭐ Solicitud Premium enviada",
      "Hemos recibido tu pago. El equipo verificará y activará tu cuenta Premium en menos de 24 horas.",
      undefined, undefined,
      `/professional/profile`,
    );
  } catch (_) {}

  res.status(201).json(created);
});

// ── Worker: get own premium requests ─────────────────────────────────────────

router.get("/premium-requests/me", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "worker" && req.user!.secondaryRole !== "worker") {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }

  const worker = await db.query.workersTable.findFirst({
    where: eq(workersTable.userId, req.user!.id),
  });
  if (!worker) { res.json([]); return; }

  const requests = await db
    .select()
    .from(premiumRequestsTable)
    .where(eq(premiumRequestsTable.workerId, worker.id))
    .orderBy(desc(premiumRequestsTable.createdAt));

  res.json(requests);
});

// ── Admin: list all premium requests ─────────────────────────────────────────

router.get("/admin/premium-requests", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      request: premiumRequestsTable,
      user: usersTable,
      worker: workersTable,
    })
    .from(premiumRequestsTable)
    .innerJoin(usersTable, eq(premiumRequestsTable.userId, usersTable.id))
    .innerJoin(workersTable, eq(premiumRequestsTable.workerId, workersTable.id))
    .orderBy(desc(premiumRequestsTable.createdAt));

  res.json(rows.map(({ request: r, user: u, worker: w }) => ({
    id: r.id,
    workerId: r.workerId,
    workerName: u.name,
    workerEmail: u.email,
    paymentMethod: r.paymentMethod,
    transactionRef: r.transactionRef,
    receiptUrl: r.receiptUrl,
    days: r.days,
    amount: r.amount,
    status: r.status,
    adminNotes: r.adminNotes,
    isPremium: w.isPremium,
    premiumUntil: w.premiumUntil,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
});

// ── Admin: approve premium request ───────────────────────────────────────────

router.post("/admin/premium-requests/:id/approve", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);

  const request = await db.query.premiumRequestsTable.findFirst({
    where: eq(premiumRequestsTable.id, id),
  });
  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "pending") {
    res.status(409).json({ error: `La solicitud ya está ${request.status}` });
    return;
  }

  const premiumUntil = new Date(Date.now() + request.days * 24 * 60 * 60 * 1000);

  // Approve request
  const [updated] = await db
    .update(premiumRequestsTable)
    .set({ status: "approved", adminNotes: req.body.adminNotes || null })
    .where(eq(premiumRequestsTable.id, id))
    .returning();

  // Activate premium on worker
  await db
    .update(workersTable)
    .set({ isPremium: true, premiumUntil })
    .where(eq(workersTable.id, request.workerId));

  try {
    await createNotification(
      request.userId,
      "premium_granted",
      "⭐ ¡Tu cuenta es ahora Premium!",
      `Tu pago fue verificado y tu cuenta Premium está activa por ${request.days} días. ¡Ahora apareces primero en las búsquedas!`,
      undefined, undefined,
      `/professional/profile`,
    );
  } catch (_) {}

  res.json({ ...updated, premiumUntil });
});

// ── Admin: reject premium request ────────────────────────────────────────────

router.post("/admin/premium-requests/:id/reject", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);

  const request = await db.query.premiumRequestsTable.findFirst({
    where: eq(premiumRequestsTable.id, id),
  });
  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "pending") {
    res.status(409).json({ error: `La solicitud ya está ${request.status}` });
    return;
  }

  const [updated] = await db
    .update(premiumRequestsTable)
    .set({ status: "rejected", adminNotes: req.body.adminNotes || null })
    .where(eq(premiumRequestsTable.id, id))
    .returning();

  try {
    await createNotification(
      request.userId,
      "premium_rejected",
      "❌ Solicitud Premium rechazada",
      req.body.adminNotes
        ? `Tu solicitud Premium fue rechazada. Motivo: ${req.body.adminNotes}`
        : "Tu solicitud Premium fue rechazada. Por favor contacta al soporte para más información.",
      undefined, undefined,
      `/professional/profile`,
    );
  } catch (_) {}

  res.json(updated);
});

export default router;
