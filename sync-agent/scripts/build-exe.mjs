#!/usr/bin/env node
// Construye el ejecutable Windows único usando @yao-pkg/pkg.
//
// Salida: dist/linkservi-sync-agent.exe
//
// Notas:
//   - Cross-compile desde Linux/macOS funciona porque pkg descarga binarios
//     pre-compilados de Node para el target (node22-win-x64).
//   - La primera vez tarda ~1min en bajar el binario (cacheado en ~/.pkg-cache).
//   - El .exe resultante incluye Node.js + nuestro código + assets (ui/ y
//     config.example.json). Tamaño esperado: ~50MB.
//   - El .exe NO incluye config.json (cada cliente tiene la suya).

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG_BIN = resolve(ROOT, "node_modules", ".bin", "pkg");
const ENTRY = resolve(ROOT, "src", "index.js");
const OUT_DIR = resolve(ROOT, "dist");
const OUT_FILE = resolve(OUT_DIR, "linkservi-sync-agent.exe");

if (!existsSync(PKG_BIN)) {
  console.error("✘ @yao-pkg/pkg no instalado. Corre `npm install` primero.");
  process.exit(1);
}

console.log("──────── Build .exe ────────");
console.log(`  entry  : ${ENTRY}`);
console.log(`  target : node22-win-x64`);
console.log(`  output : ${OUT_FILE}`);
console.log("");

const result = spawnSync(PKG_BIN, [
  ENTRY,
  "--target", "node22-win-x64",
  "--output", OUT_FILE,
  "--compress", "GZip",
], { cwd: ROOT, stdio: "inherit" });

if (result.status !== 0) {
  console.error(`✘ pkg falló con código ${result.status}`);
  process.exit(result.status ?? 1);
}

if (!existsSync(OUT_FILE)) {
  console.error(`✘ no se generó ${OUT_FILE}`);
  process.exit(1);
}

const sizeMb = (statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ ${OUT_FILE} generado (${sizeMb} MB)\n`);
console.log("Próximo paso: `npm run build:installer` para crear el instalador NSIS.");
