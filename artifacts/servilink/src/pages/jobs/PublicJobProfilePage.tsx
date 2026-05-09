import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useSeo } from "@/lib/seo-helpers";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  MapPin, CheckCircle, Briefcase, ArrowLeft, Crown,
  Play, Pause, Building2, Share2, ExternalLink,
} from "lucide-react";
import { useRef, useState } from "react";

const BASE = "https://linkservi.com";

// ── Types ──────────────────────────────────────────────────────────────────
interface WorkExp { company: string; role: string; years: number; }
interface JobProfileData {
  id: number; userId: number; userName: string; userAvatar: string | null;
  bio: string; videoUrl: string | null; city: string;
  skills: string[]; workExperience: WorkExp[];
  isAvailable: boolean; isFeatured: boolean; isVerified: boolean;
  slug: string; createdAt: string;
}

// ── Avatar ─────────────────────────────────────────────────────────────────
function Av({ name, url, size = 20 }: { name: string; url: string | null; size?: number }) {
  const rem = `w-${size} h-${size}`;
  if (url) return <img src={url} className={`${rem} rounded-full object-cover ring-2 ring-white/10`} alt={name} />;
  return (
    <div className={`${rem} rounded-full flex items-center justify-center text-2xl font-black text-white flex-shrink-0`}
      style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
      {name?.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Video player ───────────────────────────────────────────────────────────
function VideoPlayer({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const v = ref.current; if (!v) return;
    playing ? (v.pause(), setPlaying(false)) : (v.play(), setPlaying(true));
  };
  return (
    <div className="relative rounded-2xl overflow-hidden cursor-pointer" style={{ background: "#000" }} onClick={toggle}>
      <video ref={ref} src={url} className="w-full object-contain" style={{ maxHeight: 340, display: "block" }}
        playsInline preload="metadata" onEnded={() => setPlaying(false)} />
      <div className="absolute inset-0 flex items-center justify-center"
        style={{ background: playing ? "transparent" : "rgba(0,0,0,0.38)" }}>
        {!playing && (
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)" }}>
            <Play className="w-7 h-7 text-white ml-1" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Share button ───────────────────────────────────────────────────────────
function ShareBtn({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* ignore */ }
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={share}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
      <Share2 className="w-4 h-4" />
      {copied ? "¡Copiado!" : "Compartir"}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export function PublicJobProfilePage() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const slug = params.slug || "";

  const { data, isLoading, isError } = useQuery<{ profile: JobProfileData }>({
    queryKey: ["public-job-profile", slug],
    queryFn: async () => {
      const r = await fetch(`/api/seo/job-profile/${slug}`);
      if (!r.ok) throw new Error("notfound");
      return r.json();
    },
    retry: false,
  });

  const p = data?.profile;
  const totalYears = p?.workExperience.reduce((s, e) => s + e.years, 0) ?? 0;
  const canonical = `${BASE}/jobs/perfil/${slug}`;
  const image = p?.userAvatar || `${BASE}/opengraph.jpg`;

  const title = p
    ? `${p.userName}${p.skills[0] ? ` — ${p.skills[0]}` : ""}${p.city ? ` en ${p.city}` : ""} | Bolsa de Empleo LinkServi`
    : "Candidato | Bolsa de Empleo LinkServi";

  const desc = p
    ? `${p.userName}${p.isVerified ? ", perfil verificado," : ""} busca empleo${p.city ? ` en ${p.city}, Venezuela` : " en Venezuela"}. ${p.skills.length > 0 ? `Habilidades: ${p.skills.slice(0, 4).join(", ")}.` : ""} ${totalYears > 0 ? `${totalYears} años de experiencia.` : ""} ${(p.bio || "").slice(0, 100).trim()}`.trim()
    : "Perfil de candidato verificado en la Bolsa de Empleo de LinkServi.";

  useSeo({
    title,
    description: desc,
    canonical,
    image,
    type: "profile",
    noIndex: !p,
    jsonLd: p
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Person",
            name: p.userName,
            description: p.bio || `Candidato${p.city ? ` en ${p.city}` : ""} registrado en LinkServi`,
            image: p.userAvatar ?? undefined,
            url: canonical,
            knowsAbout: p.skills,
            address: p.city ? {
              "@type": "PostalAddress",
              addressLocality: p.city,
              addressCountry: "VE",
            } : undefined,
            jobTitle: p.skills[0] ?? undefined,
            alumniOf: p.workExperience.map(e => ({
              "@type": "Organization",
              name: e.company,
            })),
            worksFor: p.isAvailable ? {
              "@type": "Organization",
              name: "Disponible para contratar",
            } : undefined,
            sameAs: [`${BASE}/jobs`],
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
              { "@type": "ListItem", position: 2, name: "Bolsa de Empleo", item: `${BASE}/jobs` },
              { "@type": "ListItem", position: 3, name: p.userName, item: canonical },
            ],
          },
        ]
      : undefined,
  });

  return (
    <div className="min-h-screen" style={{ background: "#040c1a" }}>
      <Sidebar />

      <div className="md:pl-[240px] px-4 py-6 max-w-2xl mx-auto">

        {/* Back */}
        <button onClick={() => navigate("/jobs")}
          className="flex items-center gap-2 text-sm font-semibold mb-6 transition-opacity hover:opacity-70"
          style={{ color: "rgba(255,255,255,0.45)" }}>
          <ArrowLeft className="w-4 h-4" />
          Bolsa de Empleo
        </button>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-32 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="h-24 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
        )}

        {/* Not found */}
        {isError && (
          <div className="text-center py-20">
            <Briefcase className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(255,255,255,0.2)" }} />
            <p className="text-white/60 font-semibold mb-2">Perfil no encontrado</p>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.35)" }}>
              Este candidato no está disponible actualmente.
            </p>
            <button onClick={() => navigate("/jobs")}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)" }}>
              Ver candidatos disponibles
            </button>
          </div>
        )}

        {/* Profile */}
        {p && (
          <div className="space-y-4">

            {/* Hero card */}
            <div className="rounded-2xl p-5 relative overflow-hidden"
              style={p.isFeatured ? {
                background: "linear-gradient(135deg,rgba(251,191,36,0.07),rgba(8,8,20,0.9))",
                border: "1px solid rgba(251,191,36,0.4)",
                boxShadow: "0 0 32px rgba(251,191,36,0.08), 0 8px 32px rgba(0,0,0,0.5)",
              } : {
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>

              {p.isFeatured && (
                <div className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: "linear-gradient(90deg,transparent,rgba(251,191,36,0.55) 40%,rgba(251,191,36,0.55) 60%,transparent)" }} />
              )}

              <div className="flex items-start gap-4">
                <Av name={p.userName} url={p.userAvatar} size={20} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <h1 className="text-xl font-black text-white leading-tight">{p.userName}</h1>
                      {p.skills[0] && (
                        <p className="text-sm font-semibold mt-0.5" style={{ color: "rgba(6,182,212,0.85)" }}>
                          {p.skills[0]}
                        </p>
                      )}
                    </div>
                    <ShareBtn url={canonical} title={title} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {p.isVerified && (
                      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
                        style={{ background: "rgba(16,185,129,0.14)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <CheckCircle className="w-3 h-3" /> Verificado
                      </span>
                    )}
                    {p.isFeatured && (
                      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
                        style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}>
                        <Crown className="w-3 h-3" /> Destacado
                      </span>
                    )}
                    {p.isAvailable && (
                      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
                        style={{ background: "rgba(6,182,212,0.12)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.25)" }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
                        Disponible
                      </span>
                    )}
                  </div>

                  {p.city && (
                    <p className="flex items-center gap-1.5 text-sm mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                      <MapPin className="w-3.5 h-3.5" />
                      {p.city}, Venezuela
                      {totalYears > 0 && (
                        <span className="ml-2">· {totalYears} año{totalYears !== 1 ? "s" : ""} de exp.</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Bio */}
            {p.bio && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Sobre mí
                </p>
                <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{p.bio}</p>
              </div>
            )}

            {/* Skills */}
            {p.skills.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Habilidades
                </p>
                <div className="flex flex-wrap gap-2">
                  {p.skills.map(s => (
                    <span key={s} className="text-sm px-3 py-1.5 rounded-xl font-medium"
                      style={{ background: "rgba(6,182,212,0.1)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.2)" }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Experience */}
            {p.workExperience.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Experiencia laboral
                </p>
                <div className="space-y-3">
                  {p.workExperience.map((e, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                      <div>
                        <p className="text-sm font-semibold text-white/85">{e.role}</p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {e.company} · {e.years} año{e.years !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video */}
            {p.videoUrl && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Video de presentación
                </p>
                <VideoPlayer url={p.videoUrl} />
              </div>
            )}

            {/* CTA */}
            <div className="rounded-2xl p-5" style={{
              background: "linear-gradient(135deg,rgba(6,182,212,0.08),rgba(59,130,246,0.06))",
              border: "1px solid rgba(6,182,212,0.2)",
            }}>
              <p className="font-bold text-white mb-1">¿Te interesa este candidato?</p>
              <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
                Contacta a {p.userName.split(" ")[0]} directamente a través de la plataforma.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={() => navigate("/jobs")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)" }}>
                  <Briefcase className="w-4 h-4" />
                  Ver todos los candidatos
                </button>
                <a href="/register"
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <ExternalLink className="w-4 h-4" />
                  Registrarse gratis
                </a>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
