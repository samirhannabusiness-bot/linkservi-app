// Smoke test del saint-client. Ejecutar con: `node test/saint-client.test.js`
// No requiere framework — usa node:assert. Verifica:
//   1. quoteIdent rechaza injection y acepta nombres válidos / schema.tabla
//   2. normalizeRow lee claves canonical (sku/name/price/stock)
//   3. isValidNormalized descarta filas inválidas
//   4. Adapter sqlserver construye la query con los aliases correctos a partir
//      del mapping del cliente
//   5. Pipeline mock end-to-end devuelve productos válidos

import assert from "node:assert/strict";
import {
  createSaintClient,
  quoteIdent,
  normalizeRow,
  isValidNormalized,
  resolveMapping,
} from "../src/saint-client.js";

const silentLogger = {
  info() {}, warn() {}, error() {}, debug() {}, banner() {},
};

let pass = 0;
let fail = 0;
const queue = [];
function test(name, fn) {
  queue.push(async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      pass++;
    } catch (err) {
      console.error(`✗ ${name}\n   ${err.message}`);
      fail++;
    }
  });
}

// ── 1. quoteIdent ─────────────────────────────────────────────────────────────
test("quoteIdent: rechaza SQL injection en nombre de tabla", () => {
  assert.throws(() => quoteIdent("productos; DROP TABLE users--"));
});

test("quoteIdent: acepta identificador simple y lo bracketea", () => {
  assert.equal(quoteIdent("productos"), "[productos]");
});

test("quoteIdent: acepta schema.tabla", () => {
  assert.equal(quoteIdent("dbo.Productos"), "[dbo].[Productos]");
});

test("quoteIdent: rechaza nombre que empieza con número", () => {
  assert.throws(() => quoteIdent("1invalid"));
});

test("quoteIdent: rechaza tres niveles", () => {
  assert.throws(() => quoteIdent("db.dbo.tabla"));
});

// ── 2. normalizeRow ───────────────────────────────────────────────────────────
test("normalizeRow: lee claves canonical (sku/name/price/stock)", () => {
  const row = { sku: " ABC-123 ", name: " Producto X ", price: "12.50", stock: "8" };
  const p = normalizeRow(row);
  assert.deepEqual(p, { sku: "ABC-123", name: "Producto X", price: 12.5, stock: 8 });
});

test("normalizeRow: ignora claves originales del mapping (las aliases ganan)", () => {
  // Si por error vienen ambas, normalize SÓLO mira las canonical.
  const row = { codigo: "OLD", sku: "NEW", descripcion: "ignorar", name: "Real", price: 1, stock: 1 };
  const p = normalizeRow(row);
  assert.equal(p.sku, "NEW");
  assert.equal(p.name, "Real");
});

test("normalizeRow: maneja nulls y devuelve campos inválidos", () => {
  const p = normalizeRow({ sku: null, name: null, price: null, stock: null });
  assert.equal(p.sku, "");
  assert.equal(p.name, "");
  assert.ok(Number.isNaN(p.price));
});

// ── 3. isValidNormalized ──────────────────────────────────────────────────────
test("isValidNormalized: válido = sku, name, price≥0, stock≥0 finitos", () => {
  assert.ok(isValidNormalized({ sku: "A", name: "X", price: 0, stock: 0 }));
});
test("isValidNormalized: rechaza price negativo", () => {
  assert.ok(!isValidNormalized({ sku: "A", name: "X", price: -1, stock: 0 }));
});
test("isValidNormalized: rechaza price NaN", () => {
  assert.ok(!isValidNormalized({ sku: "A", name: "X", price: NaN, stock: 0 }));
});
test("isValidNormalized: rechaza sku/name vacío", () => {
  assert.ok(!isValidNormalized({ sku: "", name: "X", price: 1, stock: 0 }));
  assert.ok(!isValidNormalized({ sku: "A", name: "", price: 1, stock: 0 }));
});

// ── 4. SQL adapter — construcción de query con mapping del cliente ────────────
test("sqlserver adapter: construye SELECT con aliases canonical desde mapping", () => {
  const adapter = createSaintClient(
    { type: "sqlserver", host: "x", database: "d", user: "u", password: "p" },
    { table: "productos", sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" },
    silentLogger,
  );
  assert.equal(
    adapter.query,
    "SELECT [codigo] AS sku, [descripcion] AS name, [precio] AS price, [existencia] AS stock FROM [productos]",
  );
});

test("sqlserver adapter: respeta nombres de columna distintos al default", () => {
  const adapter = createSaintClient(
    { type: "sqlserver", host: "x", database: "d", user: "u", password: "p" },
    { table: "dbo.Items", sku: "ItemCode", name: "ItemName", price: "UnitPrice", stock: "QtyOnHand" },
    silentLogger,
  );
  assert.equal(
    adapter.query,
    "SELECT [ItemCode] AS sku, [ItemName] AS name, [UnitPrice] AS price, [QtyOnHand] AS stock FROM [dbo].[Items]",
  );
});

test("sqlserver adapter: falla si mapping tiene identificador inseguro", () => {
  assert.throws(() => createSaintClient(
    { type: "sqlserver", host: "x", database: "d", user: "u", password: "p" },
    { table: "productos; DROP", sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" },
    silentLogger,
  ));
});

// ── 5. Pipeline simulado: recordset → normalize → válidos ────────────────────
test("pipeline: recordset SQL Server aliasado → 3 válidos / 1 descartado", () => {
  // Lo que mssql devolvería tras `SELECT [codigo] AS sku, ... FROM [productos]`:
  const fakeRecordset = [
    { sku: "SAINT-001", name: "Harina P.A.N.", price: 1.85, stock: 480 },
    { sku: "SAINT-002", name: "Aceite Mazeite", price: 3.4, stock: 210 },
    { sku: "", name: "FILA SIN SKU", price: 1, stock: 1 }, // inválido
    { sku: "SAINT-003", name: "Pan canilla", price: 0.8, stock: 120 },
  ];
  const valid = [];
  let skipped = 0;
  for (const row of fakeRecordset) {
    const p = normalizeRow(row);
    if (isValidNormalized(p)) valid.push(p);
    else skipped++;
  }
  assert.equal(valid.length, 3);
  assert.equal(skipped, 1);
  assert.equal(valid[0].sku, "SAINT-001");
  assert.equal(valid[2].name, "Pan canilla");
});

// ── 6. Mock adapter end-to-end ────────────────────────────────────────────────
test("mock adapter: connect → readCatalog → 30 productos válidos", async () => {
  const adapter = createSaintClient({ type: "mock" }, {}, silentLogger);
  await adapter.connect();
  const out = await adapter.readCatalog();
  assert.equal(out.length, 30);
  for (const p of out) {
    assert.ok(isValidNormalized(p), `producto inválido: ${JSON.stringify(p)}`);
  }
  await adapter.disconnect();
});

// ── 7. resolveMapping ─────────────────────────────────────────────────────────
test("resolveMapping: aplica defaults sensatos", () => {
  const m = resolveMapping({});
  assert.equal(m.table, "productos");
  assert.equal(m.sku, "codigo");
  assert.equal(m.name, "descripcion");
  assert.equal(m.price, "precio");
  assert.equal(m.stock, "existencia");
});

test("resolveMapping: rechaza string vacío", () => {
  assert.throws(() => resolveMapping({ table: "" }));
});

// ── 8. Tipos no soportados ────────────────────────────────────────────────────
test("createSaintClient: tipo no soportado lanza error claro", () => {
  assert.throws(() => createSaintClient({ type: "mysql" }, {}, silentLogger));
});

// ── Runner async secuencial: ejecuta y AWAITA cada test antes de imprimir ────
(async () => {
  for (const run of queue) await run();
  const total = pass + fail;
  console.log(`\n${pass}/${total} pasaron · ${fail} fallaron`);
  process.exit(fail === 0 ? 0 : 1);
})();
