import { pgTable, text, serial, boolean, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  description: text("description"),
  skills: text("skills").array().notNull().default([]),
  // Pricing: base price (minimum) and service price (quoted full service)
  basePrice: real("base_price").notNull().default(10),
  servicePrice: real("service_price").notNull().default(50),
  // Legacy fields kept for backwards compat
  hourlyRate: real("hourly_rate").notNull().default(25),
  pricingType: text("pricing_type").notNull().default("service"),
  baseVisitFee: real("base_visit_fee"),
  fixedPrice: real("fixed_price"),
  rating: real("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  completedJobs: integer("completed_jobs").notNull().default(0),
  earnings: real("earnings").notNull().default(0),
  isAvailable: boolean("is_available").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  verificationStatus: text("verification_status").notNull().default("pending"),
  verificationNotes: text("verification_notes"),
  documentType: text("document_type"),
  documentNumber: text("document_number"),
  documentImageUrl: text("document_image_url"),
  selfieImageUrl: text("selfie_image_url"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  state: text("state"),
  city: text("city"),
  isPremium: boolean("is_premium").notNull().default(false),
  premiumUntil: timestamp("premium_until", { withTimezone: true }),
  portfolioPhotos: text("portfolio_photos").array().notNull().default([]),
  lat: real("lat"),
  lng: real("lng"),
  cohostId: integer("cohost_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("workers_user_id_idx").on(table.userId),
  index("workers_is_available_idx").on(table.isAvailable),
  index("workers_is_verified_idx").on(table.isVerified),
  index("workers_is_premium_idx").on(table.isPremium),
]);

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
