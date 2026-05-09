import { useLocation } from "wouter";
import { LogIn, UserPlus } from "lucide-react";
import { track } from "@/lib/api";

export type LoginWallContext = "hire" | "chat" | "jobs" | "store" | "contact" | "default";

const CONTEXT_COPY: Record<LoginWallContext, { title: string; subtitle: string }> = {
  contact: {
    title: "Estás a un paso de recibir ayuda",
    subtitle: "Crea tu cuenta para contactar y recibir respuesta en minutos",
  },
  hire: {
    title: "Estás a un paso de contratar este servicio",
    subtitle: "Crea tu cuenta y continúa en segundos.",
  },
  chat: {
    title: "Estás a un paso de recibir ayuda",
    subtitle: "Crea tu cuenta para contactar y recibir respuesta en minutos",
  },
  jobs: {
    title: "Estás a un paso de ver el perfil completo",
    subtitle: "Crea tu cuenta para acceder a todos los detalles.",
  },
  store: {
    title: "Estás a un paso de completar tu compra",
    subtitle: "Crea tu cuenta para finalizar tu pedido.",
  },
  default: {
    title: "Estás a un paso de continuar",
    subtitle: "Crea tu cuenta para contactar, contratar o acceder a todas las funciones.",
  },
};

interface Props {
  open: boolean;
  onClose: () => void;
  context?: LoginWallContext;
  message?: string;
  returnTo?: string;
}

export function LoginWallModal({ open, onClose, context = "default", message, returnTo }: Props) {
  const [, navigate] = useLocation();
  if (!open) return null;

  const { title, subtitle } = CONTEXT_COPY[context];

  const registerHref = returnTo
    ? `/register?redirect=${encodeURIComponent(returnTo)}`
    : "/register";
  const loginHref = returnTo
    ? `/login?redirect=${encodeURIComponent(returnTo)}`
    : "/login";

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(14px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 text-center"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)" }}
        >
          <LogIn className="w-8 h-8 text-cyan-400" />
        </div>

        <h2 className="text-xl font-black text-white mb-2">{title}</h2>
        <p className="text-sm text-white/50 mb-6 leading-relaxed">
          {message ?? subtitle}
        </p>

        <div className="space-y-2">
          <button
            onClick={() => { track("loginwall_register", { context }); navigate(registerHref); }}
            className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #06B6D4, #0891B2)" }}
          >
            <UserPlus className="w-4 h-4" /> Crear cuenta y continuar
          </button>
          <button
            onClick={() => { track("loginwall_login", { context }); navigate(loginHref); }}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:bg-white/[0.07]"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Ya tengo cuenta
          </button>
        </div>

        <p className="mt-3 text-sm text-white/40 text-center">Solo toma unos segundos</p>

        <button
          onClick={onClose}
          className="mt-3 text-xs text-white/25 hover:text-white/40 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
