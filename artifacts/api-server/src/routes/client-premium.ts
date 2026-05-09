import { Router } from "express";
import { db, clientPremiumRequestsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authenticate, requireRole } from "../lib/auth";
import { createNotification } from "./notifications";

const router = Router();

const CLIENT_PREMIUM_DISCOUNT = 0.05;

const DURATION_MAP: Record<number, { days: number; amount: number }> = {
  1:  { days: 30,  amount: 4.99  },
  3:  { days: 90,  amount: 13.47 },
  6:  { days: 180, amount: 23.95 },
  12: { days: 365, amount: 41.92 },
};

// ── Client: submit premium upgrade request ────────────────────────────────────

router.post("/client-premium-requests", authenticate, async (req, res): Promise<void> => {
  const { paymentMethod, transactionRef, receiptUrl, planMonths } = req.body;
  if (!paymentMethod) {
    res.status(400).json({ error: "El método de pago es requerido" });
    return;
  }

  const months = Number(planMonths) || 1;
  const duration = DURATION_MAP[months] ?? DURATION_MAP[1];

  const existing = await db.query.clientPremiumRequestsTable.findFirst({
    where: eq(clientPremiumRequestsTable.userId, req.user!.id),
  });
  if (existing && existing.status === "pending") {
    res.status(409).json({ error: "Ya tienes una solicitud Premium pendiente de revisión" });
    return;
  }

  const [created] = await db
    .insert(clientPremiumRequestsTable)
    .values({
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
      "client_premium_request",
      "⭐ Solicitud Premium enviada",
      "Hemos recibido tu solicitud. El equipo verificará tu pago y activará tu cuenta Premium en menos de 24 horas.",
      undefined, undefined,
      `/client/plan`,
    );
  } catch (_) {}

  res.status(201).json(created);
});

// ── Client: get own premium requests ─────────────────────────────────────────

router.get("/client-premium-requests/me", authenticate, async (req, res): Promise<void> => {
  const requests = await db
    .select()
    .from(clientPremiumRequestsTable)
    .where(eq(clientPremiumRequestsTable.userId, req.user!.id))
    .orderBy(desc(clientPremiumRequestsTable.createdAt));

  res.json(requests);
});

// ── Admin: list all client premium requests ───────────────────────────────────

router.get("/admin/client-premium-requests", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({ request: clientPremiumRequestsTable, user: usersTable })
    .from(clientPremiumRequestsTable)
    .innerJoin(usersTable, eq(clientPremiumRequestsTable.userId, usersTable.id))
    .orderBy(desc(clientPremiumRequestsTable.createdAt));

  res.json(rows.map(({ request: r, user: u }) => ({
    id: r.id,
    userId: r.userId,
    userName: u.name,
    userEmail: u.email,
    paymentMethod: r.paymentMethod,
    transactionRef: r.transactionRef,
    receiptUrl: r.receiptUrl,
    days: r.days,
    amount: r.amount,
    status: r.status,
    adminNotes: r.adminNotes,
    clientPlan: u.clientPlan,
    clientPremiumUntil: u.clientPremiumUntil,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
});

// ── Admin: approve client premium request ─────────────────────────────────────

router.post("/admin/client-premium-requests/:id/approve", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);

  const request = await db.query.clientPremiumRequestsTable.findFirst({
    where: eq(clientPremiumRequestsTable.id, id),
  });
  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "pending") {
    res.status(409).json({ error: `La solicitud ya está ${request.status}` });
    return;
  }

  const premiumUntil = new Date(Date.now() + request.days * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(clientPremiumRequestsTable)
    .set({ status: "approved", adminNotes: req.body.adminNotes || null })
    .where(eq(clientPremiumRequestsTable.id, id))
    .returning();

  await db
    .update(usersTable)
    .set({
      clientPlan: "premium",
      clientPremiumUntil: premiumUntil,
      clientPremiumDiscount: CLIENT_PREMIUM_DISCOUNT,
    })
    .where(eq(usersTable.id, request.userId));

  try {
    await createNotification(
      request.userId,
      "premium_granted",
      "⭐ ¡Tu cuenta es ahora Premium!",
      `Tu pago fue verificado. Tu cuenta Premium está activa por ${request.days} días. ¡Disfruta tus beneficios exclusivos!`,
      undefined, undefined,
      `/client/plan`,
    );
  } catch (_) {}

  res.json({ ...updated, premiumUntil });
});

// ── Admin: reject client premium request ──────────────────────────────────────

router.post("/admin/client-premium-requests/:id/reject", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);

  const request = await db.query.clientPremiumRequestsTable.findFirst({
    where: eq(clientPremiumRequestsTable.id, id),
  });
  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "pending") {
    res.status(409).json({ error: `La solicitud ya está ${request.status}` });
    return;
  }

  const [updated] = await db
    .update(clientPremiumRequestsTable)
    .set({ status: "rejected", adminNotes: req.body.adminNotes || null })
    .where(eq(clientPremiumRequestsTable.id, id))
    .returning();

  try {
    await createNotification(
      request.userId,
      "premium_rejected",
      "❌ Solicitud Premium rechazada",
      req.body.adminNotes
        ? `Tu solicitud fue rechazada. Motivo: ${req.body.adminNotes}`
        : "Tu solicitud Premium fue rechazada. Contacta al soporte para más información.",
      undefined, undefined,
      `/client/plan`,
    );
  } catch (_) {}

  res.json(updated);
});

// ── Admin: list all clients with premium info ─────────────────────────────────

router.get("/admin/clients", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      clientPlan: usersTable.clientPlan,
      clientPremiumUntil: usersTable.clientPremiumUntil,
      clientPremiumDiscount: usersTable.clientPremiumDiscount,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "client"))
    .orderBy(usersTable.name);

  res.json(users);
});

// ── Admin: directly activate or revoke client premium ─────────────────────────

router.post("/admin/clients/:userId/client-premium", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  const { isPremium, days } = req.body;

  const premiumUntil = isPremium && days
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    : null;

  const [updated] = await db
    .update(usersTable)
    .set({
      clientPlan: isPremium ? "premium" : "free",
      clientPremiumUntil: premiumUntil,
      clientPremiumDiscount: isPremium ? CLIENT_PREMIUM_DISCOUNT : 0,
    })
    .where(and(eq(usersTable.id, userId), eq(usersTable.role, "client")))
    .returning();

  if (!updated) { res.status(404).json({ error: "Cliente no encontrado" }); return; }

  try {
    if (isPremium) {
      await createNotification(
        userId,
        "premium_granted",
        "⭐ ¡Tu cuenta es ahora Premium!",
        `Tu cuenta Premium está activa${days ? ` por ${days} días` : ""}. ¡Disfruta tus beneficios exclusivos!`
      );
    } else {
      await createNotification(
        userId,
        "info",
        "ℹ️ Estado Premium actualizado",
        "Tu plan Premium ha sido actualizado."
      );
    }
  } catch (_) {}

  res.json({
    id: updated.id,
    clientPlan: updated.clientPlan,
    clientPremiumUntil: updated.clientPremiumUntil,
  });
});

export default router;
