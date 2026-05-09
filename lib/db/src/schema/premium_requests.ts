import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { workersTable } from "./workers";
import { usersTable } from "./users";

// Premium request status flow: pending → approved (worker becomes premium)
//                                        ↘ rejected

export const premiumRequestsTable = pgTable("premium_requests", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  // Payment method used: pago_movil | zelle | paypal | transferencia
  paymentMethod: text("payment_method").notNull(),
  // Transaction reference / confirmation number provided by worker
  transactionRef: text("transaction_ref"),
  // Receipt image URL (optional)
  receiptUrl: text("receipt_url"),
  // Plan duration in days
  days: integer("days").notNull().default(30),
  amount: real("amount").notNull().default(5),
  // Status: pending | approved | rejected
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PremiumRequest = typeof premiumRequestsTable.$inferSelect;
