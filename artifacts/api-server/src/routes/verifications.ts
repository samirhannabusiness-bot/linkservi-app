import { Router } from "express";
import { db, usersTable, workersTable, userVerificationsTable } from "@workspace/db";
import { eq, ne, sql } from "drizzle-orm";
import { authenticate, requireAdminRole } from "../lib/auth";
import { createNotification } from "./notifications";

const router = Router();

// ── Auto-curador: sincroniza workers pendientes faltantes ────────────────────
// Algunos profesionales subieron sus documentos antes de que existiera la
// tabla unificada `user_verifications` (o el upsert falló por alguna razón
// transitoria). Sin un registro espejo en esa tabla, NO aparecen en la cola
// del admin aunque su estado interno sea "pending". Esta función crea los
// registros faltantes de forma segura: solo INSERT, nunca UPDATE/DELETE,
// y solo para workers con ambas fotos cargadas. Es idempotente y se
// auto-soluciona en cada lectura de la cola.
async function backfillMissingWorkerVerifications(): Promise<number> {
  try {
    const result = await db.execute(sql`
      INSERT INTO user_verifications
        (user_id, role, document_type, document_number,
         document_image_url, selfie_image_url, status, created_at, updated_at)
      SELECT
        w.user_id,
        'worker',
        COALESCE(w.document_type, 'cedula'),
        w.document_number,
        w.document_image_url,
        w.selfie_image_url,
        CASE
          WHEN w.verification_status IN ('pending','approved','rejected')
            THEN w.verification_status
          ELSE 'pending'
        END,
        NOW(),
        NOW()
      FROM workers w
      WHERE w.document_image_url IS NOT NULL
        AND w.selfie_image_url   IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_verifications uv
          WHERE uv.user_id = w.user_id
        )
      RETURNING id
    `);
    const count = (result as any)?.rowCount ?? (Array.isArray(result) ? result.length : 0);
    if (count > 0) {
      console.log(`[verifications] Backfill: ${count} verificaciones de profesionales sincronizadas a la cola unificada.`);
    }
    return count;
  } catch (err) {
    console.error("[verifications] Backfill error:", err);
    return 0;
  }
}

// GET /api/admin/verifications — list pending (or all) verifications across roles
router.get("/admin/verifications", authenticate, requireAdminRole("super_admin", "soporte"), async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  // Asegurar que ningún profesional pendiente quede invisible en la cola.
  await backfillMissingWorkerVerifications();

  const { status = "pending", role } = req.query as { status?: string; role?: string };

  const baseQuery = db
    .select({
      v: userVerificationsTable,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.phone,
      userState: usersTable.state,
      userCity: usersTable.city,
      userAvatarUrl: usersTable.avatarUrl,
    })
    .from(userVerificationsTable)
    .innerJoin(usersTable, eq(userVerificationsTable.userId, usersTable.id));

  const rows = status === "all"
    ? await baseQuery.where(ne(userVerificationsTable.status, "not_submitted")).orderBy(userVerificationsTable.createdAt)
    : await baseQuery.where(eq(userVerificationsTable.status, status)).orderBy(userVerificationsTable.createdAt);

  const filtered = role ? rows.filter(r => r.v.role === role) : rows;

  res.json(filtered.map(r => ({
    id: r.v.id,
    userId: r.v.userId,
    role: r.v.role,
    documentType: r.v.documentType,
    documentNumber: r.v.documentNumber,
    documentImageUrl: r.v.documentImageUrl,
    selfieImageUrl: r.v.selfieImageUrl,
    emergencyContact: r.v.emergencyContact,
    emergencyPhone: r.v.emergencyPhone,
    status: r.v.status,
    notes: r.v.notes,
    reviewedAt: r.v.reviewedAt,
    createdAt: r.v.createdAt,
    updatedAt: r.v.updatedAt,
    userName: r.userName,
    userEmail: r.userEmail,
    userPhone: r.userPhone,
    userState: r.userState,
    userCity: r.userCity,
    userAvatarUrl: r.userAvatarUrl,
  })));
});

// POST /api/admin/verifications/:id/review — approve or reject a verification
router.post("/admin/verifications/:id/review", authenticate, requireAdminRole("super_admin", "soporte"), async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { approved, notes } = req.body as { approved: boolean; notes?: string };

  if (!approved && !notes) {
    res.status(400).json({ error: "Debes indicar el motivo del rechazo." });
    return;
  }

  const [record] = await db.select().from(userVerificationsTable).where(eq(userVerificationsTable.id, id));
  if (!record) { res.status(404).json({ error: "Verificación no encontrada" }); return; }

  const newStatus = approved ? "approved" : "rejected";

  const [updated] = await db
    .update(userVerificationsTable)
    .set({
      status: newStatus,
      notes: notes ?? null,
      reviewedAt: new Date(),
      reviewedById: req.user!.id,
      updatedAt: new Date(),
    })
    .where(eq(userVerificationsTable.id, id))
    .returning();

  // If it's a worker, also update the workersTable fields for consistency
  if (record.role === "worker") {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, record.userId));
    if (worker) {
      await db.update(workersTable).set({
        isVerified: approved,
        verificationStatus: newStatus,
        verificationNotes: notes ?? null,
      }).where(eq(workersTable.id, worker.id));
    }
  }

  // Safety guard: only notify if DB actually persisted the intended status.
  // Protects against race conditions where .returning() could theoretically
  // return a stale value, and prevents false-positive "Verificado" notifications.
  if (!updated || updated.status !== newStatus) {
    res.status(500).json({ error: "No se pudo confirmar el cambio de estado en la base de datos." });
    return;
  }

  const notifType = approved ? "verification_approved" : "verification_rejected";
  const notifTitle = approved
    ? "✅ ¡Identidad verificada!"
    : "❌ Verificación rechazada";
  const notifMsg = approved
    ? "¡Tu identidad ha sido verificada! Ya puedes usar todas las funciones de LinkServi con total confianza."
    : `Tu verificación de identidad fue rechazada. Motivo: ${notes}`;

  await createNotification(record.userId, notifType, notifTitle, notifMsg);

  res.json(updated);
});

// POST /api/admin/verifications/:id/reset — strip verification, force re-upload
router.post("/admin/verifications/:id/reset", authenticate, requireAdminRole("super_admin", "soporte"), async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [record] = await db.select().from(userVerificationsTable).where(eq(userVerificationsTable.id, id));
  if (!record) { res.status(404).json({ error: "Verificación no encontrada" }); return; }

  const [updated] = await db
    .update(userVerificationsTable)
    .set({
      status: "pending",
      documentImageUrl: null,
      selfieImageUrl: null,
      notes: req.body?.notes ?? null,
      reviewedAt: null,
      reviewedById: null,
      updatedAt: new Date(),
    })
    .where(eq(userVerificationsTable.id, id))
    .returning();

  // If worker — also reset workersTable fields
  if (record.role === "worker") {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, record.userId));
    if (worker) {
      await db.update(workersTable).set({
        isVerified: false,
        verificationStatus: "pending",
        verificationNotes: req.body?.notes ?? null,
      }).where(eq(workersTable.id, worker.id));
    }
  }

  // Notify user
  const reason = req.body?.notes ? ` Motivo: ${req.body.notes}` : "";
  await createNotification(
    record.userId,
    "verification_rejected",
    "🔄 Verificación reiniciada — sube tus documentos",
    `Tu verificación fue reiniciada y necesita nuevos documentos.${reason} Por favor sube tu cédula y selfie de nuevo.`,
  );

  res.json({ success: true, verification: updated });
});

// POST /api/admin/users/:userId/reset-verification — quitar verificación por userId
router.post("/admin/users/:userId/reset-verification", authenticate, requireAdminRole("super_admin", "soporte"), async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }

  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "userId inválido" }); return; }

  try {
    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!targetUser) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

    // 1. Delete verification record — reverts status to "not_submitted" for KYCWall
    await db.delete(userVerificationsTable).where(eq(userVerificationsTable.userId, userId));

    // 2. Reset workersTable directly by userId (no intermediate SELECT / no role check).
    //    Using .where(userId) guarantees the UPDATE runs even if role changed later.
    //    If no worker row exists, Drizzle updates 0 rows with no error.
    await db.update(workersTable).set({
      isVerified: false,
      verificationStatus: "pending",
      documentImageUrl: null,
      selfieImageUrl: null,
      verificationNotes: "Tu verificación fue anulada por un administrador. Sube tus documentos de nuevo para continuar.",
    }).where(eq(workersTable.userId, userId));

    // 3. Notify user
    await createNotification(
      userId,
      "verification_rejected",
      "⚠️ Tu verificación fue anulada",
      "Un administrador ha anulado tu verificación. Debes ingresar a la app y subir tus documentos de nuevo para continuar usando la plataforma.",
    );

    res.json({ success: true, message: "Verificación anulada correctamente" });
  } catch (err) {
    console.error("[reset-verification] error:", err);
    res.status(500).json({ error: "Error interno al anular la verificación" });
  }
});

// GET /api/me/verification/status — quick check for booking gate (any auth user)
router.get("/me/verification/status", authenticate, async (req, res): Promise<void> => {
  const [record] = await db
    .select({
      status: userVerificationsTable.status,
      documentImageUrl: userVerificationsTable.documentImageUrl,
      selfieImageUrl: userVerificationsTable.selfieImageUrl,
    })
    .from(userVerificationsTable)
    .where(eq(userVerificationsTable.userId, req.user!.id));

  if (!record) {
    res.json({ status: "not_submitted" });
    return;
  }

  // Only report the real status once BOTH images are on file.
  // Without photos the user still needs to submit — never show "Cuenta en revisión".
  const effectiveStatus = (record.documentImageUrl && record.selfieImageUrl)
    ? record.status
    : "not_submitted";

  res.json({ status: effectiveStatus });
});

export default router;
