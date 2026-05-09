import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workersTable } from "./workers";

export const cohostInvitationsTable = pgTable("cohost_invitations", {
  id: serial("id").primaryKey(),
  cohostUserId: integer("cohost_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedByWorkerId: integer("used_by_worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CohostInvitation = typeof cohostInvitationsTable.$inferSelect;
