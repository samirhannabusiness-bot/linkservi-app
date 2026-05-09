# LinkServi Sync Agent — Build & Distribución

Instrucciones para reconstruir el ejecutable Windows y el instalador.

> **Solo necesitas leer esto si vas a recompilar el agente.** Los usuarios
> finales reciben un instalador `.exe` listo para doble-click.

---

## Lo que producimos

| Archivo | Tamaño | Para quién |
|---|---|---|
| `dist/linkservi-sync-agent.exe` | ~50 MB | Devs / despliegue manual |
| `dist/LinkServi-Sync-Agent-Setup-X.Y.Z.exe` | ~15 MB | Usuarios finales |

El instalador embebe el agente comprimido + license + plantilla de config.

---

## Pre-requisitos

| Herramienta | Versión | Cómo se instala |
|---|---|---|
| Node.js | 18+ | nvm / instalador oficial |
| npm | 9+ | viene con Node |
| makensis | 3.x | Linux: `nix-env -iA nixpkgs.nsis` · macOS: `brew install makensis` · Windows: <https://nsis.sourceforge.io/Download> |

> **Cross-compile.** El build genera un `.exe` Windows desde **cualquier
> SO host** (Linux/macOS/Windows). `@yao-pkg/pkg` descarga binarios pre-compilados
> de Node para el target `node22-win-x64` la primera vez (cacheados en
> `~/.pkg-cache`). NSIS también cross-builda desde Linux y macOS.

---

## Build paso a paso

```bash
cd sync-agent
npm install                # devDeps (incluye @yao-pkg/pkg)
npm test                   # suite de pruebas (5 suites, ~64 asserts) — debe estar verde
npm run build:exe          # produce dist/linkservi-sync-agent.exe
npm run build:installer    # produce dist/LinkServi-Sync-Agent-Setup-X.Y.Z.exe
```

O todo en uno:

```bash
npm run build
```

---

## ¿Qué hace cada paso?

### `build:exe` (`scripts/build-exe.mjs`)

1. Toma `src/index.js` como entrypoint.
2. Llama a `pkg` con target `node22-win-x64`.
3. Embebe `src/**/*.js`, `src/ui/**/*` y `config.example.json` dentro del .exe.
4. Comprime con GZip → ~50 MB final.

### `build:installer` (`scripts/build-installer.mjs`)

1. Verifica que `dist/linkservi-sync-agent.exe` existe.
2. Invoca `makensis` con `installer/installer.nsi`.
3. Pasa variables (`APP_VERSION`, `APP_EXE`, etc.) vía `/D`.
4. Genera `dist/LinkServi-Sync-Agent-Setup-X.Y.Z.exe` (compresión LZMA SOLID).

---

## Comportamiento del instalador

* **Idiomas**: español (default) / inglés.
* **Permisos**: nivel usuario (no requiere admin).
* **Directorio default**: `%LOCALAPPDATA%\Programs\LinkServiSyncAgent`.
* **Componentes** (todos opt-in salvo el principal):
  * Programa principal (requerido).
  * **Iniciar con Windows** — agrega entrada en `HKCU\…\Run` con flags
    `--service --no-open` (sin consola, sin abrir browser cada login).
  * Acceso directo en escritorio.
* **Shortcuts en Start Menu**:
  * `LinkServi Sync Agent` → ejecuta el agente.
  * `Abrir panel` → abre <http://127.0.0.1:7777>.
  * `Carpeta de logs` → abre `%LOCALAPPDATA%\LinkServiSyncAgent\logs`.
  * `Desinstalar`.
* **Página final**: checkbox "Iniciar ahora" pre-marcado.

---

## Comportamiento del agente instalado

* **Primer arranque**: detecta que no hay `apiKey` configurada → abre el
  navegador automáticamente en <http://127.0.0.1:7777> con el banner de
  bienvenida visible. El usuario configura API Key + datos SAINT y presiona
  "Validar conexión a LinkServi".
* **Arranques siguientes**: corre en background (modo `--service`),
  sincroniza cada N minutos según `intervalMin`. La UI sigue disponible
  en <http://127.0.0.1:7777> para revisar estado / logs / cambiar config.
* **Logs**: archivo rotado por día en
  `%LOCALAPPDATA%\LinkServiSyncAgent\logs\sync-agent-YYYY-MM-DD.log`.
* **Configuración**: `config.json` junto al `.exe`
  (`%LOCALAPPDATA%\Programs\LinkServiSyncAgent\config.json`).

---

## CLI flags soportados

| Flag | Para qué |
|---|---|
| `--once` | Una sola corrida y sale (útil para cron / debug). |
| `--dry-run` | No envía al backend, solo lee SAINT. |
| `--no-ui` | No levanta UI local. |
| `--no-open` | No abre el browser automáticamente. |
| `--service` | Modo servicio (sin banner, sin colores). |
| `--ui-port N` | Puerto UI (default 7777). |
| `--config <path>` | Override del config.json. |

Ejemplo manual:

```bash
linkservi-sync-agent.exe --dry-run --once
```

---

## Troubleshooting

* **`makensis: command not found`** → instalar NSIS (ver pre-requisitos).
* **`pkg` muy lento la primera vez** → está bajando ~30 MB del binario Node
  Windows. Cacheado en `~/.pkg-cache`. Las siguientes veces es instantáneo.
* **Antivirus marca el .exe** → algunos AV (Windows Defender incluido)
  flagean apps empaquetadas con pkg como "PUA" porque el binario contiene un
  Node embebido. Soluciones:
  1. Firmar el .exe con un certificado de code-signing (recomendado para
     producción).
  2. Excluir la carpeta de instalación en el AV.
  3. Subir hash a VirusTotal / reportar como falso positivo.
* **Quiero correr como Windows Service real (no autostart en HKCU)** →
  agregar [NSSM](https://nssm.cc) al instalador. Comando:
  `nssm install "LinkServiSyncAgent" "%INSTDIR%\linkservi-sync-agent.exe" --service --no-open`.
  La sección `SecAutostart` actual usa `HKCU\Run` por simplicidad
  (no requiere admin para instalar).

---

## Versionado

`package.json` → campo `"version"` controla el número que aparece en:
* propiedades del .exe (Right-click → Propiedades → Detalles)
* nombre del instalador (`Setup-X.Y.Z.exe`)
* registro de Programas y características de Windows

---

## Hardening empresarial (v1.0+)

Características pensadas para distribución a clientes finales sin asistencia técnica.

### Modos de ejecución

| Flag             | Para qué                                                            |
| ---------------- | ------------------------------------------------------------------- |
| `--production`   | Cliente final: cero output en consola, log sólo a archivo (warn+).  |
| `--service`      | Pensado para Windows Service / NSSM, sin banner.                    |
| `--no-open`      | No abre el navegador automáticamente en el primer arranque.         |
| `--ui-port N`    | Puerto inicial. Si está ocupado, prueba +1 hasta +10 (fallback).    |

### Endpoint `/api/health`

`GET http://127.0.0.1:7777/api/health` retorna:
```json
{ "ok": true, "checks": { "ui": true, "filesystem": true, "config": true }, "issues": [] }
```
- `ui`: el server respondió.
- `filesystem`: la carpeta de logs (`%LOCALAPPDATA%\LinkServiSyncAgent\logs`) es escribible.
- `config`: `validateRuntimeConfig()` pasa (apiKey real, apiUrl http(s), db.host/database/user si type≠mock).
- `issues`: lista `[{field, message}]` en lenguaje claro para soporte.

El header de la UI muestra un chip "Sistema listo" / "Configuración incompleta" / "Problema de sistema" basado en este endpoint.

### Wizard de 4 pasos

La UI muestra un asistente visible hasta que los 4 pasos estén en verde:
1. **API Key** configurada
2. **Conexión SAINT** (host + base + user + password)
3. **Probar conexión** (test-linkservi + test-connection ambos OK)
4. **Activar sincronización** (al menos un sync exitoso registrado)

Botón **⚡ Probar todo** ejecuta los dos tests en orden y muestra resumen unificado.

### Code signing (opcional)

```bash
SIGN_CERT_PATH=/ruta/cert.pfx \
SIGN_CERT_PASSWORD='secret' \
npm run build:installer
```

Si `SIGN_CERT_PATH` no está definido, el build emite un warning pero NO falla.
Detecta `signtool` (Windows SDK) o `osslsigncode` (Linux/Nix/brew) automáticamente.
Sin firma, Windows muestra advertencia de SmartScreen pero el .exe funciona.

### Recovery automático

El loop principal NO termina por errores temporales:
- Falla DB → marca `connection.ok=false` y reintenta en el siguiente ciclo.
- Falla API → marca `lastSync.ok=false` y reintenta en el siguiente ciclo.
- Reconexión SAINT con backoff exponencial al guardar nueva config.

### Logs

- Archivo persistente: `%LOCALAPPDATA%\LinkServiSyncAgent\logs\agent-YYYY-MM-DD.log`
- Endpoint UI: `GET /api/logs?since=<id>&limit=100` para polling en vivo.
- Niveles: `debug | info | warn | error` (configurable en `config.json` → `logging.level`).
