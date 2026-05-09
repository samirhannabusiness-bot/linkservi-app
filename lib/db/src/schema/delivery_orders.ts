import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { rentalsTable } from "./rentals";

export const deliveryOrdersTable = pgTable("delivery_orders", {
  id: serial("id").primaryKey(),
  rentalId: integer("rental_id").notNull().references(() => rentalsTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  productName: text("product_name").notNull(),
  pickupAddress: text("pickup_address"),
  deliveryAddress: text("delivery_address"),
  // status: pending_assignment | assigned | in_transit | delivered | cancelled
  status: text("status").notNull().default("pending_assignment"),
  assignedDriverId: integer("assigned_driver_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("delivery_orders_rental_idx").on(t.rentalId),
  index("delivery_orders_status_idx").on(t.status),
  index("delivery_orders_owner_idx").on(t.ownerId),
  index("delivery_orders_client_idx").on(t.clientId),
]);

export type DeliveryOrder = typeof deliveryOrdersTable.$inferSelect;
