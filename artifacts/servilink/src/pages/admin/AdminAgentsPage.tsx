import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Cpu, Loader2,
  RefreshCw, Search, Server, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (deben coincidir con los DTOs del backend en
// artifacts/api-server/src/routes/integrations-agent.ts)
// ─────────────────────────────────────────────────────────────────────────────
interface AgentRow {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  storeId: number | null;
  storeName: string | null;
  name: string | null;
  version: string | null;
  status: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  productsSynced: number;
  errorCount: number;
  lastError: string | null;
  pairedAt: string;
}

interface AgentEvent {
  id: number;
  type: string;
  message: string | null;
  payload: unknown;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers visuales
// ─────────────────────────────────────────────────────────────────────────────
function formatRelative(iso: string | null): string {
  if (!iso) return "nunca";
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

function formatAbsolute(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function statusMeta(status: string, lastSeenAt: string | null): {
  label: string;
  bg: string;
  border: string;
  color: string;
  Icon: typeof CheckCircle2;
} {
  // Si el agente no fue visto en >2 intervalos típicos (asumimos 30 min),
  // lo mostramos como "sin conexión" aunque su status nominal sea active.
  const stale = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() > 30 * 60_000 : true;
  if (status === "error" || stale) {
    return {
      label: stale && status === "active" ? "Sin conexión" : status === "error" ? "Con errores" : "Sin conexión",
      bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.40)", color: "rgb(252,165,165)", Icon: AlertTriangle,
    };
  }
  if (status === "active") {
    return {
      label: "Activo", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.40)",
      color: "rgb(134,239,172)", Icon: CheckCircle2,
    };
  }
  return {
    label: status, bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.30)",
    color: "rgb(203,213,225)", Icon: Cpu,
  };
}

const EVENT_META: Record<string, { color: string; label: string }> = {
  agent_started:  { color: "rgb(96,165,250)",  label: "Inicio" },
  sync_success:   { color: "rgb(134,239,172)", label: "Sync OK" },
  sync_error:     { color: "rgb(252,165,165)", label: "Sync error" },
  db_error:       { color: "rgb(252,211,77)",  label: "DB error" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────
export function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [openAgent, setOpenAgent] = useState<AgentRow | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  async function loadAgents() {
    setError(null);
    try {
      const res = await fetch("/api/admin/integrations/agents", { headers: getAuthHeader() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
      setAgents(Array.isArray(json?.agents) ? json.agents : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
    const t = window.setInterval(loadAgents, 15_000);
    return () => window.clearInterval(t);
  }, []);

  async function openAgentDrawer(a: AgentRow) {
    setOpenAgent(a);
    setEvents([]);
    setEventsError(null);
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/admin/integrations/agents/${a.id}/events?limit=50`, { headers: getAuthHeader() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
      setEvents(Array.isArray(json?.events) ? json.events : []);
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEventsLoading(false);
    }
  }

  const filtered = agents.filter((a) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (a.userName ?? "").toLowerCase().includes(q) ||
      (a.userEmail ?? "").toLowerCase().includes(q) ||
      (a.storeName ?? "").toLowerCase().includes(q) ||
      (a.name ?? "").toLowerCase().includes(q) ||
      String(a.id).includes(q)
    );
  });

  // Agregados de cabecera
  const totals = {
    all: agents.length,
    active: agents.filter((a) => statusMeta(a.status, a.lastSeenAt).label === "Activo").length,
    errors: agents.filter((a) => a.errorCount > 0).length,
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-300" />
            <h1 className="text-xl font-bold text-foreground">Sync Agents conectados</h1>
          </div>
          <button
            type="button"
            onClick={loadAgents}
            className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            data-testid="btn-refresh-agents"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refrescar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi icon={Cpu} label="Total" value={String(totals.all)} />
          <Kpi icon={CheckCircle2} label="Activos" value={String(totals.active)} accent="emerald" />
          <Kpi icon={AlertTriangle} label="Con errores" value={String(totals.errors)} accent="red" />
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuario, tienda o id…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/10 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-indigo-400/60"
            data-testid="input-search-agents"
          />
        </div>

        {/* Estado de carga / error */}
        {error && (
          <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.40)", color: "rgb(252,165,165)" }}>
            {error}
          </div>
        )}

        {loading && agents.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Cargando agentes…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {agents.length === 0 ? "Aún no hay agentes vinculados." : "No hay agentes que coincidan con la búsqueda."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const meta = statusMeta(a.status, a.lastSeenAt);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openAgentDrawer(a)}
                  className="w-full text-left rounded-xl p-4 transition-colors hover:bg-white/[0.03]"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
                  data-testid={`agent-row-${a.id}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">
                          {a.userName ?? a.userEmail ?? `Usuario #${a.userId}`}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
                        >
                          <meta.Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                        {a.version && (
                          <span className="text-[11px] text-muted-foreground">v{a.version}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {a.storeName ? `Tienda: ${a.storeName}` : a.storeId ? `Tienda #${a.storeId}` : "Sin tienda asociada"}
                        {a.userEmail && a.userName ? ` · ${a.userEmail}` : ""}
                      </div>
                      {a.lastError && (
                        <div className="text-xs mt-1 truncate" style={{ color: "rgb(252,165,165)" }}>
                          ⚠ {a.lastError}
                        </div>
                      )}
                    </div>

                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <div className="flex items-center gap-1 justify-end">
                        <Activity className="w-3 h-3" />
                        <span>visto {formatRelative(a.lastSeenAt)}</span>
                      </div>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>sync {formatRelative(a.lastSyncAt)}</span>
                      </div>
                      <div className="mt-0.5">
                        <span className="text-foreground font-semibold">{a.productsSynced}</span> productos
                        {a.errorCount > 0 && (
                          <span className="ml-2" style={{ color: "rgb(252,165,165)" }}>
                            {a.errorCount} err
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Drawer de eventos (T008) ──────────────────────────────────── */}
      {openAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpenAgent(null); }}
          data-testid="agent-drawer"
        >
          <div
            className="rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto relative"
            style={{
              background: "rgb(15,17,28)",
              border: "1px solid rgba(99,102,241,0.40)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.60)",
            }}
          >
            <button
              type="button"
              onClick={() => setOpenAgent(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground"
              aria-label="Cerrar"
              data-testid="btn-drawer-close"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-foreground">
              Agente #{openAgent.id} · {openAgent.userName ?? openAgent.userEmail ?? `Usuario ${openAgent.userId}`}
            </h3>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              <div>Pareado: {formatAbsolute(openAgent.pairedAt)}</div>
              <div>Última conexión: {formatAbsolute(openAgent.lastSeenAt)}</div>
              <div>Última sync OK: {formatAbsolute(openAgent.lastSyncAt)}</div>
              {openAgent.version && <div>Versión: v{openAgent.version}</div>}
            </div>

            <h4 className="text-sm font-semibold text-foreground mt-5 mb-2">Eventos recientes</h4>

            {eventsError && (
              <div className="rounded-xl p-3 text-sm mb-3" style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.40)", color: "rgb(252,165,165)" }}>
                {eventsError}
              </div>
            )}

            {eventsLoading ? (
              <div className="py-6 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando eventos…
              </div>
            ) : events.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-sm">Sin eventos todavía.</div>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => {
                  const meta = EVENT_META[ev.type] ?? { color: "rgb(203,213,225)", label: ev.type };
                  return (
                    <li
                      key={ev.id}
                      className="rounded-lg p-3"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
                      data-testid={`event-row-${ev.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold" style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground" title={formatAbsolute(ev.createdAt)}>
                          {formatRelative(ev.createdAt)}
                        </span>
                      </div>
                      {ev.message && (
                        <div className="text-sm text-foreground mt-1">{ev.message}</div>
                      )}
                      {ev.payload != null && typeof ev.payload === "object" && (
                        <pre className="text-[11px] text-muted-foreground mt-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Kpi({ icon: Icon, label, value, accent }: {
  icon: typeof Cpu; label: string; value: string; accent?: "emerald" | "red";
}) {
  const color =
    accent === "emerald" ? "rgb(134,239,172)" :
    accent === "red"     ? "rgb(252,165,165)" :
    "rgb(226,232,240)";
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold text-foreground mt-1" style={{ color }}>{value}</div>
    </div>
  );
}
