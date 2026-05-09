import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { deliveryRequestsTable } from "./delivery_requests";

export const deliveryOffersTable = pgTable("delivery_offers", {
  id:        serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => deliveryRequestsTable.id),
  driverId:  integer("driver_id").notNull().references(() => usersTable.id),

  // pending | accepted | rejected | expired
  status: text("status").notNull().default("pending"),

  offeredAt:   timestamp("offered_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (t) => [
  index("del_offer_request_idx").on(t.requestId),
  index("del_offer_driver_idx").on(t.driverId),
  index("del_offer_status_idx").on(t.status),
]);

export type DeliveryOffer = typeof deliveryOffersTable.$inferSelect;
