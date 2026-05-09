/* LinkServi Sync Agent — UI local (vanilla JS).
   3 pantallas: bienvenida → wizard 3 pasos → dashboard simple.
   Configuración avanzada en sección colapsada (mapping + logs). */

const $ = (sel) => document.querySelector(sel);

const fmt = {
  date(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return `hace ${diffSec}s`;
    if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`;
    return d.toLocaleString("es-VE");
  },
  futureMin(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const ms = d.getTime() - Date.now();
    if (isNaN(d.getTime())) return "—";
    if (ms <= 0) return "en breve";
    const min = Math.ceil(ms / 60000);
    return `en ${min} min`;
  },
  num(n) { return typeof n === "number" ? n.toLocaleString("es-VE") : "—"; },
};

// Estado de la UI
const LS_WELCOME_KEY = "linkservi.welcomeDismissed";
const ui = {
  configState: null,
  lastLogId: 0,
  recentErrors: [], // máx 3
  wizardStep: 1,
  wizardResults: { account: null, system: null, products: null }, // null | "ok" | "err"
  // Persistido en localStorage para que un reload no devuelva al user a la pantalla de welcome.
  hasUserDismissedWelcome: (() => {
    try { return localStorage.getItem(LS_WELCOME_KEY) === "1"; } catch { return false; }
  })(),
  // Mientras el user está dentro del wizard, decideScreen NO debe redirigir
  // automáticamente al dashboard aunque la config se vuelva completa
  // (sino la pantalla "Activar" del paso 3 nunca se vería).
  wizardActive: false,
};

function setWelcomeDismissed() {
  ui.hasUserDismissedWelcome = true;
  try { localStorage.setItem(LS_WELCOME_KEY, "1"); } catch { /* ignore */ }
}

// ── API helpers ─────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, data };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ── Decidir qué pantalla mostrar ────────────────────────────────────────
// El usuario pasa por: welcome (primer uso) → wizard → dashboard
function decideScreen() {
  const cfg = ui.configState;
  if (!cfg) return; // todavía no cargó
  // Si el user está mid-wizard, no lo redirigimos aunque la config se vuelva
  // completa — sino la pantalla "Activar" del paso 3 nunca se vería (H1).
  if (ui.wizardActive) return;

  const hasApiKey = cfg._apiKeySet === true;
  const dbType = String(cfg.db?.type ?? "").toLowerCase();
  const hasDbConfig = dbType === "mock" || (cfg.db?.host && cfg.db?.database && cfg.db?.user && cfg._dbPasswordSet);
  const isComplete = hasApiKey && hasDbConfig;

  const welcome = $("#welcomeScreen");
  const wizard = $("#wizardCard");
  const dashboard = $("#dashboardCard");
  const advanced = $("#advancedCard");

  if (!hasApiKey && !ui.hasUserDismissedWelcome) {
    welcome.classList.remove("hidden");
    wizard.classList.add("hidden");
    dashboard.classList.add("hidden");
    advanced.classList.add("hidden");
  } else if (!isComplete) {
    welcome.classList.add("hidden");
    wizard.classList.remove("hidden");
    dashboard.classList.add("hidden");
    advanced.classList.remove("hidden");
    // Cualquier entrada al wizard (incluyendo reload mid-flow) marca wizardActive,
    // así onTestSystem→loadConfig→decideScreen no nos saltea al dashboard.
    ui.wizardActive = true;
    // Saltar al primer paso pendiente. Para el paso 2 usamos enterStep2()
    // que arranca el flujo invisible de auto-detección — pero sólo la
    // primera vez (sino re-disparamos en cada loadConfig).
    if (!hasApiKey) goToStep(1);
    else if (!hasDbConfig) {
      if (!ui.wiz2.autoStarted) {
        ui.wiz2.autoStarted = true;
        enterStep2();
      } else {
        goToStep(2);
      }
    }
    else goToStep(3);
  } else {
    welcome.classList.add("hidden");
    wizard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    advanced.classList.remove("hidden");
    // Si la config se vuelve a invalidar después (rara, pero posible),
    // queremos que enterStep2() vuelva a dispararse — reseteamos el guard.
    ui.wiz2.autoStarted = false;
  }
}

// ── Welcome ──────────────────────────────────────────────────────────────
function setupWelcome() {
  $("#btnStartWizard").addEventListener("click", () => {
    setWelcomeDismissed();
    ui.wizardActive = true;
    decideScreen();
  });
}

// ── Wizard navigation ────────────────────────────────────────────────────
function goToStep(n) {
  ui.wizardStep = n;
  for (const k of [1, 2, 3]) {
    const pane = $(`#wizPane${k}`);
    if (pane) pane.classList.toggle("hidden", k !== n);
  }
  // Pintar progreso visual
  for (const k of [1, 2, 3]) {
    const step = document.querySelector(`.wizard-progress-step[data-step="${k}"]`);
    if (!step) continue;
    step.removeAttribute("data-active");
    step.removeAttribute("data-done");
    if (k === n) step.setAttribute("data-active", "true");
    else if (k < n) step.setAttribute("data-done", "true");
  }
  document.querySelector('.wizard-progress-bar[data-step="1-2"]')?.toggleAttribute("data-done", n >= 2);
  document.querySelector('.wizard-progress-bar[data-step="2-3"]')?.toggleAttribute("data-done", n >= 3);
}

function showWizMsg(stepN, kind, title, detail, raw) {
  const box = $(`#wizMsg${stepN}`);
  if (!box) return;
  box.className = `wizard-msg ${kind}`;
  box.classList.remove("hidden");
  box.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? escapeHtml(detail) : ""}${raw ? `<span class="raw">${escapeHtml(raw)}</span>` : ""}`;
}

function hideWizMsg(stepN) {
  $(`#wizMsg${stepN}`)?.classList.add("hidden");
}

// ── Paso 1 — Conectar con código de pairing (T001) ───────────────────────
async function onPairWithCode() {
  const btn = $("#btnWizPair");
  const input = $("#wizPairCode");
  const code = (input.value || "").trim().toUpperCase();
  const apiUrl = ($("#wizApiUrl")?.value?.trim() || "").trim();
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    showWizMsg(1, "err", "Código inválido", "Debe tener 8 caracteres (sólo letras y números visibles).");
    return;
  }
  btn.disabled = true;
  hideWizMsg(1);
  showWizMsg(1, "info", "Conectando…", "Verificando el código contra LinkServi.");
  try {
    const body = { code };
    if (apiUrl) body.apiUrl = apiUrl;
    const { data } = await api("/api/pair", { method: "POST", body });
    if (data?.ok) {
      ui.wizardResults.account = "ok";
      await loadConfig();
      showWizMsg(1, "ok", "✔ Conectado", `Tu agente está vinculado a tu cuenta LinkServi${data.storeId ? ` (tienda #${data.storeId})` : ""}.`);
      input.value = "";
      setTimeout(() => enterStep2(), 700);
    } else {
      ui.wizardResults.account = "err";
      showWizMsg(1, "err", "No se pudo conectar", data?.error ?? "El código no es válido o ya fue usado.");
    }
  } catch (err) {
    ui.wizardResults.account = "err";
    showWizMsg(1, "err", "Error al conectar", err.message);
  } finally {
    btn.disabled = false;
  }
}

// ── Paso 1 — Validar API Key ─────────────────────────────────────────────
async function onValidateAccount() {
  const btn = $("#btnWizValidate");
  const apiKey = $("#wizApiKey").value.trim();
  const apiUrl = ($("#wizApiUrl").value.trim() || ui.configState?.apiUrl || "").trim();
  if (!apiKey) { showWizMsg(1, "err", "Falta tu clave", "Pégala desde el panel de LinkServi → Integraciones → SAINT."); return; }
  btn.disabled = true;
  hideWizMsg(1);
  showWizMsg(1, "info", "Validando…", "Consultando a LinkServi.");
  try {
    const { data } = await api("/api/test-linkservi", { method: "POST", body: { apiUrl, apiKey } });
    if (data?.ok) {
      ui.wizardResults.account = "ok";
      // Guardamos apiUrl + apiKey ahora (config parcial) — así si cierra y vuelve a entrar, no las pierde.
      const patch = { apiKey };
      if (apiUrl) patch.apiUrl = apiUrl;
      await api("/api/config", { method: "POST", body: patch });
      await loadConfig();
      showWizMsg(1, "ok", "Conexión OK", data.message ?? "Tu cuenta está conectada.");
      setTimeout(() => enterStep2(), 600);
    } else {
      ui.wizardResults.account = "err";
      const f = data?.friendly ?? { title: "No se pudo validar", detail: data?.error ?? "Error desconocido" };
      showWizMsg(1, "err", f.title, f.detail, f.raw);
    }
  } catch (err) {
    ui.wizardResults.account = "err";
    showWizMsg(1, "err", "Error al validar", err.message);
  } finally {
    btn.disabled = false;
  }
}

// ── Paso 2 — Onboarding INVISIBLE (FASE FINAL) ───────────────────────────
// 4 vistas: auto (default) → password (si falta pwd) → fallback (error) →
// manual (sólo si el usuario lo elige). Todo arranca SIN clic al entrar.
ui.wiz2 = {
  host: "localhost",
  port: 1433,
  user: "sa",
  password: "",
  database: "",
  table: "",
  mapping: { sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" },
  autoStarted: false, // evita re-disparar autoflow en re-render
};

// Cambia entre las 4 vistas mutuamente excluyentes del paso 2.
function showStep2View(name) {
  for (const v of ["auto", "password", "fallback", "manual"]) {
    const el = document.getElementById(`step2View_${v}`);
    if (el) el.classList.toggle("hidden", v !== name);
  }
}

// Lee los overrides del bloque "Configuración avanzada" (sólo existen
// cuando el usuario está en la vista manual; si no, devuelve todo vacío).
function readAdv() {
  const get = (id) => (document.getElementById(id)?.value || "").trim();
  return {
    host: get("advHost"),
    port: Number(document.getElementById("advPort")?.value) || 0,
    database: get("advDatabase"),
    table: get("advTable"),
    sku: get("advSku"),
    name: get("advName"),
    price: get("advPrice"),
    stock: get("advStock"),
  };
}

// Pinta uno de los 3 pasos del banner como "active" (animado) o "done" (✓).
function setAutoStep(name, state) {
  const el = document.querySelector(`.auto-step[data-step="${name}"]`);
  if (!el) return;
  el.removeAttribute("data-active");
  el.removeAttribute("data-done");
  if (state === "active") el.setAttribute("data-active", "true");
  else if (state === "done") el.setAttribute("data-done", "true");
}

function resetAutoProgress() {
  for (const s of ["detect", "prepare", "verify"]) setAutoStep(s, "");
  $("#autoProgress").classList.add("hidden");
}

// Cualquier fallo del flujo automático lleva al usuario al fallback view
// con dos opciones claras: reintentar o configurar manualmente. El detalle
// del error se muestra como subtítulo (no asusta — sólo informa).
function failSimple(friendly) {
  resetAutoProgress();
  // Re-habilitar botones de submit que pudieron quedar deshabilitados
  // durante el flow — sino tras un error el usuario queda atascado.
  reenableStep2Buttons();
  showStep2View("fallback");
  const detail = friendly?.detail || friendly?.title || "Algo no salió bien. Intenta de nuevo.";
  $("#fallbackDetail").textContent = detail;
}

// Re-habilita todos los botones de submit del paso 2. Llamado en
// failSimple, enterStep2 y onGoManual para evitar dead-ends.
function reenableStep2Buttons() {
  for (const id of ["btnPasswordContinue", "btnSimpleConnect"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  }
}

// Punto de entrada al paso 2 — llamado cada vez que el wizard navega allí.
// Resetea el estado y arranca la auto-detección sin pedir nada al usuario.
function enterStep2() {
  ui.wizardActive = true;
  goToStep(2);
  // Reset de UI: vista auto, sin mensajes, banner limpio, botones libres
  hideWizMsg(2);
  showStep2View("auto");
  resetAutoProgress();
  reenableStep2Buttons();
  $("#autoHeroTitle").textContent = "Conectando con tu sistema…";
  // Limpia los inputs de password de sesiones previas
  const pwd = document.getElementById("simplePassword");
  if (pwd) pwd.value = "";
  const pwdM = document.getElementById("simplePasswordManual");
  if (pwdM) pwdM.value = "";
  // Arrancar el flujo automático
  startAutoFlow();
}

// Fase 1 del flujo invisible: detecta el host, decide si seguir directo
// (si ya tenemos password en sesión) o pedir solamente la contraseña.
async function startAutoFlow() {
  $("#autoProgress").classList.remove("hidden");
  setAutoStep("detect", "active");

  // Detect host (sin credenciales — best-effort, ~500ms)
  let host = "localhost";
  let port = 1433;
  try {
    const { data } = await api("/api/db/detect");
    if (data?.found && Array.isArray(data.candidates) && data.candidates[0]) {
      host = data.candidates[0].host;
      port = data.candidates[0].port;
    }
  } catch { /* fallback a localhost:1433 */ }
  ui.wiz2.host = host;
  ui.wiz2.port = port;

  // Si tenemos password en memoria de esta sesión, continuamos invisible.
  // Si no, pedimos sólo la contraseña (usuario "sa" implícito o el guardado).
  const cfgUser = ui.configState?.db?.user || "sa";
  ui.wiz2.user = cfgUser;
  if (ui.wiz2.password) {
    return runFullFlow({
      host, port, user: ui.wiz2.user, password: ui.wiz2.password, adv: readAdv(),
    });
  }
  // Necesitamos contraseña — vista password con el host ya detectado.
  setAutoStep("detect", "done");
  showStep2View("password");
  setTimeout(() => document.getElementById("simplePassword")?.focus(), 80);
}

// Disparado por el botón "Continuar" o Enter en el campo de contraseña.
async function onPasswordContinue() {
  const pwd = document.getElementById("simplePassword")?.value || "";
  if (!pwd) {
    showWizMsg(2, "err", "Falta la contraseña", "Ingresa tu contraseña para continuar.");
    return;
  }
  ui.wiz2.password = pwd;
  document.getElementById("btnPasswordContinue").disabled = true;
  // Volvemos a la vista auto y continuamos el flujo
  hideWizMsg(2);
  showStep2View("auto");
  $("#autoHeroTitle").textContent = "Conectando con tu sistema…";
  $("#autoProgress").classList.remove("hidden");
  setAutoStep("detect", "done"); // ya detectado en startAutoFlow
  setAutoStep("prepare", "active");
  await runFullFlow({
    host: ui.wiz2.host, port: ui.wiz2.port,
    user: ui.wiz2.user, password: pwd, adv: readAdv(),
  });
}

// Disparado por "Intentar nuevamente" en el fallback view.
function onRetryAuto() {
  ui.wiz2.password = ""; // forzar re-prompt
  enterStep2();
}

// Disparado por "Configurar manualmente" en el fallback view (o el link
// chiquito de la vista password). Revela el form completo.
function onGoManual() {
  hideWizMsg(2);
  resetAutoProgress();
  reenableStep2Buttons();
  // Si el usuario ya tipeó algo en la vista password, lo pasamos al
  // input manual para no perder lo escrito (pequeño UX win).
  const pwdSimple = document.getElementById("simplePassword");
  const pwdManual = document.getElementById("simplePasswordManual");
  if (pwdSimple && pwdManual && pwdSimple.value && !pwdManual.value) {
    pwdManual.value = pwdSimple.value;
  }
  showStep2View("manual");
  // Pre-llenar usuario si lo tenemos
  const u = document.getElementById("simpleUser");
  if (u && ui.configState?.db?.user) u.value = ui.configState.db.user;
}

// Disparado por el botón "Conectar" en el manual view.
async function onManualConnect() {
  hideWizMsg(2);
  const user = (document.getElementById("simpleUser")?.value || "").trim();
  const password = document.getElementById("simplePasswordManual")?.value || "";
  if (!user || !password) {
    showWizMsg(2, "err", "Faltan datos", "Ingresa usuario y contraseña.");
    return;
  }
  ui.wiz2.user = user;
  ui.wiz2.password = password;
  document.getElementById("btnSimpleConnect").disabled = true;
  // Saltamos a la vista auto para mostrar el progreso
  showStep2View("auto");
  $("#autoHeroTitle").textContent = "Conectando con tu sistema…";
  $("#autoProgress").classList.remove("hidden");
  setAutoStep("detect", "active");

  const adv = readAdv();
  let host = adv.host || ui.wiz2.host || "localhost";
  let port = adv.port || ui.wiz2.port || 1433;
  if (!adv.host) {
    try {
      const { data } = await api("/api/db/detect");
      if (data?.found && data.candidates?.[0]) {
        host = data.candidates[0].host;
        port = data.candidates[0].port;
      }
    } catch { /* fallback */ }
  }
  ui.wiz2.host = host;
  ui.wiz2.port = port;
  await runFullFlow({ host, port, user, password, adv });
}

// Núcleo del flujo: list-databases → list-tables → inspect-table →
// dry-run → save. Idéntico a antes, pero parametrizado y arranca desde el
// paso "prepare" (la detección ya pasó). No depende de qué view disparó.
async function runFullFlow(ctx) {
  const { host, port, user, password, adv } = ctx;

  // ── 2) List databases → auto-pick ───────────────────────────────────────
  let database = adv.database;
  if (!database) {
    try {
      const { data } = await api("/api/db/list-databases", {
        method: "POST", body: { host, port, user, password },
      });
      if (!data?.ok || !Array.isArray(data.databases)) {
        return failSimple(data?.friendly ?? { title: "No pude conectarme",
          detail: "Verifica usuario y contraseña." });
      }
      if (data.databases.length === 0) {
        return failSimple({ title: "Sin bases de datos",
          detail: "No encontré bases de usuario en este servidor." });
      }
      database = data.suggested ?? data.databases[0];
    } catch (err) {
      return failSimple({ title: "Error de red", detail: err.message });
    }
  }
  ui.wiz2.database = database;

  setAutoStep("detect", "done");
  setAutoStep("prepare", "active");

  // ── 3) List tables → pickSuggestedTable ─────────────────────────────────
  let table = adv.table;
  if (!table) {
    try {
      const { data } = await api("/api/db/list-tables", {
        method: "POST", body: { host, port, user, password, database },
      });
      if (!data?.ok || !Array.isArray(data.tables) || data.tables.length === 0) {
        return failSimple(data?.friendly ?? { title: "Sin tablas",
          detail: `No encontré tablas en "${database}".` });
      }
      table = data.suggested ?? data.tables[0].qualified;
    } catch (err) {
      return failSimple({ title: "Error de red", detail: err.message });
    }
  }
  ui.wiz2.table = table;

  // ── 4) Inspect table → autoMap (overrides desde avanzado) ───────────────
  let mapping = { sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" };
  try {
    const { data } = await api("/api/db/inspect-table", {
      method: "POST", body: { host, port, user, password, database, table },
    });
    if (data?.ok && data.suggestion?.mapping) {
      mapping = { ...mapping, ...data.suggestion.mapping };
    }
  } catch { /* defaults — dry-run dará el veredicto real */ }
  if (adv.sku) mapping.sku = adv.sku;
  if (adv.name) mapping.name = adv.name;
  if (adv.price) mapping.price = adv.price;
  if (adv.stock) mapping.stock = adv.stock;
  ui.wiz2.mapping = mapping;

  setAutoStep("prepare", "done");
  setAutoStep("verify", "active");

  // ── 5) Dry-run — total + allGood para decidir mensaje y timing ─────────
  let total = 0, allGood = true, humanIssues = [];
  try {
    const { data } = await api("/api/sync/dry-run", {
      method: "POST",
      body: {
        db: { type: "sqlserver", host, port, user, password, database },
        mapping: { table, ...mapping },
      },
    });
    if (!data?.ok) {
      return failSimple(data?.friendly ?? { title: "No pude verificar tus datos",
        detail: "El agente no pudo leer la tabla. Revisa los permisos." });
    }
    total = data.summary?.total ?? 0;
    allGood = data.summary?.allGood !== false;
    humanIssues = Array.isArray(data.humanIssues) ? data.humanIssues : [];
    if (total === 0) {
      return failSimple({ title: "Sin productos",
        detail: `No encontré productos en la tabla "${table}".` });
    }
  } catch (err) {
    return failSimple({ title: "Error de red", detail: err.message });
  }

  setAutoStep("verify", "done");

  // ── 6) Save config — backend dispara syncNow al detectar invalid→valid
  try {
    const { ok, data } = await api("/api/config", {
      method: "POST",
      body: {
        db: { type: "sqlserver", host, port, user, password, database },
        mapping: { table, ...mapping },
      },
    });
    if (!ok) {
      const detail = data?.errors?.join(" · ") ?? data?.error ?? "Reintenta.";
      return failSimple({ title: "No se pudo guardar la configuración", detail });
    }
  } catch (err) {
    return failSimple({ title: "Error al guardar", detail: err.message });
  }

  // ── 7) Pantalla de éxito + auto-redirect (timings reducidos) ───────────
  // T005: allGood → 1.8s (antes 2.5s); con warning → 3.5s (antes 4s).
  ui.wizardResults.system = "ok";
  ui.wizardResults.products = "ok";
  $("#simpleProductCount").textContent = String(total);
  const warn = $("#dataWarning");
  if (warn) {
    if (!allGood) {
      const top = humanIssues[0];
      warn.textContent = top
        ? `Aviso: ${top}. Las filas inválidas se omitirán automáticamente.`
        : "Aviso: algunos productos tienen datos inválidos y se omitirán automáticamente.";
      warn.classList.remove("hidden");
    } else {
      warn.classList.add("hidden");
      warn.textContent = "";
    }
  }
  goToStep(3);
  // Marcamos para que el dashboard anime el counter al renderizar.
  ui.justEnteredDashboard = { productCount: total };
  const redirectMs = allGood ? 1800 : 3500;
  setTimeout(() => {
    ui.wizardActive = false;
    setWelcomeDismissed();
    loadConfig();
  }, redirectMs);
}

// ── Dashboard ────────────────────────────────────────────────────────────
function renderDashboard(s) {
  const hero = $("#statusHero");
  const heroTitle = $("#statusHeroTitle");
  const heroSub = $("#statusHeroSub");

  $("#kpiLastSync").textContent = s.lastSync?.at ? fmt.date(s.lastSync.at) : "Nunca";

  // T006 Dashboard vivo: si acabamos de llegar desde el wizard, animamos
  // el contador de productos desde 0 con easing. Después de eso, render
  // normal sin animación.
  const productsKpi = $("#kpiProducts");
  if (ui.justEnteredDashboard && productsKpi) {
    const target = typeof s.productsSynced === "number" && s.productsSynced > 0
      ? s.productsSynced
      : ui.justEnteredDashboard.productCount;
    animateCountUp(productsKpi, target);
    ui.justEnteredDashboard = null;
  } else {
    productsKpi.textContent = fmt.num(s.productsSynced);
  }
  $("#kpiNextRun").textContent = s.isSyncing ? "Sincronizando…" : fmt.futureMin(s.nextRunAt);

  let state = "warn", title = "Sin verificar", sub = "Aún no se ha probado la conexión.";
  if (s.isSyncing) {
    state = "syncing"; title = "Sincronizando ahora";
    sub = "Enviando catálogo a LinkServi…";
  } else if (s.connection?.ok) {
    if (s.lastSync?.ok === false) {
      state = "err"; title = "Error en última sincronización";
      sub = s.lastSync.summary ?? "Hubo un problema. Reintentaremos en el próximo ciclo.";
    } else {
      state = "ok"; title = "Sincronización activa";
      sub = s.lastSync?.summary ?? `Cada ${s.intervalMin ?? 15} minutos automáticamente.`;
    }
  } else if (s.connection?.lastCheckedAt) {
    state = "err"; title = "Sin conexión";
    sub = s.connection.message ?? "Verifica que tu sistema esté encendido.";
  }
  hero.dataset.state = state;
  heroTitle.textContent = title;
  heroSub.textContent = sub;
  $("#kpiState").textContent = ({ ok: "🟢 Activo", syncing: "🟡 Sincronizando", err: "🔴 Error", warn: "⏳ Pendiente" })[state] ?? "—";
}

function renderRecentErrors() {
  const box = $("#errorsBox");
  const list = $("#errorsList");
  const errs = ui.recentErrors.slice(-3).reverse();
  if (errs.length === 0) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  list.innerHTML = errs.map((e) => `
    <li>
      ${escapeHtml(e.message)}
      <span class="err-time">${new Date(e.ts).toLocaleString("es-VE", { hour12: false })}</span>
    </li>
  `).join("");
}

// ── Configuración avanzada (form completo) ──────────────────────────────
function renderConfigForm(cfg) {
  ui.configState = cfg;
  const f = $("#configForm");
  f.querySelector('[name="apiUrl"]').value = cfg.apiUrl ?? "";
  f.querySelector('[name="apiKey"]').value = "";
  f.querySelector('[name="apiKey"]').placeholder = cfg._apiKeySet ? `Actual: ${cfg.apiKey}` : "Pega aquí la clave del panel /integrations";
  f.querySelector('[name="intervalMin"]').value = String(cfg.intervalMin ?? 15);
  const db = cfg.db ?? {};
  f.querySelector('[name="db.type"]').value = db.type ?? "sqlserver";
  f.querySelector('[name="db.host"]').value = db.host ?? "";
  f.querySelector('[name="db.port"]').value = db.port ?? "";
  f.querySelector('[name="db.user"]').value = db.user ?? "";
  f.querySelector('[name="db.password"]').value = "";
  f.querySelector('[name="db.password"]').placeholder = cfg._dbPasswordSet ? "(sin cambios — ya configurada)" : "Contraseña SQL Server";
  f.querySelector('[name="db.database"]').value = db.database ?? "";
  const m = cfg.mapping ?? {};
  f.querySelector('[name="mapping.table"]').value = m.table ?? "productos";
  f.querySelector('[name="mapping.sku"]').value = m.sku ?? "codigo";
  f.querySelector('[name="mapping.name"]').value = m.name ?? "descripcion";
  f.querySelector('[name="mapping.price"]').value = m.price ?? "precio";
  f.querySelector('[name="mapping.stock"]').value = m.stock ?? "existencia";

  // Pre-llenar wizard con la config guardada — la config siempre gana sobre
  // los defaults. En FASE FINAL los inputs viven dentro de step2View_manual
  // y pueden no existir en el DOM si la vista activa es otra; usamos
  // optional chaining para que sea seguro.
  if (cfg.apiUrl && $("#wizApiUrl") && !$("#wizApiUrl").value) $("#wizApiUrl").value = cfg.apiUrl;
  const setIf = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null && val !== "") el.value = val; };
  setIf("simpleUser", db.user);
  setIf("advHost", db.host);
  setIf("advPort", db.port);
  setIf("advDatabase", db.database);
  setIf("advTable", m.table);
  setIf("advSku", m.sku);
  setIf("advName", m.name);
  setIf("advPrice", m.price);
  setIf("advStock", m.stock);
}

// Animación count-up: incrementa el texto de un elemento desde 0 hasta
// `target` con easing easeOutCubic. Usado en el dashboard para que el KPI
// "Productos sincronizados" se sienta vivo al llegar desde el wizard.
function animateCountUp(el, target, durationMs = 1200) {
  if (!el || typeof target !== "number" || target <= 0) return;
  const startTs = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - startTs) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.floor(target * eased).toLocaleString("es-VE");
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function serializeForm() {
  const f = $("#configForm");
  const get = (name) => f.querySelector(`[name="${name}"]`).value.trim();
  const patch = {
    apiUrl: get("apiUrl"),
    intervalMin: Number(get("intervalMin")),
    db: {
      type: get("db.type"),
      host: get("db.host"),
      port: get("db.port") ? Number(get("db.port")) : 1433,
      user: get("db.user"),
      database: get("db.database"),
    },
    mapping: {
      table: get("mapping.table") || "productos",
      sku: get("mapping.sku") || "codigo",
      name: get("mapping.name") || "descripcion",
      price: get("mapping.price") || "precio",
      stock: get("mapping.stock") || "existencia",
    },
  };
  const apiKey = get("apiKey");
  if (apiKey) patch.apiKey = apiKey;
  const pwd = f.querySelector('[name="db.password"]').value;
  if (pwd) patch.db.password = pwd;
  return patch;
}

async function onSaveConfig(e) {
  e.preventDefault();
  const msg = $("#configMsg");
  msg.className = "config-msg";
  msg.textContent = "Guardando…";
  try {
    const patch = serializeForm();
    const { ok, data } = await api("/api/config", { method: "POST", body: patch });
    if (ok) {
      msg.className = "config-msg ok";
      msg.textContent = "Configuración guardada ✓";
      if (data?.config) renderConfigForm(data.config);
      decideScreen();
      setTimeout(() => { msg.textContent = ""; }, 3000);
    } else {
      msg.className = "config-msg err";
      msg.textContent = data?.errors?.join(" · ") ?? data?.error ?? "Error al guardar";
    }
  } catch (err) {
    msg.className = "config-msg err";
    msg.textContent = err.message;
  }
}

// ── Sincronizar ahora (CTA grande) ──────────────────────────────────────
async function onSyncNow() {
  const btn = $("#btnSyncNow");
  btn.disabled = true;
  const originalLabel = btn.querySelector(".cta-label").textContent;
  btn.querySelector(".cta-label").textContent = "INICIANDO…";
  try {
    const { status, data } = await api("/api/sync-now", { method: "POST" });
    if (status === 409) {
      btn.querySelector(".cta-label").textContent = "YA EN PROGRESO";
      setTimeout(() => { btn.querySelector(".cta-label").textContent = originalLabel; btn.disabled = false; }, 2000);
    } else if (data?.ok) {
      btn.querySelector(".cta-label").textContent = "SINCRONIZANDO…";
      setTimeout(() => { btn.querySelector(".cta-label").textContent = originalLabel; btn.disabled = false; }, 3000);
    } else {
      btn.querySelector(".cta-label").textContent = originalLabel;
      btn.disabled = false;
    }
  } catch {
    btn.querySelector(".cta-label").textContent = originalLabel;
    btn.disabled = false;
  }
}

// ── Polling ──────────────────────────────────────────────────────────────
async function loadConfig() {
  const { ok, data } = await api("/api/config");
  if (ok && data?.config) {
    renderConfigForm(data.config);
    decideScreen();
  }
}

async function pollStatus() {
  try {
    const { ok, data } = await api("/api/status");
    if (ok && data) {
      $("#versionLabel").textContent = `v${data.version ?? "—"}`;
      renderDashboard(data);
    }
  } catch { /* ignore */ }
}

async function pollLogs() {
  try {
    const { ok, data } = await api(`/api/logs?since=${ui.lastLogId}&limit=100`);
    if (ok && data?.events?.length) {
      const events = data.events;
      ui.lastLogId = Math.max(ui.lastLogId, events[events.length - 1].id);
      // Acumular errores recientes (máx 10 retenidos, mostramos 3)
      for (const e of events) {
        if (e.level === "error") {
          ui.recentErrors.push({ ts: e.ts, message: e.message });
          if (ui.recentErrors.length > 10) ui.recentErrors.shift();
        }
      }
      renderRecentErrors();
      renderRawLogs(events);
    }
  } catch { /* ignore */ }
}

function renderRawLogs(events) {
  const list = $("#logList");
  if (!list) return;
  const empty = list.querySelector(".logs-empty");
  if (empty) empty.remove();
  for (const e of events) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <span class="ts">${new Date(e.ts).toLocaleTimeString("es-VE", { hour12: false })}</span>
      <span class="lvl lvl-${e.level}">${e.level}</span>
      <span class="msg">${escapeHtml(e.message)}${e.meta ? `<span class="meta">${escapeHtml(JSON.stringify(e.meta))}</span>` : ""}</span>
    `;
    list.appendChild(row);
  }
  while (list.childElementCount > 150) list.removeChild(list.firstChild);
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  if (nearBottom) list.scrollTop = list.scrollHeight;
}

async function pollHealth() {
  try {
    const { ok, data } = await api("/api/health");
    if (!ok || !data) return;
    const chip = $("#healthChip");
    if (!chip) return;
    if (data.ok) {
      chip.dataset.state = "ok";
      chip.querySelector(".label").textContent = "Sistema listo";
      chip.title = "Todos los chequeos pasan";
    } else {
      const fsBad = data.checks?.filesystem === false;
      chip.dataset.state = fsBad ? "err" : "warn";
      chip.querySelector(".label").textContent = fsBad ? "Problema" : "Falta configurar";
      chip.title = (data.issues ?? []).map((i) => `• ${i.message}`).join("\n") || "Revisar configuración";
    }
  } catch { /* ignore */ }
}

// ── Init ────────────────────────────────────────────────────────────────
function init() {
  $("#logList").innerHTML = '<div class="logs-empty">Esperando eventos…</div>';
  setupWelcome();
  $("#btnWizValidate").addEventListener("click", onValidateAccount);
  $("#btnWizPair").addEventListener("click", onPairWithCode);
  // Normalizar el input de código a mayúsculas y filtrar caracteres no válidos.
  $("#wizPairCode").addEventListener("input", (e) => {
    e.target.value = (e.target.value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8);
  });
  // Paso 2 (FASE FINAL) — wireup de las 4 vistas
  $("#btnPasswordContinue").addEventListener("click", onPasswordContinue);
  $("#simplePassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); onPasswordContinue(); }
  });
  $("#btnGoManualFromPwd").addEventListener("click", onGoManual);
  $("#btnRetryAuto").addEventListener("click", onRetryAuto);
  $("#btnGoManual").addEventListener("click", onGoManual);
  $("#btnSimpleConnect").addEventListener("click", onManualConnect);
  // Enter en los campos del manual view también dispara el connect
  for (const id of ["#simpleUser", "#simplePasswordManual"]) {
    $(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); onManualConnect(); }
    });
  }
  // Paso 3 — sin botones (auto-redirect a dashboard)
  $("#btnSyncNow").addEventListener("click", onSyncNow);
  $("#configForm").addEventListener("submit", onSaveConfig);

  loadConfig();
  pollStatus();
  pollLogs();
  pollHealth();
  setInterval(pollStatus, 3000);
  setInterval(pollLogs, 2500);
  setInterval(pollHealth, 8000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
