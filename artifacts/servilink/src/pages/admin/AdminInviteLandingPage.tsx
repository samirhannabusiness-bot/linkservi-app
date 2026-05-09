import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import {
  ShieldCheck, Loader2, CheckCircle2, AlertTriangle,
  Lock, Eye, EyeOff, Clock, UserCog,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useSeo } from "@/lib/seo-helpers";

interface InviteInfo {
  email:       string;
  adminRole:   string;
  inviterName: string;
  expiresAt:   string;
}

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: "Super Admin",   color: "text-amber-400",   bg: "rgba(245,158,11,0.12)"  },
  soporte:     { label: "Soporte",       color: "text-cyan-400",    bg: "rgba(34,211,238,0.10)"  },
  finanzas:    { label: "Finanzas",      color: "text-emerald-400", bg: "rgba(52,211,153,0.10)"  },
  marketing:   { label: "Marketing",     color: "text-purple-400",  bg: "rgba(168,85,247,0.10)"  },
};

export function AdminInviteLandingPage({ token }: { token: string }) {
  useSeo({ title: "Invitación de colaborador — LinkServi", noIndex: true });
  const [, navigate] = useLocation();

  const [info, setInfo]         = useState<InviteInfo | null>(null);
  const [loadErr, setLoadErr]   = useState("");
  const [loading, setLoading]   = useState(true);

  const [name, setName]         = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState("");
  const [success, setSuccess]       = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch(`/api/admin-invite/${token}`)
      .then((d: InviteInfo) => setInfo(d))
      .catch((e: any) => setLoadErr(e?.message ?? "Invitación inválida o expirada"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErr("");
    if (!name.trim()) { setSubmitErr("Ingresa tu nombre completo"); return; }
    if (password.length < 8) { setSubmitErr("La contraseña debe tener al menos 8 caracteres"); return; }
    if (password !== confirm) { setSubmitErr("Las contraseñas no coinciden"); return; }

    setSubmitting(true);
    try {
      await apiFetch(`/api/admin-invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      setSuccess(true);
    } catch (err: any) {
      setSubmitErr(err?.message ?? "Error al activar la cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  const roleInfo = info ? (ROLE_LABELS[info.adminRole] ?? { label: info.adminRole, color: "text-white", bg: "rgba(255,255,255,0.08)" }) : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "#040c1a" }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
          style={{ background: "linear-gradient(135deg,#22d3ee,#3b82f6)" }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" />
          </svg>
        </div>
        <span className="text-lg font-bold text-white tracking-tight">LinkServi</span>
      </div>

      <div className="w-full max-w-md space-y-4">
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>

          {/* Header */}
          <div className="px-6 py-5 flex items-center gap-3"
            style={{ background: "rgba(34,211,238,0.06)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(34,211,238,0.12)" }}>
              <UserCog className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-cyan-400 tracking-wide uppercase">Panel de Administración</p>
              <h1 className="text-base font-bold text-white mt-0.5">Activar acceso de colaborador</h1>
            </div>
          </div>

          <div className="px-6 py-6 space-y-5">

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Verificando invitación…</p>
              </div>
            )}

            {/* Error */}
            {!loading && loadErr && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.1)" }}>
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Invitación no válida</p>
                  <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>{loadErr}</p>
                </div>
                <button onClick={() => navigate("/")}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)" }}>
                  Ir al inicio
                </button>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(52,211,153,0.1)" }}>
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">¡Cuenta activada!</p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                    Tu acceso como <strong className={roleInfo?.color}>{roleInfo?.label}</strong> ya está listo.
                    Inicia sesión para comenzar.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/login")}
                  className="w-full py-3 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{ background: "linear-gradient(135deg,#22d3ee,#3b82f6)" }}>
                  <ShieldCheck className="w-4 h-4" /> Ir a iniciar sesión
                </button>
              </div>
            )}

            {/* Form */}
            {!loading && !loadErr && info && !success && (
              <>
                {/* Invite summary */}
                <div className="p-3 rounded-xl space-y-2"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Invitado por</p>
                    <p className="text-xs font-semibold text-white">{info.inviterName}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Correo</p>
                    <p className="text-xs font-semibold text-white">{info.email}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Rol</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${roleInfo?.color}`}
                      style={{ background: roleInfo?.bg }}>
                      {roleInfo?.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1"
                    style={{ color: "rgba(255,255,255,0.35)" }}>
                    <Clock className="w-3 h-3" />
                    <p className="text-xs">
                      Expira el {format(new Date(info.expiresAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAccept} className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block"
                      style={{ color: "rgba(255,255,255,0.6)" }}>
                      Nombre completo
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ej: María González"
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-cyan-500/60 transition-all"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold mb-1.5 block"
                      style={{ color: "rgba(255,255,255,0.6)" }}>
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-cyan-500/60 transition-all"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                      />
                      <button type="button" onClick={() => setShowPw(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "rgba(255,255,255,0.35)" }}>
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold mb-1.5 block"
                      style={{ color: "rgba(255,255,255,0.6)" }}>
                      Confirmar contraseña
                    </label>
                    <input
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repite la contraseña"
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-cyan-500/60 transition-all"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  {submitErr && (
                    <div className="px-3 py-2.5 rounded-xl flex gap-2 items-center"
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <p className="text-xs text-red-300">{submitErr}</p>
                    </div>
                  )}

                  <div className="px-3 py-2.5 rounded-xl flex gap-2 items-start"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Tu contraseña es privada y se almacena de forma encriptada.
                      Nadie más puede verla, incluido el equipo de LinkServi.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#22d3ee,#3b82f6)" }}>
                    {submitting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Activando…</>
                      : <><ShieldCheck className="w-4 h-4" /> Activar mi cuenta</>}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          Si tienes dudas, escribe a <span style={{ color: "rgba(255,255,255,0.4)" }}>soporte@linkservi.com</span>
        </p>
      </div>
    </div>
  );
}
