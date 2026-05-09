import { pgTable, text, serial, boolean, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workersTable } from "./workers";
import { categoriesTable } from "./categories";
import { workerServicesTable } from "./worker_services";

// Status flow:
// pending → accepted → payment_pending → payment_confirmed → in_progress → finished → completed
//                                                           ↘ cancelled
//                                                                       ↘ disputed

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  workerId: integer("worker_id").notNull().references(() => workersTable.id),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  description: text("description").notNull(),
  address: text("address").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  // Status: pending | accepted | payment_pending | payment_confirmed | in_progress | finished | completed | cancelled | disputed
  status: text("status").notNull().default("pending"),
  estimatedHours: real("estimated_hours"),
  totalAmount: real("total_amount"),
  clientBudget: real("client_budget"),       // Client's proposed budget (auction/subasta)
  agreedPrice: real("agreed_price"),          // Final agreed price
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  commission: real("commission"),
  workerEarnings: real("worker_earnings"),
  paymentProofUrl: text("payment_proof_url"),
  paymentRejectedReason: text("payment_rejected_reason"),
  paymentMethod: text("payment_method"),
  paymentNote: text("payment_note"),
  paymentAmount: real("payment_amount"),
  paymentReference: text("payment_reference"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  bcvRateUsed: real("bcv_rate_used"),         // BCV rate (Bs/$) at the time of payment submission
  bcvAmountBs: real("bcv_amount_bs"),          // Calculated Bs amount at submission time
  disputeReason: text("dispute_reason"),
  workerCounterOffer: real("worker_counter_offer"),
  counterOfferStatus: text("counter_offer_status"), // 'pending' | 'accepted' | 'rejected'
  bookingType: text("booking_type").notNull().default("service"), // 'service' | 'inquiry'
  serviceId: integer("service_id").references(() => workerServicesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("bookings_client_id_idx").on(table.clientId),
  index("bookings_worker_id_idx").on(table.workerId),
  index("bookings_status_idx").on(table.status),
  index("bookings_accepted_at_idx").on(table.acceptedAt),
]);

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
