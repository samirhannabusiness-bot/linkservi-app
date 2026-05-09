import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workersTable } from "./workers";
import { bookingsTable } from "./bookings";

export const clientRatingsTable = pgTable(
  "client_ratings",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
    workerId: integer("worker_id").notNull().references(() => workersTable.id),
    clientId: integer("client_id").notNull().references(() => usersTable.id),
    rating: integer("rating").notNull(),
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("client_ratings_booking_worker_uniq").on(t.bookingId, t.workerId)],
);

export const insertClientRatingSchema = createInsertSchema(clientRatingsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertClientRating = z.infer<typeof insertClientRatingSchema>;
export type ClientRating = typeof clientRatingsTable.$inferSelect;

export const CLIENT_RATING_TAGS = [
  { key: "puntual",       label: "Puntual" },
  { key: "respetuoso",    label: "Respetuoso" },
  { key: "pago_a_tiempo", label: "Pagó a tiempo" },
  { key: "comunicativo",  label: "Comunicativo" },
  { key: "amable",        label: "Amable" },
] as const;

export type ClientRatingTagKey = typeof CLIENT_RATING_TAGS[number]["key"];
