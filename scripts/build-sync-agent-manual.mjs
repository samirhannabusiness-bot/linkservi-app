import PDFDocument from "/home/runner/workspace/node_modules/.pnpm/pdfkit@0.18.0/node_modules/pdfkit/js/pdfkit.js";
import fs from "node:fs";
import path from "node:path";

const OUT = "attached_assets/manuales/LinkServi-Sync-Agent-Manual.pdf";
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const doc = new PDFDocument({
  size: "A4",
  bufferPages: true,
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
  info: {
    Title: "LinkServi Sync Agent — Manual de Usuario",
    Author: "LinkServi",
    Subject: "Manual de instalación y uso del Sync Agent",
    Keywords: "linkservi, sync agent, saint, manual",
  },
});
doc.pipe(fs.createWriteStream(OUT));

const C = {
  primary: "#0F4C81",
  accent: "#1E88E5",
  ink: "#1A1A1A",
  muted: "#5A5A5A",
  bg: "#F4F7FA",
  warn: "#B45309",
  ok: "#15803D",
  code: "#1E1E1E",
  codeText: "#E6E6E6",
  rule: "#D6DEE7",
};

const FONT = { regular: "Helvetica", bold: "Helvetica-Bold", oblique: "Helvetica-Oblique", mono: "Courier", monoBold: "Courier-Bold" };

function pageWidth() { return doc.page.width - doc.page.margins.left - doc.page.margins.right; }
function ensureSpace(h) { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); }

function h1(text) {
  ensureSpace(60);
  doc.moveDown(0.4);
  doc.fillColor(C.primary).font(FONT.bold).fontSize(22).text(text, { align: "left" });
  doc.moveTo(doc.page.margins.left, doc.y + 4).lineTo(doc.page.margins.left + pageWidth(), doc.y + 4).strokeColor(C.primary).lineWidth(2).stroke();
  doc.moveDown(0.8);
  doc.fillColor(C.ink);
}
function h2(text) {
  ensureSpace(40);
  doc.moveDown(0.5);
  doc.fillColor(C.primary).font(FONT.bold).fontSize(15).text(text);
  doc.moveDown(0.3);
  doc.fillColor(C.ink);
}
function h3(text) {
  ensureSpace(28);
  doc.moveDown(0.3);
  doc.fillColor(C.accent).font(FONT.bold).fontSize(12).text(text);
  doc.moveDown(0.2);
  doc.fillColor(C.ink);
}
function p(text, opts = {}) {
  ensureSpace(20);
  doc.fillColor(C.ink).font(FONT.regular).fontSize(10.5).text(text, { align: "left", lineGap: 2, ...opts });
  doc.moveDown(0.4);
}
function muted(text) {
  ensureSpace(16);
  doc.fillColor(C.muted).font(FONT.oblique).fontSize(9.5).text(text, { lineGap: 1 });
  doc.fillColor(C.ink);
  doc.moveDown(0.4);
}
function bullet(items) {
  doc.font(FONT.regular).fontSize(10.5).fillColor(C.ink);
  for (const it of items) {
    ensureSpace(18);
    const x = doc.page.margins.left;
    const y = doc.y;
    doc.circle(x + 4, y + 6, 2).fillColor(C.accent).fill();
    doc.fillColor(C.ink).text(it, x + 14, y, { width: pageWidth() - 14, lineGap: 2 });
    doc.moveDown(0.15);
  }
  doc.moveDown(0.3);
}
function code(lines, lang = "") {
  const text = Array.isArray(lines) ? lines.join("\n") : lines;
  doc.font(FONT.mono).fontSize(9);
  const padX = 10, padY = 8;
  const innerW = pageWidth() - padX * 2;
  const h = doc.heightOfString(text, { width: innerW, lineGap: 2 }) + padY * 2;
  ensureSpace(h + 6);
  const x = doc.page.margins.left, y = doc.y;
  doc.roundedRect(x, y, pageWidth(), h, 4).fillColor(C.code).fill();
  if (lang) {
    doc.fillColor("#7CC4FF").font(FONT.monoBold).fontSize(7.5).text(lang.toUpperCase(), x + padX, y + 3, { width: innerW, align: "right" });
  }
  doc.fillColor(C.codeText).font(FONT.mono).fontSize(9).text(text, x + padX, y + padY, { width: innerW, lineGap: 2 });
  doc.y = y + h + 6;
  doc.fillColor(C.ink);
}
function callout(kind, title, text) {
  const colors = {
    info: { bg: "#E8F1FA", border: C.accent, label: C.accent },
    warn: { bg: "#FEF3C7", border: C.warn, label: C.warn },
    ok:   { bg: "#DCFCE7", border: C.ok,   label: C.ok },
    tip:  { bg: "#F3E8FF", border: "#7E22CE", label: "#7E22CE" },
  }[kind] || { bg: C.bg, border: C.muted, label: C.muted };
  doc.font(FONT.regular).fontSize(10);
  const padX = 12, padY = 10;
  const innerW = pageWidth() - padX * 2;
  const titleH = title ? doc.heightOfString(title, { width: innerW }) + 4 : 0;
  doc.font(FONT.regular).fontSize(10);
  const bodyH = doc.heightOfString(text, { width: innerW, lineGap: 2 });
  const h = titleH + bodyH + padY * 2;
  ensureSpace(h + 6);
  const x = doc.page.margins.left, y = doc.y;
  doc.roundedRect(x, y, pageWidth(), h, 4).fillColor(colors.bg).fill();
  doc.rect(x, y, 4, h).fillColor(colors.border).fill();
  let cy = y + padY;
  if (title) {
    doc.fillColor(colors.label).font(FONT.bold).fontSize(10).text(title, x + padX, cy, { width: innerW });
    cy += titleH;
  }
  doc.fillColor(C.ink).font(FONT.regular).fontSize(10).text(text, x + padX, cy, { width: innerW, lineGap: 2 });
  doc.y = y + h + 6;
}
function table(headers, rows, colWidths) {
  const x0 = doc.page.margins.left;
  const totalW = pageWidth();
  const widths = colWidths || headers.map(() => totalW / headers.length);
  doc.font(FONT.bold).fontSize(9.5);
  const headH = 22;
  ensureSpace(headH + rows.length * 18);
  let y = doc.y;
  doc.rect(x0, y, totalW, headH).fillColor(C.primary).fill();
  doc.fillColor("#FFFFFF");
  let cx = x0;
  headers.forEach((h, i) => {
    doc.text(h, cx + 6, y + 6, { width: widths[i] - 12 });
    cx += widths[i];
  });
  y += headH;
  doc.font(FONT.regular).fontSize(9.5);
  rows.forEach((row, ri) => {
    doc.font(FONT.regular).fontSize(9.5);
    let maxH = 0;
    row.forEach((cell, i) => {
      const h = doc.heightOfString(String(cell), { width: widths[i] - 12, lineGap: 1 });
      if (h > maxH) maxH = h;
    });
    const rowH = Math.max(18, maxH + 8);
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }
    if (ri % 2 === 0) doc.rect(x0, y, totalW, rowH).fillColor(C.bg).fill();
    doc.fillColor(C.ink);
    cx = x0;
    row.forEach((cell, i) => {
      doc.text(String(cell), cx + 6, y + 4, { width: widths[i] - 12, lineGap: 1 });
      cx += widths[i];
    });
    y += rowH;
  });
  doc.rect(x0, doc.y, totalW, y - doc.y).strokeColor(C.rule).lineWidth(0.5).stroke();
  doc.y = y + 6;
  doc.fillColor(C.ink);
}

// ── PORTADA ───────────────────────────────────────────────────────────────
doc.rect(0, 0, doc.page.width, doc.page.height).fillColor("#FFFFFF").fill();
doc.rect(0, 0, doc.page.width, 220).fillColor(C.primary).fill();
doc.rect(0, 220, doc.page.width, 8).fillColor(C.accent).fill();

doc.fillColor("#FFFFFF").font(FONT.bold).fontSize(13).text("LINKSERVI", 60, 70, { characterSpacing: 4 });
doc.fillColor("#FFFFFF").font(FONT.regular).fontSize(11).text("Sincronización SAINT  →  LinkServi", 60, 92);

doc.fillColor("#FFFFFF").font(FONT.bold).fontSize(34).text("Sync Agent", 60, 130);
doc.fillColor("#E6F0FB").font(FONT.regular).fontSize(16).text("Manual de Usuario", 60, 175);

doc.fillColor(C.ink).font(FONT.regular).fontSize(11).text("Versión del agente: 1.0.0", 60, 280);
doc.fillColor(C.muted).fontSize(11).text("Documento generado: " + new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" }), 60, 298);

doc.fillColor(C.ink).font(FONT.bold).fontSize(13).text("¿Qué encontrarás en este manual?", 60, 360);
doc.fillColor(C.ink).font(FONT.regular).fontSize(10.5).list([
  "Qué es el Sync Agent y cómo funciona.",
  "Dónde está ubicado en el sistema y en el código.",
  "Cómo se instala (usuario final y desarrollador).",
  "Cómo es el primer uso con el nuevo onboarding invisible.",
  "Cómo se sincronizan los productos con LinkServi.",
  "Configuración, logs, comandos y solución de problemas.",
], 70, 385, { bulletRadius: 2, textIndent: 12, lineGap: 4 });

doc.fillColor(C.muted).font(FONT.oblique).fontSize(9).text("Documento confidencial — uso interno LinkServi.", 60, doc.page.height - 80, { width: pageWidth(), align: "center" });

// ── PÁGINA: ÍNDICE ─────────────────────────────────────────────────────────
doc.addPage();
h1("Índice");
const toc = [
  ["1.", "¿Qué es el Sync Agent?", "3"],
  ["2.", "Ubicación en el código y en el sistema", "3"],
  ["3.", "Requisitos del sistema", "4"],
  ["4.", "Instalación — Usuario final (.exe)", "4"],
  ["5.", "Instalación — Desarrollador (desde código)", "5"],
  ["6.", "Primer uso: el onboarding invisible", "6"],
  ["7.", "¿Cómo funciona la sincronización?", "8"],
  ["8.", "Archivo de configuración (config.json)", "9"],
  ["9.", "Comandos y opciones de línea de comandos", "10"],
  ["10.", "Logs: dónde están y cómo leerlos", "11"],
  ["11.", "Solución de problemas", "11"],
  ["12.", "Anexo — Endpoints internos del agente", "12"],
];
doc.font(FONT.regular).fontSize(11);
toc.forEach(([n, t, pg]) => {
  ensureSpace(20);
  const y = doc.y;
  doc.fillColor(C.accent).font(FONT.bold).text(n, doc.page.margins.left, y, { width: 30, continued: false });
  doc.fillColor(C.ink).font(FONT.regular).text(t, doc.page.margins.left + 30, y, { width: pageWidth() - 60 });
  doc.fillColor(C.muted).font(FONT.regular).text(pg, doc.page.margins.left, y, { width: pageWidth(), align: "right" });
  doc.moveDown(0.4);
});

// ── 1. QUÉ ES ──────────────────────────────────────────────────────────────
doc.addPage();
h1("1. ¿Qué es el Sync Agent?");
p("El LinkServi Sync Agent es un programa pequeño que se instala en la misma computadora donde corre tu sistema administrativo SAINT (o cualquier ERP basado en SQL Server / Firebird). Su único trabajo es leer los productos de tu base de datos local y enviarlos automáticamente a tu tienda en LinkServi.com.");
p("Se queda corriendo en segundo plano — no tienes que abrirlo cada día. Cada cierto tiempo (15 minutos por defecto) revisa cambios y los publica en tu marketplace, manteniendo precios y existencias siempre al día.");
callout("ok", "En resumen", "Tú facturas en SAINT como siempre. El Sync Agent se encarga de que tu tienda online refleje exactamente el mismo catálogo, sin que tengas que tocar nada.");

h2("¿Qué problema resuelve?");
bullet([
  "Antes: cada cambio de precio o stock había que duplicarlo a mano en la web.",
  "Ahora: lo cambias en SAINT y aparece solo en LinkServi en minutos.",
  "Evita errores humanos de tipeo y desincronización entre el local y la web.",
]);

// ── 2. UBICACIÓN ──────────────────────────────────────────────────────────
h1("2. Ubicación en el código y en el sistema");
h3("En el repositorio de código");
table(
  ["Ruta", "Qué es"],
  [
    ["sync-agent/", "Carpeta raíz del agente."],
    ["sync-agent/src/index.js", "Punto de entrada — arranca el proceso."],
    ["sync-agent/src/ui-server.js", "Servidor HTTP local (puerto 7777) que sirve la interfaz."],
    ["sync-agent/src/ui/", "Archivos de la UI (index.html, app.js, styles.css)."],
    ["sync-agent/src/saint-client.js", "Cliente que lee la base de datos del ERP."],
    ["sync-agent/src/api-client.js", "Cliente HTTP que envía datos a LinkServi."],
    ["sync-agent/src/db-introspect.js", "Auto-detecta tablas y columnas del ERP."],
    ["sync-agent/config.example.json", "Plantilla de configuración."],
    ["sync-agent/installer/", "Scripts NSIS para crear el instalador Windows."],
    ["sync-agent/dist/", "Artefactos compilados (.exe e instalador)."],
  ],
  [200, pageWidth() - 200]
);

h3("Una vez instalado en Windows");
table(
  ["Ruta", "Contenido"],
  [
    ["C:\\Program Files\\LinkServi Sync Agent\\", "Binario y recursos del programa."],
    ["%LOCALAPPDATA%\\LinkServiSyncAgent\\config.json", "Configuración del usuario (API key, conexión BD)."],
    ["%LOCALAPPDATA%\\LinkServiSyncAgent\\logs\\", "Archivos de log (uno por día)."],
    ["http://127.0.0.1:7777", "Panel de control web local del agente."],
  ],
  [260, pageWidth() - 260]
);

// ── 3. REQUISITOS ─────────────────────────────────────────────────────────
h1("3. Requisitos del sistema");
table(
  ["Requisito", "Detalle"],
  [
    ["Sistema operativo", "Windows 10 / 11 o Windows Server 2016+ (64-bit)."],
    ["Memoria RAM", "200 MB libres (el agente usa ~80 MB en operación normal)."],
    ["Espacio en disco", "150 MB para el binario + logs."],
    ["Base de datos", "SQL Server 2014+ o Firebird 2.5+ accesible desde la misma máquina."],
    ["Conexión a internet", "Salida HTTPS hacia linkservi.com (puerto 443)."],
    ["Cuenta LinkServi", "Plan que incluya el sync agent y una API Key activa."],
  ],
  [140, pageWidth() - 140]
);
callout("warn", "Importante sobre SQL Server", "El agente usa autenticación SQL (usuario + contraseña). La autenticación de Windows (Integrated Security) no está soportada en esta versión. Asegúrate de tener TCP/IP habilitado y el puerto 1433 abierto.");

// ── 4. INSTALACIÓN USUARIO FINAL ──────────────────────────────────────────
h1("4. Instalación — Usuario final");
p("Esta es la forma normal de instalación: usas el instalador .exe que te entregamos. No necesitas saber programación.");

h3("Paso 1 — Descargar el instalador");
p("Te llegará por correo (o lo descargas desde tu panel de LinkServi) un archivo llamado:");
code(["LinkServi-Sync-Agent-Setup-1.0.0.exe"]);
muted("Tamaño aproximado: 15 MB. Si tu navegador lo bloquea por venir de internet, haz clic derecho → Propiedades → marca 'Desbloquear'.");

h3("Paso 2 — Ejecutar el instalador");
bullet([
  "Doble clic sobre el archivo descargado.",
  "Acepta el aviso de Windows ('¿Permitir cambios?').",
  "Pulsa Siguiente, acepta la licencia y elige la carpeta de instalación (deja la sugerida).",
  "Al final, marca 'Iniciar LinkServi Sync Agent ahora' y pulsa Finalizar.",
]);

h3("Paso 3 — Vinculación con tu cuenta");
p("Apenas el agente arranca, se abre solo en tu navegador en http://127.0.0.1:7777. Verás una pantalla de bienvenida que te pedirá UNA de estas dos cosas:");
bullet([
  "Código de vinculación: un código de 6 dígitos que generas en tu panel LinkServi → Configuración → Sync Agent. Se ingresa una sola vez.",
  "API Key directa: si ya tienes una, la pegas en el campo correspondiente.",
]);
callout("info", "Código de vinculación recomendado", "Es la opción más simple. El código tiene una validez de 10 minutos. Una vez vinculado, el agente recuerda la conexión para siempre.");

h3("Paso 4 — Conexión a tu base de datos SAINT");
p("El agente intenta detectar SAINT automáticamente. Si lo encuentra, sólo te pedirá la contraseña del usuario SQL una vez. Si no, podrás configurar manualmente. Ver la sección 6 para el detalle del onboarding.");

h3("Paso 5 — Listo");
p("El agente queda corriendo en segundo plano. Aparecerá un ícono en la bandeja del sistema (junto al reloj de Windows). Desde ahí puedes:");
bullet([
  "Abrir el panel para ver el estado.",
  "Forzar una sincronización manual.",
  "Ver los últimos logs.",
  "Pausar / reanudar el agente.",
]);

// ── 5. INSTALACIÓN DEV ────────────────────────────────────────────────────
h1("5. Instalación — Desarrollador (desde el código)");
p("Si trabajas con el código fuente directamente (por ejemplo, en este repositorio), puedes correr el agente sin compilar el .exe.");

h3("Pre-requisitos");
bullet([
  "Node.js 18 o superior.",
  "pnpm (recomendado) o npm.",
  "Acceso a la base de datos SAINT desde tu máquina.",
]);

h3("Comandos");
code([
  "# Desde la raíz del monorepo",
  "cd sync-agent",
  "",
  "# Instalar dependencias",
  "npm install",
  "",
  "# Ejecutar el agente en modo desarrollo",
  "npm start",
  "",
  "# Ejecutar una sola sincronización y salir",
  "npm run once",
  "",
  "# Probar sin enviar nada a LinkServi",
  "npm run dry-run",
  "",
  "# Correr la suite de tests",
  "npm test",
], "bash");

h3("Compilar el .exe distribuible");
code([
  "# Genera dist/linkservi-sync-agent.exe (~50 MB)",
  "npm run build:exe",
  "",
  "# Genera dist/LinkServi-Sync-Agent-Setup-X.Y.Z.exe (~15 MB)",
  "# Requiere makensis instalado",
  "npm run build:installer",
  "",
  "# Ambos en uno",
  "npm run build",
], "bash");
muted("Detalles completos de build en sync-agent/BUILD.md.");

// ── 6. ONBOARDING ─────────────────────────────────────────────────────────
h1("6. Primer uso: el onboarding invisible");
p("El primer uso fue rediseñado para que sea lo más automático posible. El usuario casi nunca tiene que tocar campos técnicos. El flujo tiene 4 vistas — pero en el caso normal sólo verás 1 o 2 de ellas.");

h3("Vista 1 — Automática (lo que verás casi siempre)");
p("Apenas pasas la pantalla de vinculación, el agente arranca solo. Verás:");
bullet([
  'Un spinner animado y el título: "Conectando con tu sistema…"',
  'Tres mensajes que se van completando: Detectando tu sistema → Preparando tus productos → Verificando información.',
  "No hay botones que pulsar — el agente trabaja solo.",
]);
p("Si todo sale bien, en menos de 2 segundos te lleva al dashboard con el mensaje:");
callout("ok", "Tu negocio ya está sincronizado", "El contador de productos se anima desde 0 hasta el total real (ej. 0 → 1234) y el estado pasa a 'Activo'.");

h3("Vista 2 — Pedir contraseña (sólo si hace falta)");
p("Si el agente detecta tu SAINT pero necesita la contraseña del usuario SQL, te muestra una sola caja con foco automático. Pulsas Enter y sigue solo. La contraseña queda guardada cifrada localmente para que no te la pida de nuevo.");

h3("Vista 3 — Fallback (si la auto-conexión falla)");
p('Si por alguna razón no logramos conectar (firewall, SQL Server apagado, instancia no estándar), te mostramos una pantalla suave con icono ⚠️ y el texto:');
callout("warn", "No pudimos conectar automáticamente", "Aparecen dos botones grandes: 'Intentar nuevamente' (vuelve al flujo invisible) y 'Configurar manualmente' (abre el formulario completo).");

h3("Vista 4 — Manual (sólo si la pides)");
p("Sólo aparece si tú eliges 'Configurar manualmente'. Te muestra el formulario completo con todos los campos: host, puerto, usuario, contraseña, nombre de la base de datos. Bajo un acordeón 'Configuración avanzada' están los mapeos de tabla y columnas (normalmente no hay que tocarlos: el agente los autodetecta).");

callout("tip", "Diseño pensado para no técnicos", "El flujo está hecho para que un comerciante que no sabe nada de bases de datos pueda completarlo en menos de 30 segundos. Los detalles técnicos están escondidos hasta que se necesitan.");

// ── 7. SINCRONIZACIÓN ─────────────────────────────────────────────────────
h1("7. ¿Cómo funciona la sincronización?");
p("Una vez configurado, el agente repite este ciclo cada cierto tiempo (configurable: 5, 15, 30 o 60 minutos):");
bullet([
  "1. Abre conexión a SAINT (SQL Server o Firebird).",
  "2. Lee la tabla de productos configurada (por defecto detecta automáticamente).",
  "3. Mapea cada fila al formato de LinkServi: { sku, nombre, precio, existencia, ... }.",
  "4. Envía el lote por HTTPS a https://linkservi.com/api/integrations/products/sync con tu API Key.",
  "5. El backend de LinkServi inserta nuevos productos, actualiza existentes y deja inactivos los que ya no aparecen.",
  "6. Se loggea el resultado (cuántos creados / actualizados / errores).",
]);

h3("¿Qué datos se envían?");
table(
  ["Campo", "Origen típico (SAINT)", "Uso en LinkServi"],
  [
    ["sku", "codigo / cod_producto", "Identificador único del producto."],
    ["name", "descripcion / nombre", "Título visible en el marketplace."],
    ["price", "precio / precio1", "Precio de venta en USD."],
    ["stock", "existencia", "Unidades disponibles."],
  ],
  [80, 180, pageWidth() - 260]
);
muted("La identidad de cada producto se conserva con la pareja (storeId, externalId), garantizando que las re-sincronizaciones sean idempotentes — nunca crea duplicados.");

h3("Modos especiales de sincronización");
table(
  ["Modo", "Cómo se activa", "Para qué sirve"],
  [
    ["Manual", "Botón 'Sincronizar ahora' en el panel.", "Cuando hiciste un cambio importante y no quieres esperar."],
    ["Una vez", "npm run once  (o flag --once)", "Cron jobs / pruebas automatizadas."],
    ["Dry-run", "npm run dry-run  o botón en el panel", "Ver qué se ENVIARÍA sin enviar nada."],
  ],
  [80, 180, pageWidth() - 260]
);

// ── 8. CONFIG ─────────────────────────────────────────────────────────────
h1("8. Archivo de configuración (config.json)");
p("Toda la configuración vive en un único archivo. Normalmente no necesitas tocarlo a mano — el panel web lo escribe por ti — pero conviene saber qué contiene.");
h3("Ubicación");
bullet([
  "Desarrollo: sync-agent/config.json",
  "Producción Windows: %LOCALAPPDATA%\\LinkServiSyncAgent\\config.json",
]);
h3("Estructura completa");
code([
  "{",
  '  "apiUrl": "https://linkservi.com",',
  '  "apiKey": "LS-XXXX-XXXX",         // tu API Key (sensible)',
  '  "intervalMin": 15,                 // 5, 15, 30 o 60',
  '  "db": {',
  '    "type": "sqlserver",             // sqlserver | firebird | mock',
  '    "host": "localhost",',
  '    "port": 1433,',
  '    "user": "sa",',
  '    "password": "*****",             // sensible',
  '    "database": "SAINT_DB",',
  '    "options": {',
  '      "encrypt": false,',
  '      "trustServerCertificate": true',
  '    }',
  '  },',
  '  "mapping": {',
  '    "table": "productos",            // autodetectada por el agente',
  '    "sku":   "codigo",',
  '    "name":  "descripcion",',
  '    "price": "precio",',
  '    "stock": "existencia"',
  '  },',
  '  "logging": { "level": "info" }     // debug | info | warn | error',
  "}",
], "json");
callout("warn", "Sobre la seguridad de las contraseñas", "El archivo se guarda en el AppData del usuario actual de Windows, con permisos restringidos. Aún así, evita compartirlo y nunca lo subas a un repositorio.");

// ── 9. CLI ────────────────────────────────────────────────────────────────
h1("9. Comandos y opciones de línea de comandos");
table(
  ["Flag", "Descripción"],
  [
    ["(sin flags)", "Modo normal: corre el ciclo de sincronización indefinidamente y abre el panel."],
    ["--once", "Ejecuta una sola sincronización y termina."],
    ["--dry-run", "Lee la BD pero NO envía nada a LinkServi (útil para probar mapeos)."],
    ["--production", "Modo silencioso. Sólo abre el navegador si no está configurado."],
    ["--service", "Modo Servicio Windows (sin abrir navegador)."],
    ["--ui-port <N>", "Cambia el puerto de la UI local (por defecto 7777, fallback 7778-7787)."],
    ["--config <ruta>", "Usa un config.json alternativo."],
  ],
  [120, pageWidth() - 120]
);
h3("Combinaciones típicas");
code([
  "# Sincronización programada por Programador de Tareas",
  "linkservi-sync-agent.exe --once --production",
  "",
  "# Probar un cambio de mapeo sin afectar producción",
  "linkservi-sync-agent.exe --dry-run --once",
  "",
  "# Cambiar puerto si 7777 está ocupado",
  "linkservi-sync-agent.exe --ui-port 8080",
], "bash");

// ── 10. LOGS ──────────────────────────────────────────────────────────────
h1("10. Logs: dónde están y cómo leerlos");
h3("Ubicación");
bullet([
  "Desarrollo: sync-agent/logs/sync-agent.log",
  "Producción Windows: %LOCALAPPDATA%\\LinkServiSyncAgent\\logs\\sync-agent-YYYY-MM-DD.log",
  "Rotación: un archivo por día. Se conservan los últimos 14 días.",
]);
h3("Formato");
code([
  "[2026-04-28 10:15:23] INFO  sync.start  intervalMin=15",
  "[2026-04-28 10:15:24] INFO  db.connect  host=localhost db=SAINT_DB",
  "[2026-04-28 10:15:25] INFO  sync.read   table=productos rows=1247",
  "[2026-04-28 10:15:27] INFO  sync.send   created=3 updated=42 deactivated=1",
  "[2026-04-28 10:15:27] INFO  sync.done   ms=2104",
], "log");
muted("Niveles disponibles: DEBUG (todo), INFO (operación normal), WARN (advertencias), ERROR (fallos).");

// ── 11. TROUBLESHOOTING ───────────────────────────────────────────────────
h1("11. Solución de problemas");

h3('"No detectamos tu sistema automáticamente"');
bullet([
  "Verifica que SQL Server Configuration Manager tenga TCP/IP habilitado.",
  "Si usas una instancia con nombre (ej. SAINT\\SQLEXPRESS), inicia el servicio 'SQL Server Browser'.",
  "Comprueba que el puerto 1433 (o el de tu instancia) no esté bloqueado por el firewall.",
  "Como último recurso, usa la opción 'Configurar manualmente' e ingresa host y puerto exactos.",
]);

h3('"Contraseña incorrecta" o "Login failed for user"');
bullet([
  "Confirma que el usuario SQL existe y puede iniciar sesión desde SQL Server Management Studio.",
  "Verifica que la autenticación 'SQL Server' esté habilitada (no sólo Windows Authentication).",
  "Si la contraseña tiene caracteres especiales, prueba ingresándola desde el panel y no editando el JSON.",
]);

h3('"API Key inválida" / HTTP 401 al sincronizar');
bullet([
  "Tu API Key fue revocada o caducó. Genera una nueva en LinkServi → Configuración → Sync Agent.",
  "Si renovaste la key, reabre el panel del agente y pégala en el campo correspondiente.",
]);

h3("La sincronización corre pero no aparecen productos en la web");
bullet([
  "Usa el botón 'Vista previa (dry-run)' del panel: te muestra exactamente qué filas se enviarían y cuáles tienen problemas (precio nulo, SKU vacío, etc.).",
  "Verifica el mapeo de columnas en 'Configuración avanzada': el nombre de la tabla y de cada columna debe coincidir exactamente con tu BD.",
  "Revisa el log del día: las filas rechazadas se loggean con el motivo.",
]);

h3('El panel no abre solo / "no se puede acceder a 127.0.0.1:7777"');
bullet([
  "Otro programa puede estar usando el puerto 7777. Reinicia el agente — buscará automáticamente uno libre entre 7778 y 7787.",
  "Verifica en la bandeja del sistema que el agente esté efectivamente corriendo.",
  "Abre manualmente http://127.0.0.1:7777 en cualquier navegador.",
]);

// ── 12. ANEXO ─────────────────────────────────────────────────────────────
h1("12. Anexo — Endpoints internos del agente");
p("El panel web del agente expone una pequeña API local en 127.0.0.1:7777 (sólo accesible desde la misma máquina). Estos endpoints son los que usa la UI internamente:");
table(
  ["Método", "Ruta", "Para qué sirve"],
  [
    ["GET",  "/api/status",            "Estado actual: conectado / sincronizando / error."],
    ["GET",  "/api/config",            "Devuelve la configuración (con campos sensibles enmascarados)."],
    ["POST", "/api/config",            "Guarda nueva configuración."],
    ["POST", "/api/test-connection",   "Prueba la conexión a la base de datos."],
    ["POST", "/api/test-linkservi",    "Valida la API Key contra LinkServi."],
    ["POST", "/api/pair",              "Vincula con un código de 6 dígitos."],
    ["POST", "/api/sync-now",          "Dispara una sincronización inmediata."],
    ["GET",  "/api/db/detect",         "Auto-detecta instancias de SQL Server locales."],
    ["POST", "/api/db/list-databases", "Lista bases de datos del servidor indicado."],
    ["POST", "/api/db/list-tables",    "Lista tablas de la base de datos seleccionada."],
    ["POST", "/api/sync/dry-run",      "Vista previa: muestra qué se enviaría sin enviarlo."],
  ],
  [55, 175, pageWidth() - 230]
);

callout("info", "¿Es seguro?", "Sí. Estos endpoints sólo escuchan en 127.0.0.1, lo que significa que sólo procesos dentro de la misma máquina pueden llamarlos. No hay forma de acceder al agente desde otra computadora de la red.");

// ── PIE FINAL ─────────────────────────────────────────────────────────────
doc.moveDown(2);
doc.fillColor(C.muted).font(FONT.oblique).fontSize(9).text("¿Necesitas ayuda? Escribe a soporte@linkservi.com indicando tu RIF / código de cuenta y, si es posible, adjunta el log del día (sync-agent-YYYY-MM-DD.log).", { align: "center", width: pageWidth() });

// ── NUMERACIÓN DE PÁGINAS ─────────────────────────────────────────────────
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  if (i === 0) continue;
  const oldBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fillColor(C.muted).font(FONT.regular).fontSize(8.5).text(
    `LinkServi Sync Agent — Manual de Usuario      |      Página ${i + 1} de ${range.count}`,
    doc.page.margins.left,
    doc.page.height - 30,
    { width: pageWidth(), align: "center" }
  );
  doc.page.margins.bottom = oldBottom;
}

doc.end();
console.log("OK →", OUT);
