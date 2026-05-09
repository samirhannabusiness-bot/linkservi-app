import { useEffect, useRef, useState, useCallback } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadMapsLib, loadMarkerLib } from "@/lib/google-maps";
import { ShoppingBag, Truck, MapPin, X, ShoppingCart, Store, Tag } from "lucide-react";

const CARACAS = { lat: 10.4806, lng: -66.9036 };
const GPS_ZOOM = 13;
const CITY_ZOOM = 10;

// Esconder negocios, transporte y otros POI ajenos a la app del mapa de Google.
// Solo conservamos la geografía base (calles, agua, parques) para que los pines
// de productos/profesionales sean los únicos puntos resaltados.
const HIDE_POI_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
];

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

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function injectStyles() {
  if (document.getElementById("productmap-styles")) return;
  const s = document.createElement("style");
  s.id = "productmap-styles";
  s.textContent = `
    @keyframes pm-spin { to { transform:rotate(360deg) } }
    @keyframes pm-pulse { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(2.8);opacity:0} }
    @keyframes pm-in { from{opacity:0;transform:scale(.88) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
  `;
  document.head.appendChild(s);
}

function buildGpsEl(): HTMLDivElement {
  injectStyles();
  const w = document.createElement("div");
  w.style.cssText = "position:relative;width:24px;height:24px";
  const ring = document.createElement("div");
  ring.style.cssText =
    "position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,.28);animation:pm-pulse 2s ease-out infinite";
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:absolute;inset:4px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 10px rgba(59,130,246,.9)";
  w.appendChild(ring);
  w.appendChild(dot);
  return w;
}

function buildPricePill(
  product: Product,
  isSelected: boolean,
  isSuccess: boolean,
  onClick: () => void,
): HTMLDivElement {
  const isRental = product.listingType === "rental";
  const price = isRental && product.rentalPricePerDay != null
    ? product.rentalPricePerDay
    : product.priceUsd;
  const suffix = isRental ? "/d" : "";

  injectStyles();

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "cursor:pointer;position:relative;animation:pm-in .2s cubic-bezier(.34,1.56,.64,1);display:inline-flex;flex-direction:column;align-items:center;";

  const pill = document.createElement("div");

  let bg: string, color: string, border: string, shadow: string, scale: string;
  if (isSuccess) {
    bg = "#10b981"; color = "#fff";
    border = "2px solid #059669"; shadow = "0 4px 16px rgba(16,185,129,.5)"; scale = "scale(1.08)";
  } else if (isSelected) {
    bg = "#0f172a"; color = "#fff";
    border = "2px solid #0f172a"; shadow = "0 6px 20px rgba(0,0,0,.35)"; scale = "scale(1.12)";
  } else if (isRental) {
    bg = "#fff"; color = "#7c3aed";
    border = "2px solid #7c3aed"; shadow = "0 2px 10px rgba(124,58,237,.25)"; scale = "scale(1)";
  } else {
    bg = "#fff"; color = "#0f172a";
    border = "2px solid transparent"; shadow = "0 2px 8px rgba(0,0,0,.18)"; scale = "scale(1)";
  }

  pill.style.cssText = `
    display:inline-flex;align-items:center;gap:4px;
    padding:5px 10px;border-radius:100px;
    background:${bg};color:${color};
    font-size:12px;font-weight:800;
    white-space:nowrap;user-select:none;
    border:${border};
    box-shadow:${shadow};
    transform:${scale};
    transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s ease,background .18s ease;
  `;
  pill.textContent = `${isSuccess ? "✓ " : ""}$${price.toFixed(0)}${suffix}`;

  const tip = document.createElement("div");
  tip.style.cssText = `
    width:6px;height:6px;border-radius:50%;margin:2px auto 0;
    background:${isSelected ? "#0f172a" : isRental ? "#7c3aed" : "#94a3b8"};
    box-shadow:0 2px 4px rgba(0,0,0,.15);
    transition:background .18s ease;
  `;

  wrapper.appendChild(pill);
  wrapper.appendChild(tip);
  wrapper.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return wrapper;
}

function buildClusterEl(count: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:${count > 99 ? 44 : 36}px;height:${count > 99 ? 44 : 36}px;
    border-radius:50%;
    background:linear-gradient(135deg,#6366f1,#4f46e5);
    color:#fff;font-size:13px;font-weight:800;
    border:2.5px solid #fff;
    box-shadow:0 4px 14px rgba(99,102,241,.45);
    cursor:pointer;user-select:none;
  `;
  el.textContent = count > 99 ? "99+" : String(count);
  return el;
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
  const displayPrice = isRental && product.rentalPricePerDay != null
    ? product.rentalPricePerDay : product.priceUsd;
  const priceVes = bcvRate > 0 ? Math.round(displayPrice * bcvRate) : null;
  const condColor = product.condition === "used" ? "#f59e0b" : "#10b981";
  const condLabel = product.condition === "used" ? "Usado" : "Nuevo";
  const dist = userLat && userLng && product.latitude && product.longitude
    ? distanceKm(userLat, userLng, product.latitude, product.longitude) : null;

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
          animation: "pm-in .2s cubic-bezier(.34,1.56,.64,1)",
          pointerEvents: "all",
        }}
      >
        {/* Arrow pointing to marker */}
        {!placeBelow && (
          <div style={{
            position: "absolute", bottom: -7, left: arrowLeft,
            width: 14, height: 8, overflow: "hidden", zIndex: 1,
          }}>
            <div style={{ width: 14, height: 14, background: "#fff", transform: "rotate(45deg)", marginTop: -7, marginLeft: 0, boxShadow: "2px 2px 4px rgba(0,0,0,.1)" }} />
          </div>
        )}
        {placeBelow && (
          <div style={{
            position: "absolute", top: -7, left: arrowLeft,
            width: 14, height: 8, overflow: "hidden", zIndex: 1,
          }}>
            <div style={{ width: 14, height: 14, background: "#fff", transform: "rotate(45deg)", marginTop: 1, marginLeft: 0, boxShadow: "-1px -1px 3px rgba(0,0,0,.08)" }} />
          </div>
        )}

        {/* Card inner — rounded with clip */}
        <div style={{ borderRadius: 16, overflow: "hidden" }}>
          {/* Image */}
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
            {/* Close */}
            <button onClick={e => { e.stopPropagation(); onClose(); }}
              style={{ position: "absolute", top: 7, right: 7, width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,.9)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }}>
              <X style={{ width: 12, height: 12, color: "#475569" }} />
            </button>
            {/* Tags overlay */}
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

          {/* Info */}
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

            {/* Badges row */}
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

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function ProductMap({
  products, userLat, userLng, bcvRate, onBuy, canBuy, successId, onRequestLocation,
  selectedProductId, onProductSelect, onVisibleProductsChange,
}: ProductMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const gpsMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const markersRef = useRef<Record<number, google.maps.marker.AdvancedMarkerElement>>({});
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const hasGps = typeof userLat === "number" && typeof userLng === "number";
  const initCenter = hasGps ? { lat: userLat!, lng: userLng! } : CARACAS;
  const initZoom = hasGps ? GPS_ZOOM : CITY_ZOOM;

  const withCoords = products.filter(p => p.latitude != null && p.longitude != null);

  const selectedIdRef = useRef<number | null>(null);
  const successIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  successIdRef.current = successId;

  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const onProductSelectRef = useRef(onProductSelect);
  onProductSelectRef.current = onProductSelect;
  const onVisibleRef = useRef(onVisibleProductsChange);
  onVisibleRef.current = onVisibleProductsChange;

  useEffect(() => {
    if (selectedProductId !== undefined) setSelectedId(selectedProductId ?? null);
  }, [selectedProductId]);

  const selectProduct = useCallback((id: number | null) => {
    setSelectedId(id);
    onProductSelectRef.current?.(id);
  }, []);

  const emitVisible = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const ids = productsRef.current
      .filter(p => p.latitude != null && p.longitude != null)
      .filter(p => bounds.contains({ lat: p.latitude!, lng: p.longitude! }))
      .map(p => p.id);
    onVisibleRef.current?.(ids);
  }, []);

  const emitVisibleDebounced = useRef(debounce(emitVisible as (...args: unknown[]) => void, 250)).current;

  const updateCardPos = useCallback((sid: number | null) => {
    if (!sid || !mapRef.current || !containerRef.current) { setCardPos(null); return; }
    const product = productsRef.current.find(p => p.id === sid);
    if (!product?.latitude || !product?.longitude) { setCardPos(null); return; }

    const map = mapRef.current;
    const projection = map.getProjection();
    const bounds = map.getBounds();
    if (!projection || !bounds) { setCardPos(null); return; }

    const scale = Math.pow(2, map.getZoom() ?? CITY_ZOOM);
    const ne = projection.fromLatLngToPoint(bounds.getNorthEast())!;
    const sw = projection.fromLatLngToPoint(bounds.getSouthWest())!;
    const wp = projection.fromLatLngToPoint(
      new google.maps.LatLng(product.latitude, product.longitude)
    )!;

    const x = (wp.x - sw.x) * scale;
    const y = (wp.y - ne.y) * scale;

    const rect = containerRef.current.getBoundingClientRect();
    setContainerSize({ w: rect.width, h: rect.height });
    setCardPos({ x, y });
  }, []);

  const updateCardPosDebounced = useRef(debounce(((sid: unknown) => updateCardPos(sid as number | null)) as (...args: unknown[]) => void, 80)).current;

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
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
          center: initCenter,
          zoom: initZoom,
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: 9 },
          gestureHandling: "greedy",
          clickableIcons: false,
          styles: HIDE_POI_STYLES,
        } as google.maps.MapOptions);

        map.addListener("click", () => selectProduct(null));
        map.addListener("idle", () => {
          emitVisible();
          updateCardPosDebounced(selectedIdRef.current);
        });
        map.addListener("bounds_changed", () => {
          emitVisibleDebounced();
          updateCardPosDebounced(selectedIdRef.current);
        });

        const markers: google.maps.marker.AdvancedMarkerElement[] = [];
        for (const p of productsRef.current) {
          if (p.latitude == null || p.longitude == null) continue;
          const el = buildPricePill(p, false, false, () => {
            selectProduct(selectedIdRef.current === p.id ? null : p.id);
          });
          const m = new AdvancedMarkerElement({
            position: { lat: p.latitude, lng: p.longitude },
            content: el,
            title: p.name,
          });
          markersRef.current[p.id] = m;
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
      Object.values(markersRef.current).forEach(m => { m.map = null; });
      markersRef.current = {};
      if (gpsMarkerRef.current) { gpsMarkerRef.current.map = null; gpsMarkerRef.current = null; }
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refresh markers when products change ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    if (!map || !clusterer || !ready) return;

    loadMarkerLib().then(({ AdvancedMarkerElement }) => {
      clusterer.clearMarkers();
      Object.values(markersRef.current).forEach(m => { m.map = null; });
      markersRef.current = {};

      const markers: google.maps.marker.AdvancedMarkerElement[] = [];
      for (const p of products) {
        if (p.latitude == null || p.longitude == null) continue;
        const isSelected = selectedIdRef.current === p.id;
        const isSuccess = successIdRef.current === p.id;
        const el = buildPricePill(p, isSelected, isSuccess, () => {
          selectProduct(selectedIdRef.current === p.id ? null : p.id);
        });
        const m = new AdvancedMarkerElement({
          position: { lat: p.latitude, lng: p.longitude },
          content: el,
          title: p.name,
        });
        markersRef.current[p.id] = m;
        markers.push(m);
      }
      clusterer.addMarkers(markers);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, ready]);

  // ── Update pill appearance when selection/success changes ────────────────────
  useEffect(() => {
    const ps = productsRef.current;
    loadMarkerLib().then(() => {
      Object.entries(markersRef.current).forEach(([idStr, marker]) => {
        const id = Number(idStr);
        const p = ps.find(x => x.id === id);
        if (!p) return;
        const isSelected = selectedId === id;
        const isSuccess = successId === id;
        marker.content = buildPricePill(p, isSelected, isSuccess, () => {
          selectProduct(selectedIdRef.current === id ? null : id);
        });
      });
    });
  }, [selectedId, successId, selectProduct]);

  // ── Update card position when selected product changes ───────────────────────
  useEffect(() => {
    if (!selectedId) { setCardPos(null); return; }
    setTimeout(() => updateCardPos(selectedId), 60);
  }, [selectedId, updateCardPos]);

  // ── Pan when GPS location arrives ────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current && hasGps) {
      mapRef.current.panTo({ lat: userLat!, lng: userLng! });
      mapRef.current.setZoom(GPS_ZOOM);
    }
  }, [userLat, userLng, hasGps]);

  // ── GPS pulse marker ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasGps) return;
    loadMarkerLib().then(({ AdvancedMarkerElement }) => {
      if (gpsMarkerRef.current) { gpsMarkerRef.current.map = null; gpsMarkerRef.current = null; }
      const map = mapRef.current;
      if (!map) return;
      gpsMarkerRef.current = new AdvancedMarkerElement({
        map,
        position: { lat: userLat!, lng: userLng! },
        content: buildGpsEl(),
        title: "Mi ubicación",
        zIndex: 9999,
      });
    });
    return () => {
      if (gpsMarkerRef.current) { gpsMarkerRef.current.map = null; gpsMarkerRef.current = null; }
    };
  }, [userLat, userLng, hasGps]);

  // ── Pan to selected product ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = products.find(x => x.id === selectedId);
    if (p?.latitude != null && p?.longitude != null) {
      map.panTo({ lat: p.latitude!, lng: p.longitude! });
      if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
    }
  }, [selectedId, products]);

  // ── Locate button ────────────────────────────────────────────────────────────
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
        mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(GPS_ZOOM);
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  }, [onRequestLocation]);

  const selectedProduct = products.find(p => p.id === selectedId) ?? null;

  if (mapError) {
    return (
      <div style={{ width: "100%", height: "100%", borderRadius: 20, background: "linear-gradient(135deg,#f8fafc,#f1f5f9)", border: "1px solid rgba(0,0,0,.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>🗺️ Mapa no disponible</p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
            {withCoords.map(p => (
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
    <div style={{ width: "100%", height: "100%", borderRadius: 20, position: "relative", overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {!ready && (
        <div style={{ position: "absolute", inset: 0, borderRadius: 20, background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 36, height: 36, margin: "0 auto 10px", border: "3px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "pm-spin .8s linear infinite" }} />
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Cargando mapa…</p>
          </div>
        </div>
      )}

      {ready && withCoords.length > 0 && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,.93)", backdropFilter: "blur(10px)", borderRadius: 100, padding: "5px 14px", border: "1px solid rgba(0,0,0,.07)", fontSize: 12, fontWeight: 600, color: "#475569", display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", boxShadow: "0 2px 10px rgba(0,0,0,.08)", whiteSpace: "nowrap", zIndex: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }} />
          {withCoords.length} producto{withCoords.length !== 1 ? "s" : ""} en el mapa
        </div>
      )}

      {ready && (
        <button onClick={handleLocate} title="Usar mi ubicación"
          style={{ position: "absolute", bottom: 52, left: 12, zIndex: 10, width: 40, height: 40, borderRadius: 12, background: locating ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,.96)", border: "1px solid rgba(0,0,0,.1)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,.1)", transition: "all .32s cubic-bezier(.4,0,.2,1)", fontSize: 18 }}>
          {locating ? (
            <div style={{ width: 16, height: 16, border: "2px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "pm-spin .8s linear infinite" }} />
          ) : "📍"}
        </button>
      )}

      {ready && selectedProduct && cardPos && (
        <FloatingProductCard
          product={selectedProduct}
          pos={cardPos}
          containerW={containerSize.w}
          containerH={containerSize.h}
          bcvRate={bcvRate}
          onBuy={id => { onBuy(id); }}
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
