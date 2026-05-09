import { useState, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getAuthHeader } from "@/lib/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronDown, ChevronUp, RefreshCw, AlertTriangle, CheckCircle,
  XCircle, MessageSquare, Send, Loader2, Shield, User, Wrench,
  DollarSign, Clock, Eye, X
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const DISPUTE_STATUSES = [
  { key: undefined, label: "Todas" },
  { key: "disputed", label: "⚠ Nuevas" },
  { key: "dispute_in_review", label: "🔍 En Revisión" },
  { key: "dispute_resolved_client", label: "✅ Resueltas: Cliente" },
  { key: "dispute_resolved_worker", label: "✅ Resueltas: Profesional" },
] as const;

async function fetchDisputes(status?: string) {
  const url = status ? `/api/admin/disputes?status=${status}` : "/api/admin/disputes";
  const res = await fetch(url, { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function fetchMessages(bookingId: number) {
  const res = await fetch(`/api/disputes/${bookingId}/messages`, { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function sendMessage(bookingId: number, content: string) {
  const res = await fetch(`/api/disputes/${bookingId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Error al enviar mensaje");
  return res.json();
}

async function setInReview(bookingId: number) {
  const res = await fetch(`/api/admin/bookings/${bookingId}/dispute/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error");
  }
  return res.json();
}

async function resolveDispute(bookingId: number, winner: "client" | "worker") {
  const res = await fetch(`/api/admin/bookings/${bookingId}/dispute/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ winner }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error");
  }
  return res.json();
}

// ── DisputeChat ───────────────────────────────────────────────────────────────

function DisputeChat({ bookingId }: { bookingId: number }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const msgs = await fetchMessages(bookingId);
    setMessages(msgs);
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(bookingId, content.trim());
      setMessages(prev => [...prev, msg]);
      setContent("");
    } catch (e) {}
    finally { setSending(false); }
  };

  const roleColors: Record<string, string> = {
    client: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
    worker: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
    admin: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
  };
  const roleIcons: Record<string, React.ElementType> = {
    client: User, worker: Wrench, admin: Shield,
  };
  const roleLabels: Record<string, string> = {
    client: "Cliente", worker: "Profesional", admin: "LinkServi Admin",
  };

  return (
    <div className="flex flex-col h-80 border border-border rounded-xl overflow-hidden bg-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="w-6 h-6 mb-1 opacity-40" />
            <p className="text-xs">Sin mensajes aún</p>
          </div>
        ) : (
          messages.map(m => {
            const Icon = roleIcons[m.senderRole] ?? User;
            const colorClass = roleColors[m.senderRole] ?? "bg-muted border-border";
            return (
              <div key={m.id} className={`p-2.5 rounded-xl border ${colorClass}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-semibold text-foreground">{m.senderName}</span>
                  <span className="text-xs text-muted-foreground">({roleLabels[m.senderRole] ?? m.senderRole})</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {m.createdAt ? format(new Date(m.createdAt), "HH:mm", { locale: es }) : ""}
                  </span>
                </div>
                <p className="text-sm text-foreground">{m.content}</p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {/* Input */}
      <div className="border-t border-border p-2 flex gap-2 bg-card">
        <input
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Escribe un mensaje como admin..."
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || sending}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── DisputeRow ────────────────────────────────────────────────────────────────

function DisputeRow({ d, onUpdated }: { d: any; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showProof, setShowProof] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState<"client" | "worker" | null>(null);

  const isActive = ["disputed", "dispute_in_review"].includes(d.status);
  const isNew = d.status === "disputed";

  const handle = async (action: () => Promise<unknown>, key: string) => {
    setLoading(key);
    setError("");
    try {
      await action();
      setExpanded(false);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
      setConfirmResolve(null);
    }
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-colors ${isNew ? "border-rose-300 dark:border-rose-700" : isActive ? "border-orange-300 dark:border-orange-700" : "border-border"}`}>
      {/* Summary row */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isNew && <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 animate-pulse" />}
          {d.status === "dispute_in_review" && <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0 animate-pulse" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">#{d.id}</span>
              <StatusBadge status={d.status} />
              {d.messageCount > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <MessageSquare className="w-3 h-3" /> {d.messageCount}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              Cliente: <span className="text-foreground font-medium">{d.clientName}</span>
              {" → "}
              Profesional: <span className="text-foreground font-medium">{d.workerName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {d.totalAmount && <span className="text-sm font-bold text-foreground">${d.totalAmount.toFixed(2)}</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">

          {/* Parties */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">Cliente</span>
              </div>
              <p className="text-sm font-medium text-foreground">{d.clientName}</p>
              <p className="text-xs text-muted-foreground truncate">{d.clientEmail}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-1.5 mb-1">
                <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Profesional</span>
              </div>
              <p className="text-sm font-medium text-foreground">{d.workerName}</p>
              <p className="text-xs text-muted-foreground truncate">{d.workerEmail}</p>
            </div>
          </div>

          {/* Dispute reason */}
          {d.disputeReason && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">Motivo de disputa</span>
              </div>
              <p className="text-sm text-foreground">{d.disputeReason}</p>
            </div>
          )}

          {/* Amount + date */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {d.totalAmount && (
              <div className="p-2 rounded-lg bg-muted/50 border border-border">
                <span className="text-muted-foreground block">Monto en disputa</span>
                <span className="font-bold text-foreground text-sm">${d.totalAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="p-2 rounded-lg bg-muted/50 border border-border">
              <span className="text-muted-foreground block">Fecha</span>
              <span className="font-medium text-foreground">
                {d.createdAt ? format(new Date(d.createdAt), "dd MMM yyyy", { locale: es }) : "—"}
              </span>
            </div>
          </div>

          {/* Payment proof */}
          {d.paymentProofUrl && d.paymentProofUrl.startsWith("data:image") && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Comprobante de pago</p>
              <div className="relative">
                <img
                  src={d.paymentProofUrl}
                  alt="Comprobante"
                  className="w-full max-h-44 object-contain rounded-xl bg-muted border border-border cursor-pointer"
                  onClick={() => setShowProof(true)}
                />
                <button
                  onClick={() => setShowProof(true)}
                  className="absolute bottom-2 right-2 flex items-center gap-1 text-xs bg-background/80 backdrop-blur border border-border px-2 py-1 rounded-lg"
                >
                  <Eye className="w-3 h-3" /> Ver completo
                </button>
              </div>
            </div>
          )}

          {/* Dispute chat */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Chat de disputa
            </p>
            <DisputeChat bookingId={d.id} />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          {/* Actions */}
          {isActive && (
            <div className="space-y-3">
              {d.status === "disputed" && (
                <button
                  onClick={() => handle(() => setInReview(d.id), "review")}
                  disabled={!!loading}
                  className="w-full py-2.5 rounded-xl border border-orange-300 text-orange-600 text-xs font-semibold hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading === "review" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                  Marcar como "En Revisión"
                </button>
              )}

              {!confirmResolve ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmResolve("worker")}
                    disabled={!!loading}
                    className="py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <DollarSign className="w-3.5 h-3.5" /> Liberar pago al profesional
                  </button>
                  <button
                    onClick={() => setConfirmResolve("client")}
                    disabled={!!loading}
                    className="py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancelar pago al profesional
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 space-y-2">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    {confirmResolve === "worker"
                      ? "¿Confirmar? El pago se LIBERARÁ al profesional."
                      : "¿Confirmar? El pago al profesional será CANCELADO."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmResolve(null)}
                      className="flex-1 py-2 rounded-xl border border-border text-xs hover:bg-muted"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handle(() => resolveDispute(d.id, confirmResolve!), `resolve-${confirmResolve}`)}
                      disabled={!!loading}
                      className={`flex-1 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1 ${confirmResolve === "worker" ? "bg-teal-600 hover:bg-teal-700" : "bg-blue-600 hover:bg-blue-700"}`}
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Confirmar resolución
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resolved result */}
          {!isActive && (
            <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${d.status === "dispute_resolved_worker" ? "bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/10 dark:border-teal-800 dark:text-teal-400" : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/10 dark:border-blue-800 dark:text-blue-400"}`}>
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {d.status === "dispute_resolved_worker"
                ? `Pago liberado al profesional — $${(d.workerEarnings ?? 0).toFixed(2)}`
                : "Pago cancelado — resuelta a favor del cliente"}
            </div>
          )}
        </div>
      )}

      {/* Proof lightbox */}
      {showProof && d.paymentProofUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowProof(false)}>
          <div className="relative max-w-2xl w-full">
            <img src={d.paymentProofUrl} alt="Comprobante" className="w-full rounded-xl" />
            <button onClick={() => setShowProof(false)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AdminDisputesPage ─────────────────────────────────────────────────────────

export function AdminDisputesPage() {
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchDisputes(tab);
    setDisputes(data);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const newCount = disputes.filter(d => d.status === "disputed").length;
  const inReviewCount = disputes.filter(d => d.status === "dispute_in_review").length;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Disputas</h1>
            {newCount > 0 && (
              <p className="text-sm text-rose-600 font-medium mt-0.5 animate-pulse">
                ⚠ {newCount} disputa{newCount > 1 ? "s" : ""} nueva{newCount > 1 ? "s" : ""} sin revisar
              </p>
            )}
            {inReviewCount > 0 && !newCount && (
              <p className="text-sm text-orange-600 font-medium mt-0.5">
                🔍 {inReviewCount} disputa{inReviewCount > 1 ? "s" : ""} en revisión
              </p>
            )}
          </div>
          <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {DISPUTE_STATUSES.map(t => {
            const count = t.key === "disputed" ? newCount : t.key === "dispute_in_review" ? inReviewCount : 0;
            return (
              <button
                key={t.label}
                onClick={() => setTab(t.key)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center animate-pulse">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Alert when new disputes */}
        {(tab === undefined || tab === "disputed") && newCount > 0 && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                {newCount} disputa{newCount > 1 ? "s" : ""} esperando revisión
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">
                Los fondos están retenidos hasta que resuelvas cada caso. Revisa el chat con el cliente y el profesional antes de decidir.
              </p>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : disputes.length === 0 ? (
          <div className="py-16 text-center bg-card border border-border rounded-xl">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="font-semibold text-foreground text-base">Todo bajo control</p>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === undefined || tab === "disputed"
                ? "No hay disputas nuevas. El sistema funciona correctamente."
                : tab === "dispute_in_review"
                  ? "Sin disputas en revisión actualmente."
                  : "No hay disputas en esta categoría."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {disputes.map(d => (
              <DisputeRow key={d.id} d={d} onUpdated={load} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
