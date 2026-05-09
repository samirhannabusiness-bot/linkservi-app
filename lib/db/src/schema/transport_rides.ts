import { pgTable, text, serial, integer, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

// Estados del viaje:
//   searching   — el cliente lo creó, esperando que un conductor acepte
//   accepted    — un conductor aceptó, va camino al pickup
//   in_progress — pasajero abordó, viaje en curso
//   completed   — viaje finalizado
//   cancelled   — cliente o conductor canceló
//   expired     — nadie aceptó dentro del tiempo límite
export const transportRidesTable = pgTable("transport_rides", {
  id:       serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  driverId: integer("driver_id").references(() => usersTable.id),

  pickupAddress: text("pickup_address").notNull(),
  pickupLat:     real("pickup_lat").notNull(),
  pickupLng:     real("pickup_lng").notNull(),

  dropoffAddress: text("dropoff_address").notNull(),
  dropoffLat:     real("dropoff_lat").notNull(),
  dropoffLng:     real("dropoff_lng").notNull(),

  status: text("status").notNull().default("searching"),

  fareUsd:     real("fare_usd").notNull().default(2),
  distanceKm:  real("distance_km"),
  notes:       text("notes"),
  cancelReason: text("cancel_reason"),

  // ── Pago + comisión LinkServi ──────────────────────────────────────────
  // paymentStatus: 'pending' antes de cobrar | 'paid' tras C2P aprobado |
  // 'failed' si el cobro fue rechazado.
  paymentStatus:        text("payment_status").notNull().default("pending"),
  // Porcentaje que se queda LinkServi (15% por defecto). Configurable a futuro.
  commissionPct:        real("commission_pct").notNull().default(15),
  // Montos en USD ya calculados al completar el viaje (para auditoría).
  commissionUsd:        real("commission_usd"),
  driverEarningsUsd:    real("driver_earnings_usd"),
  // FK a bdv_c2p_transactions cuando el pago se acredita. Sin onDelete cascade.
  paymentTransactionId: integer("payment_transaction_id"),
  paidAt:               timestamp("paid_at", { withTimezone: true }),

  createdAt:   timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  acceptedAt:  timestamp("accepted_at",  { withTimezone: true }),
  startedAt:   timestamp("started_at",   { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  expiresAt:   timestamp("expires_at",   { withTimezone: true }),
}, (t) => [
  index("ride_client_idx").on(t.clientId),
  index("ride_driver_idx").on(t.driverId),
  index("ride_status_idx").on(t.status),

  // ── Constraints anti-race ───────────────────────────────────────────────
  // Garantizan a nivel de DB que un cliente o un driver no puedan tener más
  // de un viaje activo. Convierten violaciones (23505) en 409 sin condiciones
  // de carrera, incluso bajo requests paralelas.
  uniqueIndex("ride_unique_active_client_idx")
    .on(t.clientId)
    .where(sql`status in ('searching','accepted','in_progress')`),
  uniqueIndex("ride_unique_active_driver_idx")
    .on(t.driverId)
    .where(sql`status in ('accepted','in_progress') and driver_id is not null`),
]);

export type TransportRide = typeof transportRidesTable.$inferSelect;
