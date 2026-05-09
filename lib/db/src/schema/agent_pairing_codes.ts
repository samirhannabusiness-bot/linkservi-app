import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { storesTable } from "./stores";

// Pairing one-time codes que LinkServi emite para que el Sync Agent
// se conecte sin que el dueño copie API keys manualmente.
// TTL: 10 min. usedAt: marcado atómicamente al redimir.
export const agentPairingCodesTable = pgTable("agent_pairing_codes", {
  id: serial("id").primaryKey(),
  // 8 chars [A-Z2-9 sin ambigüedades] — fácil de tipear, ~36 bits entropía.
  code: text("code").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Tienda preseleccionada por el dueño (opcional).
  storeId: integer("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  // FK lógica a agents.id (sin reference para evitar circular import).
  claimedByAgentId: integer("claimed_by_agent_id"),
  // Atribución del cliente del agent (sólo informativa).
  claimedByDevice: text("claimed_by_device"),
  // Anti-bruteforce: contador de intentos fallidos sobre este code.
  failedAttempts: integer("failed_attempts").notNull().default(0),
}, (t) => [
  uniqueIndex("agent_pairing_codes_code_unique").on(t.code),
  index("agent_pairing_codes_user_idx").on(t.userId, t.createdAt),
]);

export type AgentPairingCode = typeof agentPairingCodesTable.$inferSelect;
export const pairingCodeFormatSchema = z.string().regex(/^[A-Z2-9]{8}$/, "Código inválido");
