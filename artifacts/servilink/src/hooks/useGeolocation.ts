import { useState, useEffect, useCallback } from "react";
import { saveUserLocation, saveWorkerLocation } from "@/lib/api";

export interface GeoPosition {
  lat: number;
  lng: number;
}

export type GeoPermission = "unknown" | "granted" | "denied" | "prompt";

interface UseGeolocationResult {
  position: GeoPosition | null;
  rawPosition: GeoPosition | null;
  permission: GeoPermission;
  error: string | null;
  loading: boolean;
  request: (opts?: { saveAs?: "user" | "worker" | "none" }) => void;
  refresh: (opts?: { saveAs?: "user" | "worker" | "none" }) => void;
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m de ti`;
  return `${km.toFixed(1)} km de ti`;
}

const CARACAS: GeoPosition = { lat: 10.4806, lng: -66.9036 };

// Venezuela bounding box — reject GPS coordinates outside this box
const VE_BOUNDS = { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 };
function isInVenezuela(lat: number, lng: number): boolean {
  return (
    lat >= VE_BOUNDS.latMin && lat <= VE_BOUNDS.latMax &&
    lng >= VE_BOUNDS.lngMin && lng <= VE_BOUNDS.lngMax
  );
}

// Cache key for last known position
const POSITION_KEY = "sl_last_position";
const PERMISSION_KEY = "sl_geo_permission";

function loadCachedPosition(): GeoPosition | null {
  try {
    const raw = sessionStorage.getItem(POSITION_KEY);
    if (raw) {
      const pos: GeoPosition = JSON.parse(raw);
      // Discard cached positions outside Venezuela (e.g. from browser dev tools)
      if (isInVenezuela(pos.lat, pos.lng)) return pos;
      sessionStorage.removeItem(POSITION_KEY);
    }
  } catch {}
  return null;
}

function cachePosition(pos: GeoPosition) {
  try { sessionStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch {}
}

export function useGeolocation(saveAs: "user" | "worker" | "none" = "none"): UseGeolocationResult {
  const [rawPosition, setRawPosition] = useState<GeoPosition | null>(() => loadCachedPosition());
  const [permission, setPermission] = useState<GeoPermission>(() => {
    try { return (sessionStorage.getItem(PERMISSION_KEY) as GeoPermission) || "unknown"; } catch { return "unknown"; }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const persistLocation = useCallback(async (pos: GeoPosition, as: "user" | "worker" | "none") => {
    try {
      if (as === "user") await saveUserLocation(pos.lat, pos.lng);
      if (as === "worker") await saveWorkerLocation(pos.lat, pos.lng);
    } catch {}
  }, []);

  const request = useCallback((opts?: { saveAs?: "user" | "worker" | "none" }) => {
    const saveTo = opts?.saveAs ?? saveAs;
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización");
      setPermission("denied");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPermission("granted");
        try { sessionStorage.setItem(PERMISSION_KEY, "granted"); } catch {}
        setLoading(false);

        // Only use coordinates that are actually within Venezuela
        if (!isInVenezuela(lat, lng)) return;

        const gp: GeoPosition = { lat, lng };
        setRawPosition(gp);
        cachePosition(gp);
        persistLocation(gp, saveTo);
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setPermission(denied ? "denied" : "unknown");
        try { sessionStorage.setItem(PERMISSION_KEY, denied ? "denied" : "unknown"); } catch {}
        setError(denied
          ? "Permiso de ubicación denegado. Actívalo en la configuración de tu navegador."
          : "No se pudo obtener tu ubicación. Intenta de nuevo.");
        setLoading(false);
      },
      { timeout: 10000, maximumAge: 120000, enableHighAccuracy: true }
    );
  }, [saveAs, persistLocation]);

  const refresh = useCallback((opts?: { saveAs?: "user" | "worker" | "none" }) => {
    request({ saveAs: opts?.saveAs ?? saveAs });
  }, [request, saveAs]);

  // Auto-request on mount only if permission was previously granted explicitly
  useEffect(() => {
    if (permission === "granted") {
      request({ saveAs: saveAs });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // position: actual GPS if available, CARACAS as fallback for map center only
  const position = rawPosition ?? (permission === "denied" ? null : CARACAS);

  return { position, rawPosition, permission, error, loading, request, refresh };
}
