import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

export const emailEventsTable = pgTable("email_events", {
  id:             serial("id").primaryKey(),
  trackingId:     text("tracking_id").notNull().unique(),
  eventType:      text("event_type").notNull(),
  emailType:      text("email_type").notNull().default("unknown"),
  recipientEmail: text("recipient_email").notNull(),
  subject:        text("subject").notNull().default(""),
  variant:        text("variant"),
  clickedUrl:     text("clicked_url"),
  metadata:       text("metadata"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("email_events_tracking_id_idx").on(table.trackingId),
  index("email_events_event_type_idx").on(table.eventType),
  index("email_events_recipient_idx").on(table.recipientEmail),
  index("email_events_variant_idx").on(table.variant),
]);

export type EmailEvent = typeof emailEventsTable.$inferSelect;
