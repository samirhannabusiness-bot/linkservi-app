import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useSeo } from "@/lib/seo-helpers";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { NeonBackground } from "@/components/ui/NeonBackground";
import { FadeIn } from "@/components/ui/FadeIn";
import { Zap, Eye, EyeOff, Loader2, Fingerprint, AlertCircle, ShoppingBag, Shield, CheckCircle2 } from "lucide-react";
import { isBiometricAvailable, authenticateBiometric } from "@/hooks/useBiometric";

const BIO_HINT_KEY = "sl_bio_hint";

function getRedirectPath(defaultPath: string): string {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
  return defaultPath;
}

function getApiErrorMessage(err: any): string {
  return err?.data?.error ?? err?.data?.message ?? err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? "Error inesperado. Intenta de nuevo.";
}

export function LoginPage() {
  useSeo({ title: "Iniciar sesión — LinkServi", noIndex: true });
  const [, navigate] = useLocation();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  const fromBuy = new URLSearchParams(window.location.search).get("from") === "buy";
  const redirectParam = new URLSearchParams(window.location.search).get("redirect") ?? "";

  const [showBio, setShowBio] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    const hasPriorLogin = !!localStorage.getItem(BIO_HINT_KEY);
    setShowBio(isBiometricAvailable() && hasPriorLogin);
  }, []);

  const { mutate: login, isPending } = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        setAuth(data.user, data.token);
        const { role, avatarUrl } = data.user;
        if (!avatarUrl && !["admin", "cohost", "seller"].includes(role)) { navigate("/profile/setup"); return; }
        const defaultDest = role === "admin" ? "/admin" : role === "cohost" ? "/cohost" : role === "seller" ? "/seller" : role === "worker" ? "/professional" : "/client";
        navigate(getRedirectPath(defaultDest));
      },
      onError: (err: any) => {
        const status: number = err?.status ?? err?.response?.status ?? 0;
        const apiMsg = getApiErrorMessage(err);
        if (status === 429) setError("Demasiados intentos. Por favor espera unos minutos.");
        else if (status === 401) setError(apiMsg || "Correo o contraseña incorrectos.");
        else if (status === 0 || !status) setError("No se pudo conectar. Verifica tu conexión.");
        else setError(apiMsg || "Error inesperado. Intenta de nuevo.");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    login({ data: { email, password } });
  };

  const handleBiometric = async () => {
    setBioLoading(true);
    setError("");
    try {
      const data = await authenticateBiometric();
      localStorage.setItem(BIO_HINT_KEY, "1");
      setAuth(data.user, data.token);
      const { role, avatarUrl } = data.user;
      if (!avatarUrl && !["admin", "cohost", "seller"].includes(role)) { navigate("/profile/setup"); return; }
      const defaultDest = role === "admin" ? "/admin" : role === "cohost" ? "/cohost" : role === "seller" ? "/seller" : role === "worker" ? "/professional" : "/client";
      navigate(getRedirectPath(defaultDest));
    } catch (e: any) {
      const name = e.name ?? "";
      const msg = e.message ?? "";
      if (name === "NotAllowedError" || msg.includes("NotAllowedError")) {
        setError("Ninguna llave biométrica encontrada. Usa tu contraseña e ingresa a Mi Perfil para activar la biometría.");
      } else if (name === "NotSupportedError") {
        setError("Este navegador no soporta biometría.");
      } else {
        setError(msg || "Error de biometría. Usa tu contraseña.");
      }
    } finally {
      setBioLoading(false);
    }
  };

  return (
    <FadeIn className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background">
      <NeonBackground />
      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        {fromBuy && (
          <div className="w-full mb-6 px-5 py-4 rounded-2xl glass border border-cyan-500/30 bg-cyan-500/10 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-cyan-400" />
              </div>
              <p className="text-sm font-bold text-cyan-300">¡Tu compra te espera!</p>
            </div>
            <p className="text-xs font-medium text-white/60 leading-relaxed mb-3">
              Inicia sesión para asegurar tu compra y disfrutar de la <span className="text-cyan-400 font-bold">garantía LinkServi</span>.
            </p>
            <div className="flex flex-col gap-1.5">
              {["Pago seguro en escrow", "Garantía de devolución", "Soporte 24/7"].map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="text-xs text-white/50 font-medium">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-2xl btn-gradient flex items-center justify-center shadow-lg" style={{ boxShadow: "0 0 30px rgba(6,182,212,0.4), 0 4px 15px rgba(6,182,212,0.2)" }}>
            <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-3xl font-black text-white tracking-tight drop-shadow-lg">LinkServi</span>
        </div>
        <div className="w-full rounded-[32px] p-8 sm:p-10 glass-strong border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)]">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white mb-2 tracking-tight">Bienvenido de vuelta</h1>
            <p className="text-sm font-medium text-white/50">Ingresa con tu correo para continuar</p>
          </div>
          {error && (
            <div className="mb-6 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm font-medium">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
            <div>
              <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2 pl-1">Correo electrónico</label>
              <input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-glass w-full px-5 py-4 rounded-2xl font-medium text-base shadow-inner" placeholder="tucorreo@ejemplo.com" autoComplete="username" required />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2 pl-1 pr-1">
                <label className="block text-xs font-bold text-white/60 uppercase tracking-widest">Contraseña</label>
                <Link href="/forgot-password" className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors">¿Olvidaste tu contraseña?</Link>
              </div>
              <div className="relative">
                <input type={showPass ? "text" : "password"} name="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-glass w-full pl-5 pr-14 py-4 rounded-2xl font-medium text-base shadow-inner" placeholder="Tu contraseña" autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all">{showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
              </div>
            </div>
            <button type="submit" disabled={isPending} className="btn-gradient w-full py-5 text-lg font-bold mt-2 flex items-center justify-center gap-3 rounded-[20px] shadow-[0_10px_30px_rgba(6,182,212,0.3)] hover:shadow-[0_15px_40px_rgba(6,182,212,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]">
              {isPending ? <><Loader2 className="w-6 h-6 animate-spin" /> Ingresando...</> : "Ingresar"}
            </button>
          </form>
          <div className="flex items-center gap-4 mt-8 mb-6"><div className="flex-1 h-px bg-white/[0.08]" /><span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold">O accede con</span><div className="flex-1 h-px bg-white/[0.08]" /></div>
          {showBio && <button type="button" onClick={handleBiometric} disabled={bioLoading} className="w-full mb-4 flex items-center justify-center gap-3 py-4 rounded-2xl text-sm font-bold glass border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all duration-200 shadow-lg hover:scale-[1.02] active:scale-[0.98]">{bioLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Verificando...</> : <><Fingerprint className="w-5 h-5" /> Huella / Face ID</>}</button>}
          <SocialAuthButtons compact={false} />
          <p className="mt-8 text-sm font-medium text-white/40 text-center">¿No tienes cuenta? <button onClick={() => { const registerUrl = fromBuy ? `/register?from=buy${redirectParam ? `&redirect=${encodeURIComponent(redirectParam)}` : ""}` : "/register"; navigate(registerUrl); }} className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors ml-1">Regístrate gratis</button></p>
        </div>
      </div>
    </FadeIn>
  );
}
