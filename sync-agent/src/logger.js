import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { pushLogEvent } from "./log-buffer.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const COLORS = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
  dim: "\x1b[2m",
};

export function createLogger({ level = "info", file = null, consoleQuiet = false } = {}) {
  const minLevel = LEVELS[level] ?? LEVELS.info;
  let fileReady = false;

  if (file) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      fileReady = true;
    } catch (err) {
      console.error("[logger] no se pudo preparar archivo de log:", err.message);
    }
  }

  function format(lvl, msg, meta) {
    const ts = new Date().toISOString();
    const metaStr = meta ? " " + JSON.stringify(meta) : "";
    return `${ts} [${lvl.toUpperCase()}] ${msg}${metaStr}`;
  }

  function write(lvl, msg, meta) {
    if ((LEVELS[lvl] ?? 0) < minLevel) return;
    const line = format(lvl, msg, meta);
    const color = COLORS[lvl] ?? "";
    // Consola con color (silenciable en modo --production / --service)
    if (!consoleQuiet) {
      if (lvl === "error" || lvl === "warn") {
        console.error(`${color}${line}${COLORS.reset}`);
      } else {
        console.log(`${color}${line}${COLORS.reset}`);
      }
    }
    // Archivo (sin colores). Solo persistimos warn/error siempre + info opcional.
    if (fileReady && (lvl === "warn" || lvl === "error" || minLevel <= LEVELS.info)) {
      try {
        appendFileSync(file, line + "\n");
      } catch {
        // silenciamos para no romper el loop
      }
    }
    // Buffer in-memory para la UI local (siempre, independiente del nivel).
    try { pushLogEvent({ level: lvl, message: msg, meta: meta ?? null }); } catch { /* ignore */ }
  }

  return {
    debug: (msg, meta) => write("debug", msg, meta),
    info: (msg, meta) => write("info", msg, meta),
    warn: (msg, meta) => write("warn", msg, meta),
    error: (msg, meta) => write("error", msg, meta),
    banner: (text) => {
      if (consoleQuiet) return;
      const bar = "─".repeat(Math.max(20, text.length + 4));
      console.log(`${COLORS.dim}${bar}${COLORS.reset}`);
      console.log(`  ${text}`);
      console.log(`${COLORS.dim}${bar}${COLORS.reset}`);
    },
  };
}
