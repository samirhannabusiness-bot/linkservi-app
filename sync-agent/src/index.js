#!/usr/bin/env node
// LinkServi Sync Agent — entrypoint.
//
// Loop principal:
//   1. lee productos desde SAINT (SQL Server / Firebird / mock dev)
//   2. los envía a POST /api/integrations/products/sync
//   3. duerme `intervalMin` minutos
//   4. repite
//
// Además expone una UI local en http://127.0.0.1:7777 con estado en vivo,
// configuración editable, "Probar conexión" y "Sincronizar ahora". La UI no
// se expone fuera de localhost por defecto.
//
// Flags:
//   --once         : ejecuta una sola sincronización y termina (cron / smoke)
//   --dry-run      : NO envía al servidor, solo imprime el batch
//   --no-ui        : desactiva el servidor UI (modo headless puro)
//   --service      : modo servicio (sin banner, log JSON-line, prep Windows Service)
//   --production   : modo cliente final — sin consola, sólo logs en archivo,
//                    sin auto-open browser si la config ya está completa
//   --no-open      : no abre browser automáticamente nunca
//   --ui-port N    : puerto del UI server (default 7777, fallback +1..+10)
//   --config <p>   : ruta al config.json (default: ./config.json en CWD)

import { readFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

import { createLogger } from "./logger.js";
import { createApiClient } from "./api-client.js";
import { createSaintClient } from "./saint-client.js";
import { startUiServer } from "./ui-server.js";
import { friendlyError } from "./error-mapper.js";
import { backoffDelay, sleep } from "./retry.js";
import { saveConfigToDisk, validateRuntimeConfig } from "./config-manager.js";
import { createTelemetry } from "./telemetry.js";
import {
  resolveInitialConfigPath,
  getExampleConfigPath,
  getDefaultLogFile,
  isFirstRun,
  isPackaged,
} from "./paths.js";
import { openUrl } from "./open-url.js";

const AGENT_VERSION = "1.0.0";

// ── Parse args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const once = args.includes("--once");
const dryRun = args.includes("--dry-run");
const noUi = args.includes("--no-ui") || once; // En modo --once la UI no aporta.
const serviceMode = args.includes("--service");
const productionMode = args.includes("--production");
const noOpen = args.includes("--no-open") || productionMode; // T003: silencio total
const configIdx = args.indexOf("--config");
const uiPortIdx = args.indexOf("--ui-port");
const uiPort = uiPortIdx >= 0 && args[uiPortIdx + 1] ? Number(args[uiPortIdx + 1]) : Number(process.env.SYNC_AGENT_UI_PORT ?? 7777);
const configPath = resolveInitialConfigPath(
  configIdx >= 0 && args[configIdx + 1] ? args[configIdx + 1] : null,
  process.env.SYNC_AGENT_CONFIG ?? null,
);

// ── Load config ───────────────────────────────────────────────────────────────
function loadConfig(p) {
  if (!existsSync(p)) {
    // Si corre empaquetado y no hay config junto al .exe, crear uno desde el ejemplo.
    const example = getExampleConfigPath();
    if (existsSync(example)) {
      try {
        copyFileSync(example, p);
        console.log(`[init] config.json creada desde el ejemplo: ${p}`);
      } catch (err) {
        throw new Error(`No se pudo crear config.json en ${p}: ${err.message}`);
      }
    } else {
      throw new Error(`config.json no encontrado en ${p}`);
    }
  }
  const raw = readFileSync(p, "utf8");
  const cfg = JSON.parse(raw);
  if (!cfg.apiUrl) throw new Error("config.json: falta `apiUrl`");
  const interval = Number(cfg.intervalMin);
  if (![5, 15, 30, 60].includes(interval)) {
    throw new Error("config.json: `intervalMin` debe ser 5, 15, 30 o 60");
  }
  cfg.intervalMin = interval;
  return { cfg, path: p };
}

// ── Estado compartido del agente (UI lo lee, loop lo escribe) ────────────────
const state = {
  version: AGENT_VERSION,
  startedAt: new Date().toISOString(),
  dbType: "—",
  intervalMin: 15,
  connection: { ok: false, message: "Aún no se ha probado la conexión.", lastCheckedAt: null },
  lastSync: { at: null, ok: null, summary: null },
  productsSynced: 0,
  isSyncing: false,
  nextRunAt: null,
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { cfg: initialCfg, path: cfgPath } = loadConfig(configPath);
  let currentConfig = initialCfg;

  // Default log file: si la config no especifica `logging.file`, escribimos en
  // la carpeta persistente del usuario (Windows: %LOCALAPPDATA%\LinkServiSyncAgent\logs).
  // Esto es esencial para soporte: el técnico puede pedir el log sin tocar el
  // directorio de instalación (que requiere admin).
  const defaultLogFile = currentConfig.logging?.file ?? getDefaultLogFile();
  // T003 — modo --production: silencia consola pero mantiene logs en archivo.
  // El usuario final NO debe ver una consola con texto técnico cuando hace
  // doble clic; sigue pudiendo ver eventos en el panel UI o en el archivo.
  const logger = createLogger({
    level: currentConfig.logging?.level ?? (productionMode ? "warn" : "info"),
    file: defaultLogFile,
    consoleQuiet: productionMode || serviceMode,
  });

  if (!serviceMode && !productionMode) logger.banner(`LinkServi Sync Agent · v${AGENT_VERSION}`);
  logger.info("config cargada", {
    path: cfgPath,
    apiUrl: currentConfig.apiUrl,
    intervalMin: currentConfig.intervalMin,
    dbType: currentConfig.db?.type ?? "mock",
    dryRun,
    once,
    serviceMode,
    uiEnabled: !noUi,
  });

  let apiClient = createApiClient({ apiUrl: currentConfig.apiUrl, apiKey: currentConfig.apiKey, logger });
  let saint = null;
  state.intervalMin = currentConfig.intervalMin;
  state.dbType = currentConfig.db?.type ?? "mock";

  // T007 — Telemetría: cola en background. Lee siempre la config actual para
  // que tras pairing el primer evento ya use la apiKey nueva.
  const telemetry = createTelemetry({
    getApiUrl: () => currentConfig.apiUrl,
    getApiKey: () => currentConfig.apiKey,
    getVersion: () => AGENT_VERSION,
    logger,
  });
  telemetry.emit("agent_started", {
    message: `Sync Agent v${AGENT_VERSION} arrancó`,
    payload: { dbType: state.dbType, intervalMin: state.intervalMin },
  });

  // ── Construye/recrea el cliente SAINT (al startup y al guardar config) ────
  function buildSaint() {
    try {
      saint = createSaintClient(currentConfig.db ?? {}, currentConfig.mapping ?? {}, logger);
      state.dbType = saint.type;
      return true;
    } catch (err) {
      const f = friendlyError(err);
      logger.error(`config inválida para SAINT: ${f.title}`, { detail: f.detail });
      saint = null;
      state.connection = { ok: false, message: f.title, lastCheckedAt: new Date().toISOString() };
      return false;
    }
  }

  buildSaint();

  // ── Conexión inicial (no bloqueante para el agente) ───────────────────────
  async function connectWithBackoff(maxAttempts = 3) {
    if (!saint) return false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await saint.connect();
        state.connection = {
          ok: true,
          message: "Conectado a SAINT correctamente.",
          lastCheckedAt: new Date().toISOString(),
        };
        return true;
      } catch (err) {
        const f = friendlyError(err);
        state.connection = {
          ok: false,
          message: f.title,
          lastCheckedAt: new Date().toISOString(),
        };
        if (attempt >= maxAttempts) {
          logger.warn(`conexión a SAINT falló tras ${maxAttempts} intentos: ${f.title}`);
          return false;
        }
        const delay = backoffDelay(attempt);
        logger.warn(`reintento de conexión a SAINT en ${Math.round(delay / 1000)}s (intento ${attempt + 1}/${maxAttempts})`);
        await sleep(delay);
      }
    }
    return false;
  }

  await connectWithBackoff();

  let cycle = 0;
  let stopping = false;

  // ── Una sincronización ────────────────────────────────────────────────────
  async function runOnce({ source = "auto" } = {}) {
    if (state.isSyncing) {
      logger.warn("ignorado: ya hay una sincronización en curso");
      return { ok: false, error: "busy" };
    }
    state.isSyncing = true;
    cycle++;
    const t0 = Date.now();
    logger.info(`▶ ciclo #${cycle} (${source}) — leyendo catálogo SAINT (${state.dbType})`);

    try {
      if (!saint) {
        if (!buildSaint()) {
          state.lastSync = { at: new Date().toISOString(), ok: false, summary: "Configuración SAINT inválida" };
          return { ok: false };
        }
      }

      let products;
      try {
        products = await saint.readCatalog();
        state.connection = { ok: true, message: "Conectado a SAINT correctamente.", lastCheckedAt: new Date().toISOString() };
      } catch (err) {
        const f = friendlyError(err);
        logger.error(`fallo leyendo catálogo SAINT: ${f.title}`, { detail: f.detail, raw: err.message });
        state.connection = { ok: false, message: f.title, lastCheckedAt: new Date().toISOString() };
        state.lastSync = { at: new Date().toISOString(), ok: false, summary: f.title };
        telemetry.emit("db_error", {
          message: f.title,
          payload: { detail: f.detail, source },
        });
        logger.warn("se reintentará en el siguiente ciclo");
        return { ok: false };
      }

      if (!Array.isArray(products) || products.length === 0) {
        logger.warn("catálogo SAINT vacío — nada que sincronizar este ciclo");
        state.lastSync = { at: new Date().toISOString(), ok: true, summary: "Catálogo vacío" };
        return { ok: true, empty: true };
      }
      logger.info(`  ${products.length} productos listos para sincronizar`);

      if (dryRun) {
        logger.warn("--dry-run activo: omitido envío al servidor");
        logger.debug("muestra (3)", products.slice(0, 3));
        state.lastSync = { at: new Date().toISOString(), ok: true, summary: `${products.length} productos (dry-run)` };
        state.productsSynced = products.length;
        return { ok: true, dryRun: true };
      }

      try {
        const resp = await apiClient.syncProducts(products);
        const ms = Date.now() - t0;
        logger.info(`  ✔ enviado en ${ms}ms`, {
          received: resp.received,
          valid: resp.valid,
          invalid: resp.invalid,
          created: resp.created,
          updated: resp.updated,
          skipped: resp.skipped,
          errors: resp.errors,
          runId: resp.runId,
        });
        state.productsSynced = (resp.created ?? 0) + (resp.updated ?? 0) + (resp.skipped ?? 0);
        state.lastSync = {
          at: new Date().toISOString(),
          ok: true,
          summary: `${resp.created ?? 0} nuevos · ${resp.updated ?? 0} actualizados · ${resp.skipped ?? 0} sin cambios`,
        };
        telemetry.emit("sync_success", {
          message: state.lastSync.summary,
          payload: {
            productsSynced: state.productsSynced,
            durationMs: ms,
            received: resp.received ?? 0,
            valid: resp.valid ?? 0,
            invalid: resp.invalid ?? 0,
            created: resp.created ?? 0,
            updated: resp.updated ?? 0,
            skipped: resp.skipped ?? 0,
            source,
          },
        });
        return { ok: true, resp };
      } catch (err) {
        const f = friendlyError(err);
        logger.error(`  ✘ falló envío a LinkServi: ${f.title}`, { detail: f.detail, raw: err.message, status: err.status });
        state.lastSync = { at: new Date().toISOString(), ok: false, summary: f.title };
        telemetry.emit("sync_error", {
          message: f.title,
          payload: { detail: f.detail, status: err?.status, source },
        });
        return { ok: false, error: err };
      }
    } finally {
      state.isSyncing = false;
      state.nextRunAt = new Date(Date.now() + state.intervalMin * 60_000).toISOString();
    }
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  // T004 — Activación automática: solo ejecutamos el primer ciclo si la
  // configuración runtime ya es válida (apiKey real + db host/db/user).
  // Si falta algo, esperamos en silencio a que el usuario complete el
  // wizard desde la UI; al guardar config válida (callback setCurrentConfig)
  // disparamos un sync inmediato sin requerir click manual.
  state.nextRunAt = new Date(Date.now() + currentConfig.intervalMin * 60_000).toISOString();
  const initialReady = validateRuntimeConfig(currentConfig);
  if (initialReady.ok) {
    logger.info("✔ configuración válida — iniciando primera sincronización automática");
    await runOnce({ source: "startup" });
  } else {
    logger.info("configuración incompleta — esperando setup desde la UI", {
      pending: initialReady.issues.map((i) => i.field),
    });
    state.connection = {
      ok: false,
      message: "Configura el agente desde el panel para empezar a sincronizar.",
      lastCheckedAt: null,
    };
  }

  if (once) {
    logger.info("modo --once: terminando.");
    return;
  }

  let intervalMs = currentConfig.intervalMin * 60_000;
  if (!serviceMode) logger.info(`próxima sincronización en ${currentConfig.intervalMin} min — Ctrl+C para detener`);

  let handle = setInterval(tick, intervalMs);
  function tick() {
    if (stopping) return;
    runOnce({ source: "schedule" }).then(() => {
      if (!stopping) logger.info(`próxima sincronización en ${currentConfig.intervalMin} min`);
    });
  }

  // ── UI server ─────────────────────────────────────────────────────────────
  let uiStarted = false;
  let uiActualPort = uiPort;
  if (!noUi) {
    try {
      const ui = await startUiServer({
        port: uiPort,
        host: "127.0.0.1",
        configPath: cfgPath,
        getCurrentConfig: () => currentConfig,
        setCurrentConfig: (next) => {
          const oldInterval = currentConfig.intervalMin;
          const wasReady = validateRuntimeConfig(currentConfig).ok;
          currentConfig = next;
          state.intervalMin = next.intervalMin;
          // Recreamos apiClient si cambió apiUrl/apiKey (solo si la API Key ya es real)
          if (next.apiKey && next.apiKey !== "REEMPLAZA_CON_TU_API_KEY") {
            try {
              apiClient = createApiClient({ apiUrl: next.apiUrl, apiKey: next.apiKey, logger });
            } catch (err) {
              logger.warn(`no se pudo reconstruir cliente API: ${err.message}`);
            }
          }
          // Reprogramamos el ciclo si cambió el intervalo
          if (next.intervalMin !== oldInterval) {
            clearInterval(handle);
            intervalMs = next.intervalMin * 60_000;
            handle = setInterval(tick, intervalMs);
            state.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
            logger.info(`intervalo actualizado a ${next.intervalMin} min`);
          }
          // T004 — Activación automática: el disparo lo hace ui-server.js
          // DESPUÉS de que reconnectSaint() haya completado, evitando que
          // runOnce corra contra un pool aún no reconectado (ver M1).
          // Aquí sólo registramos la transición para que el log lo refleje.
          const isReady = validateRuntimeConfig(next).ok;
          if (!wasReady && isReady) {
            logger.info("✔ configuración completa — sincronización se disparará tras reconectar");
          }
        },
        getAgentState: () => ({ ...state }),
        triggerSyncNow: () => runOnce({ source: "manual" }),
        reconnectSaint: async () => {
          // Reconectar al guardar nueva config DB.
          if (saint) {
            try { await saint.disconnect(); } catch { /* ignore */ }
          }
          if (buildSaint()) await connectWithBackoff(2);
        },
        logger,
      });
      uiStarted = true;
      uiActualPort = ui.port; // T007: puede ser != uiPort si hubo fallback
    } catch (err) {
      logger.warn(`no se pudo iniciar la UI local: ${err.message} — el agente sigue corriendo en modo headless`);
    }

    // Auto-open browser en el primer uso (config sin apiKey o placeholder).
    // Solo cuando NO es modo servicio/producción, NO se pasó --no-open,
    // Y la UI realmente arrancó.
    if (uiStarted && !serviceMode && !noOpen && isFirstRun(currentConfig)) {
      const url = `http://127.0.0.1:${uiActualPort}`;
      // Esperamos un instante para asegurar que el server está listo.
      setTimeout(() => {
        openUrl(url).then(
          () => logger.info(`✔ navegador abierto en ${url} para configuración inicial`),
          (err) => logger.warn(`no se pudo abrir el navegador automáticamente (abre ${url} manualmente): ${err.message}`),
        );
      }, 500);
    }
  }

  async function shutdown(sig) {
    if (stopping) return;
    stopping = true;
    clearInterval(handle);
    if (!serviceMode) logger.warn(`recibido ${sig} — cerrando agente.`);
    try { await telemetry.flush(); } catch { /* best-effort */ }
    telemetry.stop();
    try { if (saint) await saint.disconnect(); } catch (err) { logger.warn(`error cerrando SAINT: ${err.message}`); }
    process.exit(0);
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Logueo para distribución: siempre dejamos saber si corre empaquetado.
if (isPackaged && !serviceMode) {
  console.log(`[boot] modo empaquetado · config: ${configPath}`);
}

main().catch((err) => {
  console.error("\x1b[31m[FATAL]\x1b[0m", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
