import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import {
  Store, DollarSign, Users, CheckCircle, X,
  Loader2, Edit3, BarChart3, Power, PowerOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { useBcvRate } from "@/hooks/useBcvRate";

interface AdminStore {
  id: number;
  name: string;
  ownerName: string;
  coHostId: number;
  coHostName: string | null;
  balanceUsd: number;
  platformCommissionPct: number;
  cohostCommissionPct: number;
  isActive: boolean;
  createdAt: string;
  paymentMethod: string | null;
}

function StoreAvatar({ name, isActive }: { name: string; isActive: boolean }) {
  const letters = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0 relative ${isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
      {letters || <Store className="w-5 h-5" />}
      <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-background ${isActive ? "bg-emerald-400" : "bg-red-400"}`} />
    </div>
  );
}

export function AdminStoresPage() {
  const { token } = useAuth();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPlatform, setEditPlatform] = useState("");
  const [editCohost, setEditCohost] = useState("");
  const [saving, setSaving] = useState(false);
  const [suspending, setSuspending] = useState<number | null>(null);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "suspended">("all");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/stores", { headers: { Authorization: `Bearer ${token}` } });
      setStores(data);
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const { formatBs } = useBcvRate();

  const totalBalance = stores.reduce((s, st) => s + st.balanceUsd, 0);
  const activeCount = stores.filter(s => s.isActive).length;
  const suspendedCount = stores.filter(s => !s.isActive).length;

  const filtered = stores.filter(s =>
    filterActive === "all" ? true : filterActive === "active" ? s.isActive : !s.isActive
  );

  const startEdit = (s: AdminStore) => {
    setEditingId(s.id);
    setEditPlatform(String(s.platformCommissionPct));
    setEditCohost(String(s.cohostCommissionPct));
  };

  const saveCommissions = async (storeId: number) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/stores/${storeId}/commissions`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          platformCommissionPct: parseFloat(editPlatform),
          cohostCommissionPct: parseFloat(editCohost),
        }),
      });
      setEditingId(null);
      load();
    } catch { }
    finally { setSaving(false); }
  };

  const toggleSuspend = async (s: AdminStore) => {
    setSuspending(s.id);
    try {
      await apiFetch(`/api/admin/stores/${s.id}/suspend`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      load();
    } catch { }
    finally { setSuspending(null); }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="w-6 h-6 text-primary" /> Tiendas del ServiMarket
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Gestiona tiendas, comisiones y estado de cada tienda</p>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total tiendas", value: stores.length, icon: Store, color: "text-primary", sub: null },
          { label: "Activas", value: activeCount, icon: CheckCircle, color: "text-emerald-400", sub: null },
          { label: "Suspendidas", value: suspendedCount, icon: PowerOff, color: "text-red-400", sub: null },
          { label: "Saldo pendiente", value: `$${totalBalance.toFixed(2)}`, icon: DollarSign, color: "text-amber-400", sub: formatBs(totalBalance) },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
            <div className="text-xl font-bold text-foreground">{s.value}</div>
            {s.sub && <div className="text-[10px] text-amber-400/60 font-medium">{s.sub}</div>}
            <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {(["all", "active", "suspended"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterActive(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterActive === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            {f === "all" ? "Todas" : f === "active" ? `Activas (${activeCount})` : `Suspendidas (${suspendedCount})`}
          </button>
        ))}
      </div>

      {/* ── Store list ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-20 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-16 text-center">
          <Store className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="font-medium text-foreground">Sin tiendas en esta categoría</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filterActive === "suspended" ? "No hay tiendas suspendidas." : "Los co-hosts aún no han creado tiendas."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const isExpanded = expandedId === s.id;
            const isEditing = editingId === s.id;
            const storeRemainder = 100 - s.platformCommissionPct - s.cohostCommissionPct;

            return (
              <div key={s.id} className={`bg-card border rounded-2xl overflow-hidden transition-colors ${!s.isActive ? "border-red-200 dark:border-red-800/50 opacity-75" : "border-border"}`}>

                {/* ── Store card header ────────────────────────────────── */}
                <div className="flex items-center gap-3 p-4">
                  <StoreAvatar name={s.name} isActive={s.isActive} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{s.name}</span>
                      {!s.isActive && (
                        <span className="text-[11px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                          Suspendida
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Dueño: <span className="text-foreground">{s.ownerName}</span>
                      {" · "}
                      Co-host: <span className="text-foreground">{s.coHostName ?? `#${s.coHostId}`}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-primary font-medium">Plataforma {s.platformCommissionPct}%</span>
                      <span className="text-violet-500 font-medium">Co-host {s.cohostCommissionPct}%</span>
                      <span className="text-emerald-500 font-medium">Tienda {storeRemainder}%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Saldo */}
                    <div className="text-right hidden sm:block">
                      <p className={`text-sm font-bold ${s.balanceUsd > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                        ${s.balanceUsd.toFixed(2)}
                      </p>
                      {s.balanceUsd > 0 && (
                        <p className="text-[10px] text-amber-400/60 font-medium">{formatBs(s.balanceUsd)}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">saldo</p>
                    </div>

                    {/* Suspend/Activate */}
                    <button
                      onClick={() => toggleSuspend(s)}
                      disabled={suspending === s.id}
                      title={s.isActive ? "Suspender tienda" : "Activar tienda"}
                      className={`p-2 rounded-lg border transition-colors ${s.isActive
                        ? "border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                      }`}
                    >
                      {suspending === s.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : s.isActive
                          ? <PowerOff className="w-4 h-4" />
                          : <Power className="w-4 h-4" />
                      }
                    </button>

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* ── Expanded: commissions editor ─────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distribución de comisiones</p>
                        {!isEditing && (
                          <button
                            onClick={() => startEdit(s)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Plataforma (%)</label>
                              <input
                                type="number" min="0" max="50" step="0.5"
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                value={editPlatform}
                                onChange={e => setEditPlatform(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Co-host (%)</label>
                              <input
                                type="number" min="0" max="50" step="0.5"
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                value={editCohost}
                                onChange={e => setEditCohost(e.target.value)}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground text-center">
                            Tienda se lleva: <strong className="text-emerald-500">
                              {(100 - parseFloat(editPlatform || "0") - parseFloat(editCohost || "0")).toFixed(1)}%
                            </strong>
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">
                              Cancelar
                            </button>
                            <button
                              onClick={() => saveCommissions(s.id)}
                              disabled={saving}
                              className="flex-1 py-2 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {[
                            { label: "Plataforma", pct: s.platformCommissionPct, color: "#6366f1" },
                            { label: "Co-host", pct: s.cohostCommissionPct, color: "#8b5cf6" },
                            { label: "Tienda", pct: storeRemainder, color: "#10b981" },
                          ].map(c => (
                            <div key={c.label} className="flex items-center gap-2">
                              <div className="w-20 text-xs text-muted-foreground">{c.label}</div>
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                              </div>
                              <div className="text-xs font-bold text-foreground w-10 text-right">{c.pct}%</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t border-border">
                      <div>Creada: {new Date(s.createdAt).toLocaleDateString("es-VE")}</div>
                      {s.paymentMethod && <div>Retiro: {s.paymentMethod}</div>}
                      <div>Saldo: <span className="text-amber-500 font-semibold">${s.balanceUsd.toFixed(2)}</span>{s.balanceUsd > 0 && <span className="text-amber-400/60 ml-1">{formatBs(s.balanceUsd)}</span>}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
