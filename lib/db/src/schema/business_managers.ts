import { pgTable, serial, integer, text, timestamp, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { storesTable } from "./stores";

// ── Manager-of-business relationship ─────────────────────────────────────────
// Links a user (with role "gestor") to a store they manage on behalf of the
// store owner (cohost). One user can manage many stores; one store can have
// many managers. The store owner (storesTable.coHostId) is NEVER a manager —
// they are always the implicit owner with full permissions.
//
// Status lifecycle: "active" → "removed". When status="removed", the manager
// loses access immediately but the row is preserved for audit/history.
export const businessManagersTable = pgTable("business_managers", {
  id:                   serial("id").primaryKey(),
  storeId:              integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  userId:               integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),

  // JSON: { canChat, canManageOrders, canManageProducts, canManageServices }
  // Validated server-side on every action — frontend cannot bypass.
  permissions:          text("permissions").notNull().default('{"canChat":true,"canManageOrders":true,"canManageProducts":true,"canManageServices":true}'),

  // Commission % the manager earns on the store's revenue. Minimum 1.5% enforced
  // server-side. Owner can raise it; tip is a separate flow.
  commissionPercentage: real("commission_percentage").notNull().default(1.5),

  // "active" | "removed"
  status:               text("status").notNull().default("active"),

  createdAt:            timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  removedAt:            timestamp("removed_at",  { withTimezone: true }),
  removedReason:        text("removed_reason"),
  removedById:          integer("removed_by_id").references(() => usersTable.id, { onDelete: "set null" }),

  // Set once the "first sale" celebration banner has been shown to the manager,
  // so we never show it twice. Null = never seen, even if a sale already exists.
  firstSaleNotifiedAt:  timestamp("first_sale_notified_at", { withTimezone: true }),
}, (t) => [
  index("biz_mgr_store_idx").on(t.storeId),
  index("biz_mgr_user_idx").on(t.userId),
  index("biz_mgr_status_idx").on(t.status),
  // Only ONE active manager row per (store, user). A user can be re-invited
  // after removal (a new row is created) but cannot have two simultaneously.
  uniqueIndex("biz_mgr_active_uniq")
    .on(t.storeId, t.userId)
    .where(sql`${t.status} = 'active'`),
]);

export type BusinessManager = typeof businessManagersTable.$inferSelect;
export type InsertBusinessManager = typeof businessManagersTable.$inferInsert;
