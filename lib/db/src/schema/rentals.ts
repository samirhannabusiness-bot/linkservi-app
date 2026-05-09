import { pgTable, text, serial, real, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { productsTable } from "./products";

export const rentalsTable = pgTable("rentals", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: integer("days").notNull(),
  dailyRate: real("daily_rate").notNull(),
  weeklyRate: real("weekly_rate"),
  subtotal: real("subtotal").notNull(),
  commission: real("commission").notNull(),
  depositAmount: real("deposit_amount").notNull(),
  depositStatus: text("deposit_status").notNull().default("held"),
  status: text("status").notNull().default("pending"),
  clientNotes: text("client_notes"),
  productName: text("product_name").notNull().default(""),
  ownerName: text("owner_name").notNull().default(""),
  clientName: text("client_name").notNull().default(""),
  // Trazabilidad legal — URL del contrato PDF en Object Storage
  contractUrl: text("contract_url"),
  // Logística — si el cliente solicitó delivery en este alquiler
  hasDelivery: boolean("has_delivery").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("rentals_status_idx").on(t.status),
  index("rentals_owner_idx").on(t.ownerId),
  index("rentals_client_idx").on(t.clientId),
  index("rentals_deposit_idx").on(t.depositStatus),
  index("rentals_product_idx").on(t.productId),
]);

export type Rental = typeof rentalsTable.$inferSelect;
