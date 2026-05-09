// Abre una URL en el navegador por defecto del sistema.
// Sin dependencias — usa `child_process.spawn` con el comando nativo.
//
// Hardening de seguridad:
//   - Validamos con `new URL()` (parser real, no regex).
//   - Solo permitimos protocolos http/https (sin file://, javascript:, etc.).
//   - Rechazamos cualquier URL que contenga metacaracteres peligrosos para
//     `cmd.exe` (`&`, `|`, `^`, `<`, `>`, `"`, comillas, backticks, %).
//     Aunque hoy solo invocamos esta función con URLs locales construidas
//     internamente (`http://127.0.0.1:7777`), mantenemos el helper seguro
//     para reutilización futura.
//
// Windows: `cmd /c start "" "<url>"` (el segundo arg vacío es el TÍTULO,
//          requerido para que `start` no confunda con una URL con espacios).
// macOS:   `open <url>`
// Linux:   `xdg-open <url>`

import { spawn } from "node:child_process";
import { platform } from "node:os";

// Regex de caracteres prohibidos en cmd: shell metacharacters + control chars.
const CMD_DANGEROUS = /[&|^<>"`%\u0000-\u001F]/;

export function openUrl(url) {
  if (typeof url !== "string") {
    return Promise.reject(new Error("URL inválida (no string)"));
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error("URL malformada"));
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Promise.reject(new Error(`Protocolo no permitido: ${parsed.protocol}`));
  }
  if (CMD_DANGEROUS.test(url)) {
    return Promise.reject(new Error("URL contiene caracteres no permitidos"));
  }

  return new Promise((resolve, reject) => {
    let cmd, args;
    const plat = platform();
    if (plat === "win32") {
      cmd = "cmd";
      // Quoting defensivo: el "" es el title vacío y la URL va entre comillas.
      args = ["/c", "start", "", url];
    } else if (plat === "darwin") {
      cmd = "open";
      args = [url];
    } else {
      cmd = "xdg-open";
      args = [url];
    }
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", reject);
      child.unref();
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
