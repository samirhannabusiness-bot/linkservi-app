#!/usr/bin/env node
// Construye el instalador Windows (NSIS) tomando el .exe del agente.
//
// Pre-requisito: `npm run build:exe` (debe existir dist/linkservi-sync-agent.exe).
// Pre-requisito: `makensis` instalado en el sistema.
//   - Linux/Replit: paquete `nsis` (Nix)
//   - macOS:        `brew install makensis`
//   - Windows:      https://nsis.sourceforge.io/Download
//
// Salida: dist/LinkServi-Sync-Agent-Setup.exe

import { spawnSync } from "node:child_process";
import { existsSync, statSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG_JSON = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const VERSION = PKG_JSON.version;
const NSI_FILE = resolve(ROOT, "installer", "installer.nsi");
const EXE_FILE = resolve(ROOT, "dist", "linkservi-sync-agent.exe");
const EXAMPLE_CONFIG = resolve(ROOT, "config.example.json");
const LICENSE_FILE = resolve(ROOT, "installer", "LICENSE.txt");
const OUT_FILE = resolve(ROOT, "dist", `LinkServi-Sync-Agent-Setup-${VERSION}.exe`);

console.log("──────── Build installer ────────");
console.log(`  script   : ${NSI_FILE}`);
console.log(`  app exe  : ${EXE_FILE}`);
console.log(`  output   : ${OUT_FILE}`);
console.log("");

if (!existsSync(EXE_FILE)) {
  console.error(`✘ Falta ${EXE_FILE}. Corre primero: npm run build:exe`);
  process.exit(1);
}
if (!existsSync(NSI_FILE)) {
  console.error(`✘ Falta ${NSI_FILE}.`);
  process.exit(1);
}
if (!existsSync(LICENSE_FILE)) {
  // Crear license placeholder mínimo si no existe.
  writeFileSync(LICENSE_FILE, "LinkServi Sync Agent\n\nUso interno autorizado por LinkServi.\n", "utf8");
}

// makensis acepta `-D` (Unix) o `/D` (Windows). Usamos `-D` por compatibilidad.
const result = spawnSync("makensis", [
  `-DAPP_VERSION=${VERSION}`,
  `-DAPP_EXE=${EXE_FILE}`,
  `-DEXAMPLE_CONFIG=${EXAMPLE_CONFIG}`,
  `-DLICENSE_FILE=${LICENSE_FILE}`,
  `-DOUT_FILE=${OUT_FILE}`,
  NSI_FILE,
], { cwd: dirname(NSI_FILE), stdio: "inherit" });

if (result.error?.code === "ENOENT") {
  console.error("✘ `makensis` no encontrado en el PATH.");
  console.error("  Instálalo según tu OS:");
  console.error("    Linux/Replit (Nix) : nix-env -iA nixpkgs.nsis");
  console.error("    macOS              : brew install makensis");
  console.error("    Windows            : https://nsis.sourceforge.io/Download");
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`✘ makensis falló con código ${result.status}`);
  process.exit(result.status ?? 1);
}

if (!existsSync(OUT_FILE)) {
  console.error(`✘ no se generó ${OUT_FILE}`);
  process.exit(1);
}

const sizeMb = (statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ ${OUT_FILE} generado (${sizeMb} MB)\n`);

// T001 — Code signing (opcional). Si SIGN_CERT_PATH está definido, intentamos
// firmar tanto el .exe del agente como el instalador. Si no, salida soft con
// warning para no romper el build de devs.
const SIGN_SCRIPT = resolve(ROOT, "scripts", "sign-windows.sh");
if (process.env.SIGN_CERT_PATH) {
  console.log("──────── Code signing ────────");
  for (const target of [EXE_FILE, OUT_FILE]) {
    const r = spawnSync("bash", [SIGN_SCRIPT, target], { stdio: "inherit" });
    if (r.status !== 0) {
      console.error(`✘ Firma falló para ${target}`);
      process.exit(r.status ?? 1);
    }
  }
  console.log("✔ Firmas aplicadas\n");
} else {
  console.log("⚠ Code signing no configurado — el ejecutable puede mostrar advertencias en Windows.");
  console.log("   Para firmar: define SIGN_CERT_PATH y SIGN_CERT_PASSWORD antes de correr este script.\n");
}

console.log("Distribuye este .exe a tus usuarios — instala con doble click.");
