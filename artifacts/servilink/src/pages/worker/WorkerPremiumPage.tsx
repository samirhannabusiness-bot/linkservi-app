import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { WorkerPremiumModal, DURATION_OPTIONS } from "@/components/ui/WorkerPremiumModal";
import { getAuthHeader } from "@/lib/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Crown, ChevronLeft, Zap, Star, TrendingUp, Users,
  CheckCircle2, X, Shield, Clock, Rocket,
} from "lucide-react";

// ── Benefit card data ─────────────────────────────────────────────────────────
const BENEFITS = [
  {
    emoji: "🔥",
    title: "Más visibilidad",
    desc: "Apareces primero en los resultados y recibes más visitas a tu perfil",
    color: "rgba(249,115,22,0.15)",
    border: "rgba(249,115,22,0.25)",
    icon: Rocket,
    iconColor: "rgba(249,115,22,0.9)",
  },
  {
    emoji: "⚡",
    title: "Más contactos",
    desc: "Los clientes ven tu perfil antes que otros profesionales",
    color: "rgba(6,182,212,0.12)",
    border: "rgba(6,182,212,0.25)",
    icon: Zap,
    iconColor: "rgba(6,182,212,0.9)",
  },
  {
    emoji: "⭐",
    title: "Perfil destacado",
    desc: "Tu perfil se muestra como profesional destacado para generar más confianza",
    color: "rgba(251,191,36,0.12)",
    border: "rgba(251,191,36,0.25)",
    icon: Star,
    iconColor: "rgba(251,191,36,0.9)",
  },
  {
    emoji: "📈",
    title: "Más oportunidades",
    desc: "Recibe solicitudes antes que otros y aumenta tus posibilidades de cerrar trabajos",
    color: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.25)",
    icon: TrendingUp,
    iconColor: "rgba(52,211,153,0.9)",
  },
];

// ── Comparison rows ───────────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { label: "Visibilidad en resultados", free: false, premium: true },
  { label: "Prioridad frente a otros",  free: false, premium: true },
  { label: "Perfil destacado",          free: false, premium: true },
  { label: "Más contactos de clientes", free: false, premium: true },
  { label: "Acceso a la plataforma",    free: true,  premium: true },
  { label: "Recibir solicitudes",       free: true,  premium: true },
];

// ─────────────────────────────────────────────────────────────────────────────
export function WorkerPremiumPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [workerData, setWorkerData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/workers/me", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => setWorkerData(d))
      .catch(() => {});
  }, []);

  const isPremiumActive = workerData?.isPremium && workerData?.premiumUntil && new Date(workerData.premiumUntil) > new Date();
  const bestPricePerMonth = Math.min(...DURATION_OPTIONS.map(o => o.perMonth));

  function handleActivate() {
    if (!user) { navigate("/login"); return; }
    setShowModal(true);
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 pb-16 space-y-6">

        {/* ── Back nav ── */}
        <button
          onClick={() => navigate("/professional")}
          className="flex items-center gap-1.5 text-sm pt-4"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <ChevronLeft className="w-4 h-4" />
          Volver al panel
        </button>

        {/* ── Hero ── */}
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{
            background: "linear-gradient(145deg,rgba(245,158,11,0.18) 0%,rgba(124,58,237,0.14) 50%,rgba(15,23,42,0.95) 100%)",
            border: "1px solid rgba(245,158,11,0.25)",
          }}
        >
          {/* Subtle glow */}
          <div
            className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
            style={{ background: "rgba(245,158,11,0.08)", filter: "blur(40px)" }}
          />

          <div className="relative px-6 py-8 text-center space-y-4">
            {/* Crown + badge */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.3),rgba(217,119,6,0.2))", border: "1px solid rgba(245,158,11,0.35)" }}
              >
                <Crown className="w-8 h-8 text-amber-400" fill="currentColor" />
              </div>
              <span
                className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: "rgba(245,158,11,0.15)", color: "rgba(251,191,36,0.9)", border: "1px solid rgba(245,158,11,0.25)" }}
              >
                Premium · Profesionales
              </span>
            </div>

            {/* Headline */}
            <div>
              <h1
                className="text-2xl sm:text-3xl font-black leading-tight"
                style={{ color: "rgba(255,255,255,0.96)" }}
              >
                Gana más clientes.{" "}
                <span style={{ color: "rgba(251,191,36,0.95)" }}>Empieza hoy.</span>
              </h1>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                Destaca tu perfil, recibe más contactos y aumenta tus ingresos desde el primer día.
              </p>
            </div>

            {isPremiumActive ? (
              /* Already premium — show status */
              <div
                className="rounded-2xl px-5 py-4 text-center"
                style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.25)" }}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-emerald-400">Tu cuenta Premium está activa</span>
                </div>
                {workerData?.premiumUntil && (
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Vence el {format(new Date(workerData.premiumUntil), "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Price line */}
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <span className="text-3xl font-black" style={{ color: "rgba(251,191,36,1)" }}>
                    desde ${bestPricePerMonth.toFixed(2)}/mes
                  </span>
                </div>

                {/* CTA */}
                {successMsg ? (
                  <div className="rounded-xl px-4 py-3 flex items-center justify-center gap-2"
                    style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)" }}>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">{successMsg}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleActivate}
                    className="w-full py-4 rounded-2xl font-black text-base text-black transition-all active:scale-95 shadow-lg"
                    style={{
                      background: "linear-gradient(135deg,#f59e0b,#d97706)",
                      boxShadow: "0 8px 32px rgba(245,158,11,0.35)",
                    }}
                  >
                    Activar Premium ahora →
                  </button>
                )}

                {/* Microcopy */}
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Puedes cancelar cuando quieras · Sin compromiso
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Social proof banner ── */}
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-4"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(245,158,11,0.15)" }}
          >
            <Users className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-sm leading-snug" style={{ color: "rgba(255,255,255,0.75)" }}>
            <span className="font-bold" style={{ color: "rgba(251,191,36,0.95)" }}>Los profesionales con Premium</span>{" "}
            reciben hasta 3× más contactos que los perfiles estándar.
          </p>
        </div>

        {/* ── Benefits grid ── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
            Qué incluye Premium
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BENEFITS.map(b => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="rounded-2xl p-4 space-y-2"
                  style={{ background: b.color, border: `1px solid ${b.border}` }}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: b.iconColor }} />
                    <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.90)" }}>{b.title}</p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
                    {b.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Comparison table ── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
            Gratis vs Premium
          </p>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {/* Table header */}
            <div
              className="grid grid-cols-3 text-xs font-black uppercase tracking-wider"
              style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="px-4 py-3" style={{ color: "rgba(255,255,255,0.40)" }}>Función</div>
              <div className="px-3 py-3 text-center" style={{ color: "rgba(255,255,255,0.40)" }}>Gratis</div>
              <div
                className="px-3 py-3 text-center"
                style={{ color: "rgba(251,191,36,0.9)", background: "rgba(245,158,11,0.06)" }}
              >
                Premium ✦
              </div>
            </div>

            {/* Rows */}
            {COMPARE_ROWS.map((row, i) => (
              <div
                key={row.label}
                className="grid grid-cols-3 items-center"
                style={{
                  borderBottom: i < COMPARE_ROWS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}
              >
                <div className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.60)" }}>{row.label}</div>
                <div className="px-3 py-3 flex justify-center">
                  {row.free
                    ? <CheckCircle2 className="w-4 h-4" style={{ color: "rgba(255,255,255,0.35)" }} />
                    : <X className="w-4 h-4" style={{ color: "rgba(255,255,255,0.18)" }} />
                  }
                </div>
                <div
                  className="px-3 py-3 flex justify-center"
                  style={{ background: "rgba(245,158,11,0.04)" }}
                >
                  {row.premium
                    ? <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    : <X className="w-4 h-4" style={{ color: "rgba(255,255,255,0.18)" }} />
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Plan cards preview ── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
            Planes disponibles
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DURATION_OPTIONS.map(opt => (
              <div
                key={opt.months}
                className="relative rounded-2xl p-3 cursor-pointer"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                onClick={handleActivate}
              >
                {opt.badge && (
                  <span
                    className="absolute -top-2 -right-1 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: "#f59e0b", color: "#000" }}
                  >
                    {opt.badge}
                  </span>
                )}
                <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>{opt.label}</div>
                <div className="text-xl font-black mt-0.5" style={{ color: "rgba(255,255,255,0.92)" }}>${opt.price}</div>
                {opt.months > 1 && (
                  <div className="text-[11px]" style={{ color: "rgba(251,191,36,0.75)" }}>${opt.perMonth.toFixed(2)}/mes</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Urgency + final CTA ── */}
        {!isPremiumActive && !successMsg && (
          <div className="space-y-3">
            <p className="text-sm text-center font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>
              Empieza hoy y destaca frente a otros profesionales en tu zona.
            </p>
            <button
              onClick={handleActivate}
              className="w-full py-4 rounded-2xl font-black text-base text-black transition-all active:scale-95"
              style={{
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
                boxShadow: "0 6px 24px rgba(245,158,11,0.30)",
              }}
            >
              Activar Premium ahora →
            </button>
          </div>
        )}

        {/* ── Guarantee ── */}
        <div className="flex items-center justify-center gap-6 py-2">
          {[
            { icon: Shield, text: "Sin contratos" },
            { icon: Clock,  text: "Cancela cuando quieras" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.30)" }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{text}</span>
            </div>
          ))}
        </div>

      </div>

      {/* ── Modal ── */}
      {showModal && (
        <WorkerPremiumModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            setSuccessMsg("Solicitud enviada. Activaremos tu cuenta Premium en menos de 24 h.");
          }}
        />
      )}
    </AppLayout>
  );
}
