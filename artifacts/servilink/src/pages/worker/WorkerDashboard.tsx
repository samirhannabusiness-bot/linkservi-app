import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useGetMyWorkerProfile, useListBookings, useUpdateAvailability, useGetWorkerReviews } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { useWorkerVerification } from "@/lib/worker-verification-context";
import { WorkerKYCModal } from "@/components/ui/WorkerKYCModal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StarRating } from "@/components/ui/StarRating";
import { WorkerLevelBadge } from "@/components/ui/WorkerLevelBadge";
import { apiFetch, getRequestOptions, getAuthHeader } from "@/lib/api";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "@/hooks/use-toast";
import { WorkerPremiumModal } from "@/components/ui/WorkerPremiumModal";
import {
  ToggleLeft, ToggleRight, CheckSquare, Star, Clock, TrendingUp,
  AlertCircle, ChevronRight, ChevronDown, ArrowDownToLine, LocateFixed, RefreshCw,
  LockKeyhole, Crown, Rocket, X, Copy, CheckCheck, CalendarDays, MessageSquare,
  BadgeCheck, Shield, Zap, Receipt, ClipboardList, DollarSign, MapPin,
  CheckCircle2, Loader2, ShoppingBag, Store, Pencil, ListOrdered, Briefcase, Utensils,
} from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { useSeo } from "@/lib/seo-helpers";

// ─── PremiumModal is exported from @/components/ui/WorkerPremiumModal ─────────

// Kept as a local alias so existing JSX <PremiumModal> calls work without change
function PremiumModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  return <WorkerPremiumModal onClose={onClose} onSuccess={onSuccess} />;
}



// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function WorkerDashboard() {
  // Canonical points to /professional (the brand-elevated URL).
  // noIndex because this is a private dashboard behind auth.
  useSeo({
    title: "Panel profesional — LinkServi",
    canonical: "https://linkservi.com/professional",
    noIndex: true,
  });
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const opts = getRequestOptions();
  const { data: profile, refetch: refetchProfile } = useGetMyWorkerProfile(opts as any);
  const { data: bookings = [] } = useListBookings({ role: "worker" }, opts as any);
  const workerId = (profile as any)?.id;
  const { data: reviewsData } = useGetWorkerReviews(workerId, { query: { enabled: !!workerId } } as any);
  const myReviews: any[] = Array.isArray(reviewsData) ? reviewsData : (reviewsData as any)?.reviews ?? [];
  const myRatingDist: Record<number, number> = (reviewsData as any)?.distribution ?? {};
  const { rawPosition, permission, loading: geoLoading, request: requestGeo, refresh: refreshGeo } = useGeolocation("worker");
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [premiumRequests, setPremiumRequests] = useState<any[]>([]);
  const [contactStats, setContactStats] = useState<{
    contactsLast7d: number;
    contactsLast30d: number;
    profileViewsLast7d: number;
    isTopProfile: boolean;
    tips: string[];
  } | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumSuccessMsg, setPremiumSuccessMsg] = useState("");
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycModalReason, setKycModalReason] = useState("");
  const [toolsOpen, setToolsOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768
  );
  const kyc = useWorkerVerification();

  const requireVerification = (reason: string, action?: () => void) => {
    if (kyc.isVerified) { action?.(); return; }
    setKycModalReason(reason);
    setKycModalOpen(true);
  };

  useEffect(() => {
    fetch("/api/withdrawals", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPendingWithdrawals(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/premium-requests/me", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPremiumRequests(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/workers/me/contact-stats", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setContactStats(data); })
      .catch(() => {});
  }, []);

  const { mutate: updateAvailability, isPending: togglingAvailability } = useUpdateAvailability({
    ...opts,
    mutation: { onSuccess: () => refetchProfile() },
  } as any);

  const w = profile as any;
  const activeBookings = (bookings as any[]).filter((b: any) => ["pending", "accepted"].includes(b.status));
  const pendingBookings = (bookings as any[]).filter((b: any) => b.status === "pending");
  const inProgressBookings = (bookings as any[]).filter((b: any) => ["accepted", "payment_pending", "in_progress"].includes(b.status));
  const completedBookings = (bookings as any[]).filter((b: any) => b.status === "completed");

  // ── Profile completion ──────────────────────────────────────────────────────
  const profileChecks = [
    !!(w?.name),
    !!(w?.avatarUrl),
    !!(w?.categoryId),
    !!(w?.isVerified),
    !!(w?.bio || w?.description || (w?.completedJobs ?? 0) > 0),
  ];
  const profilePct = w ? Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100) : 0;

  // ── Earnings today ──────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const earnedToday = completedBookings
    .filter((b: any) => b.createdAt?.slice(0, 10) === todayStr)
    .reduce((sum: number, b: any) => sum + ((b.totalAmount ?? 0) * 0.9), 0);
  const totalEarned = w?.earnings ?? 0;

  const availableNet = Math.max(0, (w?.earnings ?? 0) * 0.9);
  const reservedAmount = pendingWithdrawals
    .filter((wd: any) => ["pending", "approved"].includes(wd.status))
    .reduce((sum: number, wd: any) => sum + (wd.amount ?? 0), 0);

  const isPremiumActive = w?.isPremium && w?.premiumUntil && new Date(w.premiumUntil) > new Date();
  const pendingPremiumRequest = premiumRequests.find((r: any) => r.status === "pending");
  const rejectedPremiumRequest = premiumRequests.find((r: any) => r.status === "rejected");

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5 pb-8">

        {/* ── 1. Greeting + Availability ───────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "rgba(56,189,248,0.85)" }}>
              Tu negocio en LinkServi
            </p>
            <h1 className="text-xl font-black text-white truncate">
              Hola, {(w?.name ?? user?.name)?.split(" ")[0] ?? "ahí"} 👋
            </h1>
            {w && (
              <div className="mt-1">
                <WorkerLevelBadge completedJobs={w.completedJobs} rating={w.rating} isVerified={w.isVerified} size="md" />
              </div>
            )}
          </div>
          {w && (
            <button
              onClick={() => updateAvailability({ data: { isAvailable: !w.isAvailable } })}
              disabled={togglingAvailability}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm transition-colors flex-shrink-0 ${w.isAvailable ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {w.isAvailable ? <ToggleRight className="w-5 h-5 flex-shrink-0" /> : <ToggleLeft className="w-5 h-5 flex-shrink-0" />}
              {w.isAvailable ? "Disponible" : "Inactivo"}
            </button>
          )}
        </div>

        {/* ── 2. Bloque de estado dinámico ─────────────────────────────────── */}
        <div className="animate-fade-in-up">
          {pendingBookings.length > 0 ? (() => {
            const oldest = pendingBookings.reduce((a: any, b: any) =>
              new Date(a.createdAt) < new Date(b.createdAt) ? a : b
            );
            const elapsedMin = oldest?.createdAt
              ? Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 60000)
              : null;
            const isUrgent = elapsedMin !== null && elapsedMin >= 10;
            return (
            <div className="relative overflow-hidden rounded-2xl px-5 py-4"
              style={{
                background: isUrgent
                  ? "linear-gradient(135deg,rgba(239,68,68,0.14) 0%,rgba(251,191,36,0.08) 100%)"
                  : "linear-gradient(135deg,rgba(251,191,36,0.10) 0%,rgba(245,158,11,0.05) 100%)",
                border: isUrgent ? "1.5px solid rgba(239,68,68,0.45)" : "1.5px solid rgba(251,191,36,0.35)",
                boxShadow: isUrgent ? "0 0 28px rgba(239,68,68,0.12)" : "0 0 28px rgba(251,191,36,0.10)",
              }}>
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: isUrgent
                  ? "linear-gradient(90deg,transparent,rgba(239,68,68,0.5),transparent)"
                  : "linear-gradient(90deg,transparent,rgba(251,191,36,0.5),transparent)" }} />
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${isUrgent ? "bg-red-400" : "bg-amber-400"}`} />
                <p className="text-base font-black" style={{ color: "rgba(255,255,255,0.95)" }}>
                  {isUrgent ? "⚠ ¡Responde ahora!" : "Nuevas solicitudes disponibles"}
                </p>
                <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full"
                  style={{
                    background: isUrgent ? "rgba(239,68,68,0.18)" : "rgba(251,191,36,0.18)",
                    color: isUrgent ? "#f87171" : "#fbbf24",
                    border: isUrgent ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(251,191,36,0.3)",
                  }}>
                  {pendingBookings.length} {pendingBookings.length === 1 ? "nueva" : "nuevas"}
                </span>
              </div>
              {elapsedMin !== null && (
                <p className="text-xs pl-4 mb-1 font-semibold"
                  style={{ color: isUrgent ? "rgba(248,113,113,0.85)" : "rgba(251,191,36,0.75)" }}>
                  {isUrgent
                    ? `⏱ Lleva ${elapsedMin} min esperando — ¡los clientes eligen al que responde primero!`
                    : `Solicitud recibida hace ${elapsedMin < 1 ? "menos de 1" : elapsedMin} min`}
                </p>
              )}
              <p className="text-xs pl-4 mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                ⚡ Responder en los primeros 5 minutos aumenta tu tasa de cierre
              </p>
              <button
                onClick={() => navigate("/professional/bookings")}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                style={{
                  background: isUrgent ? "rgba(239,68,68,0.18)" : "rgba(251,191,36,0.15)",
                  border: isUrgent ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(251,191,36,0.3)",
                  color: isUrgent ? "#f87171" : "#fbbf24",
                }}>
                <Zap className="w-4 h-4" />
                Ver y responder solicitudes
                <ChevronRight className="w-4 h-4 ml-auto" />
              </button>
            </div>
          );})()
          : inProgressBookings.length > 0 ? (
            <div className="rounded-2xl px-5 py-4"
              style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                <p className="text-base font-black" style={{ color: "rgba(255,255,255,0.92)" }}>
                  Tienes {inProgressBookings.length === 1 ? "un trabajo" : `${inProgressBookings.length} trabajos`} en curso
                </p>
              </div>
              <p className="text-sm pl-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                Sigue avanzando para completarlos
              </p>
            </div>
          ) : (
            <div className="rounded-2xl px-5 py-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-base font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                Aún no tienes trabajos
              </p>
              <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.27)" }}>
                Activa tu perfil para empezar a recibir solicitudes
              </p>
              <button
                onClick={() => navigate("/professional/profile")}
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                style={{ background: "rgba(99,102,241,0.12)", color: "rgba(165,180,252,0.9)", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                Completar perfil →
              </button>
            </div>
          )}
        </div>

        {w && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-xl">
            <p className="text-sm text-white/70 font-medium mb-1">Tu saldo disponible</p>
            <p className="text-5xl font-black tracking-tight">
              ${availableNet.toFixed(2)}
              <span className="text-lg font-normal text-white/60 ml-1">USD</span>
            </p>
            {reservedAmount > 0 && (
              <div className="flex items-center gap-1.5 mt-2 text-white/60 text-sm">
                <LockKeyhole className="w-3.5 h-3.5" />
                ${reservedAmount.toFixed(2)} en proceso de retiro
              </div>
            )}
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => navigate("/professional/withdrawals")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md ${availableNet >= 5 ? "bg-white text-emerald-700 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"}`}
                disabled={availableNet < 5}
              >
                <ArrowDownToLine className="w-4 h-4" />
                {availableNet >= 5 ? "Solicitar retiro" : "Mín. $5 para retirar"}
              </button>
              <button
                onClick={() => navigate("/professional/analytics")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <TrendingUp className="w-4 h-4" /> Ver historial
              </button>
            </div>
          </div>
        )}

        {/* ── 3. CTA Principal ─────────────────────────────────────────────── */}
        <button
          onClick={() => navigate("/professional/bookings")}
          className="btn-action-pulse w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base text-white"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            boxShadow: "0 0 28px rgba(16,185,129,0.35), 0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <Zap className="w-5 h-5" />
          {activeBookings.length === 0 ? "Buscar trabajos" : "Ver trabajos"}
          {pendingBookings.length > 0 && (
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full animate-pulse ml-1"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
              {pendingBookings.length} {pendingBookings.length === 1 ? "nuevo" : "nuevos"}
            </span>
          )}
        </button>
        {pendingBookings.length > 0 && (
          <div className="-mt-2 flex flex-col items-center gap-0.5">
            <p className="text-center text-xs font-semibold" style={{ color: "rgba(251,191,36,0.65)" }}>
              Responder rápido aumenta tus oportunidades
            </p>
            <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Los clientes suelen elegir al primero que responde
            </p>
          </div>
        )}

        {/* ── Acciones rápidas ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Acciones rápidas</h2>
            <span className="text-xs text-muted-foreground">Atajos de la semana</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/professional/profile")}
              className="flex flex-col gap-3 p-4 rounded-3xl border border-border bg-card text-left hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Editar perfil</p>
                <p className="text-xs text-muted-foreground">Actualiza tu presentación y zona</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/professional/services")}
              className="flex flex-col gap-3 p-4 rounded-3xl border border-border bg-card text-left hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <ListOrdered className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Servicios y precios</p>
                <p className="text-xs text-muted-foreground">Controla tu catálogo y tarifas</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/jobs")}
              className="flex flex-col gap-3 p-4 rounded-3xl border border-border bg-card text-left hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-600">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Bolsa de Empleo</p>
                <p className="text-xs text-muted-foreground">Descubre trabajos más rápido</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/mensajes")}
              className="flex flex-col gap-3 p-4 rounded-3xl border border-border bg-card text-left hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Mensajes</p>
                <p className="text-xs text-muted-foreground">Responde clientes y solicitudes</p>
              </div>
            </button>
          </div>
        </div>

        {/* ── Trabajos activos ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-white/60 uppercase tracking-widest">Servicios activos</h2>
            <button onClick={() => navigate("/professional/bookings")} className="text-xs text-primary flex items-center gap-1">
              Ver todos <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {activeBookings.length === 0 ? (
            <div
              className="text-center py-8 rounded-xl"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-sm font-semibold text-white/40">Aquí aparecerán tus trabajos activos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeBookings.slice(0, 3).map((b: any) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/professional/booking/${b.id}`)}
                  className={`w-full text-left p-4 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] ${b.description?.startsWith("[URGENTE]") ? "border-red-800 bg-red-900/10" : "border-white/10 bg-white/[0.03]"}`}
                  style={{ border: b.description?.startsWith("[URGENTE]") ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-black text-white text-sm">{b.categoryName}</p>
                        <StatusBadge status={b.status} />
                        {b.description?.startsWith("[URGENTE]") && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 font-bold border border-red-800/50">⚡ URGENTE</span>
                        )}
                      </div>
                      <p className="text-xs text-white/40">{b.clientName}</p>
                    </div>
                    {b.totalAmount && <p className="text-sm font-black text-white">${b.totalAmount}</p>}
                  </div>
                  <p className="text-xs text-white/25 mt-2">
                    {b.createdAt ? format(new Date(b.createdAt), "dd/MM/yyyy HH:mm") : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Sin disponibilidad warning ────────────────────────────────────── */}
        {w && !w.isAvailable && activeBookings.length === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.05)" }}>
              <ToggleLeft className="w-5 h-5 text-white/40" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/70">Estás marcado como inactivo</p>
              <p className="text-xs text-white/35">Los clientes no pueden verte. Actívate para recibir trabajos.</p>
            </div>
            <button
              onClick={() => updateAvailability({ data: { isAvailable: true } })}
              className="text-xs font-bold text-primary flex-shrink-0"
            >
              Activar
            </button>
          </div>
        )}

        {/* ── KYC banners ──────────────────────────────────────────────────── */}
        {w && !w.isVerified && kyc.status !== "pending" && (
          <button
            onClick={() => navigate("/professional/verification")}
            className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all active:scale-[0.99]"
            style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.35)" }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg">⚠️</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "#fbbf24" }}>Activa tu perfil verificado</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(251,191,36,0.65)" }}>Para empezar a recibir propuestas y ganar dinero</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(251,191,36,0.5)" }} />
          </button>
        )}
        {w && !w.isVerified && kyc.status === "pending" && (
          <div
            className="w-full flex items-center gap-3 p-4 rounded-xl"
            style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.25)" }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg">🔍</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-cyan-400">Verificación en revisión</p>
              <p className="text-xs mt-0.5 text-cyan-500/70">Tu identidad será aprobada en menos de 24 horas</p>
            </div>
          </div>
        )}

        {/* ── 4. Progreso + Ingresos ───────────────────────────────────────── */}
        {w && (
          <div className="grid grid-cols-2 gap-3">
            {/* Progreso del perfil */}
            <div className="rounded-2xl p-4"
              style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: "rgba(165,180,252,0.6)" }}>Perfil</p>
              <div className="flex items-end gap-1.5 mb-2">
                <span className="text-2xl font-black" style={{ color: "rgba(165,180,252,0.9)" }}>
                  {profilePct}%
                </span>
                <span className="text-xs pb-0.5" style={{ color: "rgba(165,180,252,0.45)" }}>completo</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(99,102,241,0.15)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${profilePct}%`, background: "linear-gradient(90deg,#6366f1,#818cf8)" }} />
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: w.isVerified ? "rgba(52,211,153,0.8)" : "rgba(251,191,36,0.7)" }}>
                {w.isVerified ? "✓ Verificado" : "⚠ Sin verificar"}
              </p>
            </div>

            {/* Ingresos */}
            <div className="rounded-2xl p-4"
              style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: "rgba(52,211,153,0.6)" }}>Ingresos</p>
              <div className="space-y-1.5">
                <div>
                  <p className="text-[10px]" style={{ color: "rgba(52,211,153,0.5)" }}>Ganaste hoy</p>
                  <p className="text-lg font-black leading-tight" style={{ color: "rgba(52,211,153,0.9)" }}>
                    ${earnedToday.toFixed(2)}
                  </p>
                </div>
                <div className="w-full h-px" style={{ background: "rgba(52,211,153,0.1)" }} />
                <div>
                  <p className="text-[10px]" style={{ color: "rgba(52,211,153,0.5)" }}>Total ganado</p>
                  <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>
                    ${totalEarned.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4b. Contact stats + profile feedback ─────────────────────────── */}
        {w && contactStats && (
          contactStats.isTopProfile ? (
            /* ── TOP PROFILE celebration card ── */
            <div className="relative overflow-hidden rounded-2xl px-5 py-4"
              style={{
                background: "linear-gradient(135deg,rgba(239,68,68,0.12) 0%,rgba(249,115,22,0.08) 100%)",
                border: "1.5px solid rgba(239,68,68,0.35)",
                boxShadow: "0 0 28px rgba(239,68,68,0.10)",
              }}>
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg,transparent,rgba(239,68,68,0.5),transparent)" }} />
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="text-sm font-black" style={{ color: "rgba(255,255,255,0.92)" }}>
                    ¡Eres uno de los perfiles más contactados!
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(239,68,68,0.7)" }}>
                    Apareces como "Perfil destacado" en los resultados de búsqueda
                  </p>
                </div>
              </div>
              <div className="flex gap-4 mt-2 pl-1">
                <div className="text-center">
                  <p className="text-xl font-black" style={{ color: "#f87171" }}>{contactStats.contactsLast7d}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>contactos 7d</p>
                </div>
                <div className="w-px self-stretch" style={{ background: "rgba(239,68,68,0.2)" }} />
                <div className="text-center">
                  <p className="text-xl font-black" style={{ color: "#fb923c" }}>{contactStats.contactsLast30d}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>contactos 30d</p>
                </div>
                {contactStats.profileViewsLast7d > 0 && (
                  <>
                    <div className="w-px self-stretch" style={{ background: "rgba(239,68,68,0.2)" }} />
                    <div className="text-center">
                      <p className="text-xl font-black" style={{ color: "rgba(248,184,96,0.9)" }}>{contactStats.profileViewsLast7d}</p>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>vistas 7d</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : contactStats.contactsLast7d > 0 ? (
            /* ── Some contacts — show positive feedback + tips ── */
            <div className="rounded-2xl px-5 py-4"
              style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.18)" }}>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 flex-shrink-0" style={{ color: "#22d3ee" }} />
                <p className="text-sm font-black" style={{ color: "rgba(255,255,255,0.88)" }}>
                  Tu perfil está generando {contactStats.contactsLast7d} contacto{contactStats.contactsLast7d !== 1 ? "s" : ""} esta semana
                </p>
              </div>
              {contactStats.tips.length > 0 && (
                <div className="mt-2 space-y-1.5 pl-6">
                  {contactStats.tips.slice(0, 2).map((tip, i) => (
                    <p key={i} className="text-xs font-medium flex items-start gap-1.5"
                      style={{ color: "rgba(6,182,212,0.65)" }}>
                      <span className="mt-0.5 flex-shrink-0">💡</span> {tip}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── Zero contacts — show improvement suggestions ── */
            <div className="rounded-2xl px-5 py-4"
              style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)" }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(165,180,252,0.8)" }} />
                <p className="text-sm font-black" style={{ color: "rgba(255,255,255,0.88)" }}>
                  Mejora tu perfil para recibir más solicitudes
                </p>
              </div>
              {contactStats.tips.length > 0 && (
                <div className="mt-2 space-y-1.5 pl-6">
                  {contactStats.tips.map((tip, i) => (
                    <button
                      key={i}
                      onClick={() => navigate("/professional/profile")}
                      className="w-full text-left text-xs font-medium flex items-start gap-1.5 hover:opacity-80 transition-opacity"
                      style={{ color: "rgba(165,180,252,0.65)" }}>
                      <span className="mt-0.5 flex-shrink-0">→</span> {tip}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => navigate("/professional/profile")}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                style={{ background: "rgba(99,102,241,0.14)", color: "rgba(165,180,252,0.9)", border: "1px solid rgba(99,102,241,0.22)" }}>
                Mejorar mi perfil →
              </button>
            </div>
          )
        )}

        {/* ── 5. BALANCE HERO ──────────────────────────────────────────────── */}
        {w && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-xl">
            <p className="text-sm text-white/70 font-medium mb-1">Tu saldo disponible</p>
            <p className="text-5xl font-black tracking-tight">
              ${availableNet.toFixed(2)}
              <span className="text-lg font-normal text-white/60 ml-1">USD</span>
            </p>
            {reservedAmount > 0 && (
              <div className="flex items-center gap-1.5 mt-2 text-white/60 text-sm">
                <LockKeyhole className="w-3.5 h-3.5" />
                ${reservedAmount.toFixed(2)} en proceso de retiro
              </div>
            )}
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => navigate("/professional/withdrawals")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md ${availableNet >= 5 ? "bg-white text-emerald-700 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"}`}
                disabled={availableNet < 5}
              >
                <ArrowDownToLine className="w-4 h-4" />
                {availableNet >= 5 ? "Solicitar retiro" : "Mín. $5 para retirar"}
              </button>
              <button
                onClick={() => navigate("/professional/analytics")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <TrendingUp className="w-4 h-4" /> Ver historial
              </button>
            </div>
          </div>
        )}

        {/* ── "Ver más" colapsable — perfil, stats, herramientas ───────────── */}
        <div>
          <button
            onClick={() => setToolsOpen(v => !v)}
            className="w-full flex items-center justify-between py-4 px-5 rounded-2xl transition-all duration-200 active:scale-[0.99]"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          >
            <div className="flex items-center gap-2.5 text-left">
              {!toolsOpen && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: "rgba(99,102,241,0.7)",
                    boxShadow: "0 0 6px rgba(99,102,241,0.6)",
                  }}
                />
              )}
              <div>
                <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {toolsOpen ? "Ocultar" : "Herramientas"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Gestiona tu perfil y herramientas
                </p>
              </div>
            </div>
            <ChevronDown
              className="w-4 h-4 flex-shrink-0"
              style={{
                color: "rgba(255,255,255,0.38)",
                transform: toolsOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 280ms cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </button>

          <div
            className="overflow-hidden"
            style={{
              maxHeight: toolsOpen ? "9999px" : "0px",
              opacity: toolsOpen ? 1 : 0,
              transition: "max-height 280ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease-out",
            }}
          >
            <div className="space-y-4 mt-4">


        {/* ── ONBOARDING: Configura tu servicio ───────────────────────────── */}
        {w && !w.categoryId && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.06)" }}
          >
            <div className="flex items-center gap-3 px-5 py-3" style={{ background: "rgba(16,185,129,0.15)" }}>
              <ClipboardList className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-sm font-bold text-emerald-300">Paso 1 · Configura el servicio que ofreces</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-emerald-100/80">
                Para que los clientes puedan encontrarte y contratarte, primero debes definir tu servicio: qué haces, dónde trabajas y cuánto cobras.
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { icon: ClipboardList, label: "Especialidad", desc: "Plomería, electricidad, limpieza…" },
                  { icon: DollarSign, label: "Precio", desc: "Tu tarifa base y por servicio" },
                  { icon: MapPin, label: "Ubicación", desc: "Estado y ciudad donde trabajas" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex flex-col items-center text-center gap-1 p-2 rounded-xl bg-white/5">
                    <Icon className="w-4 h-4 text-emerald-400 mb-0.5" />
                    <span className="font-semibold text-emerald-200">{label}</span>
                    <span className="text-emerald-400/70 leading-tight">{desc}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/professional/profile")}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all"
                style={{ background: "rgba(16,185,129,0.9)", color: "#fff" }}
              >
                Configurar mi servicio ahora →
              </button>
            </div>
          </div>
        )}

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <CheckSquare className="w-4 h-4 text-emerald-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{w?.completedJobs ?? 0}</p>
            <p className="text-xs text-muted-foreground">Completados</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Star className="w-4 h-4 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{w ? `${(w.rating ?? 0).toFixed(1)}` : "—"}</p>
            <p className="text-xs text-muted-foreground">Calificación</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Clock className="w-4 h-4 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{activeBookings.length}</p>
            <p className="text-xs text-muted-foreground">Activas</p>
          </div>
        </div>

        {/* ── GPS ──────────────────────────────────────────────────────────── */}
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
          rawPosition
            ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800"
            : permission === "denied"
              ? "bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-800"
              : "bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800"
        }`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${rawPosition ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`}>
            {geoLoading
              ? <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
              : <LocateFixed className={`w-4 h-4 ${rawPosition ? "text-emerald-600" : "text-blue-500"}`} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${rawPosition ? "text-emerald-700 dark:text-emerald-400" : permission === "denied" ? "text-orange-700 dark:text-orange-400" : "text-blue-700 dark:text-blue-400"}`}>
              {rawPosition ? "📍 Ubicación GPS guardada" : permission === "denied" ? "⚠ Ubicación denegada" : "📍 Activa tu GPS"}
            </p>
            <p className="text-xs text-muted-foreground">
              {rawPosition
                ? "Los clientes cercanos te verán primero"
                : "Activa tu ubicación y empieza a recibir trabajos"}
            </p>
          </div>
          <button
            onClick={rawPosition ? () => refreshGeo({ saveAs: "worker" }) : () => requestGeo({ saveAs: "worker" })}
            disabled={geoLoading}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors disabled:opacity-50 ${rawPosition ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"}`}
          >
            {rawPosition ? "Actualizar" : "Activar"}
          </button>
        </div>

        {/* ── Últimos pagos recibidos ───────────────────────────────────────── */}
        {completedBookings.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Últimos pagos recibidos</p>
              <button onClick={() => navigate("/professional/comprobantes")} className="text-xs text-primary flex items-center gap-1">
                Ver comprobantes <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-border">
              {completedBookings.slice(0, 3).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-muted-foreground truncate max-w-[200px]">{b.categoryName} · {b.clientName}</span>
                  <span className="text-emerald-600 font-bold flex-shrink-0 ml-2">+${((b.totalAmount ?? 0) * 0.9).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Acceso rápido a comprobantes ─────────────────────────────────── */}
        <button
          onClick={() => navigate("/professional/comprobantes")}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-primary/[0.03] transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">Mis Comprobantes</p>
            <p className="text-xs text-muted-foreground">Pagos de clientes y retiros de saldo</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </button>

        {/* ── Premium ───────────────────────────────────────────────────────── */}
        {w && (() => {
          if (isPremiumActive) {
            return (
              <div className="rounded-2xl border border-amber-300 dark:border-amber-700 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500">
                  <Star className="w-4 h-4 text-white fill-white" />
                  <span className="text-sm font-bold text-white">Cuenta Premium Activa</span>
                </div>
                <div className="px-5 py-4 bg-amber-50 dark:bg-amber-900/10 space-y-2">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Apareces primero en las búsquedas y tienes visibilidad en todo tu estado.
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>Vence el {format(new Date(w.premiumUntil), "d 'de' MMMM 'de' yyyy", { locale: es })}</span>
                  </div>
                </div>
              </div>
            );
          }

          if (pendingPremiumRequest) {
            return (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Solicitud Premium en revisión</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Estamos verificando tu pago. Activaremos tu Premium en menos de 24 horas.
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-primary/10 via-amber-500/5 to-transparent">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Rocket className="w-5 h-5 text-amber-500" />
                      <h2 className="text-base font-bold text-foreground">Conviértete en Premium</h2>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Aparece primero, consigue más clientes y aumenta tus ingresos.
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-2xl font-black text-amber-500">$5</p>
                    <p className="text-xs text-muted-foreground">USD/mes</p>
                  </div>
                </div>
              </div>

              {rejectedPremiumRequest && (
                <div className="px-5 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-200 dark:border-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400">
                    Tu solicitud anterior fue rechazada.
                    {rejectedPremiumRequest.adminNotes && ` Motivo: ${rejectedPremiumRequest.adminNotes}`}
                    {" "}Puedes intentarlo de nuevo.
                  </p>
                </div>
              )}

              {premiumSuccessMsg && (
                <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-900/10 border-t border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCheck className="w-4 h-4" /> {premiumSuccessMsg}
                </div>
              )}

              <div className="px-5 pb-5 pt-3 border-t border-border">
                <button
                  onClick={() => setShowPremiumModal(true)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  Activar Premium — $5 USD/mes
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Reseñas ──────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              Mis reseñas
            </h2>
            {myReviews.length > 0 && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full flex items-center gap-1">
                <BadgeCheck className="w-3 h-3" /> {myReviews.length} verificada{myReviews.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {myReviews.length > 0 && w?.rating > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 mb-3">
              <div className="flex items-center gap-4">
                <div className="text-center flex-shrink-0">
                  <p className="text-3xl font-black text-foreground">{(w.rating as number).toFixed(1)}</p>
                  <StarRating rating={w.rating} size="sm" />
                  <p className="text-xs text-muted-foreground mt-0.5">{myReviews.length} {myReviews.length === 1 ? "reseña" : "reseñas"}</p>
                </div>
                <div className="flex-1 space-y-1">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const cnt = myRatingDist[star] ?? 0;
                    const pct = myReviews.length > 0 ? Math.round((cnt / myReviews.length) * 100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-3 text-right flex-shrink-0">{star}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-1.5 rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-5 flex-shrink-0 text-right">{cnt > 0 ? cnt : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {myReviews.length === 0 ? (
            <div className="text-center py-10 bg-card border border-border rounded-xl">
              <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-medium">Aún no tienes reseñas</p>
              <p className="text-xs text-muted-foreground mt-1">Las reseñas aparecerán aquí cuando completes servicios.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myReviews.slice(0, 4).map((r: any) => {
                const dateStr = r.createdAt
                  ? formatDistanceToNowStrict(new Date(r.createdAt), { locale: es, addSuffix: true })
                  : "";
                return (
                  <div key={r.id} className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => navigate(`/professional/client/${r.clientId}`)}
                        className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-primary/10 flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition-all"
                      >
                        {r.clientAvatarUrl ? (
                          <img src={r.clientAvatarUrl} alt={r.clientName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-primary">{r.clientName?.charAt(0).toUpperCase()}</span>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div>
                            <button
                              onClick={() => navigate(`/professional/client/${r.clientId}`)}
                              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                            >
                              {r.clientName}
                            </button>
                            {r.serviceName && (
                              <p className="text-xs text-muted-foreground">{r.serviceName}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                            <StarRating rating={r.rating} />
                            <span className="text-xs text-muted-foreground">{dateStr}</span>
                          </div>
                        </div>
                        {r.comment ? (
                          <p className="text-sm text-muted-foreground leading-relaxed mt-1">"{r.comment}"</p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 italic mt-1">Sin comentario</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

            </div>
          </div>
        </div>


      </div>

      {showPremiumModal && (
        <PremiumModal
          onClose={() => setShowPremiumModal(false)}
          onSuccess={() => {
            setShowPremiumModal(false);
            setPremiumSuccessMsg("¡Solicitud enviada! El equipo activará tu Premium en menos de 24 horas.");
            fetch("/api/premium-requests/me", { headers: getAuthHeader() })
              .then(r => r.ok ? r.json() : [])
              .then(data => setPremiumRequests(Array.isArray(data) ? data : []))
              .catch(() => {});
            setTimeout(() => setPremiumSuccessMsg(""), 8000);
          }}
        />
      )}

      <WorkerKYCModal
        open={kycModalOpen}
        onClose={() => setKycModalOpen(false)}
        status={kyc.status}
        notes={kyc.notes}
        reason={kycModalReason}
      />

    </AppLayout>
  );
}
