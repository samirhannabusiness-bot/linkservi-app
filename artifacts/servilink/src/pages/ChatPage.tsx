import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useGetChatMessages, useSendChatMessage } from "@workspace/api-client-react";
import { getSocket, joinRoom, leaveRoom } from "@/lib/socket";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader, getRequestOptions, completeBookingWithPayment, disputeBooking } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Send, DollarSign, Loader2, CheckCircle2, XCircle, ChevronLeft,
  X, ChevronDown, ChevronUp, MapPin, Tag, Clock, BadgeCheck,
  MessageSquare, Zap, CreditCard,
} from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { StatusBadge } from "@/components/ui/StatusBadge";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name?: string) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function dayLabel(date: Date) {
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  return format(date, "d 'de' MMMM", { locale: es });
}

// ─── Quick replies ─────────────────────────────────────────────────────────────
const WORKER_QUICK = [
  "Estoy en camino 🚗",
  "Ya llegué 📍",
  "Trabajo terminado ✅",
  "¿Cuál es la dirección exacta?",
  "Dame unos minutos, enseguida llego.",
  "¿Tienes foto de lo que necesitas reparar?",
];
const CLIENT_QUICK = [
  "Perfecto, te espero.",
  "¿A qué hora puedes venir?",
  "¿Cuánto cobras por el trabajo?",
  "Tengo urgencia, ¿puedes hoy?",
  "Gracias, ya lo revisé.",
  "¿Traes los materiales o los consigo yo?",
];

// ─── Booking context card ──────────────────────────────────────────────────────
function BookingContextCard({ booking, isWorkerRole }: { booking: any; isWorkerRole: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!booking) return null;

  const price = booking.agreedPrice ?? booking.totalAmount ?? 0;
  const otherName = isWorkerRole ? booking.clientName : booking.workerName;
  const isInquiry = booking.bookingType === "inquiry";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-3">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {isInquiry ? "Cotización con " : "Trabajo con "}{otherName}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={booking.status} />
              {!isInquiry && price > 0 && (
                <span className="text-xs text-emerald-500 font-semibold">${price.toFixed(2)}</span>
              )}
              {isInquiry && price === 0 && (
                <span className="text-xs text-amber-500 font-medium">precio por acordar</span>
              )}
              {isInquiry && price > 0 && (
                <span className="text-xs text-emerald-500 font-semibold">${price.toFixed(2)} acordado</span>
              )}
            </div>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-2.5">
          {booking.categoryName && (
            <div className="flex items-start gap-2 text-sm">
              <Tag className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-foreground">{booking.categoryName}</span>
            </div>
          )}
          {booking.description && (
            <div className="flex items-start gap-2 text-sm">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{booking.description}</span>
            </div>
          )}
          {booking.address && !booking.address.startsWith("Por definir") && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{booking.address}</span>
            </div>
          )}
          {booking.scheduledAt && (
            <div className="flex items-start gap-2 text-sm">
              <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-muted-foreground">
                {format(new Date(booking.scheduledAt), "d/MM/yyyy 'a las' HH:mm", { locale: es })}
              </span>
            </div>
          )}
          {booking.agreedPrice && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">${booking.agreedPrice.toFixed(2)} acordado</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inquiry banner ────────────────────────────────────────────────────────────
// ─── Finished action banner (client confirms or disputes from chat) ───────────
function FinishedActionBanner({ bookingId, onDone }: { bookingId: number; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState("");

  const doConfirm = async () => {
    setLoading(true);
    try {
      await completeBookingWithPayment(bookingId, "paid_to_platform");
      toast({ title: "✅ Servicio confirmado", description: "El pago será liberado al profesional." });
      onDone();
    } catch (e: any) {
      toast({ title: e.message ?? "Error al confirmar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const doDispute = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await disputeBooking(bookingId, reason);
      toast({ title: "⚠ Disputa abierta", description: "El equipo de LinkServi revisará el caso en menos de 24h." });
      onDone();
    } catch (e: any) {
      toast({ title: e.message ?? "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (showDispute) {
    return (
      <div className="mb-3 p-3 rounded-xl border border-red-300 dark:border-red-800" style={{ background: "rgba(239,68,68,0.08)" }}>
        <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-2">Abrir disputa</p>
        <p className="text-xs text-red-600 dark:text-red-400 mb-2">El equipo LinkServi revisará el caso en menos de 24h.</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Describe el problema: el trabajo no fue completado, hay daños, etc."
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-2"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { setShowDispute(false); setReason(""); }}
            className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={doDispute}
            disabled={!reason.trim() || loading}
            className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40"
          >
            {loading ? "Enviando..." : "Abrir disputa"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 p-3 rounded-xl border border-orange-300 dark:border-orange-800" style={{ background: "rgba(251,146,60,0.10)" }}>
      <p className="text-sm font-bold text-orange-800 dark:text-orange-400 mb-1">🏁 El profesional terminó el trabajo</p>
      <p className="text-xs text-orange-700 dark:text-orange-500 mb-3">Si todo está correcto, confirma para liberar el pago al profesional. Tienes 15 días de garantía LinkServi.</p>
      <div className="flex flex-col gap-2">
        <button
          onClick={doConfirm}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 transition-colors"
        >
          {loading ? "Procesando..." : "✓ Confirmar — el trabajo quedó correcto"}
        </button>
        <button
          onClick={() => setShowDispute(true)}
          disabled={loading}
          className="w-full py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-40 transition-colors"
        >
          Abrir disputa
        </button>
      </div>
    </div>
  );
}

function InquiryBanner({ isWorkerRole, agreedPrice }: { isWorkerRole: boolean; agreedPrice: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || agreedPrice > 0) return null;
  return (
    <div className="relative flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 mb-3 text-xs">
      <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="text-amber-800 dark:text-amber-300">
        {isWorkerRole
          ? "Este chat es para acordar el precio con el cliente. Usa el botón \"Enviar oferta\" cuando estés listo."
          : "Negocia el precio aquí antes de confirmar el trabajo. El profesional te enviará una propuesta."
        }
      </div>
      <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 text-amber-500 hover:text-amber-700">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Offer Create Modal ────────────────────────────────────────────────────────
function CreateOfferModal({
  bookingId, onClose, onCreated,
}: { bookingId: number; onClose: () => void; onCreated: () => void }) {
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) { toast({ title: "Ingresa un precio válido mayor a 0", variant: "destructive" }); return; }
    if (!description.trim()) { toast({ title: "La descripción es requerida", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/chat/${bookingId}/offers`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ price: p, description: description.trim() }),
      });
      toast({ title: "✅ Oferta enviada al cliente" });
      onCreated();
      onClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al enviar oferta", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground">Enviar propuesta de precio</h2>
            <p className="text-xs text-muted-foreground mt-0.5">El cliente recibirá una tarjeta para aceptar o rechazar.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Precio (USD) *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">¿Qué incluye? *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Instalación de toma corriente doble, mano de obra incluida, sin materiales..."
              rows={3}
              maxLength={300}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              Enviar propuesta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Offer Card ────────────────────────────────────────────────────────────────
function OfferCard({
  offer, bookingId, isWorkerRole, onAccepted, onRejected,
}: { offer: any; bookingId: number; isWorkerRole: boolean; onAccepted: () => void; onRejected: () => void }) {
  const [acting, setActing] = useState(false);
  const [, navigate] = useLocation();

  async function accept() {
    setActing(true);
    try {
      await apiFetch(`/api/chat/${bookingId}/offers/${offer.id}/accept`, {
        method: "PUT",
        headers: getAuthHeader(),
      });
      toast({ title: "✅ Oferta aceptada — el precio fue actualizado." });
      onAccepted();
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al aceptar", variant: "destructive" });
    } finally { setActing(false); }
  }

  async function reject() {
    setActing(true);
    try {
      await apiFetch(`/api/chat/${bookingId}/offers/${offer.id}/reject`, {
        method: "PUT",
        headers: getAuthHeader(),
      });
      toast({ title: "Oferta rechazada." });
      onRejected();
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al rechazar", variant: "destructive" });
    } finally { setActing(false); }
  }

  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";

  return (
    <div className={`my-2 mx-auto w-full max-w-xs rounded-2xl border shadow-sm overflow-hidden
      ${isAccepted ? "border-emerald-400/50 dark:border-emerald-600/50" : isPending ? "border-primary/30" : "border-border opacity-60"}`}>
      {/* Header */}
      <div className={`px-4 py-2.5 flex items-center gap-2
        ${isAccepted ? "bg-emerald-500/10" : isPending ? "bg-primary/5" : "bg-muted/40"}`}>
        <DollarSign className={`w-4 h-4 ${isAccepted ? "text-emerald-500" : isPending ? "text-primary" : "text-muted-foreground"}`} />
        <span className={`text-xs font-bold uppercase tracking-wide
          ${isAccepted ? "text-emerald-600 dark:text-emerald-400" : isPending ? "text-primary" : "text-muted-foreground"}`}>
          {isWorkerRole
            ? (isAccepted ? "Propuesta aceptada ✅" : isPending ? "Propuesta enviada" : "Propuesta rechazada")
            : (isAccepted ? "Oferta aceptada ✅" : isPending ? "Nueva propuesta de precio" : "Oferta rechazada")
          }
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 bg-card">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-foreground flex-1">{offer.description}</p>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">${offer.price.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">USD</p>
          </div>
        </div>

        {/* Client action buttons */}
        {!isWorkerRole && isPending && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={reject}
              disabled={acting}
              className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" /> Rechazar
            </button>
            <button
              onClick={accept}
              disabled={acting}
              className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Aceptar
            </button>
          </div>
        )}

        {isAccepted && (
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="w-3.5 h-3.5" /> Precio acordado — el trabajo puede comenzar.
            </div>
            {!isWorkerRole && (
              <button
                onClick={() => navigate(`/client/booking/${bookingId}`)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                Ir a pagar →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Date separator ────────────────────────────────────────────────────────────
function DateSeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground font-medium px-2">{dayLabel(date)}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({
  message, isMe, showAvatar, avatarName,
}: { message: any; isMe: boolean; showAvatar: boolean; avatarName: string }) {
  const isSystem = message.content.startsWith("✅") || message.content.startsWith("❌") || message.content.startsWith("💼");
  // Offer-related system messages are redundant — the OfferCard in the timeline already shows this info
  const isOfferSystem = isSystem && (
    message.content.startsWith("💼 Oferta") ||
    message.content.startsWith("✅ Oferta aceptada") ||
    message.content.startsWith("❌ Oferta rechazada")
  );
  if (isOfferSystem) return null;

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <p className="text-[11px] text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full max-w-xs text-center">{message.content}</p>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar (other person only) */}
      {!isMe && (
        <div className={`w-7 h-7 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mb-1 ${showAvatar ? "opacity-100" : "opacity-0"}`}>
          {initials(avatarName)}
        </div>
      )}
      <div className={`max-w-[72%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && showAvatar && (
          <p className="text-[10px] text-muted-foreground mb-1 px-1">{avatarName}</p>
        )}
        <div className={`rounded-2xl px-3.5 py-2.5 shadow-sm
          ${isMe
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
          }`}>
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          {message.createdAt ? format(new Date(message.createdAt), "HH:mm") : ""}
        </p>
      </div>
      {/* Spacer for my messages so they align with avatar space */}
      {isMe && <div className="w-7 flex-shrink-0" />}
    </div>
  );
}

// ─── Quick reply chips ─────────────────────────────────────────────────────────
function QuickReplies({
  isWorkerRole, onSelect,
}: { isWorkerRole: boolean; onSelect: (msg: string) => void }) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;

  const options = isWorkerRole ? WORKER_QUICK : CLIENT_QUICK;
  return (
    <div className="relative mb-2">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {options.map(msg => (
          <button
            key={msg}
            onClick={() => { onSelect(msg); setShown(false); }}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors whitespace-nowrap"
          >
            {msg}
          </button>
        ))}
      </div>
      <button
        onClick={() => setShown(false)}
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function ChatPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [, navigate] = useLocation();
  const bId = Number(bookingId);
  const { user } = useAuth();
  const opts = getRequestOptions();

  const [message, setMessage] = useState("");
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offers, setOffers] = useState<any[]>([]);
  const [booking, setBooking] = useState<any>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: messages = [], refetch } = useGetChatMessages(bId, {
    ...opts,
    query: { refetchInterval: false },
  } as any);

  const { mutate: sendMessage, isPending } = useSendChatMessage({
    ...opts,
    mutation: {
      onSuccess: (data: any) => {
        setMessage(""); refetch(); setShowQuickReplies(false);
        if (data?.wasFiltered) {
          toast({
            title: "Recordatorio de seguridad",
            description: "Por tu protección, no se permiten números de teléfono ni datos de contacto en el chat. Tu garantía LinkServi solo aplica si te comunicas dentro de la app.",
            variant: "destructive",
          });
        }
      },
      onError: (err: any) => {
        const msg = err?.message ?? err?.error ?? "No se pudo enviar el mensaje";
        toast({ title: msg, variant: "destructive" });
      },
    },
  } as any);

  useEffect(() => {
    apiFetch(`/api/bookings/${bId}`, { headers: getAuthHeader() })
      .then(setBooking)
      .catch(() => {});
  }, [bId]);

  // Determine view from URL first (so users with both roles see the right view).
  // Fall back to booking ownership check if URL doesn't disambiguate.
  const _path = window.location.pathname;
  const isWorkerRole = _path.startsWith("/professional/")
    ? true
    : _path.startsWith("/client/")
      ? false
      : !!(booking && user && booking.workerUserId === user.id);

  async function loadOffers() {
    try {
      const data = await apiFetch(`/api/chat/${bId}/offers`, { headers: getAuthHeader() });
      setOffers(data ?? []);
    } catch {}
  }

  useEffect(() => {
    loadOffers();
  }, [bId]);

  useEffect(() => {
    if (!bId) return;
    const room = `booking:${bId}`;
    const socket = getSocket();
    joinRoom(room);
    const handler = () => { refetch(); loadOffers(); };
    socket.on("new_message", handler);
    return () => { socket.off("new_message", handler); leaveRoom(room); };
  }, [bId, refetch]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, offers]);

  // Combined and sorted timeline
  type TimelineItem =
    | { kind: "message"; id: number; senderId: number; senderName: string; content: string; createdAt: string }
    | { kind: "offer"; id: number; data: any; createdAt: string };

  const timeline: TimelineItem[] = useMemo(() => [
    ...(messages as any[]).map((m: any) => ({ kind: "message" as const, id: m.id, senderId: m.senderId, senderName: m.senderName, content: m.content, createdAt: m.createdAt })),
    ...offers.map((o: any) => ({ kind: "offer" as const, id: o.id, data: o, createdAt: o.createdAt })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [messages, offers]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessage({ bookingId: bId, data: { content: message.trim() } });
  };

  function handleQuickReply(msg: string) {
    setMessage(msg);
    inputRef.current?.focus();
  }

  const isInquiry = booking?.bookingType === "inquiry";
  const agreedPrice: number = booking?.agreedPrice ?? booking?.totalAmount ?? 0;
  const backPath = "/mensajes";
  const detailPath = isWorkerRole ? `/professional/booking/${bId}` : `/client/booking/${bId}`;
  const otherName = isWorkerRole ? booking?.clientName : booking?.workerName;
  const hasAcceptedOffer = offers.some((o: any) => o.status === "accepted");

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto flex flex-col h-[calc(100dvh-14rem)] md:h-[calc(100dvh-8rem)]">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => navigate(backPath)}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* Avatar of the other person */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/70 to-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initials(otherName)}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm leading-tight">{otherName ?? "Chat"}</p>
                <p className="text-xs text-muted-foreground">
                  Solicitud #{bId}
                  {isInquiry && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium text-[10px]">
                      Cotización
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          {/* Ver servicio button */}
          {booking && (
            <button
              onClick={() => navigate(detailPath)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors flex-shrink-0 whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5" />
              Ver servicio
            </button>
          )}
        </div>

        {/* ── Booking context card ────────────────────────────────────── */}
        <BookingContextCard booking={booking} isWorkerRole={isWorkerRole} />

        {/* ── Inquiry banner ──────────────────────────────────────────── */}
        {isInquiry && <InquiryBanner isWorkerRole={isWorkerRole} agreedPrice={agreedPrice} />}

        {/* ── Finished action banner (client side) ────────────────────── */}
        {booking && booking.status === "finished" && !isWorkerRole && (
          <FinishedActionBanner bookingId={booking.id} onDone={() => window.location.reload()} />
        )}

        {/* ── Messages ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto space-y-1 bg-card border border-border rounded-xl p-4 mb-3">
          {timeline.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <MessageSquare className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                {isInquiry
                  ? (isWorkerRole ? "Envía tu propuesta de precio al cliente." : "Cuéntale al profesional qué necesitas.")
                  : "No hay mensajes aún. Envía el primero."
                }
              </p>
            </div>
          )}

          {(() => {
            let prevDate: Date | null = null;
            let prevSender: number | null = null;
            return timeline.map(item => {
              const itemDate = new Date(item.createdAt);
              const showSep = !prevDate || !isSameDay(prevDate, itemDate);
              prevDate = itemDate;

              if (item.kind === "offer") {
                prevSender = null;
                return (
                  <div key={`offer-${item.id}`}>
                    {showSep && <DateSeparator date={itemDate} />}
                    <div className="flex justify-center">
                      <OfferCard
                        offer={item.data}
                        bookingId={bId}
                        isWorkerRole={isWorkerRole}
                        onAccepted={() => { loadOffers(); refetch(); }}
                        onRejected={() => { loadOffers(); refetch(); }}
                      />
                    </div>
                  </div>
                );
              }

              const isMe = item.senderId === user?.id;
              const sameAsPrev = prevSender === item.senderId;
              prevSender = item.senderId;

              return (
                <div key={`msg-${item.id}`}>
                  {showSep && <DateSeparator date={itemDate} />}
                  <MessageBubble
                    message={item}
                    isMe={isMe}
                    showAvatar={!sameAsPrev || showSep}
                    avatarName={item.senderName}
                  />
                </div>
              );
            });
          })()}
          <div ref={bottomRef} />
        </div>

        {/* ── Input area ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          {/* Quick replies (show once at start) */}
          {showQuickReplies && timeline.length === 0 && (
            <QuickReplies isWorkerRole={isWorkerRole} onSelect={handleQuickReply} />
          )}

          {/* Worker offer button — only when no accepted offer yet */}
          {isWorkerRole && isInquiry && !hasAcceptedOffer && (
            <button
              onClick={() => setShowOfferModal(true)}
              className="w-full py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              Enviar propuesta de precio
            </button>
          )}

          {/* Message input */}
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onFocus={() => setShowQuickReplies(true)}
              placeholder="Escribe un mensaje..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={isPending || !message.trim()}
              className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Quick reply chips (when has messages) */}
          {showQuickReplies && timeline.length > 0 && (
            <QuickReplies isWorkerRole={isWorkerRole} onSelect={handleQuickReply} />
          )}
        </div>
      </div>

      {showOfferModal && (
        <CreateOfferModal
          bookingId={bId}
          onClose={() => setShowOfferModal(false)}
          onCreated={() => { loadOffers(); refetch(); }}
        />
      )}
    </AppLayout>
  );
}
