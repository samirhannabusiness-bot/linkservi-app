import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Mail, ShieldCheck, ArrowRight, X } from "lucide-react";

const HIDE_KEY = "sl_verify_card_hidden_until";
const HIDE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const RETURN_TO_KEY = "sl_verify_return_to";

// Rutas donde no tiene sentido mostrar la tarjeta (ya está en el flujo de auth
// o verificación, o son rutas de administración).
const HIDDEN_ROUTES = [
  "/login", "/register", "/forgot-password", "/reset-password",
  "/verify-email", "/auth/login", "/auth/register",
  "/admin",
];

// Tarjeta de acceso fácil al flujo de verificación de correo. A diferencia del
// banner fijo anterior, esta vive *dentro* del panel: scrollea con el contenido,
// estilo glass coherente con el resto de la UI, y se puede ocultar 6h.
export function VerifyEmailCard(): React.ReactElement | null {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      const at = Number(localStorage.getItem(HIDE_KEY) ?? 0);
      return at > 0 && at > Date.now();
    } catch { return false; }
  });

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(HIDE_KEY) ?? 0);
      setHidden(at > 0 && at > Date.now());
    } catch {}
  }, [location]);

  if (!user) return null;
  if (user.role === "admin") return null;
  if (user.emailVerified !== false) return null;
  if (hidden) return null;
  if (HIDDEN_ROUTES.some((r) => location === r || location.startsWith(`${r}/`))) return null;

  function handleVerify() {
    try { sessionStorage.setItem(RETURN_TO_KEY, location + window.location.search); } catch {}
    navigate("/verify-email");
  }

  function handleHide() {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_TTL_MS)); } catch {}
    setHidden(true);
  }

  return (
    <div
      className="relative mb-4 rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(56,189,248,0.10), rgba(99,102,241,0.10))",
        border: "1px solid rgba(56,189,248,0.30)",
        backdropFilter: "blur(10px)",
      }}
      data-testid="verify-email-card"
    >
      <button
        type="button"
        onClick={handleHide}
        aria-label="Ocultar"
        className="absolute top-2 right-2 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        data-testid="verify-card-hide"
      >
        <X className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={handleVerify}
        className="w-full text-left flex items-center gap-3 p-4 pr-12"
        data-testid="verify-card-cta"
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(56,189,248,0.18)" }}
        >
          <Mail className="w-5 h-5 text-sky-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground text-sm">Verifica tu correo</h3>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: "rgba(56,189,248,0.18)", color: "rgb(125,211,252)" }}
            >
              Pendiente
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Necesario para pagos y publicaciones — toma 10 segundos
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-sky-300 shrink-0" />
      </button>
    </div>
  );
}
