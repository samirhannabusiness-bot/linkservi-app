import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useSeo } from "@/lib/seo-helpers";
import { ArrowLeft, Clock, Calendar } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { ShareCard } from "@/components/share/ShareCard";

const BASE = "https://linkservi.com";

export function BlogArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [progress, setProgress] = useState(0);

  const { data, isLoading } = useQuery<{ article: any; related: any[] }>({
    queryKey: ["blog", slug],
    queryFn: async () => {
      const r = await fetch(`/api/blog/articles/${slug}`);
      if (!r.ok) throw new Error("notfound");
      return r.json();
    },
  });

  useEffect(() => {
    function onScroll() {
      const root = document.getElementById("root");
      const el = root || document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0;
      setProgress(pct);
    }
    const root = document.getElementById("root");
    (root || window).addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => (root || window).removeEventListener("scroll", onScroll);
  }, []);

  const a = data?.article;
  const related = data?.related ?? [];

  useSeo({
    title: a ? `${a.metaTitle || a.title} | LinkServi Blog` : "Artículo | LinkServi",
    description: a?.metaDescription || a?.excerpt || "Artículo del blog de LinkServi.",
    canonical: a ? `${BASE}/blog/${a.slug}` : undefined,
    image: a?.coverImageUrl || `${BASE}/opengraph.jpg`,
    type: "article",
    noIndex: !a,
    jsonLd: a
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: a.title,
            description: a.metaDescription || a.excerpt,
            image: a.coverImageUrl ? [a.coverImageUrl] : [`${BASE}/opengraph.jpg`],
            datePublished: a.publishedAt,
            dateModified: a.updatedAt,
            author: { "@type": "Person", name: a.authorName || "Equipo LinkServi" },
            publisher: { "@type": "Organization", name: "LinkServi", logo: { "@type": "ImageObject", url: `${BASE}/icon-192.png` } },
            mainEntityOfPage: `${BASE}/blog/${a.slug}`,
            keywords: (a.tags || []).join(", "),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
              { "@type": "ListItem", position: 2, name: "Blog", item: `${BASE}/blog` },
              { "@type": "ListItem", position: 3, name: a.title, item: `${BASE}/blog/${a.slug}` },
            ],
          },
        ]
      : undefined,
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#040c1a", color: "rgba(255,255,255,0.5)" }}>Cargando…</div>;
  }
  if (!a) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#040c1a", color: "white" }}>
        <h1 className="text-2xl font-bold mb-3">Artículo no encontrado</h1>
        <Link href="/blog" className="px-5 py-2.5 rounded-xl font-semibold" style={{ background: "#38bdf8" }}>Ver más artículos</Link>
      </div>
    );
  }

  const formattedDate = a.publishedAt
    ? new Date(a.publishedAt).toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div className="min-h-screen" style={{ background: "#040c1a", color: "white" }}>
      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 z-50" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #38bdf8, #818cf8)" }} />
      </div>

      <header className="sticky top-1 z-30 border-b" style={{ background: "rgba(4,12,26,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/blog" className="p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <p className="text-sm font-semibold truncate">Blog</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-10 pb-20">
        {/* Hero */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#7dd3fc" }}>{a.vertical} · {a.category}</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5 leading-[1.1]" style={{ letterSpacing: "-0.025em" }}>
            {a.title}
          </h1>
          <div className="flex items-center gap-4 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            <span>{a.authorName}</span>
            {formattedDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> {formattedDate}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {a.readMinutes} min
            </span>
          </div>
        </div>

        {a.coverImageUrl && (
          <div className="aspect-[16/9] rounded-3xl overflow-hidden mb-10" style={{ background: "rgba(255,255,255,0.04)" }}>
            <img src={a.coverImageUrl} alt={a.coverAlt || a.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Lead paragraph */}
        {a.excerpt && (
          <p className="text-xl md:text-2xl font-medium leading-relaxed mb-10" style={{ color: "rgba(255,255,255,0.92)", letterSpacing: "-0.005em" }}>
            {a.excerpt}
          </p>
        )}

        <MarkdownRenderer source={a.contentMd || ""} />

        {Array.isArray(a.tags) && a.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-12 pt-6 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {a.tags.map((t: string) => (
              <span key={t} className="px-3 py-1 rounded-full text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-12">
          <ShareCard url={`${BASE}/blog/${a.slug}`} title={a.title} text={a.excerpt} />
        </div>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-bold mb-5">Sigue leyendo</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {related.map((r) => (
                <Link key={r.id} href={`/blog/${r.slug}`}>
                  <article className="rounded-2xl overflow-hidden group cursor-pointer" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {r.coverImageUrl && (
                      <div className="aspect-[16/10] overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <img src={r.coverImageUrl} alt={r.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-bold leading-tight mb-1.5">{r.title}</h3>
                      <p className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                        <Clock className="w-3 h-3" /> {r.readMinutes} min
                      </p>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
