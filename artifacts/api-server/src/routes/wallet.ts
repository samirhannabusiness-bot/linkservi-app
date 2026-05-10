import { Router } from "express";
import {
  db,
  walletsTable,
  walletTransactionsTable,
  escrowHoldsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, or, gte, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authenticate, comparePassword } from "../lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// LinkWallet — endpoints
//
// Lectura:
//   GET  /api/wallet/me                 — saldo + holds + últimos movimientos
//   GET  /api/wallet/transactions       — historial paginado
//
// PIN (4 dígitos, bcrypt-hashed, requerido para mover dinero):
//   GET  /api/wallet/pin/status         — ¿tiene PIN? ¿está bloqueado?
//   POST /api/wallet/pin/set            — crea/actualiza el PIN (exige password)
//
// Transferencia entre usuarios por correo (atómica):
//   POST /api/wallet/transfer/preview   — busca destinatario por email
//   POST /api/wallet/transfer           — ejecuta la transferencia
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ── Configuración ───────────────────────────────────────────────────────────
const DAILY_TRANSFER_LIMIT_CENTS = 50_000; // $500 USD/día por usuario
const MAX_PIN_ATTEMPTS           = 3;
const PIN_LOCK_MINUTES           = 15;
const MIN_TRANSFER_CENTS         = 10;     // $0.10 mínimo
const MAX_TRANSFER_CENTS         = 50_000; // $500 máximo por operación

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Crea la fila de billetera del usuario si no existe (idempotente). */
async function ensureWallet(userId: number) {
  const existing = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  await db
    .insert(walletsTable)
    .values({ userId, balanceCents: 0, holdCents: 0, currency: "USD" })
    .onConflictDoNothing({ target: walletsTable.userId });
  const [row] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);
  return row!;
}

/** Suma de transferencias salientes en las últimas 24h (en centavos). */
async function dailyTransferredCents(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(ABS(${walletTransactionsTable.amountCents})), 0)::int`,
    })
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.userId, userId),
      eq(walletTransactionsTable.type, "transfer_out"),
      gte(walletTransactionsTable.createdAt, since),
    ));
  return row?.total ?? 0;
}

// ── GET /api/wallet/me ──────────────────────────────────────────────────────
router.get("/wallet/me", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const wallet = await ensureWallet(userId);

    const [recentTx, activeHolds] = await Promise.all([
      db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, userId))
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(10),
      db
        .select()
        .from(escrowHoldsTable)
        .where(and(
          or(
            eq(escrowHoldsTable.payerUserId, userId),
            eq(escrowHoldsTable.payeeUserId, userId),
          ),
          eq(escrowHoldsTable.status, "held"),
        ))
        .orderBy(desc(escrowHoldsTable.createdAt))
        .limit(20),
    ]);

    res.json({
      wallet: {
        balanceCents: wallet.balanceCents,
        holdCents: wallet.holdCents,
        totalCents: wallet.balanceCents + wallet.holdCents,
        currency: wallet.currency,
        updatedAt: wallet.updatedAt,
        hasPin: !!wallet.pinHash,
      },
      recentTransactions: recentTx,
      activeHolds: activeHolds.map((h: typeof escrowHoldsTable.$inferSelect) => ({
        ...h,
        role: h.payerUserId === userId ? "payer" : "payee",
      })),
    });
  } catch (err) {
    console.error("[wallet/me] error", err);
    res.status(500).json({ error: "No se pudo cargar la billetera" });
  }
});

// ── GET /api/wallet/transactions ────────────────────────────────────────────
router.get("/wallet/transactions", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    await ensureWallet(userId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit);
    res.json({ transactions: rows });
  } catch (err) {
    console.error("[wallet/transactions] error", err);
    res.status(500).json({ error: "No se pudieron cargar los movimientos" });
  }
});

// ── GET /api/wallet/pin/status ──────────────────────────────────────────────
router.get("/wallet/pin/status", authenticate, async (req, res): Promise<void> => {
  try {
    const wallet = await ensureWallet(req.user!.id);
    const lockedUntil = wallet.pinLockedUntil ? new Date(wallet.pinLockedUntil) : null;
    const isLocked = !!lockedUntil && lockedUntil > new Date();
    res.json({
      hasPin: !!wallet.pinHash,
      isLocked,
      lockedUntil: isLocked ? lockedUntil!.toISOString() : null,
      failedAttempts: wallet.pinFailedAttempts,
    });
  } catch (err) {
    console.error("[wallet/pin/status] error", err);
    res.status(500).json({ error: "No se pudo consultar el estado del PIN" });
  }
});

// ── POST /api/wallet/pin/set ────────────────────────────────────────────────
// Para crear o cambiar el PIN, exigimos la contraseña de la cuenta. Esto
// evita que alguien con sesión robada en un café internet le cambie el PIN
// y vacíe la billetera.
router.post("/wallet/pin/set", authenticate, async (req, res): Promise<void> => {
  try {
    const { password, pin } = req.body ?? {};
    if (typeof password !== "string" || !password) {
      res.status(400).json({ error: "Contraseña de la cuenta requerida" });
      return;
    }
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: "El PIN debe ser de exactamente 4 dígitos" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) { res.status(401).json({ error: "Contraseña incorrecta" }); return; }

    const pinHash = await bcrypt.hash(pin, 10);
    await ensureWallet(req.user!.id);
    await db
      .update(walletsTable)
      .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null })
      .where(eq(walletsTable.userId, req.user!.id));

    res.json({ ok: true });
  } catch (err) {
    console.error("[wallet/pin/set] error", err);
    res.status(500).json({ error: "No se pudo guardar el PIN" });
  }
});

// ── POST /api/wallet/transfer/preview ───────────────────────────────────────
// Busca al destinatario por correo y devuelve su nombre para confirmar antes
// de mover dinero. NO mueve nada. Si el correo no existe, error claro.
router.post("/wallet/transfer/preview", authenticate, async (req, res): Promise<void> => {
  try {
    const { email, amountCents } = req.body ?? {};
    if (typeof email !== "string" || !email.trim()) {
      res.status(400).json({ error: "Correo del destinatario requerido" });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const amount = Number.isInteger(amountCents) ? amountCents : 0;
    if (amount < MIN_TRANSFER_CENTS) {
      res.status(400).json({ error: `Monto mínimo $${(MIN_TRANSFER_CENTS / 100).toFixed(2)}` });
      return;
    }
    if (amount > MAX_TRANSFER_CENTS) {
      res.status(400).json({ error: `Monto máximo $${(MAX_TRANSFER_CENTS / 100).toFixed(2)} por operación` });
      return;
    }

    const [recipient] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(sql`LOWER(${usersTable.email})`, cleanEmail));
    if (!recipient) {
      res.status(404).json({ error: "No encontramos a nadie en LinkServi con ese correo" });
      return;
    }
    if (recipient.id === req.user!.id) {
      res.status(400).json({ error: "No puedes transferirte a ti mismo" });
      return;
    }

    const senderWallet = await ensureWallet(req.user!.id);
    if (senderWallet.balanceCents < amount) {
      res.status(400).json({
        error: `Saldo insuficiente. Tienes $${(senderWallet.balanceCents / 100).toFixed(2)} disponibles.`,
      });
      return;
    }
    const dailyUsed = await dailyTransferredCents(req.user!.id);
    if (dailyUsed + amount > DAILY_TRANSFER_LIMIT_CENTS) {
      const remaining = Math.max(0, DAILY_TRANSFER_LIMIT_CENTS - dailyUsed);
      res.status(400).json({
        error: `Límite diario excedido. Disponible hoy: $${(remaining / 100).toFixed(2)} de $${(DAILY_TRANSFER_LIMIT_CENTS / 100).toFixed(2)}.`,
      });
      return;
    }

    res.json({
      recipient: { name: recipient.name, email: recipient.email },
      amountCents: amount,
      feeCents: 0,
      totalCents: amount,
      requiresPin: !!senderWallet.pinHash,
      needsPinSetup: !senderWallet.pinHash,
    });
  } catch (err) {
    console.error("[wallet/transfer/preview] error", err);
    res.status(500).json({ error: "No se pudo verificar el destinatario" });
  }
});

// ── POST /api/wallet/transfer ───────────────────────────────────────────────
// Transferencia atómica entre dos billeteras dentro de UNA sola transacción
// SQL. Pasos clave para evitar race conditions y dinero duplicado:
//
//  1. Bloquear ambas filas con SELECT … FOR UPDATE en orden determinístico
//     (menor userId primero) — previene deadlocks si dos personas se
//     transfieren mutuamente al mismo tiempo.
//  2. Re-validar saldo dentro de la transacción (el balance del paso 1 puede
//     haber cambiado entre el preview y este POST).
//  3. UPDATE balance del emisor (resta) y del receptor (suma).
//  4. INSERT 2 filas en wallet_transactions (una por lado) con el snapshot
//     de saldos resultantes para auditoría.
//
// Si cualquier paso falla, la transacción hace ROLLBACK automático y nada
// queda a medias.
router.post("/wallet/transfer", authenticate, async (req, res): Promise<void> => {
  try {
    const { email, amountCents, pin, description } = req.body ?? {};
    const userId = req.user!.id;

    // ── Validaciones de entrada ────────────────────────────────────────────
    if (typeof email !== "string" || !email.trim()) {
      res.status(400).json({ error: "Correo del destinatario requerido" }); return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const amount = Number.isInteger(amountCents) ? amountCents : 0;
    if (amount < MIN_TRANSFER_CENTS) {
      res.status(400).json({ error: `Monto mínimo $${(MIN_TRANSFER_CENTS / 100).toFixed(2)}` }); return;
    }
    if (amount > MAX_TRANSFER_CENTS) {
      res.status(400).json({ error: `Monto máximo $${(MAX_TRANSFER_CENTS / 100).toFixed(2)} por operación` }); return;
    }
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: "PIN de 4 dígitos requerido" }); return;
    }

    // ── Validar PIN del emisor (fuera de la transacción para no mantener
    //    locks durante el bcrypt, que es lento) ───────────────────────────
    const senderWallet = await ensureWallet(userId);
    if (!senderWallet.pinHash) {
      res.status(400).json({ error: "Debes configurar tu PIN antes de transferir" }); return;
    }
    if (senderWallet.pinLockedUntil && new Date(senderWallet.pinLockedUntil) > new Date()) {
      res.status(423).json({
        error: `PIN bloqueado por ${PIN_LOCK_MINUTES} minutos por intentos fallidos. Intenta más tarde.`,
      });
      return;
    }
    const pinOk = await bcrypt.compare(pin, senderWallet.pinHash);
    if (!pinOk) {
      const newAttempts = (senderWallet.pinFailedAttempts ?? 0) + 1;
      const shouldLock  = newAttempts >= MAX_PIN_ATTEMPTS;
      await db
        .update(walletsTable)
        .set({
          pinFailedAttempts: shouldLock ? 0 : newAttempts,
          pinLockedUntil:    shouldLock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) : senderWallet.pinLockedUntil,
        })
        .where(eq(walletsTable.userId, userId));
      res.status(401).json({
        error: shouldLock
          ? `PIN incorrecto. Bloqueado por ${PIN_LOCK_MINUTES} minutos.`
          : `PIN incorrecto. Te quedan ${MAX_PIN_ATTEMPTS - newAttempts} intentos.`,
      });
      return;
    }

    // ── Buscar al destinatario ─────────────────────────────────────────────
    const [recipient] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(sql`LOWER(${usersTable.email})`, cleanEmail));
    if (!recipient) {
      res.status(404).json({ error: "No encontramos a nadie en LinkServi con ese correo" }); return;
    }
    if (recipient.id === userId) {
      res.status(400).json({ error: "No puedes transferirte a ti mismo" }); return;
    }
    await ensureWallet(recipient.id);

    // ── Verificar límite diario ────────────────────────────────────────────
    const dailyUsed = await dailyTransferredCents(userId);
    if (dailyUsed + amount > DAILY_TRANSFER_LIMIT_CENTS) {
      const remaining = Math.max(0, DAILY_TRANSFER_LIMIT_CENTS - dailyUsed);
      res.status(400).json({
        error: `Límite diario excedido. Disponible hoy: $${(remaining / 100).toFixed(2)}.`,
      });
      return;
    }

    // ── Sanear descripción (opcional) ──────────────────────────────────────
    const note = typeof description === "string"
      ? description.trim().slice(0, 140)
      : null;

    // ── TRANSACCIÓN ATÓMICA ────────────────────────────────────────────────
    let result: { senderBalance: number; recipientName: string };
    try {
      result = await db.transaction(async (tx) => {
        // Bloquear filas en orden determinístico (menor userId primero) para
        // evitar deadlocks en transferencias cruzadas concurrentes.
        const [first, second] = userId < recipient.id
          ? [userId, recipient.id]
          : [recipient.id, userId];

        const lockedRows = await tx.execute(sql`
          SELECT user_id, balance_cents, hold_cents, pin_failed_attempts
          FROM wallets
          WHERE user_id IN (${first}, ${second})
          ORDER BY user_id ASC
          FOR UPDATE
        `);
        const rows = (lockedRows.rows ?? lockedRows) as Array<{
          user_id: number; balance_cents: number; hold_cents: number;
        }>;
        const senderRow    = rows.find((r) => r.user_id === userId);
        const recipientRow = rows.find((r) => r.user_id === recipient.id);
        if (!senderRow || !recipientRow) {
          throw new Error("Billetera no encontrada");
        }

        // Re-validar saldo dentro del lock
        if (senderRow.balance_cents < amount) {
          throw new Error("INSUFFICIENT_FUNDS");
        }

        const newSenderBalance    = senderRow.balance_cents - amount;
        const newRecipientBalance = recipientRow.balance_cents + amount;

        // Update saldos
        await tx
          .update(walletsTable)
          .set({ balanceCents: newSenderBalance, pinFailedAttempts: 0, pinLockedUntil: null })
          .where(eq(walletsTable.userId, userId));
        await tx
          .update(walletsTable)
          .set({ balanceCents: newRecipientBalance })
          .where(eq(walletsTable.userId, recipient.id));

        // Insertar las 2 filas del libro contable
        await tx.insert(walletTransactionsTable).values([
          {
            userId,
            type: "transfer_out",
            amountCents: -amount,
            balanceAfterCents: newSenderBalance,
            holdAfterCents: senderRow.hold_cents,
            refType: "user_transfer",
            refId: recipient.id,
            description: note ?? `Transferencia a ${recipient.name}`,
            status: "posted",
          },
          {
            userId: recipient.id,
            type: "transfer_in",
            amountCents: amount,
            balanceAfterCents: newRecipientBalance,
            holdAfterCents: recipientRow.hold_cents,
            refType: "user_transfer",
            refId: userId,
            description: note ?? `Transferencia recibida`,
            status: "posted",
          },
        ]);

        return { senderBalance: newSenderBalance, recipientName: recipient.name };
      });
    } catch (e: any) {
      if (e?.message === "INSUFFICIENT_FUNDS") {
        res.status(400).json({ error: "Saldo insuficiente al momento de confirmar" });
        return;
      }
      throw e;
    }

    res.json({
      ok: true,
      newBalanceCents: result.senderBalance,
      recipient: { name: result.recipientName },
      amountCents: amount,
    });
  } catch (err) {
    console.error("[wallet/transfer] error", err);
    res.status(500).json({ error: "No se pudo completar la transferencia" });
  }
});

export default router;
