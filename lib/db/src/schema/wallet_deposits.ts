import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// Recargas a LinkWallet (depósitos).
//
// Tres canales:
//   - "bdv":    Pago Móvil C2P automático. Se crea con status="approved" en
//               el mismo flujo de bdv-payments (applyDomainEffect("wallet_deposit")).
//               El crédito al wallet ocurre en la misma transacción.
//   - "binance": El usuario manda USDT BEP20/TRC20 a la wallet de LinkServi y
//               sube comprobante. status="pending" hasta que admin aprueba.
//   - "zelle":  El usuario envía Zelle al correo de LinkServi y sube comprobante.
//               status="pending" hasta que admin aprueba.
//
// El crédito real al balance del wallet se hace SOLO cuando status pasa a
// "approved" (BDV: en el mismo flow C2P; Binance/Zelle: cuando admin aprueba).
// ─────────────────────────────────────────────────────────────────────────────

export const walletDepositsTable = pgTable("wallet_deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // "bdv" | "binance" | "zelle"
  method: text("method").notNull(),
  // Monto que el usuario quiere recargar, en centavos USD.
  amountCents: integer("amount_cents").notNull(),
  // "pending" | "approved" | "rejected"
  status: text("status").notNull().default("pending"),
  // FK opcional a la transacción C2P de BDV (solo cuando method="bdv").
  bdvTransactionId: integer("bdv_transaction_id"),
  // URL del comprobante subido (solo binance/zelle).
  proofUrl: text("proof_url"),
  // Referencia externa que el usuario pega (txid Binance, confirm# Zelle, etc.).
  externalRef: text("external_ref"),
  // Notas del usuario al solicitar (opcional).
  userNotes: text("user_notes"),
  // Notas internas del admin al aprobar/rechazar.
  adminNotes: text("admin_notes"),
  // Quién y cuándo procesó la solicitud (NULL si pending).
  processedByUserId: integer("processed_by_user_id").references(() => usersTable.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("wallet_deposits_user_idx").on(table.userId, table.createdAt),
  index("wallet_deposits_status_idx").on(table.status, table.createdAt),
]);

export type WalletDeposit = typeof walletDepositsTable.$inferSelect;
