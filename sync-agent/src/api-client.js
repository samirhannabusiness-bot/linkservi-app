// Cliente HTTP del agente. Envía batches de productos a LinkServi.

const AGENT_VERSION = "1.0.0-preview";

export function createApiClient({ apiUrl, apiKey, logger }) {
  if (!apiUrl) throw new Error("apiUrl requerido en config.json");
  if (!apiKey) throw new Error("apiKey requerido en config.json");

  const baseUrl = apiUrl.replace(/\/+$/, "");

  async function syncProducts(products) {
    const url = `${baseUrl}/api/integrations/products/sync`;
    // Saint-client ya entrega el formato del spec: {sku, name, price, stock}.
    const payload = products.map((p) => ({
      sku: p.sku,
      name: p.name,
      price: typeof p.price === "number" ? p.price : Number(p.price),
      stock: typeof p.stock === "number" ? p.stock : null,
    }));
    const body = JSON.stringify({
      products: payload,
      agent: { version: AGENT_VERSION, host: process.platform },
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "User-Agent": `linkservi-sync-agent/${AGENT_VERSION}`,
      },
      body,
    });

    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

    if (!res.ok) {
      const err = new Error(
        `HTTP ${res.status} ${res.statusText} — ${json?.error ?? "sin detalle"}`,
      );
      err.status = res.status;
      err.body = json;
      throw err;
    }

    if (logger) {
      logger.debug("respuesta del servidor", json);
    }
    return json;
  }

  return { syncProducts, baseUrl, version: AGENT_VERSION };
}
