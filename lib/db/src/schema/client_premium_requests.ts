import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Client Premium request flow: pending → approved | rejected

export const clientPremiumRequestsTable = pgTable("client_premium_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  paymentMethod: text("payment_method").notNull(),
  transactionRef: text("transaction_ref"),
  receiptUrl: text("receipt_url"),
  days: integer("days").notNull().default(30),
  amount: real("amount").notNull().default(4.99),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ClientPremiumRequest = typeof clientPremiumRequestsTable.$inferSelect;
