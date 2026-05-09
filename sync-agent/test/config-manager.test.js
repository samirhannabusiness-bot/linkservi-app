// Tests del config-manager. Ejecutar: `node test/config-manager.test.js`.
// Cubre: validateAndMergeConfig (apiUrl, apiKey, intervalMin, db, mapping),
//        maskSensitiveConfig.

import assert from "node:assert/strict";
import { validateAndMergeConfig, maskSensitiveConfig } from "../src/config-manager.js";

const BASE = {
  apiUrl: "https://linkservi.com",
  apiKey: "old-key-1234",
  intervalMin: 15,
  db: { type: "sqlserver", host: "localhost", port: 1433, user: "sa", password: "x", database: "SAINT_DB" },
  mapping: { table: "productos", sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" },
};

let pass = 0, fail = 0;
const queue = [];
function test(name, fn) {
  queue.push(async () => {
    try { await fn(); console.log(`✓ ${name}`); pass++; }
    catch (err) { console.error(`✗ ${name}\n   ${err.message}`); fail++; }
  });
}

// ── apiUrl ───────────────────────────────────────────────────────────────────
test("apiUrl: rechaza string vacío", () => {
  const r = validateAndMergeConfig(BASE, { apiUrl: "" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(" ").toLowerCase().includes("apiurl"));
});
test("apiUrl: rechaza protocolo no http(s)", () => {
  const r = validateAndMergeConfig(BASE, { apiUrl: "ftp://x.com" });
  assert.equal(r.ok, false);
});
test("apiUrl: acepta http y https y trim espacios", () => {
  const r = validateAndMergeConfig(BASE, { apiUrl: "  https://api.example.com  " });
  assert.equal(r.ok, true);
  assert.equal(r.cfg.apiUrl, "https://api.example.com");
});

// ── apiKey ───────────────────────────────────────────────────────────────────
test("apiKey: rechaza menos de 8 caracteres", () => {
  const r = validateAndMergeConfig(BASE, { apiKey: "abc" });
  assert.equal(r.ok, false);
});
test("apiKey: acepta string ≥8 chars y la trimea", () => {
  const r = validateAndMergeConfig(BASE, { apiKey: "  validkey1234  " });
  assert.equal(r.ok, true);
  assert.equal(r.cfg.apiKey, "validkey1234");
});

// ── intervalMin ──────────────────────────────────────────────────────────────
test("intervalMin: solo acepta 5/15/30/60", () => {
  for (const v of [5, 15, 30, 60]) {
    const r = validateAndMergeConfig(BASE, { intervalMin: v });
    assert.equal(r.ok, true, `intervalMin=${v} debería ser válido`);
    assert.equal(r.cfg.intervalMin, v);
  }
});
test("intervalMin: rechaza 1 y 120", () => {
  for (const v of [1, 7, 90, 120]) {
    const r = validateAndMergeConfig(BASE, { intervalMin: v });
    assert.equal(r.ok, false, `intervalMin=${v} debería ser inválido`);
  }
});

// ── db ───────────────────────────────────────────────────────────────────────
test("db.type: rechaza tipos no soportados", () => {
  const r = validateAndMergeConfig(BASE, { db: { type: "mysql" } });
  assert.equal(r.ok, false);
});
test("db.type: acepta sqlserver, mssql, firebird, mock", () => {
  for (const t of ["sqlserver", "mssql", "firebird", "mock"]) {
    const r = validateAndMergeConfig(BASE, { db: { ...BASE.db, type: t } });
    if (t === "mock") {
      assert.equal(r.ok, true, `db.type=${t}`);
    } else {
      // Para tipos != mock requiere host/database/user — los pasamos en BASE.
      assert.equal(r.ok, true, `db.type=${t} con host/db/user válidos: ${r.errors?.join("·")}`);
    }
  }
});
test("db: type=sqlserver requiere host, database, user", () => {
  const r = validateAndMergeConfig(BASE, { db: { type: "sqlserver", host: "", database: "", user: "" } });
  assert.equal(r.ok, false);
  const all = r.errors.join(" ");
  assert.ok(all.includes("host"));
  assert.ok(all.includes("database"));
  assert.ok(all.includes("user"));
});
test("db: type=mock NO requiere host/database/user", () => {
  const r = validateAndMergeConfig(BASE, { db: { type: "mock" } });
  assert.equal(r.ok, true);
});
test("db.port: rechaza fuera de rango", () => {
  const r = validateAndMergeConfig(BASE, { db: { ...BASE.db, port: 70000 } });
  assert.equal(r.ok, false);
});
test("db.port: acepta string numérico y lo convierte", () => {
  const r = validateAndMergeConfig(BASE, { db: { ...BASE.db, port: "1433" } });
  assert.equal(r.ok, true);
  assert.equal(r.cfg.db.port, 1433);
});
test("db: merge conserva password si no se envía", () => {
  const r = validateAndMergeConfig(BASE, { db: { ...BASE.db, host: "newhost" } });
  assert.equal(r.ok, true);
  assert.equal(r.cfg.db.password, "x");
  assert.equal(r.cfg.db.host, "newhost");
});

// ── mapping ──────────────────────────────────────────────────────────────────
test("mapping: rechaza identificador con punto+coma (injection)", () => {
  const r = validateAndMergeConfig(BASE, { mapping: { ...BASE.mapping, table: "productos; DROP TABLE x" } });
  assert.equal(r.ok, false);
});
test("mapping: rechaza identificador con espacios", () => {
  const r = validateAndMergeConfig(BASE, { mapping: { ...BASE.mapping, sku: "co digo" } });
  assert.equal(r.ok, false);
});
test("mapping: acepta schema.tabla", () => {
  const r = validateAndMergeConfig(BASE, { mapping: { ...BASE.mapping, table: "dbo.Productos" } });
  assert.equal(r.ok, true);
  assert.equal(r.cfg.mapping.table, "dbo.Productos");
});
test("mapping: rechaza tres niveles", () => {
  const r = validateAndMergeConfig(BASE, { mapping: { ...BASE.mapping, table: "db.dbo.tabla" } });
  assert.equal(r.ok, false);
});

// ── maskSensitiveConfig ──────────────────────────────────────────────────────
test("mask: oculta apiKey dejando últimos 4", () => {
  const m = maskSensitiveConfig({ ...BASE, apiKey: "my-supersecret-key-9876" });
  assert.equal(m._apiKeySet, true);
  assert.ok(m.apiKey.endsWith("9876"));
  assert.ok(m.apiKey.startsWith("•"));
});
test("mask: marca apiKey vacía como NO seteada", () => {
  const m = maskSensitiveConfig({ ...BASE, apiKey: "REEMPLAZA_CON_TU_API_KEY" });
  assert.equal(m._apiKeySet, false);
});
test("mask: oculta password de db si está seteada", () => {
  const m = maskSensitiveConfig(BASE);
  assert.equal(m.db.password, "••••••••");
  assert.equal(m._dbPasswordSet, true);
});
test("mask: marca password vacío como NO seteado", () => {
  const m = maskSensitiveConfig({ ...BASE, db: { ...BASE.db, password: "" } });
  assert.equal(m._dbPasswordSet, false);
});
test("mask: NO muta el config original", () => {
  const original = JSON.parse(JSON.stringify(BASE));
  maskSensitiveConfig(BASE);
  assert.deepEqual(BASE, original);
});

(async () => {
  for (const r of queue) await r();
  const total = pass + fail;
  console.log(`\n${pass}/${total} pasaron · ${fail} fallaron`);
  process.exit(fail === 0 ? 0 : 1);
})();
