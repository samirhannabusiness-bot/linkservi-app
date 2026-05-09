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
  Search, Shield, SlidersHorizontal, Map, List, Zap, MapPin, Navigation,
  Star, ChevronDown, LocateFixed, RefreshCw, AlertCircle, CheckCircle2, Crown,
  TrendingUp, Filter, BadgeCheck, MessageSquare
} from "lucide-react";
import { VENEZUELA_STATES, getCitiesForState } from "@/lib/venezuela-locations";
import { useAuth } from "@/lib/auth-context";
import { getRequestOptions, track } from "@/lib/api";

function PremiumBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-black tracking-widest uppercase"
      style={{
        background: "linear-gradient(90deg, rgba(251,191,36,0.15) 0%, rgba(245,158,11,0.05) 100%)",
        border: "1px solid rgba(251,191,36,0.3)",
        color: "#FBBF24",
        textShadow: "0 0 10px rgba(251,191,36,0.4)",
      }}>
      <Crown className="w-3 h-3 text-amber-400" fill="currentColor" /> Premium
    </span>
  );
}

function TopProfileBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-black tracking-widest uppercase"
      style={{
        background: "linear-gradient(90deg, rgba(239,68,68,0.15) 0%, rgba(249,115,22,0.08) 100%)",
        border: "1px solid rgba(239,68,68,0.35)",
        color: "#F87171",
        textShadow: "0 0 8px rgba(239,68,68,0.35)",
      }}>
      🔥 Perfil destacado
    </span>
  );
}

function VerifiedPremiumSeal() {
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-amber-500/20">
      <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.2)]">
        <CheckCircle2 className="w-3 h-3 text-amber-400" />
      </div>
      <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Profesional Verificado</span>
      <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider">
        <Shield className="w-3 h-3" /> Alta prioridad
      </span>
    </div>
  );
}

function DistanceBadge({ km }: { km: number }) {
  const isNear = km < 5;
  const isClose = km < 25;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-bold tracking-wide ${
      isNear ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
      isClose ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" :
      "bg-white/5 text-white/50 border border-white/10"
    }`}>
      <MapPin className="w-3 h-3 flex-shrink-0" />
      A {formatDistance(km)}
    </span>
  );
}

function GeoBar({
  permission, loading, error, rawPosition, filteredCount, nearCount, clientState, clientCity, onRequest, onRefresh
}: {
  permission: string; loading: boolean; error: string | null;
  rawPosition: any; filteredCount: number; nearCount: number;
  clientState: string | null; clientCity: string | null;
  onRequest: () => void; onRefresh: () => void;
}) {
  if (permission === "denied") {
    return (
      <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex-wrap">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-400 mb-1">Ubicación GPS desactivada</p>
          <p className="text-xs font-medium text-red-400/70">Activa el permiso en la configuración de tu navegador para ver profesionales cercanos.{clientState ? ` Mostrando resultados de ${clientCity || clientState}.` : ""}</p>
        </div>
      </div>
    );
  }

  if (!rawPosition && permission !== "granted") {
    return (
      <button
        onClick={onRequest}
        disabled={loading}
        className="w-full group flex items-center gap-4 px-6 py-5 rounded-2xl glass border border-cyan-500/30 hover:border-cyan-400/50 hover:bg-cyan-500/5 transition-all text-left shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]"
      >
        <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
          {loading
            ? <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            : <LocateFixed className="w-5 h-5 text-cyan-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white mb-0.5">Permite tu ubicación GPS</p>
          <p className="text-sm font-medium text-cyan-400/60">Para mostrar profesionales cerca de ti al instante</p>
        </div>
        <span className="text-sm text-cyan-400 font-bold flex-shrink-0 group-hover:translate-x-1 transition-transform">Activar →</span>
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border flex-wrap shadow-lg ${
      rawPosition
        ? "glass border-emerald-500/30 bg-emerald-500/5"
        : "glass border-cyan-500/30 bg-cyan-500/5"
    }`}>
      {loading
        ? <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
        : rawPosition
          ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          : <Navigation className="w-5 h-5 text-cyan-400 flex-shrink-0" />}
      <span className="text-sm flex-1 min-w-0 font-bold">
        {loading ? <span className="text-cyan-400">Obteniendo señal GPS...</span> :
          rawPosition ? (
            <span className="text-emerald-400">
              Señal GPS Activa <span className="text-emerald-400/50 font-medium">· {nearCount} a menos de 25 km</span>
              {clientState ? <span className="text-emerald-400/50 font-medium"> · {clientCity || clientState}</span> : ""}
            </span>
          ) : (
            <span className="text-cyan-400">
              {filteredCount} profesional{filteredCount !== 1 ? "es" : ""} encontrado{filteredCount !== 1 ? "s" : ""}
              {clientState ? <span className="text-cyan-400/50 font-medium"> en {clientCity || clientState}</span> : ""}
            </span>
          )
        }
      </span>
      {error && <span className="text-xs font-bold text-red-400 flex-shrink-0">{error}</span>}
      <button
        onClick={rawPosition ? onRefresh : onRequest}
        disabled={loading}
        className={`text-xs font-bold uppercase tracking-wider flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all disabled:opacity-50 ${
          rawPosition
            ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
            : "text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20"
        }`}
      >
        {rawPosition
          ? <><RefreshCw className="w-3.5 h-3.5" /> Actualizar</>
          : <><LocateFixed className="w-3.5 h-3.5" /> Buscar GPS</>}
      </button>
    </div>
  );
}

export function SearchPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { user } = useAuth();
  const [showLoginWall, setShowLoginWall] = useState(false);
  const [loginWallReturnTo, setLoginWallReturnTo] = useState<string | undefined>();
  const opts = getRequestOptions();

  // Read ?category= from URL on mount
  const urlCategoryId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const v = params.get("category");
    return v ? parseInt(v) : undefined;
  }, [searchString]);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(urlCategoryId);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [sortBy, setSortBy] = useState<"smart" | "distance" | "rating" | "price">("smart");
  const sortLockedRef = useRef(false);
  const [filterState, setFilterState] = useState<string>("");
  const [filterCity, setFilterCity] = useState<string>("");

  // Sync if user navigates to a different category URL
  useEffect(() => {
    setCategoryId(urlCategoryId);
  }, [urlCategoryId]);

  const { position, rawPosition, permission, loading: geoLoading, error: geoError, request: requestGeo, refresh: refreshGeo } = useGeolocation("user");

  // Auto-switch to distance sort when GPS becomes available (only once, unless user manually changed)
  useEffect(() => {
    if (rawPosition && !sortLockedRef.current) {
      setSortBy("distance");
      sortLockedRef.current = true;
    }
  }, [rawPosition]);
  const { data: bcvData, formatBs } = useBcvRate();

  const { data: categories = [] } = useListCategories();

  // Pass GPS coordinates to API for server-side priority sorting
  const { data: workers = [], isLoading } = useListWorkers({
    ...(categoryId ? { categoryId } : {}),
    ...(onlyAvailable ? { available: true } : {}),
    ...(filterState ? { state: filterState } : {}),
    ...(filterCity ? { city: filterCity } : {}),
    ...(rawPosition ? { lat: rawPosition.lat, lng: rawPosition.lng } : {}),
  });

  const filterCities = filterState ? getCitiesForState(filterState) : [];

  const clientState = filterState || (user as any)?.state || null;
  const clientCity = filterCity || (user as any)?.city || null;

  // Compute client-side distance for all workers
  const workersWithDistance = useMemo(() => {
    return (workers as any[]).map((w: any) => {
      const computedDistance = rawPosition && w.lat && w.lng
        ? haversineDistance(rawPosition.lat, rawPosition.lng, w.lat, w.lng)
        : w.distance ?? null;
      return { ...w, computedDistance };
    });
  }, [workers, rawPosition]);

  const filtered = useMemo(() => {
    let result = workersWithDistance.filter((w: any) =>
      !search || w.name?.toLowerCase().includes(search.toLowerCase()) || w.categoryName?.toLowerCase().includes(search.toLowerCase())
    );

    if (sortBy === "distance") {
      result = [...result].sort((a: any, b: any) => {
        const da = a.computedDistance ?? 9999;
        const db_ = b.computedDistance ?? 9999;
        return da - db_;
      });
    } else if (sortBy === "rating") {
      result = [...result].sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortBy === "price") {
      result = [...result].sort((a: any, b: any) => (a.basePrice ?? a.hourlyRate ?? 0) - (b.basePrice ?? b.hourlyRate ?? 0));
    }
    // "smart" → server already sorted by GPS priority

    return result;
  }, [workersWithDistance, search, sortBy]);

  const nearCount = useMemo(() =>
    filtered.filter((w: any) => w.computedDistance !== null && w.computedDistance < 25).length,
    [filtered]
  );

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-3xl font-black text-white tracking-tight">Buscar Profesionales</h1>
          <div className="flex items-center p-1 glass rounded-2xl border border-white/10 flex-shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === "list" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white/80"}`}
            >
              <List className="w-4 h-4" /> Lista
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === "map" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white/80"}`}
            >
              <Map className="w-4 h-4" /> Mapa
            </button>
          </div>
        </div>

        {/* Geolocation bar */}
        <GeoBar
          permission={permission}
          loading={geoLoading}
          error={geoError}
          rawPosition={rawPosition}
          filteredCount={filtered.length}
          nearCount={nearCount}
          clientState={clientState}
          clientCity={clientCity}
          onRequest={() => requestGeo({ saveAs: "user" })}
          onRefresh={() => refreshGeo({ saveAs: "user" })}
        />

        {/* Filter Controls */}
        <div className="glass border border-white/10 rounded-3xl p-4 sm:p-5 space-y-4 shadow-lg">
          {/* Search + Category */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="search"
                placeholder="¿Qué servicio necesitas hoy?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl input-glass font-medium text-base"
              />
            </div>
            <div className="relative sm:w-64">
              <select
                value={categoryId ?? ""}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full pl-4 pr-10 py-3.5 rounded-2xl input-glass appearance-none font-bold text-white bg-transparent"
              >
                <option value="" className="bg-[#0B0F19]">Todas las categorías</option>
                {(categories as any[]).map((c: any) => (
                  <option key={c.id} value={c.id} className="bg-[#0B0F19]">{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            </div>
          </div>

          {/* Quick category chips */}
          <div className="flex flex-wrap gap-2">
            {["Plomero", "Electricista", "Limpieza", "Aire acondicionado"].map(chip => (
              <button
                key={chip}
                onClick={() => setSearch(search === chip ? "" : chip)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={
                  search === chip
                    ? { background: "rgba(6,182,212,0.18)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.40)" }
                    : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.50)", border: "1px solid rgba(255,255,255,0.09)" }
                }
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Advanced Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[140px] max-w-[200px]">
              <select
                value={filterState}
                onChange={(e) => { setFilterState(e.target.value); setFilterCity(""); }}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl input-glass text-sm font-medium appearance-none bg-transparent"
              >
                <option value="" className="bg-[#0B0F19]">📍 Estado</option>
                {VENEZUELA_STATES.map((s) => (
                  <option key={s.name} value={s.name} className="bg-[#0B0F19]">{s.name}</option>
                ))}
              </select>
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            </div>

            {filterState && (
              <div className="relative flex-1 min-w-[140px] max-w-[200px]">
                <select
                  value={filterCity}
                  onChange={(e) => setFilterCity(e.target.value)}
                  className="w-full pl-4 pr-8 py-2.5 rounded-xl input-glass text-sm font-medium appearance-none bg-transparent"
                >
                  <option value="" className="bg-[#0B0F19]">Ciudad</option>
                  {filterCities.map((c) => (
                    <option key={c} value={c} className="bg-[#0B0F19]">{c}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              </div>
            )}

            <div className="relative flex-1 min-w-[140px] max-w-[200px]">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl input-glass text-sm font-bold appearance-none bg-transparent"
              >
                <option value="smart" className="bg-[#0B0F19]">⭐ Relevancia</option>
                <option value="distance" className="bg-[#0B0F19]">📍 Distancia</option>
                <option value="rating" className="bg-[#0B0F19]">🌟 Rating</option>
                <option value="price" className="bg-[#0B0F19]">💲 Precio</option>
              </select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            </div>

            <button
              onClick={() => setOnlyAvailable(!onlyAvailable)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                onlyAvailable 
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]" 
                  : "glass border-white/10 text-white/60 hover:text-white"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${onlyAvailable ? "bg-emerald-400 animate-pulse" : "bg-white/30"}`} />
              Disponibles
            </button>

            {(filterState || filterCity) && (
              <button
                onClick={() => { setFilterState(""); setFilterCity(""); }}
                className="px-4 py-2.5 rounded-xl font-bold text-sm text-white/40 hover:text-white hover:bg-white/5 transition-all ml-auto"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Map view */}
        {viewMode === "map" && (
          <div className="glass rounded-3xl border border-white/10 overflow-hidden shadow-2xl p-1">
            <WorkerMap
              workers={filtered}
              height="min(500px, 60dvh)"
              centerLat={rawPosition?.lat ?? null}
              centerLng={rawPosition?.lng ?? null}
            />
          </div>
        )}

        {/* List view */}
        {viewMode === "list" && (
          <div className="space-y-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 rounded-3xl bg-white/5 animate-pulse border border-white/5" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center glass border border-white/5 rounded-3xl space-y-4 px-6">
                <div className="w-16 h-16 rounded-full glass border border-white/10 flex items-center justify-center mx-auto">
                  <MapPin className="w-6 h-6 text-white/30" />
                </div>
                {onlyAvailable ? (
                  <>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Todos están ocupados ahora</h3>
                      <p className="text-white/50 font-medium max-w-sm mx-auto">
                        No hay disponibles en este momento, pero hay profesionales que pueden responder pronto.
                      </p>
                    </div>
                    <button
                      onClick={() => setOnlyAvailable(false)}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-white/5"
                      style={{ border: "1px solid rgba(6,182,212,0.3)", color: "rgba(6,182,212,0.85)", background: "rgba(6,182,212,0.06)" }}
                    >
                      Ver todos los profesionales
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Amplía tu búsqueda</h3>
                      <p className="text-white/50 font-medium">Intenta con otra categoría o elimina algunos filtros.</p>
                    </div>
                    {(filterState || filterCity) && (
                      <button onClick={() => { setFilterState(""); setFilterCity(""); }}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl glass border border-white/10 text-sm font-bold hover:bg-white/5 transition-colors">
                        Limpiar filtros de ubicación
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between px-2 mb-2 gap-3">
                  <div>
                    <p className="text-sm font-bold text-white/50 uppercase tracking-widest">
                      {filtered.length} Profesional{filtered.length !== 1 ? "es" : ""}
                      {onlyAvailable ? " disponibles" : " en tu zona"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                      Recibe respuesta en minutos
                    </p>
                  </div>
                  {sortBy === "smart" && (
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider bg-amber-500/10 px-2 py-1 rounded-lg flex-shrink-0">
                      <Star className="w-3 h-3 fill-amber-400" /> Relevancia + popularidad
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filtered.map((w: any, idx: number) => {
                    const isTop = idx === 0;
                    return (
                    <div
                      key={w.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!user) navigate(`/workers/${w.id}`);
                        else navigate(`/client/worker/${w.id}`);
                      }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { if (!user) navigate(`/workers/${w.id}`); else navigate(`/client/worker/${w.id}`); }}}
                      className={`group flex flex-col p-6 rounded-3xl glass border text-left cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 shadow-xl ${
                        w.isPremium 
                          ? "border-amber-500/30 hover:border-amber-400/60 hover:shadow-[0_10px_40px_rgba(245,158,11,0.15)]" 
                          : isTop
                          ? "border-cyan-500/25 hover:border-cyan-500/50 hover:shadow-[0_10px_40px_rgba(6,182,212,0.12)]"
                          : "border-white/10 hover:border-cyan-500/40 hover:shadow-[0_10px_40px_rgba(6,182,212,0.1)]"
                      }`}
                      style={isTop && !w.isPremium ? {
                        boxShadow: "0 0 0 1px rgba(6,182,212,0.08), 0 4px 20px rgba(6,182,212,0.06)",
                        background: "rgba(6,182,212,0.025)",
                      } : undefined}
                    >
                      {w.isPremium && <VerifiedPremiumSeal />}

                      <div className="flex items-start gap-4 mb-4">
                        <div className="relative flex-shrink-0">
                          <div className={`w-16 h-12 rounded-xl flex items-center justify-center font-black text-2xl border overflow-hidden ${
                            w.isPremium 
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          }`}>
                            {w.avatarUrl ? (
                              <img src={w.avatarUrl.startsWith("http") ? w.avatarUrl : w.avatarUrl.startsWith("/api/") ? w.avatarUrl : `/api/storage${w.avatarUrl}`} alt={w.name} className="w-full h-full object-cover" />
                            ) : w.name?.charAt(0).toUpperCase()}
                          </div>
                          {w.isAvailable && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0B0F19]" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-xl font-bold text-white truncate">{w.name}</p>
                            {w.isVerified && <BadgeCheck className="w-5 h-5 text-cyan-400 flex-shrink-0" />}
                            {w.isPremium && <PremiumBadge />}
                            {w.isTopProfile && !w.isPremium && <TopProfileBadge />}
                          </div>
                          <p className="text-sm font-bold text-white/50 uppercase tracking-widest truncate">{w.categoryName}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                              <StarRating rating={w.rating} />
                              <span className="text-xs font-bold text-white/80">{w.rating?.toFixed(1)} <span className="text-white/40">({w.reviewCount})</span></span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Distance & Badges row */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <WorkerLevelBadge completedJobs={w.completedJobs} rating={w.rating} isVerified={w.isVerified} />
                        {rawPosition && w.computedDistance !== null ? (
                          <DistanceBadge km={w.computedDistance} />
                        ) : w.city && w.state ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                            <MapPin className="w-3 h-3" /> {w.city}
                          </span>
                        ) : null}
                      </div>

                      {/* Micro-stats */}
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        {(w as any).hasRecentContact && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md animate-pulse"
                            style={{ background: "rgba(251,146,60,0.10)", color: "rgba(251,146,60,0.9)", border: "1px solid rgba(251,146,60,0.25)" }}>
                            🔥 Respondiendo ahora
                          </span>
                        )}
                        {(w as any).hasRecentActivity24h && !w.isAvailable && !(w as any).hasRecentContact && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: "rgba(251,191,36,0.08)", color: "rgba(251,191,36,0.75)", border: "1px solid rgba(251,191,36,0.2)" }}>
                            🟡 Activo hoy
                          </span>
                        )}
                        {(w.completedJobs ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: "rgba(6,182,212,0.08)", color: "rgba(6,182,212,0.75)", border: "1px solid rgba(6,182,212,0.15)" }}>
                            <CheckCircle2 className="w-3 h-3" /> {w.completedJobs} trabajo{w.completedJobs !== 1 ? "s" : ""} completado{w.completedJobs !== 1 ? "s" : ""}
                          </span>
                        )}
                        {(w.isAvailable || (w as any).hasRecentContact) && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: "rgba(16,185,129,0.08)", color: "rgba(52,211,153,0.8)", border: "1px solid rgba(16,185,129,0.15)" }}>
                            <Zap className="w-3 h-3" />
                            {(w as any).avgResponseMinutes && (w as any).avgResponseMinutes < 180
                              ? `Responde en ~${(w as any).avgResponseMinutes < 60 ? `${(w as any).avgResponseMinutes} min` : `${Math.round((w as any).avgResponseMinutes / 60)}h`}`
                              : "Recibe respuesta en minutos"}
                          </span>
                        )}
                      </div>

                      {w.description && (
                        <p className="text-sm text-white/60 line-clamp-2 mb-4 leading-relaxed font-medium">{w.description}</p>
                      )}

                      <div className="mt-auto pt-4 border-t flex flex-wrap items-center justify-between gap-3" style={{ borderColor: w.isPremium ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)" }}>
                        <div>
                          <p className="text-sm font-medium text-white/40 mb-0.5 uppercase tracking-wider">Tarifa base</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-xl font-black text-white">${w.basePrice ?? w.hourlyRate ?? 0}</p>
                            {bcvData && (
                              <p className="text-xs font-bold text-emerald-400">
                                {formatBs(w.basePrice ?? w.hourlyRate ?? 0)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg"
                            style={w.isAvailable
                              ? { color: "rgba(52,211,153,0.9)", border: "1px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.08)" }
                              : (w as any).hasRecentContact
                              ? { color: "rgba(251,146,60,0.85)", border: "1px solid rgba(251,146,60,0.25)", background: "rgba(251,146,60,0.08)" }
                              : (w as any).hasRecentActivity24h
                              ? { color: "rgba(251,191,36,0.8)", border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.06)" }
                              : { color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }
                            }>
                            {w.isAvailable ? "Disponible"
                              : (w as any).hasRecentContact ? "Respondiendo ahora"
                              : (w as any).hasRecentActivity24h ? "Activo hoy"
                              : "Ocupado"}
                          </span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              track("contact_click", { workerId: w.id, source: "search_list" });
                              if (!user) {
                                setLoginWallReturnTo(`/workers/${w.id}`);
                                setShowLoginWall(true);
                                return;
                              }
                              navigate(`/client/worker/${w.id}`);
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                            style={{
                              background: "rgba(6,182,212,0.12)",
                              border: "1px solid rgba(6,182,212,0.3)",
                              color: "#06B6D4",
                            }}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Contactar
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <LoginWallModal
        open={showLoginWall}
        onClose={() => { setShowLoginWall(false); setLoginWallReturnTo(undefined); }}
        context="contact"
        returnTo={loginWallReturnTo}
      />
    </AppLayout>
  );
}
