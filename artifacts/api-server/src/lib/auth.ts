import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, storesTable, businessManagersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

// ── Cookie helper (shared across auth routes) ─────────────────────────────────
// Sets the JWT in an HttpOnly cookie — not readable by JavaScript (XSS-safe).
// Uses SameSite=Lax: cookies are sent on same-site requests and top-level
// cross-site GET navigation, but NOT on cross-site POST (CSRF protection).
export function setAuthCookie(res: Response, token: string): void {
  res.cookie("sl_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

const JWT_SECRET = process.env.SESSION_SECRET ?? "";
if (!JWT_SECRET) {
  throw new Error(
    "FATAL: SESSION_SECRET environment variable is not set. " +
    "The server cannot start without a secure JWT secret. " +
    "Set SESSION_SECRET in your environment secrets."
  );
}

export function signToken(userId: number, role: string, secondaryRole: string | null = null): string {
  // `secondaryRole` se firma en el JWT para que canales que no consultan DB
  // (ej. Socket.io middleware) puedan tomar decisiones de autorización
  // multi-rol coherentes con el REST (ver isDriver() en routes/transport.ts).
  return jwt.sign({ userId, role, secondaryRole }, JWT_SECRET, { expiresIn: "7d" });
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  // Multi-role canonical source. Always contains at least "client".
  // Falls back to [role, secondaryRole] if the DB row lacks the column.
  roles: string[];
  adminRole: string | null;
  secondaryRole: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  state?: string | null;
  city?: string | null;
  clientPlan?: string | null;
  clientPremiumUntil?: Date | string | null;
  clientPremiumDiscount?: number | null;
  // ── Verificación progresiva (level 0..3). Siempre presente, default false.
  emailVerified?: boolean;
}

// Returns true if the user has the given role under any source:
// - new `roles[]` array (canonical)
// - legacy `role` column
// - legacy `secondaryRole` column
export function userHasRole(user: AuthUser | null | undefined, role: string): boolean {
  if (!user) return false;
  if (Array.isArray(user.roles) && user.roles.includes(role)) return true;
  if (user.role === role) return true;
  if (user.secondaryRole === role) return true;
  return false;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // 1. Prefer HttpOnly cookie (XSS-safe) — set on login/register by the auth routes
  // 2. Fall back to Authorization: Bearer header (keeps backward-compat for existing clients)
  let token: string | undefined = (req as any).cookies?.sl_token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const dbRoles: unknown = (user as any).roles;
    const roles: string[] = Array.isArray(dbRoles) && dbRoles.length > 0
      ? (dbRoles as string[])
      : [user.role, (user as any).secondaryRole].filter(Boolean) as string[];
    req.user = {
      ...user,
      roles,
      adminRole: (user as any).adminRole ?? null,
      secondaryRole: (user as any).secondaryRole ?? null,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!roles.some(r => userHasRole(req.user!, r))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

// ── Helper: does the user have access to a store (owner / admin / manager) ───
// Returns true when:
//   1. userRole === "admin"
//   2. The user is the store owner (storesTable.coHostId === userId)
//   3. The user is an active business_managers row for that store, AND
//      (if `permission` is given) the row's permissions JSON has that key true.
// Returns false when the store does not exist or the user has no access.
export type ManagerPermission =
  | "canChat" | "canManageOrders" | "canManageProducts" | "canManageServices";

export async function userHasStoreAccess(
  userId: number,
  userRole: string,
  storeId: number,
  permission?: ManagerPermission,
): Promise<boolean> {
  if (userRole === "admin") return true;
  const [store] = await db
    .select({ coHostId: storesTable.coHostId })
    .from(storesTable)
    .where(eq(storesTable.id, storeId));
  if (!store) return false;
  if (store.coHostId === userId) return true;
  const [mgr] = await db
    .select({ permissions: businessManagersTable.permissions })
    .from(businessManagersTable)
    .where(and(
      eq(businessManagersTable.storeId, storeId),
      eq(businessManagersTable.userId, userId),
      eq(businessManagersTable.status, "active"),
    ));
  if (!mgr) return false;
  if (!permission) return true;
  let perms: Record<string, boolean> = {};
  try { perms = JSON.parse(mgr.permissions ?? "{}"); } catch { perms = {}; }
  return !!perms[permission];
}

// ── Manager-of-store permission middleware ────────────────────────────────────
// Allows the request to proceed if the authenticated user is one of:
//   1. The store owner (storesTable.coHostId === user.id)
//   2. An admin (super powers)
//   3. An active business_managers row for that store, AND (if `permission`
//      is given) the row's permissions JSON has that key set to true
//
// Reads the storeId from req.params[paramName] (default "storeId").
// permission can be one of: "canChat" | "canManageOrders" | "canManageProducts" | "canManageServices"
// If permission is omitted, only existence of an active manager row is required.
export function requireManagerOf(
  paramName = "storeId",
  permission?: "canChat" | "canManageOrders" | "canManageProducts" | "canManageServices",
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const storeId = Number(req.params[paramName]);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      res.status(400).json({ error: "storeId inválido" });
      return;
    }
    // Admins always pass
    if (req.user.role === "admin") { next(); return; }

    // Owner check
    const [store] = await db
      .select({ coHostId: storesTable.coHostId })
      .from(storesTable)
      .where(eq(storesTable.id, storeId));
    if (!store) { res.status(404).json({ error: "Negocio no encontrado" }); return; }
    if (store.coHostId === req.user.id) { next(); return; }

    // Manager check
    const [mgr] = await db
      .select({ permissions: businessManagersTable.permissions })
      .from(businessManagersTable)
      .where(and(
        eq(businessManagersTable.storeId, storeId),
        eq(businessManagersTable.userId, req.user.id),
        eq(businessManagersTable.status, "active"),
      ));
    if (!mgr) { res.status(403).json({ error: "No tienes acceso a este negocio" }); return; }

    if (permission) {
      let perms: Record<string, boolean> = {};
      try { perms = JSON.parse(mgr.permissions ?? "{}"); } catch { perms = {}; }
      if (!perms[permission]) {
        res.status(403).json({ error: `Tu rol de gestor no tiene permiso para: ${permission}` });
        return;
      }
    }
    next();
  };
}

// Effective admin role: null means legacy admin → treat as super_admin
export function getEffectiveAdminRole(user: AuthUser): string {
  if (user.role !== "admin") return "";
  return user.adminRole ?? "super_admin";
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificación progresiva — gating gradual basado en el nivel del usuario.
//
// Niveles:
//   0 — usuario normal (sólo autenticado)
//   1 — emailVerified === true                      → requireVerifiedEmail
//   2 — perfil básico completo (KYC ligero)         → requireBasicProfile
//   3 — verificación KYC completa (futuro)
//
// Los handlers responden 403 con { error, code, action } para que el frontend
// pueda mostrar un toast con CTA "Verificar ahora" sin tener que parsear texto.
//
// IMPORTANTE: estos middlewares se montan DESPUÉS de `authenticate` y NO
// alteran el contrato existente; sólo añaden un chequeo extra en endpoints
// específicos (pagos, retiros, activación de conductor, creación de tienda).
// ─────────────────────────────────────────────────────────────────────────────

export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.emailVerified) {
    res.status(403).json({
      error: "Debes verificar tu correo para realizar esta acción",
      code: "EMAIL_NOT_VERIFIED",
      action: { label: "Verificar ahora", href: "/verify-email" },
    });
    return;
  }
  next();
}

// Considera "perfil básico completo" cuando, además del email verificado, el
// usuario tiene nombre y teléfono. Estos son los datos mínimos requeridos
// para operaciones financieras (retiros) o publicación de servicios.
export function requireBasicProfile(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.emailVerified) {
    res.status(403).json({
      error: "Debes verificar tu correo para realizar esta acción",
      code: "EMAIL_NOT_VERIFIED",
      action: { label: "Verificar ahora", href: "/verify-email" },
    });
    return;
  }
  const name = (req.user.name ?? "").trim();
  const phone = (req.user.phone ?? "").trim();
  if (!name || !phone) {
    res.status(403).json({
      error: "Completa tu perfil (nombre y teléfono) para continuar",
      code: "PROFILE_INCOMPLETE",
      action: { label: "Completar perfil", href: "/profile/setup" },
    });
    return;
  }
  next();
}

// Middleware: only for admin users with specific sub-roles
// Pass "super_admin" to restrict to super admins only
export function requireAdminRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== "admin") {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    const effective = getEffectiveAdminRole(req.user);
    if (!allowedRoles.includes(effective)) {
      res.status(403).json({ error: "No tienes permisos para esta acción" });
      return;
    }
    next();
  };
}
