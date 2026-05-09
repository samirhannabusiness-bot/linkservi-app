import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Car, MapPin, Loader2, Navigation, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useGeolocation, formatDistance } from "@/hooks/useGeolocation";
import { useAuth } from "@/lib/auth-context";
import { getSocket, joinRoom, leaveRoom } from "@/lib/socket";
import { loadMapsLib, loadMarkerLib, DARK_MAP_STYLE } from "@/lib/google-maps";

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

const CARACAS = { lat: 10.4806, lng: -66.9036 };

function injectStyles() {
  if (document.getElementById("transport-map-styles")) return;
  const s = document.createElement("style");
  s.id = "transport-map-styles";
  s.textContent = `@keyframes tmap-spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(s);
}

function buildUserMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:20px;height:20px;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 6px rgba(56,189,248,0.25);border:2px solid white;";
  return el;
}

function buildDriverMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:36px;height:36px;border-radius:50%;background:#0f172a;border:2px solid #38bdf8;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.4);cursor:pointer;";
  el.innerHTML = "🚗";
  return el;
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
  const [mapReady, setMapReady] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const driverMarkersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());

  const center = useMemo(() => {
    if (position) return { lat: position.lat, lng: position.lng };
    return CARACAS;
  }, [position]);

  // ── Init map once ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current) return;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    injectStyles();
    let destroyed = false;

    (async () => {
      try {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          loadMapsLib(),
          loadMarkerLib(),
        ]);
        if (destroyed || !mapDivRef.current) return;

        const map = new Map(mapDivRef.current, {
          center,
          zoom: 13,
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: 9 },
          gestureHandling: "greedy",
          styles: DARK_MAP_STYLE,
        });

        mapRef.current = map;
        if (!destroyed) setMapReady(true);
      } catch {
        /* map unavailable */
      }
    })();

    return () => {
      destroyed = true;
      driverMarkersRef.current.forEach(m => { m.map = null; });
      driverMarkersRef.current.clear();
      if (userMarkerRef.current) { userMarkerRef.current.map = null; userMarkerRef.current = null; }
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pan + user marker when position arrives ───────────────────────────────────
  useEffect(() => {
    if (!position || !mapRef.current) return;
    mapRef.current.panTo({ lat: position.lat, lng: position.lng });
    mapRef.current.setZoom(14);

    loadMarkerLib().then(({ AdvancedMarkerElement }) => {
      if (userMarkerRef.current) { userMarkerRef.current.map = null; userMarkerRef.current = null; }
      const map = mapRef.current;
      if (!map) return;
      userMarkerRef.current = new AdvancedMarkerElement({
        map,
        position: { lat: position.lat, lng: position.lng },
        content: buildUserMarkerEl(),
        title: "Mi ubicación",
        zIndex: 9999,
      });
    });
  }, [position]);

  // ── Driver markers ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    loadMarkerLib().then(({ AdvancedMarkerElement }) => {
      const seen = new Set<number>();
      drivers.forEach((d) => {
        seen.add(d.driverId);
        const existing = driverMarkersRef.current.get(d.driverId);
        if (existing) {
          existing.position = { lat: d.lat, lng: d.lng };
        } else {
          const m = new AdvancedMarkerElement({
            map,
            position: { lat: d.lat, lng: d.lng },
            content: buildDriverMarkerEl(),
            title: d.name,
          });
          driverMarkersRef.current.set(d.driverId, m);
        }
      });

      driverMarkersRef.current.forEach((m, id) => {
        if (!seen.has(id)) {
          m.map = null;
          driverMarkersRef.current.delete(id);
        }
      });
    });
  }, [drivers]);

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
      <div ref={mapDivRef} className="absolute inset-0" />

      {!mapReady && (
        <div className="absolute inset-0 bg-[#040c1a] flex items-center justify-center">
          <div style={{ width: 32, height: 32, border: "3px solid #38bdf8", borderTopColor: "transparent", borderRadius: "50%", animation: "tmap-spin 0.8s linear infinite" }} />
        </div>
      )}

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
