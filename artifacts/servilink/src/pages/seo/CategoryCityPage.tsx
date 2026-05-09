import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useSeo, titleCase, slugify } from "@/lib/seo-helpers";
import { ArrowLeft, MapPin, Star, ShieldCheck, Sparkles } from "lucide-react";

const BASE = "https://linkservi.com";

export function CategoryCityPage() {
  const params = useParams<{ trade: string; city?: string }>();
  const trade = params.trade || "";
  const city = params.city || "";
  const tradeName = titleCase(trade);
  const cityName = city ? titleCase(city) : "";

  const { data, isLoading } = useQuery<{ category: any; workers: any[] }>({
    queryKey: ["seo-cat", trade, city],
    queryFn: async () => {
      const url = city
        ? `/api/seo/workers/by-category/${trade}?city=${encodeURIComponent(city)}`
        : `/api/seo/workers/by-category/${trade}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("err");
      return r.json();
    },
  });

  const pageTitle = city
    ? `${tradeName} en ${cityName} | Profesionales verificados — LinkServi`
    : `${tradeName} en Venezuela | Profesionales verificados — LinkServi`;
  const pageDesc = city
    ? `Contrata ${tradeName.toLowerCase()} verificados en ${cityName}. Precios transparentes, calificaciones reales y pago seguro. Reserva en minutos por LinkServi.`
    : `Encuentra ${tradeName.toLowerCase()} verificados en toda Venezuela. Cobertura nacional, perfiles con calificaciones y pago protegido por LinkServi.`;
  const canonical = city ? `${BASE}/servicios/${trade}/${city}` : `${BASE}/servicios/${trade}`;

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
      { "@type": "ListItem", position: 2, name: "Servicios", item: `${BASE}/search` },
      { "@type": "ListItem", position: 3, name: tradeName, item: `${BASE}/servicios/${trade}` },
      ...(city
        ? [{ "@type": "ListItem", position: 4, name: cityName, item: canonical }]
        : []),
    ],
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: pageTitle,
    itemListElement: (data?.workers || []).slice(0, 20).map((w: any, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE}/p/${w.slug}`,
      name: w.userName,
    })),
  };

  useSeo({
    title: pageTitle,
    description: pageDesc,
    canonical,
    type: "website",
    jsonLd: [breadcrumbs, itemList],
  });

  const workers = data?.workers || [];

  return (
    <div className="min-h-screen" style={{ background: "#040c1a", color: "rgba(255,255,255,0.92)" }}>
      <header className="sticky top-0 z-30 border-b" style={{ background: "rgba(4,12,26,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Servicios · {tradeName}{city ? ` · ${cityName}` : ""}</p>
            <h1 className="text-base font-bold truncate">{tradeName}{city ? ` en ${cityName}` : " en Venezuela"}</h1>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 pt-10 pb-6">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-3" style={{ letterSpacing: "-0.02em" }}>
          {tradeName} {city ? <>en <span style={{ color: "#38bdf8" }}>{cityName}</span></> : <>en <span style={{ color: "#38bdf8" }}>Venezuela</span></>}
        </h1>
        <p className="text-base md:text-lg max-w-2xl" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
          {pageDesc}
        </p>
      </section>

      {isLoading && (
        <div className="max-w-5xl mx-auto px-4 py-20 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
          Cargando profesionales…
        </div>
      )}

      {!isLoading && workers.length === 0 && (
        <section className="max-w-3xl mx-auto px-4 py-12">
          <div className="rounded-3xl p-8 md:p-12 text-center" style={{ background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(56,189,248,0.02))", border: "1px solid rgba(56,189,248,0.2)" }}>
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center" style={{ background: "rgba(56,189,248,0.15)" }}>
              <Sparkles className="w-10 h-10" style={{ color: "#38bdf8" }} />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Próximamente los mejores {tradeName.toLowerCase()}{city ? ` de ${cityName}` : ""}
            </h2>
            <p className="text-base mb-8 max-w-md mx-auto" style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
              Estamos sumando a los profesionales verificados de tu zona. Sé el primero en aparecer aquí y captar clientes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: "#38bdf8", boxShadow: "0 8px 24px rgba(56,189,248,0.3)" }}
              >
                ¿Eres {tradeName.toLowerCase().endsWith("s") ? tradeName.toLowerCase().slice(0, -1) : tradeName.toLowerCase()}? Regístrate gratis
              </Link>
              <Link
                href="/ganar-dinero"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Cómo funciona
              </Link>
            </div>
            <p className="text-xs mt-6" style={{ color: "rgba(255,255,255,0.35)" }}>
              Ya hay clientes buscando este servicio en tu zona. No los hagas esperar.
            </p>
          </div>
        </section>
      )}

      {workers.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workers.map((w) => (
              <Link key={w.id} href={`/p/${w.slug}`}>
                <article className="rounded-2xl p-5 transition-all cursor-pointer h-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0" style={{ background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}>
                      {w.avatarUrl ? (
                        <img src={w.avatarUrl} alt={w.userName} className="w-full h-full rounded-2xl object-cover" />
                      ) : (
                        w.userName?.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h3 className="font-bold truncate">{w.userName}</h3>
                        {w.isPremium && <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#fbbf24" }} />}
                      </div>
                      <div className="flex items-center gap-1 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                        <ShieldCheck className="w-3 h-3" style={{ color: "#10b981" }} />
                        Verificado
                      </div>
                    </div>
                  </div>
                  {w.description && (
                    <p className="text-sm mb-3 line-clamp-2" style={{ color: "rgba(255,255,255,0.65)" }}>
                      {w.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.7)" }}>
                        <Star className="w-3 h-3" style={{ color: "#fbbf24" }} fill="#fbbf24" />
                        {(w.rating || 0).toFixed(1)} <span style={{ color: "rgba(255,255,255,0.4)" }}>({w.reviewCount})</span>
                      </span>
                      {w.city && (
                        <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                          <MapPin className="w-3 h-3" />
                          {w.city}
                        </span>
                      )}
                    </div>
                    <span className="font-bold" style={{ color: "#38bdf8" }}>${w.servicePrice ?? w.basePrice}</span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg font-bold mb-2">¿Buscas {tradeName.toLowerCase()} en otra ciudad?</h2>
          <div className="flex flex-wrap gap-2 mt-3">
            {["Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay", "Maturín", "Mérida"].map((c) => (
              <Link
                key={c}
                href={`/servicios/${trade}/${slugify(c)}`}
                className="px-3 py-1.5 rounded-full text-xs transition-all"
                style={{ background: "rgba(56,189,248,0.1)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,0.2)" }}
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
