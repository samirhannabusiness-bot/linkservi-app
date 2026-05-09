import { pgTable, text, serial, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { storesTable } from "./stores";

export const storeMessagesTable = pgTable("store_messages", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  receiverId: integer("receiver_id").notNull().references(() => usersTable.id),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  content: text("content").notNull().default(""),
  messageType: text("message_type").notNull().default("text"),
  imageUrl: text("image_url"),
  audioUrl: text("audio_url"),
  videoUrl: text("video_url"),
  productData: text("product_data"),
  wasFiltered: boolean("was_filtered").notNull().default(false),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("store_messages_store_buyer_idx").on(table.storeId, table.buyerId),
  index("store_messages_receiver_idx").on(table.receiverId, table.isRead),
]);

export const insertStoreMessageSchema = createInsertSchema(storeMessagesTable).omit({ id: true, createdAt: true });
export type InsertStoreMessage = z.infer<typeof insertStoreMessageSchema>;
export type StoreMessage = typeof storeMessagesTable.$inferSelect;
