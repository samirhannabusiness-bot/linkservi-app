import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ReviewModal } from "@/components/ui/ReviewModal";
import { ServicePhotoUpload } from "@/components/ui/ServicePhotoUpload";
import { CounterOfferModal } from "@/components/ui/CounterOfferModal";
import { toast } from "@/hooks/use-toast";
import { useBcvRate } from "@/hooks/useBcvRate";
import { compressImageBlob } from "@/lib/imageUtils";
import {
  getAuthHeader, startBooking, finishBooking,
  completeBookingWithPayment, disputeBooking, submitPaymentProof,
  apiFetch,
} from "@/lib/api";
import {
  ChevronLeft, MessageSquare, CheckCircle2, XCircle, Play,
  CheckSquare, DollarSign, Shield, AlertTriangle, Clock,
  CreditCard, BadgeCheck, Copy, Check, TrendingUp,
  Upload, Eye, MapPin, Tag, Timer, RotateCcw, X,
  Award, ChevronRight, Info, Zap,
} from "lucide-react";
import { C2PModal } from "@/components/payments/C2PModal";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─────────────────────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────────────────────
const TIMELINE_STEPS = [
  {
    key: "created",
    label: "Solicitud enviada",
    activeFor: ["pending", "accepted", "payment_pending", "payment_confirmed", "in_progress", "finished", "completed"],
  },
  {
    key: "accepted",
    label: "Aceptado por el profesional",
    activeFor: ["accepted", "payment_pending", "payment_confirmed", "in_progress", "finished", "completed"],
  },
  {
    key: "paid",
    label: "Pago confirmado",
    activeFor: ["payment_confirmed", "in_progress", "finished", "completed"],
    pendingFor: ["accepted", "payment_pending"],
  },
  {
    key: "working",
    label: "Trabajo en progreso",
    activeFor: ["in_progress", "finished", "completed"],
    pendingFor: ["payment_confirmed"],
  },
  {
    key: "done",
    label: "Completado",
    activeFor: ["completed"],
    pendingFor: ["finished"],
  },
];

type StepState = "done" | "current" | "upcoming";

function getStepState(stepKey: string, status: string): StepState {
  const step = TIMELINE_STEPS.find(s => s.key === stepKey);
  if (!step) return "upcoming";
  if (step.activeFor.includes(status)) return "done";
  if (step.pendingFor?.includes(status)) return "current";
  return "upcoming";
}

// Compact horizontal step bar — fintech style (4 main milestones)
const STEP_BAR = [
  { key: "request",  label: "Solicitud",  activeFor: ["pending", "accepted", "payment_pending", "payment_confirmed", "in_progress", "finished", "completed"] },
  { key: "accepted", label: "Aceptado",   activeFor: ["accepted", "payment_pending", "payment_confirmed", "in_progress", "finished", "completed"] },
  { key: "paid",     label: "Pago",       activeFor: ["payment_confirmed", "in_progress", "finished", "completed"], pendingFor: ["accepted", "payment_pending"] },
  { key: "done",     label: "Confirmado", activeFor: ["completed"], pendingFor: ["in_progress", "finished"] },
];

function getBarState(stepKey: string, status: string): StepState {
  const step = STEP_BAR.find(s => s.key === stepKey);
  if (!step) return "upcoming";
  if (step.activeFor.includes(status)) return "done";
  if (step.pendingFor?.includes(status)) return "current";
  return "upcoming";
}

function BookingTimeline({ status }: { status: string }) {
  const isTerminal = ["cancelled", "disputed", "dispute_in_review", "dispute_resolved_client", "dispute_resolved_worker"].includes(status);

  if (isTerminal) {
    const isDispute = status.startsWith("dispute") || status === "disputed";
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl"
        style={{ background: isDispute ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.03)", border: `1.5px solid ${isDispute ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.08)"}` }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: isDispute ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)" }}>
          {isDispute ? <AlertTriangle className="w-5 h-5 text-rose-400" /> : <XCircle className="w-5 h-5 text-white/40" />}
        </div>
        <div>
          <p className={`text-sm font-bold ${isDispute ? "text-rose-400" : "text-white/50"}`}>
            {status === "cancelled" ? "Servicio cancelado" :
             status === "disputed" ? "Disputa abierta — en revisión" :
             status === "dispute_in_review" ? "Disputa en revisión activa" :
             status === "dispute_resolved_client" ? "Disputa resuelta a tu favor" :
             "Disputa resuelta a favor del profesional"}
          </p>
          <p className="text-xs text-white/35 mt-0.5">
            {status === "dispute_resolved_client" ? "LinkServi procesará el reembolso." :
             status === "dispute_resolved_worker" ? "El equipo confirmó que el servicio fue realizado correctamente." :
             status === "cancelled" ? "Esta solicitud fue cancelada." :
             "El equipo de LinkServi está revisando el caso."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-start">
        {STEP_BAR.map((step, idx) => {
          const state = getBarState(step.key, status);
          const isLast = idx === STEP_BAR.length - 1;
          const dotStyle =
            state === "done" ? {
              background: "linear-gradient(135deg, #10b981, #059669)",
              borderColor: "#10b981",
              boxShadow: "0 0 14px rgba(16,185,129,0.55)",
            } : state === "current" ? {
              background: "rgba(56,189,248,0.16)",
              borderColor: "#38bdf8",
              boxShadow: "0 0 16px rgba(56,189,248,0.65), inset 0 0 6px rgba(56,189,248,0.4)",
            } : {
              background: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.15)",
            };

          return (
            <div key={step.key} className="flex items-start flex-1 min-w-0">
              {/* Dot + label column */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[60px]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all"
                  style={dotStyle}>
                  {state === "done" ? (
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  ) : state === "current" ? (
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-white/25" />
                  )}
                </div>
                <span className={`text-[10px] font-bold tracking-wide whitespace-nowrap ${
                  state === "done" ? "text-emerald-400" :
                  state === "current" ? "text-cyan-400" :
                  "text-white/30"
                }`}>{step.label}</span>
              </div>
              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 h-0.5 rounded-full mt-3 mx-0.5"
                  style={{
                    background: state === "done"
                      ? "linear-gradient(to right, #10b981, rgba(16,185,129,0.3))"
                      : "rgba(255,255,255,0.08)",
                    boxShadow: state === "done" ? "0 0 8px rgba(16,185,129,0.4)" : "none",
                  }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Hero — estado actual prominente en la cima
// ─────────────────────────────────────────────────────────────────────────────
interface HeroCfg {
  icon: React.ElementType;
  clientTitle: string; clientDesc: string;
  workerTitle: string; workerDesc: string;
  color: string; bg: string; border: string;
  pulse?: boolean;
}

const STATUS_HERO: Record<string, HeroCfg> = {
  pending: {
    icon: Clock,
    clientTitle: "Solicitud enviada — aguardando respuesta",
    clientDesc: "El profesional recibirá tu solicitud y te contestará en breve.",
    workerTitle: "Tienes una nueva solicitud de trabajo",
    workerDesc: "El cliente está esperando. Acepta o negocia cuanto antes.",
    color: "#60a5fa", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", pulse: true,
  },
  accepted: {
    icon: CreditCard,
    clientTitle: "Todo listo — solo falta el pago",
    clientDesc: "El profesional aceptó tu solicitud. Tienes 30 minutos para pagar y reservar tu lugar.",
    workerTitle: "Ya aceptaste — el cliente está realizando el pago",
    workerDesc: "Cuando el pago sea confirmado, recibirás una notificación para iniciar.",
    color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.25)",
  },
  payment_pending: {
    icon: Shield,
    clientTitle: "Pago recibido — lo estamos verificando",
    clientDesc: "En máximo 30 minutos tendrás confirmación. Ya casi está todo listo.",
    workerTitle: "El cliente pagó — verificando comprobante",
    workerDesc: "En unos minutos recibirás confirmación para poder iniciar.",
    color: "#22d3ee", bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.25)", pulse: true,
  },
  payment_confirmed: {
    icon: BadgeCheck,
    clientTitle: "Pago verificado — ya está todo en marcha",
    clientDesc: "Tu dinero está protegido con LinkServi hasta que confirmes el servicio.",
    workerTitle: "¡Listo para arrancar! El pago está confirmado",
    workerDesc: "El dinero está asegurado en escrow. Inicia cuando estés en el lugar.",
    color: "#34d399", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)",
  },
  in_progress: {
    icon: Play,
    clientTitle: "Tu servicio está en marcha",
    clientDesc: "El profesional está trabajando. Te avisaremos cuando termine.",
    workerTitle: "En marcha — ya casi terminas",
    workerDesc: "Cuando termines, sube una foto del resultado y márcalo como finalizado.",
    color: "#a78bfa", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.25)", pulse: true,
  },
  finished: {
    icon: CheckSquare,
    clientTitle: "El profesional terminó — tu turno de confirmar",
    clientDesc: "Si todo está correcto, confirma para liberar el pago. Si hay un problema, abre una disputa.",
    workerTitle: "Trabajo enviado — esperando la confirmación",
    workerDesc: "El cliente revisará el resultado. Los fondos se liberan al confirmar.",
    color: "#fb923c", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)",
  },
  completed: {
    icon: CheckCircle2,
    clientTitle: "Trabajo completado 🎉",
    clientDesc: "Gracias por usar LinkServi. Puedes calificar al profesional abajo.",
    workerTitle: "Trabajo completado 🎉",
    workerDesc: "El cliente confirmó el servicio. Tu pago fue añadido a tu saldo.",
    color: "#34d399", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)",
  },
  cancelled: {
    icon: XCircle,
    clientTitle: "Solicitud cancelada",
    clientDesc: "Esta solicitud fue cancelada. Puedes hacer una nueva búsqueda cuando quieras.",
    workerTitle: "Solicitud cancelada",
    workerDesc: "Esta solicitud fue cancelada.",
    color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)",
  },
  disputed: {
    icon: AlertTriangle,
    clientTitle: "Abriste una disputa — en revisión",
    clientDesc: "LinkServi está revisando el caso. Los fondos están retenidos hasta resolverlo.",
    workerTitle: "El cliente abrió una disputa",
    workerDesc: "El equipo de LinkServi revisará el caso. Los fondos están retenidos.",
    color: "#f87171", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)",
  },
  dispute_in_review: {
    icon: AlertTriangle,
    clientTitle: "Tu caso está siendo analizado",
    clientDesc: "El equipo de LinkServi está revisando activamente la situación.",
    workerTitle: "El caso está siendo analizado",
    workerDesc: "El equipo de LinkServi está revisando activamente la situación.",
    color: "#fb923c", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)", pulse: true,
  },
  dispute_resolved_client: {
    icon: CheckCircle2,
    clientTitle: "Disputa resuelta a tu favor",
    clientDesc: "LinkServi procesará el reembolso en tu cuenta.",
    workerTitle: "Disputa resuelta a favor del cliente",
    workerDesc: "El pago fue cancelado. Si tienes preguntas, contacta al soporte.",
    color: "#34d399", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)",
  },
  dispute_resolved_worker: {
    icon: CheckCircle2,
    clientTitle: "Disputa resuelta a favor del profesional",
    clientDesc: "El equipo confirmó que el servicio fue realizado correctamente.",
    workerTitle: "Disputa resuelta a tu favor",
    workerDesc: "Tu pago fue añadido a tu saldo.",
    color: "#34d399", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)",
  },
};

function StatusHero({ status, isWorker, booking }: { status: string; isWorker: boolean; booking: any }) {
  const cfg = STATUS_HERO[status] ?? STATUS_HERO.cancelled;
  const Icon = cfg.icon;
  const title = isWorker ? cfg.workerTitle : cfg.clientTitle;
  const desc = isWorker ? cfg.workerDesc : cfg.clientDesc;
  const price = booking.agreedPrice ?? booking.totalAmount ?? booking.clientBudget;

  return (
    <div className="rounded-2xl p-4 flex items-start gap-3"
      style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
          <Icon className="w-5 h-5" style={{ color: cfg.color }} />
        </div>
        {cfg.pulse && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-ping opacity-75"
            style={{ background: cfg.color }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white leading-snug">{title}</p>
        <p className="text-xs mt-0.5 leading-relaxed text-white/50">{desc}</p>
      </div>
      {price > 0 && (
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-black text-white tabular-nums">${Number(price).toFixed(2)}</p>
          <p className="text-[10px] text-white/35">USD</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Booking info card
// ─────────────────────────────────────────────────────────────────────────────
function BookingInfoCard({ booking, isWorker }: { booking: any; isWorker: boolean }) {
  const otherName = isWorker ? booking.clientName : booking.workerName;

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-white text-base truncate">{booking.categoryName}</p>
          <p className="text-sm text-white/45 mt-0.5">
            {isWorker ? "Cliente: " : "Profesional: "}
            <span className="font-semibold text-white/70">{otherName}</span>
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      {booking.description && (
        <div className="flex items-start gap-2 text-sm text-white/50">
          <Tag className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-3">{booking.description.replace("[URGENTE] ", "")}</span>
        </div>
      )}

      {booking.address && !booking.address.startsWith("Por definir") && (
        <div className="flex items-start gap-2 text-sm text-white/50">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{booking.address}</span>
        </div>
      )}

      {booking.scheduledAt && (
        <div className="flex items-start gap-2 text-sm text-white/50">
          <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{format(new Date(booking.scheduledAt), "d/MM/yyyy 'a las' HH:mm", { locale: es })}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment countdown
// ─────────────────────────────────────────────────────────────────────────────
function PaymentCountdown({ acceptedAt }: { acceptedAt?: string | null }) {
  const LIMIT_MS = 30 * 60 * 1000;
  const [remaining, setRemaining] = useState(LIMIT_MS);

  useEffect(() => {
    const base = acceptedAt ? new Date(acceptedAt).getTime() : Date.now();
    const tick = () => setRemaining(Math.max(0, LIMIT_MS - (Date.now() - base)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [acceptedAt]);

  const min = Math.floor(remaining / 60000);
  const sec = Math.floor((remaining % 60000) / 1000);
  const urgent = remaining < 5 * 60 * 1000;
  const expired = remaining === 0;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${expired ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700" : urgent ? "bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-700" : "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-700"}`}>
      <Timer className={`w-4 h-4 flex-shrink-0 ${expired ? "text-red-500" : urgent ? "text-orange-500 animate-pulse" : "text-amber-500"}`} />
      <div>
        {expired ? (
          <p className="text-xs font-bold text-red-600">⚠ Tiempo agotado — la solicitud será cancelada pronto</p>
        ) : (
          <>
            <p className={`text-xs font-bold ${urgent ? "text-orange-700 dark:text-orange-400" : "text-amber-700 dark:text-amber-400"}`}>
              ⏳ Tiempo restante para pagar: {String(min).padStart(2, "0")}:{String(sec).padStart(2, "0")}
            </p>
            <p className="text-xs text-muted-foreground">Si el tiempo expira, la solicitud se cancela</p>
          </>
        )}
      </div>
    </div>
  );
}

// Payment method static data
const METHOD_DATA: Record<string, { title: string; color: string; borderColor: string; bgColor: string; rows: { label: string; value: string; copyable?: boolean }[] }> = {
  pago_movil: {
    title: "Pago Móvil",
    color: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-300 dark:border-blue-700",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    rows: [
      { label: "Banco", value: "Banco de Venezuela (BdV)" },
      { label: "Teléfono", value: "0414-830-1798", copyable: true },
      { label: "RIF", value: "J-41252119-5", copyable: true },
    ],
  },
  zelle: {
    title: "Zelle",
    color: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-300 dark:border-purple-700",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    rows: [{ label: "Correo Zelle", value: "leisterabaja@gmail.com", copyable: true }],
  },
  paypal: {
    title: "PayPal",
    color: "text-indigo-700 dark:text-indigo-300",
    borderColor: "border-indigo-300 dark:border-indigo-700",
    bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
    rows: [{ label: "Correo PayPal", value: "samirhzv@gmail.com", copyable: true }],
  },
  binance: {
    title: "Binance Pay",
    color: "text-yellow-700 dark:text-yellow-300",
    borderColor: "border-yellow-300 dark:border-yellow-600",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    rows: [
      { label: "Binance Pay ID", value: "149393614", copyable: true },
      { label: "Correo", value: "samirhzv@gmail.com", copyable: true },
    ],
  },
  transferencia: {
    title: "Transferencia Bancaria",
    color: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    rows: [
      { label: "Número de cuenta", value: "0102-0597-29-0000022651", copyable: true },
      { label: "RIF", value: "J-41252119-5", copyable: true },
      { label: "Titular", value: "LinkServi C.A." },
    ],
  },
};

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/50 dark:bg-black/20 border border-current border-opacity-20 hover:bg-white/80 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
    </button>
  );
}

// ── Venezuelan bank codes for Pago Móvil ─────────────────────────────────────
const BANCOS_VE = [
  { code: "0102", name: "Banco de Venezuela (BDV)" },
  { code: "0134", name: "Banesco" },
  { code: "0105", name: "Mercantil" },
  { code: "0108", name: "BBVA Provincial" },
  { code: "0114", name: "Bancaribe" },
  { code: "0115", name: "Banco Exterior" },
  { code: "0191", name: "Nacional de Crédito (BNC)" },
  { code: "0172", name: "Bancamiga" },
  { code: "0173", name: "Banplus" },
  { code: "0175", name: "Bicentenario" },
  { code: "0177", name: "BANFANB" },
  { code: "0163", name: "Banco del Tesoro" },
  { code: "0166", name: "Banco Agrícola" },
  { code: "0128", name: "Banco Caroní" },
  { code: "0151", name: "BFC" },
  { code: "0156", name: "100% Banco" },
  { code: "0157", name: "DelSur Banco" },
  { code: "0171", name: "Activo Bank" },
  { code: "0104", name: "Venezolano de Crédito" },
  { code: "0137", name: "Sofitasa" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Payment panel — client pays platform
// ─────────────────────────────────────────────────────────────────────────────
function PaymentPanel({ booking, onSubmitted }: { booking: any; onSubmitted: () => void }) {
  const [method, setMethod] = useState("pago_movil");
  const [proof, setProof] = useState<string | null>(null);
  const [proofName, setProofName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: bcvData, formatBs } = useBcvRate();

  // BDV auto-verify state (pago_movil only)
  const [bdvCedula, setBdvCedula] = useState("");
  const [bdvPhone, setBdvPhone] = useState("");
  const [bdvRef, setBdvRef] = useState("");
  const [bdvDate, setBdvDate] = useState("");
  const [bdvImporte, setBdvImporte] = useState("");
  const [bdvBanco, setBdvBanco] = useState("0102");
  const [bdvConfirmed, setBdvConfirmed] = useState(false);
  const [c2pOpen, setC2pOpen] = useState(false);

  const expectedAmount = booking.agreedPrice ?? booking.clientBudget ?? booking.totalAmount;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("Imagen máx. 20 MB"); return; }
    setError(""); setUploading(true);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const compressed = await compressImageBlob(file);
      const name = file.name.replace(/\.[^.]+$/, ".jpg");
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name, size: compressed.size, contentType: "image/jpeg" }),
      });
      if (!urlRes.ok) throw new Error("No se pudo obtener URL de carga");
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: compressed });
      setProof(objectPath); setProofName(name);
    } catch (e: any) { setProof(""); setPreviewUrl(""); setError(e.message ?? "Error al subir"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleSubmit = async () => {
    if (!proof) { setError("Sube el comprobante de pago"); return; }
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setError("Ingresa el monto que pagaste"); return; }
    setLoading(true); setError("");
    try {
      const rateUsed = bcvData?.rate ?? undefined;
      const amountBs = rateUsed ? amt * rateUsed : undefined;
      await submitPaymentProof(booking.id, proof, method, amt, ref || undefined, rateUsed, amountBs);
      toast({ title: "✅ Comprobante enviado", description: "Revisaremos tu pago en menos de 30 minutos." });
      onSubmitted();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Translate raw BDV bank-jargon errors into clear, actionable Spanish.
  // Returns a friendly message — the "Subir comprobante manual" fallback is
  // always offered separately in the UI so the client never gets stuck.
  const friendlyBdvError = (raw: string | undefined): string => {
    const m = (raw ?? "").toLowerCase();
    if (m.includes("no afiliado") || m.includes("no esta afiliado") || m.includes("no está afiliado")) {
      return "El Banco de Venezuela aún no reconoce este pago en el sistema de verificación automática. Esto puede pasar mientras la integración se termina de activar en producción. Sube el comprobante manual y nuestro equipo lo aprueba en minutos.";
    }
    if (m.includes("no encontrada") || m.includes("no encontr") || m.includes("not found")) {
      return "No encontramos esta referencia en BDV todavía. A veces el banco tarda 5-10 minutos en registrar el pago. Espera un momento e intenta de nuevo, o sube el comprobante manual.";
    }
    if (m.includes("monto") || m.includes("importe") || m.includes("amount")) {
      return "El monto que ingresaste no coincide con el pago registrado en BDV. Revisa que sea el valor exacto en bolívares que aparece en tu app del banco.";
    }
    if (m.includes("duplicad") || m.includes("ya fue") || m.includes("usado")) {
      return "Esta referencia ya fue utilizada para confirmar otro pago. Si crees que es un error, contacta a soporte.";
    }
    return raw ?? "No se encontró la transacción. Verifica los datos o sube el comprobante manual.";
  };

  const handleBdvVerify = async () => {
    if (!bdvCedula.trim()) { setError("Ingresa tu número de cédula"); return; }
    if (!bdvPhone.trim()) { setError("Ingresa el teléfono desde el que pagaste"); return; }
    if (!bdvRef.trim()) { setError("Ingresa el número de referencia"); return; }
    if (!bdvDate) { setError("Selecciona la fecha del pago"); return; }
    if (!bdvImporte || Number(bdvImporte) <= 0) { setError("Ingresa el monto en bolívares"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/payments/bdv/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          bookingId: booking.id,
          cedulaPagador: bdvCedula.trim().toUpperCase(),
          telefonoPagador: bdvPhone.trim().replace(/\D/g, "").replace(/^0/, "0"),
          referencia: bdvRef.trim(),
          fechaPago: bdvDate,
          importe: bdvImporte,
          bancoOrigen: bdvBanco,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(friendlyBdvError(data.error ?? data.message)); return; }
      if (data.confirmed) {
        setBdvConfirmed(true);
        toast({ title: "✅ Pago verificado por BDV", description: "Tu pago fue confirmado automáticamente. El profesional puede iniciar." });
        setTimeout(() => onSubmitted(), 2000);
      } else {
        setError(friendlyBdvError(data.message));
      }
    } catch (e: any) { setError("Error de red: " + e.message); }
    finally { setLoading(false); }
  };

  const METHODS = [
    { id: "pago_movil", label: "Pago Móvil", emoji: "📱" },
    { id: "binance", label: "Binance", emoji: "🟡" },
    { id: "zelle", label: "Zelle", emoji: "💵" },
    { id: "paypal", label: "PayPal", emoji: "🅿" },
    { id: "transferencia", label: "Transferencia", emoji: "🏦" },
  ];
  const md = METHOD_DATA[method];

  return (
    <div className="space-y-4">
      <PaymentCountdown acceptedAt={booking.acceptedAt} />

      {/* C2P instant payment CTA — primary recommended path */}
      {expectedAmount && (
        <button
          onClick={() => setC2pOpen(true)}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)", boxShadow: "0 8px 24px rgba(14,165,233,0.3)" }}
        >
          <Zap className="w-4 h-4" /> 📱 Pago Móvil C2P ⚡ Instantáneo — ${Number(expectedAmount).toFixed(2)}
        </button>
      )}

      {expectedAmount && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <div className="flex-1 h-px bg-white/10" />
          <span>o usa otro método de pago</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
      )}

      {/* Amount */}
      {expectedAmount && (
        <div className="rounded-xl border-2 border-primary/30 overflow-hidden">
          <div className="p-4 bg-primary/5 text-center">
            <p className="text-xs text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">Total a pagar a LinkServi</p>
            <p className="text-4xl font-black text-foreground">${Number(expectedAmount).toFixed(2)}</p>
            {bcvData && (
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">≈ {formatBs(Number(expectedAmount))}</p>
            )}
          </div>
          {bcvData && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-t border-emerald-200 dark:border-emerald-800">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Tasa BCV: Bs. {bcvData.rate.toLocaleString("es-VE", { minimumFractionDigits: 2 })} por $1
              </span>
            </div>
          )}
        </div>
      )}

      {/* Security warning */}
      <div className="p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 flex items-start gap-2">
        <Shield className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-red-700 dark:text-red-400">
          ⚠ Paga ÚNICAMENTE a los datos oficiales de LinkServi. Nunca pagues directamente al profesional.
        </p>
      </div>

      {/* Method selector */}
      <div>
        <p className="text-sm font-bold text-foreground mb-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold mr-1.5">1</span>
          Elige tu método de pago
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {METHODS.map(m => (
            <button key={m.id} onClick={() => setMethod(m.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all whitespace-nowrap ${method === m.id ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:border-foreground/30"}`}>
              {m.emoji} {m.label}
            </button>
          ))}
        </div>

        {/* Method data card */}
        {md && (() => {
          // Build dynamic Bs amount row for pago_movil
          const bsAmount = (method === "pago_movil" && bcvData && expectedAmount)
            ? Math.round(Number(expectedAmount) * bcvData.rate).toLocaleString("es-VE")
            : null;
          const allRows = bsAmount
            ? [...md.rows, { label: "Monto", value: `Bs. ${bsAmount}`, copyable: true, highlight: true }]
            : md.rows;
          const copyText = allRows.map(r => `${r.label}: ${r.value}`).join("\n");
          return (
            <div className={`mt-3 rounded-xl border-2 overflow-hidden ${md.borderColor} ${md.bgColor}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${md.borderColor}`}>
                <p className={`text-sm font-bold ${md.color}`}>📋 Datos — {md.title}</p>
                <button onClick={() => navigator.clipboard.writeText(copyText)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${md.borderColor} ${md.color} hover:bg-white/40 dark:hover:bg-black/20`}>
                  <Copy className="w-3 h-3" /> Copiar datos
                </button>
              </div>
              <div className="px-4 py-2 space-y-0">
                {allRows.map((r: any) => (
                  <div key={r.label} className={`flex items-center justify-between py-2.5 border-b last:border-0 ${md.borderColor} border-opacity-40 ${r.highlight ? "bg-emerald-50/60 dark:bg-emerald-900/10 -mx-4 px-4 rounded" : ""}`}>
                    <span className={`text-xs font-medium ${r.highlight ? "text-emerald-700 dark:text-emerald-400" : `${md.color} opacity-80`}`}>{r.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${r.highlight ? "text-emerald-700 dark:text-emerald-400" : md.color}`}>{r.value}</span>
                      {r.copyable && <CopyBtn value={r.value} />}
                    </div>
                  </div>
                ))}
              </div>
              <div className={`px-4 py-2.5 border-t ${md.borderColor} border-opacity-40`}>
                <p className={`text-xs ${md.color} opacity-70`}>✓ Envía el pago y luego sube tu comprobante abajo.</p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Step 2: BDV auto-verify (pago_movil) OR manual upload ──────────── */}
      {method === "pago_movil" ? (
        /* ── BDV Auto-verify form ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold mr-1.5">2</span>
              Verificación automática BDV
            </p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-700 border border-emerald-300"
              style={{ background: "rgba(16,185,129,0.08)" }}>⚡ Instantáneo</span>
          </div>

          {/* Info banner */}
          <div className="p-3 rounded-xl border flex items-start gap-2"
            style={{ background: "rgba(6,182,212,0.06)", borderColor: "rgba(6,182,212,0.25)" }}>
            <span className="text-base mt-0.5">🏦</span>
            <p className="text-xs text-cyan-700 dark:text-cyan-400 leading-relaxed">
              Ingresa los datos del Pago Móvil que realizaste. BDV los verificará en segundos y tu reserva se confirmará automáticamente.
            </p>
          </div>

          {bdvConfirmed ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                style={{ background: "rgba(16,185,129,0.12)", border: "2px solid rgba(16,185,129,0.4)" }}>✅</div>
              <p className="font-bold text-emerald-700 dark:text-emerald-400 text-center">¡Pago verificado por BDV!</p>
              <p className="text-xs text-muted-foreground text-center">Tu reserva fue confirmada automáticamente. El profesional puede iniciar.</p>
            </div>
          ) : (
            <>
              {/* Cedula */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Cédula del pagador <span className="text-red-500">*</span></label>
                <input value={bdvCedula} onChange={e => setBdvCedula(e.target.value)}
                  placeholder="Ej: V27037606"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Incluye la letra: V, E, J, G</p>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Teléfono desde el que pagaste <span className="text-red-500">*</span></label>
                <input value={bdvPhone} onChange={e => setBdvPhone(e.target.value)}
                  placeholder="Ej: 04127141363"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Número de referencia <span className="text-red-500">*</span></label>
                <input value={bdvRef} onChange={e => setBdvRef(e.target.value)}
                  placeholder="Ej: 123112313"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Fecha del pago <span className="text-red-500">*</span></label>
                <input type="date" value={bdvDate} onChange={e => setBdvDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Amount in Bs */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Monto pagado en bolívares (Bs.) <span className="text-red-500">*</span></label>
                <input type="number" min="0" step="0.01" value={bdvImporte} onChange={e => setBdvImporte(e.target.value)}
                  placeholder="Ej: 58001.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <p className="text-[10px] text-muted-foreground mt-0.5">El monto exacto que aparece en tu banco, en bolívares</p>
              </div>

              {/* Bank */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Banco origen <span className="text-red-500">*</span></label>
                <select value={bdvBanco} onChange={e => setBdvBanco(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  {BANCOS_VE.map(b => (
                    <option key={b.code} value={b.code}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="rounded-xl p-3 space-y-2.5"
                  style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <div className="flex items-start gap-2 text-xs text-red-400 leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {error}
                  </div>
                  <button onClick={() => { setError(""); setMethod("transferencia"); }}
                    className="w-full py-2.5 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg,#06B6D4,#0891B2)" }}>
                    📎 Subir comprobante manual
                  </button>
                  <p className="text-[10px] text-center text-white/40">Nuestro equipo lo aprueba en menos de 30 minutos</p>
                </div>
              )}

              <button onClick={handleBdvVerify} disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 shadow-sm text-white"
                style={{ background: loading ? "#0891b2" : "linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)" }}>
                {loading
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verificando con BDV...</span>
                  : "⚡ Verificar pago automáticamente"}
              </button>

            </>
          )}
        </div>
      ) : (
        /* ── Manual upload (all other methods: Binance, Zelle, PayPal, transferencia) ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold mr-1.5">2</span>
              Sube tu comprobante de pago
            </p>
          </div>

          {/* Amount paid */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Monto que pagaste <span className="text-red-500">*</span></label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder={expectedAmount ? Number(expectedAmount).toFixed(2) : "0.00"}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {bcvData && amount && Number(amount) > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">≈ {formatBs(Number(amount))}</span>
              </div>
            )}
          </div>

          {/* Reference */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Número de referencia <span className="text-muted-foreground">(opcional)</span></label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Ej: 002345678901"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {/* File upload */}
          <div>
            {previewUrl && (
              <div className="relative mb-2 rounded-xl overflow-hidden border-2 border-primary/30">
                <img src={previewUrl} className="w-full max-h-40 object-contain bg-muted" />
                <button onClick={() => { setProof(null); setProofName(""); setPreviewUrl(""); }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 p-2">
                  <p className="text-[11px] text-white font-medium truncate">{proofName}</p>
                </div>
              </div>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-sm text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
              {uploading ? <><div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />Subiendo...</>
                : proof ? <><Check className="w-4 h-4 text-emerald-500" />Comprobante cargado — toca para cambiar</>
                : <><Upload className="w-4 h-4" />Subir foto del comprobante</>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <p className="text-[11px] text-muted-foreground mt-1 text-center">JPG, PNG, WEBP · máx. 20 MB</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 text-xs text-red-600">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading || uploading || !proof}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-50 shadow-sm">
            {loading ? "Enviando..." : "📤 Enviar comprobante a LinkServi"}
          </button>
        </div>
      )}

      {c2pOpen && expectedAmount && (
        <C2PModal
          open={c2pOpen}
          onClose={() => setC2pOpen(false)}
          amountUsd={Number(expectedAmount)}
          concept={`Reserva #${booking.id} — ${booking.serviceName ?? "Servicio"}`}
          referenceType="booking"
          referenceId={booking.id}
          onSuccess={() => {
            setC2pOpen(false);
            toast({ title: "✅ Pago confirmado", description: "Tu reserva fue confirmada al instante." });
            onSubmitted();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm / Dispute panel — client: finished state
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmDisputePanel({ booking, onDone }: { booking: any; onDone: () => void }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { formatBs } = useBcvRate();
  const [step, setStep] = useState<"main" | "dispute">("main");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [secsLeft, setSecsLeft] = useState<number | null>(null);

  const isPremium = user?.clientPlan === "premium";
  const total = Number(booking.totalAmount ?? 0);

  // 35-min countdown — auto-confirm window. Backend job will release the
  // payment automatically when the countdown reaches zero.
  useEffect(() => {
    if (!booking.finishedAt) return;
    const calc = () => {
      const finished = new Date(booking.finishedAt).getTime();
      const target = finished + 35 * 60 * 1000;
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecsLeft(left);
      // When the timer hits zero, refresh from backend to pick up auto-completion
      if (left === 0) onDone();
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [booking.finishedAt]);

  const doConfirm = async () => {
    setLoading(true);
    try {
      await completeBookingWithPayment(booking.id, "paid_to_platform");
      toast({ title: "✅ Servicio confirmado", description: "El pago será liberado al profesional." });
      onDone();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const doDispute = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await disputeBooking(booking.id, reason);
      toast({ title: "⚠ Disputa abierta", description: "El equipo de LinkServi revisará el caso en menos de 24h. El pago queda congelado." });
      onDone();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  // ── Dispute step ──────────────────────────────────────────────────────────
  if (step === "dispute") {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep("main")}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="font-black text-rose-400 text-sm">Reportar problema</h3>
        </div>
        <div className="rounded-xl p-3 flex items-start gap-2"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-rose-300/90">
            <strong className="text-rose-300">El pago queda congelado.</strong> El equipo LinkServi revisará el caso en menos de 24h.
          </p>
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
          placeholder="Describe el problema: el trabajo no fue completado, hay daños, calidad insuficiente, etc."
          className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none resize-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
        <button onClick={doDispute} disabled={!reason.trim() || loading}
          className="w-full py-3 rounded-xl text-white text-sm font-black disabled:opacity-40 transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            boxShadow: "0 0 20px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}>
          {loading ? "Enviando…" : "Abrir disputa"}
        </button>
      </div>
    );
  }

  // ── Main confirmation step ────────────────────────────────────────────────
  const mins = secsLeft != null ? Math.floor(secsLeft / 60).toString().padStart(2, "0") : "35";
  const secs = secsLeft != null ? (secsLeft % 60).toString().padStart(2, "0") : "00";
  const urgent = secsLeft != null && secsLeft < 5 * 60;
  const accent = urgent ? "#fb923c" : "#38bdf8";
  const accentRgb = urgent ? "251,146,60" : "56,189,248";

  return (
    <div className="space-y-3.5">
      {/* Title */}
      <div className="text-center">
        <h3 className="text-base font-black text-white">Esperando tu confirmación</h3>
        <p className="text-xs text-white/50 mt-0.5">El profesional indicó que el trabajo fue finalizado</p>
      </div>

      {/* Countdown — fintech glow */}
      <div className="rounded-2xl p-4 text-center relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, rgba(${accentRgb},0.10), rgba(${accentRgb},0.03))`,
          border: `1.5px solid rgba(${accentRgb},0.35)`,
          boxShadow: `0 0 32px rgba(${accentRgb},0.2), inset 0 0 24px rgba(${accentRgb},0.05)`,
        }}>
        <div className="flex items-center justify-center gap-1.5">
          <Timer className="w-3 h-3" style={{ color: accent }} />
          <p className="text-[10px] font-black tracking-widest uppercase" style={{ color: accent }}>
            {urgent ? "Liberación inminente" : "Confirmación automática en"}
          </p>
        </div>
        <p className="text-4xl font-black text-white mt-1.5 tabular-nums leading-none"
          style={{ textShadow: `0 0 24px rgba(${accentRgb},0.7)` }}>
          {mins}:{secs}
        </p>
        <p className="text-[10px] text-white/40 mt-2">
          Si no haces nada, el pago se libera automáticamente
        </p>
      </div>

      {/* Amount */}
      <div className="rounded-2xl p-3.5 flex items-center justify-between"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Total a liberar</p>
          <p className="text-2xl font-black text-white leading-none mt-1">${total.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">≈ Bs.</p>
          <p className="text-sm font-bold text-white/70 mt-1">{formatBs(total).replace("Bs. ", "")}</p>
        </div>
      </div>

      {/* Security card */}
      <div className="rounded-2xl p-3"
        style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)" }}>
        <div className="flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-black text-emerald-400 mb-1">Pago protegido por LinkServi</p>
            <ul className="space-y-0.5 text-emerald-300/80">
              <li>✓ El dinero solo se libera cuando confirmas</li>
              <li>✓ Puedes reportar problemas antes</li>
              {isPremium && <li>✓ +10 días de garantía Premium activa</li>}
            </ul>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="space-y-2">
        <button onClick={doConfirm} disabled={loading}
          className="w-full py-3.5 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #10b981, #059669)",
            boxShadow: "0 0 24px rgba(16,185,129,0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}>
          {loading ? "Procesando…" : "✓  Confirmar trabajo"}
        </button>
        <p className="text-[10px] text-center text-white/40">Todo está correcto — liberar pago ahora</p>

        <button onClick={() => setStep("dispute")} disabled={loading}
          className="w-full py-3 rounded-2xl text-sm font-bold text-rose-300 transition-all active:scale-[0.98] mt-2"
          style={{
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.3)",
          }}>
          ⚠  Reportar problema
        </button>
        <p className="text-[10px] text-center text-white/40">No estoy conforme — congelar pago</p>
      </div>

      {/* Premium upsell — only for free users */}
      {!isPremium && (
        <div className="rounded-2xl p-3 mt-1"
          style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(56,189,248,0.05))",
            border: "1px solid rgba(168,85,247,0.30)",
          }}>
          <div className="flex items-start gap-2.5">
            <Award className="w-4 h-4 text-purple-300 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-black text-white">¿Quieres más protección?</p>
              <ul className="text-[11px] text-white/60 mt-1 space-y-0.5">
                <li>✓ 10 días de garantía extendida</li>
                <li>✓ Soporte prioritario</li>
                <li>✓ Atención preferencial</li>
              </ul>
              <button onClick={() => navigate("/client/premium")}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-purple-300 hover:text-purple-200">
                Mejorar a Premium <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker CTA Panel
// ─────────────────────────────────────────────────────────────────────────────
function WorkerCTAPanel({ booking, onRefresh }: { booking: any; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showCounter, setShowCounter] = useState(false);
  const { mutate: accept } = { mutate: async () => {} } as any;

  const doAction = async (fn: () => Promise<any>) => {
    setLoading(true);
    try { await fn(); onRefresh(); }
    catch (e: any) { toast({ title: e.message ?? "Error", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleAccept = async () => {
    const res = await fetch(`/api/bookings/${booking.id}/accept`, {
      method: "POST", headers: getAuthHeader(),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Error al aceptar"); }
    onRefresh();
  };

  const handleReject = async () => {
    const res = await fetch(`/api/bookings/${booking.id}/reject`, {
      method: "POST", headers: getAuthHeader(),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Error al rechazar"); }
    onRefresh();
  };

  const { status } = booking;

  if (status === "pending") {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800">
          <p className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">📋 Nueva solicitud de trabajo</p>
          <p className="text-xs text-blue-700 dark:text-blue-400">Acepta o rechaza esta solicitud. También puedes negociar el precio.</p>
        </div>
        {booking.counterOfferStatus === "pending" && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            Propuesta enviada al cliente — esperando respuesta
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => doAction(handleReject)} disabled={loading}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50 transition-colors">
            <XCircle className="w-4 h-4" /> Rechazar
          </button>
          <button onClick={() => doAction(handleAccept)} disabled={loading}
            className="btn-action-pulse flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 shadow-md">
            <CheckCircle2 className="w-4 h-4" /> {loading ? "..." : "Aceptar"}
          </button>
        </div>
        {!booking.counterOfferStatus && (
          <button onClick={() => setShowCounter(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors">
            <DollarSign className="w-4 h-4" /> Negociar precio
          </button>
        )}
        {showCounter && (
          <CounterOfferModal
            bookingId={booking.id}
            clientBudget={booking.clientBudget}
            categoryName={booking.categoryName}
            onClose={() => setShowCounter(false)}
            onSuccess={onRefresh}
          />
        )}
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800 flex items-center gap-3">
        <Clock className="w-8 h-8 text-blue-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-blue-800 dark:text-blue-300">Esperando pago del cliente</p>
          <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Recibirás una notificación cuando el cliente realice el pago.</p>
        </div>
      </div>
    );
  }

  if (status === "payment_pending") {
    return (
      <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/10 dark:border-cyan-800 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-cyan-800 dark:text-cyan-300">Pago en verificación</p>
          <p className="text-xs text-cyan-700 dark:text-cyan-400 mt-0.5">El equipo de LinkServi está revisando el comprobante (máx. 30 min).</p>
        </div>
      </div>
    );
  }

  if (status === "payment_confirmed") {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-teal-50 border-2 border-teal-300 dark:bg-teal-900/10 dark:border-teal-700">
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <p className="text-sm font-bold text-teal-800 dark:text-teal-300">¡Pago confirmado! Puedes iniciar el trabajo</p>
          </div>
          <p className="text-xs text-teal-700 dark:text-teal-500">Toma una foto del estado inicial antes de comenzar.</p>
        </div>
        <ServicePhotoUpload bookingId={booking.id} photoType="before" label="Foto antes de iniciar (recomendado)" onUploaded={onRefresh} />
        <button onClick={() => doAction(() => startBooking(booking.id))} disabled={loading}
          className="btn-action-pulse w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-600 disabled:opacity-50 shadow-sm">
          <Play className="w-5 h-5" /> {loading ? "Iniciando..." : "Iniciar trabajo"}
        </button>
      </div>
    );
  }

  if (status === "in_progress") {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 dark:bg-purple-900/10 dark:border-purple-800">
          <p className="text-sm font-bold text-purple-800 dark:text-purple-300">🔧 Trabajo en progreso</p>
          <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Cuando termines, toma una foto del resultado y márcalo como finalizado.</p>
        </div>
        <ServicePhotoUpload bookingId={booking.id} photoType="after" label="Foto del trabajo finalizado" onUploaded={onRefresh} />
        <button onClick={() => doAction(() => finishBooking(booking.id))} disabled={loading}
          className="btn-action-pulse w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 disabled:opacity-50 shadow-sm">
          <CheckSquare className="w-5 h-5" /> {loading ? "..." : "Marcar como finalizado"}
        </button>
      </div>
    );
  }

  if (status === "finished") {
    return (
      <div className="p-4 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
        <Clock className="w-8 h-8 text-muted-foreground flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-foreground">Esperando confirmación del cliente</p>
          <p className="text-xs text-muted-foreground mt-0.5">El cliente debe confirmar que el servicio fue realizado correctamente.</p>
        </div>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="text-center py-5 space-y-2">
        <p className="text-3xl">🎉</p>
        <p className="text-base font-black text-white">Trabajo completado</p>
        {booking.workerEarnings && (
          <p className="text-sm font-bold text-emerald-400">+${Number(booking.workerEarnings).toFixed(2)} USD añadidos a tu saldo</p>
        )}
        <p className="text-xs text-white/40">Gracias por brindar un excelente servicio</p>
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client CTA Panel
// ─────────────────────────────────────────────────────────────────────────────
function ClientCTAPanel({ booking, onRefresh }: { booking: any; onRefresh: () => void }) {
  const [showReview, setShowReview] = useState(false);
  const { status } = booking;

  if (status === "pending") {
    return (
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800 flex items-center gap-3">
        <Clock className="w-8 h-8 text-blue-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-blue-800 dark:text-blue-300">Esperando respuesta del profesional</p>
          <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">El profesional revisará tu solicitud y te responderá pronto.</p>
        </div>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800">
          <p className="text-sm font-bold text-yellow-800 dark:text-yellow-400 mb-1">💳 Realiza tu pago a LinkServi</p>
          <p className="text-xs text-yellow-700 dark:text-yellow-500">
            {booking.agreedPrice
              ? `Precio acordado: $${Number(booking.agreedPrice).toFixed(2)} USD. Paga a continuación para confirmar el servicio.`
              : "Precio confirmado. Paga a continuación para que el profesional pueda iniciar el trabajo."
            }
          </p>
          {booking.paymentRejectedReason && (
            <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/10">
              <p className="text-xs text-red-600"><strong>⚠ Comprobante anterior rechazado:</strong> {booking.paymentRejectedReason}</p>
            </div>
          )}
        </div>
        <PaymentPanel booking={booking} onSubmitted={onRefresh} />
      </div>
    );
  }

  if (status === "payment_pending") {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/10 dark:border-cyan-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse flex-shrink-0" />
            <p className="text-sm font-bold text-cyan-800 dark:text-cyan-400">Comprobante en revisión por LinkServi</p>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {[{ l: "Pago enviado", d: true }, { l: "En revisión", d: false, a: true }, { l: "Confirmado", d: false }].map((s, i) => (
              <div key={s.l} className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${s.d ? "bg-emerald-500 text-white" : (s as any).a ? "bg-cyan-500 text-white" : "bg-muted text-muted-foreground"}`}>
                  {s.d ? "✓" : i + 1}
                </div>
                <span className={s.d ? "text-emerald-600 dark:text-emerald-400" : (s as any).a ? "text-cyan-700 dark:text-cyan-400 font-medium" : "text-muted-foreground"}>{s.l}</span>
                {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-cyan-600 dark:text-cyan-500 mt-2">Recibirás una notificación cuando se confirme (máx. 30 min).</p>
        </div>
        {booking.paymentAmount && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <span>Monto declarado:</span>
            <span className="font-semibold text-foreground">${Number(booking.paymentAmount).toFixed(2)}</span>
            {booking.paymentMethod && <span>· {booking.paymentMethod.replace("_", " ")}</span>}
          </div>
        )}
      </div>
    );
  }

  if (status === "payment_confirmed") {
    return (
      <div className="p-4 rounded-xl bg-teal-50 border-2 border-teal-300 dark:bg-teal-900/10 dark:border-teal-700">
        <div className="flex items-center gap-2 mb-1">
          <BadgeCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <p className="text-sm font-bold text-teal-800 dark:text-teal-300">Pago verificado ✓</p>
        </div>
        <p className="text-xs text-teal-700 dark:text-teal-500">Tu pago fue confirmado. El profesional puede iniciar el trabajo ahora. Recibirás garantía LinkServi al completar.</p>
      </div>
    );
  }

  if (status === "in_progress") {
    return (
      <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 dark:bg-purple-900/10 dark:border-purple-800 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-purple-800 dark:text-purple-300">Trabajo en progreso</p>
          <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">El profesional está trabajando. Te notificaremos cuando finalice.</p>
        </div>
      </div>
    );
  }

  if (status === "finished") {
    return <ConfirmDisputePanel booking={booking} onDone={onRefresh} />;
  }

  if (status === "completed") {
    return (
      <div className="space-y-4">
        <div className="text-center py-4 space-y-1.5">
          <p className="text-3xl">🎉</p>
          <p className="text-base font-black text-white">Trabajo completado</p>
          {booking.totalAmount && (
            <p className="text-xs text-white/40">Total pagado: ${Number(booking.totalAmount).toFixed(2)} USD</p>
          )}
          <p className="text-xs text-white/40">Gracias por usar LinkServi</p>
        </div>
        <button onClick={() => setShowReview(true)}
          className="btn-action-pulse w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ background: "rgba(251,191,36,0.15)", border: "1.5px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}>
          <Award className="w-4 h-4" /> Calificar al profesional
        </button>
        {showReview && (
          <ReviewModal
            booking={{ id: booking.id, workerId: booking.workerId, workerName: booking.workerName, categoryName: booking.categoryName }}
            onClose={() => setShowReview(false)}
            onSuccess={() => { setShowReview(false); }}
          />
        )}
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter-offer banner (client side: worker proposed a price)
// ─────────────────────────────────────────────────────────────────────────────
function CounterOfferBanner({ booking, onRefresh }: { booking: any; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (done || booking.counterOfferStatus !== "pending" || !booking.workerCounterOffer) return null;

  const respond = async (accept: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/counter-offer/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setDone(true);
      onRefresh();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20 space-y-3">
      <div className="flex items-start gap-2">
        <DollarSign className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-foreground">💬 {booking.workerName} propone un precio</p>
          <p className="text-2xl font-black text-primary mt-1">${Number(booking.workerCounterOffer).toFixed(2)}</p>
          {booking.clientBudget && (
            <p className="text-xs text-muted-foreground">Tu oferta original: ${Number(booking.clientBudget).toFixed(2)}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => respond(false)} disabled={loading}
          className="py-2 rounded-xl border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors">
          Rechazar
        </button>
        <button onClick={() => respond(true)} disabled={loading}
          className="py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity">
          {loading ? "..." : "✓ Aceptar precio"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel button — available for client/worker in certain states
// ─────────────────────────────────────────────────────────────────────────────
function CancelButton({ booking, isWorker, onDone }: { booking: any; isWorker: boolean; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const cancellable = isWorker
    ? ["pending"].includes(booking.status)
    : ["pending", "accepted"].includes(booking.status);

  if (!cancellable) return null;

  const doCancel = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
        method: "POST", headers: getAuthHeader(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast({ title: "Solicitud cancelada" });
      onDone();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  if (confirm) {
    return (
      <div className="p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 space-y-2">
        <p className="text-xs font-semibold text-red-700 dark:text-red-400">¿Confirmas la cancelación?</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setConfirm(false)} className="py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">No, volver</button>
          <button onClick={doCancel} disabled={loading} className="py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors">
            {loading ? "..." : "Sí, cancelar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirm(true)}
      className="w-full py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-red-600 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all">
      Cancelar solicitud
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main BookingDetailPage
// ─────────────────────────────────────────────────────────────────────────────
export function BookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Determine view from URL first (so users with both roles see the right view).
  // Fall back to user role if URL doesn't disambiguate.
  const _path = window.location.pathname;
  const isWorker = _path.startsWith("/professional/")
    ? true
    : _path.startsWith("/client/")
      ? false
      : (user?.role === "worker" ||
        (user?.secondaryRole === "worker" && user?.role !== "client"));

  const chatPath = isWorker
    ? `/professional/chat/${bookingId}`
    : `/client/chat/${bookingId}`;

  const backPath = isWorker ? "/professional/bookings" : "/client/bookings";

  const fetchBooking = async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        headers: getAuthHeader(),
        credentials: "include",
      });
      if (!res.ok) { setError("No se pudo cargar el servicio"); return; }
      setBooking(await res.json());
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBooking(); }, [bookingId]);

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando servicio...</p>
        </div>
      </AppLayout>
    );
  }

  if (error || !booking) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-20 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-foreground font-semibold">{error || "Servicio no encontrado"}</p>
          <button onClick={() => navigate(backPath)} className="text-sm text-primary hover:underline">← Volver</button>
        </div>
      </AppLayout>
    );
  }

  const isActive = !["completed", "cancelled", "dispute_resolved_client", "dispute_resolved_worker"].includes(booking.status);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 pb-8">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(backPath)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/08 transition-colors flex-shrink-0"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-white text-base truncate">{booking.categoryName}</h1>
            <p className="text-xs text-white/40 truncate">#{bookingId} · {isWorker ? booking.clientName : booking.workerName}</p>
          </div>
          {isActive && (
            <button onClick={() => navigate(chatPath)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white/60 hover:text-white transition-all flex-shrink-0"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          )}
        </div>

        {/* ── Status Hero ── */}
        <StatusHero status={booking.status} isWorker={isWorker} booking={booking} />

        {/* ── Booking info ── */}
        <BookingInfoCard booking={booking} isWorker={isWorker} />

        {/* ── Counter-offer (client only) ── */}
        {!isWorker && <CounterOfferBanner booking={booking} onRefresh={fetchBooking} />}

        {/* ── Timeline ── */}
        <BookingTimeline status={booking.status} />

        {/* ── Main CTA ── */}
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.1)" }}>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Siguiente paso</p>
          {isWorker
            ? <WorkerCTAPanel booking={booking} onRefresh={fetchBooking} />
            : <ClientCTAPanel booking={booking} onRefresh={fetchBooking} />
          }
        </div>

        {/* ── Cancel option ── */}
        <CancelButton booking={booking} isWorker={isWorker} onDone={() => navigate(backPath)} />

      </div>
    </AppLayout>
  );
}
