import { useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";

// ── Modal de bienvenida por rol (mostrado una vez por dispositivo) ───────────
// Usado para gestores y conductores en su primera visita al panel correspondiente.
// El gating se hace por `localStorage[storageKey]`: si existe, no se muestra.
//
// Diseñado intencionalmente liviano: sin librerías de modal, sin animaciones
// pesadas, no bloquea la UI. El usuario puede cerrar con la X o con el CTA.
interface Props {
  storageKey: string;
  title: string;
  subtitle: string;
  bullets: string[];
  ctaLabel?: string;
  onCTA?: () => void;
}

export function RoleWelcomeModal({ storageKey, title, subtitle, bullets, ctaLabel = "Entendido", onCTA }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch { /* localStorage bloqueado — no mostrar */ }
  }, [storageKey]);

  const close = () => {
    try { localStorage.setItem(storageKey, new Date().toISOString()); } catch { /* noop */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="role-welcome-modal">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1224] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-bold text-white" data-testid="text-welcome-title">{title}</h2>
            <p className="text-sm text-white/60 mt-1">{subtitle}</p>
          </div>
          <button
            onClick={close}
            className="text-white/60 hover:text-white p-1"
            aria-label="Cerrar"
            data-testid="button-welcome-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="space-y-2 my-4">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-white/80">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-sky-400 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={() => { onCTA?.(); close(); }}
          className="w-full bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-[#040c1a] font-bold py-3 rounded-xl mt-2"
          data-testid="button-welcome-cta"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
