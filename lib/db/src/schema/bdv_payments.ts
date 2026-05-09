import { pgTable, text, serial, boolean, timestamp, real, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Notificaciones entrantes del BDV (webhook) ────────────────────────────────
// El banco hace POST a /api/payments/bdv/notify cada vez que entra un pago móvil.
// Guardamos todo para idempotencia y auditoría.
export const bdvPaymentNotificationsTable = pgTable(
  "bdv_payment_notifications",
  {
    id: serial("id").primaryKey(),
    // Referencia única del banco — usada para idempotencia
    referenciaBancoOrdenante: text("referencia_banco_ordenante").notNull().unique(),
    bancoOrdenante: text("banco_ordenante"),
    idCliente: text("id_cliente"),
    numeroCliente: text("numero_cliente"),
    idComercio: text("id_comercio"),
    numeroComercio: text("numero_comercio"),
    fecha: text("fecha"),
    hora: text("hora"),
    monto: real("monto").notNull(),
    // Estado de procesamiento interno
    status: text("status").notNull().default("received"),
    // Si se acreditó a un usuario
    creditedUserId: integer("credited_user_id").references(() => usersTable.id),
    creditedAmount: real("credited_amount"),
    // Payload raw para auditoría
    rawPayload: text("raw_payload").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (t) => [
    index("bdv_notif_fecha_idx").on(t.fecha),
    index("bdv_notif_status_idx").on(t.status),
    index("bdv_notif_cliente_idx").on(t.numeroCliente),
  ]
);

// ── Transacciones C2P salientes (nosotros cobramos al cliente) ─────────────────
export const bdvC2pTransactionsTable = pgTable(
  "bdv_c2p_transactions",
  {
    id: serial("id").primaryKey(),
    // Usuario que inició el cobro
    initiatedByUserId: integer("initiated_by_user_id").references(() => usersTable.id),
    // Referencia de vinculación (booking, suscripción, etc.)
    referenceType: text("reference_type"),
    referenceId: integer("reference_id"),
    // Datos del pagador
    customerDocumentId: text("customer_document_id").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerBankCode: text("customer_bank_code").notNull(),
    // Operación
    amount: real("amount").notNull(),
    concept: text("concept"),
    coinType: text("coin_type").notNull().default("VES"),
    // Resultado del banco
    status: text("status").notNull().default("pending"),
    bdvCode: text("bdv_code"),
    bdvMessage: text("bdv_message"),
    endToEndId: text("end_to_end_id"),
    referencia: text("referencia"),
    bdvDate: text("bdv_date"),
    // Anulación
    annulled: boolean("annulled").notNull().default(false),
    annulledAt: timestamp("annulled_at"),
    // Metadata para acciones de dominio (ej: { days: 30, planMonths: 3 })
    metadata: text("metadata"),
    // Resultado de la acción de dominio post-aprobación
    domainStatus: text("domain_status"),
    domainError: text("domain_error"),
    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("bdv_c2p_status_idx").on(t.status),
    index("bdv_c2p_ref_idx").on(t.referenceType, t.referenceId),
    index("bdv_c2p_e2e_idx").on(t.endToEndId),
  ]
);

export type BdvPaymentNotification = typeof bdvPaymentNotificationsTable.$inferSelect;
export type BdvC2pTransaction = typeof bdvC2pTransactionsTable.$inferSelect;
