import { Router } from "express";
import { randomBytes } from "crypto";
import {
  db,
  usersTable,
  storesTable,
  businessManagersTable,
  managerInvitationsTable,
  actionLogsTable,
  productOrdersTable,
  customOrdersTable,
  productsTable,
} from "@workspace/db";
import { and, eq, desc, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { authenticate, hashPassword, requireRole, setAuthCookie, signToken } from "../lib/auth";
import { sendManagerInvitationEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const INVITE_EXPIRES_HOURS = 72;
const MIN_COMMISSION = 1.5;
const MAX_COMMISSION = 50;
const DEFAULT_PERMISSIONS = {
  canChat: true,
  canManageOrders: true,
  canManageProducts: true,
  canManageServices: true,
};

function safeParsePerms(raw: string | null | undefined): Record<string, boolean> {
  try {
    const v = JSON.parse(raw ?? "{}");
    return typeof v === "object" && v !== null ? v as Record<string, boolean> : {};
  } catch { return {}; }
}

function normalizePermissions(p: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = { ...DEFAULT_PERMISSIONS };
  if (p && typeof p === "object") {
    for (const k of Object.keys(DEFAULT_PERMISSIONS)) {
      if (k in (p as any)) out[k] = !!(p as any)[k];
    }
  }
  return out;
}

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
  } catch { /* non-fatal */ }
}

// ── Owner-or-admin guard for a store ─────────────────────────────────────────
async function assertOwnerOrAdmin(req: any, res: any, storeId: number): Promise<{ store: any } | null> {
  const [store] = await db
    .select({ id: storesTable.id, name: storesTable.name, coHostId: storesTable.coHostId })
    .from(storesTable)
    .where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Negocio no encontrado" }); return null; }
  if (req.user.role !== "admin" && store.coHostId !== req.user.id) {
    res.status(403).json({ error: "Solo el dueño del negocio puede gestionar gestores" });
    return null;
  }
  return { store };
}

// ── POST /api/managers/invitations — owner sends an email invite ──────────────
router.post(
  "/managers/invitations",
  authenticate,
  requireRole("cohost", "seller", "admin"),
  async (req, res): Promise<void> => {
    const { storeId, email, permissions, commissionPercentage } = req.body as {
      storeId: number;
      email: string;
      permissions?: unknown;
      commissionPercentage?: number;
    };

    if (!storeId || typeof storeId !== "number") {
      res.status(400).json({ error: "storeId requerido" });
      return;
    }
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: "Correo inválido" });
      return;
    }

    const ctx = await assertOwnerOrAdmin(req, res, storeId);
    if (!ctx) return;

    // Owner cannot invite themselves
    if (cleanEmail === req.user!.email.toLowerCase()) {
      res.status(400).json({ error: "No puedes invitarte a ti mismo" });
      return;
    }

    // If invitee already exists AND is already an active manager of this store, block
    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, cleanEmail));

    if (existingUser) {
      const [activeMgr] = await db
        .select({ id: businessManagersTable.id })
        .from(businessManagersTable)
        .where(and(
          eq(businessManagersTable.storeId, storeId),
          eq(businessManagersTable.userId, existingUser.id),
          eq(businessManagersTable.status, "active"),
        ));
      if (activeMgr) {
        res.status(409).json({ error: "Esta persona ya es gestor activo de este negocio" });
        return;
      }
    }

    // Validate commission
    const cmm = typeof commissionPercentage === "number" ? commissionPercentage : MIN_COMMISSION;
    if (cmm < MIN_COMMISSION || cmm > MAX_COMMISSION) {
      res.status(400).json({ error: `La comisión debe estar entre ${MIN_COMMISSION}% y ${MAX_COMMISSION}%` });
      return;
    }

    const perms = normalizePermissions(permissions);

    // Invalidate any previous pending invitation for (store, email)
    await db
      .delete(managerInvitationsTable)
      .where(and(
        eq(managerInvitationsTable.storeId, storeId),
        eq(managerInvitationsTable.email, cleanEmail),
        isNull(managerInvitationsTable.acceptedAt),
      ));

    const token     = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000);

    const [created] = await db
      .insert(managerInvitationsTable)
      .values({
        storeId,
        email:                cleanEmail,
        token,
        permissions:          JSON.stringify(perms),
        commissionPercentage: cmm,
        invitedById:          req.user!.id,
        expiresAt,
      })
      .returning({
        id: managerInvitationsTable.id,
        expiresAt: managerInvitationsTable.expiresAt,
      });

    const appUrl    = process.env.APP_URL ?? "https://linkservi.com";
    const inviteUrl = `${appUrl}/manager-invite/${token}`;

    sendManagerInvitationEmail({
      toEmail:              cleanEmail,
      inviterName:          req.user!.name,
      storeName:            ctx.store.name,
      commissionPercentage: cmm,
      inviteUrl,
      expiresHours:         INVITE_EXPIRES_HOURS,
    }).catch(err => logger.warn({ err, email: cleanEmail }, "manager invite email failed"));

    await logAction(req.user!.id, "manager.invite", created.id, "manager_invitation",
      { storeId, email: cleanEmail, commission: cmm }, req.ip);

    res.status(201).json({ ok: true, id: created.id, expiresAt: created.expiresAt });
  },
);

// ── GET /api/managers/store/:storeId — list managers for a store ──────────────
router.get(
  "/managers/store/:storeId",
  authenticate,
  async (req, res): Promise<void> => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      res.status(400).json({ error: "storeId inválido" });
      return;
    }
    const ctx = await assertOwnerOrAdmin(req, res, storeId);
    if (!ctx) return;

    const managers = await db
      .select({
        id:                   businessManagersTable.id,
        userId:               businessManagersTable.userId,
        userName:             usersTable.name,
        userEmail:            usersTable.email,
        userAvatarUrl:        usersTable.avatarUrl,
        permissions:          businessManagersTable.permissions,
        commissionPercentage: businessManagersTable.commissionPercentage,
        status:               businessManagersTable.status,
        createdAt:            businessManagersTable.createdAt,
        removedAt:            businessManagersTable.removedAt,
        removedReason:        businessManagersTable.removedReason,
      })
      .from(businessManagersTable)
      .innerJoin(usersTable, eq(businessManagersTable.userId, usersTable.id))
      .where(and(
        eq(businessManagersTable.storeId, storeId),
        eq(businessManagersTable.status, "active"),
      ))
      .orderBy(desc(businessManagersTable.createdAt));

    // Active pending invitations
    const now = new Date();
    const pendingInvites = await db
      .select({
        id:                   managerInvitationsTable.id,
        email:                managerInvitationsTable.email,
        commissionPercentage: managerInvitationsTable.commissionPercentage,
        permissions:          managerInvitationsTable.permissions,
        expiresAt:            managerInvitationsTable.expiresAt,
        createdAt:            managerInvitationsTable.createdAt,
      })
      .from(managerInvitationsTable)
      .where(and(
        eq(managerInvitationsTable.storeId, storeId),
        isNull(managerInvitationsTable.acceptedAt),
        gt(managerInvitationsTable.expiresAt, now),
      ))
      .orderBy(desc(managerInvitationsTable.createdAt));

    res.json({
      managers: managers.map(m => ({
        ...m,
        permissions: safeParsePerms(m.permissions),
      })),
      pendingInvites: pendingInvites.map(p => ({
        ...p,
        permissions: safeParsePerms(p.permissions),
      })),
    });
  },
);

// ── GET /api/managers/me/businesses — businesses the current user manages ─────
router.get(
  "/managers/me/businesses",
  authenticate,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        managerId:            businessManagersTable.id,
        storeId:              storesTable.id,
        storeName:            storesTable.name,
        storeLogoUrl:         storesTable.logoUrl,
        ownerName:            storesTable.ownerName,
        permissions:          businessManagersTable.permissions,
        commissionPercentage: businessManagersTable.commissionPercentage,
        createdAt:            businessManagersTable.createdAt,
      })
      .from(businessManagersTable)
      .innerJoin(storesTable, eq(businessManagersTable.storeId, storesTable.id))
      .where(and(
        eq(businessManagersTable.userId, req.user!.id),
        eq(businessManagersTable.status, "active"),
      ))
      .orderBy(desc(businessManagersTable.createdAt));

    res.json(rows.map(r => ({
      ...r,
      permissions: safeParsePerms(r.permissions),
    })));
  },
);

// ── PATCH /api/managers/:id — owner updates permissions/commission ────────────
router.patch(
  "/managers/:id",
  authenticate,
  requireRole("cohost", "seller", "admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { permissions, commissionPercentage } = req.body as {
      permissions?: unknown;
      commissionPercentage?: number;
    };

    const [mgr] = await db
      .select({
        id:      businessManagersTable.id,
        storeId: businessManagersTable.storeId,
        status:  businessManagersTable.status,
      })
      .from(businessManagersTable)
      .where(eq(businessManagersTable.id, id));
    if (!mgr) { res.status(404).json({ error: "Gestor no encontrado" }); return; }
    if (mgr.status !== "active") { res.status(409).json({ error: "Este gestor ya no está activo" }); return; }

    const ctx = await assertOwnerOrAdmin(req, res, mgr.storeId);
    if (!ctx) return;

    const updates: Record<string, unknown> = {};
    if (permissions !== undefined) {
      updates.permissions = JSON.stringify(normalizePermissions(permissions));
    }
    if (commissionPercentage !== undefined) {
      const cmm = Number(commissionPercentage);
      if (!Number.isFinite(cmm) || cmm < MIN_COMMISSION || cmm > MAX_COMMISSION) {
        res.status(400).json({ error: `La comisión debe estar entre ${MIN_COMMISSION}% y ${MAX_COMMISSION}%` });
        return;
      }
      updates.commissionPercentage = cmm;
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nada que actualizar" });
      return;
    }

    const [updated] = await db
      .update(businessManagersTable)
      .set(updates)
      .where(eq(businessManagersTable.id, id))
      .returning();

    await logAction(req.user!.id, "manager.update", id, "business_manager",
      { storeId: mgr.storeId, changes: updates }, req.ip);

    res.json({ ok: true, manager: { ...updated, permissions: safeParsePerms(updated.permissions) } });
  },
);

// ── DELETE /api/managers/:id — owner terminates with mandatory reason ─────────
router.delete(
  "/managers/:id",
  authenticate,
  requireRole("cohost", "seller", "admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const reason = String((req.body?.reason ?? "")).trim();
    if (reason.length < 20 || reason.length > 500) {
      res.status(400).json({ error: "El motivo es obligatorio (20–500 caracteres)" });
      return;
    }

    const [mgr] = await db
      .select({
        id:      businessManagersTable.id,
        storeId: businessManagersTable.storeId,
        status:  businessManagersTable.status,
        userId:  businessManagersTable.userId,
      })
      .from(businessManagersTable)
      .where(eq(businessManagersTable.id, id));
    if (!mgr) { res.status(404).json({ error: "Gestor no encontrado" }); return; }
    if (mgr.status !== "active") { res.status(409).json({ error: "Este gestor ya fue removido" }); return; }

    const ctx = await assertOwnerOrAdmin(req, res, mgr.storeId);
    if (!ctx) return;

    await db
      .update(businessManagersTable)
      .set({
        status:        "removed",
        removedAt:     new Date(),
        removedReason: reason,
        removedById:   req.user!.id,
      })
      .where(eq(businessManagersTable.id, id));

    await logAction(req.user!.id, "manager.remove", id, "business_manager",
      { storeId: mgr.storeId, userId: mgr.userId, reason }, req.ip);

    res.json({ ok: true });
  },
);

// ── GET /api/manager-invite/:token — public; resolve invite ───────────────────
router.get(
  "/manager-invite/:token",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const [inv] = await db
      .select({
        id:                   managerInvitationsTable.id,
        storeId:              managerInvitationsTable.storeId,
        email:                managerInvitationsTable.email,
        permissions:          managerInvitationsTable.permissions,
        commissionPercentage: managerInvitationsTable.commissionPercentage,
        expiresAt:            managerInvitationsTable.expiresAt,
        acceptedAt:           managerInvitationsTable.acceptedAt,
        inviterName:          usersTable.name,
        storeName:            storesTable.name,
        storeLogoUrl:         storesTable.logoUrl,
      })
      .from(managerInvitationsTable)
      .innerJoin(usersTable,  eq(managerInvitationsTable.invitedById, usersTable.id))
      .innerJoin(storesTable, eq(managerInvitationsTable.storeId,     storesTable.id))
      .where(eq(managerInvitationsTable.token, token));

    if (!inv) { res.status(404).json({ error: "Invitación no encontrada" }); return; }
    if (inv.acceptedAt) { res.status(410).json({ error: "Esta invitación ya fue aceptada" }); return; }
    if (new Date() > new Date(inv.expiresAt)) { res.status(410).json({ error: "Esta invitación expiró" }); return; }

    // Track first click
    await db
      .update(managerInvitationsTable)
      .set({
        linkClickedAt: sql`COALESCE(${managerInvitationsTable.linkClickedAt}, NOW())`,
        linkClickCount: sql`${managerInvitationsTable.linkClickCount} + 1`,
      })
      .where(eq(managerInvitationsTable.id, inv.id))
      .catch(() => {});

    // Does the email already have an account?
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, inv.email));

    res.json({
      email:                inv.email,
      storeName:            inv.storeName,
      storeLogoUrl:         inv.storeLogoUrl,
      inviterName:          inv.inviterName,
      commissionPercentage: inv.commissionPercentage,
      permissions:          safeParsePerms(inv.permissions),
      expiresAt:            inv.expiresAt,
      hasAccount:           !!existing,
    });
  },
);

// ── POST /api/manager-invite/:token/accept — public; create user OR attach ────
// Body shapes:
//   { mode: "register", name, password }         — new account flow
//   { mode: "login",    password }               — existing-account flow (validates password and accepts)
router.post(
  "/manager-invite/:token/accept",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const body = (req.body ?? {}) as { mode?: "register" | "login"; name?: string; password?: string };

    const [inv] = await db
      .select()
      .from(managerInvitationsTable)
      .where(eq(managerInvitationsTable.token, token));
    if (!inv) { res.status(404).json({ error: "Invitación no encontrada" }); return; }
    if (inv.acceptedAt) { res.status(410).json({ error: "Esta invitación ya fue aceptada" }); return; }
    if (new Date() > new Date(inv.expiresAt)) { res.status(410).json({ error: "Esta invitación expiró" }); return; }

    const password = String(body.password ?? "");
    if (password.length < 8) {
      res.status(400).json({ error: "Contraseña debe tener al menos 8 caracteres" });
      return;
    }

    // ── Pre-validate the user-shape inputs BEFORE the transaction so we can
    //    return clean 400/401/409 responses without touching any state. ──────
    const [existing] = await db
      .select({
        id:           usersTable.id,
        passwordHash: usersTable.passwordHash,
        roles:        usersTable.roles,
        name:         usersTable.name,
      })
      .from(usersTable)
      .where(eq(usersTable.email, inv.email));

    if (existing) {
      if (body.mode && body.mode !== "login") {
        res.status(409).json({ error: "Ya existe una cuenta con este correo. Inicia sesión." });
        return;
      }
      const { compare } = await import("bcryptjs");
      const ok = await compare(password, existing.passwordHash);
      if (!ok) { res.status(401).json({ error: "Contraseña incorrecta" }); return; }
    } else {
      const name = String(body.name ?? "").trim();
      if (name.length < 2) {
        res.status(400).json({ error: "Nombre requerido" });
        return;
      }
    }

    // ── Atomic acceptance ─────────────────────────────────────────────────────
    // Everything that mutates state happens inside a single transaction:
    //   1. Mark invitation accepted with a CONDITIONAL update (acceptedAt IS NULL)
    //      — this gives us deterministic idempotency under concurrent accepts.
    //   2. Create or update the user (roles[] includes 'gestor').
    //   3. Insert the business_managers row.
    // If any step throws, Postgres rolls back; user roles will not be mutated
    // without a corresponding active manager row.
    let userId: number;
    let userRole: string;
    try {
      const result = await db.transaction(async (tx) => {
        // 1) Conditional acceptance — returns the row only if it was still
        //    unaccepted AND not yet expired at the moment of UPDATE. Race-safe.
        const acceptedRows = await tx
          .update(managerInvitationsTable)
          .set({ acceptedAt: new Date() })
          .where(and(
            eq(managerInvitationsTable.id, inv.id),
            isNull(managerInvitationsTable.acceptedAt),
            sql`${managerInvitationsTable.expiresAt} > NOW()`,
          ))
          .returning({ id: managerInvitationsTable.id });
        if (acceptedRows.length === 0) {
          throw new HttpError(410, "Esta invitación ya fue aceptada o expiró");
        }

        // 2) Create or attach user, append 'gestor' role atomically.
        let uid: number;
        let urole: string;
        if (existing) {
          await tx
            .update(usersTable)
            .set({
              roles: sql`(
                SELECT ARRAY(SELECT DISTINCT unnest(
                  COALESCE(${usersTable.roles}, ARRAY[]::text[]) || ARRAY['gestor']::text[]
                ))
              )`,
            })
            .where(eq(usersTable.id, existing.id));
          uid   = existing.id;
          urole = "client"; // gestor lives in roles[], primary role unchanged
        } else {
          const name = String(body.name ?? "").trim();
          const passwordHash = await hashPassword(password);
          const [created] = await tx
            .insert(usersTable)
            .values({
              name,
              email:        inv.email,
              passwordHash,
              role:         "client",
              roles:        ["client", "gestor"] as any,
              isActive:     true,
            } as any)
            .returning({ id: usersTable.id, role: usersTable.role });
          uid   = created.id;
          urole = created.role;
        }

        // 3) Insert the business_managers row (partial-unique index only
        //    constrains active rows, so a previously "removed" row is fine).
        await tx.insert(businessManagersTable).values({
          storeId:              inv.storeId,
          userId:               uid,
          permissions:          inv.permissions,
          commissionPercentage: inv.commissionPercentage,
          status:               "active",
        });

        // Mark who accepted (outside conditional update so we don't repeat
        // the WHERE clause; safe because we're now inside the same txn).
        await tx
          .update(managerInvitationsTable)
          .set({ acceptedByUserId: uid })
          .where(eq(managerInvitationsTable.id, inv.id));

        return { uid, urole };
      });
      userId   = result.uid;
      userRole = result.urole;
    } catch (e: any) {
      if (e instanceof HttpError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      // Likely the partial-unique index on active business_managers fired —
      // a concurrent accept just won. Treat as already-accepted.
      console.error("[accept] tx error:", e?.message ?? e);
      res.status(409).json({ error: "No se pudo completar la activación. Intenta de nuevo." });
      return;
    }

    await logAction(userId, "manager.accept", inv.id, "manager_invitation",
      { storeId: inv.storeId }, req.ip);

    // ── Issue session for the user (so the frontend lands logged in) ─────────
    const jwtToken = signToken(userId, userRole);
    setAuthCookie(res, jwtToken);

    res.json({ ok: true, storeId: inv.storeId, token: jwtToken });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// METRICS — read-only aggregates for the manager dashboard and the cohost view
// ─────────────────────────────────────────────────────────────────────────────
//
// Attribution rule (v1, intentionally simple):
//   A sale "counts" toward a manager iff
//     (a) it belongs to a store the manager is currently active in, AND
//     (b) the order was created at or after the manager's createdAt timestamp.
//
//   Sale = product_orders with status in (payment_confirmed, dispatched, delivered)
//        + custom_orders with status = 'paid'.
//
//   Money figures use the captured-at-moment price:
//     • product_orders.priceUsdAtMoment (immutable per order)
//     • custom_orders.priceUsd          (immutable per order)
//
//   Manager commission earned (informational; the actual payment between
//   cohost and manager is out-of-band for now) =
//     SUM(price) * commissionPercentage / 100
//
// We never count sales that pre-date the manager (no retroactive credit) and
// we never count sales that post-date a manager's removal (handled by the
// "active" filter — removed managers are excluded from these aggregates).
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_ORDER_PAID_STATUSES = ["payment_confirmed", "dispatched", "delivered"] as const;
const CUSTOM_ORDER_PAID_STATUSES  = ["paid"] as const;

interface BusinessMetrics {
  storeId:          number;
  salesCount:       number;
  revenueUsd:       number;          // gross sold (price × qty=1, all completed orders)
  commissionUsd:    number;          // revenue × manager commission %
  firstSaleAt:      string | null;   // ISO; first paid sale on/after manager.createdAt
}

/**
 * Compute aggregates for a single (storeId, since) window.
 * Two parallel queries: product_orders + custom_orders. Single round-trip each.
 */
async function computeBusinessMetrics(
  storeId: number,
  since: Date,
  commissionPct: number,
): Promise<BusinessMetrics> {
  const [productAgg, customAgg] = await Promise.all([
    db
      .select({
        count:       sql<number>`COUNT(*)`,
        revenue:     sql<number>`COALESCE(SUM(${productOrdersTable.priceUsdAtMoment}), 0)`,
        firstSaleAt: sql<Date | null>`MIN(${productOrdersTable.createdAt})`,
      })
      .from(productOrdersTable)
      .innerJoin(productsTable, eq(productOrdersTable.productId, productsTable.id))
      .where(and(
        eq(productsTable.storeId, storeId),
        inArray(productOrdersTable.status, PRODUCT_ORDER_PAID_STATUSES as unknown as string[]),
        gte(productOrdersTable.createdAt, since),
      )),
    db
      .select({
        count:       sql<number>`COUNT(*)`,
        revenue:     sql<number>`COALESCE(SUM(${customOrdersTable.priceUsd}), 0)`,
        firstSaleAt: sql<Date | null>`MIN(${customOrdersTable.createdAt})`,
      })
      .from(customOrdersTable)
      .where(and(
        eq(customOrdersTable.storeId, storeId),
        inArray(customOrdersTable.status, CUSTOM_ORDER_PAID_STATUSES as unknown as string[]),
        gte(customOrdersTable.createdAt, since),
      )),
  ]);

  const pCount    = Number(productAgg[0]?.count   ?? 0);
  const pRevenue  = Number(productAgg[0]?.revenue ?? 0);
  const pFirst    = productAgg[0]?.firstSaleAt ?? null;
  const cCount    = Number(customAgg[0]?.count    ?? 0);
  const cRevenue  = Number(customAgg[0]?.revenue  ?? 0);
  const cFirst    = customAgg[0]?.firstSaleAt ?? null;

  const salesCount    = pCount + cCount;
  const revenueUsd    = +(pRevenue + cRevenue).toFixed(2);
  const commissionUsd = +(revenueUsd * (commissionPct / 100)).toFixed(2);

  let firstSaleAt: string | null = null;
  if (pFirst && cFirst)      firstSaleAt = (pFirst < cFirst ? pFirst : cFirst).toISOString();
  else if (pFirst)           firstSaleAt = pFirst.toISOString();
  else if (cFirst)           firstSaleAt = cFirst.toISOString();

  return { storeId, salesCount, revenueUsd, commissionUsd, firstSaleAt };
}

// ── GET /api/managers/me/summary — top-of-dashboard for the manager ──────────
router.get(
  "/managers/me/summary",
  authenticate,
  async (req, res): Promise<void> => {
    // 1) All my active manager rows (one per store I manage)
    const myMgrRows = await db
      .select({
        managerId:            businessManagersTable.id,
        storeId:              businessManagersTable.storeId,
        storeName:            storesTable.name,
        commissionPercentage: businessManagersTable.commissionPercentage,
        since:                businessManagersTable.createdAt,
        firstSaleNotifiedAt:  businessManagersTable.firstSaleNotifiedAt,
      })
      .from(businessManagersTable)
      .innerJoin(storesTable, eq(businessManagersTable.storeId, storesTable.id))
      .where(and(
        eq(businessManagersTable.userId, req.user!.id),
        eq(businessManagersTable.status, "active"),
      ));

    if (myMgrRows.length === 0) {
      res.json({
        businessesCount:           0,
        totalSalesCount:           0,
        totalRevenueUsd:           0,
        totalCommissionUsd:        0,
        perBusiness:               [],
        firstSale:                 null,
        showFirstSaleCelebration:  false,
      });
      return;
    }

    // 2) Compute metrics in parallel for every store
    const perStore = await Promise.all(myMgrRows.map(r =>
      computeBusinessMetrics(r.storeId, r.since, r.commissionPercentage)
    ));

    // 3) Aggregate
    let totalSalesCount    = 0;
    let totalRevenueUsd    = 0;
    let totalCommissionUsd = 0;
    let firstSaleAt: string | null = null;
    let firstSaleStoreName: string | null = null;

    // Lifetime onboarding milestone: the moment the user has ack'd the
    // celebration once, it stays ack'd forever — even when they later join
    // additional stores. We treat "first sale" as a one-time identity event
    // ("your first sale ever as a manager"), not a per-store recurring event.
    const everAcknowledged = myMgrRows.some(r => r.firstSaleNotifiedAt != null);

    perStore.forEach((m, i) => {
      totalSalesCount    += m.salesCount;
      totalRevenueUsd    += m.revenueUsd;
      totalCommissionUsd += m.commissionUsd;
      if (m.firstSaleAt && (!firstSaleAt || m.firstSaleAt < firstSaleAt)) {
        firstSaleAt        = m.firstSaleAt;
        firstSaleStoreName = myMgrRows[i].storeName;
      }
    });

    const showFirstSaleCelebration =
      totalSalesCount > 0 && firstSaleAt != null && !everAcknowledged;

    res.json({
      businessesCount:    myMgrRows.length,
      totalSalesCount,
      totalRevenueUsd:    +totalRevenueUsd.toFixed(2),
      totalCommissionUsd: +totalCommissionUsd.toFixed(2),
      perBusiness: myMgrRows.map((r, i) => ({
        storeId:              r.storeId,
        storeName:            r.storeName,
        commissionPercentage: r.commissionPercentage,
        since:                r.since,
        ...perStore[i],
      })),
      firstSale: firstSaleAt
        ? {
            storeName:     firstSaleStoreName,
            commissionUsd: totalCommissionUsd > 0 ? +totalCommissionUsd.toFixed(2) : 0,
            date:          firstSaleAt,
          }
        : null,
      showFirstSaleCelebration,
    });
  },
);

// ── POST /api/managers/me/first-sale/acknowledge — mark celebration as seen ──
// Idempotent: sets firstSaleNotifiedAt=NOW() on every active manager row of mine
// that is still unset. Calling it twice is a no-op the second time.
router.post(
  "/managers/me/first-sale/acknowledge",
  authenticate,
  async (req, res): Promise<void> => {
    await db
      .update(businessManagersTable)
      .set({ firstSaleNotifiedAt: new Date() })
      .where(and(
        eq(businessManagersTable.userId, req.user!.id),
        eq(businessManagersTable.status, "active"),
        isNull(businessManagersTable.firstSaleNotifiedAt),
      ));
    res.json({ ok: true });
  },
);

// ── GET /api/managers/store/:storeId/metrics — owner sees per-manager numbers ─
// "How much has each of my managers generated for me, and how much has it cost
// me in commission?" Owner-or-admin only.
router.get(
  "/managers/store/:storeId/metrics",
  authenticate,
  async (req, res): Promise<void> => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      res.status(400).json({ error: "storeId inválido" });
      return;
    }
    const ctx = await assertOwnerOrAdmin(req, res, storeId);
    if (!ctx) return;

    const mgrs = await db
      .select({
        managerId:            businessManagersTable.id,
        userId:               businessManagersTable.userId,
        userName:             usersTable.name,
        commissionPercentage: businessManagersTable.commissionPercentage,
        since:                businessManagersTable.createdAt,
      })
      .from(businessManagersTable)
      .innerJoin(usersTable, eq(businessManagersTable.userId, usersTable.id))
      .where(and(
        eq(businessManagersTable.storeId, storeId),
        eq(businessManagersTable.status, "active"),
      ));

    const metrics = await Promise.all(mgrs.map(m =>
      computeBusinessMetrics(storeId, m.since, m.commissionPercentage)
    ));

    res.json(mgrs.map((m, i) => ({
      managerId:            m.managerId,
      userId:               m.userId,
      userName:             m.userName,
      commissionPercentage: m.commissionPercentage,
      since:                m.since,
      salesCount:           metrics[i].salesCount,
      revenueUsd:           metrics[i].revenueUsd,
      commissionUsd:        metrics[i].commissionUsd,
    })));
  },
);

export default router;
