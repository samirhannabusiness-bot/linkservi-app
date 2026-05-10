import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// LinkWallet — billetera interna por usuario.
//
// Diseño:
// - Saldos en CENTAVOS USD (integer) para evitar errores de coma flotante.
// - balanceCents = dinero disponible para gastar/retirar.
// - holdCents    = dinero retenido en escrow (pagos de servicios pendientes
//                  de confirmar por el cliente).
// - El total visible al usuario es balanceCents + holdCents.
//
// IMPORTANTE: este módulo es ADITIVO — no toca users.balance, productos,
// reservas ni el flujo de pagos BDV existente. La integración con escrow
// del booking se hará en una segunda tanda, una vez probada la billetera
// básica.
// ─────────────────────────────────────────────────────────────────────────────

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  balanceCents: integer("balance_cents").notNull().default(0),
  holdCents: integer("hold_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  // PIN de billetera — bcrypt hash del PIN de 4 dígitos. NULL = sin configurar.
  // Se exige para autorizar transferencias y retiros.
  pinHash: text("pin_hash"),
  pinFailedAttempts: integer("pin_failed_attempts").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("wallets_user_id_uniq").on(table.userId),
]);

export type Wallet = typeof walletsTable.$inferSelect;

// Movimientos de billetera (libro contable inmutable).
// Cualquier cambio de saldo deja una fila aquí.
export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Tipos: deposit | withdrawal | hold | release | refund | commission | bonus | adjustment
  type: text("type").notNull(),
  // Positivo = entra al balance disponible. Negativo = sale.
  // En holds/releases el cambio puede ser sólo entre balance y hold;
  // en ese caso `amountCents` describe el monto movido (positivo) y
  // `direction` aclara la dirección.
  amountCents: integer("amount_cents").notNull(),
  // Saldos resultantes tras aplicar la transacción (snapshot).
  balanceAfterCents: integer("balance_after_cents").notNull(),
  holdAfterCents: integer("hold_after_cents").notNull(),
  // Referencia opcional a la entidad que originó el movimiento.
  // Ej: refType="booking", refId=123  |  refType="bdv_payment", refId=456
  refType: text("ref_type"),
  refId: integer("ref_id"),
  description: text("description"),
  // Estado: posted | pending | reversed
  status: text("status").notNull().default("posted"),
  // Clave de idempotencia (opcional). Para transferencias entre usuarios
  // viene del header Idempotency-Key del cliente. Índice parcial UNIQUE
  // sobre (user_id, idempotency_key) cuando NOT NULL — ver migración 0003.
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wallet_tx_user_idx").on(table.userId, table.createdAt),
  index("wallet_tx_ref_idx").on(table.refType, table.refId),
]);

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

// Retenciones (escrow) por reserva o pedido.
// Un hold se crea cuando el cliente paga un servicio: el dinero sale de su
// balance y entra a su hold. Cuando se libera, sale del hold del cliente,
// se descuenta la comisión LinkServi, y el resto entra al balance del trabajador.
export const escrowHoldsTable = pgTable("escrow_holds", {
  id: serial("id").primaryKey(),
  payerUserId: integer("payer_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  payeeUserId: integer("payee_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  commissionCents: integer("commission_cents").notNull().default(0),
  // Estado: held | released | refunded | disputed
  status: text("status").notNull().default("held"),
  // Referencia a la entidad que originó el hold (ej. booking)
  refType: text("ref_type").notNull(),
  refId: integer("ref_id").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, (table) => [
  index("escrow_holds_payer_idx").on(table.payerUserId),
  index("escrow_holds_payee_idx").on(table.payeeUserId),
  index("escrow_holds_status_idx").on(table.status),
  uniqueIndex("escrow_holds_ref_uniq").on(table.refType, table.refId),
]);

export type EscrowHold = typeof escrowHoldsTable.$inferSelect;
