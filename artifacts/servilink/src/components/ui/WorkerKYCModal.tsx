import { useLocation } from "wouter";
import { Shield, Clock, AlertTriangle, X, ArrowRight } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  status: string;
  notes?: string;
  reason?: string;
}

const WHATSAPP_SUPPORT = "https://wa.me/584126978870?text=Hola%2C%20necesito%20ayuda%20con%20mi%20verificaci%C3%B3n%20en%20LinkServi.";

export function WorkerKYCModal({ open, onClose, status, notes, reason }: Props) {
  const [, navigate] = useLocation();

  if (!open) return null;

  const isRejected = status === "rejected";
  const isPending  = status === "pending";

  const cfg = isRejected
    ? { icon: AlertTriangle, iconColor: "#f87171", iconBg: "rgba(248,113,113,0.12)", iconBorder: "rgba(248,113,113,0.35)", glow: "rgba(239,68,68,0.18)", title: "Verificación rechazada", subtitle: "Tu solicitud fue revisada y hay un problema. Corrígela para poder continuar." }
    : isPending
    ? { icon: Clock, iconColor: "#fbbf24", iconBg: "rgba(251,191,36,0.12)", iconBorder: "rgba(251,191,36,0.35)", glow: "rgba(251,191,36,0.12)", title: "Verificación en revisión", subtitle: "¡Ya enviaste tus documentos! El equipo de LinkServi los está revisando. En menos de 24 horas recibirás una respuesta." }
    : { icon: Shield, iconColor: "#06b6d4", iconBg: "rgba(6,182,212,0.10)", iconBorder: "rgba(6,182,212,0.35)", glow: "rgba(6,182,212,0.15)", title: "Verifica tu identidad", subtitle: reason ?? "Para hacer esto necesitas verificar tu identidad. Es un proceso rápido y solo se hace una vez." };

  const IconComp = cfg.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-auto rounded-t-3xl p-6 pb-10 flex flex-col gap-5"
        style={{ background: "#0b1628", border: "1px solid rgba(255,255,255,0.08)", boxShadow: `0 -8px 40px ${cfg.glow}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto -mt-1" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ position: "relative", alignSelf: "flex-end", marginTop: -8, marginBottom: -8 }}
        >
          <X className="w-4 h-4 text-white/40" />
        </button>

        {/* Icon + title */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: cfg.iconBg, border: `1.5px solid ${cfg.iconBorder}`, boxShadow: `0 0 24px ${cfg.glow}` }}
          >
            <IconComp className="w-7 h-7" style={{ color: cfg.iconColor }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{cfg.title}</h2>
            <p className="text-sm text-white/50 mt-1.5 leading-relaxed max-w-xs">{cfg.subtitle}</p>
          </div>
        </div>

        {/* Rejection note */}
        {isRejected && notes && (
          <div
            className="rounded-2xl px-4 py-3 text-left"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}
          >
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Motivo del rechazo</p>
            <p className="text-sm text-red-300/80 leading-relaxed">"{notes}"</p>
          </div>
        )}

        {/* Pending info */}
        {isPending && (
          <div
            className="rounded-2xl px-4 py-3 space-y-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {[
              { icon: "✅", text: "Documentos recibidos y en cola de revisión" },
              { icon: "⏱️", text: "Tiempo estimado: menos de 24 horas" },
              { icon: "🔔", text: "Recibirás una notificación cuando sea aprobado" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-2.5">
                <span className="text-sm leading-none mt-0.5">{icon}</span>
                <span className="text-sm text-white/50">{text}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-3 mt-1">
          {!isPending && (
            <button
              onClick={() => { onClose(); navigate("/professional/verification"); }}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg,#06B6D4,#0891B2)", boxShadow: "0 0 20px rgba(6,182,212,0.35)" }}
            >
              {isRejected ? "🔄 Corregir y reenviar documentos" : "🛡️ Verificar mi identidad ahora"}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <a
            href={WHATSAPP_SUPPORT}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            style={{ background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.3)", color: "#25D366" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Soporte por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
