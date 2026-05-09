import { useLocation } from "wouter";
import { useState } from "react";
import {
  ArrowRight, CheckCircle, Briefcase, Star, ShieldCheck,
  TrendingUp, Clock, DollarSign, Users, Zap, ChevronRight,
  MessageSquare, Wrench, Sparkles, MapPin, Loader2
} from "lucide-react";

const LS_KEY = "sl_user_city";

async function fetchCityFromCoords(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { "Accept-Language": "es" } }
    );
    const data = await res.json();
    return (
      data?.address?.city ||
      data?.address?.town ||
      data?.address?.municipality ||
      data?.address?.county ||
      null
    );
  } catch {
    return null;
  }
}

function useCityDetection() {
  const [city, setCity] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const activate = async () => {
    if (city || loading || !navigator.geolocation) return;
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 8000, maximumAge: 86_400_000,
        })
      );
      const detected = await fetchCityFromCoords(pos.coords.latitude, pos.coords.longitude);
      if (detected) {
        localStorage.setItem(LS_KEY, detected);
        setCity(detected);
      }
    } catch (err: any) {
      if (err?.code === 1) setDenied(true);
    } finally {
      setLoading(false);
    }
  };

  return { city, loading, denied, activate };
}

const BENEFITS = [
  {
    icon: DollarSign,
    color: "#34d399",
    title: "Pagos protegidos",
    desc: "El dinero se libera cuando completas el trabajo. Sin riesgo de no pago.",
  },
  {
    icon: Users,
    color: "#06B6D4",
    title: "Accede a más clientes",
    desc: "Maturín y alrededores buscan profesionales todos los días en LinkServi.",
  },
  {
    icon: ShieldCheck,
    color: "#818cf8",
    title: "Pago asegurado",
    desc: "El dinero queda retenido hasta que el cliente confirme la entrega. Siempre cobras.",
  },
  {
    icon: Star,
    color: "#f59e0b",
    title: "Construye tu reputación",
    desc: "Calificaciones reales que aumentan tu visibilidad y confianza con nuevos clientes.",
  },
  {
    icon: Clock,
    color: "#f472b6",
    title: "Tú pones tus horarios",
    desc: "Acepta o rechaza solicitudes según tu disponibilidad. Total libertad.",
  },
  {
    icon: Zap,
    color: "#fbbf24",
    title: "Solicitudes urgentes",
    desc: "Clientes que necesitan ayuda ya pagan una tarifa especial por prioridad.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    color: "#06B6D4",
    title: "Crea tu perfil",
    desc: "Agrega fotos, describe tus servicios, tu experiencia y el área donde trabajas.",
  },
  {
    step: "02",
    color: "#818cf8",
    title: "Recibe solicitudes",
    desc: "Los clientes te encuentran, ven tu perfil y te envían solicitudes directamente.",
  },
  {
    step: "03",
    color: "#34d399",
    title: "Acepta y trabaja",
    desc: "Confirma el trabajo, realízalo y cobra. Todo el proceso dentro de la plataforma.",
  },
  {
    step: "04",
    color: "#f59e0b",
    title: "Crece tu negocio",
    desc: "Acumula calificaciones, accede a más clientes y sube tu tarifa con el tiempo.",
  },
];

const TRADES = [
  "Plomero", "Electricista", "Albañil", "Pintor", "Carpintero",
  "Técnico A/C", "Mecánico", "Tutores", "Diseñador", "Programador",
  "Chef", "Chofer", "Cerrajero", "Soldador", "Jardinero",
];

export default function GanarDineroPage() {
  const [, navigate] = useLocation();
  const { city, loading, denied, activate } = useCityDetection();

  return (
    <div className="min-h-screen" style={{ background: "#040c1a" }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(52,211,153,0.12) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-lg mx-auto px-5 pt-14 pb-10 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: "rgba(52,211,153,0.12)",
              border: "1px solid rgba(52,211,153,0.30)",
              color: "#34d399",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Para profesionales en Venezuela
          </div>

          <h1
            className="text-[2.25rem] font-black leading-[1.08] tracking-tight mb-4"
            style={{
              background: "linear-gradient(135deg, #ffffff 40%, rgba(52,211,153,0.9) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Convierte tu oficio en ingresos reales
          </h1>

          {city && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
              style={{
                background: "rgba(6,182,212,0.12)",
                border: "1px solid rgba(6,182,212,0.28)",
                color: "rgba(6,182,212,0.9)",
              }}
            >
              <MapPin className="w-3 h-3" />
              Mostrando resultados en {city}
            </div>
          )}

          <p className="text-base leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
            {city ? (
              <>
                LinkServi conecta a los mejores profesionales con clientes cerca de ti en{" "}
                <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{city}</span>{" "}
                y en toda Venezuela. Sin cuotas mensuales para empezar.
              </>
            ) : (
              <>
                LinkServi conecta a los mejores profesionales con clientes cerca de ti
                y en toda Venezuela. Sin cuotas mensuales para empezar.
              </>
            )}
          </p>

          {!city && (
            <button
              onClick={activate}
              disabled={loading}
              className="inline-flex items-center gap-2 mb-5 transition-all active:scale-[0.97] disabled:opacity-40"
              style={{
                ...(denied
                  ? { color: "rgba(255,255,255,0.38)", fontSize: "0.75rem", fontWeight: 500 }
                  : {
                      background: "rgba(6,182,212,0.10)",
                      border: "1px solid rgba(6,182,212,0.28)",
                      color: "rgba(6,182,212,0.85)",
                      padding: "0.375rem 1rem",
                      borderRadius: "1rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }
                ),
              }}
              title="Activa tu ubicación para ver clientes cerca de ti"
            >
              {loading
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Detectando ciudad...</>
                : <><MapPin className="w-3 h-3" /> Activar ubicación</>
              }
            </button>
          )}

          <button
            onClick={() => navigate("/register?intent=worker")}
            className="w-full max-w-xs mx-auto py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2.5 shadow-2xl transition-all active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
              boxShadow: "0 0 32px rgba(52,211,153,0.35)",
            }}
          >
            Crear cuenta y empezar
            <ArrowRight className="w-5 h-5" />
          </button>

          <p className="text-sm font-semibold mt-3" style={{ color: "rgba(52,211,153,0.75)" }}>
            Empieza a ganar desde $5 por servicio
          </p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
            Puedes recibir tu primera solicitud hoy mismo
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.28)" }}>
            Es gratis · Sin tarjeta requerida
          </p>
        </div>
      </div>

      {/* ── Social proof bar ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-6 flex-wrap px-5 py-4 text-sm"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        {[
          { icon: Users, value: "100+", label: "profesionales activos" },
          { icon: Star, value: "4.8★", label: "calificación promedio" },
          { icon: TrendingUp, value: "USD ref.", label: "pagos en Bs. al cambio del día" },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="w-4 h-4" style={{ color: "rgba(52,211,153,0.7)" }} />
            <strong className="text-white font-bold">{value}</strong>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Trades pill strip ────────────────────────────────────────── */}
      <div className="px-5 py-6 overflow-x-auto">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
          Todos los oficios bienvenidos
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {TRADES.map(t => (
            <span
              key={t}
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.60)",
              }}
            >
              {t}
            </span>
          ))}
          <span
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: "rgba(52,211,153,0.10)",
              border: "1px solid rgba(52,211,153,0.25)",
              color: "#34d399",
            }}
          >
            + muchos más
          </span>
        </div>
      </div>

      {/* ── 2-column: Benefits + How it works ────────────────────────── */}
      <div
        className="px-5 py-8"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

          {/* Left — ¿Por qué usar LinkServi? */}
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <h2
              className="text-lg font-black mb-4"
              style={{ color: "rgba(255,255,255,0.92)" }}
            >
              ¿Por qué usar LinkServi?
            </h2>

            <div className="space-y-3">
              {BENEFITS.map(({ icon: Icon, color, title, desc }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}18`, border: `1px solid ${color}28` }}
                  >
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-white mb-0.5">{title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.42)" }}>
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Así de simple funciona */}
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <h2
              className="text-lg font-black mb-1"
              style={{ color: "rgba(255,255,255,0.92)" }}
            >
              Así de simple funciona
            </h2>
            <p className="text-xs mb-5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Empieza a recibir clientes en menos de 10 minutos
            </p>

            <div className="space-y-4">
              {HOW_IT_WORKS.map(({ step, color, title, desc }, i) => (
                <div key={step} className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
                      style={{ background: `${color}20`, border: `1.5px solid ${color}50`, color }}
                    >
                      {step}
                    </div>
                    {i < HOW_IT_WORKS.length - 1 && (
                      <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.08)" }} />
                    )}
                  </div>
                  <div className="pt-1.5">
                    <p className="font-bold text-sm text-white mb-0.5">{title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Testimonial / trust ──────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-5 pb-8">
        <div
          className="p-5 rounded-2xl"
          style={{
            background: "rgba(52,211,153,0.06)",
            border: "1px solid rgba(52,211,153,0.18)",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(52,211,153,0.15)" }}
            >
              <Wrench className="w-5 h-5" style={{ color: "#34d399" }} />
            </div>
            <div>
              <div className="flex gap-0.5 mb-1.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm leading-relaxed italic" style={{ color: "rgba(255,255,255,0.70)" }}>
                "Desde que entré a LinkServi tengo clientes fijos cada semana. Ya no busco trabajo, el trabajo me busca a mí."
              </p>
              <p className="text-xs mt-2 font-semibold" style={{ color: "rgba(52,211,153,0.8)" }}>
                Carlos M. — Electricista, Maturín
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { icon: CheckCircle, color: "#34d399", text: "Sin cuotas para empezar" },
            { icon: MessageSquare, color: "#06B6D4", text: "Chat directo con clientes" },
            { icon: ShieldCheck, color: "#818cf8", text: "Identidad verificada" },
          ].map(({ icon: Icon, color, text }) => (
            <div
              key={text}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
              <p className="text-[10px] leading-tight font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ───────────────────────────────────────────────── */}
      <div
        className="px-5 py-10 text-center"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="max-w-sm mx-auto">
          <h2
            className="text-2xl font-black mb-2"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            ¿Listo para empezar?
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
            Crea tu perfil gratis y empieza a recibir solicitudes hoy mismo.
          </p>

          <button
            onClick={() => navigate("/register?intent=worker")}
            className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2.5 shadow-2xl transition-all active:scale-[0.97] mb-3"
            style={{
              background: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
              boxShadow: "0 0 32px rgba(52,211,153,0.30)",
            }}
          >
            Crear cuenta y empezar gratis
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={() => navigate("/search")}
            className="w-full py-3 rounded-2xl text-sm font-medium transition-all active:scale-[0.97]"
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            Explorar profesionales primero
          </button>
        </div>
      </div>

    </div>
  );
}
