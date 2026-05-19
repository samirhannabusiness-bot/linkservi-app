import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useSeo } from "@/lib/seo-helpers";
import { ArrowLeft, Clock, BookOpen } from "lucide-react";

const BASE = "https://linkservi.com";
const VERTICALS = [
  { id: "", label: "Todo" },
  { id: "servicios", label: "Servicios" },
  { id: "tienda", label: "Tienda" },
  { id: "empleo", label: "Empleo" },
];

export function BlogIndexPage() {
  const [vertical, setVertical] = useState("");
  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ["blog-list", vertical],
    queryFn: async () => {
      const url = vertical ? `/api/blog/articles?vertical=${vertical}` : "/api/blog/articles";
      const r = await fetch(url);
      return r.json();
    },
  });

  useSeo({
    title: "Blog LinkServi — Guías, consejos y noticias del ServiMarket",
    description: "Aprende cómo contratar mejor, vender más y gestionar tu vida con servicios profesionales. Guías expertas de LinkServi.",
    canonical: `${BASE}/blog`,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "LinkServi Blog",
      url: `${BASE}/blog`,
      publisher: { "@type": "Organization", name: "LinkServi", logo: `${BASE}/icon-192.png` },
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen" style={{ background: "#040c1a", color: "white" }}>
      <header className="sticky top-0 z-30 border-b" style={{ background: "rgba(4,12,26,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-bold">Blog LinkServi</h1>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 pt-12 pb-6">
        <p className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "#7dd3fc" }}>El blog</p>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4" style={{ letterSpacing: "-0.025em" }}>
          Guías, consejos y<br />
          <span style={{ color: "#38bdf8" }}>tendencias</span> del servicio
        </h1>
        <p className="text-lg max-w-2xl" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
          Lo que necesitas saber para contratar mejor, vender más y aprovechar al máximo el ecosistema LinkServi.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 mb-8">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {VERTICALS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVertical(v.id)}
              className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
              style={
                vertical === v.id
                  ? { background: "#38bdf8", color: "white" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-24">
        {isLoading && <div className="text-center py-20" style={{ color: "rgba(255,255,255,0.5)" }}>Cargando…</div>}
        {!isLoading && items.length === 0 && (
          <div className="rounded-3xl p-10 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(255,255,255,0.3)" }} />
            <h2 className="text-lg font-bold mb-2">Próximamente artículos</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Estamos preparando contenido increíble. Vuelve pronto.</p>
          </div>
        )}
        <div className="space-y-6">
          {items.map((a) => (
            <Link key={a.id} href={`/blog/${a.slug}`}>
              <article className="group cursor-pointer">
                {a.coverImageUrl && (
                  <div className="aspect-[16/9] rounded-2xl overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <img src={a.coverImageUrl} alt={a.coverAlt || a.title} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" />
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs mb-2" style={{ color: "#7dd3fc" }}>
                  <span className="font-semibold uppercase tracking-wider">{a.vertical}</span>
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
                  <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                    <Clock className="w-3 h-3" /> {a.readMinutes} min
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-2 leading-tight transition-colors" style={{ letterSpacing: "-0.015em" }}>
                  {a.title}
                </h2>
                <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{a.excerpt}</p>
                <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.4)" }}>Por {a.authorName}</p>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
