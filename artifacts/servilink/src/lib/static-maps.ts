import { useEffect, useState, type RefObject } from "react";

const TILE_SIZE = 256;

export const CARACAS_CENTER = { lat: 10.4806, lng: -66.9036 };
export const CITY_ZOOM = 11;
export const GPS_ZOOM = 13;

/** @deprecated No longer needed — maps use OSM tiles (no API key required) */
export function hasApiKey(): boolean {
  return true;
}

/** World pixel coordinates for a lat/lng at a given zoom level (OSM/Mercator) */
export function worldPixel(lat: number, lng: number, zoom: number): { px: number; py: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    px: scale * (0.5 + lng / 360),
    py: scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

/** Convert lat/lng to container pixel coordinates given a center and container size */
export function projectToContainer(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
  containerW: number,
  containerH: number,
): { x: number; y: number } {
  const center = worldPixel(centerLat, centerLng, zoom);
  const point = worldPixel(lat, lng, zoom);
  return {
    x: point.px - center.px + containerW / 2,
    y: point.py - center.py + containerH / 2,
  };
}

export interface OsmTile {
  key: string;
  url: string;
  left: number;
  top: number;
}

/** Build the list of OSM tiles needed to fill a container */
export function buildOsmTiles(
  centerLat: number,
  centerLng: number,
  zoom: number,
  w: number,
  h: number,
  dark: boolean,
): OsmTile[] {
  if (!w || !h) return [];
  const center = worldPixel(centerLat, centerLng, zoom);
  const originX = center.px - w / 2;
  const originY = center.py - h / 2;

  const startTX = Math.floor(originX / TILE_SIZE) - 1;
  const startTY = Math.floor(originY / TILE_SIZE) - 1;
  const endTX = Math.floor((originX + w) / TILE_SIZE) + 1;
  const endTY = Math.floor((originY + h) / TILE_SIZE) + 1;

  const n = Math.pow(2, zoom);
  const tiles: OsmTile[] = [];
  for (let tx = startTX; tx <= endTX; tx++) {
    for (let ty = startTY; ty <= endTY; ty++) {
      const wx = ((tx % n) + n) % n;
      const wy = ((ty % n) + n) % n;
      let url: string;
      if (dark) {
        const s = ["a", "b", "c", "d"][(wx + wy) % 4];
        url = `https://${s}.basemaps.cartocdn.com/dark_all/${zoom}/${wx}/${wy}.png`;
      } else {
        const s = ["a", "b", "c"][(wx + wy) % 3];
        url = `https://${s}.tile.openstreetmap.org/${zoom}/${wx}/${wy}.png`;
      }
      tiles.push({
        key: `${tx},${ty}`,
        url,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }
  return tiles;
}

function project(lat: number, lng: number) {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: TILE_SIZE * (0.5 + lng / 360),
    y: TILE_SIZE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

export function latLngToPixel(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  const scale = Math.pow(2, zoom);
  const center = project(centerLat, centerLng);
  const point = project(lat, lng);
  return {
    x: (point.x - center.x) * scale + containerWidth / 2,
    y: (point.y - center.y) * scale + containerHeight / 2,
  };
}

export function clampMapSize(w: number, h: number) {
  return {
    safeW: Math.min(Math.max(Math.round(w), 100), 640),
    safeH: Math.min(Math.max(Math.round(h), 100), 640),
  };
}

/**
 * Transform from static-image pixel space to container pixel space,
 * matching CSS `object-fit: cover` behavior.
 */
export function coverTransform(
  safeW: number,
  safeH: number,
  containerW: number,
  containerH: number,
) {
  const scale = Math.max(containerW / safeW, containerH / safeH);
  const renderedW = safeW * scale;
  const renderedH = safeH * scale;
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;
  return { scale, offsetX, offsetY };
}

interface BuildUrlOptions {
  centerLat: number;
  centerLng: number;
  zoom: number;
  width: number;
  height: number;
  dark?: boolean;
}

export function buildStaticMapUrl({
  centerLat,
  centerLng,
  zoom,
  width,
  height,
  dark = false,
}: BuildUrlOptions): string {
  const { safeW, safeH } = clampMapSize(width, height);

  const styles = dark
    ? [
        "feature:all|element:geometry|color:0x0f1722",
        "feature:all|element:labels.text.fill|color:0x8a96aa",
        "feature:all|element:labels.text.stroke|color:0x0f1722",
        "feature:road|element:geometry|color:0x1c2a40",
        "feature:road|element:geometry.stroke|color:0x0a1424",
        "feature:road.highway|element:geometry|color:0x223655",
        "feature:water|element:geometry|color:0x0a1424",
        "feature:water|element:labels.text.fill|color:0x3d5068",
        "feature:poi|visibility:off",
        "feature:poi.business|visibility:off",
        "feature:transit|visibility:off",
        "feature:administrative|element:geometry|color:0x1a2540",
      ]
    : [
        "feature:poi|visibility:off",
        "feature:poi.business|visibility:off",
        "feature:transit|visibility:off",
      ];

  const params = new URLSearchParams({
    center: `${centerLat},${centerLng}`,
    zoom: String(zoom),
    size: `${safeW}x${safeH}`,
    scale: "2",
    maptype: "roadmap",
    key: API_KEY,
  });

  let qs = params.toString();
  for (const s of styles) qs += `&style=${encodeURIComponent(s)}`;
  return `https://maps.googleapis.com/maps/api/staticmap?${qs}`;
}

/**
 * Compute the center+zoom that fits two points within a container with padding.
 * Mirrors Google Maps' fitBounds() for two-point cases (pickup/dropoff).
 */
export function computeBoundsZoom(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
  containerW: number,
  containerH: number,
  paddingPx: number = 60,
): { centerLat: number; centerLng: number; zoom: number } {
  const centerLat = (latA + latB) / 2;
  const centerLng = (lngA + lngB) / 2;
  if (containerW <= 0 || containerH <= 0) return { centerLat, centerLng, zoom: 13 };

  const TILE = 256;
  const projY = (lat: number) => {
    const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
    return TILE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI));
  };
  const projX = (lng: number) => TILE * (0.5 + lng / 360);

  const dx = Math.abs(projX(lngA) - projX(lngB));
  const dy = Math.abs(projY(latA) - projY(latB));
  if (dx === 0 && dy === 0) return { centerLat, centerLng, zoom: 15 };

  const { safeW, safeH } = clampMapSize(containerW, containerH);
  const availW = Math.max(safeW - paddingPx, 80);
  const availH = Math.max(safeH - paddingPx, 80);
  const zoomX = dx > 0 ? Math.log2(availW / dx) : 20;
  const zoomY = dy > 0 ? Math.log2(availH / dy) : 20;
  const zoom = Math.max(8, Math.min(17, Math.floor(Math.min(zoomX, zoomY))));
  return { centerLat, centerLng, zoom };
}

export function fanOutOverlappingPoints<T extends { lat: number; lng: number }>(
  items: T[],
): Array<T & { displayLat: number; displayLng: number }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  const out: Array<T & { displayLat: number; displayLng: number }> = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push({ ...group[0], displayLat: group[0].lat, displayLng: group[0].lng });
    } else {
      const radius = 0.0008;
      const step = (Math.PI * 2) / group.length;
      group.forEach((item, i) => {
        const angle = step * i - Math.PI / 2;
        out.push({
          ...item,
          displayLat: item.lat + Math.sin(angle) * radius,
          displayLng: item.lng + Math.cos(angle) * radius,
        });
      });
    }
  }
  return out;
}

export function useContainerSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
