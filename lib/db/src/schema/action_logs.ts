import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const actionLogsTable = pgTable("action_logs", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").references(() => usersTable.id).notNull(),
  action:     text("action").notNull(),
  targetType: text("target_type"),
  targetId:   integer("target_id"),
  meta:       text("meta"),
  ip:         text("ip"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("action_logs_user_idx").on(t.userId),
  index("action_logs_action_idx").on(t.action),
  index("action_logs_created_idx").on(t.createdAt),
]);

export const insertActionLogSchema = createInsertSchema(actionLogsTable).omit({ id: true, createdAt: true });
export type InsertActionLog = z.infer<typeof insertActionLogSchema>;
export type ActionLog = typeof actionLogsTable.$inferSelect;
