import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Shield, ShieldCheck, ShieldX, Clock, CheckCircle, X, ChevronRight,
  AlertTriangle, Calendar, User, Wrench, RefreshCw,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Warranty {
  id: number;
  bookingId: number;
  serviceName: string;
  status: string;
  claimedAt: string;
  workerNotifiedAt: string | null;
  workerRespondedAt: string | null;
  visitScheduledAt: string | null;
  completedAt: string | null;
  workerBlockedAt: string | null;
  notes: string | null;
  clientName: string;
  workerName: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Shield }> = {
  pending:   { label: "Pendiente",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)",  icon: Clock },
  scheduled: { label: "Visita agendada", color: "#06B6D4", bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.3)", icon: Calendar },
  completed: { label: "Completada",  color: "#34d399", bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)",  icon: ShieldCheck },
  refused:   { label: "Rechazada",   color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)", icon: ShieldX },
  expired:   { label: "Expirada",    color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.3)", icon: X },
};

export function AdminWarrantiesPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Warranty | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [checkingUnresponsive, setCheckingUnresponsive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/warranties", { headers: getAuthHeader() });
      const data = await r.json();
      setWarranties(Array.isArray(data) ? data : []);
    } catch { setWarranties([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, status: string, notes?: string) => {
    setUpdatingId(id);
    try {
      const r = await fetch(`/api/admin/warranties/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ status, notes }),
      });
      if (!r.ok) { const e = await r.json(); showToast(e.error ?? "Error"); return; }
      showToast("Garantía actualizada");
      setSelected(null);
      await load();
    } catch { showToast("Error de red"); }
    setUpdatingId(null);
  };

  const checkUnresponsive = async () => {
    setCheckingUnresponsive(true);
    try {
      const r = await fetch("/api/admin/warranties/check-unresponsive", {
        method: "POST",
        headers: getAuthHeader(),
      });
      const d = await r.json();
      showToast(d.message ?? "Proceso completado");
      await load();
    } catch { showToast("Error"); }
    setCheckingUnresponsive(false);
  };

  // Stats
  const stats = {
    total: warranties.length,
    pending: warranties.filter(w => w.status === "pending").length,
    scheduled: warranties.filter(w => w.status === "scheduled").length,
    completed: warranties.filter(w => w.status === "completed").length,
    refused: warranties.filter(w => w.status === "refused").length,
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> Seguimiento de Garantías
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Garantía LinkServi — 15 días post-servicio</p>
          </div>
          <button
            onClick={checkUnresponsive}
            disabled={checkingUnresponsive}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-rose-600/10 border border-rose-500/30 text-rose-400 hover:bg-rose-600/20 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${checkingUnresponsive ? "animate-spin" : ""}`} />
            Verificar sin respuesta (+24h)
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Pendientes", value: stats.pending, color: "text-amber-400" },
            { label: "Agendadas", value: stats.scheduled, color: "text-cyan-400" },
            { label: "Completadas", value: stats.completed, color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 border border-border bg-card">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : warranties.length === 0 ? (
          <div className="text-center py-16">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">No hay garantías registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {warranties.map(w => {
              const cfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <button
                  key={w.id}
                  onClick={() => setSelected(w)}
                  className="w-full text-left rounded-2xl p-4 border border-border bg-card hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-sm">{w.serviceName}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" /> Cliente: <span className="text-foreground">{w.clientName}</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> Técnico: <span className="text-foreground">{w.workerName}</span>
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Reclamada {formatDistanceToNow(new Date(w.claimedAt), { locale: es, addSuffix: true })}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card border border-border rounded-3xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-foreground text-lg">Garantía #{selected.id}</h2>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <InfoRow label="Servicio" value={selected.serviceName} />
              <InfoRow label="Cliente" value={selected.clientName} />
              <InfoRow label="Técnico" value={selected.workerName} />
              <InfoRow label="Booking ID" value={`#${selected.bookingId}`} />
              <InfoRow label="Reclamada" value={format(new Date(selected.claimedAt), "dd/MM/yyyy HH:mm")} />
              {selected.visitScheduledAt && (
                <InfoRow label="Visita agendada" value={format(new Date(selected.visitScheduledAt), "dd/MM/yyyy")} />
              )}
              {selected.workerBlockedAt && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <p className="text-xs text-rose-400 font-semibold">Profesional bloqueado por incumplimiento</p>
                </div>
              )}
              {selected.notes && (
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <p className="text-xs text-muted-foreground">Notas:</p>
                  <p className="text-sm text-foreground mt-0.5">{selected.notes}</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {selected.status === "pending" && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => updateStatus(selected.id, "scheduled")}
                  disabled={updatingId === selected.id}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-60"
                >
                  {updatingId === selected.id ? "Procesando..." : "✅ Marcar visita agendada"}
                </button>
                <button
                  onClick={() => updateStatus(selected.id, "refused", "Profesional rechazó o no respondió")}
                  disabled={updatingId === selected.id}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-60"
                >
                  🚫 Marcar como rechazada
                </button>
              </div>
            )}
            {selected.status === "scheduled" && (
              <button
                onClick={() => updateStatus(selected.id, "completed")}
                disabled={updatingId === selected.id}
                className="w-full py-3 rounded-xl font-bold text-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-60"
              >
                {updatingId === selected.id ? "Procesando..." : "✅ Garantía cumplida — cerrar caso"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl bg-foreground text-background text-sm font-semibold shadow-2xl">
          {toast}
        </div>
      )}
    </AppLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
