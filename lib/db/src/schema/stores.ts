import { pgTable, text, serial, boolean, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  // Owner information
  ownerName: text("owner_name").notNull(),
  ownerPhone: text("owner_phone"),
  ownerCedula: text("owner_cedula"),
  // Managed by this co-host
  coHostId: integer("cohost_id").notNull().references(() => usersTable.id),
  // Commission percentages (platform takes platformCommissionPct, cohost takes cohostCommissionPct, store gets the rest)
  platformCommissionPct: real("platform_commission_pct").notNull().default(10),
  cohostCommissionPct: real("cohost_commission_pct").notNull().default(5),
  // Accumulated available balance in USD (net of commissions, ready to withdraw)
  balanceUsd: real("balance_usd").notNull().default(0),
  // Payment/withdrawal method for the store owner
  paymentMethod: text("payment_method"),   // pago_movil | zelle | paypal | transferencia | binance
  paymentDetails: text("payment_details"), // JSON string: { bank?, phone?, cedula?, email?, wallet?, accountNumber?, accountHolder? }
  // Marketing fields (editable by owner)
  tagline: text("tagline"),                        // Short slogan: "Los mejores precios del mercado"
  whatsapp: text("whatsapp"),                      // WhatsApp number for contact
  instagram: text("instagram"),                    // Instagram handle (without @)
  city: text("city"),                              // Location: "Caracas, Miranda"
  accentColor: text("accent_color"),               // Hex color for store theme, default primary
  promoText: text("promo_text"),                   // Promotional banner text
  bannerUrl: text("banner_url"),                   // Custom banner/cover image for the store header
  theme: text("theme"),                            // Visual style: 'minimal' | 'moderno' | 'oscuro' | 'esmeralda' | 'fuego' | 'royal'
  builderConfig: text("builder_config"),           // JSON: { sections, menuStyle, videoUrl }
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("stores_cohost_id_idx").on(table.coHostId),
  index("stores_is_active_idx").on(table.isActive),
]);

export const insertStoreSchema = createInsertSchema(storesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
