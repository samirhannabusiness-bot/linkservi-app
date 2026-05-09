import { pgTable, text, serial, boolean, timestamp, real, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  // Legacy single-role column — kept for backward compatibility with existing
  // checks across the codebase. New code should prefer `roles[]`.
  role: text("role").notNull().default("client"),
  // Multi-role array — the canonical source of truth going forward.
  // Backfilled from `role` + `secondaryRole` for existing users on migration.
  // Example values: ["client"], ["client", "gestor"], ["client", "gestor", "worker"].
  roles: text("roles").array().notNull().default(sql`ARRAY['client']::text[]`),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  state: text("state"),
  city: text("city"),
  referralCode: text("referral_code"),
  referredBy: text("referred_by"),
  referralBonus: real("referral_bonus").notNull().default(0),
  referralCount: integer("referral_count").notNull().default(0),
  latitude: real("latitude"),
  longitude: real("longitude"),
  // Co-host: accumulated product commission balance (separate from store owner earnings)
  productCommissionBalanceUsd: real("product_commission_balance_usd").notNull().default(0),
  // Co-host plan: free | premium
  cohostPlan: text("cohost_plan").notNull().default("free"),
  cohostPlanExpiresAt: timestamp("cohost_plan_expires_at", { withTimezone: true }),
  // Co-host: rolling monthly volume (USD) to determine commission tier
  cohostMonthlyVolumeUsd: real("cohost_monthly_volume_usd").notNull().default(0),
  cohostVolumeResetAt: timestamp("cohost_volume_reset_at", { withTimezone: true }),
  // Admin collaborator sub-role: super_admin | soporte | finanzas | null (null = super_admin for legacy admins)
  adminRole: text("admin_role"),
  secondaryRole: text("secondary_role"), // "worker" | null — dual-role users
  // Client Premium plan
  clientPlan: text("client_plan").notNull().default("free"), // "free" | "premium"
  clientPremiumUntil: timestamp("client_premium_until", { withTimezone: true }),
  clientPremiumDiscount: real("client_premium_discount").notNull().default(0), // e.g. 0.05 = 5%
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry", { withTimezone: true }),
  // Email verification — token-based (sha256 hashed). emailVerified defaults
  // to false for new accounts; existing users were backfilled to true on
  // migration. The verification link in the email points to the frontend
  // route /verify-email?token=<raw>, which calls GET /api/auth/verify-email.
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry", { withTimezone: true }),
  provider: text("provider").notNull().default("email"),
  providerId: text("provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_is_active_idx").on(table.isActive),
  // GIN index over text[] for fast `ANY('gestor' = ANY(roles))` queries.
  index("users_roles_gin_idx").using("gin", table.roles),
  // Partial index on email_verification_token to keep verify-email lookups
  // O(log n) and prevent table scans from random-token flooding. Only rows
  // with an outstanding token are indexed (token is cleared on success).
  index("users_email_verification_token_idx")
    .on(table.emailVerificationToken)
    .where(sql`${table.emailVerificationToken} IS NOT NULL`),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
