import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListBookings } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MessageSquare, Calendar, ChevronRight, DollarSign, BadgeCheck, RotateCcw, Clock, Zap, Users, Star, Timer } from "lucide-react";
import { getRequestOptions, getAuthHeader, track } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const TABS = [
  { key: "en_curso",      label: "En curso" },
  { key: "por_confirmar", label: "Por confirmar" },
  { key: "historial",     label: "Historial" },
] as const;

type TabKey = typeof TABS[number]["key"];

const EN_CURSO_STATUSES    = ["pending", "accepted", "payment_pending", "payment_confirmed", "in_progress", "disputed", "dispute_in_review"];
const POR_CONFIRMAR_STATUSES = ["finished"];
const HISTORIAL_STATUSES   = ["completed", "cancelled", "dispute_resolved_client", "dispute_resolved_worker"];


// ── AlternativesPanel ────────────────────────────────────────────────────────
// Shows top-3 other available workers when a booking has been pending > 10 min.
// Features: response-time badges, sent-state, dynamic counter, social proof.
function AlternativesPanel({ bookingId }: { bookingId: number }) {
  const [, navigate] = useLocation();
  const [alts, setAlts] = useState<any[] | null>(null);
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}/alternatives`, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setAlts(Array.isArray(d) ? d : []))
      .catch(() => setAlts([]));
  }, [bookingId]);

  if (!alts || alts.length === 0) return null;

  const top       = alts.slice(0, 3);
  const remaining = top.length - sentIds.size;
  const totalJobs  = top.reduce((s, a) => s + (a.completedJobs ?? 0), 0);

  const countLabel = remaining > 0
    ? `${remaining} disponible${remaining !== 1 ? "s" : ""} ahora`
    : "Todos contactados";

  function handleContact(a: any) {
    if (sentIds.has(a.id)) return;
    track("contact_click", { workerId: a.id, source: "alternatives_panel" });
    setSentIds(prev => new Set(prev).add(a.id));
    navigate(`/client/worker/${a.id}`);
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden"
      style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.20)" }}>

      {/* ── Header ── */}
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(165,180,252,0.8)" }} />
            <p className="text-xs font-semibold" style={{ color: "rgba(165,180,252,0.8)" }}>
              Otros profesionales disponibles ahora
            </p>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums transition-all"
            style={{
              background: remaining > 0 ? "rgba(99,102,241,0.18)" : "rgba(52,211,153,0.12)",
              color:      remaining > 0 ? "rgba(165,180,252,0.95)" : "rgba(52,211,153,0.9)",
              border:     remaining > 0 ? "1px solid rgba(99,102,241,0.25)" : "1px solid rgba(52,211,153,0.25)",
            }}>
            {countLabel}
          </span>
        </div>
        {/* Microcopy */}
        <p className="text-[11px] mt-1.5 pl-5" style={{ color: "rgba(165,180,252,0.65)" }}>
          Contacta a más de uno y recibe respuesta en minutos
        </p>
        {/* Social proof */}
        {totalJobs > 0 && (
          <p className="text-[11px] mt-0.5 pl-5" style={{ color: "rgba(165,180,252,0.4)" }}>
            +{totalJobs} solicitudes respondidas en total por estos profesionales
          </p>
        )}
      </div>

      {/* ── Worker rows ── */}
      <div className="divide-y" style={{ borderColor: "rgba(99,102,241,0.10)" }}>
        {top.map((a: any, idx: number) => {
          const sent    = sentIds.has(a.id);
          const isBest  = idx === 0 && (
            a.hasRecentContact ||
            a.hasRecentActivity24h ||
            (a.avgResponseMinutes != null && a.avgResponseMinutes < 10) ||
            (a.rating != null && Number(a.rating) >= 4.5)
          );
          const hasTime = a.avgResponseMinutes != null;

          return (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5"
              style={isBest ? { background: "rgba(99,102,241,0.055)" } : undefined}>
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {a.avatarUrl
                  ? <img src={a.avatarUrl} className="w-8 h-8 rounded-full object-cover" />
                  : <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                      style={{ background: "rgba(99,102,241,0.25)", color: "rgba(165,180,252,0.9)" }}>
                      {a.name?.charAt(0)?.toUpperCase()}
                    </div>
                }
                {(a.isAvailable || a.hasRecentContact || a.hasRecentActivity24h) && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                    style={{
                      background: a.isAvailable
                        ? "rgba(52,211,153,1)"
                        : a.hasRecentContact
                        ? "rgba(251,146,60,1)"
                        : "rgba(251,191,36,1)",
                      borderColor: "rgba(15,23,42,1)",
                    }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.88)" }}>{a.name}</p>
                  {isBest && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: "rgba(251,191,36,0.12)", color: "rgba(251,191,36,0.9)", border: "1px solid rgba(251,191,36,0.2)" }}>
                      Mejor opción ahora
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {a.hasRecentContact && (
                    <span className="text-[11px] font-semibold" style={{ color: "rgba(251,146,60,0.95)" }}>
                      🔥 Respondiendo ahora
                    </span>
                  )}
                  {!a.hasRecentContact && a.hasRecentActivity24h && (
                    <span className="text-[11px] font-semibold" style={{ color: "rgba(251,191,36,0.85)" }}>
                      🟡 Activo hoy
                    </span>
                  )}
                  {!a.hasRecentContact && !a.hasRecentActivity24h && hasTime && (
                    <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "rgba(52,211,153,0.8)" }}>
                      <Timer className="w-2.5 h-2.5" />
                      Responde en ~{a.avgResponseMinutes} min
                    </span>
                  )}
                  {!a.hasRecentContact && !a.hasRecentActivity24h && !hasTime && a.rating && (
                    <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "rgba(251,191,36,0.8)" }}>
                      <Star className="w-3 h-3 fill-current" />{Number(a.rating).toFixed(1)}
                    </span>
                  )}
                  {a.completedJobs > 0 && (
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      · {a.completedJobs} trabajos
                    </span>
                  )}
                </div>
              </div>

              {/* CTA */}
              <button
                disabled={sent}
                onClick={() => handleContact(a)}
                className="flex-shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:cursor-default"
                style={sent
                  ? { background: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.8)", border: "1px solid rgba(52,211,153,0.25)" }
                  : { background: "rgba(99,102,241,0.18)", color: "rgba(165,180,252,0.95)", border: "1px solid rgba(99,102,241,0.3)" }
                }>
                {sent ? "Enviado ✓" : <>Contactar <ChevronRight className="w-3 h-3" /></>}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2" style={{ borderTop: "1px solid rgba(99,102,241,0.10)" }}>
        <p className="text-[11px] text-center font-medium" style={{ color: "rgba(165,180,252,0.45)" }}>
          ⚡ Los clientes suelen elegir al primero que responde
        </p>
      </div>
    </div>
  );
}

// ── CounterOfferBanner ───────────────────────────────────────────────────────
function CounterOfferBanner({
  bookingId, workerName, amount, originalAmount, onRefresh
}: {
  bookingId: number; workerName: string; amount: number;
  originalAmount?: number | null; onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const respond = async (accept: boolean) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/counter-offer/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ accept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setDone(true);
      onRefresh();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (done) return null;

  return (
    <div className="mb-3 p-3 rounded-xl bg-primary/5 border-2 border-primary/20">
      <div className="flex items-start gap-2">
        <DollarSign className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground mb-0.5">💬 {workerName} propone un precio</p>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-bold text-primary">${amount.toFixed(2)}</span>
            {originalAmount && (
              <span className="text-xs text-muted-foreground">(tu oferta: ${originalAmount.toFixed(2)})</span>
            )}
          </div>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => respond(false)}
              disabled={loading}
              className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Rechazar
            </button>
            <button
              onClick={() => respond(true)}
              disabled={loading}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "..." : "✓ Aceptar precio"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
const EMPTY_MESSAGES: Record<string, { title: string; sub: string; cta?: string }> = {
  en_curso:      { title: "No tienes servicios activos",       sub: "Cuando solicites un servicio, lo verás aquí mientras está en proceso.", cta: "Buscar profesional" },
  por_confirmar: { title: "Nada por confirmar por ahora",      sub: "Cuando un profesional marque un trabajo como terminado, aparecerá aquí para que lo apruebes." },
  historial:     { title: "Tu historial está vacío",           sub: "Aquí aparecerán todos los servicios que hayas completado o cancelado.", cta: "Buscar profesional" },
};

function EmptyState({ activeTab, onSearch }: { activeTab: TabKey; onSearch: () => void }) {
  const msg = EMPTY_MESSAGES[activeTab];
  return (
    <div className="py-14 text-center bg-card border border-border rounded-2xl px-6 space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
        <Calendar className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground text-base">{msg?.title ?? "Sin solicitudes aquí"}</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">{msg?.sub ?? ""}</p>
      </div>
      {msg?.cta && (
        <button
          onClick={onSearch}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
        >
          {msg.cta} <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ClientBookingsPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("en_curso");
  const opts = getRequestOptions();

  // Always fetch ALL bookings and filter client-side for simpler UX
  const { data: allBookings = [], isLoading, refetch } = useListBookings(
    { role: "client" },
    opts as any
  );

  const bookings = (allBookings as any[]).filter((b: any) => {
    if (activeTab === "en_curso")      return EN_CURSO_STATUSES.includes(b.status);
    if (activeTab === "por_confirmar") return POR_CONFIRMAR_STATUSES.includes(b.status);
    if (activeTab === "historial")     return HISTORIAL_STATUSES.includes(b.status);
    return true;
  });

  const finishedCount = (allBookings as any[]).filter((b: any) => b.status === "finished").length;
  const awaitingPaymentCount = (allBookings as any[]).filter((b: any) => b.status === "accepted").length;
  const paymentPendingCount = (allBookings as any[]).filter((b: any) => b.status === "payment_pending").length;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-start gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground flex-1 min-w-0">Mis Solicitudes</h1>
          <div className="flex gap-1.5 flex-wrap">
            {awaitingPaymentCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 font-semibold flex-shrink-0">
                {awaitingPaymentCount} por pagar
              </span>
            )}
            {paymentPendingCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200 font-semibold animate-pulse flex-shrink-0">
                {paymentPendingCount} verificando
              </span>
            )}
            {finishedCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-semibold animate-pulse flex-shrink-0">
                {finishedCount} por confirmar
              </span>
            )}
          </div>
        </div>

        {/* Tabs — 3 clear groups */}
        <div className="grid grid-cols-3 gap-2 bg-muted p-1 rounded-xl">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const badge =
              tab.key === "en_curso"      ? (awaitingPaymentCount + paymentPendingCount) || 0 :
              tab.key === "por_confirmar" ? finishedCount :
              0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all
                  ${isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {tab.label}
                {badge > 0 && (
                  <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center
                    ${tab.key === "por_confirmar" ? "bg-orange-500" : "bg-primary"}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : (bookings as any[]).length === 0 ? (
          <EmptyState activeTab={activeTab} onSearch={() => navigate("/client/search")} />
        ) : (
          <div className="space-y-3">
            {(bookings as any[]).map((b: any) => (
              <div
                key={b.id}
                className={`p-4 bg-card border rounded-xl ${
                  b.status === "accepted" ? "border-yellow-300 dark:border-yellow-700" :
                  b.status === "payment_pending" ? "border-cyan-300 dark:border-cyan-700" :
                  b.status === "payment_confirmed" ? "border-teal-300 dark:border-teal-700" :
                  b.status === "finished" ? "border-orange-300 dark:border-orange-700" :
                  b.status === "disputed" ? "border-red-300 dark:border-red-700" :
                  "border-border"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-semibold text-foreground">{b.categoryName}</p>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{b.workerName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {b.totalAmount ? (
                      <p className="font-bold text-foreground text-sm">${b.totalAmount.toFixed(2)}</p>
                    ) : null}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {b.description?.replace("[URGENTE] ", "")}
                </p>

                {/* ── PENDING: waiting for worker response ── */}
                {b.status === "pending" && (() => {
                  const elapsedMin = b.createdAt
                    ? Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 60000)
                    : 0;
                  const showAlternatives = elapsedMin >= 10;
                  return (
                    <>
                      <div className="mb-3 rounded-xl px-3 py-2.5 flex items-start gap-2.5"
                        style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)" }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold" style={{ color: "rgba(251,191,36,0.9)" }}>
                            Pendiente de respuesta
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                            Enviada hace {b.createdAt ? formatDistanceToNow(new Date(b.createdAt), { locale: es, addSuffix: false }) : "—"} · El profesional responderá pronto
                          </p>
                        </div>
                        <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.5)" }} />
                      </div>
                      {showAlternatives && <AlternativesPanel bookingId={b.id} />}
                    </>
                  );
                })()}

                {/* Counter-offer: client must respond to worker's proposed price */}
                {b.counterOfferStatus === "pending" && b.workerCounterOffer && (
                  <CounterOfferBanner
                    bookingId={b.id}
                    workerName={b.workerName}
                    amount={b.workerCounterOffer}
                    originalAmount={b.clientBudget}
                    onRefresh={refetch}
                  />
                )}

                {/* ── ACCEPTED: payment nudge ── */}
                {b.status === "accepted" && (
                  <div className="mb-3 p-3 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800">
                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-400 mb-0.5">💳 Acción requerida — Realizar pago</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-500">El profesional aceptó tu solicitud. Ve al detalle para realizar el pago.</p>
                    {b.paymentRejectedReason && (
                      <p className="text-xs text-red-600 mt-1"><strong>⚠ Pago anterior rechazado:</strong> {b.paymentRejectedReason}</p>
                    )}
                  </div>
                )}

                {/* ── PAYMENT_PENDING ── */}
                {b.status === "payment_pending" && (
                  <div className="mb-3 p-3 rounded-xl bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/10 dark:border-cyan-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse flex-shrink-0" />
                    <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-400">Comprobante en revisión (máx. 30 min)</p>
                  </div>
                )}

                {/* ── PAYMENT_CONFIRMED: compact badge ── */}
                {b.status === "payment_confirmed" && (
                  <div className="mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-teal-50 border border-teal-200 dark:bg-teal-900/10 dark:border-teal-700">
                    <BadgeCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                    <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">Pago verificado ✓ — el profesional puede iniciar</p>
                  </div>
                )}

                {/* ── FINISHED: action nudge ── */}
                {b.status === "finished" && (
                  <div className="mb-3 p-2.5 rounded-xl bg-orange-50 border border-orange-200 dark:bg-orange-900/10 dark:border-orange-800">
                    <p className="text-xs font-semibold text-orange-800 dark:text-orange-400">🏁 Acción requerida — Confirmar o disputar el servicio</p>
                  </div>
                )}

                {/* ── DISPUTED ── */}
                {["disputed", "dispute_in_review"].includes(b.status) && (
                  <div className="mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-800">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                      {b.status === "disputed" ? "Disputa abierta — en revisión" : "Disputa en revisión activa"}
                    </p>
                  </div>
                )}

                {/* ── COMPLETED: total ── */}
                {b.status === "completed" && b.totalAmount != null && (
                  <div className="mb-3 flex justify-between items-center p-2.5 rounded-xl bg-muted/40 border border-border text-xs">
                    <span className="text-muted-foreground">Total pagado</span>
                    <span className="font-bold text-foreground">${b.totalAmount.toFixed(2)}</span>
                  </div>
                )}

                {/* Actions row */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {b.createdAt ? format(new Date(b.createdAt), "dd/MM HH:mm") : ""}
                  </span>

                  <div className="flex items-center gap-2">
                    {/* Re-hire — completed/cancelled */}
                    {["completed", "cancelled"].includes(b.status) && b.workerId && (
                      <button
                        onClick={() => navigate(`/client/book/${b.workerId}`)}
                        className="flex items-center gap-1.5 text-xs border border-primary/30 text-primary px-3 py-2 rounded-xl hover:bg-primary/10 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Contratar de nuevo
                      </button>
                    )}
                    {/* Chat — active bookings only */}
                    {["payment_confirmed", "in_progress", "finished"].includes(b.status) && (
                      <button
                        onClick={() => navigate(`/client/chat/${b.id}`)}
                        className="flex items-center gap-1.5 text-xs border border-border text-muted-foreground px-3 py-2 rounded-xl hover:text-foreground hover:border-primary/40 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" /> Chat
                      </button>
                    )}
                    {/* Ver servicio — main CTA always present */}
                    <button
                      onClick={() => navigate(`/client/booking/${b.id}`)}
                      className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-sm"
                    >
                      Ver servicio →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </AppLayout>
  );
}
