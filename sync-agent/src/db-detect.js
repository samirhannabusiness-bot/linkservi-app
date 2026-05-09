// Auto-detección de instancias SQL Server locales.
// Estrategia: TCP probe en paralelo a candidatos comunes (localhost:1433,
// 127.0.0.1:1433, hostname:1433, y puertos alternativos 1434/1435 para
// instancias nombradas). NO necesita credenciales — sólo verifica que algo
// escuche en el puerto. El usuario completa user/db/password manualmente.

import { createConnection } from "node:net";
import { hostname } from "node:os";

const DEFAULT_TIMEOUT_MS = 800;
const PORTS = [1433, 1434, 1435];

function probeTcp(host, port, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
  });
}

/**
 * Devuelve { found, candidates: [{host, port}], scanned: [...] }.
 * `candidates` es la lista de host:port que respondieron.
 * `scanned` ayuda a debugging y muestra qué se intentó.
 */
export async function detectSqlServer({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const hosts = ["localhost", "127.0.0.1"];
  // Hostname puede ser distinto (PC del cliente). Sólo lo probamos si tiene sentido.
  try {
    const h = hostname();
    if (h && h !== "localhost" && !hosts.includes(h)) hosts.push(h);
  } catch { /* ignore */ }

  const targets = [];
  for (const host of hosts) {
    for (const port of PORTS) targets.push({ host, port });
  }

  const results = await Promise.all(
    targets.map(async (t) => ({ ...t, ok: await probeTcp(t.host, t.port, timeoutMs) })),
  );

  const candidates = results.filter((r) => r.ok).map(({ host, port }) => ({ host, port }));
  return {
    found: candidates.length > 0,
    candidates,
    scanned: results.map(({ host, port, ok }) => ({ host, port, ok })),
  };
}
