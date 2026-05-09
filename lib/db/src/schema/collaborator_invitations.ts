import { pgTable, text, serial, integer, timestamp, index, smallint } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const collaboratorInvitationsTable = pgTable("collaborator_invitations", {
  id:              serial("id").primaryKey(),
  email:           text("email").notNull(),
  adminRole:       text("admin_role").notNull(),
  token:           text("token").notNull().unique(),
  invitedById:     integer("invited_by_id").notNull().references(() => usersTable.id),
  expiresAt:       timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt:      timestamp("accepted_at", { withTimezone: true }),
  reminderSentAt:  timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // ── Tracking ───────────────────────────────────────────────────────────────
  emailOpenedAt:   timestamp("email_opened_at",  { withTimezone: true }),
  emailOpenCount:  smallint("email_open_count").notNull().default(0),
  linkClickedAt:   timestamp("link_clicked_at",  { withTimezone: true }),
  linkClickCount:  smallint("link_click_count").notNull().default(0),
}, (t) => [
  index("collab_inv_token_idx").on(t.token),
  index("collab_inv_email_idx").on(t.email),
]);

export type CollaboratorInvitation = typeof collaboratorInvitationsTable.$inferSelect;
