import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";
import { workersTable } from "./workers";

export const urgentRequestsTable = pgTable("urgent_requests", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  description: text("description").notNull(),
  address: text("address").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status").notNull().default("open"),
  workerId: integer("worker_id").references(() => workersTable.id),
  bookingId: integer("booking_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("urgent_requests_client_id_idx").on(table.clientId),
  index("urgent_requests_status_idx").on(table.status),
  index("urgent_requests_worker_id_idx").on(table.workerId),
]);

export type UrgentRequest = typeof urgentRequestsTable.$inferSelect;
