import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import {
  ShieldCheck, Users, Loader2, CheckCircle2, AlertTriangle, Clock,
  UserCheck, ArrowRight, Lock,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSeo } from "@/lib/seo-helpers";
import { es } from "date-fns/locale";

interface InviteInfo {
  code: string;
  cohostName: string;
  cohostAvatar: string | null;
  expiresAt: string;
  valid: boolean;
}

export function InviteLandingPage({ code }: { code: string }) {
  useSeo({ title: "Invitación — LinkServi", noIndex: true });
  const [, navigate] = useLocation();
  const { user, token } = useAuth();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    apiFetch(`/api/invite/${code}`)
      .then((data: InviteInfo) => { setInviteInfo(data); setLoadError(""); })
      .catch((err: any) => setLoadError(err?.message ?? "Código inválido o expirado"))
      .finally(() => setLoading(false));
  }, [code]);

  const acceptMut = useMutation({
    mutationFn: () => apiFetch(`/api/invite/${code}/accept`, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
    }),
    onSuccess: () => setSuccess(true),
    onError: (err: any) => setLoadError(err?.message ?? "Error al aceptar invitación"),
  });

  const isWorker = user?.role === "worker";

  return (
    <div className="min-h-screen bg-[#040c1a] flex flex-col items-center justify-center p-4">

      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" />
          </svg>
        </div>
        <span className="text-lg font-bold text-white tracking-tight">LinkServi</span>
      </div>

      <div className="w-full max-w-md space-y-5">

        {/* Card */}
        <div className="rounded-2xl bg-white/4 border border-white/10 backdrop-blur-sm overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-600/10 border-b border-white/8 px-6 py-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-cyan-400 tracking-wide uppercase">Invitación de Equipo</p>
              <h1 className="text-base font-bold text-white mt-0.5">Únete al equipo de Co-Host</h1>
            </div>
          </div>

          <div className="px-6 py-6 space-y-5">

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                <p className="text-sm text-white/50">Verificando invitación…</p>
              </div>
            )}

            {/* Error loading invite */}
            {!loading && loadError && !success && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Invitación no válida</p>
                  <p className="text-xs text-white/50 mt-1">{loadError}</p>
                </div>
                <button
                  onClick={() => navigate("/")}
                  className="px-4 py-2 rounded-xl bg-white/8 text-white/80 text-sm font-medium hover:bg-white/12 transition-all"
                >
                  Ir al inicio
                </button>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">¡Te uniste al equipo!</p>
                  <p className="text-sm text-white/60 mt-1">
                    Ahora formas parte del equipo de <span className="text-white font-medium">{inviteInfo?.cohostName}</span>.
                  </p>
                  <p className="text-xs text-white/40 mt-2">
                    Recuerda completar tu verificación KYC para poder recibir servicios.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/professional/verification")}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  <ShieldCheck className="w-4 h-4" /> Completar mi KYC
                </button>
                <button
                  onClick={() => navigate("/professional")}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  Ir a mi panel
                </button>
              </div>
            )}

            {/* Invite info */}
            {!loading && !loadError && inviteInfo && !success && (
              <>
                {/* Cohost info */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-white/8">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-600/30 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {inviteInfo.cohostAvatar ? (
                      <img src={inviteInfo.cohostAvatar} alt={inviteInfo.cohostName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-cyan-300">{(inviteInfo.cohostName ?? "?")[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-white/50">Invitado por</p>
                    <p className="text-sm font-semibold text-white">{inviteInfo.cohostName}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verificado
                  </div>
                </div>

                {/* Expiry */}
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Clock className="w-3.5 h-3.5" />
                  Expira el {format(new Date(inviteInfo.expiresAt), "d 'de' MMMM yyyy", { locale: es })}
                </div>

                {/* What happens */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Al unirte:</p>
                  <div className="space-y-1.5">
                    {[
                      { icon: UserCheck, text: "Tu cuenta de profesional quedará vinculada al Co-Host" },
                      { icon: ShieldCheck, text: "Debes completar tu propia verificación KYC individualmente" },
                      { icon: Users, text: "El Co-Host podrá ver y gestionar tus servicios y reservas" },
                    ].map(({ icon: Icon, text }, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Icon className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-white/60">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Not logged in */}
                {!token && (
                  <div className="space-y-2">
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 flex gap-2 items-center">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-300">Debes iniciar sesión con tu cuenta de profesional para aceptar esta invitación.</p>
                    </div>
                    <button
                      onClick={() => navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)}
                      className="w-full py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all border border-white/10"
                    >
                      Iniciar sesión <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Not a worker */}
                {token && !isWorker && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 flex gap-2 items-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <p className="text-xs text-red-300">Esta invitación es solo para cuentas de tipo <strong>profesional</strong>. Tu cuenta actual es de tipo "{user?.role}".</p>
                  </div>
                )}

                {/* Accept button */}
                {token && isWorker && (
                  <button
                    onClick={() => acceptMut.mutate()}
                    disabled={acceptMut.isPending}
                    className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    {acceptMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Aceptar invitación y unirme al equipo
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/25">
          Si tienes dudas, contacta directamente a tu Co-Host o a soporte.
        </p>
      </div>
    </div>
  );
}
