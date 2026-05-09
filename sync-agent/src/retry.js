// Backoff exponencial con jitter para reintentos de conexión / sync.
// Se usa SOLO dentro de un ciclo (entre el ciclo y el siguiente respeta el
// intervalMin del usuario). Evita saturar al servidor cuando hay errores
// transitorios.

const DEFAULT_BASE_MS = 5_000; // 5s
const DEFAULT_MAX_MS = 60_000; // 60s

export function backoffDelay(attempt, { baseMs = DEFAULT_BASE_MS, maxMs = DEFAULT_MAX_MS } = {}) {
  // exponencial: base * 2^(attempt-1) con cap
  const exp = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(maxMs, exp);
  // jitter ±20% para evitar tormenta de reintentos sincronizados
  const jitter = capped * (Math.random() * 0.4 - 0.2);
  return Math.max(500, Math.round(capped + jitter));
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Ejecuta `fn` con hasta `maxAttempts` reintentos, esperando `backoffDelay`
// entre cada uno. Lanza el último error si todos fallan. `onAttempt(n, err)`
// se invoca antes de cada reintento (útil para loggear).
export async function withRetry(fn, { maxAttempts = 3, baseMs, maxMs, onAttempt } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) break;
      const delay = backoffDelay(attempt, { baseMs, maxMs });
      if (onAttempt) onAttempt(attempt, err, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
