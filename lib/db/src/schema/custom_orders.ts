import { pgTable, text, serial, timestamp, integer, real, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { storesTable } from "./stores";

export const customOrdersTable = pgTable("custom_orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  coHostId: integer("co_host_id").notNull().references(() => usersTable.id),
  productName: text("product_name").notNull(),
  imageUrl: text("image_url"),
  priceUsd: real("price_usd").notNull(),
  hasDelivery: boolean("has_delivery").notNull().default(false),
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
  // Status: payment_pending → paid | rejected
  status: text("status").notNull().default("payment_pending"),
  paymentProofUrl: text("payment_proof_url"),
  paymentMethod: text("payment_method"),
  paymentAmount: real("payment_amount"),
  paymentReference: text("payment_reference"),
  paymentRejectedReason: text("payment_rejected_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("custom_orders_client_id_idx").on(table.clientId),
  index("custom_orders_store_id_idx").on(table.storeId),
  index("custom_orders_status_idx").on(table.status),
]);

export const insertCustomOrderSchema = createInsertSchema(customOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomOrder = z.infer<typeof insertCustomOrderSchema>;
export type CustomOrder = typeof customOrdersTable.$inferSelect;
