import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { transportRidesTable } from "./transport_rides";

// ── Ratings bidireccionales post-viaje ────────────────────────────────────────
// Cliente califica al conductor y conductor califica al cliente. Cada dirección
// queda como UNA fila, garantizado por un índice único (rideId, direction).
//   direction: "client_to_driver" | "driver_to_client"
//   rating: 1..5
//   comment: opcional
//
// El campo rateeId existe para permitir consultas de promedio por usuario sin
// tener que hacer join contra transport_rides. raterId nos permite auditoría.
export const rideRatingsTable = pgTable("ride_ratings", {
  id:        serial("id").primaryKey(),
  rideId:    integer("ride_id").notNull().references(() => transportRidesTable.id, { onDelete: "cascade" }),
  raterId:   integer("rater_id").notNull().references(() => usersTable.id),
  rateeId:   integer("ratee_id").notNull().references(() => usersTable.id),
  direction: text("direction").notNull(),
  rating:    integer("rating").notNull(),
  comment:   text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ride_ratings_ride_direction_uniq").on(t.rideId, t.direction),
  index("ride_ratings_ratee_idx").on(t.rateeId),
]);

export type RideRating = typeof rideRatingsTable.$inferSelect;
export type InsertRideRating = typeof rideRatingsTable.$inferInsert;

export type RideRatingDirection = "client_to_driver" | "driver_to_client";
