// Tests del error-mapper: cada rama del switch traduce a un mensaje amigable.
// Ejecutar: `node test/error-mapper.test.js`.

import assert from "node:assert/strict";
import { friendlyError } from "../src/error-mapper.js";

let pass = 0, fail = 0;
const queue = [];
function test(name, fn) {
  queue.push(async () => {
    try { await fn(); console.log(`✓ ${name}`); pass++; }
    catch (err) { console.error(`✗ ${name}\n   ${err.message}`); fail++; }
  });
}

function makeErr({ message = "", code = "", causeMessage = "", causeCode = "" } = {}) {
  const err = new Error(message);
  if (code) err.code = code;
  if (causeMessage || causeCode) {
    err.cause = new Error(causeMessage);
    if (causeCode) err.cause.code = causeCode;
  }
  return err;
}

// ── Red / DNS ────────────────────────────────────────────────────────────────
test("ENOTFOUND → 'No se encuentra el servidor'", () => {
  const f = friendlyError(makeErr({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND mi-host" }));
  assert.match(f.title, /No se encuentra el servidor/i);
});
test("ECONNREFUSED → 'rechazó la conexión'", () => {
  const f = friendlyError(makeErr({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:1433" }));
  assert.match(f.title, /rechaz/i);
});
test("ETIMEDOUT → 'tardó demasiado'", () => {
  const f = friendlyError(makeErr({ code: "ETIMEDOUT", message: "connect ETIMEDOUT" }));
  assert.match(f.title, /tard/i);
});
test("texto 'timeout' (sin code) también detecta timeout", () => {
  const f = friendlyError(makeErr({ message: "Request timeout after 30s" }));
  assert.match(f.title, /tard/i);
});

// ── Auth SQL Server ──────────────────────────────────────────────────────────
test("'Login failed' → 'Usuario o contraseña incorrectos'", () => {
  const f = friendlyError(makeErr({ message: "Login failed for user 'sa'" }));
  assert.match(f.title, /Usuario o contrase/i);
});
test("'Cannot open database' → 'La base de datos no existe'", () => {
  const f = friendlyError(makeErr({ message: "Cannot open database \"X\" requested by login" }));
  assert.match(f.title, /base de datos no existe/i);
});

// ── Esquema / mapping ────────────────────────────────────────────────────────
test("'Invalid object name' → 'tabla o columna no existe'", () => {
  const f = friendlyError(makeErr({ message: "Invalid object name 'productos'" }));
  assert.match(f.title, /tabla o columna no existe/i);
});
test("'Invalid column name' → mensaje específico de columna", () => {
  const f = friendlyError(makeErr({ message: "Invalid column name 'codigoX'" }));
  assert.match(f.title, /columna del mapping no existe/i);
});
test("'identificador SQL inválido' → mensaje sobre caracteres no permitidos", () => {
  const f = friendlyError(makeErr({ message: "identificador SQL inválido: 'foo;bar'" }));
  assert.match(f.title, /caracteres no permitidos/i);
});

// ── Backend LinkServi ────────────────────────────────────────────────────────
test("HTTP 401 → 'API Key inválida o ausente'", () => {
  const f = friendlyError(makeErr({ message: "HTTP 401 Unauthorized" }));
  assert.match(f.title, /API Key/i);
});
test("HTTP 422 → 'aún no tiene tienda configurada'", () => {
  const f = friendlyError(makeErr({ message: "HTTP 422 Unprocessable" }));
  assert.match(f.title, /tienda/i);
});
test("HTTP 429 → 'reduce la frecuencia'", () => {
  const f = friendlyError(makeErr({ message: "HTTP 429 rate limit excedido" }));
  assert.match(f.title, /frecuencia/i);
});
test("HTTP 500 → 'servidor de LinkServi tuvo un error'", () => {
  const f = friendlyError(makeErr({ message: "HTTP 500 Internal Server Error" }));
  assert.match(f.title, /servidor de LinkServi/i);
});
test("'fetch failed' → 'No hay conexión a LinkServi'", () => {
  const f = friendlyError(makeErr({ message: "fetch failed" }));
  assert.match(f.title, /No hay conexi/i);
});

// ── Adapter no implementado ──────────────────────────────────────────────────
test("'Firebird aún no implementado' → mensaje de no soportado", () => {
  const f = friendlyError(makeErr({ message: "Tipo no soportado: firebird" }));
  assert.match(f.title, /no soportado/i);
});

// ── Defaults ─────────────────────────────────────────────────────────────────
test("Error desconocido → fallback 'Ocurrió un error'", () => {
  const f = friendlyError(makeErr({ message: "Algo super raro pasó X" }));
  assert.match(f.title, /Ocurri/i);
  assert.equal(f.detail, "Algo super raro pasó X");
});
test("null → 'Error desconocido'", () => {
  const f = friendlyError(null);
  assert.match(f.title, /Error desconocido/i);
});

// ── Causa anidada ────────────────────────────────────────────────────────────
test("error.cause.code='ENOTFOUND' detectado vía cause", () => {
  const f = friendlyError(makeErr({ message: "wrapper", causeCode: "ENOTFOUND", causeMessage: "x" }));
  assert.match(f.title, /No se encuentra el servidor/i);
});

// ── raw siempre presente ─────────────────────────────────────────────────────
test("siempre incluye `raw` con el message original", () => {
  const f = friendlyError(makeErr({ message: "Invalid object name X" }));
  assert.equal(f.raw, "Invalid object name X");
});

(async () => {
  for (const r of queue) await r();
  const total = pass + fail;
  console.log(`\n${pass}/${total} pasaron · ${fail} fallaron`);
  process.exit(fail === 0 ? 0 : 1);
})();
