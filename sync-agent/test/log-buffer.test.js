// Tests del log-buffer (ring buffer in-memory para la UI).
// Ejecutar: `node test/log-buffer.test.js`.

import assert from "node:assert/strict";
import { pushLogEvent, getRecentLogs, subscribe, clearLogs } from "../src/log-buffer.js";

let pass = 0, fail = 0;
const queue = [];
function test(name, fn) {
  queue.push(async () => {
    try { clearLogs(); await fn(); console.log(`✓ ${name}`); pass++; }
    catch (err) { console.error(`✗ ${name}\n   ${err.message}`); fail++; }
  });
}

// ── push & get ───────────────────────────────────────────────────────────────
test("pushLogEvent: asigna id incremental, ts ISO y devuelve el evento", () => {
  const a = pushLogEvent({ level: "info", message: "primero" });
  const b = pushLogEvent({ level: "warn", message: "segundo" });
  assert.equal(typeof a.id, "number");
  assert.ok(b.id > a.id);
  assert.match(a.ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(a.level, "info");
  assert.equal(a.message, "primero");
});

test("pushLogEvent: meta es null si no se pasa, copia si se pasa", () => {
  const a = pushLogEvent({ level: "info", message: "x" });
  const b = pushLogEvent({ level: "info", message: "y", meta: { foo: 1 } });
  assert.equal(a.meta, null);
  assert.deepEqual(b.meta, { foo: 1 });
});

test("getRecentLogs: sin sinceId devuelve los últimos hasta limit", () => {
  for (let i = 0; i < 10; i++) pushLogEvent({ level: "info", message: `m${i}` });
  const recent = getRecentLogs({ limit: 5 });
  assert.equal(recent.length, 5);
  assert.equal(recent[4].message, "m9");
});

test("getRecentLogs: sinceId filtra eventos posteriores", () => {
  const first = pushLogEvent({ level: "info", message: "a" });
  pushLogEvent({ level: "info", message: "b" });
  pushLogEvent({ level: "info", message: "c" });
  const after = getRecentLogs({ sinceId: first.id });
  assert.equal(after.length, 2);
  assert.equal(after[0].message, "b");
});

// ── ring buffer (tope de 200) ────────────────────────────────────────────────
test("ring: descarta los más viejos al pasar de 200", () => {
  for (let i = 0; i < 250; i++) pushLogEvent({ level: "info", message: `n${i}` });
  const all = getRecentLogs({ limit: 1000 });
  assert.equal(all.length, 200);
  // El primero retenido debería ser el evento #50 (250-200).
  assert.equal(all[0].message, "n50");
  assert.equal(all[199].message, "n249");
});

// ── subscribers ──────────────────────────────────────────────────────────────
test("subscribe: notifica cada nuevo evento", () => {
  const received = [];
  const unsub = subscribe((evt) => received.push(evt.message));
  pushLogEvent({ level: "info", message: "uno" });
  pushLogEvent({ level: "info", message: "dos" });
  unsub();
  pushLogEvent({ level: "info", message: "tres" });
  assert.deepEqual(received, ["uno", "dos"]);
});

test("subscribe: subscriber que tira error NO rompe el push", () => {
  subscribe(() => { throw new Error("boom"); });
  // No debe propagar
  const evt = pushLogEvent({ level: "info", message: "robust" });
  assert.equal(evt.message, "robust");
});

// ── clearLogs ────────────────────────────────────────────────────────────────
test("clearLogs: deja el buffer vacío (pero los ids siguen creciendo)", () => {
  const a = pushLogEvent({ level: "info", message: "uno" });
  clearLogs();
  assert.equal(getRecentLogs().length, 0);
  const b = pushLogEvent({ level: "info", message: "dos" });
  assert.ok(b.id > a.id, "los ids siguen siendo monotónicos tras clear");
});

(async () => {
  for (const r of queue) await r();
  const total = pass + fail;
  console.log(`\n${pass}/${total} pasaron · ${fail} fallaron`);
  process.exit(fail === 0 ? 0 : 1);
})();
