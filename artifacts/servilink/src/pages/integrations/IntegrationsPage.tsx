import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Download, BookOpen, Settings2, RefreshCw, ShieldCheck,
  Activity, CheckCircle2, AlertTriangle, Loader2, Clock,
  KeyRound, Save, ExternalLink, Plug, Building2, Sparkles,
  Link2, X, Copy,
} from "lucide-react";

type Status = "active" | "disconnected" | "syncing";
type IntervalMin = 5 | 15 | 30 | 60;

interface LogEntry {
  id: string;
  kind: "success" | "warning" | "progress";
  title: string;
  detail: string;
  timestamp: string;
}

interface IntegrationStatus {
  status: Status;
  lastSyncAt: string;
  productsSynced: number;
  config: { apiKey: string | null; intervalMin: IntervalMin; updatedAt: string };
  logs: LogEntry[];
  agent: { version: string; downloadUrl: string; docsUrl: string };
}

const STATUS_META: Record<Status, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  active: {
    label: "Activo",
    color: "rgb(74,222,128)",
    bg: "rgba(74,222,128,0.12)",
    border: "rgba(74,222,128,0.40)",
    icon: CheckCircle2,
  },
  disconnected: {
    label: "Sin conexión",
    color: "rgb(248,113,113)",
    bg: "rgba(248,113,113,0.12)",
    border: "rgba(248,113,113,0.40)",
    icon: AlertTriangle,
  },
  syncing: {
    label: "Sincronizando",
    color: "rgb(251,191,36)",
    bg: "rgba(251,191,36,0.12)",
    border: "rgba(251,191,36,0.40)",
    icon: Loader2,
  },
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 0) return "ahora";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  return `hace ${day} d`;
}

function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function IntegrationsPage() {
  const { toast } = useToast();

  const [data, setData] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState("");
  const [intervalMin, setIntervalMin] = useState<IntervalMin>(15);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ── Modal de pairing (T001) ─────────────────────────────────────────────
  const [pairOpen, setPairOpen] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairExpiresAt, setPairExpiresAt] = useState<number | null>(null);
  const [pairStatus, setPairStatus] = useState<"idle" | "loading" | "waiting" | "claimed" | "expired" | "error">("idle");
  const [pairError, setPairError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const pairPollRef = useRef<number | null>(null);
  const pairTickerRef = useRef<number | null>(null);

  function clearPairTimers() {
    if (pairPollRef.current) { window.clearInterval(pairPollRef.current); pairPollRef.current = null; }
    if (pairTickerRef.current) { window.clearInterval(pairTickerRef.current); pairTickerRef.current = null; }
  }

  async function openPairModal() {
    setPairOpen(true);
    setPairStatus("loading");
    setPairError(null);
    setPairCode(null);
    setPairExpiresAt(null);
    clearPairTimers();
    try {
      const res = await fetch("/api/integrations/agent/pair-init", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.code) {
        setPairStatus("error");
        setPairError(json?.error || `Error ${res.status} al generar el código`);
        return;
      }
      setPairCode(String(json.code));
      const expires = json.expiresAt ? new Date(json.expiresAt).getTime() : Date.now() + 10 * 60_000;
      setPairExpiresAt(expires);
      setPairStatus("waiting");
      setNow(Date.now());
      pairTickerRef.current = window.setInterval(() => setNow(Date.now()), 1000);
      // Polling cada 3s — se detiene cuando el agente reclama el código.
      pairPollRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`/api/integrations/agent/pair-status/${json.code}`, { headers: getAuthHeader() });
          const j = await r.json().catch(() => ({}));
          if (j?.status === "claimed") {
            setPairStatus("claimed");
            clearPairTimers();
            // Refrescamos el estado de integración para que aparezca el agente.
            refresh().catch(() => {});
            toast({ title: "✔ Sistema conectado", description: "Tu Sync Agent quedó vinculado a tu cuenta." });
          } else if (j?.status === "expired") {
            setPairStatus("expired");
            clearPairTimers();
          }
        } catch { /* keep polling */ }
      }, 3000) as unknown as number;
    } catch (err) {
      setPairStatus("error");
      setPairError(err instanceof Error ? err.message : "Error de red");
    }
  }

  function closePairModal() {
    setPairOpen(false);
    clearPairTimers();
  }

  useEffect(() => () => clearPairTimers(), []);

  const pairRemainingSec = pairExpiresAt ? Math.max(0, Math.floor((pairExpiresAt - now) / 1000)) : 0;
  const pairMin = Math.floor(pairRemainingSec / 60);
  const pairSec = pairRemainingSec % 60;
  // Cuando expira por tiempo, marcamos local sin esperar al backend.
  useEffect(() => {
    if (pairStatus === "waiting" && pairRemainingSec === 0 && pairExpiresAt) {
      setPairStatus("expired");
      clearPairTimers();
    }
  }, [pairStatus, pairRemainingSec, pairExpiresAt]);

  // Para evitar que respuestas viejas (polling lento) sobreescriban una respuesta
  // más reciente (p.ej. la del save), seguimos la versión y un flag de "pausa"
  // mientras se guarda la configuración.
  const refreshSeqRef = useRef(0);
  const pausePollingRef = useRef(false);
  const formTouchedRef = useRef(false);

  async function refresh(opts?: { applyToForm?: boolean }) {
    const seq = ++refreshSeqRef.current;
    try {
      const res = await fetch("/api/integrations/status", { headers: getAuthHeader() });
      if (!res.ok) throw new Error("status request failed");
      const json: IntegrationStatus = await res.json();
      // Si llegó otra respuesta más nueva mientras esta estaba en vuelo, descartamos.
      if (seq !== refreshSeqRef.current) return;
      setData(json);
      // Solo sincronizamos el form la primera vez o si el usuario lo pide.
      // Si el usuario ya tocó el form, no pisamos sus cambios.
      if (opts?.applyToForm || !formTouchedRef.current) {
        setIntervalMin(json.config.intervalMin);
      }
    } catch (err) {
      console.error("[integrations] status", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh({ applyToForm: true });
    const t = setInterval(() => {
      if (!pausePollingRef.current) refresh();
    }, 8000);
    return () => clearInterval(t);
  }, []);

  const meta = useMemo(() => STATUS_META[data?.status ?? "disconnected"], [data]);

  async function saveConfig() {
    setSaving(true);
    pausePollingRef.current = true;
    // Capturamos el valor a enviar (evita stale closure si re-render entre clicks).
    const intervalToSend = intervalMin;
    try {
      const res = await fetch("/api/integrations/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined, intervalMin: intervalToSend }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Error al guardar");

      // Actualizamos el estado local con la config recién persistida (anti-race con polling).
      setData((prev) => {
        const base: IntegrationStatus = prev ?? {
          status: "active",
          lastSyncAt: new Date().toISOString(),
          productsSynced: 0,
          config: json.config,
          logs: [],
          agent: {
            version: "1.0.0-preview",
            downloadUrl: "/downloads/LinkServi-Sync-Agent-Setup-1.0.0.exe",
            docsUrl: "https://linkservi.com/docs/sync-agent",
          },
        };
        return { ...base, status: "active", config: json.config, lastSyncAt: new Date().toISOString() };
      });

      toast({ title: "Configuración guardada", description: "Sync Agent SAINT actualizado." });
      setApiKey("");
      setShowConfig(false);
      formTouchedRef.current = false;
      // Refrescamos desde server para obtener logs reales y aplicar al form.
      await refresh({ applyToForm: true });
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err?.message ?? "Intenta nuevamente", variant: "destructive" });
    } finally {
      setSaving(false);
      pausePollingRef.current = false;
    }
  }

  async function manualSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/sync", { method: "POST", headers: getAuthHeader() });
      if (!res.ok) throw new Error("sync request failed");
      toast({ title: "Sincronización iniciada", description: "Procesando catálogo en segundo plano…" });
      // Tras 3.5s el backend mock vuelve a "active" — refrescamos para reflejarlo.
      setTimeout(refresh, 3500);
      await refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "No se pudo iniciar la sincronización", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5 pb-12">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.35)" }}
          >
            <Plug className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground">Integraciones</h1>
            <p className="text-sm text-muted-foreground">Conecta tu sistema contable y mantén tu catálogo siempre al día</p>
          </div>
        </div>

        {/* ── Hero card SAINT ────────────────────────────────────────────── */}
        <div
          className="relative rounded-3xl p-6 overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(56,189,248,0.10), rgba(99,102,241,0.10), rgba(217,70,239,0.06))",
            border: "1px solid rgba(99,102,241,0.30)",
            backdropFilter: "blur(12px)",
          }}
          data-testid="integrations-hero"
        >
          {/* glow accent */}
          <div
            aria-hidden
            className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-30"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.5), transparent 60%)" }}
          />
          <div className="relative">
            <div className="flex items-start gap-4 flex-wrap">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(56,189,248,0.18)", border: "1px solid rgba(56,189,248,0.40)" }}
              >
                <Building2 className="w-7 h-7 text-sky-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg md:text-xl font-bold text-foreground">
                    Sincronización automática con SAINT
                  </h2>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
                    style={{ background: "rgba(217,70,239,0.18)", color: "rgb(232,121,249)" }}
                  >
                    <Sparkles className="w-3 h-3" /> Sync Agent
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                  Conecta tu sistema contable y actualiza precios, productos y stock automáticamente en tiempo real.
                </p>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Cifrado end-to-end
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Sync cada {data?.config.intervalMin ?? 15} min
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-sky-400" />
                    Agente v{data?.agent.version ?? "1.0"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 flex-wrap">
              <a
                href={data?.agent.downloadUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="btn-gradient text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity"
                data-testid="btn-download-agent"
              >
                <Download className="w-4 h-4" /> Descargar Sync Agent
              </a>
              <a
                href={data?.agent.docsUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgb(226,232,240)",
                }}
                data-testid="btn-guide"
              >
                <BookOpen className="w-4 h-4" /> Ver guía de instalación
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
              <button
                type="button"
                onClick={() => openPairModal()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                style={{
                  background: "rgba(74,222,128,0.14)",
                  border: "1px solid rgba(74,222,128,0.40)",
                  color: "rgb(187,247,208)",
                }}
                data-testid="btn-pair-system"
              >
                <Link2 className="w-4 h-4" /> Conectar mi sistema
              </button>
              <button
                type="button"
                onClick={() => setShowConfig((v) => !v)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                style={{
                  background: "rgba(99,102,241,0.14)",
                  border: "1px solid rgba(99,102,241,0.40)",
                  color: "rgb(165,180,252)",
                }}
                data-testid="btn-toggle-config"
              >
                <Settings2 className="w-4 h-4" /> Configurar conexión
              </button>
            </div>
          </div>
        </div>

        {/* ── Status panel ─────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
          data-testid="integrations-status"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
              >
                <meta.icon
                  className={`w-5 h-5 ${data?.status === "syncing" ? "animate-spin" : ""}`}
                  style={{ color: meta.color }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
                  >
                    ● {meta.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {loading ? "Cargando estado…" : "Conectado al Sync Agent local"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={manualSync}
              disabled={syncing || data?.status === "syncing"}
              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgb(226,232,240)",
              }}
              data-testid="btn-manual-sync"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing || data?.status === "syncing" ? "animate-spin" : ""}`} />
              Sincronizar ahora
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <StatTile
              icon={Clock}
              label="Última sincronización"
              value={data ? formatRelative(data.lastSyncAt) : "—"}
              hint={data ? formatAbsolute(data.lastSyncAt) : ""}
            />
            <StatTile
              icon={Activity}
              label="Productos sincronizados"
              value={data ? data.productsSynced.toLocaleString("es-VE") : "—"}
              hint="catálogo total"
            />
            <StatTile
              icon={Zap}
              label="Frecuencia"
              value={data ? `${data.config.intervalMin} min` : "—"}
              hint="intervalo automático"
            />
          </div>
        </div>

        {/* ── Configuration form ───────────────────────────────────────── */}
        {showConfig && (
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(99,102,241,0.30)",
              backdropFilter: "blur(10px)",
            }}
            data-testid="integrations-config"
          >
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="w-4 h-4 text-indigo-300" />
              <h3 className="font-semibold text-foreground">Configuración del agente</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  API Key del Sync Agent
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={data?.config.apiKey ? `Actual: ${data.config.apiKey}` : "Pega aquí la API Key del agente"}
                  className="w-full px-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/10 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-indigo-400/60 transition-colors"
                  data-testid="input-api-key"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Encuéntrala en la pantalla principal del Sync Agent tras instalarlo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Frecuencia de sincronización
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([5, 15, 30, 60] as IntervalMin[]).map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => { formTouchedRef.current = true; setIntervalMin(min); }}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        intervalMin === min
                          ? "bg-foreground text-background"
                          : "glass text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`btn-interval-${min}`}
                    >
                      {min === 60 ? "1 hora" : `${min} min`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={saving}
                  className="btn-gradient text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                  data-testid="btn-save-config"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar configuración
                </button>
                <button
                  type="button"
                  onClick={() => { setShowConfig(false); setApiKey(""); }}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold glass text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="btn-cancel-config"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Logs ───────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
          data-testid="integrations-logs"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-300" />
              <h3 className="font-semibold text-foreground">Eventos recientes</h3>
            </div>
            <span className="text-xs text-muted-foreground">{data?.logs.length ?? 0} eventos</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : (data?.logs.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Aún no hay eventos. Configura el agente para empezar.
            </div>
          ) : (
            <ul className="space-y-2">
              {data!.logs.map((log) => <LogRow key={log.id} log={log} />)}
            </ul>
          )}
        </div>

        {/* ── Footer hint ─────────────────────────────────────────────── */}
        <div className="text-[11px] text-muted-foreground/60 text-center pt-2">
          ¿Usás otro sistema contable? Contáctanos para integraciones a medida.
        </div>
      </div>

      {/* ── Modal de pairing (T001) ──────────────────────────────────── */}
      {pairOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closePairModal(); }}
          data-testid="pair-modal"
        >
          <div
            className="rounded-2xl p-6 w-full max-w-md relative"
            style={{
              background: "rgb(15,17,28)",
              border: "1px solid rgba(99,102,241,0.40)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.60)",
            }}
          >
            <button
              type="button"
              onClick={closePairModal}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground"
              data-testid="btn-pair-close"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-5 h-5 text-emerald-300" />
              <h3 className="text-lg font-bold text-foreground">Conectar mi sistema</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Abrí el Sync Agent en tu computadora y pegá este código.
            </p>

            {pairStatus === "loading" && (
              <div className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Generando código…</span>
              </div>
            )}

            {pairStatus === "error" && (
              <div className="py-6 text-center">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <div className="text-sm font-semibold text-red-300">No se pudo generar el código</div>
                <div className="text-xs text-muted-foreground mt-1">{pairError ?? "Intentalo de nuevo en unos segundos."}</div>
                <button
                  type="button"
                  onClick={openPairModal}
                  className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90"
                  data-testid="btn-pair-retry"
                >
                  Reintentar
                </button>
              </div>
            )}

            {pairStatus === "expired" && (
              <div className="py-6 text-center">
                <Clock className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className="text-sm font-semibold text-yellow-300">El código expiró</div>
                <div className="text-xs text-muted-foreground mt-1">Generá uno nuevo para continuar.</div>
                <button
                  type="button"
                  onClick={openPairModal}
                  className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90"
                  data-testid="btn-pair-new"
                >
                  Generar nuevo código
                </button>
              </div>
            )}

            {pairStatus === "claimed" && (
              <div className="py-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <div className="text-base font-semibold text-emerald-300">¡Sistema conectado!</div>
                <div className="text-xs text-muted-foreground mt-1">Tu Sync Agent ya está vinculado a tu cuenta.</div>
                <button
                  type="button"
                  onClick={closePairModal}
                  className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90"
                  data-testid="btn-pair-done"
                >
                  Listo
                </button>
              </div>
            )}

            {pairStatus === "waiting" && pairCode && (
              <>
                {/* Código grande */}
                <div
                  className="rounded-xl p-4 mb-4 text-center"
                  style={{ background: "rgba(99,102,241,0.10)", border: "1px solid rgba(99,102,241,0.30)" }}
                >
                  <div
                    className="text-3xl md:text-4xl font-mono font-bold text-foreground tracking-[0.5em] pl-[0.5em]"
                    data-testid="pair-code"
                  >
                    {pairCode}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(pairCode).then(
                        () => toast({ title: "Código copiado" }),
                        () => toast({ title: "No se pudo copiar", variant: "destructive" }),
                      );
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200"
                    data-testid="btn-pair-copy"
                  >
                    <Copy className="w-3 h-3" /> Copiar
                  </button>
                </div>

                {/* QR */}
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-2 rounded-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(pairCode)}`}
                      alt={`QR del código ${pairCode}`}
                      width={180}
                      height={180}
                      data-testid="pair-qr"
                    />
                  </div>
                </div>

                {/* Countdown + estado */}
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Esperando al agente…</span>
                  <span className="opacity-60">·</span>
                  <span>
                    expira en{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {pairMin}:{String(pairSec).padStart(2, "0")}
                    </span>
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground/70 text-center mt-3">
                  El código es de un solo uso y se invalida en 10 minutos.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function StatTile({ icon: Icon, label, value, hint }: { icon: typeof Clock; label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-lg font-bold text-foreground mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</div>}
    </div>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const palette = {
    success: { color: "rgb(74,222,128)", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.30)", Icon: CheckCircle2, glyph: "✔" },
    warning: { color: "rgb(251,146,60)", bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.30)", Icon: AlertTriangle, glyph: "⚠" },
    progress: { color: "rgb(125,211,252)", bg: "rgba(125,211,252,0.10)", border: "rgba(125,211,252,0.30)", Icon: Loader2, glyph: "⏳" },
  }[log.kind];

  return (
    <li
      className="flex items-start gap-3 p-3 rounded-xl"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "rgba(0,0,0,0.25)", color: palette.color }}
      >
        <palette.Icon className={`w-4 h-4 ${log.kind === "progress" ? "animate-spin" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground" style={{ color: palette.color }}>
            {palette.glyph} {log.title}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{log.detail}</div>
      </div>
      <div className="text-[11px] text-muted-foreground whitespace-nowrap" title={formatAbsolute(log.timestamp)}>
        {formatRelative(log.timestamp)}
      </div>
    </li>
  );
}
