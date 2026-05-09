import { Router } from "express";
import { randomBytes } from "crypto";
import { db, usersTable, actionLogsTable, collaboratorInvitationsTable } from "@workspace/db";
import { eq, desc, ilike, and, isNull, gt, gte, sql } from "drizzle-orm";
import { authenticate, requireAdminRole, hashPassword } from "../lib/auth";
import { sendCollaboratorInvitationEmail } from "../lib/email";
import nodemailer from "nodemailer";

const router = Router();

const VALID_ROLES = ["super_admin", "soporte", "finanzas", "marketing"] as const;
type CollabRole = typeof VALID_ROLES[number];

// ── Helper: log admin action ──────────────────────────────────────────────────
async function logAction(
  userId: number,
  action: string,
  targetId?: number,
  targetType?: string,
  meta?: object,
  ip?: string,
) {
  try {
    await db.insert(actionLogsTable).values({
      userId,
      action,
      targetType: targetType ?? null,
      targetId:   targetId  ?? null,
      meta:       meta ? JSON.stringify(meta) : null,
      ip:         ip ?? null,
    });
  } catch { /* log failures are non-fatal */ }
}

// ── GET /api/admin/collaborators — list all admin users ───────────────────────
router.get(
  "/admin/collaborators",
  authenticate,
  requireAdminRole("super_admin"),
  async (_req, res): Promise<void> => {
    const collaborators = await db
      .select({
        id:        usersTable.id,
        name:      usersTable.name,
        email:     usersTable.email,
        adminRole: usersTable.adminRole,
        isActive:  usersTable.isActive,
        createdAt: usersTable.createdAt,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .orderBy(desc(usersTable.createdAt));

    res.json(collaborators);
  },
);

// ── GET /api/admin/collaborators/search — find user to promote ────────────────
router.get(
  "/admin/collaborators/search",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const q = String(req.query.email ?? "").trim();
    if (q.length < 3) { res.status(400).json({ error: "Mínimo 3 caracteres" }); return; }

    const users = await db
      .select({
        id:        usersTable.id,
        name:      usersTable.name,
        email:     usersTable.email,
        role:      usersTable.role,
        adminRole: usersTable.adminRole,
        avatarUrl: usersTable.avatarUrl,
        isActive:  usersTable.isActive,
      })
      .from(usersTable)
      .where(ilike(usersTable.email, `%${q}%`))
      .limit(10);

    res.json(users.map(u => ({ ...u, isAdmin: u.role === "admin" })));
  },
);

// ── POST /api/admin/collaborators — promote existing user OR create new ────────
router.post(
  "/admin/collaborators",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const { email, adminRole, name, password } = req.body as {
      email:     string;
      adminRole: CollabRole;
      name?:     string;
      password?: string;
    };

    if (!email || !adminRole) {
      res.status(400).json({ error: "email y adminRole son requeridos" });
      return;
    }
    if (!(VALID_ROLES as readonly string[]).includes(adminRole)) {
      res.status(400).json({ error: "Rol inválido" });
      return;
    }

    // Try to find an existing user
    const [existing] = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing) {
      // Promote existing user to admin
      const [updated] = await db
        .update(usersTable)
        .set({ role: "admin", adminRole })
        .where(eq(usersTable.id, existing.id))
        .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, adminRole: usersTable.adminRole });

      await logAction(req.user!.id, "collaborator.create", existing.id, "user", { adminRole, email, method: "promote" }, req.ip);
      res.status(201).json(updated);
      return;
    }

    // Create brand-new admin user if name + password provided
    if (!name || !password) {
      res.status(404).json({ error: "Usuario no encontrado. Para crear uno nuevo, incluye name y password." });
      return;
    }

    const hashed = await hashPassword(password);
    const [created] = await db
      .insert(usersTable)
      .values({ name, email, password: hashed, role: "admin", adminRole, isActive: true, phone: null })
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, adminRole: usersTable.adminRole });

    await logAction(req.user!.id, "collaborator.create", created.id, "user", { adminRole, email, method: "create" }, req.ip);
    res.status(201).json(created);
  },
);

// ── PUT /api/admin/collaborators/:id — update collaborator role / status ───────
router.put(
  "/admin/collaborators/:id",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const { adminRole, isActive } = req.body as { adminRole?: CollabRole; isActive?: boolean };

    // Prevent super_admin from demoting themselves
    if (id === req.user!.id) {
      res.status(400).json({ error: "No puedes modificar tu propio acceso" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (adminRole !== undefined) {
      if (!(VALID_ROLES as readonly string[]).includes(adminRole)) {
        res.status(400).json({ error: "Rol inválido" });
        return;
      }
      updates.adminRole = adminRole;
    }
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nada que actualizar" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id, name: usersTable.name, adminRole: usersTable.adminRole, isActive: usersTable.isActive });

    if (!updated) {
      res.status(404).json({ error: "Colaborador no encontrado" });
      return;
    }

    await logAction(
      req.user!.id,
      "collaborator.update",
      id,
      "user",
      { changes: updates },
      req.ip,
    );

    res.json(updated);
  },
);

// ── DELETE /api/admin/collaborators/:id — revoke admin access ─────────────────
router.delete(
  "/admin/collaborators/:id",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);

    if (id === req.user!.id) {
      res.status(400).json({ error: "No puedes revocar tu propio acceso" });
      return;
    }

    // Revoke by changing role to "client" instead of deleting
    const [revoked] = await db
      .update(usersTable)
      .set({ role: "client", adminRole: null })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id, name: usersTable.name });

    if (!revoked) {
      res.status(404).json({ error: "Colaborador no encontrado" });
      return;
    }

    await logAction(req.user!.id, "collaborator.revoke", id, "user", {}, req.ip);
    res.json({ ok: true });
  },
);

// ── GET /api/admin/me/role — my admin role (for frontend) ─────────────────────
router.get(
  "/admin/me/role",
  authenticate,
  async (req, res): Promise<void> => {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json({
      adminRole:  req.user!.adminRole ?? "super_admin",
      name:       req.user!.name,
      email:      req.user!.email,
    });
  },
);

// ── GET /api/admin/action-logs — audit trail with filters ─────────────────────
router.get(
  "/admin/action-logs",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const limit    = Math.min(Number(req.query.limit ?? 100), 500);
    const userId   = req.query.userId   ? Number(req.query.userId)   : null;
    const action   = req.query.action   ? String(req.query.action)   : null;
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
    const dateTo   = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;

    const conditions = [];
    if (userId)   conditions.push(eq(actionLogsTable.userId, userId));
    if (action)   conditions.push(eq(actionLogsTable.action, action));
    if (dateFrom) conditions.push(sql`${actionLogsTable.createdAt} >= ${dateFrom}`);
    if (dateTo)   conditions.push(sql`${actionLogsTable.createdAt} <= ${dateTo}`);

    const query = db
      .select({
        id:         actionLogsTable.id,
        action:     actionLogsTable.action,
        targetType: actionLogsTable.targetType,
        targetId:   actionLogsTable.targetId,
        meta:       actionLogsTable.meta,
        ip:         actionLogsTable.ip,
        createdAt:  actionLogsTable.createdAt,
        userId:     actionLogsTable.userId,
        userName:   usersTable.name,
        userEmail:  usersTable.email,
      })
      .from(actionLogsTable)
      .innerJoin(usersTable, eq(actionLogsTable.userId, usersTable.id));

    const logs = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(actionLogsTable.createdAt)).limit(limit)
      : await query.orderBy(desc(actionLogsTable.createdAt)).limit(limit);

    // ── Suspicious activity detection ─────────────────────────────────────────
    // Users with >5 actions in the last 5 minutes
    const suspiciousRows = await db
      .select({
        userId:      actionLogsTable.userId,
        actionCount: sql<number>`COUNT(*)::int`,
        userName:    usersTable.name,
        userEmail:   usersTable.email,
      })
      .from(actionLogsTable)
      .innerJoin(usersTable, eq(actionLogsTable.userId, usersTable.id))
      .where(sql`${actionLogsTable.createdAt} > NOW() - INTERVAL '5 minutes'`)
      .groupBy(actionLogsTable.userId, usersTable.name, usersTable.email)
      .having(sql`COUNT(*) > 5`);

    // Users with >3 role/access changes in the last 10 minutes
    const massChangeRows = await db
      .select({
        userId:      actionLogsTable.userId,
        actionCount: sql<number>`COUNT(*)::int`,
        userName:    usersTable.name,
        userEmail:   usersTable.email,
      })
      .from(actionLogsTable)
      .innerJoin(usersTable, eq(actionLogsTable.userId, usersTable.id))
      .where(and(
        sql`${actionLogsTable.createdAt} > NOW() - INTERVAL '10 minutes'`,
        sql`${actionLogsTable.action} IN ('collaborator.update', 'collaborator.revoke', 'collaborator.create')`,
      ))
      .groupBy(actionLogsTable.userId, usersTable.name, usersTable.email)
      .having(sql`COUNT(*) > 3`);

    res.json({
      logs,
      suspiciousActivity: suspiciousRows,
      massChanges: massChangeRows,
    });
  },
);

// ── POST /api/admin/collaborators/invite — send email invitation ──────────────
const INVITE_EXPIRES_HOURS = 72;
const MAX_ACTIVE_INVITATIONS = 15;

router.post(
  "/admin/collaborators/invite",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const { email, adminRole } = req.body as { email: string; adminRole: CollabRole };

    if (!email || !adminRole) {
      res.status(400).json({ error: "email y adminRole son requeridos" });
      return;
    }
    if (!(VALID_ROLES as readonly string[]).includes(adminRole)) {
      res.status(400).json({ error: "Rol inválido" });
      return;
    }

    // Check if email already belongs to an admin
    const [existingAdmin] = await db
      .select({ id: usersTable.id, adminRole: usersTable.adminRole })
      .from(usersTable)
      .where(and(eq(usersTable.email, email), eq(usersTable.role, "admin")));

    if (existingAdmin) {
      res.status(409).json({ error: "Este correo ya pertenece a un colaborador activo" });
      return;
    }

    // Enforce max active invitations limit
    const now = new Date();
    const [activeCount] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(collaboratorInvitationsTable)
      .where(and(
        isNull(collaboratorInvitationsTable.acceptedAt),
        gt(collaboratorInvitationsTable.expiresAt, now),
      ));
    if ((activeCount?.cnt ?? 0) >= MAX_ACTIVE_INVITATIONS) {
      res.status(429).json({
        error: `Límite alcanzado: máximo ${MAX_ACTIVE_INVITATIONS} invitaciones activas. Cancela algunas antes de enviar nuevas.`,
        activeCount: activeCount?.cnt,
        maxAllowed:  MAX_ACTIVE_INVITATIONS,
      });
      return;
    }

    // Invalidate any previous pending invitation for this email
    await db
      .delete(collaboratorInvitationsTable)
      .where(and(
        eq(collaboratorInvitationsTable.email, email),
        isNull(collaboratorInvitationsTable.acceptedAt),
      ));

    const token     = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000);

    await db.insert(collaboratorInvitationsTable).values({
      email,
      adminRole,
      token,
      invitedById: req.user!.id,
      expiresAt,
    });

    const appUrl    = process.env.APP_URL ?? "https://linkservi.com";
    const inviteUrl = `${appUrl}/admin-invite/${token}`;

    await sendCollaboratorInvitationEmail({
      toEmail:      email,
      inviterName:  req.user!.name,
      adminRole,
      inviteUrl,
      expiresHours: INVITE_EXPIRES_HOURS,
      inviteToken:  token,
    });

    await logAction(req.user!.id, "collaborator.invite", undefined, "invitation", { email, adminRole }, req.ip);
    res.status(201).json({ ok: true, email, expiresAt, activeCount: (activeCount?.cnt ?? 0) + 1, maxAllowed: MAX_ACTIVE_INVITATIONS });
  },
);

// ── GET /api/admin/collaborators/invitations — full history with auto-reminder ─
router.get(
  "/admin/collaborators/invitations",
  authenticate,
  requireAdminRole("super_admin"),
  async (_req, res): Promise<void> => {
    const now = new Date();

    // Fetch all invitations (all states) — last 90 days
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const allInvitations = await db
      .select({
        id:             collaboratorInvitationsTable.id,
        email:          collaboratorInvitationsTable.email,
        adminRole:      collaboratorInvitationsTable.adminRole,
        token:          collaboratorInvitationsTable.token,
        expiresAt:      collaboratorInvitationsTable.expiresAt,
        acceptedAt:     collaboratorInvitationsTable.acceptedAt,
        reminderSentAt: collaboratorInvitationsTable.reminderSentAt,
        createdAt:      collaboratorInvitationsTable.createdAt,
        inviterName:    usersTable.name,
        invitedById:    collaboratorInvitationsTable.invitedById,
        emailOpenCount: collaboratorInvitationsTable.emailOpenCount,
        emailOpenedAt:  collaboratorInvitationsTable.emailOpenedAt,
        linkClickCount: collaboratorInvitationsTable.linkClickCount,
        linkClickedAt:  collaboratorInvitationsTable.linkClickedAt,
      })
      .from(collaboratorInvitationsTable)
      .innerJoin(usersTable, eq(collaboratorInvitationsTable.invitedById, usersTable.id))
      .where(gt(collaboratorInvitationsTable.createdAt, since90))
      .orderBy(desc(collaboratorInvitationsTable.createdAt));

    // Auto-reminder: send to pending invitations expiring in <24h with no reminder yet
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const appUrl = process.env.APP_URL ?? "https://linkservi.com";
    const remindersToSend = allInvitations.filter(inv =>
      !inv.acceptedAt &&
      new Date(inv.expiresAt) > now &&
      new Date(inv.expiresAt) <= in24h &&
      !inv.reminderSentAt,
    );

    for (const inv of remindersToSend) {
      try {
        const inviteUrl = `${appUrl}/admin-invite/${inv.token}`;
        const hoursLeft = Math.max(1, Math.round((new Date(inv.expiresAt).getTime() - Date.now()) / 3600000));
        await sendCollaboratorInvitationEmail({
          toEmail:      inv.email,
          inviterName:  inv.inviterName,
          adminRole:    inv.adminRole,
          inviteUrl,
          expiresHours: hoursLeft,
        });
        await db
          .update(collaboratorInvitationsTable)
          .set({ reminderSentAt: now })
          .where(eq(collaboratorInvitationsTable.id, inv.id));
      } catch { /* non-fatal */ }
    }

    // Compute status for each invitation
    const withStatus = allInvitations.map(inv => {
      let status: "pending" | "accepted" | "expired";
      if (inv.acceptedAt) status = "accepted";
      else if (new Date(inv.expiresAt) <= now) status = "expired";
      else status = "pending";

      const expiresIn = new Date(inv.expiresAt).getTime() - now.getTime();
      const expiresInHours = Math.max(0, Math.round(expiresIn / 3600000));
      const reminderSent = remindersToSend.some(r => r.id === inv.id) || !!inv.reminderSentAt;

      return { ...inv, status, expiresInHours, reminderSent };
    });

    // Count active (pending) for limit display
    const activeCount = withStatus.filter(i => i.status === "pending").length;

    res.json({ invitations: withStatus, activeCount, maxAllowed: MAX_ACTIVE_INVITATIONS });
  },
);

// ── POST /api/admin/collaborators/invitations/:id/resend — regenerate & resend ─
router.post(
  "/admin/collaborators/invitations/:id/resend",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);

    const [inv] = await db
      .select({
        id:          collaboratorInvitationsTable.id,
        email:       collaboratorInvitationsTable.email,
        adminRole:   collaboratorInvitationsTable.adminRole,
        acceptedAt:  collaboratorInvitationsTable.acceptedAt,
        invitedById: collaboratorInvitationsTable.invitedById,
      })
      .from(collaboratorInvitationsTable)
      .where(eq(collaboratorInvitationsTable.id, id));

    if (!inv) { res.status(404).json({ error: "Invitación no encontrada" }); return; }
    if (inv.acceptedAt) { res.status(409).json({ error: "Esta invitación ya fue aceptada" }); return; }

    // Refresh token and expiry
    const newToken    = randomBytes(32).toString("hex");
    const newExpiresAt = new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000);

    const [updated] = await db
      .update(collaboratorInvitationsTable)
      .set({ token: newToken, expiresAt: newExpiresAt, reminderSentAt: null })
      .where(eq(collaboratorInvitationsTable.id, id))
      .returning({ id: collaboratorInvitationsTable.id });

    const appUrl    = process.env.APP_URL ?? "https://linkservi.com";
    const inviteUrl = `${appUrl}/admin-invite/${newToken}`;

    // Reset tracking counts on resend
    await db
      .update(collaboratorInvitationsTable)
      .set({ emailOpenCount: 0, emailOpenedAt: null, linkClickCount: 0, linkClickedAt: null })
      .where(eq(collaboratorInvitationsTable.id, id));

    await sendCollaboratorInvitationEmail({
      toEmail:      inv.email,
      inviterName:  req.user!.name,
      adminRole:    inv.adminRole,
      inviteUrl,
      expiresHours: INVITE_EXPIRES_HOURS,
      inviteToken:  newToken,
    });

    await logAction(req.user!.id, "collaborator.invite_resend", id, "invitation", { email: inv.email, adminRole: inv.adminRole }, req.ip);
    res.json({ ok: true, expiresAt: newExpiresAt });
  },
);

// ── DELETE /api/admin/collaborators/invitations/:id — cancel invitation ───────
router.delete(
  "/admin/collaborators/invitations/:id",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    await db.delete(collaboratorInvitationsTable).where(eq(collaboratorInvitationsTable.id, id));
    await logAction(req.user!.id, "collaborator.invite_cancel", id, "invitation", {}, req.ip);
    res.json({ ok: true });
  },
);

// ── GET /api/admin-invite/:token — validate invitation token (PUBLIC) ─────────
router.get(
  "/admin-invite/:token",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const [inv] = await db
      .select({
        id:        collaboratorInvitationsTable.id,
        email:     collaboratorInvitationsTable.email,
        adminRole: collaboratorInvitationsTable.adminRole,
        expiresAt: collaboratorInvitationsTable.expiresAt,
        acceptedAt: collaboratorInvitationsTable.acceptedAt,
        inviterName: usersTable.name,
      })
      .from(collaboratorInvitationsTable)
      .innerJoin(usersTable, eq(collaboratorInvitationsTable.invitedById, usersTable.id))
      .where(eq(collaboratorInvitationsTable.token, token));

    if (!inv) { res.status(404).json({ error: "Invitación no encontrada" }); return; }
    if (inv.acceptedAt) { res.status(410).json({ error: "Esta invitación ya fue aceptada" }); return; }
    if (new Date() > new Date(inv.expiresAt)) { res.status(410).json({ error: "Esta invitación expiró" }); return; }

    res.json({
      email:       inv.email,
      adminRole:   inv.adminRole,
      inviterName: inv.inviterName,
      expiresAt:   inv.expiresAt,
    });
  },
);

// ── POST /api/admin-invite/:token/accept — set password & activate (PUBLIC) ───
router.post(
  "/admin-invite/:token/accept",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const { name, password } = req.body as { name: string; password: string };

    if (!name || !password || password.length < 8) {
      res.status(400).json({ error: "Nombre y contraseña (mínimo 8 caracteres) son requeridos" });
      return;
    }

    const [inv] = await db
      .select()
      .from(collaboratorInvitationsTable)
      .where(eq(collaboratorInvitationsTable.token, token));

    if (!inv) { res.status(404).json({ error: "Invitación no encontrada" }); return; }
    if (inv.acceptedAt) { res.status(410).json({ error: "Esta invitación ya fue aceptada" }); return; }
    if (new Date() > new Date(inv.expiresAt)) { res.status(410).json({ error: "Esta invitación expiró" }); return; }

    const hashed = await hashPassword(password);

    // Check if user already exists (maybe already has a non-admin account)
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, inv.email));

    let userId: number;

    if (existing) {
      // Upgrade existing user to admin
      await db
        .update(usersTable)
        .set({ role: "admin", adminRole: inv.adminRole as CollabRole, name, password: hashed, isActive: true })
        .where(eq(usersTable.id, existing.id));
      userId = existing.id;
    } else {
      // Create new admin user
      const [created] = await db
        .insert(usersTable)
        .values({ name, email: inv.email, password: hashed, role: "admin", adminRole: inv.adminRole as CollabRole, isActive: true, phone: null })
        .returning({ id: usersTable.id });
      userId = created.id;
    }

    // Mark invitation as accepted
    await db
      .update(collaboratorInvitationsTable)
      .set({ acceptedAt: new Date() })
      .where(eq(collaboratorInvitationsTable.id, inv.id));

    res.json({ ok: true, email: inv.email, adminRole: inv.adminRole });
  },
);

// ── HELPERS: Trust Score computation ─────────────────────────────────────────
async function computeTrustScores(collaboratorIds: number[]): Promise<Record<number, number>> {
  if (collaboratorIds.length === 0) return {};

  const now = new Date();
  const day7ago   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const day30ago  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const min5ago   = new Date(now.getTime() - 5  * 60 * 1000);
  const min10ago  = new Date(now.getTime() - 10 * 60 * 1000);

  const scores: Record<number, number> = {};
  for (const id of collaboratorIds) scores[id] = 100;

  // 1) Users with a burst of >5 actions in any 5-min window in last 7 days
  const burstRows = await db
    .select({ userId: actionLogsTable.userId, cnt: sql<number>`COUNT(*)::int` })
    .from(actionLogsTable)
    .where(and(gte(actionLogsTable.createdAt, min5ago), sql`${actionLogsTable.userId} = ANY(${sql.raw(`ARRAY[${collaboratorIds.join(",")}]`)})` ))
    .groupBy(actionLogsTable.userId)
    .having(sql`COUNT(*) > 5`);
  for (const r of burstRows) scores[r.userId] = Math.max(0, (scores[r.userId] ?? 100) - 30);

  // 2) Users with >3 access changes in 10 min in last 7 days
  const massRows = await db
    .select({ userId: actionLogsTable.userId, cnt: sql<number>`COUNT(*)::int` })
    .from(actionLogsTable)
    .where(and(
      gte(actionLogsTable.createdAt, min10ago),
      sql`${actionLogsTable.action} IN ('collaborator.update','collaborator.revoke','collaborator.create')`,
      sql`${actionLogsTable.userId} = ANY(${sql.raw(`ARRAY[${collaboratorIds.join(",")}]`)})`,
    ))
    .groupBy(actionLogsTable.userId)
    .having(sql`COUNT(*) > 3`);
  for (const r of massRows) scores[r.userId] = Math.max(0, (scores[r.userId] ?? 100) - 25);

  // 3) High risky action ratio in last 30 days
  const totalRows = await db
    .select({ userId: actionLogsTable.userId, total: sql<number>`COUNT(*)::int` })
    .from(actionLogsTable)
    .where(and(
      gte(actionLogsTable.createdAt, day30ago),
      sql`${actionLogsTable.userId} = ANY(${sql.raw(`ARRAY[${collaboratorIds.join(",")}]`)})`,
    ))
    .groupBy(actionLogsTable.userId);

  const riskyRows = await db
    .select({ userId: actionLogsTable.userId, risky: sql<number>`COUNT(*)::int` })
    .from(actionLogsTable)
    .where(and(
      gte(actionLogsTable.createdAt, day30ago),
      sql`${actionLogsTable.action} IN ('collaborator.revoke','collaborator.create')`,
      sql`${actionLogsTable.userId} = ANY(${sql.raw(`ARRAY[${collaboratorIds.join(",")}]`)})`,
    ))
    .groupBy(actionLogsTable.userId);

  const riskyMap: Record<number, number> = {};
  for (const r of riskyRows) riskyMap[r.userId] = r.risky;
  for (const r of totalRows) {
    const ratio = (riskyMap[r.userId] ?? 0) / Math.max(1, r.total);
    if (ratio > 0.4) scores[r.userId] = Math.max(0, (scores[r.userId] ?? 100) - 15);
  }

  // 4) Score boost for users with recent activity in last 7 days and no penalties
  const recentRows = await db
    .select({ userId: actionLogsTable.userId })
    .from(actionLogsTable)
    .where(and(
      gte(actionLogsTable.createdAt, day7ago),
      sql`${actionLogsTable.userId} = ANY(${sql.raw(`ARRAY[${collaboratorIds.join(",")}]`)})`,
    ))
    .groupBy(actionLogsTable.userId);
  const activeSet = new Set(recentRows.map(r => r.userId));
  for (const id of collaboratorIds) {
    if (activeSet.has(id) && scores[id] === 100) {
      scores[id] = Math.min(100, scores[id] + 5);
    }
  }

  return scores;
}

// ── GET /api/admin/collaborators — enhanced with trust scores ─────────────────
// (replaces the earlier definition — no, we ADD a new /scores sub-route instead)

// ── GET /api/admin/collaborators/scores — trust score map ────────────────────
router.get(
  "/admin/collaborators/scores",
  authenticate,
  requireAdminRole("super_admin"),
  async (_req, res): Promise<void> => {
    const collabs = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    const ids = collabs.map(c => c.id);
    const scores = ids.length > 0 ? await computeTrustScores(ids) : {};
    res.json(scores);
  },
);

// ── GET /api/admin/collaborators/:id/timeline — action history ────────────────
router.get(
  "/admin/collaborators/:id/timeline",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const id     = Number(req.params.id);
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    const [collab] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, adminRole: usersTable.adminRole, isActive: usersTable.isActive, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(eq(usersTable.id, id));

    if (!collab) { res.status(404).json({ error: "Colaborador no encontrado" }); return; }

    const logs = await db
      .select({
        id:         actionLogsTable.id,
        action:     actionLogsTable.action,
        targetType: actionLogsTable.targetType,
        targetId:   actionLogsTable.targetId,
        meta:       actionLogsTable.meta,
        ip:         actionLogsTable.ip,
        createdAt:  actionLogsTable.createdAt,
      })
      .from(actionLogsTable)
      .where(eq(actionLogsTable.userId, id))
      .orderBy(desc(actionLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(actionLogsTable)
      .where(eq(actionLogsTable.userId, id));

    const scores = await computeTrustScores([id]);

    res.json({
      collaborator: collab,
      trustScore: scores[id] ?? 100,
      logs,
      total: totalRow?.total ?? 0,
      limit,
      offset,
    });
  },
);

// ── POST /api/admin/collaborators/:id/block — temporary block ─────────────────
router.post(
  "/admin/collaborators/:id/block",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const { reason } = req.body as { reason?: string };

    if (id === req.user!.id) {
      res.status(400).json({ error: "No puedes bloquearte a ti mismo" });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id, name: usersTable.name, isActive: usersTable.isActive })
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")));

    if (!target) { res.status(404).json({ error: "Colaborador no encontrado" }); return; }

    await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.id, id));
    await logAction(req.user!.id, "collaborator.block", id, "user", { reason: reason ?? "actividad sospechosa" }, req.ip);

    res.json({ ok: true, id, blocked: true });
  },
);

// ── POST /api/admin/collaborators/:id/unblock — restore access ────────────────
router.post(
  "/admin/collaborators/:id/unblock",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);

    const [target] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")));

    if (!target) { res.status(404).json({ error: "Colaborador no encontrado" }); return; }

    await db.update(usersTable).set({ isActive: true }).where(eq(usersTable.id, id));
    await logAction(req.user!.id, "collaborator.unblock", id, "user", {}, req.ip);

    res.json({ ok: true, id, blocked: false });
  },
);

// ── POST /api/admin/collaborators/daily-summary/send — email report ───────────
router.post(
  "/admin/collaborators/daily-summary/send",
  authenticate,
  requireAdminRole("super_admin"),
  async (req, res): Promise<void> => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // All admin users
    const collabs = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, adminRole: usersTable.adminRole, isActive: usersTable.isActive })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .orderBy(usersTable.name);

    // Today's actions with user info
    const todayLogs = await db
      .select({
        action:    actionLogsTable.action,
        createdAt: actionLogsTable.createdAt,
        ip:        actionLogsTable.ip,
        userId:    actionLogsTable.userId,
        userName:  usersTable.name,
      })
      .from(actionLogsTable)
      .innerJoin(usersTable, eq(actionLogsTable.userId, usersTable.id))
      .where(gte(actionLogsTable.createdAt, todayStart))
      .orderBy(desc(actionLogsTable.createdAt));

    // Suspicious today (>5 in 5 min)
    const suspiciousToday = await db
      .select({ userId: actionLogsTable.userId, cnt: sql<number>`COUNT(*)::int`, userName: usersTable.name })
      .from(actionLogsTable)
      .innerJoin(usersTable, eq(actionLogsTable.userId, usersTable.id))
      .where(sql`${actionLogsTable.createdAt} > NOW() - INTERVAL '5 minutes'`)
      .groupBy(actionLogsTable.userId, usersTable.name)
      .having(sql`COUNT(*) > 5`);

    // Compute trust scores
    const ids = collabs.map(c => c.id);
    const scores = ids.length > 0 ? await computeTrustScores(ids) : {};

    // Group logs by user
    const byUser: Record<number, typeof todayLogs> = {};
    for (const log of todayLogs) {
      if (!byUser[log.userId]) byUser[log.userId] = [];
      byUser[log.userId].push(log);
    }

    const ACTION_LABELS: Record<string, string> = {
      "collaborator.create":        "Colaborador creado",
      "collaborator.update":        "Rol actualizado",
      "collaborator.revoke":        "Acceso revocado",
      "collaborator.invite":        "Invitación enviada",
      "collaborator.block":         "Usuario bloqueado",
      "collaborator.unblock":       "Usuario desbloqueado",
      "withdrawal.approved":        "Retiro aprobado",
      "withdrawal.rejected":        "Retiro rechazado",
    };

    const scoreColor = (s: number) => s >= 80 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";
    const scoreLabel = (s: number) => s >= 80 ? "Alta" : s >= 50 ? "Media" : "Baja";

    const collabRows = collabs.map(c => {
      const userLogs = byUser[c.id] ?? [];
      const score = scores[c.id] ?? 100;
      const statusDot = c.isActive ? "🟢" : "🔴";
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
          <td style="padding:10px 12px;font-weight:600;color:#f1f5f9">${statusDot} ${c.name}</td>
          <td style="padding:10px 12px;color:#94a3b8;font-size:12px">${c.adminRole ?? "—"}</td>
          <td style="padding:10px 12px;text-align:center">
            <span style="background:${scoreColor(score)}22;color:${scoreColor(score)};border:1px solid ${scoreColor(score)}44;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700">
              ${score}/100 · ${scoreLabel(score)}
            </span>
          </td>
          <td style="padding:10px 12px;text-align:center;font-weight:700;color:#60a5fa">${userLogs.length}</td>
        </tr>
      `;
    }).join("");

    const logRows = todayLogs.slice(0, 40).map(l => `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
        <td style="padding:6px 12px;color:#94a3b8;font-size:11px">${new Date(l.createdAt).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}</td>
        <td style="padding:6px 12px;font-weight:600;color:#e2e8f0;font-size:12px">${l.userName}</td>
        <td style="padding:6px 12px;color:#a5b4fc;font-size:12px">${ACTION_LABELS[l.action] ?? l.action}</td>
        <td style="padding:6px 12px;color:#64748b;font-size:11px;font-family:monospace">${l.ip ?? "—"}</td>
      </tr>
    `).join("");

    const alertSection = suspiciousToday.length > 0
      ? `<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="color:#f87171;font-weight:700;margin:0 0 8px">⚠️ Actividad sospechosa detectada (últimos 5 min)</p>
          ${suspiciousToday.map(s => `<p style="color:rgba(248,113,113,0.8);margin:4px 0;font-size:13px">• <strong>${s.userName}</strong> — ${s.cnt} acciones en 5 minutos</p>`).join("")}
        </div>`
      : `<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:12px;margin-bottom:20px">
          <p style="color:#34d399;margin:0;font-size:13px">✅ Sin actividad sospechosa detectada hoy</p>
        </div>`;

    const today = new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Resumen Diario — Colaboradores</title></head>
<body style="margin:0;padding:0;background:#030a18;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:32px 16px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.1));border:1px solid rgba(99,102,241,0.3);border-radius:16px;padding:24px;margin-bottom:24px;text-align:center">
    <p style="color:#a5b4fc;font-weight:800;font-size:22px;margin:0 0 4px">📋 Resumen Diario de Equipo</p>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0;text-transform:capitalize">${today}</p>
    <div style="display:flex;justify-content:center;gap:20px;margin-top:14px">
      <div style="text-align:center">
        <p style="color:#a5b4fc;font-size:22px;font-weight:800;margin:0">${collabs.length}</p>
        <p style="color:rgba(255,255,255,0.35);font-size:11px;margin:0">colaboradores</p>
      </div>
      <div style="text-align:center">
        <p style="color:#34d399;font-size:22px;font-weight:800;margin:0">${todayLogs.length}</p>
        <p style="color:rgba(255,255,255,0.35);font-size:11px;margin:0">acciones hoy</p>
      </div>
      <div style="text-align:center">
        <p style="color:${suspiciousToday.length > 0 ? "#f87171" : "#34d399"};font-size:22px;font-weight:800;margin:0">${suspiciousToday.length}</p>
        <p style="color:rgba(255,255,255,0.35);font-size:11px;margin:0">alertas</p>
      </div>
    </div>
  </div>

  <!-- Alerts -->
  ${alertSection}

  <!-- Collaborators table -->
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;margin-bottom:20px">
    <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.07)">
      <p style="color:#e2e8f0;font-weight:700;font-size:14px;margin:0">👥 Estado del Equipo</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <thead>
        <tr style="background:rgba(255,255,255,0.03)">
          <th style="padding:8px 12px;text-align:left;color:rgba(255,255,255,0.35);font-size:11px;font-weight:600;text-transform:uppercase">Colaborador</th>
          <th style="padding:8px 12px;text-align:left;color:rgba(255,255,255,0.35);font-size:11px;font-weight:600;text-transform:uppercase">Rol</th>
          <th style="padding:8px 12px;text-align:center;color:rgba(255,255,255,0.35);font-size:11px;font-weight:600;text-transform:uppercase">Score</th>
          <th style="padding:8px 12px;text-align:center;color:rgba(255,255,255,0.35);font-size:11px;font-weight:600;text-transform:uppercase">Acciones hoy</th>
        </tr>
      </thead>
      <tbody>${collabRows}</tbody>
    </table>
  </div>

  <!-- Activity log -->
  ${todayLogs.length > 0 ? `
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;margin-bottom:20px">
    <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.07)">
      <p style="color:#e2e8f0;font-weight:700;font-size:14px;margin:0">📜 Actividad del Día${todayLogs.length > 40 ? ` (mostrando 40 de ${todayLogs.length})` : ""}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <thead>
        <tr style="background:rgba(255,255,255,0.03)">
          <th style="padding:6px 12px;text-align:left;color:rgba(255,255,255,0.3);font-size:10px;text-transform:uppercase">Hora</th>
          <th style="padding:6px 12px;text-align:left;color:rgba(255,255,255,0.3);font-size:10px;text-transform:uppercase">Quién</th>
          <th style="padding:6px 12px;text-align:left;color:rgba(255,255,255,0.3);font-size:10px;text-transform:uppercase">Acción</th>
          <th style="padding:6px 12px;text-align:left;color:rgba(255,255,255,0.3);font-size:10px;text-transform:uppercase">IP</th>
        </tr>
      </thead>
      <tbody>${logRows}</tbody>
    </table>
  </div>` : `<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
    <p style="color:rgba(255,255,255,0.3);margin:0;font-size:13px">Sin actividad registrada hoy</p>
  </div>`}

  <!-- Footer -->
  <p style="text-align:center;color:rgba(255,255,255,0.2);font-size:11px">
    LinkServi Admin · Resumen generado automáticamente
    <br>Panel: <a href="https://linkservi.com/admin/collaborators" style="color:#a5b4fc">linkservi.com/admin/collaborators</a>
  </p>
</div>
</body>
</html>`;

    try {
      const pass = process.env.EMAIL_PASSWORD;
      if (!pass) { res.status(500).json({ error: "EMAIL_PASSWORD no configurado" }); return; }
      const transport = nodemailer.createTransport({
        host: "mail.privateemail.com", port: 465, secure: true,
        auth: { user: "info@linkservi.com", pass },
      });
      await transport.sendMail({
        from: "LinkServi Admin <info@linkservi.com>",
        to: "pagos@linkservi.com",
        subject: `📋 Resumen diario equipo — ${today}`,
        html,
      });
      res.json({ ok: true, collaborators: collabs.length, actionsToday: todayLogs.length, alerts: suspiciousToday.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Error al enviar email" });
    }
  },
);

// ── GET /api/admin/collaborators/invitations/metrics — acceptance analytics ────
router.get(
  "/admin/collaborators/invitations/metrics",
  authenticate,
  requireAdminRole("super_admin"),
  async (_req, res): Promise<void> => {
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        acceptedAt: collaboratorInvitationsTable.acceptedAt,
        createdAt:  collaboratorInvitationsTable.createdAt,
      })
      .from(collaboratorInvitationsTable)
      .where(gt(collaboratorInvitationsTable.createdAt, since90));

    const total    = rows.length;
    const accepted = rows.filter(r => r.acceptedAt);
    const acceptanceRate = total > 0 ? Math.round((accepted.length / total) * 100) : 0;

    let avgAcceptHours: number | null = null;
    if (accepted.length > 0) {
      const totalMs = accepted.reduce((sum, r) => {
        return sum + (new Date(r.acceptedAt!).getTime() - new Date(r.createdAt).getTime());
      }, 0);
      avgAcceptHours = Math.round((totalMs / accepted.length) / 3600000);
    }

    // Tracking stats
    const trackRows = await db
      .select({
        emailOpenCount: collaboratorInvitationsTable.emailOpenCount,
        linkClickCount: collaboratorInvitationsTable.linkClickCount,
        emailOpenedAt:  collaboratorInvitationsTable.emailOpenedAt,
        linkClickedAt:  collaboratorInvitationsTable.linkClickedAt,
      })
      .from(collaboratorInvitationsTable)
      .where(gt(collaboratorInvitationsTable.createdAt, since90));

    const totalOpens  = trackRows.reduce((s, r) => s + (r.emailOpenCount ?? 0), 0);
    const totalClicks = trackRows.reduce((s, r) => s + (r.linkClickCount ?? 0), 0);
    const openedCount = trackRows.filter(r => r.emailOpenedAt).length;
    const clickedCount = trackRows.filter(r => r.linkClickedAt).length;
    const openRate  = total > 0 ? Math.round((openedCount  / total) * 100) : 0;
    const clickRate = total > 0 ? Math.round((clickedCount / total) * 100) : 0;

    res.json({
      total,
      accepted:        accepted.length,
      acceptanceRate,
      avgAcceptHours,
      totalOpens,
      totalClicks,
      openRate,
      clickRate,
    });
  },
);

// ── Public email tracking routes ───────────────────────────────────────────────
// GET /api/email/track/open/:token — 1×1 pixel, records email open
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

router.get(
  "/email/track/open/:token",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    try {
      const [inv] = await db
        .select({ id: collaboratorInvitationsTable.id, emailOpenCount: collaboratorInvitationsTable.emailOpenCount })
        .from(collaboratorInvitationsTable)
        .where(eq(collaboratorInvitationsTable.token, token));

      if (inv) {
        const count = (inv.emailOpenCount ?? 0) + 1;
        await db
          .update(collaboratorInvitationsTable)
          .set({
            emailOpenCount: count,
            emailOpenedAt: inv.emailOpenCount === 0 ? new Date() : undefined,
          })
          .where(eq(collaboratorInvitationsTable.id, inv.id));
      }
    } catch { /* tracking is non-fatal */ }

    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.end(TRANSPARENT_GIF);
  },
);

// GET /api/email/track/click/:token — records click, redirects to real URL
router.get(
  "/email/track/click/:token",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const dest = req.query.url as string;

    try {
      const [inv] = await db
        .select({ id: collaboratorInvitationsTable.id, linkClickCount: collaboratorInvitationsTable.linkClickCount })
        .from(collaboratorInvitationsTable)
        .where(eq(collaboratorInvitationsTable.token, token));

      if (inv) {
        const count = (inv.linkClickCount ?? 0) + 1;
        await db
          .update(collaboratorInvitationsTable)
          .set({
            linkClickCount: count,
            linkClickedAt: inv.linkClickCount === 0 ? new Date() : undefined,
          })
          .where(eq(collaboratorInvitationsTable.id, inv.id));
      }
    } catch { /* tracking is non-fatal */ }

    const safeUrl = dest && dest.startsWith("http") ? dest : `/admin-invite/${token}`;
    res.redirect(302, safeUrl);
  },
);

export { logAction };
export default router;
