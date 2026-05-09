import { pgTable, serial, integer, text, timestamp, uniqueIndex, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { storesTable } from "./stores";
import { productOrdersTable } from "./product_orders";

export const productRatingsTable = pgTable(
  "product_ratings",
  {
    id: serial("id").primaryKey(),
    productOrderId: integer("product_order_id").notNull().references(() => productOrdersTable.id),
    productId: integer("product_id").notNull().references(() => productsTable.id),
    storeId: integer("store_id").references(() => storesTable.id),
    clientId: integer("client_id").notNull().references(() => usersTable.id),
    productRating: integer("product_rating").notNull(),
    storeRating: integer("store_rating"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_ratings_order_uniq").on(t.productOrderId),
    // FASE 1 backend perf: necesario para el JOIN+GROUP BY del listado de productos.
    index("product_ratings_product_id_idx").on(t.productId),
  ],
);

export const insertProductRatingSchema = createInsertSchema(productRatingsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertProductRating = z.infer<typeof insertProductRatingSchema>;
export type ProductRating = typeof productRatingsTable.$inferSelect;
