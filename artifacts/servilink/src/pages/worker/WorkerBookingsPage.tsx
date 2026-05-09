import { useState } from "react";
import { useListBookings, useAcceptBooking, useRejectBooking } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getRequestOptions, startBooking, finishBooking } from "@/lib/api";
import { ClientReputationBadge } from "@/components/ui/ClientReputationBadge";
import { RateClientModal } from "@/components/ui/RateClientModal";
import { CounterOfferModal } from "@/components/ui/CounterOfferModal";
import { ServicePhotoUpload } from "@/components/ui/ServicePhotoUpload";
import { useWorkerVerification } from "@/lib/worker-verification-context";
import { WorkerKYCModal } from "@/components/ui/WorkerKYCModal";
import {
  CheckCircle, XCircle, CheckSquare, MapPin, Clock, Play,
  AlertTriangle, Inbox, Zap, ChevronRight, MessageSquare, Award, DollarSign, Camera,
  BadgeCheck, ShieldAlert,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const PRIORITY_ORDER: Record<string, number> = {
  pending: 0,
  accepted: 1,
  payment_pending: 1,
  payment_confirmed: 1,
  in_progress: 1,
  finished: 1,
  completed: 2,
  cancelled: 2,
  disputed: 2,
  dispute_in_review: 2,
  dispute_resolved_worker: 2,
  dispute_resolved_client: 2,
};

const SECTION_LABELS: Record<number, { title: string; subtitle: string; color: string }> = {
  0: { title: "Nuevas solicitudes", subtitle: "Acepta o rechaza cuanto antes", color: "text-amber-600 dark:text-amber-400" },
  1: { title: "En progreso", subtitle: "Servicios activos", color: "text-primary" },
  2: { title: "Historial", subtitle: "Completados y cancelados", color: "text-muted-foreground" },
};

function sortedByDate(arr: any[]) {
  return [...arr].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function groupBookings(bookings: any[]): Map<number, any[]> {
  const groups = new Map<number, any[]>([[0, []], [1, []], [2, []]]);
  for (const b of bookings) {
    const g = PRIORITY_ORDER[b.status] ?? 2;
    groups.get(g)!.push(b);
  }
  for (const [key, arr] of groups) groups.set(key, sortedByDate(arr));
  return groups;
}

function TimeAgo({ date }: { date: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })}
    </span>
  );
}

function BookingCard({
  b,
  loading,
  onAccept,
  onReject,
  onStart,
  onFinish,
  onRateClient,
  clientRated,
  onRefresh,
}: {
  b: any;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
  onStart: () => Promise<void>;
  onFinish: () => Promise<void>;
  onRateClient?: () => void;
  clientRated?: boolean;
  onRefresh?: () => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const [showCounterOffer, setShowCounterOffer] = useState(false);
  const [, navigate] = useLocation();
  const busy = loading || actionLoading;

  const isPending = b.status === "pending";
  const isUrgent = b.description?.startsWith("[URGENTE]");
  const desc = isUrgent ? b.description.replace("[URGENTE] ", "") : b.description;
  const isDisputed = ["disputed", "dispute_in_review"].includes(b.status);

  const doAsync = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try { await fn(); } finally { setActionLoading(false); }
  };

  let borderClass = "border-border";
  if (isPending && isUrgent) borderClass = "border-red-400 dark:border-red-600";
  else if (isPending) borderClass = "border-blue-400 dark:border-blue-600";
  else if (isDisputed) borderClass = "border-rose-300 dark:border-rose-700";
  else if (b.status === "finished") borderClass = "border-orange-300 dark:border-orange-700";
  else if (b.status === "payment_confirmed") borderClass = "border-teal-300 dark:border-teal-700";

  const amount = b.totalAmount ?? b.clientBudget;

  return (
    <div className={`bg-card border-2 rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${borderClass} ${isPending && isUrgent ? "shadow-red-900/20 shadow-md" : isPending ? "shadow-blue-900/20 shadow-md" : ""}`}>

      {/* Pending top highlight strip */}
      {isPending && (
        <div className={`px-4 py-2 flex items-center justify-between ${isUrgent ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-blue-500 to-blue-600"}`}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide">
              {isUrgent ? "⚡ SOLICITUD URGENTE" : "NUEVA SOLICITUD"}
            </span>
          </div>
          <TimeAgo date={b.createdAt} />
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-bold text-foreground text-base">{b.categoryName}</p>
              {!isPending && <StatusBadge status={b.status} />}
              {isUrgent && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-bold dark:bg-red-900/20 dark:text-red-400">
                  <Zap className="w-3 h-3" /> URGENTE
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Cliente: <span className="font-medium text-foreground">{b.clientName}</span>
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            {amount ? (
              <>
                <p className="text-xs text-muted-foreground">{b.clientBudget && !b.totalAmount ? "Oferta" : "Monto"}</p>
                <p className={`font-bold text-lg ${isPending && isUrgent ? "text-red-500 dark:text-red-400" : isPending ? "text-blue-500 dark:text-blue-400" : "text-foreground"}`}>
                  ${amount.toFixed(2)}
                </p>
              </>
            ) : null}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{desc}</p>

        {/* Address */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{b.address}</span>
        </div>

        {/* Client reputation — visible only for new requests */}
        {isPending && b.clientId && (
          <ClientReputationBadge clientId={b.clientId} />
        )}

        {/* Client identity verification badge — visible on pending requests */}
        {isPending && (
          b.clientIsVerified ? (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <BadgeCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-500">Cliente Verificado</p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400/80">Identidad confirmada por LinkServi</p>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-500">⚠ Identidad no verificada</p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400/80">
                  Este cliente aún no ha completado su verificación de identidad. Procede con cautela.
                </p>
              </div>
            </div>
          )
        )}

        {/* Status banners (non-pending) */}
        {b.status === "accepted" && (
          <div className="mb-3 p-3 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800">
            <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-400">⏳ Esperando pago del cliente</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-0.5">El cliente debe pagar antes de que inicies el trabajo.</p>
          </div>
        )}
        {b.status === "payment_pending" && (
          <div className="mb-3 space-y-2">
            <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/10 dark:border-cyan-800">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse flex-shrink-0" />
                <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-400">Verificando pago del cliente</p>
              </div>
              <p className="text-xs text-cyan-600 dark:text-cyan-500">El cliente subió su comprobante. LinkServi lo está revisando.</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 flex items-start gap-2">
              <span className="text-red-500 text-sm flex-shrink-0">⚠</span>
              <p className="text-xs font-bold text-red-700 dark:text-red-400">Nunca entregues el servicio sin confirmar el pago en la app</p>
            </div>
          </div>
        )}
        {b.status === "payment_confirmed" && (
          <div className="mb-3 p-3 rounded-xl bg-teal-50 border-2 border-teal-300 dark:bg-teal-900/10 dark:border-teal-700">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-teal-600 text-base">✅</span>
              <p className="text-xs font-bold text-teal-800 dark:text-teal-300">Pago verificado — ¡ya puedes iniciar!</p>
            </div>
            <p className="text-xs text-teal-600 dark:text-teal-500">El dinero está asegurado. Inicia el trabajo cuando estés en el lugar.</p>
          </div>
        )}
        {b.status === "finished" && (
          <div className="mb-3 p-3 rounded-xl bg-orange-50 border border-orange-200 dark:bg-orange-900/10 dark:border-orange-800">
            <p className="text-xs font-semibold text-orange-800 dark:text-orange-400">⏳ Esperando confirmación del cliente</p>
            <p className="text-xs text-orange-700 dark:text-orange-500 mt-0.5">El cliente debe confirmar que el trabajo fue realizado correctamente.</p>
          </div>
        )}
        {b.status === "completed" && b.totalAmount != null && (
          <div className="mb-3 p-3 rounded-xl bg-muted/40 border border-border">
            <p className="text-xs font-semibold text-foreground mb-2">Desglose de pago</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total del servicio</span>
                <span className="font-medium text-foreground">${b.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Comisión LinkServi (10%)</span>
                <span className="text-red-500">-${(b.commission ?? b.totalAmount * 0.1).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-border pt-1 mt-1">
                <span className="font-semibold text-foreground">Tu ganancia neta</span>
                <span className="font-bold text-emerald-600">${(b.workerEarnings ?? b.totalAmount * 0.9).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
        {b.status === "disputed" && (
          <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-800 space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">El cliente abrió una disputa</p>
            </div>
            {b.disputeReason && <p className="text-xs text-rose-600 dark:text-rose-500">Motivo: {b.disputeReason}</p>}
            <p className="text-xs text-rose-600 dark:text-rose-500">Los fondos están retenidos hasta que LinkServi resuelva el caso.</p>
          </div>
        )}
        {b.status === "dispute_in_review" && (
          <div className="mb-3 p-3 rounded-xl bg-orange-50 border border-orange-200 dark:bg-orange-900/10 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Disputa en revisión por LinkServi</p>
            </div>
            {b.disputeReason && <p className="text-xs text-orange-600 dark:text-orange-500">Motivo: {b.disputeReason}</p>}
          </div>
        )}
        {b.status === "dispute_resolved_worker" && (
          <div className="mb-3 p-3 rounded-xl bg-teal-50 border border-teal-200 dark:bg-teal-900/10 dark:border-teal-800">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">Disputa resuelta a tu favor</p>
            </div>
            {b.workerEarnings != null && (
              <p className="text-sm font-bold text-teal-700 dark:text-teal-300">${b.workerEarnings.toFixed(2)} añadidos a tu saldo</p>
            )}
          </div>
        )}
        {b.status === "dispute_resolved_client" && (
          <div className="mb-3 p-3 rounded-xl bg-muted/40 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs font-semibold text-muted-foreground">Disputa resuelta a favor del cliente</p>
            </div>
            <p className="text-xs text-muted-foreground">El servicio no fue realizado correctamente según el equipo LinkServi.</p>
          </div>
        )}

        {/* Counter-offer sent banner */}
        {b.counterOfferStatus === "pending" && (
          <div className="mb-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">Propuesta enviada al cliente</p>
                <p className="text-xs text-muted-foreground">Tu precio: <span className="font-bold text-primary">${b.workerCounterOffer?.toFixed(2)}</span> · Esperando respuesta</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer: date + actions */}
        <div className={`flex items-center justify-between mt-3 pt-3 border-t border-border gap-2`}>
          <TimeAgo date={b.createdAt} />
          <div className="flex items-center gap-2 ml-auto">
            {/* Rate client — completed only */}
            {b.status === "completed" && onRateClient && !clientRated && (
              <button
                onClick={onRateClient}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 font-medium transition-all"
              >
                <Award className="w-3.5 h-3.5" /> Calificar
              </button>
            )}
            {b.status === "completed" && clientRated && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-emerald-500" /> Calificado
              </span>
            )}
            {/* Chat — active non-terminal bookings */}
            {!["cancelled", "dispute_resolved_client", "dispute_resolved_worker", "completed"].includes(b.status) && (
              <button
                onClick={() => navigate(`/professional/chat/${b.id}`)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat
              </button>
            )}
            {/* Ver trabajo — main CTA always present */}
            <button
              onClick={() => navigate(`/professional/booking/${b.id}`)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-sm"
            >
              Ver trabajo →
            </button>
          </div>
        </div>
      </div>

      {showCounterOffer && (
        <CounterOfferModal
          bookingId={b.id}
          clientBudget={b.clientBudget}
          categoryName={b.categoryName}
          onClose={() => setShowCounterOffer(false)}
          onSuccess={() => { onRefresh?.(); }}
        />
      )}
    </div>
  );
}

const FILTER_TABS = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Nuevas" },
  { key: "active", label: "En progreso" },
  { key: "history", label: "Historial" },
] as const;

type FilterKey = "all" | "pending" | "active" | "history";

const ACTIVE_STATUSES = ["accepted", "payment_pending", "payment_confirmed", "in_progress", "finished"];
const HISTORY_STATUSES = ["completed", "cancelled", "disputed", "dispute_in_review", "dispute_resolved_worker", "dispute_resolved_client"];

export function WorkerBookingsPage() {
  const opts = getRequestOptions();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [acceptLoading, setAcceptLoading] = useState<Record<number, boolean>>({});
  const [acceptError, setAcceptError] = useState<string>("");
  const [rateModal, setRateModal] = useState<{ bookingId: number; clientName: string } | null>(null);
  const [ratedBookings, setRatedBookings] = useState<Set<number>>(new Set());
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const kyc = useWorkerVerification();

  const { data: rawBookings = [], refetch } = useListBookings({ role: "worker" }, opts as any);
  const bookings = rawBookings as any[];

  const { mutate: accept } = useAcceptBooking({
    ...opts,
    mutation: {
      onSuccess: () => { setAcceptError(""); refetch(); },
      onError: (err: any) => {
        const errData = err?.response?.data;
        if (errData?.code === "NO_AVATAR") {
          navigate("/profile/setup");
        } else {
          setAcceptError(errData?.error ?? "Error al aceptar el trabajo");
        }
      },
    },
  } as any);
  const { mutate: reject } = useRejectBooking({ ...opts, mutation: { onSuccess: () => refetch() } } as any);

  const handleAccept = (bookingId: number) => {
    if (!kyc.isVerified) { setKycModalOpen(true); return; }
    setAcceptLoading(l => ({ ...l, [bookingId]: true }));
    accept({ bookingId }, { onSettled: () => setAcceptLoading(l => ({ ...l, [bookingId]: false })) });
  };

  const filteredBookings = (() => {
    if (filter === "pending") return sortedByDate(bookings.filter(b => b.status === "pending"));
    if (filter === "active") return sortedByDate(bookings.filter(b => ACTIVE_STATUSES.includes(b.status)));
    if (filter === "history") return sortedByDate(bookings.filter(b => HISTORY_STATUSES.includes(b.status)));
    return bookings;
  })();

  const grouped = groupBookings(filteredBookings);
  const pendingCount = bookings.filter(b => b.status === "pending").length;

  const isEmpty = filteredBookings.length === 0;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="animate-fade-in-up">
          {pendingCount > 0 ? (
            <div className="rounded-2xl px-5 py-4"
              style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                <h1 className="text-xl font-bold" style={{ color: "rgba(255,255,255,0.92)" }}>
                  Tienes oportunidades esperando por ti
                </h1>
              </div>
              <p className="text-sm pl-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                Responde rápido para asegurar el trabajo
              </p>
              <p className="text-xs pl-4 mt-1" style={{ color: "rgba(251,191,36,0.55)" }}>
                Los primeros en responder tienen más posibilidades
              </p>
            </div>
          ) : (
            <div className="rounded-2xl px-5 py-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <h1 className="text-xl font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
                Aún no tienes solicitudes
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                Mantén tu perfil activo para recibir trabajos
              </p>
              <a href="/professional/profile"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: "rgba(99,102,241,0.12)", color: "rgba(165,180,252,0.9)", border: "1px solid rgba(99,102,241,0.2)" }}>
                Mejorar mi perfil →
              </a>
            </div>
          )}
        </div>

        {/* Flow guide */}
        <div className="p-3.5 rounded-xl bg-card border border-border">
          <p className="text-xs font-semibold text-foreground mb-1.5">Flujo del servicio</p>
          <div className="flex items-center gap-1 flex-wrap text-xs text-muted-foreground">
            {["Pendiente", "Aceptado", "Pago", "En Progreso", "Finalizado", "Completado"].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-1">
                <span className="text-foreground font-medium">{s}</span>
                {i < arr.length - 1 && <ChevronRight className="w-3 h-3" />}
              </span>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {FILTER_TABS.map((t) => {
            const isActive = filter === t.key;
            const hasBadge = t.key === "pending" && pendingCount > 0;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${isActive ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}
              >
                {t.label}
                {hasBadge && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold ${isActive ? "bg-white text-primary" : "bg-amber-500 text-white"}`}>
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Accept error */}
        {acceptError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            ⚠ {acceptError}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="py-20 text-center bg-card border border-border rounded-2xl">
            <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground">No hay trabajos aquí</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "pending" ? "No tienes solicitudes pendientes." : filter === "active" ? "No tienes servicios activos ahora mismo." : filter === "history" ? "Aún no has completado ningún servicio." : "Aún no tienes solicitudes de servicio."}
            </p>
          </div>
        )}

        {/* Sectioned view — only on "all" filter */}
        {!isEmpty && filter === "all" && (
          <div className="space-y-8">
            {[0, 1, 2].map((groupKey) => {
              const group = grouped.get(groupKey) ?? [];
              if (group.length === 0) return null;
              const meta = SECTION_LABELS[groupKey];
              return (
                <div key={groupKey}>
                  {/* Section header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div>
                      <h2 className={`text-sm font-bold ${meta.color}`}>{meta.title}</h2>
                      <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
                    </div>
                    <span className={`ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${groupKey === 0 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : groupKey === 1 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {group.length}
                    </span>
                    <div className={`h-px flex-1 ${groupKey === 0 ? "bg-amber-200 dark:bg-amber-800" : "bg-border"}`} />
                  </div>
                  <div className="space-y-3">
                    {group.map((b) => (
                      <BookingCard
                        key={b.id}
                        b={b}
                        loading={!!acceptLoading[b.id]}
                        onAccept={() => handleAccept(b.id)}
                        onReject={() => reject({ bookingId: b.id })}
                        onStart={() => startBooking(b.id).then(() => refetch())}
                        onFinish={() => finishBooking(b.id).then(() => refetch())}
                        onRateClient={() => setRateModal({ bookingId: b.id, clientName: b.clientName ?? "Cliente" })}
                        clientRated={ratedBookings.has(b.id)}
                        onRefresh={() => refetch()}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Flat list — for filtered views */}
        {!isEmpty && filter !== "all" && (
          <div className="space-y-3">
            {filteredBookings.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                loading={!!acceptLoading[b.id]}
                onAccept={() => handleAccept(b.id)}
                onReject={() => reject({ bookingId: b.id })}
                onStart={() => startBooking(b.id).then(() => refetch())}
                onFinish={() => finishBooking(b.id).then(() => refetch())}
                onRateClient={() => setRateModal({ bookingId: b.id, clientName: b.clientName ?? "Cliente" })}
                clientRated={ratedBookings.has(b.id)}
                onRefresh={() => refetch()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rate client modal */}
      {rateModal && (
        <RateClientModal
          bookingId={rateModal.bookingId}
          clientName={rateModal.clientName}
          onClose={() => setRateModal(null)}
          onSuccess={() => {
            setRatedBookings((prev) => new Set(prev).add(rateModal.bookingId));
            setRateModal(null);
          }}
        />
      )}

      <WorkerKYCModal
        open={kycModalOpen}
        onClose={() => setKycModalOpen(false)}
        status={kyc.status}
        notes={kyc.notes}
        reason="Para aceptar solicitudes de trabajo debes verificar tu identidad primero."
      />
    </AppLayout>
  );
}
