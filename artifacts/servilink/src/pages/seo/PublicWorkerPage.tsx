import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useSeo } from "@/lib/seo-helpers";
import { ArrowLeft, MapPin, Star, ShieldCheck, Sparkles, MessageCircle, Calendar } from "lucide-react";
import { ShareCard } from "@/components/share/ShareCard";

const BASE = "https://linkservi.com";

export function PublicWorkerPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const { data, isLoading } = useQuery<{ worker: any }>({
    queryKey: ["public-worker", slug],
    queryFn: async () => {
      const r = await fetch(`/api/seo/worker/${slug}`);
      if (!r.ok) throw new Error("notfound");
      return r.json();
    },
  });

  const w = data?.worker;
  const title = w
    ? `${w.userName} — ${w.categoryName ?? "Profesional"}${w.city ? ` en ${w.city}` : ""} | LinkServi`
    : "Perfil profesional | LinkServi";
  const desc = w
    ? `${w.userName}, ${w.categoryName ?? "profesional"} verificado${w.city ? ` en ${w.city}` : " en Venezuela"}. ${(w.description || "").slice(0, 120)} Reserva por LinkServi.`
    : "Perfil profesional verificado en LinkServi.";
  const canonical = `${BASE}/p/${slug}`;
  const image = w?.avatarUrl || `${BASE}/opengraph.jpg`;

  useSeo({
    title,
    description: desc,
    canonical,
    image,
    type: "profile",
    noIndex: !w,
    jsonLd: w
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            name: w.userName,
            description: w.description || `${w.categoryName ?? "Profesional"} verificado en LinkServi`,
            image,
            url: canonical,
            areaServed: w.city || "Venezuela",
            aggregateRating: w.reviewCount > 0 ? {
              "@type": "AggregateRating",
              ratingValue: w.rating?.toFixed(1) ?? "5.0",
              reviewCount: w.reviewCount,
            } : undefined,
            provider: {
              "@type": "Person",
              name: w.userName,
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
              ...(w.categorySlug
                ? [{ "@type": "ListItem", position: 2, name: w.categoryName, item: `${BASE}/servicios/${w.categorySlug}` }]
                : []),
              { "@type": "ListItem", position: w.categorySlug ? 3 : 2, name: w.userName, item: canonical },
            ],
          },
        ]
      : undefined,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#040c1a", color: "rgba(255,255,255,0.5)" }}>
        Cargando…
      </div>
    );
  }
  if (!w) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#040c1a", color: "white" }}>
        <h1 className="text-2xl font-bold mb-2">Perfil no encontrado</h1>
        <p className="mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>Este profesional no está disponible.</p>
        <Link href="/" className="px-5 py-2.5 rounded-xl font-semibold" style={{ background: "#38bdf8", color: "white" }}>Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#040c1a", color: "white" }}>
      <header className="sticky top-0 z-30 border-b" style={{ background: "rgba(4,12,26,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={w.categorySlug ? `/servicios/${w.categorySlug}` : "/"} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <p className="text-sm font-semibold truncate">{w.userName}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-3xl font-bold flex-shrink-0" style={{ background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}>
            {w.avatarUrl ? <img src={w.avatarUrl} alt={w.userName} className="w-full h-full rounded-3xl object-cover" /> : w.userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <h1 className="text-2xl md:text-3xl font-extrabold">{w.userName}</h1>
              {w.isPremium && <Sparkles className="w-5 h-5" style={{ color: "#fbbf24" }} />}
            </div>
            <p className="text-base mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>
              {w.categoryName ?? "Profesional"}{w.city ? ` · ${w.city}` : ""}
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-3 text-sm">
              {w.reviewCount > 0 && (
                <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                  <Star className="w-4 h-4" style={{ color: "#fbbf24" }} fill="#fbbf24" />
                  {(w.rating || 0).toFixed(1)} <span style={{ color: "rgba(255,255,255,0.5)" }}>({w.reviewCount})</span>
                </span>
              )}
              {w.isVerified && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#34d399" }}>
                  <ShieldCheck className="w-3 h-3" /> Verificado
                </span>
              )}
            </div>
          </div>
        </div>

        {w.description && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-2">Sobre {w.userName.split(" ")[0]}</h2>
            <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{w.description}</p>
          </section>
        )}

        {Array.isArray(w.skills) && w.skills.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-3">Especialidades</h2>
            <div className="flex flex-wrap gap-2">
              {w.skills.map((s: string) => (
                <span key={s} className="px-3 py-1.5 rounded-full text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Servicios</p>
            <p className="text-xl font-extrabold">{w.completedJobs ?? 0}</p>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Calificación</p>
            <p className="text-xl font-extrabold">{(w.rating || 0).toFixed(1)}</p>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Desde</p>
            <p className="text-xl font-extrabold" style={{ color: "#38bdf8" }}>${w.basePrice ?? 0}</p>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link href={`/client/book/${w.id}`} className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-white transition-all" style={{ background: "#38bdf8", boxShadow: "0 8px 24px rgba(56,189,248,0.3)" }}>
            <Calendar className="w-4 h-4" /> Reservar
          </Link>
          <Link href={`/client/worker/${w.id}`} className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold transition-all" style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}>
            <MessageCircle className="w-4 h-4" /> Ver perfil completo
          </Link>
        </div>

        <ShareCard url={canonical} title={`${w.userName} en LinkServi`} text={desc} />
      </main>
    </div>
  );
}
