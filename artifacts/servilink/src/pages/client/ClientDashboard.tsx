import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListBookings } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlobalSearchBar } from "@/components/ui/GlobalSearchBar";
import { RolesActivationCard } from "@/components/onboarding/RolesActivationCard";
import {
  ChevronRight, Clock, Search, RefreshCw,
  Wrench, Package, Briefcase, TrendingUp,
  ShoppingBag, Users, Store,
  Wallet, ListChecks, X, Sparkles, ArrowRight,
  MessageCircle,
} from "lucide-react";
import { getRequestOptions, getAuthHeader, track } from "@/lib/api";

// ─── Module card config ──────────────────────────────────────────────────────
interface ModuleConfig {
  key: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  href: string;
  color: string;
  border: string;
  glow: string;
  iconColor: string;
  grad: string;
  onCustomClick?: () => void;
}

// ─── Team builder panel ───────────────────────────────────────────────────────
type ActivationState = "idle" | "loading" | "success" | "error";

function TeamBuilderPanel({
  onClose,
  onActivate,
  activationState,
}: {
  onClose: () => void;
  onActivate: () => void;
  activationState: ActivationState;
}) {
  const isLoading = activationState === "loading";
  const isSuccess = activationState === "success";
  const isError = activationState === "error";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }}
      onClick={isLoading ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-px w-full" style={{ background: "linear-gradient(90deg,transparent,rgba(99,102,241,0.6) 40%,rgba(99,102,241,0.6) 60%,transparent)" }} />

        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
            {isSuccess ? (
              <span className="text-xl">✅</span>
            ) : (
              <Users className="w-5 h-5 text-indigo-400" />
            )}
          </div>
          {!isLoading && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/[0.08]"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              <X className="w-4 h-4 text-white/40" />
            </button>
          )}
        </div>

        <div className="px-5 pt-4 pb-6 space-y-5">

          {/* ── Success state ── */}
          {isSuccess ? (
            <div className="text-center space-y-2 py-4">
              <h2 className="text-xl font-black text-white">Ya puedes empezar a ganar con tu equipo 🚀</h2>
              <p className="text-sm text-white/50">Redirigiendo a tu panel...</p>
              <div className="flex justify-center pt-2">
                <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
              </div>
            </div>
          ) : isError ? (
            /* ── Error/pending state ── */
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black text-white leading-tight">
                  Tu cuenta está{" "}
                  <span style={{ color: "#fbbf24" }}>siendo activada</span>
                </h2>
                <p className="text-sm text-white/45 mt-2 leading-relaxed">
                  Ya tienes acceso. Entra a tu panel de equipo para empezar.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
              >
                Ir a mi equipo
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* ── Idle state ── */
            <>
              <div>
                <h2 className="text-xl font-black text-white leading-tight">
                  Gana dinero{" "}
                  <span style={{ color: "#818cf8" }}>creando tu equipo</span>
                </h2>
                <p className="text-sm text-white/45 mt-2 leading-relaxed">
                  Invita profesionales, gestiona trabajos y gana comisiones por cada servicio completado.
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  { icon: "👥", text: "Agrega plomeros, electricistas, cualquier oficio" },
                  { icon: "💰", text: "Gana comisión por cada trabajo de tu equipo" },
                  { icon: "📲", text: "Controla todo desde tu panel de administración" },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <span className="text-lg flex-shrink-0">{icon}</span>
                    <p className="text-sm text-white/60">{text}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={onActivate}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#4f46e5,#6366f1)",
                  boxShadow: "0 0 28px rgba(99,102,241,0.35)",
                }}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Activando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Empezar mi equipo
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-[11px] text-white/25 text-center">
                Acceso gratuito — actívate en un clic
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Seller onboarding panel ─────────────────────────────────────────────────
function SellerOnboardingPanel({ onClose, onCta }: { onClose: () => void; onCta: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Shimmer top line */}
        <div className="h-px w-full" style={{ background: "linear-gradient(90deg,transparent,rgba(139,92,246,0.6) 40%,rgba(139,92,246,0.6) 60%,transparent)" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <Store className="w-5 h-5 text-violet-400" />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/[0.08]"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pt-4 pb-6 space-y-5">
          <div>
            <h2 className="text-xl font-black text-white leading-tight">
              Empieza tu negocio{" "}
              <span style={{ color: "#a78bfa" }}>en LinkServi</span>
            </h2>
            <p className="text-sm text-white/45 mt-2 leading-relaxed">
              Vende productos, alquila equipos o genera ingresos desde tu cuenta.
            </p>
          </div>

          {/* Feature bullets */}
          <div className="space-y-2.5">
            {[
              { icon: "🛍️", text: "Crea tu tienda con productos y catálogo" },
              { icon: "📦", text: "Publica equipos en alquiler con depósito" },
              { icon: "💳", text: "Recibe pagos directo a tu saldo LinkServi" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-lg flex-shrink-0">{icon}</span>
                <p className="text-sm text-white/60">{text}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onCta}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
              boxShadow: "0 0 28px rgba(124,58,237,0.35)",
            }}
          >
            <Sparkles className="w-4 h-4" />
            Crear mi negocio
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-[11px] text-white/25 text-center">
            Registro gratuito — actívate en minutos
          </p>
        </div>
      </div>
    </div>
  );
}

export function ClientDashboard() {
  const [, navigate] = useLocation();
  const { user, updateUser, activeMode, setActiveMode, hasDualRole } = useAuth();
  const opts = getRequestOptions();
  const [activating, setActivating] = useState(false);
  const [showSellerOnboarding, setShowSellerOnboarding] = useState(false);
  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [teamActivationState, setTeamActivationState] = useState<ActivationState>("idle");

  // Role detection
  const isSeller = user?.role === "seller" || user?.secondaryRole === "seller";
  const isCoHost = user?.role === "cohost" || user?.secondaryRole === "cohost";

  // Accepted (in-progress) bookings
  const { data: bookings = [] } = useListBookings(
    { role: "client", status: "accepted" },
    opts as any
  );

  // Pending (submitted, awaiting worker) bookings
  const { data: pendingBookings = [] } = useListBookings(
    { role: "client", status: "pending" },
    opts as any
  );

  // Total activity = pending + accepted bookings
  const totalActivity = (bookings as any[]).length + (pendingBookings as any[]).length;
  const hasActivity = totalActivity > 0;

  const firstName = user?.name?.split(" ")[0] ?? "";

  const isWorkerUser =
    user?.role === "worker" || user?.secondaryRole === "worker";

  const handleModeSwitch = async (mode: "primary" | "secondary") => {
    if (mode === activeMode) return;
    setActivating(true);
    try {
      setActiveMode(mode);
      if (mode === "secondary") {
        const workerRole =
          user?.role === "worker" || user?.secondaryRole === "worker";
        navigate(workerRole ? "/professional" : "/cohost");
      } else {
        navigate("/client");
      }
    } finally {
      setActivating(false);
    }
  };

  // ─── Activate team (cohost) mode ────────────────────────────────────────────
  const handleActivateTeam = async () => {
    setTeamActivationState("loading");
    try {
      const headers = { ...getAuthHeader(), "Content-Type": "application/json" } as Record<string, string>;
      const res = await fetch("/api/profile/activate-cohost-mode", { method: "POST", headers });
      if (!res.ok) throw new Error("activation_failed");
      setTeamActivationState("success");
      updateUser({ secondaryRole: "cohost" });
      setTimeout(() => {
        setShowTeamPanel(false);
        setTeamActivationState("idle");
        navigate("/cohost");
      }, 1400);
    } catch {
      setTeamActivationState("error");
    }
  };

  // ─── Primary modules (large cards) ─────────────────────────────────────────
  const PRIMARY_MODULES: ModuleConfig[] = [
    {
      key: "servicios",
      label: "Servicios",
      sublabel: "Encuentra y contrata en minutos",
      icon: Wrench,
      href: "/client/search",
      grad: "from-cyan-500/20 to-blue-600/10",
      color: "rgba(6,182,212,0.25)",
      border: "rgba(6,182,212,0.35)",
      glow: "rgba(6,182,212,0.10)",
      iconColor: "#22d3ee",
    },
    {
      key: "ganar",
      label: "Ganar dinero",
      sublabel: isWorkerUser ? "Tu perfil profesional" : "Ofrece tus servicios",
      icon: TrendingUp,
      href: isWorkerUser ? "/professional" : "/ganar-dinero",
      grad: "from-emerald-500/20 to-teal-600/10",
      color: "rgba(16,185,129,0.25)",
      border: "rgba(16,185,129,0.35)",
      glow: "rgba(16,185,129,0.10)",
      iconColor: "#34d399",
    },
  ];

  // ─── Secondary modules (smaller cards) ─────────────────────────────────────
  const SECONDARY_MODULES: ModuleConfig[] = [
    {
      key: "negocio",
      label: "Mi negocio",
      sublabel: isSeller ? "Gestiona tu tienda" : "Empieza a vender",
      icon: Store,
      href: "/seller",
      grad: "from-violet-500/15 to-purple-700/05",
      color: "rgba(139,92,246,0.15)",
      border: "rgba(139,92,246,0.25)",
      glow: "rgba(139,92,246,0.06)",
      iconColor: "#a78bfa",
      onCustomClick: isSeller ? undefined : () => setShowSellerOnboarding(true),
    },
    {
      key: "alquiler",
      label: "Alquiler",
      sublabel: "Productos y equipos",
      icon: Package,
      href: "/store",
      grad: "from-orange-500/15 to-amber-600/05",
      color: "rgba(249,115,22,0.15)",
      border: "rgba(249,115,22,0.25)",
      glow: "rgba(249,115,22,0.06)",
      iconColor: "#fb923c",
    },
    {
      key: "empleo",
      label: "Empleo",
      sublabel: isWorkerUser ? "Tu hoja de vida" : "Encuentra personal",
      icon: Briefcase,
      href: "/jobs",
      grad: "from-amber-500/15 to-yellow-600/05",
      color: "rgba(245,158,11,0.15)",
      border: "rgba(245,158,11,0.25)",
      glow: "rgba(245,158,11,0.06)",
      iconColor: "#fbbf24",
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 pb-10">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 pt-1">
          <div>
            {hasActivity ? (
              <h1 className="text-2xl font-black text-white leading-tight">
                Tienes {totalActivity}{" "}
                {totalActivity === 1 ? "solicitud" : "solicitudes"}{" "}
                <span className="text-gradient">en progreso</span>
              </h1>
            ) : (
              <>
                <h1 className="text-2xl font-black text-white leading-tight">
                  Encuentra ayuda en minutos
                </h1>
                <p className="text-sm mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
                  Conecta con profesionales cerca de ti de forma rápida y segura
                </p>
              </>
            )}
          </div>

          {/* Mode toggle — dual-role users only */}
          {hasDualRole && (
            <div
              className="flex-shrink-0 flex items-center gap-1 p-1 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                onClick={() => handleModeSwitch("primary")}
                disabled={activating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 disabled:opacity-60"
                style={
                  activeMode === "primary"
                    ? { background: "linear-gradient(135deg,#06b6d4,#3b82f6)", color: "#fff" }
                    : { color: "rgba(255,255,255,0.4)" }
                }
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Cliente
              </button>
              <button
                onClick={() => handleModeSwitch("secondary")}
                disabled={activating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 disabled:opacity-60"
                style={
                  activeMode === "secondary"
                    ? { background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff" }
                    : { color: "rgba(255,255,255,0.4)" }
                }
              >
                {activating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wrench className="w-3.5 h-3.5" />
                )}
                Prestador
              </button>
            </div>
          )}
        </div>

        {/* ── Buscador global ──────────────────────────────────────────── */}
        <GlobalSearchBar />

        {/* ── Activación de roles (solo muestra los no-activados) ───────── */}
        <RolesActivationCard hideActive />

        {/* ── Primary CTA ──────────────────────────────────────────────── */}
        {!hasActivity && (
          <div className="flex justify-center -mb-1">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold"
              style={{
                background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(16,185,129,0.22)",
                color: "#34d399",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Profesionales disponibles ahora
            </span>
          </div>
        )}
        <button
          onClick={() => { if (!hasActivity) track("search_click", { source: "dashboard" }); navigate(hasActivity ? "/client/bookings" : "/client/search"); }}
          className="btn-action-pulse w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base text-white"
          style={{
            background: hasActivity
              ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
              : "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
            boxShadow: hasActivity
              ? "0 0 32px rgba(99,102,241,0.35), 0 4px 16px rgba(0,0,0,0.3)"
              : "0 0 32px rgba(6,182,212,0.35), 0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          {hasActivity ? (
            <ListChecks className="w-5 h-5" />
          ) : (
            <Search className="w-5 h-5" />
          )}
          {hasActivity ? "Ver tus solicitudes" : "Buscar profesional ahora"}
        </button>

        {/* ── Active booking alert ─────────────────────────────────────── */}
        {(bookings as any[]).length > 0 && (
          <button
            onClick={() => navigate("/client/bookings")}
            className="group w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.3)",
            }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(59,130,246,0.15)" }}>
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">
                Servicio en curso
              </p>
              <p className="text-sm font-bold text-white truncate">
                {(bookings as any[])[0].categoryName} —{" "}
                {(bookings as any[])[0].workerName}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-blue-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </button>
        )}

        {/* ── Accesos rápidos ───────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Alquiler + ServiMarket */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/store")}
              className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all hover:scale-[1.03] active:scale-[0.97] bg-gradient-to-br from-orange-500/15 to-amber-600/05"
              style={{ border: "1.5px solid rgba(249,115,22,0.25)", boxShadow: "0 0 20px rgba(249,115,22,0.06)" }}
            >
              <div className="absolute -top-5 -right-5 w-16 h-16 rounded-full blur-2xl pointer-events-none opacity-40" style={{ background: "#fb923c" }} />
              <div className="relative z-10 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.22)" }}>
                  <Package className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <p className="font-black text-white text-sm leading-tight">Alquiler</p>
                  <p className="text-[11px] text-white/45 mt-0.5">Equipos y artículos</p>
                </div>
              </div>
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity text-orange-400" />
            </button>
            <button
              onClick={() => navigate("/store")}
              className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all hover:scale-[1.03] active:scale-[0.97] bg-gradient-to-br from-violet-500/15 to-purple-700/05"
              style={{ border: "1.5px solid rgba(139,92,246,0.25)", boxShadow: "0 0 20px rgba(139,92,246,0.06)" }}
            >
              <div className="absolute -top-5 -right-5 w-16 h-16 rounded-full blur-2xl pointer-events-none opacity-40" style={{ background: "#a78bfa" }} />
              <div className="relative z-10 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)" }}>
                  <ShoppingBag className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="font-black text-white text-sm leading-tight">ServiMarket</p>
                  <p className="text-[11px] text-white/45 mt-0.5">Compras en línea</p>
                </div>
              </div>
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity text-violet-400" />
            </button>
          </div>

          {/* Mis solicitudes + Mensajes */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/client/bookings")}
              className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all hover:scale-[1.03] active:scale-[0.97] bg-gradient-to-br from-blue-500/15 to-indigo-600/10"
              style={{ border: "1.5px solid rgba(99,102,241,0.25)", boxShadow: "0 0 20px rgba(99,102,241,0.06)" }}
            >
              <div className="absolute -top-5 -right-5 w-16 h-16 rounded-full blur-2xl pointer-events-none opacity-40" style={{ background: "#6366f1" }} />
              <div className="relative z-10 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(99,102,241,0.10)", border: "1px solid rgba(99,102,241,0.22)" }}>
                  <ListChecks className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="font-black text-white text-sm leading-tight">Mis solicitudes</p>
                  <p className="text-[11px] text-white/45 mt-0.5">Servicios contratados</p>
                </div>
              </div>
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity text-indigo-400" />
            </button>
            <button
              onClick={() => navigate("/mensajes")}
              className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all hover:scale-[1.03] active:scale-[0.97] bg-gradient-to-br from-cyan-500/15 to-teal-600/05"
              style={{ border: "1.5px solid rgba(6,182,212,0.25)", boxShadow: "0 0 20px rgba(6,182,212,0.06)" }}
            >
              <div className="absolute -top-5 -right-5 w-16 h-16 rounded-full blur-2xl pointer-events-none opacity-40" style={{ background: "#22d3ee" }} />
              <div className="relative z-10 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(6,182,212,0.10)", border: "1px solid rgba(6,182,212,0.22)" }}>
                  <MessageCircle className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="font-black text-white text-sm leading-tight">Mensajes</p>
                  <p className="text-[11px] text-white/45 mt-0.5">Chatea con profesionales</p>
                </div>
              </div>
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity text-cyan-400" />
            </button>
          </div>

          {/* Pagos */}
          <button
            onClick={() => navigate("/client/payments")}
            className="group w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:scale-[1.005] active:scale-[0.99]"
            style={{
              background: "rgba(6,182,212,0.04)",
              border: "1px solid rgba(6,182,212,0.15)",
            }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.18)" }}>
              <Wallet className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Pagos</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Saldo y movimientos</p>
            </div>
            <ChevronRight className="w-4 h-4 text-cyan-400/40 group-hover:text-cyan-400/70 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </button>

        </div>

      </div>

      {/* Team builder panel — shown to non-cohosts who tap "Gana dinero con tu equipo" */}
      {showTeamPanel && (
        <TeamBuilderPanel
          onClose={() => {
            if (teamActivationState === "loading") return;
            setShowTeamPanel(false);
            setTeamActivationState("idle");
            if (teamActivationState === "error") navigate("/cohost");
          }}
          onActivate={handleActivateTeam}
          activationState={teamActivationState}
        />
      )}

      {/* Seller onboarding panel — shown to non-sellers who tap "Mi negocio" */}
      {showSellerOnboarding && (
        <SellerOnboardingPanel
          onClose={() => setShowSellerOnboarding(false)}
          onCta={() => {
            setShowSellerOnboarding(false);
            navigate("/register?intent=seller");
          }}
        />
      )}
    </AppLayout>
  );
}
