import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { productsTable } from "./products";

// Product premium request flow:
// pending → approved (product.isPremium=true, premiumUntil set)
//         ↘ rejected

export const productPremiumRequestsTable = pgTable("product_premium_requests", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  coHostId: integer("cohost_id").notNull().references(() => usersTable.id),
  months: integer("months").notNull().default(1),
  amountUsd: real("amount_usd").notNull(),
  pagoMovilPhone: text("pago_movil_phone"),
  pagoMovilBank: text("pago_movil_bank"),
  pagoMovilRef: text("pago_movil_ref"),
  receiptUrl: text("receipt_url"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ProductPremiumRequest = typeof productPremiumRequestsTable.$inferSelect;
