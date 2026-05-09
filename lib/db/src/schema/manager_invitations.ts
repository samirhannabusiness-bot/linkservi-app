import { pgTable, serial, integer, text, timestamp, real, smallint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { storesTable } from "./stores";

// ── Manager invitation flow ───────────────────────────────────────────────────
// A store owner (cohost) sends a token-based email invitation to a person who
// becomes a "gestor" upon acceptance. If the invitee already has a LinkServi
// account, they only need to log in and accept; otherwise, they register first.
//
// Lifecycle: created → (acceptedAt set) OR (expiresAt passes → expired) OR (canceled by deletion).
export const managerInvitationsTable = pgTable("manager_invitations", {
  id:                   serial("id").primaryKey(),
  storeId:              integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  email:                text("email").notNull(),
  token:                text("token").notNull().unique(),

  // Permissions JSON to apply when accepted (same shape as business_managers.permissions)
  permissions:          text("permissions").notNull().default('{"canChat":true,"canManageOrders":true,"canManageProducts":true,"canManageServices":true}'),
  commissionPercentage: real("commission_percentage").notNull().default(1.5),

  invitedById:          integer("invited_by_id").notNull().references(() => usersTable.id),
  expiresAt:            timestamp("expires_at",   { withTimezone: true }).notNull(),
  acceptedAt:           timestamp("accepted_at",  { withTimezone: true }),
  acceptedByUserId:     integer("accepted_by_user_id").references(() => usersTable.id),
  reminderSentAt:       timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt:            timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),

  // Tracking
  emailOpenedAt:        timestamp("email_opened_at",  { withTimezone: true }),
  emailOpenCount:       smallint("email_open_count").notNull().default(0),
  linkClickedAt:        timestamp("link_clicked_at",  { withTimezone: true }),
  linkClickCount:       smallint("link_click_count").notNull().default(0),
}, (t) => [
  index("mgr_inv_store_idx").on(t.storeId),
  index("mgr_inv_email_idx").on(t.email),
  index("mgr_inv_token_idx").on(t.token),
  // Only ONE pending invitation per (store, email). Re-invite reuses the row by
  // deleting the old pending one first (mirrors the collaborator-invitation flow).
  uniqueIndex("mgr_inv_pending_uniq")
    .on(t.storeId, t.email)
    .where(sql`${t.acceptedAt} IS NULL`),
]);

export type ManagerInvitation = typeof managerInvitationsTable.$inferSelect;
export type InsertManagerInvitation = typeof managerInvitationsTable.$inferInsert;
