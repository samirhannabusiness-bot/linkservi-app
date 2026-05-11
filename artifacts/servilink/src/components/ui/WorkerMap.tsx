import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Star, MapPin, CheckCircle, X, ChevronRight, Clock, Plus, Minus } from "lucide-react";
import {
  CARACAS_CENTER,
  CITY_ZOOM,
  GPS_ZOOM,
  buildStaticMapUrl,
  clampMapSize,
  coverTransform,
  fanOutOverlappingPoints,
  hasApiKey,
  latLngToPixel,
  useContainerSize,
} from "@/lib/static-maps";

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

const MIN_ZOOM = 8;
const MAX_ZOOM = 18;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("wmap-static-styles")) return;
  const s = document.createElement("style");
  s.id = "wmap-static-styles";
  s.textContent = `
    @keyframes wmaps-pulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.8);opacity:0}}
    @keyframes wmaps-popup{from{opacity:0;transform:scale(.94) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes wmaps-spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(s);
}

function WorkerPin({
  worker,
  onClick,
}: {
  worker: Worker;
  onClick: (e: React.MouseEvent) => void;
}) {
  const initial = worker.name.charAt(0).toUpperCase();
  return (
    <div
      onClick={onClick}
      style={{ position: "relative", width: 44, height: 44, cursor: "pointer", userSelect: "none" }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: "50%",
          background: worker.isAvailable ? "#1e3a5f" : "#1e293b",
          border: `3px solid ${worker.isVerified ? "#0ea5e9" : "#94a3b8"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800,
          color: worker.isAvailable && worker.isVerified ? "#38bdf8" : "#cbd5e1",
          boxShadow: "0 4px 12px rgba(0,0,0,.35)",
        }}
      >
        {initial}
      </div>
      {worker.isAvailable && (
        <div style={{ position: "absolute", bottom: 2, right: 2, width: 11, height: 11, borderRadius: "50%", background: "#10b981", border: "2px solid #fff" }} />
      )}
    </div>
  );
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
        animation: "wmaps-popup .2s cubic-bezier(.34,1.56,.64,1)",
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
  const { w: containerW, h: containerH } = useContainerSize(containerRef);

  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [locating, setLocating] = useState(false);

  const hasGps = typeof centerLat === "number" && typeof centerLng === "number";

  const [mapCenterLat, setMapCenterLat] = useState<number>(hasGps ? centerLat! : CARACAS_CENTER.lat);
  const [mapCenterLng, setMapCenterLng] = useState<number>(hasGps ? centerLng! : CARACAS_CENTER.lng);
  const [zoom, setZoom] = useState<number>(hasGps ? GPS_ZOOM : CITY_ZOOM);

  // Recenter when external GPS changes
  useEffect(() => {
    if (hasGps) {
      setMapCenterLat(centerLat!);
      setMapCenterLng(centerLng!);
      setZoom(z => (z < GPS_ZOOM ? GPS_ZOOM : z));
    }
  }, [centerLat, centerLng, hasGps]);

  useEffect(() => { injectStyles(); }, []);

  const mapUrl = useMemo(() => {
    if (!containerW || !containerH || !hasApiKey()) return null;
    setImgLoaded(false);
    setImgError(false);
    return buildStaticMapUrl({
      centerLat: mapCenterLat,
      centerLng: mapCenterLng,
      zoom,
      width: containerW,
      height: containerH,
      dark: true,
    });
  }, [mapCenterLat, mapCenterLng, zoom, containerW, containerH]);

  const pins = useMemo(() => {
    const withCoords = workers
      .filter(w => w.lat != null && w.lng != null)
      .map(w => ({ ...w, lat: w.lat!, lng: w.lng! }));
    return fanOutOverlappingPoints(withCoords);
  }, [workers]);

  const pinPositions = useMemo(() => {
    if (!containerW || !containerH) return [];
    const { safeW, safeH } = clampMapSize(containerW, containerH);
    const t = coverTransform(safeW, safeH, containerW, containerH);
    return pins.map(w => {
      const imgPx = latLngToPixel(w.displayLat, w.displayLng, mapCenterLat, mapCenterLng, zoom, safeW, safeH);
      const px = { x: imgPx.x * t.scale + t.offsetX, y: imgPx.y * t.scale + t.offsetY };
      return { worker: w, px };
    });
  }, [pins, mapCenterLat, mapCenterLng, zoom, containerW, containerH]);

  const gpsPos = useMemo(() => {
    if (!hasGps || !containerW || !containerH) return null;
    const { safeW, safeH } = clampMapSize(containerW, containerH);
    const t = coverTransform(safeW, safeH, containerW, containerH);
    const imgPx = latLngToPixel(centerLat!, centerLng!, mapCenterLat, mapCenterLng, zoom, safeW, safeH);
    return { x: imgPx.x * t.scale + t.offsetX, y: imgPx.y * t.scale + t.offsetY };
  }, [hasGps, centerLat, centerLng, mapCenterLat, mapCenterLng, zoom, containerW, containerH]);

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
        setMapCenterLat(pos.coords.latitude);
        setMapCenterLng(pos.coords.longitude);
        setZoom(GPS_ZOOM);
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  }, [onRequestLocation]);

  const handlePinClick = useCallback((w: Worker) => {
    setSelectedWorker(w);
    if (w.lat != null && w.lng != null) {
      setMapCenterLat(w.lat);
      setMapCenterLng(w.lng);
      setZoom(z => (z < 13 ? 13 : z));
    }
  }, []);

  if (!hasApiKey() || imgError) {
    return (
      <div style={{ height, width: "100%", borderRadius: 12, background: "linear-gradient(135deg,#f8fafc,#f1f5f9)", border: "1px solid rgba(0,0,0,.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <span style={{ fontSize: 32 }}>🗺️</span>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>No se pudo cargar el mapa</p>
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Puedes seguir viendo los resultados en lista.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: 12, overflow: "hidden", position: "relative", background: "#0d1422" }}
      onClick={() => setSelectedWorker(null)}
    >
      {mapUrl && (
        <img
          src={mapUrl}
          alt="Mapa"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          draggable={false}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
            opacity: imgLoaded ? 1 : 0,
            transition: "opacity .25s ease",
            userSelect: "none", pointerEvents: "none",
          }}
        />
      )}

      {!imgLoaded && (
        <div style={{ position: "absolute", inset: 0, background: "#0d1422", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #0ea5e9", borderTopColor: "transparent", borderRadius: "50%", animation: "wmaps-spin 0.8s linear infinite" }} />
        </div>
      )}

      {/* GPS pulse */}
      {imgLoaded && gpsPos && (
        <div style={{ position: "absolute", left: gpsPos.x - 12, top: gpsPos.y - 12, width: 24, height: 24, pointerEvents: "none", zIndex: 5 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(59,130,246,.28)", animation: "wmaps-pulse 2s ease-out infinite" }} />
          <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "#3b82f6", border: "2px solid #fff", boxShadow: "0 0 10px rgba(59,130,246,.9)" }} />
        </div>
      )}

      {/* Worker pins */}
      {imgLoaded && pinPositions.map(({ worker, px }) => {
        if (px.x < -50 || px.x > containerW + 50 || px.y < -50 || px.y > containerH + 50) return null;
        const isSelected = selectedWorker?.id === worker.id;
        return (
          <div
            key={worker.id}
            style={{
              position: "absolute",
              left: px.x - 22, top: px.y - 22,
              zIndex: isSelected ? 200 : 100,
            }}
          >
            <WorkerPin
              worker={worker}
              onClick={(e) => { e.stopPropagation(); handlePinClick(worker); }}
            />
          </div>
        );
      })}

      {/* Worker card */}
      {imgLoaded && selectedWorker && (
        <WorkerCard
          worker={selectedWorker}
          onClose={() => setSelectedWorker(null)}
          onNavigate={() => navigate(`/client/worker/${selectedWorker.id}`)}
        />
      )}

      {/* Locate button */}
      {imgLoaded && (
        <button
          onClick={(e) => { e.stopPropagation(); handleLocate(); }}
          title="Usar mi ubicación"
          style={{ position: "absolute", bottom: 52, left: 12, zIndex: 10, width: 40, height: 40, borderRadius: 10, background: locating ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.96)", border: "1px solid rgba(0,0,0,.1)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,.12)", fontSize: 18 }}
        >
          {locating ? (
            <div style={{ width: 16, height: 16, border: "2px solid #0ea5e9", borderTopColor: "transparent", borderRadius: "50%", animation: "wmaps-spin 0.8s linear infinite" }} />
          ) : "📍"}
        </button>
      )}

      {/* Zoom controls */}
      {imgLoaded && (
        <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 10, display: "flex", flexDirection: "column", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.12)", border: "1px solid rgba(0,0,0,.1)" }}>
          <button
            onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(MAX_ZOOM, z + 1)); }}
            disabled={zoom >= MAX_ZOOM}
            title="Acercar"
            style={{ width: 36, height: 36, border: "none", background: "rgba(255,255,255,.96)", cursor: zoom >= MAX_ZOOM ? "not-allowed" : "pointer", borderBottom: "1px solid rgba(0,0,0,.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}
          >
            <Plus style={{ width: 16, height: 16 }} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(MIN_ZOOM, z - 1)); }}
            disabled={zoom <= MIN_ZOOM}
            title="Alejar"
            style={{ width: 36, height: 36, border: "none", background: "rgba(255,255,255,.96)", cursor: zoom <= MIN_ZOOM ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" }}
          >
            <Minus style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}
    </div>
  );
}
