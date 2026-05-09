import { pgTable, text, serial, integer, timestamp, real, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { storesTable } from "./stores";

export const deliveryRequestsTable = pgTable("delivery_requests", {
  id: serial("id").primaryKey(),

  productId:   integer("product_id").references(() => productsTable.id),
  storeId:     integer("store_id").references(() => storesTable.id),
  clientId:    integer("client_id").notNull().references(() => usersTable.id),

  productName:  text("product_name").notNull(),
  productImage: text("product_image"),

  pickupAddress: text("pickup_address"),
  pickupLat:     real("pickup_lat"),
  pickupLng:     real("pickup_lng"),

  dropoffAddress: text("dropoff_address").notNull(),
  dropoffLat:     real("dropoff_lat"),
  dropoffLng:     real("dropoff_lng"),

  // searching | assigned | picked_up | in_transit | delivered | cancelled | expired
  status: text("status").notNull().default("searching"),

  assignedDriverId: integer("assigned_driver_id").references(() => usersTable.id),
  assignedAt:       timestamp("assigned_at", { withTimezone: true }),

  deliveryFeeUsd:         real("delivery_fee_usd").notNull().default(3),
  platformCommissionUsd:  real("platform_commission_usd").notNull().default(0.6),

  currentRadiusKm:  real("current_radius_km").notNull().default(5),
  lastExpansionAt:  timestamp("last_expansion_at", { withTimezone: true }),

  expiresAt:  timestamp("expires_at", { withTimezone: true }),
  notes:      text("notes"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("del_req_client_idx").on(t.clientId),
  index("del_req_status_idx").on(t.status),
  index("del_req_driver_idx").on(t.assignedDriverId),
  index("del_req_store_idx").on(t.storeId),
]);

export type DeliveryRequest = typeof deliveryRequestsTable.$inferSelect;
