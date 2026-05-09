import { pgTable, text, serial, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const jobSubscriptionsTable = pgTable("job_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  amountUsd: real("amount_usd").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("job_subs_user_idx").on(t.userId, t.status),
]);

export type JobSubscription = typeof jobSubscriptionsTable.$inferSelect;
