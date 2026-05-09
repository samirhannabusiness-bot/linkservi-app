import { Router } from "express";
import { db, productPremiumRequestsTable, productsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { sendProductPremiumApprovedEmail, sendProductPremiumRejectedEmail } from "../../lib/email";

const router = Router();

// ── List all premium requests (admin) ────────────────────────────────────────
router.get("/admin/product-premium", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: productPremiumRequestsTable.id,
        productId: productPremiumRequestsTable.productId,
        productName: productsTable.name,
        productImage: productsTable.image,
        coHostId: productPremiumRequestsTable.coHostId,
        coHostName: usersTable.name,
        months: productPremiumRequestsTable.months,
        amountUsd: productPremiumRequestsTable.amountUsd,
        pagoMovilPhone: productPremiumRequestsTable.pagoMovilPhone,
        pagoMovilBank: productPremiumRequestsTable.pagoMovilBank,
        pagoMovilRef: productPremiumRequestsTable.pagoMovilRef,
        receiptUrl: productPremiumRequestsTable.receiptUrl,
        status: productPremiumRequestsTable.status,
        adminNotes: productPremiumRequestsTable.adminNotes,
        createdAt: productPremiumRequestsTable.createdAt,
        isPremium: productsTable.isPremium,
        premiumUntil: productsTable.premiumUntil,
      })
      .from(productPremiumRequestsTable)
      .leftJoin(productsTable, eq(productPremiumRequestsTable.productId, productsTable.id))
      .leftJoin(usersTable, eq(productPremiumRequestsTable.coHostId, usersTable.id))
      .orderBy(desc(productPremiumRequestsTable.createdAt));

    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to list product premium requests");
    res.status(500).json({ error: "Error al listar solicitudes" });
  }
});

// ── Approve a request ─────────────────────────────────────────────────────────
router.post("/admin/product-premium/:id/approve", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { adminNotes } = req.body;

    const [request] = await db
      .select()
      .from(productPremiumRequestsTable)
      .where(eq(productPremiumRequestsTable.id, id));

    if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (request.status !== "pending") { res.status(400).json({ error: "La solicitud ya fue procesada" }); return; }

    // Compute premiumUntil from current date + requested months
    const premiumUntil = new Date();
    premiumUntil.setMonth(premiumUntil.getMonth() + request.months);

    // Activate premium on the product
    await db
      .update(productsTable)
      .set({ isPremium: true, premiumUntil })
      .where(eq(productsTable.id, request.productId));

    // Mark request as approved
    await db
      .update(productPremiumRequestsTable)
      .set({ status: "approved", adminNotes: adminNotes ?? null })
      .where(eq(productPremiumRequestsTable.id, id));

    // Email the cohost
    {
      const [cohost] = await db.select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, request.coHostId));
      const [product] = await db.select({ name: productsTable.name })
        .from(productsTable).where(eq(productsTable.id, request.productId));
      if (cohost) {
        sendProductPremiumApprovedEmail({
          toEmail:     cohost.email,
          toName:      cohost.name,
          productName: product?.name ?? "tu producto",
          months:      request.months,
          premiumUntil,
        }).catch(err => logger.warn({ err, requestId: id }, "❌ EMAIL FAILED — premium approved"));
      }
    }

    res.json({ ok: true, premiumUntil });
  } catch (err) {
    logger.error({ err }, "Failed to approve product premium");
    res.status(500).json({ error: "Error al aprobar solicitud" });
  }
});

// ── Reject a request ─────────────────────────────────────────────────────────
router.post("/admin/product-premium/:id/reject", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { adminNotes } = req.body;

    const [request] = await db
      .select()
      .from(productPremiumRequestsTable)
      .where(eq(productPremiumRequestsTable.id, id));

    if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    if (request.status !== "pending") { res.status(400).json({ error: "La solicitud ya fue procesada" }); return; }

    await db
      .update(productPremiumRequestsTable)
      .set({ status: "rejected", adminNotes: adminNotes ?? null })
      .where(eq(productPremiumRequestsTable.id, id));

    // Email the cohost
    {
      const [cohost] = await db.select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, request.coHostId));
      const [product] = await db.select({ name: productsTable.name })
        .from(productsTable).where(eq(productsTable.id, request.productId));
      if (cohost) {
        sendProductPremiumRejectedEmail({
          toEmail:     cohost.email,
          toName:      cohost.name,
          productName: product?.name ?? "tu producto",
          reason:      adminNotes ?? null,
        }).catch(err => logger.warn({ err, requestId: id }, "❌ EMAIL FAILED — premium rejected"));
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to reject product premium");
    res.status(500).json({ error: "Error al rechazar solicitud" });
  }
});

export default router;
