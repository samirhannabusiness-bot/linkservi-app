import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  buildStaticMapUrl,
  clampMapSize,
  coverTransform,
  hasApiKey,
  latLngToPixel,
  useContainerSize,
} from "@/lib/static-maps";

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

/**
 * Static map background (Google Maps Static API) with an absolutely-positioned
 * overlay layer. Children receive a `project(lat, lng)` function to place HTML
 * markers in container pixel space, accounting for image clamping (640 max)
 * and CSS object-fit:cover scaling.
 */
export function StaticMapCanvas({
  centerLat,
  centerLng,
  zoom,
  dark = false,
  className,
  style,
  fallback,
  loadingFallback,
  children,
}: StaticMapCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useContainerSize(ref);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const url = useMemo(() => {
    if (!w || !h || !hasApiKey()) return null;
    return buildStaticMapUrl({
      centerLat,
      centerLng,
      zoom,
      width: w,
      height: h,
      dark,
    });
  }, [centerLat, centerLng, zoom, w, h, dark]);

  useEffect(() => {
    if (!url) return;
    setLoaded(false);
    setErrored(false);
  }, [url]);

  const project: MapProjection = useMemo(() => {
    return (lat: number, lng: number) => {
      if (!w || !h) return { x: 0, y: 0 };
      const { safeW, safeH } = clampMapSize(w, h);
      const t = coverTransform(safeW, safeH, w, h);
      const imgPx = latLngToPixel(lat, lng, centerLat, centerLng, zoom, safeW, safeH);
      return { x: imgPx.x * t.scale + t.offsetX, y: imgPx.y * t.scale + t.offsetY };
    };
  }, [w, h, centerLat, centerLng, zoom]);

  if (!hasApiKey() || errored) {
    return (
      <div ref={ref} className={className} style={{ position: "relative", overflow: "hidden", background: dark ? "#0a1424" : "#e8edf3", ...style }}>
        {fallback}
      </div>
    );
  }

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
      {url && (
        <img
          src={url}
          alt="Mapa"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            transition: "opacity .25s ease",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      )}
      {!loaded && loadingFallback}
      {loaded && children && children(project, { w, h })}
    </div>
  );
}
