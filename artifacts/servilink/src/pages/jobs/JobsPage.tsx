import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { LoginWallModal } from "@/components/ui/LoginWallModal";
import { toast } from "@/hooks/use-toast";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  Briefcase, Search, MapPin, Star, CheckCircle, Clock,
  Play, Pause, ChevronRight, X, Plus, Tag, Zap,
  Crown, Building2, FileText, Video, Filter,
  Camera, Phone, AlertCircle, Lock, Upload, Users, LogIn, MessageCircle, ExternalLink,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { C2PModal } from "@/components/payments/C2PModal";
import { mediaSrc } from "@/lib/media-url";

// ─────────────────────────────────────────────────────────────────────────────
// Slug helper (matches server-side workerSlug logic)
// ─────────────────────────────────────────────────────────────────────────────
function jobProfileSlug(name: string, userId: number): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "candidato";
  return `${base}-${userId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface WorkExperience { company: string; role: string; years: number; companyPhone?: string; }
interface JobProfile {
  id: number; userId: number; userName: string; userAvatar: string | null;
  bio: string; videoUrl: string | null; city: string;
  skills: string[]; workExperience: WorkExperience[];
  isAvailable: boolean; subscriptionEnd: string | null;
  isFeatured: boolean; isVerified: boolean; createdAt: string;
  userPhone: string | null; cedula: string | null;
}
interface MySub { id: number; type: string; endDate: string; status: string; }

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Av({ name, url, size = 10 }: { name: string; url: string | null; size?: number }) {
  const s = `w-${size} h-${size}`;
  if (url) return <img src={url} className={`${s} rounded-full object-cover`} />;
  return (
    <div className={`${s} rounded-full flex items-center justify-center bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-bold text-sm flex-shrink-0`}>
      {name?.charAt(0).toUpperCase()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Video preview player
// ─────────────────────────────────────────────────────────────────────────────
function VideoThumb({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const v = ref.current; if (!v) return;
    if (playing) { v.pause(); setPlaying(false); } else { v.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };
  return (
    <div
      className="relative rounded-xl overflow-hidden mx-auto"
      style={{ background: "#000", aspectRatio: "9 / 16", maxWidth: 280, width: "100%" }}
    >
      <video
        ref={ref}
        src={url}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        preload="auto"
        controls={playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {!playing && (
        <button
          onClick={toggle}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors"
          aria-label="Reproducir video"
        >
          <Play className="w-10 h-10 text-white drop-shadow-lg" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment modal — único método: C2P (Banco de Venezuela)
// ─────────────────────────────────────────────────────────────────────────────
function PaymentModal({
  open, type, onClose, onSuccess,
}: {
  open: boolean;
  type: "worker_featured" | "business_premium";
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const amount = type === "worker_featured" ? 1 : 2;
  const label  = type === "worker_featured" ? "Profesional Destacado" : "Empresa Premium";
  if (!open) return null;
  return (
    <C2PModal
      open={open}
      onClose={onClose}
      amountUsd={amount}
      concept={`LinkServi — Suscripción — ${label}`}
      referenceType={type}
      onSuccess={() => {
        onClose();
        onSuccess(`¡${label} activado! Tu suscripción ya está lista por 30 días.`);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile card (public preview — name, photo, trade, city visible to all)
// ─────────────────────────────────────────────────────────────────────────────
function ProfileCard({ p, accent, onClick }: { p: JobProfile; accent: string; onClick: () => void }) {
  const totalYears = p.workExperience.reduce((s, e) => s + e.years, 0);
  const slug = jobProfileSlug(p.userName, p.userId);
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => e.key === "Enter" && onClick()}
      className="w-full text-left cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]">
      <div className="rounded-2xl p-4 relative overflow-hidden"
        style={p.isFeatured ? {
          background: "linear-gradient(135deg, rgba(251,191,36,0.07) 0%, rgba(120,53,15,0.06) 50%, rgba(8,8,20,0.85) 100%)",
          border: "1px solid rgba(251,191,36,0.42)",
          boxShadow: "0 0 28px rgba(251,191,36,0.09), 0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(251,191,36,0.18)",
        } : {
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>

        {/* Golden shimmer line at top for featured */}
        {p.isFeatured && (
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.55) 40%, rgba(251,191,36,0.55) 60%, transparent)" }} />
        )}

        {p.isFeatured && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full"
            style={{
              background: "linear-gradient(135deg, rgba(251,191,36,0.22), rgba(180,83,9,0.18))",
              color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.45)",
              textShadow: "0 0 8px rgba(251,191,36,0.5)",
            }}>
            <Crown className="w-2.5 h-2.5" /> Destacado
          </div>
        )}

        <div className="flex items-start gap-3">
          <Av name={p.userName} url={p.userAvatar} size={12} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-sm">{p.userName}</span>
              {p.isVerified && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>
                  <CheckCircle className="w-2.5 h-2.5" /> Verificado
                </span>
              )}
              {p.isAvailable && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(6,182,212,0.12)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.25)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" /> Disponible
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/40 mt-0.5">
              <MapPin className="w-3 h-3" /> {p.city}
              {totalYears > 0 && <span>· {totalYears} año{totalYears !== 1 ? "s" : ""} exp.</span>}
            </div>
          </div>
        </div>

        {p.bio && <p className="text-xs text-white/55 mt-3 line-clamp-2 leading-relaxed">{p.bio}</p>}

        {p.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {p.skills.slice(0, 4).map(s => (
              <span key={s} className="text-[11px] px-2 py-1 rounded-full font-medium"
                style={p.isFeatured ? {
                  background: "rgba(251,191,36,0.1)",
                  color: "rgba(251,191,36,0.85)",
                  border: "1px solid rgba(251,191,36,0.25)",
                } : {
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}>
                {s}
              </span>
            ))}
            {p.skills.length > 4 && (
              <span className="text-[11px] px-2 py-1 rounded-full"
                style={{ color: p.isFeatured ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.3)" }}>
                +{p.skills.length - 4}
              </span>
            )}
          </div>
        )}

        {p.videoUrl && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px]"
            style={{ color: p.isFeatured ? "#fbbf24" : "#a78bfa" }}>
            <Video className="w-3 h-3" /> Video de presentación disponible
          </div>
        )}

        {/* Footer: teaser + public SEO link */}
        <div className="mt-3 pt-3 flex items-center gap-1.5 text-[11px] border-t"
          style={{
            color: p.isFeatured ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.3)",
            borderColor: p.isFeatured ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
          }}>
          <Lock className="w-3 h-3" /> Ver hoja de vida completa
          <a
            href={`/jobs/perfil/${slug}`}
            onClick={e => e.stopPropagation()}
            className="ml-auto flex items-center gap-1 transition-opacity hover:opacity-80"
            style={{ color: p.isFeatured ? "rgba(251,191,36,0.6)" : "rgba(6,182,212,0.6)" }}
            title="Ver perfil público"
          >
            <ExternalLink className="w-3 h-3" />
            Compartir
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full CV modal — gated behind auth
// ─────────────────────────────────────────────────────────────────────────────
function ProfileModal({ p, isAuth, viewerHasPremium, onClose, onNeedAuth, onSubscribe, onStartChat }: {
  p: JobProfile; isAuth: boolean; viewerHasPremium: boolean;
  onClose: () => void; onNeedAuth: () => void; onSubscribe: () => void;
  onStartChat: (applicantId: number) => void;
}) {
  const totalYears = p.workExperience.reduce((s, e) => s + e.years, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 flex items-center justify-between px-5 py-4 rounded-t-3xl"
          style={{ background: "rgba(10,22,40,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="font-bold text-white text-sm">Hoja de Vida</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Header — always visible */}
          <div className="flex items-start gap-4">
            <Av name={p.userName} url={p.userAvatar} size={16} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-black text-white text-lg">{p.userName}</h2>
                {p.isVerified && (
                  <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
                    style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <CheckCircle className="w-3 h-3" /> Identidad Verificada
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-white/40 mt-1">
                <MapPin className="w-3.5 h-3.5" /> {p.city}
                {p.cedula && isAuth && <span>· C.I. {p.cedula}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {p.isAvailable && (
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: "rgba(6,182,212,0.12)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.25)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" /> Disponible de inmediato
                  </span>
                )}
                {p.isFeatured && (
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: "rgba(124,58,237,0.2)", color: "#c4b5fd", border: "1px solid rgba(124,58,237,0.4)" }}>
                    <Zap className="w-3 h-3" /> Profesional Destacado
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Skills always visible */}
          {p.skills.length > 0 && (
            <div>
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Habilidades / Oficios</p>
              <div className="flex flex-wrap gap-2">
                {p.skills.map(s => (
                  <span key={s} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full font-medium"
                    style={{ background: "rgba(124,58,237,0.12)", color: "#c4b5fd", border: "1px solid rgba(124,58,237,0.25)" }}>
                    <Tag className="w-3 h-3" /> {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Video — always visible */}
          {p.videoUrl && (
            <div>
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Video de presentación</p>
              <VideoThumb url={p.videoUrl} />
            </div>
          )}

          {/* Bio — always visible */}
          {p.bio && (
            <div>
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Acerca de mí</p>
              <p className="text-sm text-white/70 leading-relaxed">{p.bio}</p>
            </div>
          )}

          {/* Experience — always visible */}
          {p.workExperience.length > 0 && (
            <div>
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Experiencia Laboral</p>
              <div className="space-y-2">
                {p.workExperience.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <Building2 className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/80">{e.role}</p>
                      <p className="text-xs text-white/40">{e.company} · {e.years} año{e.years !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response time nudge */}
          <p className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "rgba(52,211,153,0.75)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block flex-shrink-0" />
            Este profesional suele responder en minutos
          </p>

          {/* CONTACT — gated: auth first, then premium */}
          {!isAuth ? (
            <div className="rounded-2xl p-4 text-center"
              style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.2)" }}>
              <Lock className="w-7 h-7 mx-auto mb-2 text-cyan-400" />
              <p className="font-bold text-white text-sm mb-1">Postúlate con un clic</p>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
                Crea una cuenta gratuita para contactar a este candidato directamente.
              </p>
              <button onClick={onNeedAuth}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)" }}>
                Registrarse — es gratis
              </button>
            </div>
          ) : viewerHasPremium ? (
            p.userPhone ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Contacto directo</p>
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider">Número verificado · Premium</p>
                    <p className="text-base font-black text-amber-300 mt-0.5 tracking-wide">{p.userPhone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <a href={`https://wa.me/${p.userPhone.replace(/\D/g, "").replace(/^0/, "58")}?text=${encodeURIComponent("Hola, te vi en LinkServi y me interesa tu perfil")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                  <a href={`tel:${p.userPhone}`}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}>
                    <Phone className="w-4 h-4" /> Llamar
                  </a>
                </div>
                <button onClick={() => { onClose(); onStartChat(p.userId); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>
                  <MessageCircle className="w-4 h-4" /> Chat Interno LinkServi
                </button>
              </div>
            ) : (
              <div>
                <button onClick={() => onStartChat(p.userId)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 mb-2"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>
                  <MessageCircle className="w-4 h-4" /> Chat Interno
                </button>
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <Phone className="w-4 h-4 text-white/20 flex-shrink-0" />
                  <p className="text-xs text-white/35">Este candidato aún no ha registrado su teléfono de contacto.</p>
                </div>
              </div>
            )
          ) : (
            <div className="rounded-2xl p-4 text-center"
              style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <Lock className="w-7 h-7 mx-auto mb-2 text-amber-400" />
              <p className="font-bold text-white text-sm mb-1">Contacto bloqueado</p>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
                Suscríbete a <strong style={{ color: "#fbbf24" }}>Empresa Premium</strong> para ver el teléfono y contactar directamente por WhatsApp o llamada.
              </p>
              <button onClick={onSubscribe}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#f59e0b,#b45309)" }}>
                🔓 Activar Premium — $2/mes
              </button>
            </div>
          )}

          <p className="text-xs text-white/25 text-center">
            Publicado {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true, locale: es })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Business Premium subscription card
// ─────────────────────────────────────────────────────────────────────────────
function BusinessPremiumCard({ accent, onStatusChange }: {
  accent: string;
  onStatusChange?: (hasPremium: boolean) => void;
}) {
  const { user } = useAuth();
  const [activeSub, setActiveSub] = useState<MySub | null>(null);
  const [pendingSub, setPendingSub] = useState<MySub | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkStatus = async (silent = true) => {
    if (!user) return;
    if (!silent) setChecking(true);
    try {
      const r = await fetch("/api/jobs/subscriptions/status", { headers: getAuthHeader() });
      if (!r.ok) return;
      const { active, pending } = await r.json();
      const isBusinessActive = active?.type === "business_premium";
      const isBusinessPending = pending?.type === "business_premium";
      setActiveSub(isBusinessActive ? active : null);
      setPendingSub(isBusinessPending && !isBusinessActive ? pending : null);
      onStatusChange?.(isBusinessActive);
    } finally {
      if (!silent) setChecking(false);
    }
  };

  // Poll every 30 s so admin approval reflects immediately without refresh
  useEffect(() => {
    if (!user) { setActiveSub(null); setPendingSub(null); onStatusChange?.(false); return; }
    checkStatus();
    const id = setInterval(() => checkStatus(), 30_000);
    return () => clearInterval(id);
  }, [user]);

  if (!user) return null;

  return (
    <>
      <div className="relative rounded-2xl p-5 mb-4 overflow-hidden transition-all duration-300"
        style={{
          background: activeSub
            ? "linear-gradient(135deg,rgba(16,185,129,0.18) 0%,rgba(5,150,105,0.12) 100%)"
            : "linear-gradient(135deg,rgba(180,130,0,0.22) 0%,rgba(120,60,0,0.18) 50%,rgba(60,30,0,0.22) 100%)",
          border: activeSub
            ? "1.5px solid rgba(16,185,129,0.45)"
            : "1.5px solid rgba(234,179,8,0.45)",
          boxShadow: activeSub
            ? "0 0 32px rgba(16,185,129,0.15), 0 8px 32px rgba(0,0,0,0.5)"
            : "0 0 32px rgba(234,179,8,0.18), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.12)",
        }}>

        {/* Corner badge */}
        <div className="absolute top-0 right-0">
          <div className="text-[10px] font-black px-3 py-1 rounded-bl-xl rounded-tr-xl"
            style={{
              background: activeSub
                ? "linear-gradient(135deg,#10b981,#059669)"
                : "linear-gradient(135deg,#f59e0b,#d97706)",
              color: "#fff", letterSpacing: "0.05em",
            }}>
            {activeSub ? "✓ PLAN ACTIVO" : "⭐ RECOMENDADO"}
          </div>
        </div>

        {/* Shimmer strip */}
        <div className="absolute inset-x-0 top-0 h-px"
          style={{
            background: activeSub
              ? "linear-gradient(90deg,transparent,rgba(16,185,129,0.7),transparent)"
              : "linear-gradient(90deg,transparent,rgba(251,191,36,0.7),transparent)",
          }} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: activeSub
                  ? "linear-gradient(135deg,rgba(16,185,129,0.25),rgba(5,150,105,0.15))"
                  : "linear-gradient(135deg,rgba(251,191,36,0.25),rgba(180,83,9,0.2))",
                border: activeSub
                  ? "1px solid rgba(16,185,129,0.4)"
                  : "1px solid rgba(251,191,36,0.35)",
                boxShadow: activeSub
                  ? "0 0 16px rgba(16,185,129,0.25)"
                  : "0 0 16px rgba(251,191,36,0.2)",
              }}>
              <Crown className="w-5 h-5" style={{ color: activeSub ? "#34d399" : "#fbbf24" }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-white text-sm">Empresa Premium</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{
                    background: activeSub
                      ? "linear-gradient(135deg,rgba(16,185,129,0.25),rgba(5,150,105,0.2))"
                      : "linear-gradient(135deg,rgba(251,191,36,0.25),rgba(180,83,9,0.2))",
                    color: activeSub ? "#34d399" : "#fbbf24",
                    border: activeSub ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(251,191,36,0.4)",
                  }}>$2/mes</span>
              </div>
              <p className="text-xs mt-0.5"
                style={{ color: activeSub ? "rgba(52,211,153,0.7)" : "rgba(251,191,36,0.6)" }}>
                {activeSub
                  ? `Activo hasta ${format(new Date(activeSub.endDate), "d MMM yyyy", { locale: es })}`
                  : "Ve el teléfono de cada candidato y contacta directo"}
              </p>
            </div>
          </div>

          {/* CTA based on state */}
          {activeSub ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold flex-shrink-0">
              <CheckCircle className="w-4 h-4" /> Activo
            </div>
          ) : pendingSub ? (
            <button
              onClick={() => checkStatus(false)}
              disabled={checking}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
              style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
              {checking
                ? <><div className="w-3 h-3 border border-amber-400/40 rounded-full animate-spin" style={{ borderTopColor: "#fbbf24" }} /> Verificando...</>
                : <><Clock className="w-3.5 h-3.5" /> Verificar</>}
            </button>
          ) : (
            <button onClick={() => setShowPayment(true)}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-black text-white whitespace-nowrap transition-all duration-200 hover:scale-105 hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#f59e0b,#b45309)", boxShadow: "0 4px 16px rgba(245,158,11,0.4)" }}>
              Activar ahora
            </button>
          )}
        </div>

        {/* Pending info row */}
        {pendingSub && !activeSub && (
          <div className="mt-3 flex items-start gap-2 text-xs"
            style={{ color: "rgba(251,191,36,0.75)" }}>
            <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Pago en revisión — el admin lo verificará en menos de 24 h. El acceso Premium se habilitará automáticamente al aprobar.</span>
          </div>
        )}
      </div>

      <PaymentModal
        open={showPayment}
        type="business_premium"
        onClose={() => setShowPayment(false)}
        onSuccess={() => { setShowPayment(false); checkStatus(); }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker profile tab (Mi Hoja de Vida) — requires auth
// ─────────────────────────────────────────────────────────────────────────────
function MyProfileTab({ accent }: { accent: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [sub, setSub] = useState<MySub | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Personal info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cedula, setCedula] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  // Profile form
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [experience, setExperience] = useState<WorkExperience[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);

  // Payment modal
  const [paymentModal, setPaymentModal] = useState(false);

  if (!user) {
    return (
      <div className="text-center py-20">
        <LogIn className="w-12 h-12 mx-auto text-white/20 mb-4" />
        <p className="text-white/60 font-semibold mb-2">Inicia sesión para publicar tu hoja de vida</p>
        <button onClick={() => navigate("/login")}
          className="mt-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
          Iniciar sesión
        </button>
      </div>
    );
  }

  const fetchSub = async () => {
    try {
      const r = await fetch("/api/jobs/subscriptions/status", { headers: getAuthHeader() });
      if (!r.ok) return;
      const { active, pending } = await r.json();
      const activeFeatured = active?.type === "worker_featured" ? active : null;
      const pendingFeatured = pending?.type === "worker_featured" ? pending : null;
      setSub(activeFeatured ?? pendingFeatured ?? null);
    } catch {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const pr = await fetch("/api/jobs/profiles/me", { headers: getAuthHeader() }).then(r => r.json());
      if (pr) {
        setProfile(pr);
        const nameParts = (pr.userName ?? "").split(" ");
        setFirstName(nameParts[0] ?? "");
        setLastName(nameParts.slice(1).join(" ") ?? "");
        setBio(pr.bio ?? "");
        setCity(pr.city ?? "");
        setIsAvailable(pr.isAvailable);
        setSkills(pr.skills ?? []);
        setExperience(pr.workExperience ?? []);
        setVideoUrl(pr.videoUrl ?? null);
        setPhone(pr.userPhone ?? "");
        setAvatarUrl(pr.userAvatar ?? null);
        setCedula(pr.cedula ?? "");
      } else {
        const nameParts = ((user as any)?.name ?? "").split(" ");
        setFirstName(nameParts[0] ?? "");
        setLastName(nameParts.slice(1).join(" ") ?? "");
      }
      await fetchSub();
    } finally { setLoading(false); }
  };

  // Poll subscription status every 30 s (detect admin approval in real time)
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchSub, 30_000);
    return () => clearInterval(id);
  }, []);

  const addSkill = () => {
    const s = skillInput.trim();
    if (!s || skills.includes(s) || skills.length >= 20) return;
    setSkills(prev => [...prev, s]); setSkillInput("");
  };

  const addExpRow = () => setExperience(prev => [...prev, { company: "", role: "", years: 1, companyPhone: "" }]);
  const updateExp = (i: number, f: keyof WorkExperience, v: string | number) =>
    setExperience(prev => prev.map((e, idx) => idx === i ? { ...e, [f]: v } : e));
  const removeExp = (i: number) => setExperience(prev => prev.filter((_, idx) => idx !== i));

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 18_000_000) { setErrorMsg("Foto máximo 18 MB"); return; }
    setAvatarUploading(true);
    try {
      const r = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await r.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setAvatarUrl(mediaSrc(objectPath));
    } catch { setErrorMsg("Error al subir foto"); }
    finally { setAvatarUploading(false); if (avatarRef.current) avatarRef.current.value = ""; }
  };

  const uploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 80_000_000) { setErrorMsg("Video máximo 80 MB"); return; }
    setVideoUploading(true);
    try {
      const r = await fetch("/api/storage/uploads/request-url", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) });
      const { uploadURL, objectPath } = await r.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setVideoUrl(mediaSrc(objectPath));
    } catch { setErrorMsg("Error al subir video"); } finally { setVideoUploading(false); if (videoRef.current) videoRef.current.value = ""; }
  };

  const save = async () => {
    if (!city.trim()) { setErrorMsg("Ciudad requerida"); return; }
    if (!firstName.trim()) { setErrorMsg("Nombre requerido"); return; }
    setSaving(true); setErrorMsg("");
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const r = await fetch("/api/jobs/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ bio, city, isAvailable, skills, workExperience: experience, videoUrl, cedula, fullName, avatarUrl, phone }),
      });
      if (!r.ok) { const d = await r.json(); setErrorMsg(d.error ?? "Error"); return; }
      toast({ title: "✓ Perfil actualizado", description: "Tus datos, incluyendo el número de teléfono, han sido guardados." });
      await fetchData();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: accent }} /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* ── Datos personales ── */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 className="font-bold text-white text-sm">Datos de Identidad</h3>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl overflow-hidden"
              style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
              {avatarUrl
                ? <img src={avatarUrl} className="w-full h-full object-cover" alt="avatar" />
                : <div className="w-full h-full flex items-center justify-center">
                    <Camera className="w-6 h-6 text-violet-400/50" />
                  </div>
              }
            </div>
            <button onClick={() => avatarRef.current?.click()} disabled={avatarUploading}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: accent, border: "2px solid #030a18" }}>
              {avatarUploading
                ? <div className="w-3 h-3 border border-white/40 rounded-full animate-spin" style={{ borderTopColor: "#fff" }} />
                : <Upload className="w-3 h-3 text-white" />
              }
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/80">Foto de perfil</p>
            <p className="text-xs text-white/35 mt-0.5">Los contratantes verán esta foto</p>
            <p className="text-xs text-white/25">Máx. 18 MB · JPG, PNG, WEBP</p>
          </div>
        </div>

        {/* Nombre + Apellido */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-1.5">Nombre *</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ej: Juan"
              className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-1.5">Apellido</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ej: Pérez"
              className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
          </div>
        </div>

        {/* Cédula */}
        <div>
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-1.5">Cédula de Identidad *</label>
          <input value={cedula} onChange={e => setCedula(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Ej: 26456789" maxLength={9}
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
          <p className="text-[11px] text-white/25 mt-1">Aparece como "C.I." en tu perfil público para mayor confianza.</p>
        </div>

        {/* Phone — gated behind Business Premium */}
        <div>
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-1.5">
            Número de teléfono de contacto
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Ej: 0414-3869939"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
          <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "rgba(234,179,8,0.6)" }}>
            <Crown className="w-3 h-3" />
            Solo visible para empresas con suscripción Empresa Premium
          </p>
        </div>
      </div>

      {/* ── Worker Featured subscription ── */}
      <div className="rounded-2xl p-4"
        style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.15),rgba(79,70,229,0.08))", border: "1px solid rgba(124,58,237,0.3)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-violet-400" />
          <span className="font-bold text-white text-sm">Profesional Destacado</span>
        </div>
        <p className="text-xs text-white/50 mb-3">Aparece de primero en las búsquedas + etiqueta "Destacado"</p>
        <p className="text-2xl font-black text-violet-300 mb-3">$1 <span className="text-sm font-medium text-white/40">/ mes</span></p>
        {sub?.type === "worker_featured" && sub.status === "active" ? (
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
            <CheckCircle className="w-4 h-4" /> Activo hasta {format(new Date(sub.endDate), "d MMM", { locale: es })}
          </div>
        ) : sub?.type === "worker_featured" && sub.status === "pending_payment" ? (
          <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
            <Clock className="w-4 h-4" /> Pago pendiente de aprobación
          </div>
        ) : (
          <button onClick={() => setPaymentModal(true)}
            className="w-full py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
            Suscribirme — $1/mes
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl text-sm font-medium text-red-300"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
          {errorMsg}
        </div>
      )}

      {/* ── Profile form ── */}
      <div className="rounded-2xl p-5 space-y-5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 className="font-bold text-white text-sm">Hoja de Vida Digital</h3>

        {/* Video */}
        <div>
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-2">Video de presentación (opcional, máx. 30 seg)</label>
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={uploadVideo} />
          {videoUrl ? (
            <div className="space-y-2">
              <VideoThumb url={videoUrl} />
              <button onClick={() => setVideoUrl(null)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                <X className="w-3 h-3" /> Quitar video
              </button>
            </div>
          ) : (
            <button onClick={() => videoRef.current?.click()} disabled={videoUploading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed text-sm font-medium transition-colors hover:bg-white/[0.03] disabled:opacity-50"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.4)" }}>
              {videoUploading ? "Subiendo..." : <><Video className="w-4 h-4" /> Subir video de presentación</>}
            </button>
          )}
        </div>

        {/* City */}
        <div>
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-1.5">Ciudad *</label>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ej: Maturín, Caracas, Maracaibo..."
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>

        {/* Bio */}
        <div>
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-1.5">Presentación personal</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={500}
            placeholder="Cuéntale a los contratantes quién eres, qué sabes hacer y qué te diferencia..."
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>

        {/* Available toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white/80">Disponible para trabajar</p>
            <p className="text-xs text-white/35 mt-0.5">Aparecerás con el sello "Disponible" en las búsquedas</p>
          </div>
          <button onClick={() => setIsAvailable(v => !v)}
            className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
            style={{ background: isAvailable ? accent : "rgba(255,255,255,0.1)" }}>
            <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
              style={{ left: isAvailable ? "calc(100% - 22px)" : "2px" }} />
          </button>
        </div>

        {/* Skills */}
        <div>
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-2">Habilidades / Oficios *</label>
          <div className="flex gap-2 mb-2">
            <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
              placeholder="Ej: Electricista, Cocinero, Cajero..."
              className="flex-1 px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
            <button onClick={addSkill} className="px-3 py-2 rounded-xl text-sm font-bold transition-colors"
              style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}40` }}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {skills.map(s => (
              <span key={s} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: "rgba(124,58,237,0.15)", color: "#c4b5fd", border: "1px solid rgba(124,58,237,0.3)" }}>
                {s}
                <button onClick={() => setSkills(prev => prev.filter(x => x !== s))} className="hover:text-white transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Work experience */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Experiencia Laboral</label>
            <button onClick={addExpRow} className="flex items-center gap-1 text-xs font-semibold transition-colors"
              style={{ color: accent }}>
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
          <div className="space-y-2">
            {experience.map((e, i) => (
              <div key={i} className="flex flex-col gap-2 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <input value={e.role} onChange={ev => updateExp(i, "role", ev.target.value)}
                  placeholder="Cargo / Oficio" className="px-3 py-2 rounded-lg text-xs text-white placeholder:text-white/25 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={e.company} onChange={ev => updateExp(i, "company", ev.target.value)}
                    placeholder="Empresa" className="px-3 py-2 rounded-lg text-xs text-white placeholder:text-white/25 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
                  <div className="flex gap-1 items-center">
                    <input type="number" min={0} max={50} value={e.years}
                      onChange={ev => updateExp(i, "years", parseInt(ev.target.value) || 0)}
                      className="w-14 px-2 py-2 rounded-lg text-xs text-white focus:outline-none text-center"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
                    <span className="text-xs text-white/30">años</span>
                    <button onClick={() => removeExp(i)} className="ml-auto text-red-400/60 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none" />
                  <input value={e.companyPhone ?? ""} onChange={ev => updateExp(i, "companyPhone", ev.target.value)}
                    placeholder="Teléfono de la empresa (obligatorio para certificar)" required
                    className="w-full pl-7 pr-3 py-2 rounded-lg text-xs text-white placeholder:text-white/25 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: `linear-gradient(135deg,${accent},${accent}bb)` }}>
          {saving ? "Guardando..." : "Guardar Hoja de Vida"}
        </button>
      </div>

      <PaymentModal
        open={paymentModal}
        type="worker_featured"
        onClose={() => setPaymentModal(false)}
        onSuccess={msg => { toast({ title: "✓ Suscripción enviada", description: msg }); setPaymentModal(false); fetchData(); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main JobsPage — PUBLIC browse, gated CV/contact
// ─────────────────────────────────────────────────────────────────────────────
export function JobsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const accent = "#06B6D4";
  const initialTab = new URLSearchParams(search).get("tab") === "mine" ? "mine" : "browse";
  const [tab, setTab] = useState<"browse" | "mine">(initialTab);
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<JobProfile | null>(null);
  const [showRegisterWall, setShowRegisterWall] = useState(false);
  const [searchTrade, setSearchTrade] = useState("");
  const [searchCity, setSearchCity] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewerHasPremium, setViewerHasPremium] = useState(false);
  const [showPremiumPayment, setShowPremiumPayment] = useState(false);
  const [premiumSuccessMsg, setPremiumSuccessMsg] = useState("");

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTrade.trim()) params.set("trade", searchTrade.trim());
      if (searchCity.trim()) params.set("city", searchCity.trim());
      const r = await fetch(`/api/jobs/profiles?${params}`, { headers: getAuthHeader() });
      if (r.ok) setProfiles(await r.json());
    } finally { setLoading(false); }
  };

  // Re-fetch profiles when user logs in/out (to refresh gated phone data)
  useEffect(() => { fetchProfiles(); }, [user]);

  // Called by BusinessPremiumCard every 30 s when status changes
  const handlePremiumStatusChange = (hasPremium: boolean) => {
    setViewerHasPremium(prev => {
      if (!prev && hasPremium) {
        // Just became premium → re-fetch profiles so phones are unmasked
        fetchProfiles();
      }
      return hasPremium;
    });
  };

  const handleCardClick = (p: JobProfile) => {
    setSelectedProfile(p);
    // If not logged in, show auth wall immediately inside modal
  };

  return (
    <div className="min-h-screen" style={{ background: "#030a18" }}>
      <Sidebar />
      <main className="md:ml-64 min-h-screen">
        <div className="relative" style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%,rgba(6,182,212,0.12) 0%,transparent 60%)",
        }}>

          {/* Header */}
          <div className="sticky top-0 z-20 px-4 py-3"
            style={{ background: "rgba(3,10,24,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}20` }}>
                    <Users className="w-5 h-5" style={{ color: accent }} />
                  </div>
                  <div>
                    <h1 className="font-black text-white text-base leading-tight">Encontrar Personal</h1>
                    <p className="text-xs text-white/35">Encuentra talento venezolano verificado</p>
                  </div>
                </div>
                {!user && (
                  <button onClick={() => navigate("/login")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                    style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", color: accent }}>
                    <LogIn className="w-3.5 h-3.5" /> Iniciar sesión
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTab("browse")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={tab === "browse"
                    ? { background: accent, color: "#fff" }
                    : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
                  Encontrar Personal
                </button>
                <button onClick={() => setTab("mine")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={tab === "mine"
                    ? { background: accent, color: "#fff" }
                    : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
                  Mi Hoja de Vida
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 py-4">
            {tab === "browse" ? (
              <>
                {/* Business Premium banner */}
                <BusinessPremiumCard accent={accent} onStatusChange={handlePremiumStatusChange} />

                {/* Search + filters */}
                <div className="space-y-2 mb-4">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input value={searchTrade} onChange={e => setSearchTrade(e.target.value)}
                        placeholder="Oficio o habilidad (Ej: Electricista, Cajero)..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                        onKeyDown={e => { if (e.key === "Enter") fetchProfiles(); }} />
                    </div>
                    <button onClick={() => setShowFilters(v => !v)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/[0.08] bg-white/[0.04]"
                      style={showFilters ? { borderColor: `${accent}50`, color: accent, background: `${accent}12` } : { color: "rgba(255,255,255,0.4)" }}>
                      <Filter className="w-4 h-4" />
                    </button>
                  </div>
                  {showFilters && (
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                      <input value={searchCity} onChange={e => setSearchCity(e.target.value)}
                        placeholder="Filtrar por ciudad..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl text-xs text-white placeholder:text-white/25 focus:outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }} />
                    </div>
                  )}
                  <button onClick={fetchProfiles}
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                    style={{ background: `linear-gradient(135deg,${accent},${accent}bb)`, color: "#fff" }}>
                    Buscar candidatos
                  </button>
                </div>

                {/* Conversion banner */}
                <div className="rounded-2xl px-4 py-3 mb-3 flex items-center justify-between gap-3"
                  style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
                    <p className="text-xs font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.7)" }}>
                      Encuentra trabajos disponibles hoy — postúlate en menos de 1 minuto
                    </p>
                  </div>
                  {profiles.length > 0 && (
                    <span className="flex-shrink-0 text-[11px] font-black px-2.5 py-1 rounded-full"
                      style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
                      {profiles.length} activos
                    </span>
                  )}
                </div>

                {/* Results */}
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-6 h-6 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: accent }} />
                    <p className="text-xs text-white/30">Buscando candidatos...</p>
                  </div>
                ) : profiles.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="w-12 h-12 mx-auto text-white/10 mb-3" />
                    <p className="text-white/50 font-semibold">Sin resultados</p>
                    <p className="text-xs text-white/25 mt-1">Intenta con otros términos de búsqueda</p>
                  </div>
                ) : (
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profiles.map(p => (
                      <ProfileCard key={p.id} p={p} accent={accent} onClick={() => handleCardClick(p)} />
                    ))}
                  </div>

                  {/* Freemium upsell — logged in but no premium */}
                  {user && !viewerHasPremium && profiles.length > 0 && (
                    <div className="mt-2 rounded-2xl p-5 text-center relative overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg,rgba(245,158,11,0.10) 0%,rgba(120,53,15,0.08) 100%)",
                        border: "1px solid rgba(245,158,11,0.25)",
                      }}>
                      <div className="absolute inset-x-0 top-0 h-px"
                        style={{ background: "linear-gradient(90deg,transparent,rgba(251,191,36,0.5),transparent)" }} />
                      <Crown className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                      <p className="font-black text-white text-sm mb-1">
                        Consigue más trabajos — desbloquea postulaciones ilimitadas
                      </p>
                      <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Con Empresa Premium ves el teléfono y contactas directo a todos los candidatos sin límites.
                      </p>
                      <button
                        onClick={() => setShowPremiumPayment(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:opacity-90 active:scale-[0.97]"
                        style={{ background: "linear-gradient(135deg,#f59e0b,#b45309)", boxShadow: "0 0 20px rgba(245,158,11,0.30)" }}>
                        <Crown className="w-4 h-4" /> Activar Premium — $2/mes
                      </button>
                    </div>
                  )}

                  {/* Guest upsell */}
                  {!user && profiles.length > 0 && (
                    <div className="mt-2 rounded-2xl p-4 flex items-center gap-4"
                      style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.15)" }}>
                      <Lock className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white leading-tight">Postúlate sin límites</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
                          Crea tu cuenta gratuita para contactar candidatos
                        </p>
                      </div>
                      <button
                        onClick={() => setShowRegisterWall(true)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                        style={{ background: `linear-gradient(135deg,${accent},#3b82f6)` }}>
                        Registrarse
                      </button>
                    </div>
                  )}
                  </>
                )}
              </>
            ) : (
              <MyProfileTab accent={accent} />
            )}
          </div>
        </div>
      </main>

      {/* Full CV modal */}
      {selectedProfile && (
        <ProfileModal
          p={selectedProfile}
          isAuth={!!user}
          viewerHasPremium={viewerHasPremium}
          onClose={() => setSelectedProfile(null)}
          onNeedAuth={() => { setSelectedProfile(null); setShowRegisterWall(true); }}
          onSubscribe={() => { setSelectedProfile(null); setShowPremiumPayment(true); }}
          onStartChat={async (applicantId: number) => {
            if (!user) { setSelectedProfile(null); setShowRegisterWall(true); return; }
            if (!viewerHasPremium) { setSelectedProfile(null); setShowPremiumPayment(true); return; }
            try {
              const conv = await apiFetch("/api/jobs/conversations", {
                method: "POST",
                headers: { ...getAuthHeader(), "Content-Type": "application/json" },
                body: JSON.stringify({ applicantId }),
              });
              navigate(`/jobs/chat/${conv.id}`);
            } catch (err: any) {
              toast({ title: err?.message ?? "No se pudo iniciar el chat", variant: "destructive" });
            }
          }}
        />
      )}

      {/* Register wall */}
      <LoginWallModal
        open={showRegisterWall}
        onClose={() => setShowRegisterWall(false)}
        context="jobs"
      />

      {/* Business Premium payment modal (from contact gate) */}
      <PaymentModal
        open={showPremiumPayment}
        type="business_premium"
        onClose={() => setShowPremiumPayment(false)}
        onSuccess={msg => {
          setShowPremiumPayment(false);
          setPremiumSuccessMsg(msg);
        }}
      />
    </div>
  );
}
