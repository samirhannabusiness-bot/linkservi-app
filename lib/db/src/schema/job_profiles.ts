import { pgTable, text, serial, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const jobProfilesTable = pgTable("job_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),
  bio: text("bio").notNull().default(""),
  videoUrl: text("video_url"),
  city: text("city").notNull().default(""),
  skills: text("skills").notNull().default("[]"),
  workExperience: text("work_experience").notNull().default("[]"),
  isAvailable: boolean("is_available").notNull().default(true),
  cedula: text("cedula"),
  subscriptionEnd: timestamp("subscription_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("job_profiles_city_idx").on(t.city),
  index("job_profiles_sub_idx").on(t.subscriptionEnd),
]);

export type JobProfile = typeof jobProfilesTable.$inferSelect;
