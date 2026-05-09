import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlobalSearchBar } from "@/components/ui/GlobalSearchBar";
import { useGeolocation, formatDistance } from "@/hooks/useGeolocation";
import { getRequestOptions } from "@/lib/api";
import {
  Package, Wrench, Store as StoreIcon, Briefcase,
  MapPin, Star, Loader2, Crown, ChevronRight, Search as SearchIcon,
} from "lucide-react";

type Hit = {
  type: "product" | "worker" | "store" | "job";
  id: number;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  priceUsd?: number | null;
  rating?: number | null;
  isPremium?: boolean;
  distanceKm?: number | null;
  href: string;
  meta?: Record<string, any>;
};

type SearchResponse = {
  q: string;
  products: Hit[];
  workers: Hit[];
  stores: Hit[];
  jobs: Hit[];
  counts: { products: number; workers: number; stores: number; jobs: number };
};

type Tab = "all" | "product" | "worker" | "store" | "job";

const TAB_META: Record<Exclude<Tab, "all">, { label: string; icon: any; color: string; bg: string; border: string }> = {
  product: { label: "Productos", icon: Package, color: "#fb923c", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)" },
  worker:  { label: "Servicios", icon: Wrench,  color: "#22d3ee", bg: "rgba(6,182,212,0.10)",  border: "rgba(6,182,212,0.30)" },
  store:   { label: "Tiendas",   icon: StoreIcon, color: "#a78bfa", bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.30)" },
  job:     { label: "Empleo",    icon: Briefcase, color: "#fbbf24", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" },
};

export function GlobalSearchResultsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { coords } = useGeolocation();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("all");

  const q = useMemo(() => {
    const params = new URLSearchParams(search);
    return (params.get("q") ?? "").trim();
  }, [search]);

  useEffect(() => {
    if (!q || q.length < 2) {
      setData(null);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    const params = new URLSearchParams({ q, limit: "25" });
    if (coords?.latitude != null && coords?.longitude != null) {
      params.set("lat", String(coords.latitude));
      params.set("lng", String(coords.longitude));
    }
    fetch(`/api/search/global?${params.toString()}`, { ...getRequestOptions(), signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((res: SearchResponse) => setData(res))
      .catch(err => { if (err?.name !== "AbortError") setData(null); })
      .finally(() => setLoading(false));
    return () => ctl.abort();
  }, [q, coords?.latitude, coords?.longitude]);

  const totalCount = data
    ? data.counts.products + data.counts.workers + data.counts.stores + data.counts.jobs
    : 0;

  const visibleHits: Hit[] = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") {
      return [...data.products, ...data.workers, ...data.stores, ...data.jobs];
    }
    return data[`${activeTab}s` as keyof Pick<SearchResponse, "products" | "workers" | "stores" | "jobs">];
  }, [data, activeTab]);

  const tabs: { key: Tab; label: string; count: number }[] = useMemo(() => {
    if (!data) return [{ key: "all", label: "Todo", count: 0 }];
    return [
      { key: "all",     label: "Todo",      count: totalCount },
      { key: "product", label: "Productos", count: data.counts.products },
      { key: "worker",  label: "Servicios", count: data.counts.workers },
      { key: "store",   label: "Tiendas",   count: data.counts.stores },
      { key: "job",     label: "Empleo",    count: data.counts.jobs },
    ];
  }, [data, totalCount]);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-1 pb-12 space-y-5">
        {/* Header */}
        <div className="pt-1 space-y-3">
          <h1 className="text-2xl font-black text-white leading-tight">
            Resultados {q && <span className="text-white/45 font-bold">para "{q}"</span>}
          </h1>
          <GlobalSearchBar />
        </div>

        {/* Tabs */}
        {data && totalCount > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {tabs.map(t => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all"
                  style={
                    isActive
                      ? { background: "linear-gradient(135deg,#0ea5e9,#38bdf8)", color: "#fff", boxShadow: "0 4px 14px rgba(56,189,248,0.30)" }
                      : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {t.label}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-black"
                    style={{ background: isActive ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)" }}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-20 flex items-center justify-center text-white/40">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Buscando…
          </div>
        )}

        {/* Empty */}
        {!loading && q.length < 2 && (
          <div className="py-16 text-center space-y-3">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
              style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.25)" }}
            >
              <SearchIcon className="w-6 h-6" style={{ color: "#38bdf8" }} />
            </div>
            <div className="text-lg font-black text-white">Busca en toda la plataforma</div>
            <div className="text-sm text-white/45 max-w-md mx-auto">
              Encuentra servicios, productos, tiendas y candidatos cerca de ti.
              Escribe algo en el buscador.
            </div>
          </div>
        )}

        {!loading && q.length >= 2 && data && totalCount === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="text-5xl">🔍</div>
            <div className="text-lg font-black text-white">Sin resultados para "{q}"</div>
            <div className="text-sm text-white/45">Intenta con otra palabra o explora las categorías.</div>
            <button
              onClick={() => navigate("/client")}
              className="mt-3 px-5 py-2.5 rounded-2xl font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg,#0ea5e9,#38bdf8)" }}
            >
              Volver al inicio
            </button>
          </div>
        )}

        {/* Results grid */}
        {!loading && visibleHits.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleHits.map(h => {
              const meta = TAB_META[h.type];
              const Icon = meta.icon;
              return (
                <button
                  key={`${h.type}-${h.id}`}
                  onClick={() => navigate(h.href)}
                  className="flex items-center gap-3 p-3 rounded-2xl text-left transition hover:bg-white/[0.03]"
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Image */}
                  <div
                    className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                    style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                  >
                    {h.image ? (
                      <img src={h.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="w-7 h-7" style={{ color: meta.color }} />
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: meta.color }}
                      >
                        {meta.label.replace(/s$/, "")}
                      </span>
                      {h.isPremium && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-black tracking-widest flex items-center gap-0.5"
                          style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
                        >
                          <Crown className="w-2.5 h-2.5" /> PREMIUM
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] font-bold text-white truncate mt-0.5">{h.title}</div>
                    {h.subtitle && (
                      <div className="text-[12px] text-white/50 truncate mt-0.5">{h.subtitle}</div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                      {h.priceUsd != null && (
                        <span className="font-black text-white tabular-nums">${h.priceUsd.toFixed(2)}</span>
                      )}
                      {h.rating != null && h.rating > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-400">
                          <Star className="w-3 h-3 fill-current" />
                          {h.rating.toFixed(1)}
                        </span>
                      )}
                      {h.distanceKm != null && (
                        <span className="flex items-center gap-0.5" style={{ color: "#38bdf8" }}>
                          <MapPin className="w-3 h-3" />
                          {formatDistance(h.distanceKm)}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
