import { pgTable, text, serial, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const storeImportsTable = pgTable("store_imports", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),                     // "url" | "file"
  sourceUrl: text("source_url"),                                 // Catalog URL (when sourceType=url)
  apiKey: text("api_key"),                                       // Optional API key (TODO: encrypt at rest)
  format: text("format").notNull().default("auto"),              // "auto" | "json" | "csv"
  autoSync: boolean("auto_sync").notNull().default(false),
  intervalMin: integer("interval_min").notNull().default(15),    // Minutes between auto-syncs
  fieldMapping: text("field_mapping"),                           // JSON: { name: "title", price: "cost", ... }
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("store_imports_store_id_idx").on(table.storeId),
  index("store_imports_auto_sync_idx").on(table.autoSync),
]);

export const insertStoreImportSchema = createInsertSchema(storeImportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStoreImport = z.infer<typeof insertStoreImportSchema>;
export type StoreImport = typeof storeImportsTable.$inferSelect;
