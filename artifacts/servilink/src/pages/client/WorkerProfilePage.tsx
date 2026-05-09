import { useLocation, useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useGetWorker, useGetWorkerReviews } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { FavoriteButton } from "@/components/ui/FavoriteButton";
import { StarRating } from "@/components/ui/StarRating";
import { WorkerLevelBadge } from "@/components/ui/WorkerLevelBadge";
import { ClientKYCModal } from "@/components/ui/ClientKYCModal";
import { useVerificationGate } from "@/hooks/useVerificationGate";
import {
  Shield, MapPin, ChevronLeft, ChevronRight, Star, Clock,
  AlertTriangle, CheckCircle, Briefcase, Timer, TrendingUp,
  BadgeCheck, ImageIcon, DollarSign, MessageSquare,
  Loader2, X, CreditCard, CalendarDays, Search, Users, ChevronDown,
  ChevronUp, Zap,
} from "lucide-react";
import { useGeolocation, haversineDistance } from "@/hooks/useGeolocation";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { apiFetch, getAuthHeader, track } from "@/lib/api";
import { LoginWallModal } from "@/components/ui/LoginWallModal";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";

// ─── AlsoAvailablePanel ───────────────────────────────────────────────────────
function AlsoAvailablePanel({ currentWorkerId, categoryId }: { currentWorkerId: number; categoryId: number | null }) {
  const [, navigate] = useLocation();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!categoryId) return;
    fetch(`/api/workers?categoryId=${categoryId}`, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const all = (Array.isArray(data) ? data : []).filter(w => w.id !== currentWorkerId);
        const availableNow = all.filter(w => w.isAvailable);
        const recentFallback = all.filter(w => !w.isAvailable && (w.hasRecentContact || w.hasRecentActivity24h));
        const pool = availableNow.length >= 2 ? availableNow : [...availableNow, ...recentFallback];
        pool.sort((a, b) => {
          if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
          if (a.hasRecentContact !== b.hasRecentContact) return a.hasRecentContact ? -1 : 1;
          if (a.hasRecentActivity24h !== b.hasRecentActivity24h) return a.hasRecentActivity24h ? -1 : 1;
          const aMin = a.avgResponseMinutes ?? 9999;
          const bMin = b.avgResponseMinutes ?? 9999;
          if (aMin !== bMin) return aMin - bMin;
          return (b.completedJobs ?? 0) - (a.completedJobs ?? 0);
        });
        setSuggestions(pool.slice(0, 3));
      })
      .catch(() => {});
  }, [currentWorkerId, categoryId]);

  if (suggestions.length === 0) return null;

  const remaining = suggestions.length - sentIds.size;
  const totalJobs = suggestions.reduce((s, w) => s + (w.completedJobs ?? 0), 0);

  function handleContact(w: any) {
    if (sentIds.has(w.id)) return;
    track("contact_click", { workerId: w.id, source: "also_available" });
    setSentIds(prev => new Set(prev).add(w.id));
    navigate(`/client/worker/${w.id}`);
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.18)" }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(99,102,241,0.10)" }}>
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(165,180,252,0.8)" }} />
            <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.88)" }}>
              Otros profesionales disponibles ahora
            </p>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums"
            style={{
              background: remaining > 0 ? "rgba(99,102,241,0.18)" : "rgba(52,211,153,0.12)",
              color: remaining > 0 ? "rgba(165,180,252,0.95)" : "rgba(52,211,153,0.9)",
              border: remaining > 0 ? "1px solid rgba(99,102,241,0.25)" : "1px solid rgba(52,211,153,0.25)",
            }}>
            {remaining > 0 ? `${remaining} disponible${remaining !== 1 ? "s" : ""}` : "Todos contactados"}
          </span>
        </div>
        {totalJobs > 0 && (
          <p className="text-xs pl-6" style={{ color: "rgba(165,180,252,0.45)" }}>
            +{totalJobs} trabajos completados por estos profesionales
          </p>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: "rgba(99,102,241,0.08)" }}>
        {suggestions.map((w, idx) => {
          const sent = sentIds.has(w.id);
          const isBest = idx === 0 && (w.hasRecentContact || w.hasRecentActivity24h || w.avgResponseMinutes != null);
          return (
            <div key={w.id} className="flex items-center gap-3 px-4 py-3"
              style={isBest ? { background: "rgba(99,102,241,0.055)" } : undefined}>
              <div className="relative flex-shrink-0">
                {w.avatarUrl
                  ? <img src={w.avatarUrl} className="w-10 h-10 rounded-full object-cover" />
                  : <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                      style={{ background: "rgba(99,102,241,0.2)", color: "rgba(165,180,252,0.9)" }}>
                      {w.name?.charAt(0)?.toUpperCase()}
                    </div>
                }
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                  style={{
                    background: w.isAvailable ? "rgba(52,211,153,1)" : w.hasRecentContact ? "rgba(251,146,60,1)" : "rgba(251,191,36,1)",
                    borderColor: "rgba(15,23,42,1)",
                  }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.90)" }}>{w.name}</p>
                  {isBest && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: "rgba(251,191,36,0.12)", color: "rgba(251,191,36,0.9)", border: "1px solid rgba(251,191,36,0.2)" }}>
                      Mejor opción ahora
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {w.hasRecentContact && <span className="text-[11px] font-semibold" style={{ color: "rgba(251,146,60,0.95)" }}>🔥 Respondiendo ahora</span>}
                  {!w.hasRecentContact && w.hasRecentActivity24h && <span className="text-[11px] font-semibold" style={{ color: "rgba(251,191,36,0.85)" }}>🟡 Activo hoy</span>}
                  {!w.hasRecentContact && !w.hasRecentActivity24h && w.avgResponseMinutes != null && (
                    <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "rgba(52,211,153,0.85)" }}>
                      <Timer className="w-2.5 h-2.5" />Responde en ~{w.avgResponseMinutes} min
                    </span>
                  )}
                  {w.rating != null && (
                    <span className="flex items-center gap-0.5 text-[11px]" style={{ color: "rgba(251,191,36,0.75)" }}>
                      <Star className="w-3 h-3 fill-current" />{Number(w.rating).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <button
                disabled={sent}
                onClick={() => handleContact(w)}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95 disabled:cursor-default"
                style={sent
                  ? { background: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.8)", border: "1px solid rgba(52,211,153,0.25)" }
                  : { background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.95)", border: "1px solid rgba(99,102,241,0.3)" }
                }>
                {sent ? "Enviado ✓" : <><MessageSquare className="w-3.5 h-3.5" />Contactar</>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-2.5" style={{ borderTop: "1px solid rgba(99,102,241,0.08)" }}>
        <p className="text-[11px] text-center font-medium" style={{ color: "rgba(165,180,252,0.45)" }}>
          ⚡ Los primeros en responder suelen ser elegidos
        </p>
      </div>
    </div>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────
function ReviewCard({ review }: { review: any }) {
  const dateStr = review.createdAt
    ? formatDistanceToNowStrict(new Date(review.createdAt), { locale: es, addSuffix: true })
    : "";
  return (
    <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.15)" }}>
          {review.clientAvatarUrl
            ? <img src={review.clientAvatarUrl} alt={review.clientName} className="w-full h-full object-cover" />
            : <span className="text-xs font-bold" style={{ color: "rgba(165,180,252,0.9)" }}>{review.clientName?.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.90)" }}>{review.clientName}</span>
                {review.verified && (
                  <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: "rgba(52,211,153,0.85)" }}>
                    <BadgeCheck className="w-3 h-3" /> Verificado
                  </span>
                )}
              </div>
              {review.serviceName && <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{review.serviceName}</span>}
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <StarRating rating={review.rating} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>{dateStr}</span>
            </div>
          </div>
          {review.comment && (
            <p className="text-sm leading-relaxed mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>"{review.comment}"</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Format response time ─────────────────────────────────────────────────────
function formatResponseTime(minutes: number | null): string {
  if (minutes === null) return "N/A";
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.round(minutes / 60)} h`;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function WorkerProfilePage() {
  const { workerId } = useParams<{ workerId: string }>();
  const [, navigate] = useLocation();
  const id = Number(workerId);
  const { position } = useGeolocation();
  const { token } = useAuth();

  const { data: worker, isLoading } = useGetWorker(id, { query: { enabled: !!id } } as any);
  const { data: reviewsData } = useGetWorkerReviews(id, { query: { enabled: !!id } } as any);

  const { gateOpen, gateProps, runWithGate } = useVerificationGate();

  const [workerServices, setWorkerServices] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [confirmService, setConfirmService] = useState<any | null>(null);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [creatingInquiry, setCreatingInquiry] = useState(false);
  const [showLoginWall, setShowLoginWall] = useState(false);
  const [loginWallContext, setLoginWallContext] = useState<"hire" | "chat" | "contact">("contact");
  const [bookingConfirmed, setBookingConfirmed] = useState<"service" | "inquiry" | null>(null);
  const [confirmedNavTarget, setConfirmedNavTarget] = useState<string>("/client/bookings");
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lbSwipeStartX = useRef(0);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/workers/${id}/services`)
      .then(data => {
        if (!Array.isArray(data)) return;
        // Sort cheapest first so the most accessible option is pre-selected
        const sorted = [...data].sort((a, b) => (a.basePrice ?? 0) - (b.basePrice ?? 0));
        setWorkerServices(sorted);
        if (sorted.length > 0) setSelectedService(sorted[0]);
      })
      .catch(() => {});
    track("profile_view", { workerId: Number(id) });
  }, [id]);

  const reviews: any[] = Array.isArray(reviewsData) ? reviewsData : (reviewsData as any)?.reviews ?? [];
  const totalReviews: number = (reviewsData as any)?.total ?? reviews.length;
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 2);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-4 pb-28">
          <div className="h-40 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-24 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      </AppLayout>
    );
  }

  if (!worker) {
    return (
      <AppLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Profesional no encontrado.</p>
          <button onClick={() => navigate(token ? "/client/search" : "/search")} className="mt-4 text-primary text-sm">
            Volver a la búsqueda
          </button>
        </div>
      </AppLayout>
    );
  }

  const w = worker as any;
  const distance = position && w?.lat && w?.lng
    ? haversineDistance(position.lat, position.lng, w.lat, w.lng).toFixed(1)
    : null;
  const basePrice = w?.basePrice ?? w?.hourlyRate ?? 10;

  // Active price = selected service price or base price
  const activePrice = selectedService?.basePrice ?? basePrice;

  const completionRate = w.completedJobs > 0 ? Math.min(99, Math.round((w.completedJobs / (w.completedJobs + 1)) * 100)) : 0;
  const trustScore = Math.round(
    (w.isVerified ? 30 : 0) +
    Math.min(40, w.completedJobs * 2) +
    Math.min(30, (w.rating ?? 0) * 6)
  );

  async function handleDirectBook(service: any) {
    if (!token) {
      track("contact_click", { workerId: w?.id, type: "service", gated: true });
      setLoginWallContext("contact"); setShowLoginWall(true); return;
    }
    track("contact_click", { workerId: w?.id, type: "service", gated: false });
    setBookingInProgress(true);
    try {
      await apiFetch("/api/bookings", {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: w.id,
          categoryId: w.categoryId ?? 1,
          description: service.name,
          address: "Por definir con el profesional",
          bookingType: "service",
          autoAccept: true,
          fixedPrice: service.basePrice,
          serviceId: service.id,
        }),
      });
      track("booking_sent", { workerId: w?.id, type: "service" });
      setConfirmService(null);
      setConfirmedNavTarget("/client/bookings");
      setBookingConfirmed("service");
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al crear la reserva", variant: "destructive" });
    } finally {
      setBookingInProgress(false);
    }
  }

  async function handleInquiry() {
    if (!token) {
      track("contact_click", { workerId: w?.id, type: "inquiry", gated: true });
      setLoginWallContext("contact"); setShowLoginWall(true); return;
    }
    track("contact_click", { workerId: w?.id, type: "inquiry", gated: false });
    setCreatingInquiry(true);
    try {
      const booking = await apiFetch("/api/bookings", {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: w.id,
          categoryId: w.categoryId ?? 1,
          description: "Solicitud de cotización — pendiente de acuerdo en chat.",
          address: "Por definir en chat",
          bookingType: "inquiry",
        }),
      });
      track("booking_sent", { workerId: w?.id, type: "inquiry" });
      setConfirmedNavTarget(`/client/chat/${booking.id}`);
      setBookingConfirmed("inquiry");
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al abrir el chat", variant: "destructive" });
    } finally {
      setCreatingInquiry(false);
    }
  }

  return (
    <AppLayout>
      {/* Extra bottom padding so sticky CTA doesn't cover content */}
      <div className="max-w-2xl mx-auto space-y-3 pb-36">

        {/* ── Back + Favorite ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/client/search")}
            className="flex items-center gap-1 text-sm transition-colors"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <ChevronLeft className="w-4 h-4" /> Volver
          </button>
          <FavoriteButton workerId={w.id} size="md" />
        </div>

        {/* ── Hero block — everything visible without scroll ──────────── */}
        <div className="rounded-2xl p-4" style={{
          background: w.isPremium ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.04)",
          border: w.isPremium ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(255,255,255,0.10)",
        }}>
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {w.avatarUrl
                ? <img src={w.avatarUrl} alt={w.name} className="w-20 h-20 rounded-2xl object-cover"
                    style={{ border: w.isPremium ? "2px solid rgba(251,191,36,0.5)" : "2px solid rgba(255,255,255,0.10)" }} />
                : <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black"
                    style={{ background: "rgba(99,102,241,0.2)", color: "rgba(165,180,252,0.9)" }}>
                    {w.name?.charAt(0).toUpperCase()}
                  </div>
              }
              {w.isAvailable && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 animate-pulse"
                  style={{ background: "rgba(52,211,153,1)", borderColor: "rgba(10,15,30,1)" }} />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Name + premium */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-black" style={{ color: "rgba(255,255,255,0.95)" }}>{w.name}</h1>
                {w.isVerified && (
                  <BadgeCheck className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(96,165,250,0.9)" }} />
                )}
                {w.isPremium && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: "rgba(251,191,36,0.15)", color: "rgba(251,191,36,0.9)", border: "1px solid rgba(251,191,36,0.25)" }}>
                    ⭐ Premium
                  </span>
                )}
              </div>

              {/* Category + location */}
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {w.categoryName && (
                  <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.60)" }}>{w.categoryName}</span>
                )}
                {(w.city || distance) && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                    <MapPin className="w-3 h-3" />
                    {distance ? `A ${distance} km` : `${w.city}${w.state ? `, ${w.state}` : ""}`}
                  </span>
                )}
              </div>

              {/* Urgency line */}
              {w.isAvailable && (
                <p className="text-xs font-semibold mb-1.5" style={{ color: "rgba(52,211,153,0.85)" }}>
                  ● Disponible ahora · responde en minutos
                </p>
              )}

              {/* Rating */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-base font-black" style={{ color: "rgba(255,255,255,0.90)" }}>
                    {w.rating > 0 ? w.rating.toFixed(1) : "—"}
                  </span>
                </div>
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                  ({totalReviews} {totalReviews === 1 ? "reseña" : "reseñas"})
                </span>
                <WorkerLevelBadge completedJobs={w.completedJobs} rating={w.rating} isVerified={w.isVerified} size="sm" />
              </div>

              {/* Availability + base price */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={w.isAvailable
                    ? { background: "rgba(52,211,153,0.12)", color: "rgba(52,211,153,0.95)", border: "1px solid rgba(52,211,153,0.25)" }
                    : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.10)" }
                  }>
                  <Clock className="w-3 h-3" />
                  {w.isAvailable ? "Disponible ahora" : "No disponible"}
                </span>
                <span className="text-base font-black" style={{ color: "rgba(255,255,255,0.85)" }}>
                  Desde ${basePrice}
                </span>
              </div>
            </div>
          </div>

          {/* Description (compact) */}
          {w.description && (
            <p className="mt-4 text-sm leading-relaxed"
              style={{ color: "rgba(255,255,255,0.45)", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "12px" }}>
              {w.description}
            </p>
          )}
        </div>

        {/* ── Service Selector ────────────────────────────────────────── */}
        {workerServices.length > 0 && (
          <div className="rounded-2xl p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
              Selecciona un servicio
            </p>
            <div className="flex flex-col gap-2">
              {workerServices.map((svc: any) => {
                const isSelected = selectedService?.id === svc.id;
                return (
                  <button
                    key={svc.id}
                    onClick={() => setSelectedService(svc)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
                    style={isSelected
                      ? { background: "rgba(99,102,241,0.18)", border: "2px solid rgba(99,102,241,0.55)" }
                      : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: isSelected ? "rgba(165,180,252,1)" : "rgba(255,255,255,0.75)" }}>
                        {svc.name}
                      </p>
                      {svc.description && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.30)" }}>{svc.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-base font-black"
                        style={{ color: isSelected ? "rgba(52,211,153,1)" : "rgba(255,255,255,0.55)" }}>
                        ${Number(svc.basePrice).toFixed(0)}
                      </span>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(99,102,241,0.5)" }}>
                          <CheckCircle className="w-3 h-3" style={{ color: "rgba(165,180,252,1)" }} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Portfolio Photos — carrusel ──────────────────────────────── */}
        {(w.portfolioPhotos ?? []).length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: "rgba(255,255,255,0.30)" }}>
              Fotos del trabajo · <span style={{ color: "rgba(255,255,255,0.18)" }}>desliza →</span>
            </p>
            {/* Carrusel horizontal con snap */}
            <div
              className="flex gap-2.5 overflow-x-auto pb-1"
              style={{
                scrollSnapType: "x mandatory",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {(w.portfolioPhotos as string[]).map((path: string, i: number) => (
                <div
                  key={i}
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                  className="flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl transition-transform active:scale-95"
                  style={{
                    scrollSnapAlign: "start",
                    width: "68vw",
                    maxWidth: "240px",
                    aspectRatio: "4/3",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                  }}
                >
                  <img
                    src={`/api/storage${path}`}
                    alt={`Foto ${i + 1}`}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Reviews ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
                {w.rating > 0 ? w.rating.toFixed(1) : "—"}
              </span>
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                · {totalReviews} {totalReviews === 1 ? "reseña" : "reseñas"}
              </span>
            </div>
            {totalReviews > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-medium"
                style={{ color: "rgba(52,211,153,0.75)" }}>
                <BadgeCheck className="w-3 h-3" /> Verificadas
              </span>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="text-center py-8 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Aún no hay reseñas para este profesional.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleReviews.map((r: any) => <ReviewCard key={r.id} review={r} />)}
              {reviews.length > 2 && (
                <button
                  onClick={() => setShowAllReviews(v => !v)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.50)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {showAllReviews ? "Ver menos" : `Ver todas (${reviews.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Stats (collapsible) ──────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            className="w-full flex items-center justify-between px-4 py-3"
            style={{ background: "rgba(255,255,255,0.03)" }}
            onClick={() => setShowDetails(v => !v)}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: "rgba(165,180,252,0.7)" }} />
              <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.70)" }}>Ver detalles del profesional</span>
            </div>
            {showDetails
              ? <ChevronUp className="w-4 h-4" style={{ color: "rgba(255,255,255,0.30)" }} />
              : <ChevronDown className="w-4 h-4" style={{ color: "rgba(255,255,255,0.30)" }} />
            }
          </button>
          {showDetails && (
            <div className="p-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {/* Quick stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Briefcase, val: String(w.completedJobs), label: "Completados" },
                  { icon: CheckCircle, val: `${completionRate}%`, label: "Cumplimiento" },
                  { icon: Timer, val: formatResponseTime(w.avgResponseMinutes ?? null), label: "Respuesta" },
                ].map(({ icon: Icon, val, label }) => (
                  <div key={label} className="text-center p-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: "rgba(165,180,252,0.7)" }} />
                    <p className="text-base font-black" style={{ color: "rgba(255,255,255,0.85)" }}>{val}</p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.30)" }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Verification */}
              {w.isVerified && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)" }}>
                  <BadgeCheck className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(96,165,250,0.85)" }} />
                  <span className="text-xs font-medium" style={{ color: "rgba(96,165,250,0.85)" }}>
                    Identidad verificada por el equipo de LinkServi
                  </span>
                </div>
              )}

              {/* Skills */}
              {(w.skills ?? []).length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>Especialidades</p>
                  <div className="flex flex-wrap gap-1.5">
                    {w.skills.map((s: string) => (
                      <span key={s} className="text-xs px-3 py-1 rounded-full font-medium"
                        style={{ background: "rgba(99,102,241,0.12)", color: "rgba(165,180,252,0.85)", border: "1px solid rgba(99,102,241,0.20)" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Also available ───────────────────────────────────────────── */}
        <AlsoAvailablePanel
          currentWorkerId={(worker as any).id}
          categoryId={(worker as any).categoryId ?? null}
        />

        {/* ── Safety tips (bottom) ─────────────────────────────────────── */}
        <div className="px-3 py-3 rounded-xl"
          style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.60)" }} />
            <p className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.50)" }}>
              Verifica la identidad del profesional · Paga solo cuando el servicio esté completado · Usa el chat de LinkServi como evidencia
            </p>
          </div>
        </div>

      </div>

      {/* ── STICKY CTA ──────────────────────────────────────────────────── */}
      {w.isAvailable ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe"
          style={{ background: "linear-gradient(to top, rgba(8,12,24,1) 60%, rgba(8,12,24,0))", paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
          <div className="max-w-2xl mx-auto pt-4 space-y-2">
            {/* Primary: Hire */}
            <button
              onClick={() => runWithGate(() => {
                const svc = selectedService;
                if (svc) {
                  if (!token) { setLoginWallContext("hire"); setShowLoginWall(true); return; }
                  setConfirmService(svc);
                } else {
                  if (!token) { setLoginWallContext("hire"); setShowLoginWall(true); return; }
                  navigate(`/client/book/${w.id}`);
                }
              })}
              className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,1), rgba(139,92,246,1))",
                color: "white",
                boxShadow: "0 4px 24px rgba(99,102,241,0.45)",
              }}
            >
              <Zap className="w-5 h-5" />
              Reservar ahora &nbsp;·&nbsp; ${activePrice.toFixed(0)}
            </button>

            {/* Social proof + fear reduction row */}
            <div className="flex items-center justify-between px-1">
              {w.completedJobs > 0 && (
                <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
                  +{w.completedJobs} servicios completados
                </p>
              )}
              <p className="text-xs ml-auto" style={{ color: "rgba(255,255,255,0.28)" }}>
                Puedes cancelar antes de iniciar
              </p>
            </div>

            {/* Trust microcopy */}
            <p className="text-center text-xs -mt-1" style={{ color: "rgba(255,255,255,0.22)" }}>
              ✓ Confirmación inmediata después del pago
            </p>

            {/* Secondary: Quote — ghost, minimal weight */}
            <button
              onClick={() => runWithGate(handleInquiry)}
              disabled={creatingInquiry}
              className="w-full py-2 font-medium text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ color: "rgba(255,255,255,0.30)", background: "transparent", border: "none" }}
            >
              {creatingInquiry
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <MessageSquare className="w-3 h-3" />
              }
              Solicitar cotización sin compromiso
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe"
          style={{ background: "linear-gradient(to top, rgba(8,12,24,1) 60%, rgba(8,12,24,0))", paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
          <div className="max-w-2xl mx-auto pt-4">
            <div className="w-full py-3.5 rounded-2xl text-center text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.10)" }}>
              No disponible ahora — intenta más tarde
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm booking modal ──────────────────────────────────────── */}
      {confirmService && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(12px)" }}
          onClick={() => !bookingInProgress && setConfirmService(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "rgba(12,17,32,1)", border: "1px solid rgba(255,255,255,0.10)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-black" style={{ color: "rgba(255,255,255,0.90)" }}>Confirmar contratación</h2>
                <button onClick={() => setConfirmService(null)} disabled={bookingInProgress}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                  style={{ background: "rgba(255,255,255,0.07)" }}>
                  <X className="w-4 h-4" style={{ color: "rgba(255,255,255,0.50)" }} />
                </button>
              </div>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>Revisa los detalles antes de proceder al pago</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Servicio</p>
                  <p className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.88)" }}>{confirmService.name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Precio</p>
                  <p className="text-2xl font-black" style={{ color: "rgba(52,211,153,1)" }}>${Number(confirmService.basePrice).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl"
                style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)" }}>
                <CalendarDays className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(96,165,250,0.7)" }} />
                <p className="text-xs leading-snug" style={{ color: "rgba(96,165,250,0.70)" }}>
                  Al confirmar, tu reserva queda activa y podrás realizar el pago en <strong>Mis Solicitudes</strong>.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
                <Shield className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(52,211,153,0.6)" }} />
                Pago protegido — el profesional recibe el dinero solo al completar el servicio.
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setConfirmService(null)}
                disabled={bookingInProgress}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)" }}>
                Cancelar
              </button>
              <button
                onClick={() => handleDirectBook(confirmService)}
                disabled={bookingInProgress}
                className="flex-1 py-3 rounded-xl text-sm font-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "rgba(52,211,153,0.90)", color: "rgba(0,0,0,0.85)" }}>
                {bookingInProgress
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Procesando...</>
                  : <><CreditCard className="w-4 h-4" />Ir a pagar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login wall */}
      <LoginWallModal
        open={showLoginWall}
        onClose={() => setShowLoginWall(false)}
        context={loginWallContext}
        returnTo={`/workers/${workerId}`}
      />

      {/* ── Booking confirmed overlay ──────────────────────────────────── */}
      {bookingConfirmed && (
        <div
          className="fixed inset-0 z-[800] flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(12px)" }}
        >
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: "#071020", border: "1px solid rgba(16,185,129,0.25)" }}>
            <div className="h-px w-full" style={{ background: "linear-gradient(90deg,transparent,rgba(16,185,129,0.6) 40%,rgba(16,185,129,0.6) 60%,transparent)" }} />
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Solicitud enviada</h2>
                <p className="text-sm mt-1.5" style={{ color: "rgba(255,255,255,0.50)" }}>El profesional responderá en minutos</p>
              </div>
              <div className="w-full h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <button
                onClick={() => navigate(`/client/search${w?.categoryId ? `?category=${w.categoryId}` : ""}`)}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80 active:scale-[0.98]"
                style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(6,182,212,0.10)", border: "1px solid rgba(6,182,212,0.20)" }}>
                  <Search className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-white leading-tight">Ver más {w?.categoryName ?? "profesionales"}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Disponibles ahora en tu zona</p>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: "rgba(255,255,255,0.20)" }} />
              </button>
              <button
                onClick={() => navigate(confirmedNavTarget)}
                className="w-full py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)", boxShadow: "0 0 24px rgba(16,185,129,0.30)" }}>
                {bookingConfirmed === "inquiry" ? "Abrir chat" : "Ver mi solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC gate */}
      {gateOpen && <ClientKYCModal {...gateProps} />}

      {/* ── Lightbox fullscreen ──────────────────────────────────────── */}
      {lightboxOpen && (w.portfolioPhotos ?? []).length > 0 && (() => {
        const photos = w.portfolioPhotos as string[];
        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.93)", backdropFilter: "blur(16px)" }}
            onClick={() => setLightboxOpen(false)}
          >
            {/* Botón cerrar */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center z-10"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <X className="w-4 h-4 text-white" />
            </button>

            {/* Contador */}
            <div
              className="absolute top-5 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)" }}
            >
              {lightboxIndex + 1} / {photos.length}
            </div>

            {/* Flecha anterior */}
            {lightboxIndex > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i - 1); }}
                className="absolute left-3 w-10 h-10 rounded-full flex items-center justify-center z-10"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}

            {/* Imagen con swipe */}
            <div
              className="w-full max-w-lg px-16 select-none"
              onClick={e => e.stopPropagation()}
              onPointerDown={e => { lbSwipeStartX.current = e.clientX; }}
              onPointerUp={e => {
                const diff = lbSwipeStartX.current - e.clientX;
                if (Math.abs(diff) > 40) {
                  if (diff > 0 && lightboxIndex < photos.length - 1) setLightboxIndex(i => i + 1);
                  if (diff < 0 && lightboxIndex > 0) setLightboxIndex(i => i - 1);
                }
              }}
            >
              <img
                key={lightboxIndex}
                src={`/api/storage${photos[lightboxIndex]}`}
                alt={`Foto ${lightboxIndex + 1}`}
                className="w-full rounded-2xl object-contain"
                style={{ maxHeight: "76vh", animation: "lbFadeIn 0.18s ease" }}
              />
            </div>

            {/* Flecha siguiente */}
            {lightboxIndex < photos.length - 1 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i + 1); }}
                className="absolute right-3 w-10 h-10 rounded-full flex items-center justify-center z-10"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            )}

            {/* Dots indicator */}
            {photos.length > 1 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={e => { e.stopPropagation(); setLightboxIndex(i); }}
                    className="rounded-full transition-all"
                    style={{
                      width: i === lightboxIndex ? "20px" : "6px",
                      height: "6px",
                      background: i === lightboxIndex ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <style>{`
        @keyframes lbFadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </AppLayout>
  );
}
