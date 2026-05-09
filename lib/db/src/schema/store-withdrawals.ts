import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { storesTable } from "./stores";

export const storeWithdrawalsTable = pgTable("store_withdrawals", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  requestedByUserId: integer("requested_by_user_id").notNull().references(() => usersTable.id),
  amount: real("amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentDetails: text("payment_details").notNull(),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StoreWithdrawal = typeof storeWithdrawalsTable.$inferSelect;
