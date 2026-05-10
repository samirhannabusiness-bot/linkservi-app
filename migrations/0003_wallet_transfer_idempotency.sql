-- ─────────────────────────────────────────────────────────────────────────────
-- LinkWallet — Idempotencia de transferencias
--
-- Agrega `idempotency_key` a `wallet_transactions` para que un mismo
-- "Idempotency-Key" enviado por el cliente (ej: doble click, reintento por
-- timeout) no produzca dos cargos al usuario.
--
-- Índice parcial UNIQUE sobre (user_id, idempotency_key) cuando la clave
-- es NOT NULL: garantiza que el mismo usuario no pueda producir dos
-- movimientos con la misma clave, pero permite NULL libremente para
-- todos los movimientos legacy / no-idempotentes (escrow, ajustes, etc.).
--
-- 100% aditiva e idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_idempotency_uniq
  ON wallet_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
