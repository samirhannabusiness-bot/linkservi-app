import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ShoppingBag, Truck, MapPin, X, ShoppingCart, Store, Plus, Minus } from "lucide-react";
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

interface Product {
  id: number;
  name: string;
  description: string | null;
  priceUsd: number;
  image: string | null;
  category: string;
  condition: string;
  hasDelivery: boolean;
  latitude: number | null;
  longitude: number | null;
  coHostId: number;
  coHostName: string | null;
  storeId?: number | null;
  storeName?: string | null;
  stock?: number | null;
  listingType?: string;
  rentalPricePerDay?: number | null;
}

interface ProductMapProps {
  products: Product[];
  userLat: number | null;
  userLng: number | null;
  bcvRate: number;
  onBuy: (productId: number) => void;
  canBuy: boolean;
  successId: number | null;
  onRequestLocation?: () => void;
  selectedProductId?: number | null;
  onProductSelect?: (id: number | null) => void;
  onVisibleProductsChange?: (ids: number[]) => void;
}

const MIN_ZOOM = 8;
const MAX_ZOOM = 18;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("productmap-static-styles")) return;
  const s = document.createElement("style");
  s.id = "productmap-static-styles";
  s.textContent = `
    @keyframes pms-spin { to { transform:rotate(360deg) } }
    @keyframes pms-pulse { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(2.8);opacity:0} }
    @keyframes pms-in { from{opacity:0;transform:scale(.88) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
  `;
  document.head.appendChild(s);
}

function PricePill({
  product,
  isSelected,
  isSuccess,
  onClick,
}: {
  product: Product;
  isSelected: boolean;
  isSuccess: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const isRental = product.listingType === "rental";
  const price =
    isRental && product.rentalPricePerDay != null ? product.rentalPricePerDay : product.priceUsd;
  const suffix = isRental ? "/d" : "";

  let bg: string, color: string, border: string, shadow: string, scale: number;
  if (isSuccess) {
    bg = "#10b981"; color = "#fff";
    border = "2px solid #059669"; shadow = "0 4px 16px rgba(16,185,129,.5)"; scale = 1.08;
  } else if (isSelected) {
    bg = "#0f172a"; color = "#fff";
    border = "2px solid #0f172a"; shadow = "0 6px 20px rgba(0,0,0,.35)"; scale = 1.12;
  } else if (isRental) {
    bg = "#fff"; color = "#7c3aed";
    border = "2px solid #7c3aed"; shadow = "0 2px 10px rgba(124,58,237,.25)"; scale = 1;
  } else {
    bg = "#fff"; color = "#0f172a";
    border = "2px solid transparent"; shadow = "0 2px 8px rgba(0,0,0,.18)"; scale = 1;
  }

  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer", position: "relative",
        animation: "pms-in .2s cubic-bezier(.34,1.56,.64,1)",
        display: "inline-flex", flexDirection: "column", alignItems: "center",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "5px 10px", borderRadius: 100,
          background: bg, color,
          fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
          border, boxShadow: shadow,
          transform: `scale(${scale})`,
          transition: "transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s ease,background .18s ease",
        }}
      >
        {isSuccess ? "✓ " : ""}${price.toFixed(0)}{suffix}
      </div>
      <div
        style={{
          width: 6, height: 6, borderRadius: "50%", marginTop: 2,
          background: isSelected ? "#0f172a" : isRental ? "#7c3aed" : "#94a3b8",
          boxShadow: "0 2px 4px rgba(0,0,0,.15)",
        }}
      />
    </div>
  );
}

function FloatingProductCard({
  product,
  pos,
  containerW,
  containerH,
  bcvRate,
  onBuy,
  canBuy,
  isSuccess,
  onClose,
  userLat,
  userLng,
}: {
  product: Product;
  pos: { x: number; y: number };
  containerW: number;
  containerH: number;
  bcvRate: number;
  onBuy: (id: number) => void;
  canBuy: boolean;
  isSuccess: boolean;
  onClose: () => void;
  userLat: number | null;
  userLng: number | null;
}) {
  const CARD_W = 216;
  const CARD_H = 200;
  const MARKER_OFFSET = 38;
  const ARROW = 8;
  const PAD = 10;

  const isRental = product.listingType === "rental";
  const displayPrice = isRental && product.rentalPricePerDay != null ? product.rentalPricePerDay : product.priceUsd;
  const priceVes = bcvRate > 0 ? Math.round(displayPrice * bcvRate) : null;
  const condColor = product.condition === "used" ? "#f59e0b" : "#10b981";
  const condLabel = product.condition === "used" ? "Usado" : "Nuevo";
  const dist = userLat != null && userLng != null && product.latitude != null && product.longitude != null
    ? distanceKm(userLat, userLng, product.latitude, product.longitude)
    : null;

  let left = pos.x - CARD_W / 2;
  let top = pos.y - CARD_H - MARKER_OFFSET - ARROW;
  const placeBelow = top < PAD;
  if (placeBelow) top = pos.y + MARKER_OFFSET + ARROW;
  left = Math.max(PAD, Math.min(left, containerW - CARD_W - PAD));
  top = Math.max(PAD, Math.min(top, containerH - CARD_H - PAD));

  const arrowLeft = Math.max(16, Math.min(pos.x - left - 8, CARD_W - 32));

  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 450 }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", left, top, width: CARD_W, zIndex: 500,
          borderRadius: 16, background: "#fff",
          boxShadow: "0 8px 28px rgba(0,0,0,.22), 0 1px 4px rgba(0,0,0,.08)",
          overflow: "visible",
          animation: "pms-in .2s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        {!placeBelow && (
          <div style={{ position: "absolute", bottom: -7, left: arrowLeft, width: 14, height: 8, overflow: "hidden", zIndex: 1 }}>
            <div style={{ width: 14, height: 14, background: "#fff", transform: "rotate(45deg)", marginTop: -7, boxShadow: "2px 2px 4px rgba(0,0,0,.1)" }} />
          </div>
        )}
        {placeBelow && (
          <div style={{ position: "absolute", top: -7, left: arrowLeft, width: 14, height: 8, overflow: "hidden", zIndex: 1 }}>
            <div style={{ width: 14, height: 14, background: "#fff", transform: "rotate(45deg)", marginTop: 1, boxShadow: "-1px -1px 3px rgba(0,0,0,.08)" }} />
          </div>
        )}

        <div style={{ borderRadius: 16, overflow: "hidden" }}>
          <div style={{ width: "100%", height: 108, background: "#f1f5f9", position: "relative" }}>
            {product.image ? (
              <img src={product.image} alt={product.name} loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShoppingBag style={{ width: 28, height: 28, color: "#cbd5e1" }} />
              </div>
            )}
            <button onClick={e => { e.stopPropagation(); onClose(); }}
              style={{ position: "absolute", top: 7, right: 7, width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,.9)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }}>
              <X style={{ width: 12, height: 12, color: "#475569" }} />
            </button>
            <div style={{ position: "absolute", bottom: 7, left: 7, display: "flex", gap: 4 }}>
              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: `${condColor}ee`, color: "#fff", fontWeight: 700 }}>
                {condLabel}
              </span>
              {isRental && (
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: "rgba(124,58,237,.85)", color: "#fff", fontWeight: 700 }}>
                  🔑 Alquiler
                </span>
              )}
            </div>
          </div>

          <div style={{ padding: "9px 11px 11px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", lineHeight: 1.35, margin: "0 0 5px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
              {product.name}
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>
                    ${displayPrice.toFixed(0)}{isRental ? <span style={{ fontSize: 10, fontWeight: 500 }}>/d</span> : ""}
                  </span>
                  <span style={{ fontSize: 9, color: "#94a3b8" }}>USD</span>
                </div>
                {priceVes && (
                  <p style={{ fontSize: 10, color: "#10b981", fontWeight: 600, margin: 0 }}>
                    Bs. {priceVes.toLocaleString("es-VE")}
                  </p>
                )}
              </div>

              {canBuy ? (
                isSuccess ? (
                  <div style={{ fontSize: 11, padding: "6px 10px", borderRadius: 10, background: "#d1fae5", color: "#059669", fontWeight: 800 }}>
                    ✓ Listo
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); onBuy(product.id); }}
                    style={{ padding: "7px 12px", borderRadius: 10, background: isRental ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "linear-gradient(135deg,#0f172a,#1e293b)", border: "none", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, boxShadow: isRental ? "0 3px 10px rgba(124,58,237,.35)" : "0 3px 10px rgba(0,0,0,.18)", whiteSpace: "nowrap" }}>
                    <ShoppingCart style={{ width: 11, height: 11 }} />
                    {isRental ? "Reservar" : "Comprar"}
                  </button>
                )
              ) : (
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Inicia sesión</span>
              )}
            </div>

            {(product.hasDelivery || dist != null || product.storeName) && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                {product.hasDelivery && (
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: "#dbeafe", color: "#2563eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
                    <Truck style={{ width: 8, height: 8 }} /> Delivery
                  </span>
                )}
                {dist != null && (
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: "#f1f5f9", color: "#475569", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
                    <MapPin style={{ width: 8, height: 8 }} /> {formatDist(dist)}
                  </span>
                )}
                {product.storeName && (
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: "#fef3c7", color: "#d97706", fontWeight: 600, display: "flex", alignItems: "center", gap: 2, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Store style={{ width: 8, height: 8, flexShrink: 0 }} /> {product.storeName}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function ProductMap({
  products, userLat, userLng, bcvRate, onBuy, canBuy, successId, onRequestLocation,
  selectedProductId, onProductSelect, onVisibleProductsChange,
}: ProductMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { w: containerW, h: containerH } = useContainerSize(containerRef);

  const [internalSelected, setInternalSelected] = useState<number | null>(null);
  const selectedId = selectedProductId !== undefined ? selectedProductId : internalSelected;

  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [locating, setLocating] = useState(false);

  const hasGps = typeof userLat === "number" && typeof userLng === "number";

  const [centerLat, setCenterLat] = useState<number>(hasGps ? userLat! : CARACAS_CENTER.lat);
  const [centerLng, setCenterLng] = useState<number>(hasGps ? userLng! : CARACAS_CENTER.lng);
  const [zoom, setZoom] = useState<number>(hasGps ? GPS_ZOOM : CITY_ZOOM);

  // Recenter when GPS becomes available
  useEffect(() => {
    if (hasGps) {
      setCenterLat(userLat!);
      setCenterLng(userLng!);
      setZoom(z => (z < GPS_ZOOM ? GPS_ZOOM : z));
    }
  }, [userLat, userLng, hasGps]);

  // Pan to selected product
  useEffect(() => {
    if (!selectedId) return;
    const p = products.find(x => x.id === selectedId);
    if (p?.latitude != null && p?.longitude != null) {
      setCenterLat(p.latitude);
      setCenterLng(p.longitude);
      setZoom(z => (z < 13 ? 13 : z));
    }
  }, [selectedId, products]);

  useEffect(() => { injectStyles(); }, []);

  // Build static map URL (only re-fetch when meaningful inputs change)
  const mapUrl = useMemo(() => {
    if (!containerW || !containerH || !hasApiKey()) return null;
    setImgLoaded(false);
    setImgError(false);
    return buildStaticMapUrl({
      centerLat, centerLng, zoom,
      width: containerW, height: containerH,
      dark: false,
    });
  }, [centerLat, centerLng, zoom, containerW, containerH]);

  // Compute pins (with fan-out for overlapping coords)
  const pins = useMemo(() => {
    const withCoords = products
      .filter(p => p.latitude != null && p.longitude != null)
      .map(p => ({ ...p, lat: p.latitude!, lng: p.longitude! }));
    return fanOutOverlappingPoints(withCoords);
  }, [products]);

  // Compute screen positions for pins (in static-image space, then transform to container via cover)
  const pinPositions = useMemo(() => {
    if (!containerW || !containerH) return [];
    const { safeW, safeH } = clampMapSize(containerW, containerH);
    const t = coverTransform(safeW, safeH, containerW, containerH);
    return pins.map(p => {
      const imgPx = latLngToPixel(p.displayLat, p.displayLng, centerLat, centerLng, zoom, safeW, safeH);
      const px = { x: imgPx.x * t.scale + t.offsetX, y: imgPx.y * t.scale + t.offsetY };
      return { product: p, px };
    });
  }, [pins, centerLat, centerLng, zoom, containerW, containerH]);

  // Visible products: those whose pin falls inside container bounds (with small margin)
  const visibleIdsKey = useMemo(() => {
    if (!containerW || !containerH) return "";
    const ids = pinPositions
      .filter(({ px }) => px.x >= -20 && px.x <= containerW + 20 && px.y >= -20 && px.y <= containerH + 20)
      .map(({ product }) => product.id);
    return ids.join(",");
  }, [pinPositions, containerW, containerH]);

  useEffect(() => {
    if (!onVisibleProductsChange) return;
    const ids = visibleIdsKey === "" ? [] : visibleIdsKey.split(",").map(Number);
    onVisibleProductsChange(ids);
  }, [visibleIdsKey, onVisibleProductsChange]);

  const selectProduct = useCallback((id: number | null) => {
    if (selectedProductId === undefined) setInternalSelected(id);
    onProductSelect?.(id);
  }, [selectedProductId, onProductSelect]);

  const gpsPos = useMemo(() => {
    if (!hasGps || !containerW || !containerH) return null;
    const { safeW, safeH } = clampMapSize(containerW, containerH);
    const t = coverTransform(safeW, safeH, containerW, containerH);
    const imgPx = latLngToPixel(userLat!, userLng!, centerLat, centerLng, zoom, safeW, safeH);
    return { x: imgPx.x * t.scale + t.offsetX, y: imgPx.y * t.scale + t.offsetY };
  }, [hasGps, userLat, userLng, centerLat, centerLng, zoom, containerW, containerH]);

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
      pos => {
        setLocating(false);
        setCenterLat(pos.coords.latitude);
        setCenterLng(pos.coords.longitude);
        setZoom(GPS_ZOOM);
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  }, [onRequestLocation]);

  const selectedProduct = products.find(p => p.id === selectedId) ?? null;
  const selectedPos = useMemo(() => {
    if (!selectedProduct || selectedProduct.latitude == null || selectedProduct.longitude == null) return null;
    if (!containerW || !containerH) return null;
    const fanned = pins.find(p => p.id === selectedProduct.id);
    const lat = fanned?.displayLat ?? selectedProduct.latitude;
    const lng = fanned?.displayLng ?? selectedProduct.longitude;
    const { safeW, safeH } = clampMapSize(containerW, containerH);
    const t = coverTransform(safeW, safeH, containerW, containerH);
    const imgPx = latLngToPixel(lat, lng, centerLat, centerLng, zoom, safeW, safeH);
    return { x: imgPx.x * t.scale + t.offsetX, y: imgPx.y * t.scale + t.offsetY };
  }, [selectedProduct, pins, centerLat, centerLng, zoom, containerW, containerH]);

  // Fallback list view (no API key or image errored)
  if (!hasApiKey() || imgError) {
    return (
      <div ref={containerRef} style={{ width: "100%", height: "100%", borderRadius: 20, background: "linear-gradient(135deg,#f8fafc,#f1f5f9)", border: "1px solid rgba(0,0,0,.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>🗺️ Mapa no disponible</p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
            {pins.map(p => (
              <div key={p.id} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(0,0,0,.07)", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                {p.image && <img src={p.image} alt={p.name} style={{ width: "100%", height: 80, objectFit: "cover" }} />}
                <div style={{ padding: "8px 10px 10px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 4, lineHeight: 1.3 }}>{p.name}</p>
                  <p style={{ fontSize: 13, fontWeight: 900, color: "#1e293b", margin: "0 0 8px" }}>${p.priceUsd.toFixed(2)}</p>
                  {canBuy && (
                    <button onClick={() => onBuy(p.id)} style={{ width: "100%", padding: "6px 0", borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 11, border: "none", cursor: "pointer" }}>
                      🛒 Comprar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%", height: "100%", borderRadius: 20,
        position: "relative", overflow: "hidden",
        background: "#e8edf3",
      }}
      onClick={() => selectProduct(null)}
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
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 36, height: 36, margin: "0 auto 10px", border: "3px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "pms-spin .8s linear infinite" }} />
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Cargando mapa…</p>
          </div>
        </div>
      )}

      {/* Counter pill */}
      {imgLoaded && pins.length > 0 && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,.93)", backdropFilter: "blur(10px)", borderRadius: 100, padding: "5px 14px", border: "1px solid rgba(0,0,0,.07)", fontSize: 12, fontWeight: 600, color: "#475569", display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", boxShadow: "0 2px 10px rgba(0,0,0,.08)", whiteSpace: "nowrap", zIndex: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }} />
          {pins.length} producto{pins.length !== 1 ? "s" : ""} en el mapa
        </div>
      )}

      {/* GPS pulse */}
      {imgLoaded && gpsPos && (
        <div
          style={{
            position: "absolute",
            left: gpsPos.x - 12, top: gpsPos.y - 12,
            width: 24, height: 24, pointerEvents: "none", zIndex: 5,
          }}
        >
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(59,130,246,.28)", animation: "pms-pulse 2s ease-out infinite" }} />
          <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "#3b82f6", border: "2px solid #fff", boxShadow: "0 0 10px rgba(59,130,246,.9)" }} />
        </div>
      )}

      {/* Pins */}
      {imgLoaded && pinPositions.map(({ product, px }) => {
        if (px.x < -40 || px.x > containerW + 40 || px.y < -40 || px.y > containerH + 40) return null;
        const isSelected = selectedId === product.id;
        const isSuccess = successId === product.id;
        return (
          <div
            key={product.id}
            style={{
              position: "absolute",
              left: px.x, top: px.y,
              transform: "translate(-50%, -100%)",
              zIndex: isSelected ? 200 : isSuccess ? 150 : 100,
            }}
          >
            <PricePill
              product={product}
              isSelected={isSelected}
              isSuccess={isSuccess}
              onClick={(e) => {
                e.stopPropagation();
                selectProduct(selectedId === product.id ? null : product.id);
              }}
            />
          </div>
        );
      })}

      {/* Locate button */}
      {imgLoaded && (
        <button
          onClick={(e) => { e.stopPropagation(); handleLocate(); }}
          title="Usar mi ubicación"
          style={{ position: "absolute", bottom: 52, left: 12, zIndex: 10, width: 40, height: 40, borderRadius: 12, background: locating ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,.96)", border: "1px solid rgba(0,0,0,.1)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,.1)", fontSize: 18 }}
        >
          {locating ? (
            <div style={{ width: 16, height: 16, border: "2px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "pms-spin .8s linear infinite" }} />
          ) : "📍"}
        </button>
      )}

      {/* Zoom controls */}
      {imgLoaded && (
        <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 10, display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.12)", border: "1px solid rgba(0,0,0,.1)" }}>
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

      {/* Floating product card */}
      {imgLoaded && selectedProduct && selectedPos && (
        <FloatingProductCard
          product={selectedProduct}
          pos={selectedPos}
          containerW={containerW}
          containerH={containerH}
          bcvRate={bcvRate}
          onBuy={onBuy}
          canBuy={canBuy}
          isSuccess={successId === selectedProduct.id}
          onClose={() => selectProduct(null)}
          userLat={userLat}
          userLng={userLng}
        />
      )}
    </div>
  );
}
