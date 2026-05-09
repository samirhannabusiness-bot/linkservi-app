import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workersTable } from "./workers";
import { bookingsTable } from "./bookings";

export const servicePhotosTable = pgTable(
  "service_photos",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
    workerId: integer("worker_id").notNull().references(() => workersTable.id),
    uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => usersTable.id),
    photoType: text("photo_type").notNull(), // 'before' | 'after'
    imageUrl: text("image_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("service_photos_booking_idx").on(t.bookingId)],
);

export type ServicePhoto = typeof servicePhotosTable.$inferSelect;
