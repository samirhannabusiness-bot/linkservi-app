// Tests para sync-agent/src/db-introspect.js — autoMapColumns + pickSuggestedTable.
// No requieren SQL Server real (las funciones de DB se testean con smoke aparte).

import { autoMapColumns, pickSuggestedTable } from "../src/db-introspect.js";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}
function eq(actual, expected, msg = "") {
  // Comparación profunda independiente del orden de claves en objetos planos.
  const a = sortStringify(actual), e = sortStringify(expected);
  if (a !== e) throw new Error(`${msg}\n      esperado: ${e}\n      recibido: ${a}`);
}
function sortStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(sortStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${sortStringify(v[k])}`).join(",")}}`;
}
function truthy(v, msg) { if (!v) throw new Error(msg ?? "esperado truthy"); }

console.log("\n── autoMapColumns ──");

test("schema SAINT clásico → mapping correcto y alta confianza", () => {
  const cols = ["codigo", "descripcion", "precio1", "existencia", "iva", "departamento"];
  const r = autoMapColumns(cols);
  eq(r.mapping.sku, "codigo", "sku");
  eq(r.mapping.name, "descripcion", "name");
  eq(r.mapping.price, "precio1", "price");
  eq(r.mapping.stock, "existencia", "stock");
  truthy(r.confidence.sku >= 0.9, "sku debería ser confianza alta");
  truthy(r.confidence.name >= 0.9, "name confianza alta");
  truthy(r.confidence.price >= 0.9, "price confianza alta");
  truthy(r.confidence.stock >= 0.9, "stock confianza alta");
});

test("schema en inglés → matches secundarios", () => {
  const cols = ["sku", "name", "price", "stock"];
  const r = autoMapColumns(cols);
  eq(r.mapping, { sku: "sku", name: "name", price: "price", stock: "stock" });
});

test("nombres ambiguos → toma el primero por orden", () => {
  // 'precio_venta' debería ganar a 'precio_costo' por el patrón específico
  const cols = ["id", "nombre", "precio_costo", "precio_venta", "cantidad"];
  const r = autoMapColumns(cols);
  eq(r.mapping.name, "nombre");
  eq(r.mapping.price, "precio_venta", "debería preferir precio_venta sobre precio_costo");
  eq(r.mapping.stock, "cantidad");
});

test("no encuentra → fallback con confidence 0", () => {
  const cols = ["foo", "bar", "baz"];
  const r = autoMapColumns(cols);
  eq(r.mapping, { sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" });
  eq(r.confidence, { sku: 0, name: 0, price: 0, stock: 0 });
});

test("no asigna la misma columna a dos campos", () => {
  // 'codigo' es el único candidato razonable, no debería usarse para name también
  const cols = ["codigo", "iva"];
  const r = autoMapColumns(cols);
  eq(r.mapping.sku, "codigo");
  // name no debería ser 'codigo' — debería caer al fallback
  truthy(r.mapping.name !== "codigo", "name no puede repetir sku");
  eq(r.mapping.name, "descripcion");
});

test("entrada vacía → todo fallback", () => {
  const r = autoMapColumns([]);
  eq(r.mapping, { sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" });
});

test("entrada inválida → fallback seguro", () => {
  const r = autoMapColumns(null);
  truthy(r.mapping.sku === "codigo");
});

test("candidates contiene el ranking ordenado", () => {
  const cols = ["sku", "codigo", "id"];
  const r = autoMapColumns(cols);
  truthy(Array.isArray(r.candidates.sku));
  truthy(r.candidates.sku.length >= 2, "debería listar al menos 2 candidatos sku");
  eq(r.candidates.sku[0].col, "sku", "sku exacto va primero");
});

test("schema SAINT VAD (co_art / des_art / inv) → mapping reconocido", () => {
  // Esquema típico de SAINT VAD para artículos.
  const cols = ["co_art", "des_art", "precio1", "inv", "iva"];
  const r = autoMapColumns(cols);
  eq(r.mapping.sku, "co_art");
  eq(r.mapping.name, "des_art");
  eq(r.mapping.price, "precio1");
  eq(r.mapping.stock, "inv");
  truthy(r.confidence.sku >= 0.9);
  truthy(r.confidence.stock >= 0.85);
});

test("schema con cod_art y exis (variantes con guión bajo)", () => {
  const cols = ["cod_art", "nom_art", "precio_venta", "exis"];
  const r = autoMapColumns(cols);
  eq(r.mapping.sku, "cod_art");
  eq(r.mapping.name, "nom_art");
  eq(r.mapping.price, "precio_venta");
  eq(r.mapping.stock, "exis");
});

test("colisión: precio1 vs precio2 → gana precio1 (lista A)", () => {
  const cols = ["codigo", "descripcion", "precio2", "precio1", "existencia"];
  const r = autoMapColumns(cols);
  eq(r.mapping.price, "precio1", "precio1 (95) debe ganar a precio2 (75)");
});

test("multi-precio sin precio1 → cae a precio2", () => {
  const cols = ["codigo", "descripcion", "precio3", "precio2", "existencia"];
  const r = autoMapColumns(cols);
  truthy(["precio2", "precio3"].includes(r.mapping.price), `esperado precio2 o precio3, recibido ${r.mapping.price}`);
});

test("ambigüedad sku/codigo: gana sku exacto pero codigo queda libre para otros", () => {
  // 'sku' y 'codigo' compiten para el slot sku — gana sku, codigo queda
  // disponible (no debería usarse para name/price/stock).
  const cols = ["sku", "codigo", "nombre", "precio", "stock"];
  const r = autoMapColumns(cols);
  eq(r.mapping.sku, "sku");
  eq(r.mapping.name, "nombre");
  eq(r.mapping.price, "precio");
  eq(r.mapping.stock, "stock");
  // Verificamos que ningún campo se quedó con 'codigo' por error.
  truthy(Object.values(r.mapping).every((v) => v !== "codigo"), "codigo no debería usarse");
});

test("schema con barcode → fallback razonable como sku", () => {
  // Si no hay codigo/sku, barcode puede usarse como referencia de SKU.
  const cols = ["barcode", "nombre", "precio", "stock"];
  const r = autoMapColumns(cols);
  eq(r.mapping.sku, "barcode");
  truthy(r.confidence.sku >= 0.5);
});

console.log("\n── pickSuggestedTable ──");

test("sugiere 'productos' si existe", () => {
  const t = [
    { schema: "dbo", name: "Categorias", qualified: "Categorias" },
    { schema: "dbo", name: "Productos", qualified: "Productos" },
    { schema: "dbo", name: "Ventas", qualified: "Ventas" },
  ];
  eq(pickSuggestedTable(t), "Productos");
});

test("sugiere 'articulos' como segunda opción", () => {
  const t = [
    { schema: "dbo", name: "Clientes", qualified: "Clientes" },
    { schema: "dbo", name: "Articulos", qualified: "Articulos" },
  ];
  eq(pickSuggestedTable(t), "Articulos");
});

test("contiene 'producto' (substring)", () => {
  const t = [
    { schema: "dbo", name: "Categorias", qualified: "Categorias" },
    { schema: "dbo", name: "Producto_Maestro", qualified: "Producto_Maestro" },
  ];
  eq(pickSuggestedTable(t), "Producto_Maestro");
});

test("ninguna coincide → primera de la lista", () => {
  const t = [
    { schema: "dbo", name: "Foo", qualified: "Foo" },
    { schema: "dbo", name: "Bar", qualified: "Bar" },
  ];
  eq(pickSuggestedTable(t), "Foo");
});

test("vacío → null", () => {
  eq(pickSuggestedTable([]), null);
});

console.log(`\n──────── ${pass} OK · ${fail} FAIL ────────\n`);
process.exit(fail === 0 ? 0 : 1);
