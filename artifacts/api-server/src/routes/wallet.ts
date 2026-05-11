import { Router } from "express";
import {
  db,
  walletsTable,
  walletTransactionsTable,
  walletDepositsTable,
  escrowHoldsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, or, gte, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authenticate, comparePassword } from "../lib/auth";
import { createNotification } from "./notifications";

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

// Recargas Binance/Zelle (manual con aprobación admin).
const MIN_MANUAL_DEPOSIT_CENTS = 500;     // $5.00 mínimo
const MAX_DEPOSIT_CENTS        = 50_000;  // $500 máximo por operación
const DAILY_DEPOSIT_LIMIT_CENTS = 200_000; // $2,000 USD/día por usuario

// Datos de cobro de LinkServi para los métodos manuales. En producción
// se moverán a env vars; aquí los exponemos via /wallet/deposit/info para
// que el frontend los muestre al usuario al iniciar la recarga.
const LINKSERVI_BINANCE_PAY_ID = process.env.LINKSERVI_BINANCE_PAY_ID || "Próximamente";
const LINKSERVI_BINANCE_USDT_TRC20 = process.env.LINKSERVI_BINANCE_USDT_TRC20 || "Próximamente";
const LINKSERVI_ZELLE_EMAIL = process.env.LINKSERVI_ZELLE_EMAIL || "Próximamente";
const LINKSERVI_ZELLE_NAME = process.env.LINKSERVI_ZELLE_NAME || "LinkServi";

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

/** Suma de transferencias salientes en las últimas 24h (en centavos).
 *  Acepta opcionalmente un cliente de transacción para que el cálculo
 *  ocurra dentro del mismo lock que el resto de la transferencia. */
async function dailyTransferredCents(
  userId: number,
  client: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await client
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
    const [user] = await db
      .select({ provider: usersTable.provider })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    const lockedUntil = wallet.pinLockedUntil ? new Date(wallet.pinLockedUntil) : null;
    const isLocked = !!lockedUntil && lockedUntil > new Date();
    res.json({
      hasPin: !!wallet.pinHash,
      isLocked,
      lockedUntil: isLocked ? lockedUntil!.toISOString() : null,
      failedAttempts: wallet.pinFailedAttempts,
      // Para que el frontend sepa si debe pedir contraseña al configurar el PIN.
      // Usuarios OAuth (Google) no tienen contraseña real.
      isOAuthUser: !!user && user.provider !== "email",
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
//
// Excepción: usuarios que entraron con Google (u otro proveedor OAuth) NO
// tienen contraseña — al registrarse les guardamos un placeholderHash
// aleatorio que nadie conoce nunca. Para ellos saltamos la verificación de
// password (su identidad ya está probada por la sesión OAuth activa) y
// permitimos crear el PIN solo con la sesión.
router.post("/wallet/pin/set", authenticate, async (req, res): Promise<void> => {
  try {
    const { password, pin } = req.body ?? {};
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: "El PIN debe ser de exactamente 4 dígitos" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

    const isOAuthUser = user.provider !== "email";

    if (!isOAuthUser) {
      // Usuario clásico email+contraseña: exigir contraseña real.
      if (typeof password !== "string" || !password) {
        res.status(400).json({ error: "Contraseña de la cuenta requerida" });
        return;
      }
      const ok = await comparePassword(password, user.passwordHash);
      if (!ok) { res.status(401).json({ error: "Contraseña incorrecta" }); return; }
    }
    // Usuario OAuth (Google, etc.): la sesión ya prueba su identidad — no
    // tiene una contraseña que nosotros podamos verificar.

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

    // Idempotencia: si el cliente ya envió esta misma operación con la
    // misma clave (doble-click, reintento por timeout), devolvemos el
    // resultado anterior en vez de duplicar el cargo.
    const idemHeader = req.header("Idempotency-Key") ?? req.header("idempotency-key");
    const idemKey = typeof idemHeader === "string" && idemHeader.trim().length > 0 && idemHeader.length <= 200
      ? idemHeader.trim()
      : null;
    if (idemKey) {
      const [prev] = await db
        .select()
        .from(walletTransactionsTable)
        .where(and(
          eq(walletTransactionsTable.userId, userId),
          eq(walletTransactionsTable.idempotencyKey, idemKey),
        ))
        .limit(1);
      if (prev) {
        res.json({
          ok: true,
          newBalanceCents: prev.balanceAfterCents,
          amountCents: Math.abs(prev.amountCents),
          replayed: true,
        });
        return;
      }
    }

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
      // UPDATE atómico: incrementa contador y, si alcanza el máximo, lo
      // resetea + setea pin_locked_until. Sin lectura previa → sin "lost
      // update" entre intentos concurrentes.
      const lockMs = PIN_LOCK_MINUTES * 60_000;
      const result = await db.execute(sql`
        UPDATE wallets
        SET
          pin_failed_attempts = CASE
            WHEN pin_failed_attempts + 1 >= ${MAX_PIN_ATTEMPTS} THEN 0
            ELSE pin_failed_attempts + 1
          END,
          pin_locked_until = CASE
            WHEN pin_failed_attempts + 1 >= ${MAX_PIN_ATTEMPTS}
              THEN NOW() + (${lockMs} || ' milliseconds')::interval
            ELSE pin_locked_until
          END
        WHERE user_id = ${userId}
        RETURNING pin_locked_until, pin_failed_attempts
      `);
      const rows = (result.rows ?? result) as Array<{
        pin_locked_until: string | null; pin_failed_attempts: number;
      }>;
      const row = rows[0];
      const isLocked = !!row?.pin_locked_until && new Date(row.pin_locked_until) > new Date();
      res.status(401).json({
        error: isLocked
          ? `PIN incorrecto. Bloqueado por ${PIN_LOCK_MINUTES} minutos.`
          : `PIN incorrecto. Te quedan ${MAX_PIN_ATTEMPTS - (row?.pin_failed_attempts ?? 1)} intentos.`,
      });
      return;
    }
    // PIN correcto: reset inmediato del contador (independiente del éxito
    // de la transferencia) para que un usuario válido nunca quede bloqueado.
    if ((senderWallet.pinFailedAttempts ?? 0) > 0 || senderWallet.pinLockedUntil) {
      await db
        .update(walletsTable)
        .set({ pinFailedAttempts: 0, pinLockedUntil: null })
        .where(eq(walletsTable.userId, userId));
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
          SELECT user_id, balance_cents, hold_cents
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

        // Re-validar límite diario DENTRO del lock para que dos requests
        // simultáneos no puedan ambos pasar el chequeo y exceder el tope.
        const dailyUsed = await dailyTransferredCents(userId, tx);
        if (dailyUsed + amount > DAILY_TRANSFER_LIMIT_CENTS) {
          throw new Error("DAILY_LIMIT_EXCEEDED");
        }

        const newSenderBalance    = senderRow.balance_cents - amount;
        const newRecipientBalance = recipientRow.balance_cents + amount;

        // Update saldos
        await tx
          .update(walletsTable)
          .set({ balanceCents: newSenderBalance })
          .where(eq(walletsTable.userId, userId));
        await tx
          .update(walletsTable)
          .set({ balanceCents: newRecipientBalance })
          .where(eq(walletsTable.userId, recipient.id));

        // Insertar las 2 filas del libro contable. La fila del emisor lleva
        // la idempotencyKey: si llega un retry con la misma key, el índice
        // único parcial (user_id, idempotency_key) hará fallar este INSERT
        // con error 23505 → atrapamos abajo y devolvemos resultado previo.
        try {
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
              idempotencyKey: idemKey,
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
              idempotencyKey: null,
            },
          ]);
        } catch (e: any) {
          if (e?.code === "23505") throw new Error("IDEMPOTENT_REPLAY");
          throw e;
        }

        return { senderBalance: newSenderBalance, recipientName: recipient.name };
      });
    } catch (e: any) {
      if (e?.message === "INSUFFICIENT_FUNDS") {
        res.status(400).json({ error: "Saldo insuficiente al momento de confirmar" });
        return;
      }
      if (e?.message === "DAILY_LIMIT_EXCEEDED") {
        res.status(400).json({
          error: `Límite diario de $${(DAILY_TRANSFER_LIMIT_CENTS / 100).toFixed(2)} excedido.`,
        });
        return;
      }
      if (e?.message === "IDEMPOTENT_REPLAY" && idemKey) {
        // Carrera con un retry simultáneo — devolvemos el resultado ya posteado.
        const [prev] = await db
          .select()
          .from(walletTransactionsTable)
          .where(and(
            eq(walletTransactionsTable.userId, userId),
            eq(walletTransactionsTable.idempotencyKey, idemKey),
          ))
          .limit(1);
        if (prev) {
          res.json({
            ok: true,
            newBalanceCents: prev.balanceAfterCents,
            amountCents: Math.abs(prev.amountCents),
            replayed: true,
          });
          return;
        }
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

// ─────────────────────────────────────────────────────────────────────────────
// RECARGAS — depósitos a la billetera
//
// Tres canales:
//   - BDV (automático):  flow C2P existente con referenceType="wallet_deposit".
//                        El crédito al wallet ocurre en applyDomainEffect.
//   - Binance/Zelle (manual): el usuario sube comprobante; admin aprueba.
//
// Endpoints:
//   GET  /wallet/deposit/info                     — datos de cobro de LinkServi
//   POST /wallet/deposit/manual                   — abre solicitud pending (binance/zelle)
//   GET  /wallet/deposits                         — historial del usuario
//   GET  /admin/wallet/deposits                   — admin: lista todas
//   POST /admin/wallet/deposits/:id/approve       — admin: acredita al wallet
//   POST /admin/wallet/deposits/:id/reject        — admin: rechaza con nota
// ─────────────────────────────────────────────────────────────────────────────

/** Suma de recargas pendientes/aprobadas en últimas 24h del usuario. */
async function dailyDepositedCents(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${walletDepositsTable.amountCents}), 0)::int` })
    .from(walletDepositsTable)
    .where(and(
      eq(walletDepositsTable.userId, userId),
      gte(walletDepositsTable.createdAt, since),
      or(
        eq(walletDepositsTable.status, "pending"),
        eq(walletDepositsTable.status, "approved"),
      ),
    ));
  return row?.total ?? 0;
}

// ── GET /api/wallet/deposit/info ────────────────────────────────────────────
router.get("/wallet/deposit/info", authenticate, async (_req, res): Promise<void> => {
  res.json({
    minUsd: 1,
    maxUsd: 500,
    minManualUsd: MIN_MANUAL_DEPOSIT_CENTS / 100,
    dailyLimitUsd: DAILY_DEPOSIT_LIMIT_CENTS / 100,
    methods: {
      bdv: {
        label: "Pago Móvil BDV",
        description: "Recarga inmediata desde tu cuenta del Banco de Venezuela. El monto se acredita automáticamente.",
        feePct: 0,
      },
      binance: {
        label: "Binance",
        description: "Envía USDT a la wallet de LinkServi y sube el comprobante. Acreditamos en menos de 1 hora hábil.",
        feePct: 0,
        payId: LINKSERVI_BINANCE_PAY_ID,
        usdtTrc20: LINKSERVI_BINANCE_USDT_TRC20,
        network: "TRC20 (Tron) — sin comisión",
      },
      zelle: {
        label: "Zelle",
        description: "Envía Zelle al correo de LinkServi y sube el comprobante. Acreditamos en menos de 1 hora hábil.",
        feePct: 0,
        email: LINKSERVI_ZELLE_EMAIL,
        beneficiary: LINKSERVI_ZELLE_NAME,
      },
    },
  });
});

// ── POST /api/wallet/deposit/manual ────────────────────────────────────────
// Abre una solicitud de recarga pendiente. NO acredita saldo todavía —
// el admin debe aprobar después de verificar el comprobante.
router.post("/wallet/deposit/manual", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { method, amountCents, proofUrl, externalRef, userNotes } = req.body ?? {};

    if (method !== "binance" && method !== "zelle") {
      res.status(400).json({ error: "Método inválido. Usa binance o zelle." });
      return;
    }
    const amount = Number.isInteger(amountCents) ? amountCents : 0;
    if (amount < MIN_MANUAL_DEPOSIT_CENTS) {
      res.status(400).json({ error: `Monto mínimo $${(MIN_MANUAL_DEPOSIT_CENTS / 100).toFixed(2)}` });
      return;
    }
    if (amount > MAX_DEPOSIT_CENTS) {
      res.status(400).json({ error: `Monto máximo $${(MAX_DEPOSIT_CENTS / 100).toFixed(2)} por operación` });
      return;
    }
    if (typeof proofUrl !== "string" || !proofUrl.trim()) {
      res.status(400).json({ error: "Sube el comprobante de pago para continuar" });
      return;
    }
    // Anti race-condition: serializamos check-de-límite + insert dentro de
    // una transacción que toma SELECT FOR UPDATE sobre la fila del wallet.
    // Como cada usuario tiene exactamente una fila en `wallets`, dos POSTs
    // concurrentes del mismo usuario quedan en cola — el segundo recalcula
    // dailyDepositedCents después del commit del primero.
    await ensureWallet(userId);
    let dep;
    try {
      dep = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1 FROM wallets WHERE user_id = ${userId} FOR UPDATE`);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [{ total: dailyUsed }] = await tx
          .select({ total: sql<number>`COALESCE(SUM(${walletDepositsTable.amountCents}), 0)::int` })
          .from(walletDepositsTable)
          .where(and(
            eq(walletDepositsTable.userId, userId),
            gte(walletDepositsTable.createdAt, since),
            or(
              eq(walletDepositsTable.status, "pending"),
              eq(walletDepositsTable.status, "approved"),
            ),
          ));
        if ((dailyUsed ?? 0) + amount > DAILY_DEPOSIT_LIMIT_CENTS) {
          const remaining = Math.max(0, DAILY_DEPOSIT_LIMIT_CENTS - (dailyUsed ?? 0));
          throw Object.assign(new Error(
            `Límite diario excedido. Disponible hoy: $${(remaining / 100).toFixed(2)} de $${(DAILY_DEPOSIT_LIMIT_CENTS / 100).toFixed(2)}.`
          ), { code: "DAILY_LIMIT" });
        }
        const [row] = await tx.insert(walletDepositsTable).values({
          userId,
          method,
          amountCents: amount,
          status: "pending",
          proofUrl: proofUrl.trim().slice(0, 1000),
          externalRef: typeof externalRef === "string" ? externalRef.trim().slice(0, 200) : null,
          userNotes: typeof userNotes === "string" ? userNotes.trim().slice(0, 500) : null,
        }).returning();
        return row;
      });
    } catch (e: any) {
      if (e?.code === "DAILY_LIMIT") {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }

    res.json({
      ok: true,
      deposit: {
        id: dep.id,
        method: dep.method,
        amountCents: dep.amountCents,
        status: dep.status,
        createdAt: dep.createdAt,
      },
      message: "Recarga registrada. Te avisaremos cuando se acredite (menos de 1 hora hábil).",
    });
  } catch (err) {
    console.error("[wallet/deposit/manual] error", err);
    res.status(500).json({ error: "No se pudo registrar la recarga" });
  }
});

// ── GET /api/wallet/deposits ────────────────────────────────────────────────
router.get("/wallet/deposits", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const rows = await db
      .select()
      .from(walletDepositsTable)
      .where(eq(walletDepositsTable.userId, userId))
      .orderBy(desc(walletDepositsTable.createdAt))
      .limit(limit);
    res.json({ deposits: rows });
  } catch (err) {
    console.error("[wallet/deposits] error", err);
    res.status(500).json({ error: "No se pudieron cargar las recargas" });
  }
});

// ── GET /api/admin/wallet/deposits ──────────────────────────────────────────
router.get("/admin/wallet/deposits", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }
  try {
    const rows = await db
      .select({
        deposit: walletDepositsTable,
        user: { id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone },
      })
      .from(walletDepositsTable)
      .innerJoin(usersTable, eq(walletDepositsTable.userId, usersTable.id))
      .orderBy(desc(walletDepositsTable.createdAt))
      .limit(500);
    res.json(rows.map(({ deposit, user }) => ({
      ...deposit,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone,
    })));
  } catch (err) {
    console.error("[admin/wallet/deposits] error", err);
    res.status(500).json({ error: "No se pudieron cargar las recargas" });
  }
});

// ── POST /api/admin/wallet/deposits/:id/approve ─────────────────────────────
// Acredita el monto al wallet del usuario y registra la transacción
// contable. Atómico: si falla algo, todo se revierte.
router.post("/admin/wallet/deposits/:id/approve", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const adminId = req.user!.id;
    const adminNotes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 500) : null;

    const [dep] = await db.select().from(walletDepositsTable).where(eq(walletDepositsTable.id, id)).limit(1);
    if (!dep) { res.status(404).json({ error: "Recarga no encontrada" }); return; }
    if (dep.status !== "pending") {
      res.status(409).json({ error: `Esta recarga ya está ${dep.status === "approved" ? "aprobada" : "rechazada"}` });
      return;
    }
    if (dep.method === "bdv") {
      res.status(400).json({ error: "Las recargas BDV se acreditan automáticamente, no requieren aprobación" });
      return;
    }

    // Transacción atómica: actualiza deposit, suma balance, inserta tx contable.
    const result = await db.transaction(async (tx) => {
      // Re-lock + re-check del status para evitar doble aprobación concurrente.
      const lockedDep = await tx.execute(sql`
        SELECT id, status, amount_cents, user_id
        FROM wallet_deposits
        WHERE id = ${id}
        FOR UPDATE
      `);
      const depRows = (lockedDep.rows ?? lockedDep) as Array<{
        id: number; status: string; amount_cents: number; user_id: number;
      }>;
      if (!depRows[0] || depRows[0].status !== "pending") {
        throw new Error("ALREADY_PROCESSED");
      }

      // Asegurar wallet + lock.
      await tx
        .insert(walletsTable)
        .values({ userId: dep.userId, balanceCents: 0, holdCents: 0, currency: "USD" })
        .onConflictDoNothing({ target: walletsTable.userId });
      const lockedW = await tx.execute(sql`
        SELECT user_id, balance_cents, hold_cents
        FROM wallets WHERE user_id = ${dep.userId} FOR UPDATE
      `);
      const wRows = (lockedW.rows ?? lockedW) as Array<{
        user_id: number; balance_cents: number; hold_cents: number;
      }>;
      const w = wRows[0];
      if (!w) throw new Error("WALLET_NOT_FOUND");

      const newBalance = w.balance_cents + dep.amountCents;

      await tx.update(walletsTable)
        .set({ balanceCents: newBalance })
        .where(eq(walletsTable.userId, dep.userId));
      await tx.insert(walletTransactionsTable).values({
        userId: dep.userId,
        type: "deposit",
        amountCents: dep.amountCents,
        balanceAfterCents: newBalance,
        holdAfterCents: w.hold_cents,
        refType: "wallet_deposit",
        refId: dep.id,
        description: `Recarga ${dep.method === "binance" ? "Binance" : "Zelle"} aprobada · Ref ${dep.externalRef ?? dep.id}`,
        status: "posted",
      });
      await tx.update(walletDepositsTable)
        .set({
          status: "approved",
          adminNotes,
          processedByUserId: adminId,
          processedAt: new Date(),
        })
        .where(eq(walletDepositsTable.id, id));

      return { newBalance };
    });

    // Notificar al usuario fuera de la transacción.
    try {
      await createNotification({
        userId: dep.userId,
        type: "wallet_deposit_approved",
        title: "Recarga aprobada",
        message: `Acreditamos $${(dep.amountCents / 100).toFixed(2)} a tu LinkWallet.`,
        link: "/wallet",
      });
    } catch (e) { console.warn("[deposit/approve] notify error", e); }

    res.json({ ok: true, newBalanceCents: result.newBalance });
  } catch (err: any) {
    if (err?.message === "ALREADY_PROCESSED") {
      res.status(409).json({ error: "Esta recarga ya fue procesada" });
      return;
    }
    console.error("[admin/wallet/deposits/approve] error", err);
    res.status(500).json({ error: "No se pudo aprobar la recarga" });
  }
});

// ── POST /api/admin/wallet/deposits/:id/reject ──────────────────────────────
router.post("/admin/wallet/deposits/:id/reject", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
    const adminNotes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 500) : null;

    const [dep] = await db.select().from(walletDepositsTable).where(eq(walletDepositsTable.id, id)).limit(1);
    if (!dep) { res.status(404).json({ error: "Recarga no encontrada" }); return; }
    if (dep.status !== "pending") {
      res.status(409).json({ error: "Esta recarga ya fue procesada" });
      return;
    }

    await db.update(walletDepositsTable)
      .set({
        status: "rejected",
        adminNotes,
        processedByUserId: req.user!.id,
        processedAt: new Date(),
      })
      .where(eq(walletDepositsTable.id, id));

    try {
      await createNotification({
        userId: dep.userId,
        type: "wallet_deposit_rejected",
        title: "Recarga rechazada",
        message: adminNotes
          ? `No pudimos verificar tu recarga: ${adminNotes}`
          : "No pudimos verificar tu comprobante. Contáctanos por soporte.",
        link: "/wallet",
      });
    } catch (e) { console.warn("[deposit/reject] notify error", e); }

    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/wallet/deposits/reject] error", err);
    res.status(500).json({ error: "No se pudo rechazar la recarga" });
  }
});

export default router;
