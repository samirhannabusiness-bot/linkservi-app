import { pgTable, text, serial, boolean, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";

export const workerServicesTable = pgTable("worker_services", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  basePrice: real("base_price").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("worker_services_worker_id_idx").on(table.workerId),
]);

export const insertWorkerServiceSchema = createInsertSchema(workerServicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkerService = z.infer<typeof insertWorkerServiceSchema>;
export type WorkerService = typeof workerServicesTable.$inferSelect;
