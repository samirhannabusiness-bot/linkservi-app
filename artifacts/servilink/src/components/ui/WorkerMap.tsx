import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadMapsLib, loadMarkerLib } from "@/lib/google-maps";
import { Star, MapPin, CheckCircle, X, ChevronRight, Clock } from "lucide-react";

const CARACAS_CENTER = { lat: 10.4806, lng: -66.9036 };
const CARACAS_ZOOM = 10;
const GPS_ZOOM = 13;

function injectStyles() {
  if (document.getElementById("wmap-styles")) return;
  const s = document.createElement("style");
  s.id = "wmap-styles";
  s.textContent = `
    @keyframes wmap-pulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.8);opacity:0}}
    @keyframes wmap-popup{from{opacity:0;transform:scale(.94) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes wmap-spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(s);
}

function buildGpsEl(): HTMLDivElement {
  injectStyles();
  const w = document.createElement("div");
  w.style.cssText = "position:relative;width:24px;height:24px";
  const ring = document.createElement("div");
  ring.style.cssText =
    "position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,.28);animation:wmap-pulse 2s ease-out infinite";
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:absolute;inset:4px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 10px rgba(59,130,246,.9)";
  w.appendChild(ring);
  w.appendChild(dot);
  return w;
}

function buildWorkerEl(initial: string, isAvailable: boolean, isVerified: boolean): HTMLDivElement {
  injectStyles();
  const outer = document.createElement("div");
  outer.style.cssText = "position:relative;width:44px;height:44px;cursor:pointer";

  const circle = document.createElement("div");
  circle.style.cssText = `
    width:44px;height:44px;border-radius:50%;
    background:${isAvailable ? "#1e3a5f" : "#1e293b"};
    border:3px solid ${isVerified ? "#0ea5e9" : "#94a3b8"};
    display:flex;align-items:center;justify-content:center;
    font-size:16px;font-weight:800;
    color:${isAvailable && isVerified ? "#38bdf8" : "#cbd5e1"};
    box-shadow:0 4px 12px rgba(0,0,0,.35);
  `;
  circle.textContent = initial;

  if (isAvailable) {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:absolute;bottom:2px;right:2px;width:11px;height:11px;border-radius:50%;background:#10b981;border:2px solid #fff";
    outer.appendChild(dot);
  }

  outer.appendChild(circle);
  return outer;
}

function buildClusterEl(count: number): HTMLDivElement {
  const bg = count >= 30 ? "#a855f7" : count >= 10 ? "#6366f1" : "#0ea5e9";
  const size = count >= 30 ? 52 : count >= 10 ? 46 : 38;
  const el = document.createElement("div");
  el.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bg};color:#fff;font-size:13px;font-weight:800;
    border:2.5px solid #fff;
    box-shadow:0 4px 14px rgba(99,102,241,.4);
    cursor:pointer;
  `;
  el.textContent = count > 99 ? "99+" : String(count);
  return el;
}

interface Worker {
  id: number;
  name: string;
  categoryName: string;
  hourlyRate: number;
  rating: number;
  isAvailable: boolean;
  isVerified: boolean;
  lat?: number | null;
  lng?: number | null;
}

interface WorkerMapProps {
  workers: Worker[];
  height?: string;
  centerLat?: number | null;
  centerLng?: number | null;
  onRequestLocation?: () => void;
}

function WorkerCard({
  worker, onClose, onNavigate,
}: { worker: Worker; onClose: () => void; onNavigate: () => void; }) {
  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: "absolute", top: 52, right: 12, width: 224, zIndex: 500,
        background: "rgba(255,255,255,0.97)", borderRadius: 16, overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.06)",
        backdropFilter: "blur(16px)",
        animation: "wmap-popup .2s cubic-bezier(.34,1.56,.64,1)",
      }}
    >
      <div style={{
        background: worker.isAvailable
          ? "linear-gradient(135deg,#0ea5e9,#2563eb)"
          : "linear-gradient(135deg,#64748b,#475569)",
        padding: "14px 14px 12px", position: "relative",
      }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff", border: "2px solid rgba(255,255,255,0.4)", marginBottom: 8 }}>
          {worker.name.charAt(0).toUpperCase()}
        </div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{worker.name}</p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.8)" }}>{worker.categoryName}</p>
        <button onClick={onClose} style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, background: "rgba(0,0,0,.2)", border: "none", borderRadius: "50%", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 12, height: 12 }} />
        </button>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: worker.isAvailable ? "#d1fae5" : "#f1f5f9", color: worker.isAvailable ? "#059669" : "#64748b" }}>
            <Clock style={{ width: 9, height: 9 }} />
            {worker.isAvailable ? "Disponible" : "Ocupado"}
          </span>
          {worker.isVerified && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "#dbeafe", color: "#1d4ed8" }}>
              <CheckCircle style={{ width: 9, height: 9 }} /> Verificado
            </span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#0f172a" }}>${worker.hourlyRate}</p>
            <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>USD / hora</p>
          </div>
          {worker.rating > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Star style={{ width: 13, height: 13, fill: "#f59e0b", color: "#f59e0b" }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{worker.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
        <button onClick={onNavigate}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 11, background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "#fff", fontWeight: 800, fontSize: 13, border: "none", cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <MapPin style={{ width: 13, height: 13 }} />
          Ver perfil
          <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}

export function WorkerMap({ workers, height = "400px", centerLat, centerLng, onRequestLocation }: WorkerMapProps) {
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const gpsMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const hasGps = typeof centerLat === "number" && typeof centerLng === "number";
  const workersRef = useRef<Worker[]>(workers);
  workersRef.current = workers;

  // ── Init map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || "AIzaSyBitFobNirrdggu5KDHW2u1JcOT0c4FGNs";
    void apiKey;

    injectStyles();
    let destroyed = false;

    (async () => {
      try {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          loadMapsLib(),
          loadMarkerLib(),
        ]);
        if (destroyed || !containerRef.current) return;

        const map = new Map(containerRef.current, {
          center: hasGps ? { lat: centerLat!, lng: centerLng! } : CARACAS_CENTER,
          zoom: hasGps ? GPS_ZOOM : CARACAS_ZOOM,
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: 9 },
          gestureHandling: "greedy",
        });

        map.addListener("click", () => setSelectedWorker(null));

        // Create worker markers
        const markers: google.maps.marker.AdvancedMarkerElement[] = [];
        for (const w of workersRef.current) {
          if (w.lat == null || w.lng == null) continue;
          const el = buildWorkerEl(w.name.charAt(0).toUpperCase(), w.isAvailable, w.isVerified);
          const m = new AdvancedMarkerElement({
            position: { lat: w.lat, lng: w.lng },
            content: el,
            title: w.name,
          });
          m.addListener("click", () => {
            const worker = workersRef.current.find(x => x.id === w.id) ?? null;
            setSelectedWorker(worker);
            if (worker?.lat != null && worker?.lng != null) {
              map.panTo({ lat: worker.lat!, lng: worker.lng! });
              if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
              map.panBy(-60, 0);
            }
          });
          markersRef.current.set(w.id, m);
          markers.push(m);
        }

        const clusterer = new MarkerClusterer({
          map,
          markers,
          renderer: {
            render: ({ count, position }) => new AdvancedMarkerElement({
              position,
              content: buildClusterEl(count),
              zIndex: 1000 + count,
            }),
          },
        });
        clusterer.addListener("click", (cluster: { markers?: google.maps.marker.AdvancedMarkerElement[] }) => {
          if (cluster.markers?.length) {
            const bounds = new google.maps.LatLngBounds();
            cluster.markers.forEach(m => { if (m.position) bounds.extend(m.position); });
            map.fitBounds(bounds, 80);
          }
        });

        clustererRef.current = clusterer;
        mapRef.current = map;
        if (!destroyed) setReady(true);
      } catch {
        if (!destroyed) setMapError(true);
      }
    })();

    return () => {
      destroyed = true;
      clustererRef.current?.clearMarkers();
      clustererRef.current?.setMap(null);
      clustererRef.current = null;
      markersRef.current.forEach(m => { m.map = null; });
      markersRef.current.clear();
      if (gpsMarkerRef.current) { gpsMarkerRef.current.map = null; gpsMarkerRef.current = null; }
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update markers when workers change ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    if (!map || !clusterer || !ready) return;

    loadMarkerLib().then(({ AdvancedMarkerElement }) => {
      clusterer.clearMarkers();
      markersRef.current.forEach(m => { m.map = null; });
      markersRef.current.clear();

      const markers: google.maps.marker.AdvancedMarkerElement[] = [];
      for (const w of workers) {
        if (w.lat == null || w.lng == null) continue;
        const el = buildWorkerEl(w.name.charAt(0).toUpperCase(), w.isAvailable, w.isVerified);
        const m = new AdvancedMarkerElement({
          position: { lat: w.lat, lng: w.lng },
          content: el,
          title: w.name,
        });
        m.addListener("click", () => {
          const worker = workersRef.current.find(x => x.id === w.id) ?? null;
          setSelectedWorker(worker);
          if (worker?.lat != null && worker?.lng != null) {
            map.panTo({ lat: worker.lat!, lng: worker.lng! });
            if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
            map.panBy(-60, 0);
          }
        });
        markersRef.current.set(w.id, m);
        markers.push(m);
      }
      clusterer.addMarkers(markers);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, ready]);

  // ── Pan to GPS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasGps) return;
    map.panTo({ lat: centerLat!, lng: centerLng! });
    map.setZoom(GPS_ZOOM);
  }, [centerLat, centerLng, hasGps]);

  // ── GPS pulse marker ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasGps) return;
    loadMarkerLib().then(({ AdvancedMarkerElement }) => {
      if (gpsMarkerRef.current) { gpsMarkerRef.current.map = null; gpsMarkerRef.current = null; }
      const map = mapRef.current;
      if (!map) return;
      gpsMarkerRef.current = new AdvancedMarkerElement({
        map,
        position: { lat: centerLat!, lng: centerLng! },
        content: buildGpsEl(),
        title: "Mi ubicación",
        zIndex: 9999,
      });
    });
    return () => {
      if (gpsMarkerRef.current) { gpsMarkerRef.current.map = null; gpsMarkerRef.current = null; }
    };
  }, [centerLat, centerLng, hasGps]);

  const handleLocate = useCallback(() => {
    if (onRequestLocation) {
      setLocating(true);
      onRequestLocation();
      setTimeout(() => setLocating(false), 4000);
      return;
    }
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(GPS_ZOOM);
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  }, [onRequestLocation]);

  if (mapError) {
    return (
      <div style={{ height, width: "100%", borderRadius: 12, background: "linear-gradient(135deg,#f8fafc,#f1f5f9)", border: "1px solid rgba(0,0,0,.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <span style={{ fontSize: 32 }}>🗺️</span>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>No se pudo cargar el mapa</p>
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Puedes seguir viendo los resultados en lista.</p>
        <button onClick={() => setMapError(false)} style={{ marginTop: 4, padding: "8px 20px", borderRadius: 10, background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer" }}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ height, width: "100%", borderRadius: 12, overflow: "hidden", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {!ready && (
        <div style={{ position: "absolute", inset: 0, background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #0ea5e9", borderTopColor: "transparent", borderRadius: "50%", animation: "wmap-spin 0.8s linear infinite" }} />
        </div>
      )}

      {ready && selectedWorker && (
        <WorkerCard
          worker={selectedWorker}
          onClose={() => setSelectedWorker(null)}
          onNavigate={() => navigate(`/client/worker/${selectedWorker.id}`)}
        />
      )}

      {ready && (
        <button onClick={handleLocate} title="Usar mi ubicación"
          style={{ position: "absolute", bottom: 52, left: 12, zIndex: 10, width: 40, height: 40, borderRadius: 10, background: locating ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.96)", border: "1px solid rgba(0,0,0,.1)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,.12)", transition: "all 0.2s ease", fontSize: 18 }}>
          {locating ? (
            <div style={{ width: 16, height: 16, border: "2px solid #0ea5e9", borderTopColor: "transparent", borderRadius: "50%", animation: "wmap-spin 0.8s linear infinite" }} />
          ) : "📍"}
        </button>
      )}
    </div>
  );
}
