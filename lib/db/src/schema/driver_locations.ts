import { pgTable, integer, real, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const driverLocationsTable = pgTable("driver_locations", {
  driverId:  integer("driver_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  lat:       real("lat").notNull(),
  lng:       real("lng").notNull(),
  heading:   real("heading"),
  speedKph:  real("speed_kph"),
  isOnline:  boolean("is_online").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("driver_loc_online_idx").on(t.isOnline),
  index("driver_loc_updated_idx").on(t.updatedAt),
]);

export type DriverLocation = typeof driverLocationsTable.$inferSelect;
