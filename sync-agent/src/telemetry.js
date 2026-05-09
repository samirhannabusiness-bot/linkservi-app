// Telemetría del Sync Agent → POST /api/integrations/agent/telemetry.
//
// Diseño:
//   - Cola en memoria (FIFO, capada en 50 eventos para evitar leaks si el
//     servidor está caído por horas).
//   - Envío en background (no bloquea sync ni UI).
//   - Backoff exponencial en fallos de red/5xx.
//   - 4xx (auth, validación) NO se reintenta — se descarta el evento (logged).
//   - Sobrevive a falta de apiKey: si aún no hay pairing, dropea silencioso.
//
// API:
//   const t = createTelemetry({ getApiUrl, getApiKey, getVersion, logger });
//   t.emit("sync_success", { message, payload });
//   await t.flush();   // útil para tests
//   t.stop();          // cierra timer en shutdown

const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;

export function createTelemetry({ getApiUrl, getApiKey, getVersion, logger }) {
  const queue = [];
  let consecutiveFailures = 0;
  let timer = null;
  let flushing = false;
  let stopped = false;

  function enqueue(event) {
    if (stopped) return;
    queue.push(event);
    if (queue.length > MAX_QUEUE) queue.shift(); // drop oldest
  }

  function emit(type, { message, payload } = {}) {
    enqueue({
      type,
      message: message ?? null,
      payload: payload ?? null,
      version: getVersion?.() ?? null,
      ts: Date.now(),
    });
  }

  async function flush() {
    if (flushing || stopped) return;
    if (queue.length === 0) return;
    const apiUrl = getApiUrl?.();
    const apiKey = getApiKey?.();
    if (!apiUrl || !apiKey || apiKey === "REEMPLAZA_CON_TU_API_KEY") {
      // No pairing aún — dejamos los eventos hasta que el agente sea pareado.
      return;
    }

    flushing = true;
    try {
      while (queue.length > 0 && !stopped) {
        const ev = queue[0];
        const ok = await sendOne(apiUrl, apiKey, ev);
        if (ok === "retry") {
          consecutiveFailures++;
          break; // dejar el evento en cabeza, reintentar luego
        }
        // ok === true (éxito) o "drop" (4xx no recuperable) → quitar de la cola
        queue.shift();
        if (ok === true) consecutiveFailures = 0;
      }
    } finally {
      flushing = false;
    }
  }

  async function sendOne(apiUrl, apiKey, ev) {
    const base = String(apiUrl).replace(/\/+$/, "");
    const url = `${base}/api/integrations/agent/telemetry`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          type: ev.type,
          message: ev.message ?? undefined,
          payload: ev.payload ?? undefined,
          version: ev.version ?? undefined,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // Auth / validación inválida — no reintentar.
        let detail = "";
        try { const j = await res.json(); detail = j?.error ?? ""; } catch { /* ignore */ }
        logger?.warn?.(`telemetry: evento "${ev.type}" rechazado por servidor (${res.status}) ${detail} — descartado`);
        return "drop";
      }
      return "retry";
    } catch (err) {
      clearTimeout(timeout);
      // Red o timeout → reintentar.
      logger?.debug?.(`telemetry: error de red enviando "${ev.type}": ${err?.message ?? err}`);
      return "retry";
    }
  }

  function scheduleNext() {
    if (stopped) return;
    const backoff = Math.min(
      FLUSH_INTERVAL_MS * Math.pow(2, Math.min(consecutiveFailures, 6)),
      MAX_BACKOFF_MS,
    );
    timer = setTimeout(async () => {
      try { await flush(); } catch { /* never throws — defensive */ }
      scheduleNext();
    }, backoff);
    if (typeof timer.unref === "function") timer.unref();
  }
  scheduleNext();

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { emit, flush, stop, _queueSize: () => queue.length };
}
