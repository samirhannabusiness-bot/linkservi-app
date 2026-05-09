import { pgTable, text, serial, integer, timestamp, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Multi-store cart checkout: ONE order_group per buyer-checkout, MANY child
// product_orders (one per cart line, grouped by store internally).
//
// payment_status flow: pending → submitted → confirmed (or rejected/cancelled).
// When confirmed, every child product_order flips to "paid" and the standard
// escrow/dispatch/release flow takes over per child.
export const orderGroupsTable = pgTable("order_groups", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  totalUsd: real("total_usd").notNull(),
  bcvRateAtMoment: real("bcv_rate_at_moment").notNull(),
  // Single shared payment for the whole cart
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentMethod: text("payment_method"),
  paymentAmount: real("payment_amount"),
  paymentReference: text("payment_reference"),
  paymentProofUrl: text("payment_proof_url"),
  paymentRejectedReason: text("payment_rejected_reason"),
  // Optional shipping/notes copied to each child for convenience
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => [
  index("order_groups_client_id_idx").on(table.clientId),
  index("order_groups_payment_status_idx").on(table.paymentStatus),
]);

export const insertOrderGroupSchema = createInsertSchema(orderGroupsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrderGroup = z.infer<typeof insertOrderGroupSchema>;
export type OrderGroup = typeof orderGroupsTable.$inferSelect;
