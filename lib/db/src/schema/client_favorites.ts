import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workersTable } from "./workers";

export const clientFavoritesTable = pgTable(
  "client_favorites",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull().references(() => usersTable.id),
    workerId: integer("worker_id").notNull().references(() => workersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("client_favorites_uniq").on(t.clientId, t.workerId)],
);

export type ClientFavorite = typeof clientFavoritesTable.$inferSelect;
