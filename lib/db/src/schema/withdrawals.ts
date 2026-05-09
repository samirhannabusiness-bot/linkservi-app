import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workersTable } from "./workers";

// Withdrawal status flow: pending → approved → paid
//                                   ↘ rejected

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: real("amount").notNull(),
  // Method: pago_movil | binance | zelle
  method: text("method").notNull(),
  // Payment details as JSON string (varies per method)
  paymentDetails: text("payment_details").notNull(),
  // Status: pending | approved | rejected | paid
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("withdrawals_worker_id_idx").on(table.workerId),
  index("withdrawals_status_idx").on(table.status),
]);

export type Withdrawal = typeof withdrawalsTable.$inferSelect;
