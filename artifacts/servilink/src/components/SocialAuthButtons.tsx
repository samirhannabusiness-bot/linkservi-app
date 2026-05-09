import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { signInWithGoogle, isFirebaseConfigured } from "@/lib/firebase";
import { Wrench, ShoppingBag, ArrowLeft, Loader2, CheckCircle } from "lucide-react";

const GOOGLE_ICON = (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

async function callSocialLogin(idToken: string, role?: string): Promise<{ user?: any; token?: string; needsRoleSelection?: boolean }> {
  const body: Record<string, string> = { idToken };
  if (role) body.role = role;
  const res = await fetch("/api/auth/social-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const data = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
    const message = data.error ?? data.message ?? `Error al iniciar sesión (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

interface RolePickerProps {
  onSelect: (role: "client" | "worker") => void;
  onBack: () => void;
  loading: boolean;
  error: string;
}

function RolePicker({ onSelect, onBack, loading, error }: RolePickerProps) {
  const [selected, setSelected] = useState<"client" | "worker" | null>(null);

  const handleConfirm = () => {
    if (selected && !loading) onSelect(selected);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">¿Cómo quieres usar LinkServi?</p>
        <p className="text-xs text-muted-foreground mt-1">Elige tu rol para continuar. No podrás cambiarlo después.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setSelected("client")} disabled={loading} className={`relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${selected === "client" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"}`}>
          {selected === "client" && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />}
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selected === "client" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><ShoppingBag className="w-6 h-6" /></div>
          <div><p className="text-sm font-bold text-foreground">Contratar</p><p className="text-xs text-muted-foreground mt-0.5">Busca y contrata profesionales para tu hogar u oficina</p></div>
        </button>
        <button type="button" onClick={() => setSelected("worker")} disabled={loading} className={`relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${selected === "worker" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"}`}>
          {selected === "worker" && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />}
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selected === "worker" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Wrench className="w-6 h-6" /></div>
          <div><p className="text-sm font-bold text-foreground">Trabajar</p><p className="text-xs text-muted-foreground mt-0.5">Ofrece tus servicios y consigue clientes cerca de ti</p></div>
        </button>
      </div>
      {error && <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm text-center">{error}</div>}
      <button type="button" onClick={handleConfirm} disabled={!selected || loading} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">{loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Estamos preparando todo para ti...</> : "Crear mi cuenta"}</button>
      <button type="button" onClick={onBack} disabled={loading} className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><ArrowLeft className="w-3.5 h-3.5" /> Volver e iniciar sesión con otra cuenta</button>
    </div>
  );
}

export function SocialAuthButtons({ compact = false, defaultRole = "client" }: { compact?: boolean; defaultRole?: "client" | "worker" }) {
  const { setAuth } = useAuth();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState<"google" | "role" | null>(null);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    isFirebaseConfigured().then(setConfigured);
  }, []);

  if (configured === null) return null;
  if (!configured) return null;

  const finishLogin = (data: { user: any; token: string }) => {
    setAuth(data.user, data.token);
    const { role, avatarUrl } = data.user;
    if (!avatarUrl && role !== "admin") { navigate("/profile/setup"); return; }
    navigate(role === "admin" ? "/admin" : role === "worker" ? "/professional" : "/client");
  };

  async function handleGoogleSignIn() {
    setError("");
    setLoading("google");
    try {
      const { idToken } = await signInWithGoogle();
      const data = await callSocialLogin(idToken);
      if (data.needsRoleSelection) {
        setLoading("role");
        const roleData = await callSocialLogin(idToken, defaultRole);
        if (!roleData.user || !roleData.token) throw new Error("Respuesta inesperada del servidor");
        finishLogin(roleData as { user: any; token: string });
        return;
      }
      finishLogin(data as { user: any; token: string });
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
        setError(err?.message ?? err?.response?.data?.error ?? "Error al iniciar sesión");
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm text-center">{error}</div>}
      <button type="button" onClick={handleGoogleSignIn} disabled={loading !== null} className={`w-full flex items-center justify-center gap-2.5 rounded-2xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${compact ? "py-2.5 text-sm bg-white/[0.06] text-white/70 hover:bg-white/[0.10] border border-white/10" : "py-3.5 text-sm bg-white/95 text-slate-800 hover:bg-white shadow-lg hover:shadow-xl active:scale-[0.98]"}`}>
        {loading === "google" ? <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${compact ? "border-white/40" : "border-slate-400"}`} /> : GOOGLE_ICON}
        {compact ? "Google" : "Continuar con Google"}
      </button>
      {!compact && <div className="flex items-center gap-3 py-1"><div className="flex-1 h-px bg-white/[0.08]" /><span className="text-xs text-white/30 uppercase tracking-widest font-medium">o continúa con email</span><div className="flex-1 h-px bg-white/[0.08]" /></div>}
    </div>
  );
}
