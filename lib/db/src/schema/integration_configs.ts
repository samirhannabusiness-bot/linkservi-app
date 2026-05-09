import { pgTable, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Configuración persistente del Sync Agent por usuario.
// La auth del agente (header x-api-key) resuelve userId mediante esta tabla,
// por lo que sobrevive a restarts y funciona consistente entre instancias.
export const integrationConfigsTable = pgTable("integration_configs", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(),
  intervalMin: integer("interval_min").notNull().default(15),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("integration_configs_api_key_unique").on(table.apiKey),
]);

export const insertIntegrationConfigSchema = createInsertSchema(integrationConfigsTable).omit({ createdAt: true, updatedAt: true });
export type InsertIntegrationConfig = z.infer<typeof insertIntegrationConfigSchema>;
export type IntegrationConfig = typeof integrationConfigsTable.$inferSelect;
