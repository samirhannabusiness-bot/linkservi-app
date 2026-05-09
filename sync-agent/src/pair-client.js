// Pair client — redime un código de pairing contra LinkServi y devuelve la
// configuración resultante (apiKey, apiUrl, storeId).
//
// Llamado desde ui-server.js cuando el usuario pega el código en el wizard.

import os from "node:os";

const PAIR_TIMEOUT_MS = 15_000;

function defaultApiBase() {
  // Default: linkservi.com (producción). El usuario puede sobreescribir
  // si prueba contra un staging diferente.
  return process.env.LINKSERVI_API_URL?.trim() || "https://linkservi.com";
}

function deviceName() {
  try {
    return `${os.hostname()} (${os.platform()})`.slice(0, 120);
  } catch {
    return "Sync Agent";
  }
}

/**
 * Redime un código de pairing.
 * @param {{ code: string, apiUrl?: string, version?: string }} args
 * @returns {Promise<{ ok: boolean, apiKey?: string, apiUrl?: string, storeId?: number|null, error?: string, status?: number }>}
 */
export async function redeemPairingCode({ code, apiUrl, version }) {
  const trimmed = String(code || "").trim().toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(trimmed)) {
    return { ok: false, error: "Código inválido (deben ser 8 caracteres en mayúsculas)" };
  }
  const base = (apiUrl || defaultApiBase()).replace(/\/+$/, "");
  const url = `${base}/api/integrations/agent/pair`;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), PAIR_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: trimmed,
        deviceName: deviceName(),
        version: version || undefined,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: json?.error || `Servidor respondió ${res.status}`,
      };
    }
    if (!json?.ok || typeof json.apiKey !== "string") {
      return { ok: false, status: res.status, error: "Respuesta inesperada del servidor" };
    }
    return {
      ok: true,
      apiKey: json.apiKey,
      apiUrl: json.apiUrl || base,
      storeId: typeof json.storeId === "number" ? json.storeId : null,
      intervalMin: Number(json.intervalMin) || 15,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      return { ok: false, error: "El servidor tardó más de 15 segundos en responder" };
    }
    return { ok: false, error: `Error de red: ${err?.message ?? err}` };
  }
}
