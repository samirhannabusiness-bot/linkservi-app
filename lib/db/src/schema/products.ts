import { pgTable, text, serial, boolean, timestamp, integer, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { storesTable } from "./stores";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  priceUsd: real("price_usd").notNull(),
  image: text("image"),
  images: text("images").array().default([]),
  category: text("category").notNull().default("general"),
  // Legacy: coHostId kept for backward compat, storeId is preferred
  coHostId: integer("cohost_id").notNull().references(() => usersTable.id),
  // Store this product belongs to (null for legacy products)
  storeId: integer("store_id").references(() => storesTable.id),
  latitude: real("latitude"),
  longitude: real("longitude"),
  condition: text("condition").notNull().default("new"),
  hasDelivery: boolean("has_delivery").notNull().default(false),
  stock: integer("stock"),  // null = unlimited
  isActive: boolean("is_active").notNull().default(true),
  // ── ServiRent: rental listing fields ──────────────────────────────────────
  listingType: text("listing_type").notNull().default("sale"),          // "sale" | "rental"
  rentalPricePerDay: real("rental_price_per_day"),
  rentalPricePerWeek: real("rental_price_per_week"),
  rentalDeposit: real("rental_deposit"),
  rentalRules: text("rental_rules"),
  blockedDates: text("blocked_dates").array().default([]),              // ISO date strings
  // ── ServiRent: sub-type classification ────────────────────────────────────────
  // rental → "tool" | "vehicle" | "property" | "experience"
  rentalType: text("rental_type").notNull().default("tool"),
  // sale   → "general" | "vehicle" | "property"
  productType: text("product_type").notNull().default("general"),
  // JSON blob for type-specific extra fields
  rentalMetadata: text("rental_metadata"),
  productMetadata: text("product_metadata"),
  // ── Premium visibility ──────────────────────────────────────────────────────
  isPremium: boolean("is_premium").notNull().default(false),
  premiumUntil: timestamp("premium_until", { withTimezone: true }),
  viewCount: integer("view_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  // ── Instant Store importer ──────────────────────────────────────────────
  externalId: text("external_id"),                 // Client's catalog ID (for upsert dedupe)
  source: text("source"),                          // Origin URL or filename of import
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("products_cohost_id_idx").on(table.coHostId),
  index("products_store_id_idx").on(table.storeId),
  index("products_is_active_idx").on(table.isActive),
  index("products_category_idx").on(table.category),
  // FASE 1 backend perf: índices para los filtros del marketplace.
  index("products_listing_type_idx").on(table.listingType),
  index("products_is_premium_idx").on(table.isPremium),
  uniqueIndex("products_store_external_unique").on(table.storeId, table.externalId),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
