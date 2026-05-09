import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useSeo } from "@/lib/seo-helpers";
import { NeonBackground } from "@/components/ui/NeonBackground";
import { FadeIn } from "@/components/ui/FadeIn";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { Zap, Loader2, Eye, EyeOff, Gift, Shield, AlertCircle, Wrench, ShoppingBag } from "lucide-react";

type RoleId = "client" | "worker";

function getRedirectPath(defaultPath: string): string {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
  return defaultPath;
}

function getRoleFromParams(): RoleId {
  const params = new URLSearchParams(window.location.search);
  const intent = params.get("intent");
  const roleParam = params.get("role");
  if (intent === "worker" || roleParam === "worker") return "worker";
  return "client";
}

function getApiErrorMessage(err: any): string {
  return err?.data?.error ?? err?.response?.data?.error ?? err?.message ?? "Error al crear la cuenta. Intenta de nuevo.";
}

export function RegisterPage() {
  useSeo({ title: "Crear cuenta — LinkServi", noIndex: true });
  const [, navigate] = useLocation();
  const { setAuth } = useAuth();
  const role: RoleId = getRoleFromParams();
  const isWorker = role === "worker";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ref = p.get("ref");
    if (ref) setReferralCode(ref.toUpperCase());
  }, []);

  const { mutate: register, isPending } = useRegister({
    mutation: {
      onSuccess: (data: any) => {
        setAuth(data.user, data.token);
        const userRole = data.user?.role;
        if (userRole === "worker") {
          navigate(getRedirectPath("/professional"));
          return;
        }
        navigate(getRedirectPath("/profile/setup"));
      },
      onError: (err: any) => {
        const msg = getApiErrorMessage(err);
        if (msg.toLowerCase().includes("already")) setError("Este correo ya tiene una cuenta. ¿Quieres ingresar?");
        else setError(msg);
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setError("");
    const tempName = email.split("@")[0].replace(/[._\-+]/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim() || "Usuario";
    register({ data: { name: tempName, email: email.toLowerCase().trim(), password, role, ...(referralCode ? { referralCode } : {}) } });
  };

  return (
    <FadeIn className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
      <NeonBackground />
      <div className="w-full max-w-md relative z-10 py-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl btn-gradient flex items-center justify-center shadow-lg" style={{ boxShadow: "0 0 30px rgba(6,182,212,0.4)" }}>
              <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-3xl font-black text-white tracking-tight drop-shadow-lg">LinkServi</span>
          </div>
          <p className="text-white/50 text-sm font-medium tracking-wide uppercase">{isWorker ? "Empieza a ganar dinero hoy" : "Encuentra ayuda en minutos"}</p>
        </div>
        {referralCode && (
          <div className="flex items-center gap-4 px-5 py-4 rounded-2xl glass border border-amber-500/30 bg-amber-500/10 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0"><Gift className="w-5 h-5 text-amber-400" /></div>
            <div>
              <p className="text-sm font-bold text-amber-400">Código de invitación activo</p>
              <p className="text-xs font-medium text-white/60 mt-0.5"><span className="font-mono font-bold text-amber-300 mr-1">{referralCode}</span>Beneficios especiales aplicados</p>
            </div>
          </div>
        )}
        <div className="rounded-[32px] overflow-hidden glass-strong border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)]">
          <div className="p-8 space-y-6">
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl" style={{ background: isWorker ? "rgba(129,140,248,0.08)" : "rgba(6,182,212,0.08)", border: `1px solid ${isWorker ? "rgba(129,140,248,0.2)" : "rgba(6,182,212,0.2)"}` }}>
              {isWorker ? <Wrench className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-400" /> : <ShoppingBag className="w-4 h-4 flex-shrink-0 mt-0.5 text-cyan-400" />}
              <div>
                <p className="text-sm font-bold leading-snug" style={{ color: isWorker ? "#818CF8" : "#06B6D4" }}>{isWorker ? "Estás a un paso de empezar a ganar dinero" : "Estás a un paso de encontrar ayuda"}</p>
                <p className="text-xs text-white/40 mt-0.5">{isWorker ? "Recibe solicitudes y trabaja cuando quieras" : "Crea tu cuenta y conecta en minutos"}</p>
              </div>
            </div>
            <SocialAuthButtons compact={false} defaultRole={role} />
            {error && (
              <div className="px-5 py-4 rounded-2xl glass border border-red-500/30 bg-red-500/10 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm"><AlertCircle className="w-5 h-5" /><span>{error}</span></div>
                {error.includes("ingresar") && <button type="button" onClick={() => navigate("/login")} className="self-start text-sm font-bold text-cyan-400 hover:text-cyan-300">Ir a Ingresar →</button>}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2 pl-1">Correo electrónico</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-glass w-full px-5 py-4 rounded-2xl font-medium text-base shadow-inner" placeholder="correo@email.com" autoComplete="email" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/60 uppercase tracking-widest mb-2 pl-1">Contraseña</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="input-glass w-full pl-5 pr-14 py-4 rounded-2xl font-medium text-base shadow-inner" placeholder="Mínimo 6 caracteres" autoComplete="new-password" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                </div>
              </div>
              <button type="submit" disabled={isPending} className="btn-gradient w-full py-5 text-lg font-bold mt-2 flex items-center justify-center gap-3 rounded-[20px] shadow-[0_10px_30px_rgba(6,182,212,0.3)] hover:shadow-[0_15px_40px_rgba(6,182,212,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]">{isPending ? <><Loader2 className="w-6 h-6 animate-spin" /> Estamos preparando todo para ti...</> : "Crear cuenta y continuar"}</button>
            </form>
          </div>
          <div className="px-8 py-5 border-t border-white/5 bg-black/20 flex items-center justify-between">
            <p className="text-sm font-medium text-white/40">¿Ya tienes cuenta? <button onClick={() => navigate("/login")} className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors ml-1">Ingresar</button></p>
            <div className="flex items-center gap-2 text-xs font-bold text-white/30 uppercase tracking-widest"><Shield className="w-4 h-4" /> SSL</div>
          </div>
        </div>
        <p className="text-center text-xs font-medium text-white/30 px-6">Al registrarte aceptas los <span className="underline cursor-pointer text-white/50 hover:text-white transition-colors">Términos de Servicio</span> y <span className="underline cursor-pointer text-white/50 hover:text-white transition-colors">Política de Privacidad</span></p>
      </div>
    </FadeIn>
  );
}
