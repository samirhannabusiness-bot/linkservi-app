-- ─────────────────────────────────────────────────────────────────────────────
-- LinkWallet — migración aditiva (segura para correr en cada despliegue)
--
-- Crea las 3 tablas de la billetera interna sólo si no existen. NO toca ni
-- modifica ninguna tabla existente. Es 100% idempotente: correrla 1 vez o 100
-- veces da el mismo resultado.
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabla 1: wallets — un saldo por usuario
CREATE TABLE IF NOT EXISTS wallets (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_cents  INTEGER NOT NULL DEFAULT 0,
  hold_cents     INTEGER NOT NULL DEFAULT 0,
  currency       TEXT    NOT NULL DEFAULT 'USD',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_id_uniq ON wallets(user_id);

-- Tabla 2: wallet_transactions — libro contable inmutable
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                  TEXT    NOT NULL,
  amount_cents          INTEGER NOT NULL,
  balance_after_cents   INTEGER NOT NULL,
  hold_after_cents      INTEGER NOT NULL,
  ref_type              TEXT,
  ref_id                INTEGER,
  description           TEXT,
  status                TEXT    NOT NULL DEFAULT 'posted',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user_idx ON wallet_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS wallet_tx_ref_idx  ON wallet_transactions(ref_type, ref_id);

-- Tabla 3: escrow_holds — retenciones por reserva
CREATE TABLE IF NOT EXISTS escrow_holds (
  id                SERIAL PRIMARY KEY,
  payer_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payee_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents      INTEGER NOT NULL,
  commission_cents  INTEGER NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'held',
  ref_type          TEXT    NOT NULL,
  ref_id            INTEGER NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at       TIMESTAMPTZ
);
CREATE INDEX        IF NOT EXISTS escrow_holds_payer_idx  ON escrow_holds(payer_user_id);
CREATE INDEX        IF NOT EXISTS escrow_holds_payee_idx  ON escrow_holds(payee_user_id);
CREATE INDEX        IF NOT EXISTS escrow_holds_status_idx ON escrow_holds(status);
CREATE UNIQUE INDEX IF NOT EXISTS escrow_holds_ref_uniq   ON escrow_holds(ref_type, ref_id);
