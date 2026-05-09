import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Crown, CheckCircle, XCircle, Clock, Eye, Loader2, User } from "lucide-react";
import { SkeletonRow, QueryError } from "@/components/ui/Skeleton";

const METHOD_LABELS: Record<string, string> = {
  pago_movil: "📱 Pago Móvil", zelle: "💵 Zelle", paypal: "🅿 PayPal",
  transferencia: "🏦 Transferencia", binance: "🟡 Binance",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-400/20 text-amber-400",
  approved: "bg-emerald-400/20 text-emerald-400",
  rejected: "bg-red-400/20 text-red-400",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado",
};

export function AdminCohostPlansPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "cohost-plan-requests"],
    queryFn: () => apiFetch("/api/admin/cohost-plan-requests", { headers: getAuthHeader() }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      apiFetch(`/api/admin/cohost-plan-requests/${id}/approve`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "cohost-plan-requests"] });
      toast({ title: "Plan activado", description: "El co-host ahora tiene acceso Premium." });
    },
    onError: (err: any) => toast({ title: "Error al aprobar", description: err?.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      apiFetch(`/api/admin/cohost-plan-requests/${id}/reject`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "cohost-plan-requests"] });
      toast({ title: "Solicitud rechazada" });
    },
    onError: (err: any) => toast({ title: "Error al rechazar", description: err?.message, variant: "destructive" }),
  });

  const allRequests = requests as any[];
  const filtered = filter === "all" ? allRequests : allRequests.filter((r: any) => r.status === filter);
  const pendingCount = allRequests.filter((r: any) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" /> Planes Co-host
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprueba o rechaza solicitudes de upgrade a Premium
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pendientes", count: pendingCount, color: "text-amber-400" },
          { label: "Aprobados", count: allRequests.filter((r: any) => r.status === "approved").length, color: "text-emerald-400" },
          { label: "Rechazados", count: allRequests.filter((r: any) => r.status === "rejected").length, color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3 text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["pending", "all", "approved", "rejected"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "btn-gradient text-white" : "glass text-muted-foreground hover:text-foreground"}`}
          >
            {{ pending: "Pendientes", all: "Todas", approved: "Aprobadas", rejected: "Rechazadas" }[f]}
            {f === "pending" && pendingCount > 0 && <span className="ml-1.5 bg-amber-400 text-black text-xs font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : isError ? (
        <QueryError message="No se pudieron cargar las solicitudes" onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Crown className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground text-sm">No hay solicitudes {filter !== "all" ? `con estado "${STATUS_LABEL[filter]}"` : ""}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r: any) => {
            const isActing = (approveMutation.isPending || rejectMutation.isPending) &&
              (approveMutation.variables?.id === r.id || rejectMutation.variables?.id === r.id);
            return (
              <div key={r.id} className="glass rounded-2xl p-5 space-y-4" style={{ opacity: isActing ? 0.6 : 1 }}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {r.cohostName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{r.cohostName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        <span className="text-xs text-muted-foreground bg-white/[0.06] px-2 py-0.5 rounded-full">
                          Plan actual: {r.cohostPlan === "premium" ? "⭐ Premium" : "Gratis"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <User className="w-3 h-3" /> {r.cohostEmail}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-black text-foreground">${r.amount}</div>
                    <div className="text-xs text-muted-foreground">{r.planMonths} {r.planMonths === 1 ? "mes" : "meses"}</div>
                  </div>
                </div>

                {/* Payment info */}
                <div className="bg-white/[0.04] rounded-xl p-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Método</span>
                    <span className="text-foreground font-medium">{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</span>
                  </div>
                  {r.transactionRef && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Referencia</span>
                      <span className="text-foreground font-mono text-xs">{r.transactionRef}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Fecha</span>
                    <span className="text-foreground text-xs">{new Date(r.createdAt).toLocaleString("es-VE")}</span>
                  </div>
                  {r.receiptUrl && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Comprobante</span>
                      <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Eye className="w-3 h-3" /> Ver imagen
                      </a>
                    </div>
                  )}
                </div>

                {/* Admin notes */}
                {r.adminNotes && (
                  <div className="text-xs text-muted-foreground bg-white/[0.04] rounded-xl px-3 py-2">
                    Nota admin: {r.adminNotes}
                  </div>
                )}

                {/* Actions — only for pending */}
                {r.status === "pending" && (
                  <div className="space-y-2">
                    <input
                      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Nota para el co-host (opcional)"
                      value={adminNotes[r.id] ?? ""}
                      onChange={e => setAdminNotes(p => ({ ...p, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => rejectMutation.mutate({ id: r.id, notes: adminNotes[r.id] })}
                        disabled={isActing}
                        className="flex-1 py-2.5 rounded-xl bg-red-400/10 text-red-400 text-sm font-medium hover:bg-red-400/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {rejectMutation.isPending && rejectMutation.variables?.id === r.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <XCircle className="w-4 h-4" />}
                        Rechazar
                      </button>
                      <button
                        onClick={() => approveMutation.mutate({ id: r.id, notes: adminNotes[r.id] })}
                        disabled={isActing}
                        className="flex-1 py-2.5 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {approveMutation.isPending && approveMutation.variables?.id === r.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <CheckCircle className="w-4 h-4" />}
                        Aprobar Premium
                      </button>
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
