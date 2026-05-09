import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";
import { storeImportsTable } from "./store_imports";

export const importRunsTable = pgTable("import_runs", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").references(() => storeImportsTable.id, { onDelete: "set null" }),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),  // "running" | "completed" | "failed"
  totalDetected: integer("total_detected").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  errorLog: text("error_log"),                          // JSON array of {row, message}
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("import_runs_store_id_idx").on(table.storeId),
  index("import_runs_status_idx").on(table.status),
]);

export const insertImportRunSchema = createInsertSchema(importRunsTable).omit({ id: true, startedAt: true });
export type InsertImportRun = z.infer<typeof insertImportRunSchema>;
export type ImportRun = typeof importRunsTable.$inferSelect;
