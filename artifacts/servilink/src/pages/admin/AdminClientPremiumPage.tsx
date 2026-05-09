import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Crown, CheckCircle, XCircle, Eye, Loader2, User, Star, Clock, Rocket } from "lucide-react";
import { SkeletonRow, QueryError } from "@/components/ui/Skeleton";

// ─── Shared label maps ────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  pago_movil: "📱 Pago Móvil",
  zelle: "💵 Zelle",
  paypal: "🅿 PayPal",
  transferencia: "🏦 Transferencia",
  binance: "🟡 Binance",
};

const STATUS_COLOR: Record<string, string> = {
  pending:  "bg-amber-400/20 text-amber-400",
  approved: "bg-emerald-400/20 text-emerald-400",
  rejected: "bg-red-400/20 text-red-400",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado",
};

// ─── Tab: Gestionar Premium ──────────────────────────────────────────────────

function GestionarTab() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [days, setDays] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients", { headers: getAuthHeader() });
      setClients(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (c: any, enable: boolean) => {
    setBusy((b) => ({ ...b, [c.id]: true }));
    try {
      await fetch(`/api/admin/clients/${c.id}/client-premium`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ isPremium: enable, days: enable ? (days[c.id] ?? 30) : undefined }),
      });
      toast({
        title: enable ? "Premium activado" : "Premium revocado",
        description: enable
          ? `${c.name} ahora tiene acceso Premium.`
          : `${c.name} ya no tiene Premium.`,
      });
      await load();
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar el estado.", variant: "destructive" });
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  const isPremiumActive = (c: any) =>
    c.clientPlan === "premium" && c.clientPremiumUntil && new Date(c.clientPremiumUntil) > new Date();

  const premiumClients  = clients.filter(isPremiumActive);
  const regularClients  = clients.filter((c) => !isPremiumActive(c));

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="p-4 rounded-xl bg-amber-400/10 border border-amber-400/30">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <p className="text-sm font-bold text-amber-400">Sistema Premium Clientes</p>
        </div>
        <p className="text-xs text-amber-400/70">
          Los clientes Premium obtienen un 5% de descuento en servicios y prioridad en solicitudes.
          Actualmente <strong>{premiumClients.length} cliente{premiumClients.length !== 1 ? "s" : ""}</strong> tienen Premium activo.
        </p>
      </div>

      {/* Premium activos */}
      {premiumClients.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            Premium activo ({premiumClients.length})
          </p>
          <div className="space-y-2">
            {premiumClients.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 bg-amber-400/[0.07] border border-amber-400/30 rounded-xl gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground text-sm">{c.name}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 font-medium">
                      ⭐ Premium
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                    {c.clientPremiumUntil && (
                      <span className="text-xs text-amber-400">
                        Vence: {new Date(c.clientPremiumUntil).toLocaleDateString("es-VE")}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggle(c, false)}
                  disabled={busy[c.id]}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-400/10 flex-shrink-0 disabled:opacity-50 transition-colors"
                >
                  {busy[c.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : "Revocar"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clientes regulares */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">
          Clientes regulares ({regularClients.length})
        </p>
        {regularClients.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center">
            <Crown className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">Todos los clientes tienen Premium activo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {regularClients.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 glass rounded-xl gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm truncate">{c.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={days[c.id] ?? 30}
                    onChange={(e) => setDays((d) => ({ ...d, [c.id]: Number(e.target.value) }))}
                    className="w-14 px-2 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
                    title="Días de Premium"
                  />
                  <span className="text-xs text-muted-foreground">días</span>
                  <button
                    onClick={() => toggle(c, true)}
                    disabled={busy[c.id]}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50 flex items-center gap-1 transition-colors"
                  >
                    {busy[c.id] ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <><Star className="w-3 h-3 fill-current" /> Activar</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Solicitudes de pago ─────────────────────────────────────────────────

function SolicitudesTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "client-premium-requests"],
    queryFn: () => apiFetch("/api/admin/client-premium-requests", { headers: getAuthHeader() }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      apiFetch(`/api/admin/client-premium-requests/${id}/approve`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-premium-requests"] });
      toast({ title: "Premium activado", description: "El cliente ahora tiene acceso Premium." });
    },
    onError: (err: any) =>
      toast({ title: "Error al aprobar", description: err?.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      apiFetch(`/api/admin/client-premium-requests/${id}/reject`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client-premium-requests"] });
      toast({ title: "Solicitud rechazada" });
    },
    onError: (err: any) =>
      toast({ title: "Error al rechazar", description: err?.message, variant: "destructive" }),
  });

  const allRequests  = requests as any[];
  const filtered     = filter === "all" ? allRequests : allRequests.filter((r: any) => r.status === filter);
  const pendingCount = allRequests.filter((r: any) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-4 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-start gap-3">
        <Rocket className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-400">Solicitudes de Activación Premium</p>
          <p className="text-xs text-amber-400/70 mt-0.5">
            Los clientes pagan $4.99 USD y envían su comprobante. Verifica el pago y activa su cuenta.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pendientes", count: pendingCount, color: "text-amber-400" },
          { label: "Aprobados",  count: allRequests.filter((r: any) => r.status === "approved").length, color: "text-emerald-400" },
          { label: "Rechazados", count: allRequests.filter((r: any) => r.status === "rejected").length, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-3 text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["pending", "all", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "btn-gradient text-white"
                : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            {{ pending: "Pendientes", all: "Todas", approved: "Aprobadas", rejected: "Rechazadas" }[f]}
            {f === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-400 text-black text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
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
          <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground text-sm">
            No hay solicitudes{filter !== "all" ? ` con estado "${STATUS_LABEL[filter]}"` : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r: any) => {
            const isActing =
              (approveMutation.isPending || rejectMutation.isPending) &&
              (approveMutation.variables?.id === r.id || rejectMutation.variables?.id === r.id);
            return (
              <div
                key={r.id}
                className="glass rounded-2xl p-5 space-y-4"
                style={{ opacity: isActing ? 0.6 : 1 }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {r.userName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{r.userName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        <span className="text-xs text-muted-foreground bg-white/[0.06] px-2 py-0.5 rounded-full">
                          Plan: {r.clientPlan === "premium" ? "⭐ Premium" : "Gratis"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <User className="w-3 h-3" /> {r.userEmail}
                      </div>
                      {r.clientPlan === "premium" && r.clientPremiumUntil && (
                        <div className="text-xs text-emerald-400 mt-0.5">
                          Activo hasta: {new Date(r.clientPremiumUntil).toLocaleDateString("es-VE")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-black text-foreground">${r.amount}</div>
                    <div className="text-xs text-muted-foreground">{r.days} días</div>
                  </div>
                </div>

                {/* Payment info */}
                <div className="bg-white/[0.04] rounded-xl p-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Método</span>
                    <span className="text-foreground font-medium">
                      {METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
                    </span>
                  </div>
                  {r.transactionRef && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Referencia</span>
                      <span className="text-foreground font-mono text-xs">{r.transactionRef}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Fecha</span>
                    <span className="text-foreground text-xs">
                      {new Date(r.createdAt).toLocaleString("es-VE")}
                    </span>
                  </div>
                  {r.receiptUrl && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Comprobante</span>
                      <a
                        href={r.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
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

                {/* Actions */}
                {r.status === "pending" && (
                  <div className="space-y-2">
                    <input
                      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Nota para el cliente (opcional)"
                      value={adminNotes[r.id] ?? ""}
                      onChange={(e) => setAdminNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => rejectMutation.mutate({ id: r.id, notes: adminNotes[r.id] })}
                        disabled={isActing}
                        className="flex-1 py-2.5 rounded-xl bg-red-400/10 text-red-400 text-sm font-medium hover:bg-red-400/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {rejectMutation.isPending && rejectMutation.variables?.id === r.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Rechazar
                      </button>
                      <button
                        onClick={() => approveMutation.mutate({ id: r.id, notes: adminNotes[r.id] })}
                        disabled={isActing}
                        className="flex-1 py-2.5 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {approveMutation.isPending && approveMutation.variables?.id === r.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminClientPremiumPage() {
  const [tab, setTab] = useState<"gestionar" | "solicitudes">("gestionar");

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" /> Premium Clientes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona el plan Premium de los clientes
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTab("gestionar")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === "gestionar"
              ? "btn-gradient text-white"
              : "glass text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star className="w-3.5 h-3.5" /> Gestionar Premium
        </button>
        <button
          onClick={() => setTab("solicitudes")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === "solicitudes"
              ? "btn-gradient text-white"
              : "glass text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Solicitudes de Pago
        </button>
      </div>

      {tab === "gestionar" ? <GestionarTab /> : <SolicitudesTab />}
    </div>
  );
}
