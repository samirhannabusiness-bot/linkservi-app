import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Co-host plan upgrade request flow:
// pending → approved (cohost_plan set to 'premium', expires set)
//         ↘ rejected

export const cohostPlanRequestsTable = pgTable("cohost_plan_requests", {
  id: serial("id").primaryKey(),
  cohostId: integer("cohost_id").notNull().references(() => usersTable.id),
  // Duration selected by co-host (months)
  planMonths: integer("plan_months").notNull().default(1),
  // Amount they should pay in USD
  amount: real("amount").notNull(),
  // Payment method: pago_movil | zelle | paypal | transferencia | binance
  paymentMethod: text("payment_method").notNull(),
  // Transaction reference provided by co-host
  transactionRef: text("transaction_ref"),
  // Receipt/proof image URL (optional)
  receiptUrl: text("receipt_url"),
  // Status: pending | approved | rejected
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CohostPlanRequest = typeof cohostPlanRequestsTable.$inferSelect;
