import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Zap, CheckCircle, AlertCircle, Loader2, Mail, ShieldCheck, RefreshCw } from "lucide-react";
import { useSeo } from "@/lib/seo-helpers";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// VerifyEmailPage
//
// Dos modos de uso:
//
// 1) Confirmación: el usuario llega desde el enlace del correo
//    /verify-email?token=<raw>. Llamamos GET /api/auth/verify-email y
//    mostramos loading → success / already / error.
//
// 2) Onboarding: el usuario llega sin token (desde el modal de bloqueo o el
//    banner). Mostramos "Revisa tu correo" con botón "Reenviar correo" que
//    llama POST /api/auth/verify-email/resend.
//
// Tras confirmación exitosa redirigimos a sessionStorage["sl_verify_return_to"]
// si existe; si no, al dashboard correspondiente.
// ─────────────────────────────────────────────────────────────────────────────

type PageState = "loading" | "success" | "already" | "error" | "idle";

const RETURN_TO_KEY = "sl_verify_return_to";

function nextRouteForUser(role: string | undefined): string {
  switch (role) {
    case "admin":  return "/admin";
    case "worker": return "/professional/dashboard";
    case "cohost": return "/cohost";
    case "seller": return "/seller";
    default:       return "/client";
  }
}

export function VerifyEmailPage() {
  useSeo({ title: "Verifica tu cuenta — LinkServi", noIndex: true });
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const initialState: PageState = token ? "loading" : "idle";
  const [pageState, setPageState] = useState<PageState>(initialState);
  const [errorMsg, setErrorMsg] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Confirmación con token
  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok && data?.ok) {
          setPageState(data.alreadyVerified ? "already" : "success");
        } else {
          setPageState("error");
          setErrorMsg(data?.error ?? "No pudimos verificar tu correo. El enlace puede haber expirado.");
        }
      })
      .catch(() => {
        setPageState("error");
        setErrorMsg("Error de conexión. Intenta de nuevo en unos minutos.");
      });
  }, [token]);

  function handleContinue() {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem(RETURN_TO_KEY);
      sessionStorage.removeItem(RETURN_TO_KEY);
    } catch {}
    if (target && target.startsWith("/") && !target.startsWith("//")) {
      navigate(target);
    } else if (user) {
      navigate(nextRouteForUser(user.role));
    } else {
      navigate("/login");
    }
  }

  async function handleResend() {
    if (resendBusy || resendCooldown > 0) return;
    setResendBusy(true);
    try {
      const r = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        toast({
          title: "📩 Correo reenviado",
          description: "Te enviamos un nuevo enlace. Revisa tu bandeja de entrada (y spam).",
        });
        setResendCooldown(60);
      } else if (r.status === 429 && data?.retryAfter) {
        setResendCooldown(Number(data.retryAfter) || 60);
        toast({
          title: "Espera un momento",
          description: data.error ?? "Acabamos de enviarte un enlace.",
        });
      } else if (r.status === 401) {
        toast({
          title: "Inicia sesión",
          description: "Para reenviar el correo necesitas estar logueado.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "No pudimos reenviar",
          description: data?.error ?? "Intenta de nuevo en unos segundos.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Sin conexión",
        description: "Revisa tu internet e intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "radial-gradient(circle at top, #0b1c33, #040c1a 60%)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-card/80 backdrop-blur p-8 text-center"
        style={{ boxShadow: "0 30px 80px -30px rgba(56,189,248,0.25)" }}
        data-testid="verify-email-card"
      >
        <Link href="/" className="inline-flex items-center gap-2 mb-6 text-foreground hover:opacity-80">
          <Zap className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight">LinkServi</span>
        </Link>

        {pageState === "loading" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-sky-400/10 flex items-center justify-center mb-4">
              <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Verificando tu correo…</h1>
            <p className="text-sm text-muted-foreground">Esto solo toma un momento.</p>
          </>
        )}

        {pageState === "idle" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-sky-400/10 flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-sky-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">📩 Revisa tu correo</h1>
            <p className="text-sm text-muted-foreground mb-2">
              Te enviamos un enlace para verificar tu cuenta.
            </p>
            {user?.email && (
              <p className="text-xs text-white/50 mb-5">
                Correo: <span className="text-white/80 font-medium">{user.email}</span>
              </p>
            )}
            <div className="text-xs text-white/60 bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 mb-5 text-left space-y-1.5">
              <p className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Protegemos tu cuenta y evitamos fraudes.</span>
              </p>
              <p className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>Si no lo encuentras, revisa la carpeta de spam.</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendBusy || resendCooldown > 0 || !user}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="button-resend-verification"
            >
              {resendBusy
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                : resendCooldown > 0
                  ? <>Reenviar en {resendCooldown}s</>
                  : <><RefreshCw className="w-4 h-4" /> Reenviar correo</>}
            </button>
            {!user && (
              <p className="text-xs text-white/50 mt-3">
                Para reenviar, primero <Link href="/login" className="text-primary hover:underline">inicia sesión</Link>.
              </p>
            )}
          </>
        )}

        {pageState === "success" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-400/10 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">¡Cuenta verificada!</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Listo. Tu cuenta ya está activa y puedes seguir donde lo dejaste.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              data-testid="verify-success-cta"
            >
              Continuar
            </button>
          </>
        )}

        {pageState === "already" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-400/10 flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Tu correo ya estaba verificado</h1>
            <p className="text-sm text-muted-foreground mb-6">
              No hace falta hacer nada más. Continuemos.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              data-testid="verify-already-cta"
            >
              Continuar
            </button>
          </>
        )}

        {pageState === "error" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">No pudimos verificar tu correo</h1>
            <p className="text-sm text-muted-foreground mb-4" data-testid="verify-error-msg">
              {errorMsg}
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendBusy || resendCooldown > 0 || !user}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-2"
              data-testid="verify-error-resend"
            >
              {resendBusy
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                : resendCooldown > 0
                  ? <>Reenviar en {resendCooldown}s</>
                  : <><RefreshCw className="w-4 h-4" /> Reenviar correo</>}
            </button>
            <button
              type="button"
              onClick={() => navigate(user ? nextRouteForUser(user.role) : "/login")}
              className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-foreground text-sm font-semibold transition-colors"
              data-testid="verify-error-cta"
            >
              {user ? "Volver" : "Volver a iniciar sesión"}
            </button>
            <p className="text-xs text-muted-foreground mt-4">
              ¿Sigues con problemas? Escríbenos a{" "}
              <a href="mailto:soporte@linkservi.com" className="text-primary hover:underline">
                soporte@linkservi.com
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
