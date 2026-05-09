import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Search, X, Sparkles, Wrench, Package, Store as StoreIcon, Briefcase, MapPin, Loader2, Star } from "lucide-react";
import { useGeolocation, formatDistance } from "@/hooks/useGeolocation";
import { getRequestOptions } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types matching /api/search/global response
// ─────────────────────────────────────────────────────────────────────────────
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

const TYPE_META: Record<Hit["type"], { label: string; icon: any; color: string; bg: string; border: string }> = {
  product: { label: "Productos", icon: Package, color: "#fb923c", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.25)" },
  worker:  { label: "Servicios", icon: Wrench,  color: "#22d3ee", bg: "rgba(6,182,212,0.10)",  border: "rgba(6,182,212,0.25)" },
  store:   { label: "Tiendas",   icon: StoreIcon, color: "#a78bfa", bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.25)" },
  job:     { label: "Empleo",    icon: Briefcase, color: "#fbbf24", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)" },
};

const SUGGESTED = ["Plomero", "Farmatodo", "Pintura", "Niñera", "iPhone", "Carpintero"];

const DEFAULT_PLACEHOLDER = "Busca un servicio, producto o tienda…";

export type GlobalSearchBarProps = {
  /** Input placeholder (e.g. home hero). */
  placeholder?: string;
  /** `hero` = larger touch targets and typography for the landing focal search. */
  variant?: "default" | "hero";
  className?: string;
};

export function GlobalSearchBar({
  placeholder = DEFAULT_PLACEHOLDER,
  variant = "default",
  className = "",
}: GlobalSearchBarProps = {}) {
  const [, navigate] = useLocation();
  const { coords } = useGeolocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // ── Debounced fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      const params = new URLSearchParams({ q: q.trim(), limit: "5" });
      if (coords?.latitude != null && coords?.longitude != null) {
        params.set("lat", String(coords.latitude));
        params.set("lng", String(coords.longitude));
      }
      fetch(`/api/search/global?${params.toString()}`, {
        ...getRequestOptions(),
        signal: ctl.signal,
      })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((res: SearchResponse) => {
          setData(res);
          setLoading(false);
        })
        .catch(err => {
          if (err?.name !== "AbortError") setLoading(false);
        });
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, coords?.latitude, coords?.longitude]);

  // ── Click-outside to close ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Keyboard: Esc closes ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allHits = useMemo<Hit[]>(() => {
    if (!data) return [];
    return [...data.products, ...data.workers, ...data.stores, ...data.jobs];
  }, [data]);

  const totalCount = data
    ? data.counts.products + data.counts.workers + data.counts.stores + data.counts.jobs
    : 0;

  const goToFullResults = () => {
    if (q.trim().length < 2) return;
    setOpen(false);
    navigate(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };

  const handleSuggested = (term: string) => {
    setQ(term);
    inputRef.current?.focus();
    setOpen(true);
  };

  const onHitClick = (h: Hit) => {
    setOpen(false);
    setQ("");
    navigate(h.href);
  };

  const isHero = variant === "hero";

  return (
    <div ref={wrapRef} className={`relative w-full ${className}`.trim()}>
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div
        className={
          isHero
            ? "flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4 sm:py-5 rounded-3xl transition-all duration-200"
            : "flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200"
        }
        style={{
          background: open ? "rgba(56,189,248,0.06)" : "rgba(255,255,255,0.04)",
          border: open ? "1px solid rgba(56,189,248,0.35)" : "1px solid rgba(255,255,255,0.08)",
          boxShadow: open
            ? "0 0 0 4px rgba(56,189,248,0.08), 0 8px 24px rgba(56,189,248,0.10)"
            : isHero
              ? "0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)"
              : "none",
        }}
      >
        <Search
          className={`flex-shrink-0 ${isHero ? "w-6 h-6 sm:w-7 sm:h-7" : "w-5 h-5"}`}
          style={{ color: open ? "#38bdf8" : "rgba(255,255,255,0.45)" }}
        />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter") goToFullResults();
          }}
          placeholder={placeholder}
          className={
            isHero
              ? "flex-1 bg-transparent outline-none text-base sm:text-lg text-white placeholder:text-white/35"
              : "flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-white/35"
          }
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#38bdf8" }} />}
        {q && !loading && (
          <button
            onClick={() => { setQ(""); setData(null); inputRef.current?.focus(); }}
            className="w-6 h-6 rounded-full flex items-center justify-center transition hover:bg-white/10"
            aria-label="Limpiar"
          >
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        )}
      </div>

      {/* ── Dropdown panel ────────────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto"
          style={{
            background: "#0a1424",
            border: "1px solid rgba(56,189,248,0.18)",
            boxShadow: "0 24px 48px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          {/* Empty state — show suggestions */}
          {q.trim().length < 2 && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/40">
                <Sparkles className="w-3.5 h-3.5" style={{ color: "#38bdf8" }} />
                Búsquedas populares
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSuggested(s)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-white/80 transition hover:text-white"
                    style={{
                      background: "rgba(56,189,248,0.08)",
                      border: "1px solid rgba(56,189,248,0.22)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-white/30 pt-1">
                Escribe al menos 2 letras para buscar en toda la plataforma.
              </div>
            </div>
          )}

          {/* Loading state when no prior data */}
          {q.trim().length >= 2 && loading && !data && (
            <div className="p-6 flex items-center justify-center gap-2 text-white/45 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando en LinkServi…
            </div>
          )}

          {/* No-results */}
          {data && totalCount === 0 && !loading && (
            <div className="p-6 text-center space-y-2">
              <div className="text-3xl">🔍</div>
              <div className="text-sm text-white/70 font-semibold">Sin resultados para “{q}”</div>
              <div className="text-xs text-white/40">Prueba con otra palabra o explora las categorías.</div>
            </div>
          )}

          {/* Result groups */}
          {data && totalCount > 0 && (
            <div className="py-2">
              {(["product", "worker", "store", "job"] as const).map(type => {
                const list = data[`${type}s` as "products" | "workers" | "stores" | "jobs"];
                if (!list || list.length === 0) return null;
                const meta = TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <div key={type} className="pb-2">
                    <div
                      className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-[11px] font-black uppercase tracking-widest"
                      style={{ color: meta.color }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {meta.label}
                      <span className="text-white/30 font-semibold">({list.length})</span>
                    </div>
                    {list.map(h => (
                      <button
                        key={`${type}-${h.id}`}
                        onClick={() => onHitClick(h)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04] text-left"
                      >
                        {/* Thumbnail */}
                        <div
                          className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                        >
                          {h.image ? (
                            <img src={h.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Icon className="w-5 h-5" style={{ color: meta.color }} />
                          )}
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[14px] font-bold text-white truncate">{h.title}</span>
                            {h.isPremium && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-black tracking-widest"
                                style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
                              >
                                ★
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-white/50 truncate">
                            {h.subtitle && <span className="truncate">{h.subtitle}</span>}
                            {h.rating != null && h.rating > 0 && (
                              <span className="flex items-center gap-0.5 flex-shrink-0">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                {h.rating.toFixed(1)}
                              </span>
                            )}
                            {h.distanceKm != null && (
                              <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: "#38bdf8" }}>
                                <MapPin className="w-2.5 h-2.5" />
                                {formatDistance(h.distanceKm)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price */}
                        {h.priceUsd != null && (
                          <div className="text-right flex-shrink-0">
                            <div className="text-[13px] font-black text-white">${h.priceUsd.toFixed(2)}</div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}

              {/* See all */}
              <button
                onClick={goToFullResults}
                className="w-full px-4 py-3 mt-1 text-center text-[13px] font-bold transition hover:bg-white/[0.04]"
                style={{ color: "#38bdf8", borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                Ver todos los resultados para “{q}” →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
