// Resolve filesystem paths consistently when running:
//   1. Como `node src/index.js`    → relativos al proyecto (./config.json, ./logs/)
//   2. Como .exe empaquetado (pkg) → junto al exe (config) + %LOCALAPPDATA% (logs)
//
// Detecta el modo empaquetado vía `process.pkg` (lo agrega yao-pkg/pkg).
// En Windows, los logs se guardan en una carpeta accesible y persistente
// para que un técnico de soporte pueda revisarlos sin tocar el directorio
// de instalación (que puede estar protegido por permisos).

import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";

const isPackaged = typeof process.pkg !== "undefined";

/** Carpeta donde vive el ejecutable / proyecto. */
export function getAppDir() {
  if (isPackaged) {
    // process.execPath = ruta absoluta al .exe
    return dirname(process.execPath);
  }
  // En modo dev, raíz del proyecto sync-agent (un nivel arriba de src/).
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

/**
 * Carpeta persistente para datos de usuario (logs, override de config).
 * Windows: %LOCALAPPDATA%\LinkServiSyncAgent\
 * macOS:   ~/Library/Application Support/LinkServiSyncAgent/
 * Linux:   ~/.linkservi-sync-agent/
 */
export function getDataDir() {
  if (!isPackaged) return getAppDir(); // en dev, todo junto al proyecto
  const plat = platform();
  if (plat === "win32") {
    const base = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(base, "LinkServiSyncAgent");
  }
  if (plat === "darwin") {
    return join(homedir(), "Library", "Application Support", "LinkServiSyncAgent");
  }
  return join(homedir(), ".linkservi-sync-agent");
}

/**
 * Path al config.json. Prioridad:
 *  1. CLI flag --config (resuelto por el caller)
 *  2. Env SYNC_AGENT_CONFIG
 *  3. config.json junto al exe (modo empaquetado) o ./config.json (dev)
 *  4. config.example.json en el bundle (fallback inicial)
 */
export function getDefaultConfigPath() {
  return join(getAppDir(), "config.json");
}

/** Path al config de ejemplo (siempre dentro del bundle). */
export function getExampleConfigPath() {
  if (isPackaged) {
    // Los assets de pkg se montan en process.cwd() del snapshot virtual.
    // Buscamos config.example.json relativo al script empaquetado.
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, "..", "config.example.json");
  }
  return join(getAppDir(), "config.example.json");
}

/** Carpeta de logs persistente. Crea si no existe. */
export function getLogsDir() {
  const dir = join(getDataDir(), "logs");
  try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

/** Path al archivo de log del día (rotación diaria). */
export function getDefaultLogFile() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(getLogsDir(), `sync-agent-${today}.log`);
}

/** True si parece "primera vez" (no hay config válida). */
export function isFirstRun(cfg) {
  if (!cfg) return true;
  if (!cfg.apiKey || cfg.apiKey === "REEMPLAZA_CON_TU_API_KEY") return true;
  if (cfg.apiKey.length < 8) return true;
  return false;
}

export { isPackaged };

/** Retro-compatibilidad: si existe ./config.json en cwd (modo dev), úsalo. */
export function resolveInitialConfigPath(cliPath, envPath) {
  if (cliPath) return resolve(cliPath);
  if (envPath) return resolve(envPath);
  // Modo empaquetado: junto al exe.
  if (isPackaged) {
    const next = getDefaultConfigPath();
    if (existsSync(next)) return next;
    // Si no hay config junto al exe, usamos esa ruta igual (el agente la creará al guardar).
    return next;
  }
  // Modo dev: ./config.json en cwd, fallback a getAppDir.
  const cwd = resolve("./config.json");
  if (existsSync(cwd)) return cwd;
  return getDefaultConfigPath();
}
