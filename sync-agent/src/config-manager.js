// Gestiona la lectura/escritura de config.json desde la UI local.
// Validación estricta: la UI sólo puede guardar configs sintácticamente válidos.
// Escritura atómica: tmp file + rename para evitar corrupción si se corta luz.

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const ALLOWED_INTERVALS = [5, 15, 30, 60];
const ALLOWED_DB_TYPES = ["sqlserver", "mssql", "firebird", "mock"];
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}(\.[A-Za-z_][A-Za-z0-9_]{0,127})?$/;

export function loadConfigFromDisk(path) {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

export function saveConfigToDisk(path, cfg) {
  const dir = dirname(resolve(path));
  const tmp = join(dir, `.config.tmp-${process.pid}-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
  renameSync(tmp, path);
}

// Valida un patch parcial enviado desde la UI y devuelve { ok, errors[], cfg }.
// `current` es el config actual en memoria; los campos no presentes en `patch`
// se conservan, los presentes se reemplazan.
export function validateAndMergeConfig(current, patch) {
  const errors = [];
  const next = JSON.parse(JSON.stringify(current));

  if (patch.apiUrl !== undefined) {
    const trimmedUrl = typeof patch.apiUrl === "string" ? patch.apiUrl.trim() : "";
    if (!trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) {
      errors.push("apiUrl debe ser una URL http(s) válida");
    } else {
      next.apiUrl = trimmedUrl;
    }
  }

  if (patch.apiKey !== undefined) {
    if (typeof patch.apiKey !== "string" || patch.apiKey.trim().length < 8) {
      errors.push("apiKey debe tener al menos 8 caracteres");
    } else {
      next.apiKey = patch.apiKey.trim();
    }
  }

  if (patch.intervalMin !== undefined) {
    const n = Number(patch.intervalMin);
    if (!ALLOWED_INTERVALS.includes(n)) {
      errors.push("intervalMin debe ser 5, 15, 30 o 60");
    } else {
      next.intervalMin = n;
    }
  }

  if (patch.db !== undefined) {
    if (typeof patch.db !== "object" || !patch.db) {
      errors.push("db debe ser un objeto");
    } else {
      const db = { ...(current.db ?? {}), ...patch.db };
      if (!ALLOWED_DB_TYPES.includes(String(db.type ?? "").toLowerCase())) {
        errors.push(`db.type debe ser uno de: ${ALLOWED_DB_TYPES.join(", ")}`);
      }
      if (db.type !== "mock") {
        if (!db.host || typeof db.host !== "string") errors.push("db.host requerido");
        if (!db.database || typeof db.database !== "string") errors.push("db.database requerido");
        if (!db.user || typeof db.user !== "string") errors.push("db.user requerido");
        if (db.port !== undefined && db.port !== null && db.port !== "") {
          const p = Number(db.port);
          if (!Number.isInteger(p) || p < 1 || p > 65535) errors.push("db.port inválido (1..65535)");
          else db.port = p;
        }
      }
      next.db = db;
    }
  }

  if (patch.mapping !== undefined) {
    if (typeof patch.mapping !== "object" || !patch.mapping) {
      errors.push("mapping debe ser un objeto");
    } else {
      const m = { ...(current.mapping ?? {}), ...patch.mapping };
      for (const k of ["table", "sku", "name", "price", "stock"]) {
        if (m[k] !== undefined) {
          if (typeof m[k] !== "string" || !IDENT_RE.test(m[k].trim())) {
            errors.push(
              `mapping.${k}: sólo letras, números y _ (admite schema.tabla). Recibido: "${m[k]}"`,
            );
          } else {
            m[k] = m[k].trim();
          }
        }
      }
      next.mapping = m;
    }
  }

  if (patch.logging !== undefined && typeof patch.logging === "object") {
    next.logging = { ...(current.logging ?? {}), ...patch.logging };
  }

  return { ok: errors.length === 0, errors, cfg: next };
}

export function maskSensitiveConfig(cfg) {
  const out = JSON.parse(JSON.stringify(cfg));
  if (out.apiKey && typeof out.apiKey === "string" && out.apiKey !== "REEMPLAZA_CON_TU_API_KEY") {
    const k = out.apiKey;
    out.apiKey = k.length <= 4 ? "••••" : "••••••••" + k.slice(-4);
    out._apiKeySet = true;
  } else {
    out._apiKeySet = false;
  }
  if (out.db && typeof out.db.password === "string" && out.db.password.length > 0) {
    out.db.password = "••••••••";
    out._dbPasswordSet = true;
  } else {
    out._dbPasswordSet = false;
  }
  return out;
}

export function configFileExists(path) {
  return existsSync(path);
}

/**
 * Validación de "config lista para sincronizar". Distinta de
 * `validateAndMergeConfig`, que valida sintaxis al guardar.
 * Esta verifica que el agente puede iniciar el loop con seguridad:
 *   - apiKey real (no placeholder, ≥8 chars)
 *   - apiUrl http(s)
 *   - db.host + db.database + db.user si type≠mock
 *
 * Retorna { ok, issues: [{field, message}] }. Se usa en /api/health y al
 * arrancar para mostrar mensaje claro al usuario en lugar de fallar mudo.
 */
export function validateRuntimeConfig(cfg) {
  const issues = [];
  if (!cfg || typeof cfg !== "object") {
    return { ok: false, issues: [{ field: "*", message: "Configuración no cargada" }] };
  }
  if (!cfg.apiUrl || !/^https?:\/\//i.test(String(cfg.apiUrl))) {
    issues.push({ field: "apiUrl", message: "Falta la URL de LinkServi (debe iniciar con http:// o https://)" });
  }
  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : "";
  if (!apiKey || apiKey === "REEMPLAZA_CON_TU_API_KEY" || apiKey.length < 8) {
    issues.push({ field: "apiKey", message: "Falta tu API Key (pégala desde el panel de LinkServi)" });
  }
  const dbType = String(cfg.db?.type ?? "").toLowerCase();
  if (dbType !== "mock") {
    if (!cfg.db?.host) issues.push({ field: "db.host", message: "Falta el host de SAINT (ej: localhost)" });
    if (!cfg.db?.database) issues.push({ field: "db.database", message: "Falta el nombre de la base de datos SAINT" });
    if (!cfg.db?.user) issues.push({ field: "db.user", message: "Falta el usuario de SAINT" });
    // M2 — sin contraseña la auto-activación dispara y falla en login. Bloqueamos antes.
    if (!cfg.db?.password) issues.push({ field: "db.password", message: "Falta la contraseña de SAINT" });
  }
  return { ok: issues.length === 0, issues };
}
