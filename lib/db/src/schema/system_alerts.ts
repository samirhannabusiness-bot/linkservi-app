import { pgTable, text, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Persistent log of system-emitted alerts (e.g. legacy /worker sunset readiness).
 * Used as a spam-guard so we only fire each alert type at most once per 24h
 * across server restarts.
 */
export const systemAlertsTable = pgTable("system_alerts", {
  id:      serial("id").primaryKey(),
  type:    text("type").notNull(),
  payload: jsonb("payload"),
  sentAt:  timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("system_alerts_type_sent_at_idx").on(table.type, table.sentAt),
]);

export type SystemAlert = typeof systemAlertsTable.$inferSelect;
