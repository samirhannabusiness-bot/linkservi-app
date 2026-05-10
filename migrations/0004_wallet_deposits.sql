-- Recargas a LinkWallet — depósitos de usuario por BDV (automático),
-- Binance o Zelle (manual con aprobación de admin).
CREATE TABLE IF NOT EXISTS "wallet_deposits" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "method" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "bdv_transaction_id" integer,
  "proof_url" text,
  "external_ref" text,
  "user_notes" text,
  "admin_notes" text,
  "processed_by_user_id" integer REFERENCES "users"("id"),
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "wallet_deposits_user_idx"
  ON "wallet_deposits" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_deposits_status_idx"
  ON "wallet_deposits" ("status", "created_at");
