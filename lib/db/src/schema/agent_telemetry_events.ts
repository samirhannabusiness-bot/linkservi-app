import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

// Eventos de telemetría que emite cada Sync Agent.
// Se mantiene una ventana corta (admin puede purgar > 30 días).
export const agentTelemetryEventsTable = pgTable("agent_telemetry_events", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  // agent_started | sync_success | sync_error | db_error | version | heartbeat
  type: text("type").notNull(),
  message: text("message"),
  // {productsSynced?, errorCode?, version?, host?, durationMs?, ...} — capped 4kb por insert.
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("agent_telemetry_agent_idx").on(t.agentId, t.createdAt),
  index("agent_telemetry_type_idx").on(t.type, t.createdAt),
]);

export type AgentTelemetryEvent = typeof agentTelemetryEventsTable.$inferSelect;

export const TELEMETRY_TYPES = [
  "agent_started",
  "sync_success",
  "sync_error",
  "db_error",
  "version",
  "heartbeat",
] as const;
export const telemetryTypeSchema = z.enum(TELEMETRY_TYPES);
