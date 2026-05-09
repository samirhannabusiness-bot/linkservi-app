import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  userId: integer("user_id"),
  meta: text("meta"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("events_event_idx").on(t.event),
  index("events_created_idx").on(t.createdAt),
  index("events_user_idx").on(t.userId),
]);

export type Event = typeof eventsTable.$inferSelect;
