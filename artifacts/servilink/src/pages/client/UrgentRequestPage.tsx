import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useListCategories } from "@workspace/api-client-react";
import { getRequestOptions } from "@/lib/api";
import { useLocation } from "wouter";
import {
  Zap, Plus, X, Clock, CheckCircle2, XCircle, Loader2,
  MapPin, AlertTriangle, User, ChevronDown, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:      { label: "Esperando",   color: "text-amber-400",  icon: <Clock className="w-3.5 h-3.5" /> },
  claimed:   { label: "¡En camino!", color: "text-emerald-400",icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  cancelled: { label: "Cancelada",   color: "text-rose-400",   icon: <XCircle className="w-3.5 h-3.5" /> },
  expired:   { label: "Expirada",    color: "text-muted-foreground", icon: <Clock className="w-3.5 h-3.5" /> },
};

export function UrgentRequestPage() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const opts = getRequestOptions(token);
  const { data: categories = [] } = useListCategories({ query: {} } as any);

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const [form, setForm] = useState({ description: "", address: "", categoryId: "" });

  const loadRequests = async () => {
    try {
      const data = await apiFetch("/api/urgent/client", { headers: getAuthHeader() });
      setRequests(data ?? []);
    } catch { setRequests([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (token) loadRequests(); }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim() || !form.address.trim()) {
      toast({ title: "Describe qué necesitas y tu dirección", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/urgent", {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          address: form.address,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        }),
      });
      toast({ title: "🚨 ¡Solicitud enviada! Los profesionales cercanos fueron notificados" });
      setForm({ description: "", address: "", categoryId: "" });
      setShowForm(false);
      await loadRequests();
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al enviar solicitud", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleCancel = async (id: number) => {
    setCancelling(id);
    try {
      await apiFetch(`/api/urgent/${id}/cancel`, { method: "POST", headers: getAuthHeader() });
      toast({ title: "Solicitud cancelada" });
      await loadRequests();
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al cancelar", variant: "destructive" });
    } finally { setCancelling(null); }
  };

  const hasOpen = requests.some(r => r.status === "open");

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-rose-500" />
              Modo Urgencia
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Notifica a todos los profesionales disponibles al instante
            </p>
          </div>
          {!hasOpen && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva
            </button>
          )}
        </div>

        {/* How it works banner */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-rose-300 leading-relaxed">
            Al activar el modo urgencia, <strong className="text-rose-200">todos los profesionales disponibles</strong> reciben
            una notificación inmediata. El primero en aceptar se comunica contigo.
            Las solicitudes expiran en <strong className="text-rose-200">2 horas</strong>.
          </p>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-foreground">Nueva solicitud urgente</p>
              <button type="button" onClick={() => setShowForm(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category */}
            <div className="relative">
              <select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">Categoría (opcional)</option>
                {(categories as any[]).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* Description */}
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="¿Qué necesitas urgentemente? Ej: Se rompió una tubería, necesito electricista..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-500"
            />

            {/* Address */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Tu dirección o zona"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !form.description.trim() || !form.address.trim()}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                : <><Zap className="w-4 h-4" />🚨 Activar Modo Urgencia</>
              }
            </button>
          </form>
        )}

        {/* Active open request */}
        {hasOpen && (
          <div className="bg-rose-500/5 border-2 border-rose-500/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <p className="text-sm font-bold text-rose-400">Solicitud activa — buscando profesional</p>
            </div>
            {requests.filter(r => r.status === "open").map(r => (
              <div key={r.id} className="space-y-2">
                <p className="text-sm text-foreground">{r.description}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{r.address}
                </p>
                <p className="text-xs text-muted-foreground">
                  Expira {formatDistanceToNow(new Date(r.expiresAt), { locale: es, addSuffix: true })}
                </p>
                <button
                  onClick={() => handleCancel(r.id)}
                  disabled={cancelling === r.id}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 disabled:opacity-50"
                >
                  {cancelling === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  Cancelar solicitud
                </button>
              </div>
            ))}
          </div>
        )}

        {/* History */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>

          {loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Cargando...</span>
            </div>
          )}

          {!loading && requests.filter(r => r.status !== "open").length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Sin solicitudes anteriores</p>
            </div>
          )}

          {requests.filter(r => r.status !== "open").map(r => {
            const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.expired;
            return (
              <div key={r.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground flex-1">{r.description}</p>
                  <div className={`flex items-center gap-1 text-xs font-semibold ${st.color}`}>
                    {st.icon}{st.label}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{r.address}
                </p>
                {r.status === "claimed" && r.workerName && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <User className="w-3 h-3" />Atendido por: {r.workerName}
                  </p>
                )}
                {r.status === "claimed" && r.bookingId && (
                  <button
                    onClick={() => navigate(`/client/chat/${r.bookingId}`)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Ir al chat — negociar precio y pagar
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.createdAt), { locale: es, addSuffix: true })}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
