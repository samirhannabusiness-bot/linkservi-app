import { pgTable, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Perfil del conductor ─────────────────────────────────────────────────────
// Datos del vehículo y estado de verificación. Una fila por usuario conductor.
// La fila se crea cuando el usuario completa el formulario tras activar el
// rol "driver". Sin esta fila, el panel de conductor está bloqueado.
//   vehicleType: "moto" | "carro" | "camioneta" | "grua"
//   status:      "pending_verification" | "approved" | "rejected"
export const driverProfilesTable = pgTable("driver_profiles", {
  userId:         integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  vehicleType:    text("vehicle_type").notNull(),
  // Subtipo opcional, hoy usado sólo para grúa: "plataforma" | "arrastre" | "otro".
  // Nullable para no romper filas existentes ni tipos de vehículo que no lo usan.
  vehicleSubtype: text("vehicle_subtype"),
  brand:          text("brand").notNull(),
  model:          text("model").notNull(),
  year:           integer("year").notNull(),
  color:          text("color").notNull(),
  plate:          text("plate").notNull(),
  photoUrl:       text("photo_url"),
  status:         text("status").notNull().default("pending_verification"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("driver_profiles_status_idx").on(t.status),
]);

export type DriverProfile = typeof driverProfilesTable.$inferSelect;
export type InsertDriverProfile = typeof driverProfilesTable.$inferInsert;
