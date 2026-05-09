import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workersTable } from "./workers";
import { bookingsTable } from "./bookings";

// Status flow: pending → scheduled → completed
//                      → refused (worker refused / no-show)
//                      → expired (claimed but never acted on past 30 days)
export const serviceWarrantiesTable = pgTable("service_warranties", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  workerId: integer("worker_id").notNull().references(() => workersTable.id),
  serviceName: text("service_name").notNull(),
  status: text("status").notNull().default("pending"),
  // Timestamps
  workerNotifiedAt: timestamp("worker_notified_at", { withTimezone: true }),
  workerRespondedAt: timestamp("worker_responded_at", { withTimezone: true }),
  visitScheduledAt: timestamp("visit_scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  workerBlockedAt: timestamp("worker_blocked_at", { withTimezone: true }),
  notes: text("notes"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("swarranties_booking_idx").on(table.bookingId),
  index("swarranties_worker_idx").on(table.workerId),
  index("swarranties_client_idx").on(table.clientId),
  index("swarranties_status_idx").on(table.status),
]);

export type ServiceWarranty = typeof serviceWarrantiesTable.$inferSelect;
