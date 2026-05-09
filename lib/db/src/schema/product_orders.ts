import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { orderGroupsTable } from "./order_groups";

export const productOrdersTable = pgTable("product_orders", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  // FASE CHECKOUT — multi-store cart: nullable so legacy single-product orders
  // (created before cart) keep working. New orders coming from the cart
  // checkout will always carry a group_id and use the group's payment proof.
  groupId: integer("group_id").references(() => orderGroupsTable.id),
  // Quantity bought in this line item. Default 1 for legacy parity.
  quantity: integer("quantity").notNull().default(1),
  priceUsdAtMoment: real("price_usd_at_moment").notNull(),
  bcvRateAtMoment: real("bcv_rate_at_moment").notNull(),
  // Status flow (canonical maps in api: pending|paid|shipped|delivered|released):
  //   pending → (auto: skip accept) → payment_pending* → payment_confirmed → dispatched → delivered
  //   * payment_pending only used for legacy single-order flow; cart flow keeps
  //     children at "pending" until the parent group is admin-confirmed.
  // At any step: cancelled
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  deliveryAddress: text("delivery_address"),
  // Payment proof fields (mirrors bookingsTable)
  paymentProofUrl: text("payment_proof_url"),
  paymentMethod: text("payment_method"),
  paymentAmount: real("payment_amount"),
  paymentReference: text("payment_reference"),
  paymentRejectedReason: text("payment_rejected_reason"),
  // Commission breakdown (calculated at delivery confirmation)
  platformCommissionAmt: real("platform_commission_amt"),
  cohostCommissionAmt: real("cohost_commission_amt"),
  storeEarningsAmt: real("store_earnings_amt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("product_orders_client_id_idx").on(table.clientId),
  index("product_orders_product_id_idx").on(table.productId),
  index("product_orders_status_idx").on(table.status),
]);

export const insertProductOrderSchema = createInsertSchema(productOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductOrder = z.infer<typeof insertProductOrderSchema>;
export type ProductOrder = typeof productOrdersTable.$inferSelect;
