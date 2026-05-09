import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Crown, CheckCircle, XCircle, Clock, Loader2, Star,
  Eye, MousePointerClick, ShoppingBag, CalendarDays,
} from "lucide-react";
import { SkeletonRow, QueryError } from "@/components/ui/Skeleton";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24", label: "Pendiente" },
  approved: { bg: "rgba(52,211,153,0.12)",  text: "#34d399", label: "Aprobado" },
  rejected: { bg: "rgba(248,113,113,0.12)", text: "#f87171", label: "Rechazado" },
};

export function AdminProductPremiumPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "product-premium"],
    queryFn: () => apiFetch("/api/admin/product-premium", { headers: getAuthHeader() }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      apiFetch(`/api/admin/product-premium/${id}/approve`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "product-premium"] });
      toast({ title: "¡Producto destacado activado!", description: "El producto ya aparece como Destacado en el marketplace." });
    },
    onError: (err: any) => toast({ title: "Error al aprobar", description: err?.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      apiFetch(`/api/admin/product-premium/${id}/reject`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "product-premium"] });
      toast({ title: "Solicitud rechazada" });
    },
    onError: (err: any) => toast({ title: "Error al rechazar", description: err?.message, variant: "destructive" }),
  });

  const all = requests as any[];
  const filtered = filter === "all" ? all : all.filter((r: any) => r.status === filter);
  const pendingCount = all.filter((r: any) => r.status === "pending").length;
  const approvedCount = all.filter((r: any) => r.status === "approved").length;
  const rejectedCount = all.filter((r: any) => r.status === "rejected").length;
  const totalRevenue = all.filter((r: any) => r.status === "approved").reduce((s: number, r: any) => s + (r.amountUsd ?? 0), 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" /> Premium ServiMarket
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprueba o rechaza solicitudes de productos destacados en el marketplace
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pendientes",  count: pendingCount,  color: "#fbbf24", icon: <Clock className="w-4 h-4" /> },
          { label: "Activos",     count: approvedCount, color: "#34d399", icon: <CheckCircle className="w-4 h-4" /> },
          { label: "Rechazados",  count: rejectedCount, color: "#f87171", icon: <XCircle className="w-4 h-4" /> },
          { label: "Ingresos",    count: `$${totalRevenue.toFixed(0)}`, color: "#818cf8", icon: <Star className="w-4 h-4" /> },
        ].map((s, i) => (
          <div key={i} className="glass rounded-xl p-4 text-center">
            <div className="flex justify-center mb-1" style={{ color: s.color }}>{s.icon}</div>
            <div className="text-xl font-black" style={{ color: s.color }}>{s.count}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
            style={filter === tab
              ? { background: "rgba(99,102,241,0.2)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.4)" }
              : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {tab === "all" ? "Todos" : STATUS_STYLE[tab].label}
            {tab === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(251,191,36,0.2)", color: "#fbbf24" }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonRow key={i} cols={3} />)}
        </div>
      ) : isError ? (
        <QueryError message="No se pudieron cargar las solicitudes" onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Crown className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">No hay solicitudes {filter !== "all" ? STATUS_STYLE[filter]?.label.toLowerCase() + "s" : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const style = STATUS_STYLE[r.status] ?? STATUS_STYLE["pending"];
            const isPremiumActive = r.isPremium && r.premiumUntil && new Date(r.premiumUntil) > new Date();
            return (
              <div key={r.id} className="glass rounded-2xl p-4 space-y-3">
                {/* Product + seller info */}
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.05] flex items-center justify-center overflow-hidden flex-shrink-0">
                    {r.productImage
                      ? <img src={r.productImage} alt={r.productName} className="w-full h-full object-cover" />
                      : <ShoppingBag className="w-6 h-6 text-white/20" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground text-sm truncate">{r.productName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: style.bg, color: style.text }}>
                        {style.label}
                      </span>
                      {isPremiumActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
                          ⭐ Activo ahora
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vendedor: <span className="text-foreground/80">{r.coHostName}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                      <span className="font-bold" style={{ color: "#818cf8" }}>
                        ${r.amountUsd} · {r.months} mes{r.months !== 1 ? "es" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(r.createdAt).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {r.premiumUntil && (
                        <span className="flex items-center gap-1 text-amber-400/70">
                          <Clock className="w-3 h-3" />
                          hasta {new Date(r.premiumUntil).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pago Móvil details */}
                <div className="rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div><span className="text-muted-foreground">Teléfono: </span><span className="text-foreground font-medium">{r.pagoMovilPhone}</span></div>
                  {r.pagoMovilBank && <div><span className="text-muted-foreground">Banco: </span><span className="text-foreground font-medium">{r.pagoMovilBank}</span></div>}
                  <div className="col-span-2"><span className="text-muted-foreground">Ref: </span><span className="text-foreground font-mono font-medium">{r.pagoMovilRef}</span></div>
                </div>

                {/* Admin notes input */}
                {r.status === "pending" && (
                  <input
                    placeholder="Nota interna (opcional)"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    value={noteMap[r.id] ?? ""}
                    onChange={e => setNoteMap(m => ({ ...m, [r.id]: e.target.value }))}
                  />
                )}

                {r.adminNotes && r.status !== "pending" && (
                  <p className="text-xs text-muted-foreground italic px-1">Nota: {r.adminNotes}</p>
                )}

                {/* Action buttons */}
                {r.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate({ id: r.id, notes: noteMap[r.id] })}
                      disabled={approveMutation.isPending}
                      className="flex-1 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.35)" }}>
                      {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Aprobar y destacar
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate({ id: r.id, notes: noteMap[r.id] })}
                      disabled={rejectMutation.isPending}
                      className="flex-1 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: "rgba(248,113,113,0.10)", color: "#f87171", border: "1px solid rgba(248,113,113,0.25)" }}>
                      {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Rechazar
                    </button>
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
