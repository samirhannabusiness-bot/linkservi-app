import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";

export const disputeMessagesTable = pgTable("dispute_messages", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  senderRole: text("sender_role").notNull(), // client | worker | admin
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDisputeMessageSchema = createInsertSchema(disputeMessagesTable).omit({ id: true, createdAt: true });
export type InsertDisputeMessage = z.infer<typeof insertDisputeMessageSchema>;
export type DisputeMessage = typeof disputeMessagesTable.$inferSelect;
