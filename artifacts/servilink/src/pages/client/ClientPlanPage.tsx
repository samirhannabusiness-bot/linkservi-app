import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiFetch, getAuthHeader } from "@/lib/api";
import {
  Crown, Zap, CheckCircle2, Clock, CreditCard,
  ShieldCheck, Star, Rocket, ChevronRight, X,
  BadgeCheck, Gift, TrendingUp, MessageCircle,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { C2PModal } from "@/components/payments/C2PModal";

const DURATION_OPTIONS = [
  { months: 1,  label: "1 mes",    price: 4.99,  perMonth: 4.99,  badge: "" },
  { months: 3,  label: "3 meses",  price: 13.47, perMonth: 4.49,  badge: "Ahorra 10%" },
  { months: 6,  label: "6 meses",  price: 23.95, perMonth: 3.99,  badge: "Ahorra 20%" },
  { months: 12, label: "12 meses", price: 41.92, perMonth: 3.49,  badge: "🔥 Más popular" },
];

const BENEFITS = [
  { icon: Zap,         color: "text-amber-400",  label: "Prioridad en solicitudes",       desc: "Tus solicitudes aparecen primero para los profesionales" },
  { icon: Star,        color: "text-yellow-400",  label: "Acceso a los mejores profesionales", desc: "Profesionales verificados y mejor calificados te atienden primero" },
  { icon: TrendingUp,  color: "text-emerald-400", label: "5% de descuento en servicios",  desc: "Ahorra automáticamente en cada servicio contratado" },
  { icon: Rocket,      color: "text-blue-400",    label: "Respuestas más rápidas",         desc: "Los profesionales priorizan a clientes Premium" },
  { icon: Gift,        color: "text-violet-400",  label: "Promociones exclusivas",         desc: "Acceso anticipado a descuentos y ofertas especiales" },
  { icon: ShoppingBag, color: "text-pink-400",    label: "Beneficios en ServiMarket",      desc: "Mejores precios y envío prioritario en productos" },
  { icon: MessageCircle, color: "text-cyan-400",  label: "Soporte prioritario",            desc: "Respuesta directa del equipo LinkServi" },
  { icon: BadgeCheck,  color: "text-teal-400",    label: "Badge Premium exclusivo",        desc: "Identificación visual que aumenta la confianza de los profesionales" },
];

function ShoppingBag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>
    </svg>
  );
}

interface PremiumRequest {
  id: number;
  status: string;
  paymentMethod: string;
  amount: number;
  days: number;
  createdAt: string;
  adminNotes?: string | null;
}

export function ClientPlanPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PremiumRequest[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const isPremiumActive = user?.clientPlan === "premium" && !!user?.clientPremiumUntil && new Date(user.clientPremiumUntil) > new Date();
  const premiumUntil = user?.clientPremiumUntil ? new Date(user.clientPremiumUntil) : null;

  const fetchRequests = () =>
    apiFetch("/api/client-premium-requests/me", { headers: getAuthHeader() })
      .then((data: any) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingRequests(false));

  useEffect(() => { fetchRequests(); }, []);

  const pendingRequest  = requests.find(r => r.status === "pending");
  const rejectedRequest = requests.find(r => r.status === "rejected");

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 pb-10">

        {/* ── Hero ── */}
        <div className="relative rounded-3xl overflow-hidden">
          {/* layered gradient background */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(145deg,#0e0520 0%,#1c0a4a 35%,#12203a 70%,#060d1f 100%)" }} />
          {/* glow orbs */}
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-violet-600/20 blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-amber-500/10 blur-[60px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-40 rounded-full bg-indigo-600/10 blur-[50px] pointer-events-none" />

          {/* decorative stars */}
          <div className="absolute top-5 left-8 w-1 h-1 rounded-full bg-white/30" />
          <div className="absolute top-10 left-16 w-0.5 h-0.5 rounded-full bg-white/20" />
          <div className="absolute top-4 right-14 w-1.5 h-1.5 rounded-full bg-amber-300/40" />
          <div className="absolute top-14 right-8 w-1 h-1 rounded-full bg-white/25" />
          <div className="absolute bottom-8 left-12 w-1 h-1 rounded-full bg-violet-300/30" />

          <div className="relative z-10 p-6 sm:p-10 text-center space-y-5">
            {/* badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold tracking-wide"
              style={{ background: "linear-gradient(90deg,rgba(251,191,36,0.12),rgba(245,158,11,0.08))", borderColor: "rgba(251,191,36,0.35)", color: "#fbbf24" }}>
              <Crown className="w-3.5 h-3.5" />
              LinkServi Premium · Cliente
            </div>

            {isPremiumActive ? (
              <>
                {/* active crown */}
                <div className="flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", boxShadow: "0 0 40px rgba(245,158,11,0.5)" }}>
                    <Crown className="w-10 h-10 text-white" />
                  </div>
                </div>
                <h1 className="text-3xl font-black text-white">¡Eres Premium! 🎉</h1>
                <p className="text-white/50 text-sm max-w-xs mx-auto">
                  Tu membresía está activa hasta el{" "}
                  <span className="text-amber-300 font-semibold">
                    {premiumUntil ? format(premiumUntil, "d 'de' MMMM, yyyy", { locale: es }) : ""}
                  </span>
                </p>
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold" style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#6ee7b7" }}>
                  <CheckCircle2 className="w-4 h-4" />
                  5% de descuento aplicado automáticamente
                </div>
              </>
            ) : (
              <>
                {/* crown icon */}
                <div className="flex items-center justify-center">
                  <div className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.2),rgba(217,119,6,0.1))", border: "1.5px solid rgba(251,191,36,0.3)" }}>
                    <Crown className="w-9 h-9 text-amber-400" style={{ filter: "drop-shadow(0 0 12px rgba(251,191,36,0.8))" }} />
                  </div>
                </div>
                <div>
                  <h1 className="text-4xl font-black text-white tracking-tight leading-tight">Hazte Premium</h1>
                  <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto">Mejor servicio, más rápido y más barato.</p>
                </div>
                {/* price display */}
                <div className="relative inline-block">
                  <div className="flex items-start justify-center gap-1">
                    <span className="text-xl font-bold text-white/50 mt-3">$</span>
                    <span className="text-7xl font-black leading-none" style={{ background: "linear-gradient(135deg,#ffffff,#e2d9f3)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>4</span>
                    <span className="text-7xl font-black leading-none" style={{ background: "linear-gradient(135deg,#ffffff,#e2d9f3)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>.99</span>
                    <div className="flex flex-col justify-end ml-1 pb-2">
                      <span className="text-xs text-white/40 font-medium leading-tight">USD</span>
                      <span className="text-xs text-white/40 font-medium leading-tight">/ mes</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Status banners ── */}
        {pendingRequest && !isPremiumActive && (
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.08),rgba(245,158,11,0.05))", border: "1px solid rgba(251,191,36,0.2)" }}>
            <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(251,191,36,0.15)" }}>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-300">Pago en verificación</p>
              <p className="text-xs text-amber-400/60 mt-0.5 leading-relaxed">
                Pagaste <span className="font-semibold text-amber-300">${pendingRequest.amount}</span> con {pendingRequest.paymentMethod} el{" "}
                {format(new Date(pendingRequest.createdAt), "d MMM yyyy", { locale: es })}.
                El equipo lo activará en menos de 24 horas.
              </p>
            </div>
          </div>
        )}

        {rejectedRequest && !isPremiumActive && !pendingRequest && (
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
              <X className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-300">Solicitud rechazada</p>
              <p className="text-xs text-red-400/60 mt-0.5">{rejectedRequest.adminNotes || "Por favor intenta de nuevo o contacta al soporte."}</p>
            </div>
          </div>
        )}

        {/* ── CTA ── */}
        {!isPremiumActive && !pendingRequest && (
          <button
            onClick={() => setShowModal(true)}
            className="group w-full relative overflow-hidden rounded-2xl py-4 font-black text-white text-base flex items-center justify-center gap-2.5 transition-all hover:scale-[1.015] active:scale-[0.985]"
            style={{ background: "linear-gradient(135deg,#7c3aed 0%,#5b21b6 40%,#1d4ed8 100%)", boxShadow: "0 8px 40px rgba(124,58,237,0.45)" }}
          >
            {/* shimmer */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: "linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.12) 50%,transparent 70%)" }} />
            <Crown className="w-5 h-5 text-amber-300" style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.8))" }} />
            <span>Activar Premium — desde $4.99 USD</span>
            <ChevronRight className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* ── Benefits ── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.1))" }} />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.15em]">
              {isPremiumActive ? "Tus beneficios activos" : "Todo lo que incluye"}
            </p>
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg,rgba(255,255,255,0.1),transparent)" }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {BENEFITS.map(({ icon: Icon, color, label, desc }, i) => {
              const gradients = [
                "from-amber-500/15 to-yellow-500/5",
                "from-yellow-400/15 to-amber-400/5",
                "from-emerald-500/15 to-green-500/5",
                "from-blue-500/15 to-indigo-500/5",
                "from-violet-500/15 to-purple-500/5",
                "from-pink-500/15 to-rose-500/5",
                "from-cyan-500/15 to-sky-500/5",
                "from-teal-500/15 to-emerald-500/5",
              ];
              const borders = [
                "border-amber-500/15", "border-yellow-400/15", "border-emerald-500/15", "border-blue-500/15",
                "border-violet-500/15", "border-pink-500/15", "border-cyan-500/15", "border-teal-500/15",
              ];
              const iconBgs = [
                "bg-amber-500/20", "bg-yellow-400/20", "bg-emerald-500/20", "bg-blue-500/20",
                "bg-violet-500/20", "bg-pink-500/20", "bg-cyan-500/20", "bg-teal-500/20",
              ];
              return (
                <div
                  key={label}
                  className={`relative rounded-2xl p-4 flex items-start gap-3.5 bg-gradient-to-br ${gradients[i]} border ${borders[i]} overflow-hidden`}
                >
                  {isPremiumActive && (
                    <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-emerald-400/20 flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBgs[i]}`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground leading-snug">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Comparison table ── */}
        {!isPremiumActive && (
          <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* header */}
            <div className="grid grid-cols-[1fr_auto_auto]" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Comparación</p>
              </div>
              <div className="px-5 py-3 text-center min-w-[80px]">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Gratis</p>
              </div>
              <div className="px-5 py-3 text-center min-w-[90px]" style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.06))", borderLeft: "1px solid rgba(245,158,11,0.15)" }}>
                <div className="flex items-center justify-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">Premium</p>
                </div>
              </div>
            </div>
            {[
              { feat: "Prioridad en solicitudes", free: "❌", prem: "✅" },
              { feat: "Descuento en servicios",   free: "Sin descuento", prem: "5% off" },
              { feat: "Acceso a los mejores",     free: "Básico",  prem: "⚡ Prioritario" },
              { feat: "Velocidad de respuesta",   free: "Normal",  prem: "🚀 Rápida" },
              { feat: "Soporte",                  free: "General", prem: "Directo" },
              { feat: "Badge de confianza",        free: "❌",     prem: "✅" },
            ].map(({ feat, free, prem }, i) => (
              <div key={feat} className={`grid grid-cols-[1fr_auto_auto] ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="px-4 py-3">
                  <span className="text-sm text-foreground/70">{feat}</span>
                </div>
                <div className="px-5 py-3 text-center min-w-[80px]">
                  <span className="text-xs text-muted-foreground/60">{free}</span>
                </div>
                <div className="px-5 py-3 text-center min-w-[90px]" style={{ background: "rgba(245,158,11,0.04)", borderLeft: "1px solid rgba(245,158,11,0.10)" }}>
                  <span className="text-xs font-bold text-amber-400">{prem}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Bottom CTA ── */}
        {!isPremiumActive && !pendingRequest && (
          <button
            onClick={() => setShowModal(true)}
            className="group w-full relative overflow-hidden rounded-2xl py-4 font-bold text-white/80 text-sm flex items-center justify-center gap-2 transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <Crown className="w-4 h-4 text-amber-400" />
            Empezar ahora — cancela cuando quieras
            <ChevronRight className="w-4 h-4 opacity-40 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

      </div>

      {/* ── Payment Modal ── */}
      {showModal && (
        <PaymentModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchRequests();
          }}
        />
      )}
    </AppLayout>
  );
}

// ── Payment Modal ──────────────────────────────────────────────────────────────

function PaymentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [c2pOpen, setC2pOpen] = useState(false);

  const duration = DURATION_OPTIONS.find(d => d.months === selectedMonths)!;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-border"
          style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.15),rgba(79,70,229,0.1))" }}
        >
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-foreground">Activar Premium</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">

          {/* Duration picker */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">¿Por cuánto tiempo?</p>
            <div className="grid grid-cols-2 gap-2">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.months}
                  onClick={() => setSelectedMonths(opt.months)}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    selectedMonths === opt.months
                      ? "border-amber-400/60 bg-amber-400/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  {opt.badge && (
                    <span className="absolute -top-2 -right-1 text-[10px] bg-amber-400 text-black font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                      {opt.badge}
                    </span>
                  )}
                  <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                  <div className="text-xl font-black text-foreground mt-0.5">${opt.price}</div>
                  {opt.months > 1 && (
                    <div className="text-xs text-muted-foreground">${opt.perMonth.toFixed(2)}/mes</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* C2P instant payment — único método disponible */}
          <button
            onClick={() => setC2pOpen(true)}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)", boxShadow: "0 8px 24px rgba(14,165,233,0.3)" }}
          >
            <Zap className="w-4 h-4" /> Pagar al instante con C2P (BDV) — ${duration.price}
          </button>

          <p className="text-center text-[11px] text-muted-foreground">
            Pago seguro al instante con tu cuenta Banco de Venezuela. Activación inmediata.
          </p>

        </div>
      </div>

      {c2pOpen && (
        <C2PModal
          open={c2pOpen}
          onClose={() => setC2pOpen(false)}
          amountUsd={duration.price}
          concept={`Premium Cliente — ${duration.label}`}
          referenceType="client_premium"
          metadata={{ days: selectedMonths * 30 }}
          onSuccess={() => {
            setC2pOpen(false);
            toast({ title: "¡Premium activado!", description: "Tu cuenta Premium ya está activa." });
            onSuccess();
          }}
        />
      )}
    </div>
  );
}
