import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Link2, FileUp, Sheet, Building2, ArrowRight, ChevronLeft,
  CheckCircle2, RefreshCw, AlertTriangle, Loader2, ExternalLink, Sparkles,
  Package, Eye, ShieldCheck,
} from "lucide-react";
import ExcelJS from "exceljs";
import { getAuthHeader } from "@/lib/api";

type Step = "connect" | "preview" | "syncing" | "result";
type SourceTab = "url" | "file" | "sheets";

interface MyStore { id: number; name: string; logoUrl: string | null }
interface PreviewProduct { name: string; price: number | null; imageUrl: string | null }

interface RunStatus {
  id: number;
  storeId: number;
  status: "running" | "completed" | "failed";
  totalDetected: number;
  created: number;
  updated: number;
  errors: number;
  errorLog: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const SYNC_MESSAGES = [
  "Conectando con tu sistema…",
  "Detectando estructura de catálogo…",
  "Sincronizando productos en tiempo real…",
  "Optimizando imágenes…",
  "Activando tu tienda en LinkServi…",
];

export function EnterpriseImportPage() {
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("connect");
  const [tab, setTab] = useState<SourceTab>("file");

  const [stores, setStores] = useState<MyStore[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);

  const [sourceUrl, setSourceUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");

  // Auto-sync controls (only for URL + Sheets — file uploads are one-shot)
  const [autoSync, setAutoSync] = useState(true);
  const [intervalMin, setIntervalMin] = useState(15);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [previewItems, setPreviewItems] = useState<PreviewProduct[]>([]);
  const [previewTotal, setPreviewTotal] = useState<number>(0);
  const [previewWarn, setPreviewWarn] = useState<string | null>(null);

  const [runId, setRunId] = useState<number | null>(null);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const [pollError, setPollError] = useState<string | null>(null);

  // Load my stores. Honor ?storeId=<id> from query string when valid (came from a store dashboard).
  useEffect(() => {
    fetch("/api/imports/my-stores", { headers: getAuthHeader() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MyStore[]) => {
        setStores(data);
        if (data.length === 0) return;
        const params = new URLSearchParams(window.location.search);
        const requested = Number(params.get("storeId"));
        const owned = Number.isFinite(requested) && requested > 0
          && data.some((s) => s.id === requested);
        setStoreId(owned ? requested : data[0].id);
      })
      .catch(() => setStores([]));
  }, []);

  // Rotate sync messages while running
  useEffect(() => {
    if (step !== "syncing") return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % SYNC_MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, [step]);

  // Poll run status — with consecutive-failure tracking and a 3-minute watchdog.
  useEffect(() => {
    if (!runId || step !== "syncing") return;
    let alive = true;
    let consecutiveFails = 0;
    const startedAt = Date.now();
    const WATCHDOG_MS = 3 * 60 * 1000;

    const poll = async () => {
      // Watchdog: if we've been polling for too long without completion, surface error.
      if (Date.now() - startedAt > WATCHDOG_MS) {
        setPollError("La importación está tardando más de lo esperado. Revisa el estado más tarde.");
        return;
      }
      try {
        const res = await fetch(`/api/imports/runs/${runId}`, { headers: getAuthHeader() });
        if (!res.ok) {
          consecutiveFails++;
          if (consecutiveFails >= 5) setPollError("Perdimos contacto con el servidor. Reintenta en unos segundos.");
          return;
        }
        consecutiveFails = 0;
        setPollError(null);
        const data: RunStatus = await res.json();
        if (!alive) return;
        setRun(data);
        if (data.status !== "running") setStep("result");
      } catch {
        consecutiveFails++;
        if (consecutiveFails >= 5) setPollError("Sin conexión. Verifica tu internet.");
      }
    };
    poll();
    const t = setInterval(poll, 800);
    return () => { alive = false; clearInterval(t); };
  }, [runId, step]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
    const isText = /\.(csv|json|txt)$/i.test(file.name);
    if (!isXlsx && !isText) {
      setSubmitError("Formato no soportado. Usa CSV, XLSX, XLS, JSON o TXT.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setSubmitError("El archivo es muy grande (máx 30MB).");
      return;
    }
    setSubmitError(null);
    setFileName(file.name);
    try {
      let text: string;
      if (isXlsx) {
        // Parse XLSX in the browser, convert the first sheet to CSV.
        // Backend already accepts CSV via the same csvContent payload.
        const buf = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buf);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error("El archivo Excel no tiene hojas.");
        const csvRows: string[] = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const values = (row.values as (ExcelJS.CellValue | null)[]).slice(1).map((v) => {
            const str = v === null || v === undefined ? "" : String(v);
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          });
          csvRows.push(values.join(","));
        });
        text = csvRows.join("\n");
        if (!text.trim()) throw new Error("La hoja de Excel está vacía.");
      } else {
        text = await file.text();
      }
      setCsvContent(text);
    } catch (err: any) {
      setSubmitError(err?.message ?? "No pudimos leer el archivo. Intenta con otro formato.");
      setFileName("");
      setCsvContent("");
    }
  };

  // Client-side preview parser — accepts JSON array or CSV. Best-effort,
  // never blocks the actual import (backend re-parses authoritatively).
  const parsePreview = (text: string): { items: PreviewProduct[]; total: number } => {
    const trimmed = text.trim();
    if (!trimmed) return { items: [], total: 0 };

    // Try JSON first
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        const arr: any[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.products) ? parsed.products
          : Array.isArray(parsed?.items) ? parsed.items
          : Array.isArray(parsed?.data) ? parsed.data
          : [];
        const items = arr.slice(0, 6).map((row): PreviewProduct => ({
          name: String(row?.name ?? row?.title ?? row?.product ?? row?.nombre ?? "Producto"),
          price: typeof row?.price === "number" ? row.price
            : typeof row?.precio === "number" ? row.precio
            : Number(row?.price ?? row?.precio ?? row?.cost) || null,
          imageUrl: row?.image ?? row?.imageUrl ?? row?.imagen ?? row?.photo ?? row?.foto ?? null,
        }));
        return { items, total: arr.length };
      } catch { /* fall through to CSV */ }
    }

    // CSV fallback
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { items: [], total: 0 };
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
    const idx = (...names: string[]) => headers.findIndex((h) => names.includes(h));
    const nameIdx = idx("name", "nombre", "title", "product", "producto");
    const priceIdx = idx("price", "precio", "cost", "amount", "monto");
    const imageIdx = idx("image", "imagen", "imageurl", "image_url", "photo", "foto");

    const splitCsv = (line: string) => {
      const out: string[] = []; let cur = ""; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { q = !q; continue; }
        if (c === "," && !q) { out.push(cur); cur = ""; continue; }
        cur += c;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };

    const rows = lines.slice(1);
    const items = rows.slice(0, 6).map((line): PreviewProduct => {
      const cols = splitCsv(line);
      return {
        name: nameIdx >= 0 ? (cols[nameIdx] || "Producto") : "Producto",
        price: priceIdx >= 0 ? (Number(cols[priceIdx]) || null) : null,
        imageUrl: imageIdx >= 0 ? (cols[imageIdx] || null) : null,
      };
    });
    return { items, total: rows.length };
  };

  // Convert any Google Sheets URL to its CSV export endpoint.
  // Accepts:
  //   https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
  //   https://docs.google.com/spreadsheets/d/<ID>/edit?usp=sharing
  //   https://docs.google.com/spreadsheets/d/<ID>/
  //   https://docs.google.com/spreadsheets/d/e/<LONG_ID>/pubhtml  (Publish-to-Web)
  //   https://docs.google.com/spreadsheets/d/e/<LONG_ID>/pub?output=csv (already CSV)
  // Returns null if the URL doesn't look like a Sheets URL.
  const sheetsToCsvUrl = (raw: string): string | null => {
    // Already a CSV-export URL? Pass through unchanged.
    if (/docs\.google\.com\/spreadsheets\/.*[?&](output|format)=csv/i.test(raw)) {
      return raw;
    }
    // "Publish to Web" variant: /spreadsheets/d/e/<long_id>/pubhtml → /pub?output=csv
    // Para hojas con varias pestañas hay que pasar `single=true` además del gid,
    // de lo contrario Google ignora el gid y exporta la primera pestaña.
    const pub = raw.match(/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pub) {
      const gidMatch = raw.match(/[#&?]gid=(\d+)/);
      const tabParams = gidMatch ? `&single=true&gid=${gidMatch[1]}` : "";
      return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${tabParams}`;
    }
    // Standard "Share" link: /spreadsheets/d/<id>/edit...
    const m = raw.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) return null;
    const sheetId = m[1];
    const gidMatch = raw.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  };

  // Resolve the effective URL for the current tab (url or sheets).
  const effectiveUrl = (): string | null => {
    if (tab === "url") return sourceUrl.trim() || null;
    if (tab === "sheets") {
      const raw = sheetsUrl.trim();
      if (!raw) return null;
      return sheetsToCsvUrl(raw);
    }
    return null;
  };

  const goToPreview = async () => {
    setSubmitError(null);
    if (!storeId) { setSubmitError("Selecciona una tienda primero."); return; }
    if (tab === "url" && !sourceUrl.trim()) { setSubmitError("Ingresa la URL del catálogo."); return; }
    if (tab === "sheets") {
      if (!sheetsUrl.trim()) { setSubmitError("Pega el enlace de tu Google Sheet."); return; }
      if (!sheetsToCsvUrl(sheetsUrl)) {
        setSubmitError("El enlace no parece un Google Sheet válido. Debe contener docs.google.com/spreadsheets/d/...");
        return;
      }
    }
    if (tab === "file" && !csvContent) { setSubmitError("Sube un archivo primero."); return; }

    setSubmitting(true);
    setPreviewWarn(null);
    try {
      let text = csvContent;
      const urlToFetch = effectiveUrl();
      if (urlToFetch) {
        // Best-effort client fetch (CORS may block — that's fine, we still sync).
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4000);
          const r = await fetch(urlToFetch, {
            signal: ctrl.signal,
            headers: apiKey && tab === "url" ? { Authorization: `Bearer ${apiKey}` } : undefined,
          });
          clearTimeout(t);
          text = r.ok ? await r.text() : "";
        } catch {
          text = "";
        }
      }
      const { items, total } = parsePreview(text);
      setPreviewItems(items);
      setPreviewTotal(total);
      if (items.length === 0) {
        setPreviewWarn(
          tab === "url"
            ? "No pudimos leer el catálogo desde tu navegador (común con APIs privadas). La activación de tu tienda continuará normalmente desde nuestros servidores."
            : tab === "sheets"
            ? "No pudimos leer la hoja desde tu navegador. Asegúrate de que el Google Sheet sea público o esté compartido con 'Cualquiera con el enlace'. Continuamos igual."
            : "No pudimos generar la previsualización. Continuemos — el sistema procesará tu archivo igual.",
        );
      }
      setStep("preview");
    } finally {
      setSubmitting(false);
    }
  };

  const startImport = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      let body: Record<string, unknown>;
      if (tab === "file") {
        body = { storeId, sourceType: "file", csvContent };
      } else {
        // URL + Sheets share the same backend path: sourceType "url".
        const urlToUse = effectiveUrl();
        if (!urlToUse) throw new Error("URL inválida.");
        body = {
          storeId,
          sourceType: "url",
          sourceUrl: urlToUse,
          apiKey: tab === "url" ? (apiKey.trim() || undefined) : undefined,
          autoSync,
          intervalMin: Math.max(5, Math.min(1440, Number(intervalMin) || 15)),
        };
      }

      const res = await fetch("/api/imports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error activando tu tienda");
      setRunId(data.runId);
      setRun(null);
      setMsgIdx(0);
      setStep("syncing");
    } catch (err: any) {
      setSubmitError(err?.message ?? "Error activando tu tienda");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep("connect");
    setRunId(null);
    setRun(null);
    setSourceUrl(""); setApiKey(""); setSheetsUrl(""); setCsvContent(""); setFileName("");
    setPreviewItems([]); setPreviewTotal(0); setPreviewWarn(null);
    setSubmitError(null);
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const progressPct = useMemo(() => {
    if (!run || run.totalDetected === 0) return 12;
    const done = run.created + run.updated + run.errors;
    return Math.min(100, Math.max(8, Math.round((done / run.totalDetected) * 100)));
  }, [run]);

  const errorList = useMemo(() => {
    if (!run?.errorLog) return [];
    try { return JSON.parse(run.errorLog) as { row: number; message: string }[]; }
    catch { return []; }
  }, [run]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white" style={{ background: "#040c1a" }}>
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl"
        style={{ background: "rgba(4,12,26,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/")}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            aria-label="Volver">
            <ChevronLeft className="w-5 h-5 text-white/70" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400/80">LinkServi Instant Store</p>
            <h1 className="text-lg sm:text-xl font-black leading-tight">Catálogo</h1>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-300">Sistema activo</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          {step === "connect" && (
            <motion.div key="connect" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.32 }}>
              {/* Hero */}
              <div className="mb-8 sm:mb-10">
                <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.05]"
                  style={{
                    background: "linear-gradient(135deg, #ffffff 30%, rgba(6,182,212,0.85) 100%)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>
                  Conecta tu catálogo<br/>en segundos
                </h2>
                <p className="mt-3 text-base sm:text-lg max-w-2xl" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Activa tu tienda en LinkServi sin cambiar tu sistema.
                </p>
              </div>

              {/* Store selector */}
              <div className="mb-5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2 block">Tienda destino</label>
                {stores.length === 0 ? (
                  <div className="p-4 rounded-2xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)" }}>
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-amber-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold text-amber-300">No tienes tiendas creadas</p>
                        <p className="text-sm text-amber-200/70 mt-1">Crea una tienda primero para poder importar productos.</p>
                        <button onClick={() => navigate("/cohost/stores")}
                          className="mt-3 px-4 py-2 rounded-xl text-sm font-bold text-white"
                          style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}>
                          Crear tienda →
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <select value={storeId ?? ""} onChange={(e) => setStoreId(Number(e.target.value))}
                    className="w-full px-4 py-3.5 rounded-2xl font-bold text-white appearance-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { id: "file" as const, icon: FileUp, label: "Subir archivo" },
                  { id: "url" as const, icon: Link2, label: "URL del catálogo" },
                  { id: "sheets" as const, icon: Sheet, label: "Google Sheets" },
                ].map(({ id, icon: Icon, label }) => {
                  const active = tab === id;
                  return (
                    <button key={id} onClick={() => setTab(id)}
                      className="relative p-3 rounded-2xl text-left transition-all"
                      style={{
                        background: active ? "rgba(6,182,212,0.12)" : "rgba(255,255,255,0.03)",
                        border: active ? "1.5px solid rgba(6,182,212,0.6)" : "1px solid rgba(255,255,255,0.08)",
                      }}>
                      <Icon className={`w-4 h-4 mb-1.5 ${active ? "text-cyan-400" : "text-white/50"}`} />
                      <p className={`text-xs sm:text-sm font-bold leading-tight ${active ? "text-white" : "text-white/70"}`}>{label}</p>
                    </button>
                  );
                })}
              </div>

              {/* Inputs panel */}
              <div className="p-5 sm:p-6 rounded-3xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {tab === "file" && (
                  <FileDropZone fileName={fileName} onFile={handleFile} />
                )}

                {tab === "url" && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2 block">
                        URL del catálogo (CSV o JSON)
                      </label>
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://tu-sistema.com/catalogo.csv"
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 outline-none focus:border-cyan-400/60 transition-colors"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
                      />
                      <p className="text-xs text-white/40 mt-2">
                        Acepta CSV, JSON, XLSX o TSV. Tu servidor debe responder con el catálogo en respuesta directa.
                      </p>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2 block">
                        API Key (opcional)
                      </label>
                      <input
                        type="text"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Si tu API requiere autenticación"
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 outline-none focus:border-cyan-400/60 transition-colors"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
                      />
                      <p className="text-xs text-white/40 mt-2">
                        Se enviará como cabecera <code className="text-cyan-300">Authorization: Bearer &lt;api-key&gt;</code> en cada petición al catálogo.
                      </p>
                    </div>
                    <AutoSyncControls
                      enabled={autoSync}
                      onEnabledChange={setAutoSync}
                      intervalMin={intervalMin}
                      onIntervalChange={setIntervalMin}
                    />
                  </div>
                )}

                {tab === "sheets" && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2 block">
                        Enlace de tu Google Sheet
                      </label>
                      <input
                        type="url"
                        value={sheetsUrl}
                        onChange={(e) => setSheetsUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 outline-none focus:border-cyan-400/60 transition-colors"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
                      />
                    </div>
                    <div className="p-3 rounded-xl text-xs space-y-1.5" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.18)" }}>
                      <p className="font-bold text-cyan-300">Cómo prepararlo:</p>
                      <ol className="list-decimal pl-4 text-white/70 space-y-0.5">
                        <li>Abre tu hoja en Google Sheets.</li>
                        <li>Pulsa "Compartir" → cambia a <strong>Cualquier persona con el enlace</strong> (Lector).</li>
                        <li>Copia el enlace de la barra del navegador y pégalo arriba.</li>
                        <li>La primera fila debe ser el encabezado: <code className="text-cyan-300">name, price, image, sku, stock</code> (o equivalentes en español).</li>
                      </ol>
                    </div>
                    <AutoSyncControls
                      enabled={autoSync}
                      onEnabledChange={setAutoSync}
                      intervalMin={intervalMin}
                      onIntervalChange={setIntervalMin}
                    />
                  </div>
                )}

                {submitError && (
                  <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: "rgb(252,165,165)" }}>
                    {submitError}
                  </div>
                )}
              </div>

              {/* CTA */}
              <button onClick={goToPreview} disabled={submitting || stores.length === 0}
                className="mt-6 w-full flex items-center justify-center gap-2.5 py-5 rounded-2xl text-lg font-black text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
                  boxShadow: "0 0 32px rgba(6,182,212,0.35), 0 8px 32px rgba(0,0,0,0.40)",
                }}>
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {submitting ? "Preparando…" : "Conectar catálogo"}
              </button>

              <p className="mt-4 text-center text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                Sin instalaciones · Sin código · Sin Excel manual
              </p>
            </motion.div>
          )}

          {step === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.32 }}>
              <div className="mb-6 sm:mb-8 flex items-center gap-3">
                <button onClick={() => setStep("connect")}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  aria-label="Volver">
                  <ChevronLeft className="w-5 h-5 text-white/70" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400/80 flex items-center gap-1.5">
                    <Eye className="w-3 h-3" /> Previsualización
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-black leading-tight mt-1">Así se verán tus productos en LinkServi</h2>
                </div>
              </div>

              {previewWarn && (
                <div className="mb-5 p-4 rounded-2xl flex items-start gap-3"
                  style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.20)" }}>
                  <ShieldCheck className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-cyan-100/90">{previewWarn}</p>
                </div>
              )}

              {previewItems.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                    {previewItems.map((p, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className="rounded-2xl overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div className="aspect-square w-full flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.04)" }}>
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt={p.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <Package className="w-10 h-10 text-white/20" />
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-bold text-white truncate">{p.name}</p>
                          {p.price !== null && (
                            <p className="text-xs font-bold text-cyan-400 mt-1 tabular-nums">${p.price.toFixed(2)}</p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {previewTotal > previewItems.length && (
                    <p className="text-center text-sm mb-6" style={{ color: "rgba(255,255,255,0.55)" }}>
                      …y <span className="font-bold text-white">{previewTotal - previewItems.length}</span> productos más se sincronizarán automáticamente.
                    </p>
                  )}
                </>
              ) : (
                <div className="p-8 rounded-3xl text-center mb-6"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Package className="w-12 h-12 mx-auto mb-3 text-white/20" />
                  <p className="font-bold text-white/70">Tu catálogo está listo para activarse</p>
                  <p className="text-sm text-white/40 mt-1">Continúa para que nuestros servidores procesen y publiquen tus productos.</p>
                </div>
              )}

              {submitError && (
                <div className="mb-4 p-3 rounded-xl text-sm"
                  style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: "rgb(252,165,165)" }}>
                  {submitError}
                </div>
              )}

              <button onClick={startImport} disabled={submitting}
                className="w-full flex items-center justify-center gap-2.5 py-5 rounded-2xl text-lg font-black text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
                  boxShadow: "0 0 32px rgba(6,182,212,0.35), 0 8px 32px rgba(0,0,0,0.40)",
                }}>
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {submitting ? "Activando…" : "Activar mi tienda"}
              </button>

              <button onClick={() => setStep("connect")}
                className="mt-3 w-full py-3 rounded-2xl text-sm font-bold text-white/60 transition-colors"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Editar conexión
              </button>
            </motion.div>
          )}

          {step === "syncing" && (
            <motion.div key="syncing" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.4 }}
              className="min-h-[70vh] flex flex-col items-center justify-center text-center">
              {/* Animated logo orb */}
              <div className="relative w-28 h-28 mb-8">
                <motion.div className="absolute inset-0 rounded-3xl"
                  style={{ background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)", boxShadow: "0 0 60px rgba(6,182,212,0.6)" }}
                  animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-12 h-12 text-white" strokeWidth={2} />
                </div>
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} className="absolute inset-0 rounded-3xl pointer-events-none"
                    style={{ border: "1.5px solid rgba(6,182,212,0.6)" }}
                    animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
                    transition={{ duration: 1.8, delay: i * 0.6, repeat: Infinity, ease: "easeOut" }} />
                ))}
              </div>

              {/* Rotating message */}
              <AnimatePresence mode="wait">
                <motion.p key={msgIdx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.4 }}
                  className="text-xl sm:text-2xl font-bold mb-3">
                  {SYNC_MESSAGES[msgIdx]}
                </motion.p>
              </AnimatePresence>

              {/* Counter */}
              {run && run.totalDetected > 0 && (
                <p className="text-sm font-bold mb-6 tabular-nums" style={{ color: "rgba(6,182,212,0.85)" }}>
                  {run.created + run.updated + run.errors} / {run.totalDetected} productos
                </p>
              )}

              {/* Progress bar */}
              <div className="w-full max-w-md h-2 rounded-full overflow-hidden mb-4"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                <motion.div className="h-full"
                  style={{ background: "linear-gradient(90deg, #06b6d4, #3b82f6)" }}
                  initial={{ width: "8%" }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }} />
              </div>
              <p className="text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.30)" }}>
                Powered by LinkServi Instant Store™
              </p>

              {pollError && (
                <div className="mt-6 max-w-md w-full p-4 rounded-2xl text-center"
                  style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)" }}>
                  <p className="text-sm font-bold text-amber-300 mb-2">{pollError}</p>
                  <button onClick={resetAll}
                    className="text-xs font-bold text-amber-200 underline">
                    Volver al inicio
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {step === "result" && run && (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div className="text-center mb-8">
                {run.status === "completed" ? (
                  <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200 }}
                    className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-5"
                    style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)", boxShadow: "0 0 40px rgba(16,185,129,0.5)" }}>
                    <CheckCircle2 className="w-11 h-11 text-white" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-5"
                    style={{ background: "rgba(239,68,68,0.15)", border: "1.5px solid rgba(239,68,68,0.5)" }}>
                    <AlertTriangle className="w-11 h-11 text-red-400" />
                  </div>
                )}
                <h2 className="text-3xl sm:text-4xl font-black mb-2">
                  {run.status === "completed" ? "Tu tienda está en vivo" : "Importación con errores"}
                </h2>
                <p className="text-base" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {run.status === "completed"
                    ? "Tu catálogo ya está disponible para miles de clientes."
                    : "Algunos productos no se pudieron importar. Revisa los detalles."}
                </p>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
                <StatCard icon={CheckCircle2} color="emerald" label="Productos agregados" value={run.created} delay={0.1} />
                <StatCard icon={RefreshCw} color="cyan" label="Productos actualizados" value={run.updated} delay={0.2} />
                <StatCard icon={AlertTriangle} color="amber" label="Errores" value={run.errors} delay={0.3} />
              </div>

              {/* System status indicators */}
              {run.status === "completed" && (
                <div className="mb-6 p-4 rounded-2xl"
                  style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.20)" }}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    {[
                      "Sincronización activa",
                      "Inventario actualizado",
                      "Sistema estable",
                    ].map((label) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-bold text-emerald-200/90">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTAs */}
              <div className="space-y-3">
                <button onClick={() => navigate(`/stores/${run.storeId}`)}
                  className="w-full flex items-center justify-center gap-2.5 py-5 rounded-2xl text-lg font-black text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)", boxShadow: "0 0 32px rgba(6,182,212,0.35)" }}>
                  Ver mi tienda <ArrowRight className="w-5 h-5" />
                </button>
                <a href={`/stores/${run.storeId}`} target="_blank" rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-cyan-400 transition-colors"
                  style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.20)" }}>
                  linkservi.com/stores/{run.storeId} <ExternalLink className="w-4 h-4" />
                </a>
                <button onClick={resetAll}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white/60 transition-colors"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Conectar otro catálogo
                </button>
              </div>

              {/* Error details */}
              {errorList.length > 0 && (
                <details className="mt-6 p-4 rounded-2xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.20)" }}>
                  <summary className="cursor-pointer text-sm font-bold text-red-300">Ver detalle de errores ({errorList.length})</summary>
                  <ul className="mt-3 space-y-1.5 text-xs text-red-200/80 max-h-60 overflow-y-auto">
                    {errorList.map((e, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-bold tabular-nums opacity-60">Fila {e.row}:</span>
                        <span>{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, color, label, value, delay }: {
  icon: any; color: "emerald" | "cyan" | "amber"; label: string; value: number; delay: number;
}) {
  const palette = {
    emerald: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", icon: "text-emerald-400", value: "text-emerald-300" },
    cyan:    { bg: "rgba(6,182,212,0.08)",  border: "rgba(6,182,212,0.25)",  icon: "text-cyan-400",    value: "text-cyan-300" },
    amber:   { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", icon: "text-amber-400",   value: "text-amber-300" },
  }[color];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}
      className="p-4 sm:p-5 rounded-2xl"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <Icon className={`w-5 h-5 mb-2 ${palette.icon}`} />
      <p className={`text-2xl sm:text-3xl font-black tabular-nums ${palette.value}`}>{value.toLocaleString()}</p>
      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-1 text-white/50">{label}</p>
    </motion.div>
  );
}

// ── File drop zone ─────────────────────────────────────────────────────────────
function FileDropZone({ fileName, onFile }: { fileName: string; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className="cursor-pointer rounded-2xl p-8 text-center transition-all"
      style={{
        background: drag ? "rgba(6,182,212,0.10)" : "rgba(0,0,0,0.20)",
        border: `1.5px dashed ${drag ? "rgba(6,182,212,0.6)" : "rgba(255,255,255,0.15)"}`,
      }}>
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.json,.txt" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      <FileUp className={`w-9 h-9 mx-auto mb-3 ${drag ? "text-cyan-400" : "text-white/40"}`} />
      {fileName ? (
        <>
          <p className="font-bold text-cyan-300">{fileName}</p>
          <p className="text-xs mt-1 text-white/50">Click para cambiar</p>
        </>
      ) : (
        <>
          <p className="font-bold">Arrastra tu archivo o haz click</p>
          <p className="text-xs mt-1 text-white/50">CSV, XLSX o JSON · Hasta 30 MB</p>
        </>
      )}
    </div>
  );
}

// ── AutoSyncControls ─────────────────────────────────────────────────────────
// Re-usable block for URL + Sheets imports. Lets the user toggle background
// re-sync and choose how often (5 min – 24 h). The cron in services/import-
// scheduler.ts picks up enabled imports and re-runs them automatically.
function AutoSyncControls({
  enabled, onEnabledChange, intervalMin, onIntervalChange,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  intervalMin: number;
  onIntervalChange: (n: number) => void;
}) {
  const presets = [
    { label: "5 min",  value: 5 },
    { label: "15 min", value: 15 },
    { label: "30 min", value: 30 },
    { label: "1 hora", value: 60 },
    { label: "6 horas", value: 360 },
    { label: "Diario", value: 1440 },
  ];
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.20)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-bold text-white">Sincronización automática</p>
          </div>
          <p className="text-xs text-white/55 mt-1.5">
            Cuando tu proveedor cambie precios o stock, LinkServi los actualiza solo.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onEnabledChange(!enabled)}
          className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
          style={{ background: enabled ? "rgb(16,185,129)" : "rgba(255,255,255,0.15)" }}>
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? "translateX(20px)" : "translateX(0)" }}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(16,185,129,0.18)" }}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2">
            Frecuencia
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const active = intervalMin === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onIntervalChange(p.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{
                    background: active ? "rgba(16,185,129,0.20)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? "rgba(16,185,129,0.55)" : "rgba(255,255,255,0.08)"}`,
                    color: active ? "rgb(110,231,183)" : "rgba(255,255,255,0.65)",
                  }}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/40 mt-3">
            Solo se actualizan precios y stock de productos existentes; productos nuevos del catálogo se crean automáticamente.
          </p>
        </div>
      )}
    </div>
  );
}
