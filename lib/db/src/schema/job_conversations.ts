import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const jobConversationsTable = pgTable("job_conversations", {
  id: serial("id").primaryKey(),
  employerId: integer("employer_id").notNull().references(() => usersTable.id),
  applicantId: integer("applicant_id").notNull().references(() => usersTable.id),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("job_conv_employer_idx").on(t.employerId),
  index("job_conv_applicant_idx").on(t.applicantId),
  index("job_conv_last_msg_idx").on(t.lastMessageAt),
]);

export const jobMessagesTable = pgTable("job_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => jobConversationsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  messageType: text("message_type").notNull().default("text"),
  content: text("content").notNull().default(""),
  mediaUrl: text("media_url"),
  mediaMime: text("media_mime"),
  duration: integer("duration"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("job_msg_conv_idx").on(t.conversationId),
  index("job_msg_sender_idx").on(t.senderId),
  index("job_msg_created_idx").on(t.createdAt),
]);

export type JobConversation = typeof jobConversationsTable.$inferSelect;
export type JobMessage = typeof jobMessagesTable.$inferSelect;
