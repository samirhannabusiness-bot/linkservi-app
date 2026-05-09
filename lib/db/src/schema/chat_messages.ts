import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";
import { transportRidesTable } from "./transport_rides";

// Mensaje de chat. Antes solo se asociaba a `bookingId` (servicios). Ahora
// también puede pertenecer a un viaje de transporte (`rideId`). La validación
// XOR (uno y solo uno) se hace a nivel de aplicación; ambos son nullable a
// nivel de DB para no romper migraciones de filas existentes.
export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  rideId:    integer("ride_id").references(() => transportRidesTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("chat_messages_booking_id_idx").on(table.bookingId),
  index("chat_messages_ride_id_idx").on(table.rideId),
]);

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
