import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle, X, Crown, Zap, Clock, RefreshCw, Users } from "lucide-react";

interface Sub {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  type: string;
  status: string;
  amountUsd: number;
  startDate: string;
  endDate: string;
}

const TYPE_LABEL: Record<string, string> = {
  worker_featured: "Profesional Destacado",
  business_premium: "Empresa Premium",
};
const TYPE_COLOR: Record<string, string> = {
  worker_featured: "#7c3aed",
  business_premium: "#b45309",
};
const STATUS_COLOR: Record<string, string> = {
  pending_payment: "#f59e0b",
  active: "#10b981",
  expired: "#6b7280",
};

export function AdminJobSubscriptionsPage() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending_payment" | "active" | "expired">("pending_payment");
  const [processing, setProcessing] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/jobs/subscriptions", { headers: getAuthHeader() });
      if (r.ok) setSubs(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchSubs(); }, []);

  const approve = async (id: number) => {
    setProcessing(id); setMsg("");
    try {
      const r = await fetch(`/api/admin/jobs/subscriptions/${id}/approve`, {
        method: "PUT", headers: getAuthHeader(),
      });
      const d = await r.json();
      if (r.ok) { setMsg("Suscripción aprobada y activada"); await fetchSubs(); }
      else setMsg(d.error ?? "Error al aprobar");
    } finally { setProcessing(null); }
  };

  const reject = async (id: number) => {
    if (!confirm("¿Rechazar y marcar como expirada esta suscripción?")) return;
    setProcessing(id); setMsg("");
    try {
      const r = await fetch(`/api/admin/jobs/subscriptions/${id}/reject`, {
        method: "PUT", headers: getAuthHeader(),
      });
      if (r.ok) { setMsg("Suscripción rechazada"); await fetchSubs(); }
    } finally { setProcessing(null); }
  };

  const filtered = subs.filter(s => filter === "all" || s.status === filter);
  const pendingCount = subs.filter(s => s.status === "pending_payment").length;

  return (
    <div className="min-h-screen" style={{ background: "#030a18" }}>
      <Sidebar />
      <main className="md:ml-64 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="font-black text-white text-lg">Suscripciones — Bolsa de Empleo</h1>
                <p className="text-xs text-white/40">Aprueba pagos y activa suscripciones manualmente</p>
              </div>
            </div>
            <button onClick={fetchSubs} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/[0.07] transition-colors"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <RefreshCw className="w-4 h-4 text-white/40" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Pendientes", value: subs.filter(s => s.status === "pending_payment").length, color: "#f59e0b" },
              { label: "Activas", value: subs.filter(s => s.status === "active").length, color: "#10b981" },
              { label: "Total", value: subs.length, color: "#06b6d4" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl p-4 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-2xl font-black" style={{ color }}>{value}</p>
                <p className="text-xs text-white/40 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {msg && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium text-emerald-300 flex items-center gap-2"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <CheckCircle className="w-4 h-4 flex-shrink-0" /> {msg}
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2 mb-4">
            {(["pending_payment", "active", "expired", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={filter === f
                  ? { background: "#06b6d4", color: "#fff" }
                  : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>
                {f === "pending_payment" ? `Pendientes ${pendingCount > 0 ? `(${pendingCount})` : ""}` :
                 f === "active" ? "Activas" : f === "expired" ? "Expiradas" : "Todas"}
              </button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: "#06b6d4" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 mx-auto text-white/10 mb-3" />
              <p className="text-white/40 text-sm">No hay suscripciones en este estado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(s => (
                <div key={s.id} className="rounded-2xl p-4"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-white text-sm">{s.userName}</span>
                        <span className="text-xs text-white/40">{s.userEmail}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: `${TYPE_COLOR[s.type]}20`, color: TYPE_COLOR[s.type], border: `1px solid ${TYPE_COLOR[s.type]}40` }}>
                          {s.type === "worker_featured" ? <><Zap className="w-2.5 h-2.5 inline mr-0.5" />Profesional Destacado</> : <><Crown className="w-2.5 h-2.5 inline mr-0.5" />Empresa Premium</>}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: `${STATUS_COLOR[s.status] ?? "#6b7280"}15`, color: STATUS_COLOR[s.status] ?? "#6b7280" }}>
                          {s.status === "pending_payment" ? "⏳ Pendiente" : s.status === "active" ? "✅ Activo" : "❌ Expirado"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-white/35">
                        <span>Monto: <strong className="text-white/60">${s.amountUsd} USD</strong></span>
                        <span>Inicio: {format(new Date(s.startDate), "d MMM yyyy", { locale: es })}</span>
                        <span>Vence: {format(new Date(s.endDate), "d MMM yyyy", { locale: es })}</span>
                        <span>ID: #{s.id}</span>
                      </div>
                    </div>

                    {s.status === "pending_payment" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => approve(s.id)} disabled={processing === s.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                          <CheckCircle className="w-3.5 h-3.5" />
                          {processing === s.id ? "..." : "Aprobar"}
                        </button>
                        <button onClick={() => reject(s.id)} disabled={processing === s.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
                          <X className="w-3.5 h-3.5" />
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
