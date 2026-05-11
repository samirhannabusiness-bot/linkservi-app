import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Car, MapPin, Loader2, Navigation, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useGeolocation, formatDistance } from "@/hooks/useGeolocation";
import { useAuth } from "@/lib/auth-context";
import { getSocket, joinRoom, leaveRoom } from "@/lib/socket";
import { StaticMapCanvas } from "@/components/ui/StaticMapCanvas";
import { CARACAS_CENTER, GPS_ZOOM } from "@/lib/static-maps";

interface NearbyDriver {
  driverId: number;
  name: string;
  avatarUrl: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  distanceKm: number;
  updatedAt: string;
}

interface RideResponse {
  id: number;
  status: string;
  driversNotified?: number;
}

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("transport-map-styles")) return;
  const s = document.createElement("style");
  s.id = "transport-map-styles";
  s.textContent = `
    @keyframes tmap-spin{to{transform:rotate(360deg)}}
    @keyframes tmap-pulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.6);opacity:0}}
  `;
  document.head.appendChild(s);
}

export function TransportRequestPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { position, request: requestGeo, permission } = useGeolocation("user");

  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRideId, setActiveRideId] = useState<number | null>(null);

  useEffect(() => { injectStyles(); }, []);

  const center = useMemo(() => {
    if (position) return { lat: position.lat, lng: position.lng };
    return CARACAS_CENTER;
  }, [position]);

  // ── Fetch nearby drivers ──────────────────────────────────────────────────────
  const fetchNearby = async () => {
    if (!position) return;
    try {
      const data = await apiFetch<NearbyDriver[]>(
        `/api/drivers/nearby?lat=${position.lat}&lng=${position.lng}&radius=5`,
      );
      setDrivers(data ?? []);
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    fetchNearby();
    const t = setInterval(fetchNearby, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  // ── Socket: real-time driver updates ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    joinRoom("transport:nearby");
    const socket = getSocket();

    const onLocation = (payload: NearbyDriver & { isOnline?: boolean }) => {
      if (!position) return;
      const dKm = haversineLite(position.lat, position.lng, payload.lat, payload.lng);
      if (dKm > 5) return;
      setDrivers((prev) => {
        const next = prev.filter((d) => d.driverId !== payload.driverId);
        next.push({ ...payload, distanceKm: dKm });
        next.sort((a, b) => a.distanceKm - b.distanceKm);
        return next.slice(0, 50);
      });
    };
    const onOffline = ({ driverId }: { driverId: number }) => {
      setDrivers((prev) => prev.filter((d) => d.driverId !== driverId));
    };
    const onTaken = ({ rideId }: { rideId: number }) => {
      if (rideId === activeRideId) setLocation(`/transport/ride/${rideId}`);
    };

    socket.on("driver:location", onLocation);
    socket.on("driver:offline", onOffline);
    socket.on("ride:taken", onTaken);

    return () => {
      socket.off("driver:location", onLocation);
      socket.off("driver:offline", onOffline);
      socket.off("ride:taken", onTaken);
      leaveRoom("transport:nearby");
    };
  }, [user, position, activeRideId, setLocation]);

  // ── Check for active ride on mount ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ id: number } | null>("/api/transport/rides/active")
      .then((r) => { if (!cancelled && r?.id) setLocation(`/transport/ride/${r.id}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [setLocation]);

  // ── Request ride ─────────────────────────────────────────────────────────────
  const handleRequestRide = async () => {
    setError(null);
    if (!position) {
      setError("Activa tu ubicación para solicitar un viaje");
      return;
    }
    if (!dropoffAddress.trim()) {
      setError("Escribe a dónde quieres ir");
      return;
    }

    setSubmitting(true);
    try {
      const dropoff = {
        address: dropoffAddress.trim(),
        lat: position.lat + 0.02,
        lng: position.lng + 0.02,
      };

      const ride = await apiFetch<RideResponse>("/api/transport/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress: "Mi ubicación actual",
          pickupLat: position.lat,
          pickupLng: position.lng,
          dropoffAddress: dropoff.address,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
        }),
      });
      if (!ride) throw new Error("No se pudo crear el viaje");
      setActiveRideId(ride.id);
      setLocation(`/transport/ride/${ride.id}`);
    } catch (e: any) {
      setError(e?.message || "No se pudo crear el viaje");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <StaticMapCanvas
        centerLat={center.lat}
        centerLng={center.lng}
        zoom={position ? 14 : GPS_ZOOM}
        dark
        className="absolute inset-0"
        style={{ width: "100%", height: "100%" }}
        loadingFallback={
          <div className="absolute inset-0 bg-[#040c1a] flex items-center justify-center">
            <div style={{ width: 32, height: 32, border: "3px solid #38bdf8", borderTopColor: "transparent", borderRadius: "50%", animation: "tmap-spin 0.8s linear infinite" }} />
          </div>
        }
        fallback={
          <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm p-4 text-center">
            Mapa no disponible. Puedes seguir solicitando un viaje.
          </div>
        }
      >
        {(project) => (
          <>
            {/* User location pulse */}
            {position && (() => {
              const p = project(position.lat, position.lng);
              return (
                <div style={{ position: "absolute", left: p.x - 12, top: p.y - 12, width: 24, height: 24, pointerEvents: "none", zIndex: 50 }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(56,189,248,.3)", animation: "tmap-pulse 2s ease-out infinite" }} />
                  <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "#38bdf8", border: "2px solid #fff", boxShadow: "0 0 10px rgba(56,189,248,.9)" }} />
                </div>
              );
            })()}

            {/* Driver markers */}
            {drivers.map((d) => {
              const p = project(d.lat, d.lng);
              return (
                <div
                  key={d.driverId}
                  title={d.name}
                  style={{
                    position: "absolute",
                    left: p.x - 18, top: p.y - 18,
                    width: 36, height: 36, borderRadius: "50%",
                    background: "#0f172a",
                    border: "2px solid #38bdf8",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                    cursor: "pointer",
                    zIndex: 100,
                  }}
                >
                  🚗
                </div>
              );
            })}
          </>
        )}
      </StaticMapCanvas>

      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
        <div className="glass rounded-2xl px-4 py-2 flex items-center gap-2 text-white">
          <Car className="w-5 h-5 text-cyan-400" />
          <span className="text-sm font-semibold">Transporte</span>
          <span className="text-xs text-white/60">· {drivers.length} conductores cerca</span>
        </div>
        <button
          onClick={() => requestGeo()}
          title="Recentrar"
          className="glass rounded-full w-10 h-10 flex items-center justify-center text-white hover:bg-white/10"
        >
          <Navigation className="w-4 h-4" />
        </button>
      </div>

      {permission === "denied" && (
        <div className="absolute top-20 left-4 right-4 z-10 glass rounded-xl p-3 text-sm text-amber-300 border border-amber-400/30">
          Permite el acceso a tu ubicación para ver conductores cercanos.
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
        <div className="glass rounded-3xl p-4 max-w-xl mx-auto border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-white/60 uppercase tracking-wide">¿A dónde vas?</span>
          </div>
          <input
            type="text"
            value={dropoffAddress}
            onChange={(e) => setDropoffAddress(e.target.value)}
            placeholder="Ej: Centro Comercial Sambil"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
            data-testid="input-transport-dropoff"
          />
          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
          <button
            onClick={handleRequestRide}
            disabled={submitting || !position}
            className="mt-3 w-full btn-gradient text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-request-ride"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Buscando conductor…</>
            ) : (
              <><Car className="w-4 h-4" /> Solicitar viaje</>
            )}
          </button>

          {drivers.length > 0 && (
            <div className="mt-3 max-h-32 overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-white/50 uppercase">Conductores cercanos</span>
                <button onClick={fetchNearby} className="text-white/40 hover:text-white">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <ul className="space-y-1">
                {drivers.slice(0, 5).map((d) => (
                  <li key={d.driverId} className="flex items-center justify-between text-xs text-white/70">
                    <span>🚗 {d.name}</span>
                    <span className="text-cyan-400">{formatDistance(d.distanceKm)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function haversineLite(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
