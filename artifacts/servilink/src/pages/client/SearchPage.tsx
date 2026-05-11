import { useState, useMemo, useEffect, useRef } from "react";
import { LoginWallModal } from "@/components/ui/LoginWallModal";
import { useLocation, useSearch } from "wouter";
import { useListWorkers, useListCategories } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StarRating } from "@/components/ui/StarRating";
import { WorkerLevelBadge } from "@/components/ui/WorkerLevelBadge";
import { WorkerMap } from "@/components/ui/WorkerMap";
import { useGeolocation, haversineDistance, formatDistance } from "@/hooks/useGeolocation";
import { useBcvRate } from "@/hooks/useBcvRate";
import {
  Search, Shield, Map as MapIcon, List, Zap, MapPin, Navigation,
  Star, ChevronDown, ChevronRight, LocateFixed, RefreshCw, AlertCircle, CheckCircle2,
  Crown, Flame, BadgeCheck, X, SlidersHorizontal, ArrowRight,
} from "lucide-react";
import { VENEZUELA_STATES, getCitiesForState } from "@/lib/venezuela-locations";
import { useAuth } from "@/lib/auth-context";
import { getRequestOptions, track } from "@/lib/api";
import { mediaSrc } from "@/lib/media-url";

const PAGE_SIZE = 12;

// ─── Small UI atoms ────────────────────────────────────────────────────────
function PremiumBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider uppercase"
      style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24" }}>
      <Crown className="w-3 h-3" fill="currentColor" /> Premium
    </span>
  );
}
function TopProfileBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider uppercase"
      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#F87171" }}>
      <Flame className="w-3 h-3" /> Destacado
    </span>
  );
}
function DistanceBadge({ km }: { km: number }) {
  const isNear = km < 5;
  const isClose = km < 25;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold ${
      isNear ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
      isClose ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" :
      "bg-white/5 text-white/50 border border-white/10"
    }`}>
      <MapPin className="w-3 h-3" /> A {formatDistance(km)}
    </span>
  );
}

// ─── Speed-Matching banner ────────────────────────────────────────────────
function SpeedMatchingBanner() {
  return (
    <div
      className="flex items-start sm:items-center gap-3 px-4 sm:px-5 py-3.5 rounded-2xl"
      style={{
        background: "linear-gradient(90deg, rgba(6,182,212,0.10), rgba(59,130,246,0.06))",
        border: "1px solid rgba(6,182,212,0.25)",
      }}
    >
      <div className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
        style={{ background: "rgba(6,182,212,0.18)", border: "1px solid rgba(6,182,212,0.3)" }}>
        <Zap className="w-4 h-4 text-cyan-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white leading-tight">
          Speed-Matching activo
        </p>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
          Los profesionales cercanos están recibiendo tu alerta para ofrecerte disponibilidad inmediata.
        </p>
      </div>
    </div>
  );
}

// ─── Filter Sidebar (reusable for desktop sidebar + mobile drawer) ────────
interface FilterState {
  availability: "all" | "now" | "scheduled";
  minRating: number;
  priceMin: string;
  priceMax: string;
  verifiedOnly: boolean;
  state: string;
  city: string;
}
const DEFAULT_FILTERS: FilterState = {
  availability: "all",
  minRating: 0,
  priceMin: "",
  priceMax: "",
  verifiedOnly: false,
  state: "",
  city: "",
};

function FiltersPanel({
  filters, setFilters, onApply, onClear, onClose, isMobile,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  onApply: () => void;
  onClear: () => void;
  onClose?: () => void;
  isMobile?: boolean;
}) {
  const cities = filters.state ? getCitiesForState(filters.state) : [];
  return (
    <div
      className="rounded-3xl p-5 space-y-5 h-fit"
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">Filtros</h3>
        {isMobile && onClose && (
          <button onClick={onClose} aria-label="Cerrar"
            className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            <X className="w-4 h-4 text-white/70" />
          </button>
        )}
      </div>

      {/* Disponibilidad */}
      <div>
        <p className="text-[11px] font-bold text-white/45 uppercase tracking-wider mb-2">Disponibilidad</p>
        <div className="space-y-1.5">
          {([
            { v: "all", l: "Cualquiera" },
            { v: "now", l: "Ahora (urgencias)" },
            { v: "scheduled", l: "Programado" },
          ] as const).map((o) => (
            <label key={o.v} className="flex items-center gap-2.5 cursor-pointer text-sm text-white/80">
              <input
                type="radio"
                name="avail"
                checked={filters.availability === o.v}
                onChange={() => setFilters({ ...filters, availability: o.v })}
                className="accent-cyan-500"
              />
              {o.l}
            </label>
          ))}
        </div>
      </div>

      {/* Calificación */}
      <div>
        <p className="text-[11px] font-bold text-white/45 uppercase tracking-wider mb-2">Calificación mínima</p>
        <div className="flex flex-wrap gap-1.5">
          {[0, 3, 4, 4.5].map((r) => {
            const active = filters.minRating === r;
            return (
              <button
                key={r}
                onClick={() => setFilters({ ...filters, minRating: r })}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                style={
                  active
                    ? { background: "rgba(6,182,212,0.18)", border: "1px solid rgba(6,182,212,0.4)", color: "#22d3ee" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }
                }
              >
                {r === 0 ? "Cualquiera" : (
                  <>
                    {r}+ <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rango de precio */}
      <div>
        <p className="text-[11px] font-bold text-white/45 uppercase tracking-wider mb-2">Rango de precio (visita)</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[10px] text-white/40 mb-1">Mín</p>
            <input
              type="number"
              inputMode="numeric"
              placeholder="$0"
              value={filters.priceMin}
              onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-white/40 mb-1">Máx</p>
            <input
              type="number"
              inputMode="numeric"
              placeholder="$150+"
              value={filters.priceMax}
              onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
        </div>
      </div>

      {/* Confianza */}
      <div>
        <p className="text-[11px] font-bold text-white/45 uppercase tracking-wider mb-2">Confianza</p>
        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-white/80">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
            className="accent-cyan-500"
          />
          <Shield className="w-4 h-4 text-cyan-400" />
          Solo profesionales verificados
        </label>
      </div>

      {/* Ubicación (Venezuela) */}
      <div>
        <p className="text-[11px] font-bold text-white/45 uppercase tracking-wider mb-2">Ubicación</p>
        <div className="space-y-2">
          <div className="relative">
            <select
              value={filters.state}
              onChange={(e) => setFilters({ ...filters, state: e.target.value, city: "" })}
              className="w-full pl-3 pr-8 py-2 rounded-lg text-sm text-white appearance-none outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <option value="" className="bg-[#0B0F19]">Todos los estados</option>
              {VENEZUELA_STATES.map((s) => (
                <option key={s.name} value={s.name} className="bg-[#0B0F19]">{s.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
          {filters.state && (
            <div className="relative">
              <select
                value={filters.city}
                onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                className="w-full pl-3 pr-8 py-2 rounded-lg text-sm text-white appearance-none outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <option value="" className="bg-[#0B0F19]">Todas las ciudades</option>
                {cities.map((c) => (
                  <option key={c} value={c} className="bg-[#0B0F19]">{c}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <button
          onClick={() => { onApply(); onClose?.(); }}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
            boxShadow: "0 6px 18px -6px rgba(6,182,212,0.45)",
          }}
        >
          Aplicar filtros
        </button>
        <button
          onClick={onClear}
          className="w-full py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white transition"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}

// ─── GeoBar (compact) ─────────────────────────────────────────────────────
function GeoBar({
  permission, loading, error, rawPosition, onRequest, onRefresh,
}: {
  permission: string; loading: boolean; error: string | null;
  rawPosition: any; onRequest: () => void; onRefresh: () => void;
}) {
  if (permission === "denied") {
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-bold text-red-300">Ubicación GPS desactivada</p>
          <p className="text-red-300/70 mt-0.5">Actívala en tu navegador para ver profesionales cercanos.</p>
        </div>
      </div>
    );
  }
  if (!rawPosition && permission !== "granted") {
    return (
      <button
        onClick={onRequest}
        disabled={loading}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition"
        style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.25)" }}
      >
        <div className="w-9 h-9 rounded-xl grid place-items-center"
          style={{ background: "rgba(6,182,212,0.15)" }}>
          {loading ? <RefreshCw className="w-4 h-4 text-cyan-300 animate-spin" /> : <LocateFixed className="w-4 h-4 text-cyan-300" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Activa tu ubicación GPS</p>
          <p className="text-xs text-cyan-200/70">Para ver profesionales cerca de ti</p>
        </div>
        <span className="text-xs font-bold text-cyan-300">Activar</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
      style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.25)" }}>
      {loading ? <RefreshCw className="w-4 h-4 text-cyan-300 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
      <span className="text-xs font-bold text-emerald-300 flex-1">
        {loading ? "Obteniendo señal..." : "Señal GPS activa"}
      </span>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
      <button onClick={onRefresh} className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1">
        <RefreshCw className="w-3 h-3" /> Actualizar
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export function SearchPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { user } = useAuth();
  const [showLoginWall, setShowLoginWall] = useState(false);
  const [loginWallReturnTo, setLoginWallReturnTo] = useState<string | undefined>();
  const opts = getRequestOptions();

  const urlCategoryId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const v = params.get("category");
    return v ? parseInt(v) : undefined;
  }, [searchString]);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(urlCategoryId);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [sortBy, setSortBy] = useState<"smart" | "distance" | "rating" | "price">("smart");
  const sortLockedRef = useRef(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filtersDrawer, setFiltersDrawer] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => { setCategoryId(urlCategoryId); }, [urlCategoryId]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [appliedFilters, search, categoryId, sortBy]);

  const { position: _pos, rawPosition, permission, loading: geoLoading, error: geoError, request: requestGeo, refresh: refreshGeo }
    = useGeolocation("user");

  useEffect(() => {
    if (rawPosition && !sortLockedRef.current) {
      setSortBy("distance");
      sortLockedRef.current = true;
    }
  }, [rawPosition]);

  const { data: bcvData, formatBs } = useBcvRate();
  const { data: categories = [] } = useListCategories();

  const { data: workers = [], isLoading } = useListWorkers({
    ...(categoryId ? { categoryId } : {}),
    ...(appliedFilters.availability === "now" ? { available: true } : {}),
    ...(appliedFilters.state ? { state: appliedFilters.state } : {}),
    ...(appliedFilters.city ? { city: appliedFilters.city } : {}),
    ...(rawPosition ? { lat: rawPosition.lat, lng: rawPosition.lng } : {}),
  });

  const workersWithDistance = useMemo(() => {
    return (workers as any[]).map((w: any) => {
      const computedDistance = rawPosition && w.lat && w.lng
        ? haversineDistance(rawPosition.lat, rawPosition.lng, w.lat, w.lng)
        : w.distance ?? null;
      return { ...w, computedDistance };
    });
  }, [workers, rawPosition]);

  const filtered = useMemo(() => {
    let result = workersWithDistance.filter((w: any) => {
      // text search
      if (search) {
        const s = search.toLowerCase();
        if (!(w.name?.toLowerCase().includes(s) || w.categoryName?.toLowerCase().includes(s))) return false;
      }
      // rating
      if (appliedFilters.minRating > 0 && (w.rating ?? 0) < appliedFilters.minRating) return false;
      // verified
      if (appliedFilters.verifiedOnly && !w.isVerified) return false;
      // price
      const price = Number(w.basePrice ?? w.hourlyRate ?? 0);
      const min = appliedFilters.priceMin ? Number(appliedFilters.priceMin) : null;
      const max = appliedFilters.priceMax ? Number(appliedFilters.priceMax) : null;
      if (min !== null && !Number.isNaN(min) && price < min) return false;
      if (max !== null && !Number.isNaN(max) && price > max) return false;
      return true;
    });

    if (sortBy === "distance") {
      result = [...result].sort((a, b) => (a.computedDistance ?? 9999) - (b.computedDistance ?? 9999));
    } else if (sortBy === "rating") {
      result = [...result].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortBy === "price") {
      result = [...result].sort((a, b) => (a.basePrice ?? a.hourlyRate ?? 0) - (b.basePrice ?? b.hourlyRate ?? 0));
    }
    return result;
  }, [workersWithDistance, search, appliedFilters, sortBy]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = filtered.length > visibleCount;

  const currentCategory = (categories as any[]).find((c: any) => c.id === categoryId);
  const breadcrumbCategory = currentCategory?.name ?? (search ? `“${search}”` : "Todos los servicios");

  const applyFilters = () => setAppliedFilters(filters);
  const clearFilters = () => { setFilters(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS); };

  const goToWorker = (w: any) => {
    if (!user) navigate(`/workers/${w.id}`);
    else navigate(`/client/worker/${w.id}`);
  };
  const contractWorker = (w: any) => {
    track("contact_click", { workerId: w.id, source: "search_list" });
    if (!user) {
      setLoginWallReturnTo(`/workers/${w.id}`);
      setShowLoginWall(true);
      return;
    }
    navigate(`/client/book/${w.id}`);
  };

  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto pb-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs sm:text-sm mb-4" style={{ color: "rgba(255,255,255,0.45)" }}>
          <button onClick={() => navigate("/client")} className="hover:text-white">Inicio</button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span>Servicios</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-white font-semibold truncate max-w-[180px] sm:max-w-none">{breadcrumbCategory}</span>
        </nav>

        {/* Top: search + view toggle */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="search"
              placeholder="¿Qué servicio necesitas hoy?"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div className="relative sm:w-56">
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full pl-3 pr-9 py-3 rounded-2xl text-sm font-semibold text-white appearance-none outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <option value="" className="bg-[#0B0F19]">Todas las categorías</option>
              {(categories as any[]).map((c: any) => (
                <option key={c.id} value={c.id} className="bg-[#0B0F19]">{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
          <div className="flex items-center p-1 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition"
              style={viewMode === "list"
                ? { background: "rgba(255,255,255,0.10)", color: "#fff" }
                : { color: "rgba(255,255,255,0.5)" }}
            >
              <List className="w-3.5 h-3.5" /> Lista
            </button>
            <button
              onClick={() => setViewMode("map")}
              aria-pressed={viewMode === "map"}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition"
              style={viewMode === "map"
                ? { background: "rgba(255,255,255,0.10)", color: "#fff" }
                : { color: "rgba(255,255,255,0.5)" }}
            >
              <MapIcon className="w-3.5 h-3.5" /> Mapa
            </button>
          </div>
        </div>

        {/* Speed-Matching banner */}
        <div className="mb-5">
          <SpeedMatchingBanner />
        </div>

        {/* GeoBar (compact) */}
        <div className="mb-5">
          <GeoBar
            permission={permission}
            loading={geoLoading}
            error={geoError}
            rawPosition={rawPosition}
            onRequest={() => requestGeo({ saveAs: "user" })}
            onRefresh={() => refreshGeo({ saveAs: "user" })}
          />
        </div>

        {/* Two-column layout: sidebar + results */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">

          {/* Desktop Sidebar */}
          <aside className="hidden lg:block">
            <FiltersPanel
              filters={filters}
              setFilters={setFilters}
              onApply={applyFilters}
              onClear={clearFilters}
            />
          </aside>

          {/* Results column */}
          <section className="min-w-0">
            {/* Results header: count + sort + mobile filter button */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">
                  {currentCategory ? currentCategory.name : "Profesionales"}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {isLoading ? "Buscando..." : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setFiltersDrawer(true)}
                  className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
                </button>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="pl-3 pr-8 py-2 rounded-xl text-xs font-semibold text-white appearance-none outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <option value="smart" className="bg-[#0B0F19]">Recomendados</option>
                    <option value="distance" className="bg-[#0B0F19]">Distancia</option>
                    <option value="rating" className="bg-[#0B0F19]">Calificación</option>
                    <option value="price" className="bg-[#0B0F19]">Precio</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Map view */}
            {viewMode === "map" && (
              <div className="rounded-3xl overflow-hidden p-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <WorkerMap
                  workers={filtered}
                  height="min(560px, 70dvh)"
                  centerLat={rawPosition?.lat ?? null}
                  centerLng={rawPosition?.lng ?? null}
                />
              </div>
            )}

            {/* List view */}
            {viewMode === "list" && (
              <>
                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-64 rounded-3xl animate-pulse"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-16 text-center rounded-3xl px-6"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-3"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <MapPin className="w-5 h-5 text-white/30" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">No encontramos resultados</h3>
                    <p className="text-sm text-white/50 mb-4">Prueba con otra categoría o ajusta los filtros.</p>
                    <button
                      onClick={clearFilters}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-cyan-300"
                      style={{ background: "rgba(6,182,212,0.10)", border: "1px solid rgba(6,182,212,0.3)" }}
                    >
                      Limpiar filtros
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {visible.map((w: any) => (
                        <article
                          key={w.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Ver perfil de ${w.name}`}
                          onClick={() => goToWorker(w)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              goToWorker(w);
                            }
                          }}
                          className="group flex flex-col p-4 rounded-3xl cursor-pointer transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            backdropFilter: "blur(20px)",
                            border: w.isPremium
                              ? "1px solid rgba(245,158,11,0.30)"
                              : "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          {/* Header: avatar + name + rating */}
                          <div className="flex items-start gap-3">
                            <div className="relative flex-shrink-0">
                              <div className="w-12 h-12 rounded-xl overflow-hidden grid place-items-center font-bold text-lg"
                                style={{ background: "rgba(6,182,212,0.10)", border: "1px solid rgba(6,182,212,0.20)", color: "#22d3ee" }}>
                                {w.avatarUrl ? (
                                  <img
                                    src={mediaSrc(w.avatarUrl)}
                                    alt={w.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : w.name?.charAt(0).toUpperCase()}
                              </div>
                              {w.isAvailable && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0B0F19]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-bold text-white truncate leading-tight">{w.name}</p>
                                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md flex-shrink-0"
                                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  <span className="text-[11px] font-bold text-white">{(w.rating ?? 0).toFixed(1)}</span>
                                </div>
                              </div>
                              <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                                {w.categoryName ?? "Profesional"}
                              </p>
                              {w.isVerified && (
                                <div className="flex items-center gap-1 mt-1.5 text-[11px] font-bold text-cyan-300">
                                  <BadgeCheck className="w-3.5 h-3.5" /> VERIFICADO
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Badges row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-3">
                            {w.isPremium && <PremiumBadge />}
                            {w.isTopProfile && !w.isPremium && <TopProfileBadge />}
                            <WorkerLevelBadge completedJobs={w.completedJobs} rating={w.rating} isVerified={w.isVerified} />
                          </div>

                          {/* Description */}
                          {w.description && (
                            <p className="text-xs mt-2.5 line-clamp-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                              {w.description}
                            </p>
                          )}

                          {/* Distance + Price row */}
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div>
                              {rawPosition && w.computedDistance !== null ? (
                                <DistanceBadge km={w.computedDistance} />
                              ) : w.city ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                                  <MapPin className="w-3 h-3" /> {w.city}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <div className="flex items-baseline gap-1 justify-end">
                                <span className="text-base font-bold text-white">${w.basePrice ?? w.hourlyRate ?? 0}</span>
                                <span className="text-[10px] text-white/45">/ visita</span>
                              </div>
                              {bcvData && (
                                <p className="text-[10px] font-semibold text-emerald-400/80">
                                  {formatBs(w.basePrice ?? w.hourlyRate ?? 0)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Dual CTAs */}
                          <div className="mt-3 grid grid-cols-2 gap-2 pt-3"
                            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); goToWorker(w); }}
                              className="py-2 rounded-xl text-xs font-bold text-white/80 hover:text-white transition"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                            >
                              Ver perfil
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); contractWorker(w); }}
                              className="py-2 rounded-xl text-xs font-bold text-white inline-flex items-center justify-center gap-1 transition"
                              style={{
                                background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                                boxShadow: "0 4px 14px -4px rgba(6,182,212,0.5)",
                              }}
                            >
                              Contratar ahora <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>

                    {/* Cargar más */}
                    {hasMore && (
                      <div className="flex justify-center mt-6">
                        <button
                          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white/80 hover:text-white transition"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
                        >
                          Cargar más profesionales
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {/* Mobile filters drawer */}
      {filtersDrawer && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
          onClick={() => setFiltersDrawer(false)}
        >
          <div className="w-full max-h-[85dvh] overflow-y-auto rounded-t-3xl"
            onClick={(e) => e.stopPropagation()}>
            <FiltersPanel
              filters={filters}
              setFilters={setFilters}
              onApply={applyFilters}
              onClear={clearFilters}
              onClose={() => setFiltersDrawer(false)}
              isMobile
            />
          </div>
        </div>
      )}

      <LoginWallModal
        open={showLoginWall}
        onClose={() => { setShowLoginWall(false); setLoginWallReturnTo(undefined); }}
        context="contact"
        returnTo={loginWallReturnTo}
      />
    </AppLayout>
  );
}
