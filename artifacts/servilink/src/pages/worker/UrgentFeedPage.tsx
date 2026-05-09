import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Zap, Clock, CheckCircle2, Loader2, MapPin, User,
  RefreshCw, Bell, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function UrgentFeedPage() {
  const { token } = useAuth();
  const [, navigate] = useLocation();

  const [openRequests, setOpenRequests]   = useState<any[]>([]);
  const [myRequests, setMyRequests]       = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [claiming, setClaiming]           = useState<number | null>(null);
  const [tab, setTab]                     = useState<"open" | "mine">("open");
  const [lastRefresh, setLastRefresh]     = useState<Date>(new Date());

  const loadAll = useCallback(async () => {
    try {
      const [open, mine] = await Promise.all([
        apiFetch("/api/urgent/open",   { headers: getAuthHeader() }),
        apiFetch("/api/urgent/worker", { headers: getAuthHeader() }),
      ]);
      setOpenRequests(open  ?? []);
      setMyRequests(mine ?? []);
      setLastRefresh(new Date());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) loadAll(); }, [token, loadAll]);

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => { if (token) loadAll(); }, 30_000);
    return () => clearInterval(id);
  }, [token, loadAll]);

  const handleClaim = async (id: number) => {
    setClaiming(id);
    try {
      const result = await apiFetch(`/api/urgent/${id}/claim`, { method: "POST", headers: getAuthHeader() });
      toast({ title: "✅ ¡Solicitud tomada! Abriendo el chat..." });
      if (result?.bookingId) {
        navigate(`/professional/chat/${result.bookingId}`);
      } else {
        await loadAll();
        setTab("mine");
      }
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al tomar la solicitud", variant: "destructive" });
    } finally { setClaiming(null); }
  };

  const statusLabel = (status: string) => {
    if (status === "claimed")   return { text: "Tomada por ti",  color: "text-emerald-400" };
    if (status === "cancelled") return { text: "Cancelada",      color: "text-rose-400" };
    if (status === "expired")   return { text: "Expirada",       color: "text-muted-foreground" };
    return { text: "Abierta", color: "text-amber-400" };
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-rose-500" />
              Urgencias
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Solicitudes urgentes de clientes que necesitan ayuda ahora
            </p>
          </div>
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>

        {/* Last refresh */}
        <p className="text-[10px] text-muted-foreground/60 text-right -mt-3">
          Actualizado {formatDistanceToNow(lastRefresh, { locale: es, addSuffix: true })}
        </p>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
          <Bell className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-rose-300 leading-relaxed">
            Cuando un cliente activa el modo urgencia, recibes una notificación inmediata.
            El primer profesional en <strong className="text-rose-200">tomar la solicitud</strong> se queda con el trabajo.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setTab("open")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              tab === "open" ? "bg-rose-600 text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Disponibles
            {openRequests.length > 0 && (
              <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                {openRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("mine")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Mis tomadas
            {myRequests.filter(r => r.status === "claimed").length > 0 && (
              <span className="ml-2 bg-primary-foreground/20 text-xs px-1.5 py-0.5 rounded-full">
                {myRequests.filter(r => r.status === "claimed").length}
              </span>
            )}
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando solicitudes...</span>
          </div>
        )}

        {/* Open requests tab */}
        {!loading && tab === "open" && (
          <div className="space-y-3">
            {openRequests.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm font-medium text-foreground">Sin solicitudes urgentes ahora</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cuando un cliente active el modo urgencia, aparecerá aquí
                </p>
              </div>
            ) : (
              openRequests.map(r => (
                <div key={r.id} className="bg-card border-2 border-rose-500/30 rounded-2xl overflow-hidden">
                  {/* Urgency badge */}
                  <div className="bg-rose-500/10 px-4 py-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Solicitud urgente</span>
                    <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Expira {formatDistanceToNow(new Date(r.expiresAt), { locale: es, addSuffix: true })}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Category */}
                    {r.categoryName && (
                      <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        {r.categoryIcon} {r.categoryName}
                      </span>
                    )}

                    {/* Description */}
                    <p className="text-sm font-medium text-foreground leading-relaxed">{r.description}</p>

                    {/* Location */}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      {r.address}
                    </p>

                    {/* Client */}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 flex-shrink-0" />
                      {r.clientName ?? "Cliente"}
                      <span className="text-muted-foreground/50">·</span>
                      {formatDistanceToNow(new Date(r.createdAt), { locale: es, addSuffix: true })}
                    </p>

                    {/* Claim button */}
                    <button
                      onClick={() => handleClaim(r.id)}
                      disabled={claiming === r.id}
                      className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {claiming === r.id
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Tomando...</>
                        : <><Zap className="w-4 h-4" />¡Tomar solicitud!</>
                      }
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* My claimed tab */}
        {!loading && tab === "mine" && (
          <div className="space-y-3">
            {myRequests.length === 0 ? (
              <div className="text-center py-12">
                <Zap className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm font-medium text-foreground">Aún no has tomado solicitudes</p>
                <p className="text-xs text-muted-foreground mt-1">Las urgencias que tomes aparecerán aquí</p>
              </div>
            ) : (
              myRequests.map(r => {
                const st = statusLabel(r.status);
                return (
                  <div key={r.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground flex-1">{r.description}</p>
                      <span className={`text-xs font-semibold ${st.color} flex-shrink-0`}>{st.text}</span>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{r.address}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" />Cliente: {r.clientName ?? "—"}
                    </p>
                    {r.claimedAt && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Tomada {formatDistanceToNow(new Date(r.claimedAt), { locale: es, addSuffix: true })}
                      </p>
                    )}
                    {r.status === "claimed" && r.bookingId && (
                      <button
                        onClick={() => navigate(`/professional/chat/${r.bookingId}`)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 mt-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ir al chat de negociación
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
