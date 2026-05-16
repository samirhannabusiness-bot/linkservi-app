import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useContainerSize } from "@/lib/static-maps";

export interface MapProjection {
  (lat: number, lng: number): { x: number; y: number };
}

interface StaticMapCanvasProps {
  centerLat: number;
  centerLng: number;
  zoom: number;
  dark?: boolean;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
  children?: (project: MapProjection, size: { w: number; h: number }) => ReactNode;
}

const TILE_SIZE = 256;

function worldPixel(lat: number, lng: number, zoom: number): { px: number; py: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    px: scale * (0.5 + lng / 360),
    py: scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

function tileUrl(tx: number, ty: number, zoom: number, dark: boolean): string {
  const n = Math.pow(2, zoom);
  const x = ((tx % n) + n) % n;
  const y = ((ty % n) + n) % n;
  if (dark) {
    const s = ["a", "b", "c", "d"][(x + y) % 4];
    return `https://${s}.basemaps.cartocdn.com/dark_all/${zoom}/${x}/${y}.png`;
  }
  const s = ["a", "b", "c"][(x + y) % 3];
  return `https://${s}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

interface TileInfo {
  key: string;
  url: string;
  left: number;
  top: number;
}

function buildTileGrid(
  centerLat: number,
  centerLng: number,
  zoom: number,
  w: number,
  h: number,
  dark: boolean,
): TileInfo[] {
  if (!w || !h) return [];
  const center = worldPixel(centerLat, centerLng, zoom);
  const cx = w / 2;
  const cy = h / 2;

  const originX = center.px - cx;
  const originY = center.py - cy;

  const startTX = Math.floor(originX / TILE_SIZE) - 1;
  const startTY = Math.floor(originY / TILE_SIZE) - 1;
  const endTX = Math.floor((originX + w) / TILE_SIZE) + 1;
  const endTY = Math.floor((originY + h) / TILE_SIZE) + 1;

  const tiles: TileInfo[] = [];
  for (let tx = startTX; tx <= endTX; tx++) {
    for (let ty = startTY; ty <= endTY; ty++) {
      const left = tx * TILE_SIZE - originX;
      const top = ty * TILE_SIZE - originY;
      tiles.push({
        key: `${tx},${ty}`,
        url: tileUrl(tx, ty, zoom, dark),
        left,
        top,
      });
    }
  }
  return tiles;
}

export function StaticMapCanvas({
  centerLat,
  centerLng,
  zoom,
  dark = false,
  className,
  style,
  loadingFallback,
  children,
}: StaticMapCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useContainerSize(ref);
  const [loadedCount, setLoadedCount] = useState(0);

  const tiles = useMemo(
    () => buildTileGrid(centerLat, centerLng, zoom, w, h, dark),
    [centerLat, centerLng, zoom, w, h, dark],
  );

  useEffect(() => {
    setLoadedCount(0);
  }, [centerLat, centerLng, zoom, w, h, dark]);

  const project: MapProjection = useMemo(() => {
    return (lat: number, lng: number) => {
      if (!w || !h) return { x: 0, y: 0 };
      const center = worldPixel(centerLat, centerLng, zoom);
      const point = worldPixel(lat, lng, zoom);
      return {
        x: point.px - center.px + w / 2,
        y: point.py - center.py + h / 2,
      };
    };
  }, [w, h, centerLat, centerLng, zoom]);

  const isLoading = loadedCount < Math.min(tiles.length, 1);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background: dark ? "#0a1424" : "#e8edf3",
        ...style,
      }}
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          onLoad={() => setLoadedCount((c) => c + 1)}
          style={{
            position: "absolute",
            left: tile.left,
            top: tile.top,
            width: TILE_SIZE,
            height: TILE_SIZE,
            userSelect: "none",
            pointerEvents: "none",
            imageRendering: "pixelated",
          }}
        />
      ))}
      {isLoading && loadingFallback}
      {!isLoading && children && children(project, { w, h })}
    </div>
  );
}
