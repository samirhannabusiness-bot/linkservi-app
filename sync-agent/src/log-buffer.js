// Ring buffer in-memory de los últimos N eventos del agente. La UI local los
// consume vía GET /api/logs y los muestra en vivo. No reemplaza el log a
// archivo (logger.js sigue escribiendo en disco) — esto es solo para la UI.

const MAX_EVENTS = 200;

const buffer = [];
let nextId = 1;
const subscribers = new Set();

export function pushLogEvent({ level, message, meta }) {
  const evt = {
    id: nextId++,
    ts: new Date().toISOString(),
    level,
    message,
    meta: meta ?? null,
  };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) buffer.shift();
  for (const fn of subscribers) {
    try { fn(evt); } catch { /* no romper si un subscriber falla */ }
  }
  return evt;
}

export function getRecentLogs({ sinceId = 0, limit = 100 } = {}) {
  const filtered = sinceId > 0 ? buffer.filter((e) => e.id > sinceId) : buffer;
  return filtered.slice(-limit);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function clearLogs() {
  buffer.length = 0;
}
