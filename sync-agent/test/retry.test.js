// Tests del retry helper. Ejecutar: `node test/retry.test.js`.

import assert from "node:assert/strict";
import { backoffDelay, sleep, withRetry } from "../src/retry.js";

let pass = 0, fail = 0;
const queue = [];
function test(name, fn) {
  queue.push(async () => {
    try { await fn(); console.log(`✓ ${name}`); pass++; }
    catch (err) { console.error(`✗ ${name}\n   ${err.message}`); fail++; }
  });
}

// ── backoffDelay ─────────────────────────────────────────────────────────────
test("backoffDelay: attempt=1 ronda 5s ±20%", () => {
  const samples = Array.from({ length: 50 }, () => backoffDelay(1));
  for (const s of samples) {
    assert.ok(s >= 4000 && s <= 6000, `delay attempt=1 fuera de rango: ${s}ms`);
  }
});
test("backoffDelay: attempt=2 ronda 10s", () => {
  const samples = Array.from({ length: 50 }, () => backoffDelay(2));
  for (const s of samples) {
    assert.ok(s >= 8000 && s <= 12000, `delay attempt=2 fuera de rango: ${s}ms`);
  }
});
test("backoffDelay: nunca excede maxMs (con cap)", () => {
  const samples = Array.from({ length: 100 }, () => backoffDelay(20, { maxMs: 60_000 }));
  // Cap es 60s + jitter ±20% → max ~72s
  for (const s of samples) {
    assert.ok(s <= 72_000, `delay con cap=60s pasó de 72s: ${s}ms`);
    assert.ok(s >= 48_000, `delay con cap=60s bajó de 48s: ${s}ms`);
  }
});
test("backoffDelay: mínimo 500ms aún con jitter negativo", () => {
  const samples = Array.from({ length: 200 }, () => backoffDelay(1, { baseMs: 100, maxMs: 1000 }));
  for (const s of samples) assert.ok(s >= 500, `delay bajo el mínimo: ${s}ms`);
});

// ── sleep ────────────────────────────────────────────────────────────────────
test("sleep: respeta el tiempo aproximado", async () => {
  const t0 = Date.now();
  await sleep(80);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 70 && elapsed < 250, `sleep(80) tomó ${elapsed}ms`);
});

// ── withRetry ────────────────────────────────────────────────────────────────
test("withRetry: éxito al primer intento NO espera", async () => {
  const t0 = Date.now();
  const r = await withRetry(async () => "ok", { maxAttempts: 3 });
  assert.equal(r, "ok");
  assert.ok(Date.now() - t0 < 200, "no debería haber esperado");
});
test("withRetry: reintenta hasta éxito", async () => {
  let attempts = 0;
  const r = await withRetry(async () => {
    attempts++;
    if (attempts < 3) throw new Error("transitorio");
    return "ganaste";
  }, { maxAttempts: 5, baseMs: 50, maxMs: 100 });
  assert.equal(r, "ganaste");
  assert.equal(attempts, 3);
});
test("withRetry: lanza el último error si agota intentos", async () => {
  let attempts = 0;
  await assert.rejects(async () => {
    await withRetry(async () => {
      attempts++;
      throw new Error(`fallo ${attempts}`);
    }, { maxAttempts: 3, baseMs: 50, maxMs: 100 });
  }, /fallo 3/);
  assert.equal(attempts, 3);
});
test("withRetry: invoca onAttempt antes de cada espera (no en el último)", async () => {
  const calls = [];
  await assert.rejects(async () => {
    await withRetry(async (n) => {
      throw new Error(`x${n}`);
    }, {
      maxAttempts: 3,
      baseMs: 50,
      maxMs: 100,
      onAttempt: (n, err, delay) => calls.push({ n, msg: err.message, delay }),
    });
  });
  // onAttempt se invoca tras intentos 1 y 2 (NO tras el 3 final).
  assert.equal(calls.length, 2);
  assert.equal(calls[0].n, 1);
  assert.equal(calls[0].msg, "x1");
  assert.ok(calls[0].delay >= 500); // backoff base 50 con minimo de 500ms
});

(async () => {
  for (const r of queue) await r();
  const total = pass + fail;
  console.log(`\n${pass}/${total} pasaron · ${fail} fallaron`);
  process.exit(fail === 0 ? 0 : 1);
})();
