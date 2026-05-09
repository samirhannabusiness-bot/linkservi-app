import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { storesTable } from "./stores";

// Sync Agent registrado por pairing.
// Una fila por instalación (uno por user para esta primera fase).
// La auth via x-api-key sigue resolviendo en integration_configs (compat),
// y esta tabla acumula metadata + telemetría para el dashboard admin.
export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Resuelto lazy en el primer telemetry o sync. Puede quedar null hasta entonces.
  storeId: integer("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  apiKey: text("api_key").notNull(),
  name: text("name").notNull().default("Sync Agent"),
  version: text("version"),
  // online | offline | error
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  productsSynced: integer("products_synced").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  lastError: text("last_error"),
  pairedAt: timestamp("paired_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("agents_api_key_unique").on(t.apiKey),
  // MVP: un agente por usuario. Re-pair sobreescribe la fila por upsert.
  uniqueIndex("agents_user_unique").on(t.userId),
  index("agents_status_idx").on(t.status),
]);

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ createdAt: true, pairedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
