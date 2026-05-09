import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { usersTable } from "./users";

export const chatOffersTable = pgTable("chat_offers", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  workerId: integer("worker_id").notNull().references(() => usersTable.id),
  clientId: integer("client_id").notNull().references(() => usersTable.id),
  price: real("price").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("chat_offers_booking_id_idx").on(table.bookingId),
]);

export const insertChatOfferSchema = createInsertSchema(chatOffersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChatOffer = z.infer<typeof insertChatOfferSchema>;
export type ChatOffer = typeof chatOffersTable.$inferSelect;
