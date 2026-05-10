import { Router } from "express";
import { db, walletsTable, walletTransactionsTable, escrowHoldsTable } from "@workspace/db";
import { and, desc, eq, or } from "drizzle-orm";
import { authenticate } from "../lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// LinkWallet — endpoints de SOLO LECTURA (primera tanda).
//
// Esta primera entrega expone únicamente lectura del saldo y del historial,
// y un helper interno `ensureWallet` que crea la fila de billetera la primera
// vez que el usuario la consulta. Esto evita migraciones de datos masivas:
// las billeteras nacen vacías y on-demand.
//
// Las operaciones que mueven dinero (recargar, retirar, escrow) se añadirán
// en una segunda tanda con sus respectivos endpoints transaccionales y la
// integración con el flujo BDV / withdrawals existente.
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/** Crea la fila de billetera del usuario si no existe (idempotente). */
async function ensureWallet(userId: number) {
  const existing = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  // ON CONFLICT DO NOTHING para tolerar carreras (índice único en user_id).
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

/** GET /api/wallet/me — saldo actual + holds activos + últimos movimientos. */
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

/** GET /api/wallet/transactions?limit=50&before=<id> — historial paginado. */
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

export default router;
