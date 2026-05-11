import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// Retiros desde LinkWallet hacia métodos externos (Pago Móvil por ahora).
//
// Diseño:
// - Cuando el usuario solicita un retiro: se debita el monto bruto (neto + fee)
//   de su `wallets.balance_cents` y se crea una fila aquí con status="pending".
// - Admin ve la cola en /admin/wallet/withdrawals con los datos bancarios y
//   marca "completado" cuando hizo la transferencia manual desde la cuenta
//   operativa de LinkServi → status="completed".
// - Si el admin rechaza → status="rejected" y se devuelve el monto bruto al
//   balance del usuario (refund).
//
// Toda la auditoría de saldo queda además en `wallet_transactions` con
// refType="wallet_withdrawal" + refId=esta fila.
// ─────────────────────────────────────────────────────────────────────────────

export const walletWithdrawalsTable = pgTable("wallet_withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),

  // Montos en centavos USD. amount_cents = lo que el usuario recibe (neto).
  // fee_cents = comisión LinkServi. gross_cents = lo debitado del balance.
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull().default(0),
  grossCents: integer("gross_cents").notNull(),

  // Por ahora solo "pago_movil". Dejamos el campo abierto para zelle/binance
  // cuando se agreguen cuentas operativas.
  method: text("method").notNull().default("pago_movil"),

  // Datos bancarios del destino (estructura varía por método).
  // Para pago_movil: { banco, telefono, cedula, titular }
  destinationData: jsonb("destination_data").notNull(),

  // pending → completed | rejected
  status: text("status").notNull().default("pending"),

  // Notas del usuario (opcional, mostradas al admin) y del admin (mostradas
  // al usuario al notificarle).
  userNotes: text("user_notes"),
  adminNotes: text("admin_notes"),

  // Quién procesó el retiro (admin) y cuándo.
  processedById: integer("processed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  processedAt: timestamp("processed_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("wallet_withdrawals_user_idx").on(table.userId, table.createdAt),
  index("wallet_withdrawals_status_idx").on(table.status, table.createdAt),
]);

export type WalletWithdrawal = typeof walletWithdrawalsTable.$inferSelect;
