-- ─────────────────────────────────────────────────────────────────────────────
-- LinkWallet — PIN de billetera (migración aditiva, idempotente)
--
-- Agrega 3 columnas a la tabla `wallets` para soportar el PIN de seguridad
-- requerido para confirmar transferencias entre usuarios:
--   - pin_hash:             hash bcrypt del PIN (NULL = todavía no configurado)
--   - pin_failed_attempts:  intentos fallidos consecutivos (resetea al acertar)
--   - pin_locked_until:     bloqueo temporal tras 3 intentos fallidos
--
-- 100% idempotente — usar IF NOT EXISTS. No toca datos existentes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pin_hash             TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pin_failed_attempts  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pin_locked_until     TIMESTAMPTZ;
