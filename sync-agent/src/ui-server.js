// Servidor HTTP local del Sync Agent. Sirve la UI estática + API JSON para
// que el usuario:
//   - vea estado en vivo (conectado, última sync, productos, logs)
//   - guarde su config (apiKey, db, mapping)
//   - pruebe la conexión a SAINT antes de guardar
//   - dispare una sincronización manual ("Sincronizar ahora")
//
// Bind: 127.0.0.1 (solo localhost — no expuesto a la red por defecto).
// Sin dependencias adicionales (usa node:http nativo).

import { createServer } from "node:http";
import { readFileSync, statSync, accessSync, constants as FS_CONST } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getRecentLogs } from "./log-buffer.js";
import {
  validateAndMergeConfig,
  validateRuntimeConfig,
  saveConfigToDisk,
  maskSensitiveConfig,
} from "./config-manager.js";
import { friendlyError } from "./error-mapper.js";
import { createSaintClient } from "./saint-client.js";
import { getLogsDir } from "./paths.js";
import { detectSqlServer } from "./db-detect.js";
import { redeemPairingCode } from "./pair-client.js";
import { listDatabases, listTables, inspectTable } from "./db-introspect.js";

// Convierte una lista cruda de issues del dry-run en frases breves para la UI.
// Ej: [{field:'precio'} ×3, {field:'sku'} ×1] → ["3 filas con precio inválido",
// "1 fila sin código"]. Diseñado para máximo 3 frases — no abruma al usuario.
function humanizeIssues(issues, checked) {
  if (!Array.isArray(issues) || issues.length === 0 || !checked) return [];
  const counts = new Map();
  for (const it of issues) counts.set(it.field, (counts.get(it.field) ?? 0) + 1);
  const labels = { sku: "código", nombre: "nombre", precio: "precio", stock: "stock" };
  const out = [];
  for (const [field, n] of counts) {
    const lbl = labels[field] ?? field;
    const pct = Math.round((n / checked) * 100);
    out.push(n === 1
      ? `1 fila tiene problemas con el ${lbl}`
      : `${n} filas (${pct}%) tienen problemas con el ${lbl}`);
  }
  return out.slice(0, 3);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = resolve(__dirname, "ui");

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > 200_000) {
        reject(new Error("Cuerpo demasiado grande"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve(null);
      try { resolve(JSON.parse(text)); } catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
  // Sanitizamos path traversal
  if (urlPath.includes("..")) return sendText(res, 400, "Bad path");
  const filePath = join(UI_DIR, urlPath);
  try {
    const st = statSync(filePath);
    if (!st.isFile()) throw new Error("not file");
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    const type = STATIC_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
    });
    res.end(readFileSync(filePath));
  } catch {
    sendText(res, 404, "Not found");
  }
}

export function startUiServer({
  port = 7777,
  host = "127.0.0.1",
  configPath,
  getCurrentConfig,
  setCurrentConfig,
  getAgentState,
  triggerSyncNow,
  reconnectSaint,
  logger,
}) {
  const server = createServer(async (req, res) => {
    const url = req.url.split("?")[0];
    const method = req.method ?? "GET";
    try {
      // ── API endpoints ─────────────────────────────────────────────────────
      if (url === "/api/status" && method === "GET") {
        const st = getAgentState();
        return sendJson(res, 200, {
          version: st.version,
          startedAt: st.startedAt,
          dbType: st.dbType,
          connection: st.connection, // { ok, message, lastCheckedAt }
          lastSync: st.lastSync, // { at, ok, summary }
          productsSynced: st.productsSynced,
          isSyncing: st.isSyncing,
          nextRunAt: st.nextRunAt,
          intervalMin: st.intervalMin,
        });
      }

      if (url === "/api/config" && method === "GET") {
        return sendJson(res, 200, { config: maskSensitiveConfig(getCurrentConfig()) });
      }

      if (url === "/api/config" && method === "POST") {
        const body = await readBody(req);
        if (!body || typeof body !== "object") {
          return sendJson(res, 400, { error: "JSON inválido" });
        }
        const current = getCurrentConfig();
        const { ok, errors, cfg } = validateAndMergeConfig(current, body);
        if (!ok) return sendJson(res, 400, { error: "Datos inválidos", errors });
        try {
          saveConfigToDisk(configPath, cfg);
        } catch (err) {
          logger.error(`UI: error guardando config: ${err.message}`);
          return sendJson(res, 500, { error: "No se pudo guardar el archivo de configuración", detail: err.message });
        }
        // T004 + M1 — Detectamos transición invalid→valid ANTES de mutar
        // currentConfig para coordinar reconnect+autoSync sin race.
        const wasReady = validateRuntimeConfig(current).ok;
        setCurrentConfig(cfg);
        // Esperamos la reconexión para que el primer sync auto-activado
        // tenga el pool nuevo listo. Cap a 5s para no colgar la respuesta
        // si la DB está inalcanzable (mssql connectWithBackoff puede tardar
        // 30-45s reintentando). Si timeout o falla, igual respondemos ok
        // (el agente reintentará con backoff en su loop normal).
        try {
          await Promise.race([
            Promise.resolve(reconnectSaint?.()),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]);
        } catch (err) {
          logger.warn(`UI: reconectar falló tras guardar config: ${err.message}`);
        }
        const isReady = validateRuntimeConfig(cfg).ok;
        if (!wasReady && isReady) {
          // Disparamos sync inmediato post-reconnect (sin await — no bloquea respuesta).
          logger.info("UI: ✔ activación automática — primera sincronización disparada");
          Promise.resolve(triggerSyncNow?.()).catch(() => {});
        }
        logger.info("UI: configuración actualizada", { intervalMin: cfg.intervalMin, dbType: cfg.db?.type });
        return sendJson(res, 200, { ok: true, config: maskSensitiveConfig(cfg) });
      }

      if (url === "/api/test-connection" && method === "POST") {
        // Permite probar una config "tentativa" sin guardarla.
        const body = (await readBody(req)) ?? {};
        const current = getCurrentConfig();
        const { ok, errors, cfg } = validateAndMergeConfig(current, body);
        if (!ok) return sendJson(res, 400, { ok: false, error: "Configuración inválida", errors });

        let tester;
        try {
          tester = createSaintClient(cfg.db ?? {}, cfg.mapping ?? {}, {
            info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
          });
        } catch (err) {
          const friendly = friendlyError(err);
          return sendJson(res, 200, { ok: false, friendly });
        }
        try {
          await tester.connect();
          const sample = await tester.readCatalog();
          await tester.disconnect();
          return sendJson(res, 200, {
            ok: true,
            message: `Conexión exitosa. Se leyeron ${sample.length} productos válidos.`,
            sampleCount: sample.length,
            sample: sample.slice(0, 3),
          });
        } catch (err) {
          try { await tester.disconnect(); } catch { /* ignore */ }
          const friendly = friendlyError(err);
          return sendJson(res, 200, { ok: false, friendly });
        }
      }

      if (url === "/api/test-linkservi" && method === "POST") {
        // Valida la API Key + apiUrl haciendo GET al ping del backend.
        // Si vienen apiUrl/apiKey en el body, los usa como "tentativos"
        // (para validar antes de guardar). Si no, usa la config actual.
        const body = (await readBody(req)) ?? {};
        const current = getCurrentConfig();
        const apiUrl = (typeof body.apiUrl === "string" && body.apiUrl.trim()) || current.apiUrl;
        const apiKey = (typeof body.apiKey === "string" && body.apiKey.trim()) || current.apiKey;

        if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) {
          return sendJson(res, 200, {
            ok: false,
            friendly: { title: "URL del servidor inválida", detail: "Debe empezar con http:// o https://", raw: "" },
          });
        }
        if (!apiKey || apiKey === "REEMPLAZA_CON_TU_API_KEY" || apiKey.length < 8) {
          return sendJson(res, 200, {
            ok: false,
            friendly: { title: "Falta la API Key", detail: "Pégala desde tu panel de LinkServi (Integraciones → SAINT).", raw: "" },
          });
        }

        // Build URL: trim trailing slash, append /api/integrations/agent/ping
        const base = apiUrl.replace(/\/+$/, "");
        const pingUrl = `${base}/api/integrations/agent/ping`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          const r = await fetch(pingUrl, {
            method: "GET",
            headers: { "x-api-key": apiKey, accept: "application/json" },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          let payload = null;
          try { payload = await r.json(); } catch { /* ignore */ }
          if (!r.ok) {
            const err = new Error(`HTTP ${r.status} ${payload?.error ?? r.statusText}`);
            const friendly = friendlyError(err);
            return sendJson(res, 200, { ok: false, friendly, status: r.status });
          }
          const stores = Array.isArray(payload?.stores) ? payload.stores : [];
          const intervalMin = Number(payload?.intervalMin ?? current.intervalMin);
          if (stores.length === 0) {
            return sendJson(res, 200, {
              ok: true,
              warning: true,
              message: "API Key válida, pero aún no tienes ninguna tienda creada en LinkServi. Crea una antes de sincronizar.",
              stores: [],
              intervalMin,
            });
          }
          const storeNames = stores.map((s) => s.name).filter(Boolean);
          return sendJson(res, 200, {
            ok: true,
            message: stores.length === 1
              ? `Conectado como tienda "${storeNames[0]}".`
              : `Conectado · ${stores.length} tiendas: ${storeNames.slice(0, 3).join(", ")}${storeNames.length > 3 ? "…" : ""}.`,
            stores,
            intervalMin,
          });
        } catch (err) {
          clearTimeout(timeout);
          if (err.name === "AbortError") {
            return sendJson(res, 200, {
              ok: false,
              friendly: { title: "LinkServi no respondió a tiempo", detail: "El servidor tardó más de 10 segundos. Verifica que la URL sea correcta y reintenta.", raw: err.message },
            });
          }
          const friendly = friendlyError(err);
          return sendJson(res, 200, { ok: false, friendly });
        }
      }

      if (url === "/api/pair" && method === "POST") {
        // T001 — Pairing: el usuario pega el código mostrado en LinkServi.
        // Llama al backend; si éxito, persiste apiKey + apiUrl en config.json.
        const body = (await readBody(req)) ?? {};
        const code = typeof body.code === "string" ? body.code : "";
        const overrideApiUrl = typeof body.apiUrl === "string" && body.apiUrl.trim() ? body.apiUrl.trim() : undefined;
        const result = await redeemPairingCode({
          code,
          apiUrl: overrideApiUrl,
          version: getAgentState().version,
        });
        if (!result.ok) {
          return sendJson(res, 200, { ok: false, error: result.error, status: result.status });
        }
        // Persistimos en config.json (preservando todo lo demás).
        const current = getCurrentConfig();
        const merged = validateAndMergeConfig(current, {
          apiUrl: result.apiUrl,
          apiKey: result.apiKey,
          intervalMin: result.intervalMin || current.intervalMin || 15,
        });
        if (!merged.ok) {
          logger.error(`UI: pair OK pero merge config inválido: ${JSON.stringify(merged.errors)}`);
          return sendJson(res, 500, { ok: false, error: "Pairing OK pero la configuración resultante es inválida" });
        }
        try {
          saveConfigToDisk(configPath, merged.cfg);
        } catch (err) {
          logger.error(`UI: error guardando config tras pairing: ${err.message}`);
          return sendJson(res, 500, { ok: false, error: "No se pudo guardar la configuración" });
        }
        setCurrentConfig(merged.cfg);
        logger.info(`UI: ✔ pairing completado contra LinkServi (storeId=${result.storeId})`);
        return sendJson(res, 200, {
          ok: true,
          apiUrl: result.apiUrl,
          storeId: result.storeId,
          intervalMin: merged.cfg.intervalMin,
        });
      }

      if (url === "/api/sync-now" && method === "POST") {
        const st = getAgentState();
        if (st.isSyncing) {
          return sendJson(res, 409, { ok: false, error: "Ya hay una sincronización en curso" });
        }
        // Disparamos en background; UI ya hace polling de /status para ver resultado.
        Promise.resolve(triggerSyncNow?.()).catch(() => {});
        return sendJson(res, 202, { ok: true, message: "Sincronización iniciada" });
      }

      if (url === "/api/db/detect" && method === "GET") {
        // Auto-detección de SQL Server local — TCP probe paralelo a candidatos
        // típicos (localhost/127.0.0.1/hostname × puertos 1433/1434/1435).
        // Sin credenciales: sólo verifica qué host:port responde. El usuario
        // completa user/database/password manualmente o con valores por defecto.
        try {
          const result = await detectSqlServer();
          return sendJson(res, 200, result);
        } catch (err) {
          logger.warn(`db/detect: error inesperado: ${err.message}`);
          return sendJson(res, 200, { found: false, candidates: [], scanned: [], error: err.message });
        }
      }

      // ── FASE 2 — endpoints de onboarding automático ──────────────────────
      // Devolvemos siempre 200 con `ok:false + friendly` cuando algo de la DB
      // del cliente falla — la UI ya sabe pintar friendly errors así, y evita
      // que la UI tenga que distinguir entre HTTP errors y errores de negocio.

      if (url === "/api/db/list-databases" && method === "POST") {
        // T202 — lista bases de datos del SQL Server con creds tentativas.
        // No se persiste nada; sólo se usa para que el wizard auto-elija.
        const body = (await readBody(req)) ?? {};
        try {
          const dbs = await listDatabases({
            host: body.host,
            port: body.port,
            user: body.user,
            password: body.password,
          });
          // Heurística simple para sugerir SAINT.
          const suggested = dbs.find((d) => /saint/i.test(d)) ?? dbs[0] ?? null;
          return sendJson(res, 200, { ok: true, databases: dbs, suggested });
        } catch (err) {
          logger.warn(`db/list-databases: ${err.message}`);
          return sendJson(res, 200, { ok: false, friendly: friendlyError(err) });
        }
      }

      if (url === "/api/db/list-tables" && method === "POST") {
        // T202 — lista tablas de una base elegida.
        const body = (await readBody(req)) ?? {};
        try {
          const result = await listTables({
            host: body.host,
            port: body.port,
            user: body.user,
            password: body.password,
            database: body.database,
          });
          return sendJson(res, 200, { ok: true, ...result });
        } catch (err) {
          logger.warn(`db/list-tables: ${err.message}`);
          return sendJson(res, 200, { ok: false, friendly: friendlyError(err) });
        }
      }

      if (url === "/api/db/inspect-table" && method === "POST") {
        // T202 — devuelve columnas + sample + autoMap para que el wizard
        // pueda pre-poblar el mapping sin que el cliente toque nada.
        const body = (await readBody(req)) ?? {};
        try {
          const result = await inspectTable({
            host: body.host,
            port: body.port,
            user: body.user,
            password: body.password,
            database: body.database,
            table: body.table,
          });
          return sendJson(res, 200, { ok: true, ...result });
        } catch (err) {
          logger.warn(`db/inspect-table: ${err.message}`);
          return sendJson(res, 200, { ok: false, friendly: friendlyError(err) });
        }
      }

      if (url === "/api/sync/dry-run" && method === "POST") {
        // T204 — lectura local + validación, NO envía a LinkServi.
        // Acepta una config tentativa (db + mapping). Devuelve un reporte
        // human-friendly para el botón "Todo se ve bien — Activar".
        const body = (await readBody(req)) ?? {};
        const current = getCurrentConfig();
        const { ok, errors, cfg } = validateAndMergeConfig(current, body);
        if (!ok) return sendJson(res, 200, { ok: false, error: "Configuración inválida", errors });

        const dbType = String(cfg.db?.type ?? "sqlserver").toLowerCase();
        const m = cfg.mapping ?? {};

        // Validador genérico — recorre filas crudas y mide calidad.
        // Toma una función `getField(row, key)` para que sirva tanto para
        // recordsets crudos (mssql) como para el normalizado del mock.
        function validateRows(rows, getField) {
          const slice = rows.slice(0, 20);
          const issues = [];
          let priceOk = 0, stockOk = 0, skuOk = 0, nameOk = 0;
          for (let i = 0; i < slice.length; i++) {
            const r = slice[i];
            const sku = getField(r, "sku");
            const name = getField(r, "name");
            const price = getField(r, "price");
            const stock = getField(r, "stock");
            if (sku != null && String(sku).trim().length > 0) skuOk++;
            else issues.push({ row: i + 1, field: "sku", message: "fila sin código" });
            if (name != null && String(name).trim().length > 0) nameOk++;
            else issues.push({ row: i + 1, field: "nombre", message: "fila sin nombre" });
            const priceNum = typeof price === "number" ? price : Number(price);
            if (Number.isFinite(priceNum) && priceNum >= 0) priceOk++;
            else issues.push({ row: i + 1, field: "precio", message: "precio inválido o vacío" });
            const stockNum = typeof stock === "number" ? stock : Number(stock);
            if (Number.isFinite(stockNum) && stockNum >= 0) stockOk++;
            else issues.push({ row: i + 1, field: "stock", message: "stock inválido" });
          }
          return { slice, issues, priceOk, stockOk, skuOk, nameOk };
        }

        // ── Path SQL Server: validamos sobre filas CRUDAS de la tabla
        // (no las filtradas por saint-client). Esto da una métrica honesta
        // de calidad — si un 30% de la tabla no tiene precio, el dry-run
        // lo refleja. Usa inspectTable de db-introspect.
        if (dbType === "sqlserver") {
          // Fallback de mapping para configs legacy o parciales: si mapping.table
          // no viene, usamos "productos" como saint-client.resolveMapping. Esto
          // evita romper el dry-run cuando el wizard no ha seteado tabla todavía.
          const safeTable = m.table || "productos";
          try {
            const insp = await inspectTable({
              host: cfg.db.host, port: cfg.db.port,
              user: cfg.db.user, password: cfg.db.password,
              database: cfg.db.database, table: safeTable,
              options: cfg.db.options,
            });
            const v = validateRows(insp.sample, (r, key) => r?.[m[key]]);
            const total = insp.sample.length;
            const checked = v.slice.length;
            const allGood = checked > 0 &&
              v.priceOk === checked && v.stockOk === checked &&
              v.skuOk === checked && v.nameOk === checked;
            // Sample para preview con campos canonical para que la UI no
            // necesite saber el mapping.
            const samplePreview = v.slice.slice(0, 5).map((r) => ({
              sku: r?.[m.sku] ?? "", name: r?.[m.name] ?? "",
              price: r?.[m.price] ?? null, stock: r?.[m.stock] ?? null,
            }));
            return sendJson(res, 200, {
              ok: true,
              summary: {
                total, checked,
                priceOk: v.priceOk, stockOk: v.stockOk, skuOk: v.skuOk, nameOk: v.nameOk,
                allGood,
              },
              sample: samplePreview,
              issues: v.issues.slice(0, 5),
              humanIssues: humanizeIssues(v.issues, checked),
            });
          } catch (err) {
            return sendJson(res, 200, { ok: false, friendly: friendlyError(err) });
          }
        }

        // ── Path mock (u otros adapters): usamos saint-client.readCatalog().
        // Para el mock no hay diferencia raw vs normalizado.
        let tester;
        try {
          tester = createSaintClient(cfg.db ?? {}, m, {
            info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
          });
        } catch (err) {
          return sendJson(res, 200, { ok: false, friendly: friendlyError(err) });
        }
        try {
          await tester.connect();
          const sample = await tester.readCatalog();
          await tester.disconnect();
          const v = validateRows(sample, (r, key) => r?.[key]);
          const total = sample.length;
          const checked = v.slice.length;
          const allGood = checked > 0 &&
            v.priceOk === checked && v.stockOk === checked &&
            v.skuOk === checked && v.nameOk === checked;
          return sendJson(res, 200, {
            ok: true,
            summary: {
              total, checked,
              priceOk: v.priceOk, stockOk: v.stockOk, skuOk: v.skuOk, nameOk: v.nameOk,
              allGood,
            },
            sample: v.slice.slice(0, 5),
            issues: v.issues.slice(0, 5),
            humanIssues: humanizeIssues(v.issues, checked),
          });
        } catch (err) {
          try { await tester.disconnect(); } catch { /* ignore */ }
          return sendJson(res, 200, { ok: false, friendly: friendlyError(err) });
        }
      }

      if (url === "/api/health" && method === "GET") {
        // Healthcheck simple: UI levanta + filesystem escribible + config lista.
        // El front lo consulta al cargar para mostrar "Sistema listo" o
        // "Problema detectado" en lenguaje simple. Diseñado para que un
        // técnico de soporte pueda copiar el JSON y diagnosticar de un vistazo.
        const cfg = getCurrentConfig();
        const cfgCheck = validateRuntimeConfig(cfg);
        let fsOk = false;
        try {
          accessSync(getLogsDir(), FS_CONST.W_OK);
          fsOk = true;
        } catch { /* filesystem no escribible */ }
        const checks = { ui: true, filesystem: fsOk, config: cfgCheck.ok };
        const ok = checks.ui && checks.filesystem && checks.config;
        const issues = [];
        if (!fsOk) issues.push({ field: "filesystem", message: "No se puede escribir en la carpeta de logs" });
        for (const i of cfgCheck.issues) issues.push(i);
        return sendJson(res, 200, { ok, checks, issues });
      }

      if (url === "/api/logs" && method === "GET") {
        const u = new URL(req.url, "http://localhost");
        const sinceId = Number(u.searchParams.get("since") ?? 0);
        const limit = Math.min(200, Number(u.searchParams.get("limit") ?? 100));
        return sendJson(res, 200, { events: getRecentLogs({ sinceId, limit }) });
      }

      // ── Static UI ─────────────────────────────────────────────────────────
      if (method === "GET") return serveStatic(req, res);

      sendText(res, 405, "Method not allowed");
    } catch (err) {
      logger.error(`UI server: error inesperado en ${method} ${url}: ${err.message}`);
      sendJson(res, 500, { error: "Error interno", detail: err.message });
    }
  });

  // T007 — Port fallback: si 7777 está ocupado intentamos +1, +2, … +10.
  // Esto previene crashes en clientes que ya usen ese puerto para otra cosa.
  // Devolvemos { server, port } para que index.js pueda mostrar el real.
  const MAX_PORT_RETRIES = 10;
  return new Promise((resolveStart, rejectStart) => {
    let attempt = 0;
    function tryListen(p) {
      const onError = (err) => {
        if (err.code === "EADDRINUSE" && attempt < MAX_PORT_RETRIES) {
          attempt++;
          server.removeListener("error", onError);
          if (attempt === 1) logger.warn(`puerto ${port} ocupado, buscando alternativa…`);
          tryListen(port + attempt);
          return;
        }
        rejectStart(err);
      };
      server.once("error", onError);
      server.listen(p, host, () => {
        server.removeListener("error", onError);
        if (p !== port) {
          logger.warn(`puerto ${port} estaba ocupado · UI disponible en http://${host}:${p}`);
        } else {
          logger.info(`✔ UI local disponible en http://${host}:${p}`);
        }
        resolveStart({ server, port: p });
      });
    }
    tryListen(port);
  });
}
