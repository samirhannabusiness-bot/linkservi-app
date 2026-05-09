import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userVerificationsTable = pgTable("user_verifications", {
  id:               serial("id").primaryKey(),
  userId:           integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role:             text("role").notNull(),           // "client" | "worker" | "cohost" | "seller"
  documentType:     text("document_type").default("cedula"),
  documentNumber:   text("document_number"),
  documentImageUrl: text("document_image_url"),
  selfieImageUrl:   text("selfie_image_url"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone:   text("emergency_phone"),
  // status: not_submitted | pending | approved | rejected
  status:           text("status").notNull().default("not_submitted"),
  notes:            text("notes"),                   // admin rejection notes
  reviewedAt:       timestamp("reviewed_at", { withTimezone: true }),
  reviewedById:     integer("reviewed_by_id"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_verif_status_idx").on(t.status),
  index("user_verif_user_id_idx").on(t.userId),
]);
