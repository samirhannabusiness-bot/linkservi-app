// Runner secuencial de todos los tests del Sync Agent.
// Ejecuta cada archivo en su propio child_process para aislar estado y exit codes.
// Uso: `npm test` (definido en package.json).

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTS = [
  "saint-client.test.js",
  "config-manager.test.js",
  "error-mapper.test.js",
  "retry.test.js",
  "log-buffer.test.js",
  "db-introspect.test.js",
];

function runOne(file) {
  return new Promise((resolveRun) => {
    const proc = spawn(process.execPath, [resolve(__dirname, file)], {
      stdio: "inherit",
    });
    proc.on("close", (code) => resolveRun(code === 0));
  });
}

(async () => {
  console.log(`\n──────── Sync Agent · ${TESTS.length} suites ────────`);
  let okCount = 0;
  for (const f of TESTS) {
    console.log(`\n▶ ${f}`);
    const ok = await runOne(f);
    if (ok) okCount++;
    else console.error(`  ✗ ${f} falló`);
  }
  console.log(`\n──────── ${okCount}/${TESTS.length} suites OK ────────\n`);
  process.exit(okCount === TESTS.length ? 0 : 1);
})();
