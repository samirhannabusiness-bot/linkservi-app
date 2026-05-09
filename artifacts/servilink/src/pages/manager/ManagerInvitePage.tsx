import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Briefcase, Mail, Percent, Clock, Loader2, AlertCircle, CheckCircle,
  Eye, EyeOff,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSeo } from "@/lib/seo-helpers";

interface InviteResolveResp {
  email: string;
  storeName: string;
  storeLogoUrl: string | null;
  inviterName: string;
  commissionPercentage: number;
  permissions: { canChat: boolean; canManageOrders: boolean; canManageProducts: boolean; canManageServices: boolean };
  expiresAt: string;
  hasAccount: boolean;
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: 18,
};
const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12, padding: "12px 14px", fontSize: 14,
  color: "#f1f5f9", outline: "none", width: "100%",
};

export function ManagerInvitePage() {
  useSeo({ title: "Invitación de gestor — LinkServi", noIndex: true });
  const params      = useParams<{ token: string }>();
  const token       = params.token;
  const [, setLocation] = useLocation();
  const { setAuth, setAppMode, user } = useAuth();

  const [name, setName]         = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const { data: invite, isLoading, error: resolveError } = useQuery<InviteResolveResp>({
    queryKey: ["manager-invite", token],
    queryFn: async () => {
      const r = await fetch(`/api/manager-invite/${token}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Invitación no encontrada");
      return j;
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const mode = invite?.hasAccount ? "login" : "register";
      const body: Record<string, unknown> = { mode, password };
      if (mode === "register") body.name = name.trim();
      const r = await fetch(`/api/manager-invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "No se pudo aceptar la invitación");
      return j as { ok: true; storeId: number; token: string };
    },
    onSuccess: async (resp) => {
      // Hydrate user via /api/auth/me using the new cookie/token
      try {
        const me = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${resp.token}` },
        }).then(r => r.json());
        setAuth(me, resp.token);
      } catch { /* ignore — guard will re-fetch */ }
      setAppMode("manager");
      // Use a full navigation so the auth-context re-bootstraps from the
      // freshly-saved localStorage user (which already has roles[]). A soft
      // wouter navigation can race with React's commit of the new auth state
      // and bounce a brand-new manager to /client before roles[] is visible.
      window.location.assign("/manager");
    },
    onError: (e: Error) => setError(e.message),
  });

  // If user is already logged in with the same email, default the password mode
  useEffect(() => {
    if (invite && user && user.email.toLowerCase() === invite.email.toLowerCase()) {
      setName(user.name);
    }
  }, [invite, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: "#38bdf8" }} />
      </div>
    );
  }

  if (resolveError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#040c1a" }}>
        <div style={card} className="max-w-sm text-center">
          <AlertCircle style={{ width: 36, height: 36, margin: "0 auto 12px", color: "#fca5a5" }} />
          <h2 className="text-lg font-bold text-foreground mb-2">Invitación no válida</h2>
          <p className="text-sm text-muted-foreground mb-4">{(resolveError as Error).message}</p>
          <button
            onClick={() => setLocation("/")}
            style={{
              background: "#38bdf8", color: "#0f172a", padding: "10px 20px",
              borderRadius: 12, fontWeight: 700, border: "none", cursor: "pointer",
            }}
          >Volver al inicio</button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  const expDate = new Date(invite.expiresAt);

  return (
    <div className="min-h-screen pb-24" style={{ background: "#040c1a" }}>
      <div className="max-w-md mx-auto px-4 pt-10 space-y-4">
        {/* Hero */}
        <div className="text-center">
          <div style={{
            width: 64, height: 64, borderRadius: 20, margin: "0 auto 14px",
            background: "rgba(56,189,248,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Briefcase style={{ width: 32, height: 32, color: "#38bdf8" }} />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Te invitaron a gestionar un negocio
          </h1>
          <p className="text-sm text-muted-foreground">
            <strong style={{ color: "#f1f5f9" }}>{invite.inviterName}</strong> te invitó a ser gestor en LinkServi
          </p>
        </div>

        {/* Business card */}
        <div style={card}>
          <div className="flex items-center gap-3">
            <img
              src={invite.storeLogoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(invite.storeName)}`}
              alt=""
              style={{ width: 52, height: 52, borderRadius: 14, background: "#1e293b" }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase text-muted-foreground tracking-wider">Negocio</div>
              <div className="text-base font-bold text-foreground truncate">{invite.storeName}</div>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div style={{ ...card, background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.25)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Percent style={{ width: 16, height: 16, color: "#6ee7b7" }} />
            <span className="text-sm font-semibold" style={{ color: "#a7f3d0" }}>
              {invite.commissionPercentage.toFixed(2)}% de comisión por cada venta
            </span>
          </div>
          <div className="space-y-1 mt-2">
            {invite.permissions.canChat &&            <PermLine label="Atender clientes en chat" />}
            {invite.permissions.canManageOrders &&    <PermLine label="Gestionar pedidos" />}
            {invite.permissions.canManageProducts &&  <PermLine label="Editar productos" />}
            {invite.permissions.canManageServices &&  <PermLine label="Editar servicios" />}
          </div>
        </div>

        {/* Expiration */}
        <div className="flex items-center justify-center gap-2 text-xs" style={{ color: "#fbbf24" }}>
          <Clock style={{ width: 12, height: 12 }} />
          Esta invitación expira el {expDate.toLocaleString("es-VE", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
        </div>

        {/* Form */}
        <div style={card}>
          <h2 className="text-base font-bold text-foreground mb-1">
            {invite.hasAccount ? "Inicia sesión para aceptar" : "Crea tu cuenta para empezar"}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            La invitación está dirigida a <strong style={{ color: "#7dd3fc" }}>{invite.email}</strong>
          </p>

          <div className="space-y-3">
            {!invite.hasAccount && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Tu nombre completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ana Pérez"
                  style={inputStyle}
                  data-testid="invite-name-input"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {invite.hasAccount ? "Tu contraseña" : "Crea una contraseña (mín. 8)"}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  data-testid="invite-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                  style={{
                    position: "absolute", top: 0, right: 0, height: "100%", width: 40,
                    background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer",
                  }}
                >
                  {showPwd ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10, padding: "10px 12px", color: "#fca5a5", fontSize: 13,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setError(null);
                if (!invite.hasAccount && name.trim().length < 2) {
                  setError("Ingresa tu nombre completo"); return;
                }
                if (password.length < 8) {
                  setError("La contraseña debe tener al menos 8 caracteres"); return;
                }
                acceptMutation.mutate();
              }}
              disabled={acceptMutation.isPending}
              style={{
                width: "100%",
                background: "linear-gradient(135deg,#06b6d4,#3b82f6)",
                color: "#fff", border: "none",
                borderRadius: 12, padding: "13px 18px", fontSize: 15, fontWeight: 700,
                cursor: acceptMutation.isPending ? "not-allowed" : "pointer",
                opacity: acceptMutation.isPending ? 0.6 : 1,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
              data-testid="accept-invite-btn"
            >
              {acceptMutation.isPending && <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />}
              {invite.hasAccount ? "Iniciar sesión y aceptar" : "Crear cuenta y aceptar"}
            </button>

            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Al aceptar, te conviertes en gestor del negocio. Podrás cambiar entre modo Cliente y Gestor cuando quieras.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PermLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "#cbd5e1" }}>
      <CheckCircle style={{ width: 12, height: 12, color: "#6ee7b7" }} />
      {label}
    </div>
  );
}
