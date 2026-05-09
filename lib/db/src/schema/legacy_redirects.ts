import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";

export const legacyRedirectsTable = pgTable("legacy_redirects", {
  id:        serial("id").primaryKey(),
  fromPath:  text("from_path").notNull(),
  toPath:    text("to_path").notNull(),
  userId:    integer("user_id"),
  userAgent: text("user_agent"),
  referer:   text("referer"),
  ipHash:    text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("legacy_redirects_created_at_idx").on(table.createdAt),
  index("legacy_redirects_from_path_idx").on(table.fromPath),
  index("legacy_redirects_user_id_idx").on(table.userId),
]);

export type LegacyRedirect = typeof legacyRedirectsTable.$inferSelect;
