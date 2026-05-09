import { useState, useEffect, useCallback, lazy, Suspense, useRef, useMemo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { LoginWallModal } from "@/components/ui/LoginWallModal";
import { DeliveryRequestModal } from "@/components/ui/DeliveryRequestModal";
import { Link, useSearch, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useCart } from "@/lib/cart-context";
import {
  ShoppingBag, MapPin, Tag, Search, X, CheckCircle, Loader2,
  Truck, Package, Lock, Map, Grid3X3, Navigation, Store,
  SlidersHorizontal, Shield, Star, Minus, Plus, ChevronLeft,
  BadgeCheck, Zap, AlertTriangle, ExternalLink, Eye, RotateCcw,
  Users, ArrowUpDown, DollarSign, Bike, SortAsc, Filter, ChevronDown,
  ChevronRight, KeyRound, CalendarDays, ShieldCheck, MessageCircle, FileText
} from "lucide-react";

const ProductMap = lazy(() => import("@/components/ui/ProductMap").then(m => ({ default: m.ProductMap })));

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
  storeId: number | null;
  storeName: string | null;
  stock: number | null;
  avgProductRating: number | string | null;
  countProductRatings: number;
  listingType?: string;
  rentalPricePerDay?: number | null;
  rentalPricePerWeek?: number | null;
  rentalDeposit?: number | null;
  rentalRules?: string | null;
  blockedDates?: string[];
  isPremium?: boolean;
  premiumUntil?: string | null;
  viewCount?: number;
  clickCount?: number;
  // ServiRent sub-type classification (may be absent in legacy records)
  rentalType?: string | null;
  productType?: string | null;
  rentalMetadata?: string | null;
  productMetadata?: string | null;
}

/** Ensure sub-type fields always have safe defaults; logs missing fields in dev. */
function normalizeProduct(p: Product): Product {
  const isRental = p.listingType === "rental";
  if (isRental && !p.rentalType) {
    if (import.meta.env.DEV) console.warn("[ServiRent] Missing rentalType for product", p.id);
    return { ...p, rentalType: "tool" };
  }
  if (!isRental && !p.productType) {
    if (import.meta.env.DEV) console.warn("[ServiRent] Missing productType for product", p.id);
    return { ...p, productType: "general" };
  }
  return p;
}

const PRODUCT_CATEGORIES = [
  "ferretería", "barbería / peluquería", "electrónica", "repuestos automotriz",
  "ropa y calzado", "alimentos y bebidas", "hogar y muebles", "jardín y plantas",
  "materiales de construcción", "limpieza e higiene", "tecnología y accesorios",
  "salud y farmacia", "deportes", "juguetes y bebés", "mascotas",
  "papelería y oficina", "arte y manualidades", "música e instrumentos",
  "libros", "otros",
];

const CATEGORY_ICONS = [
  { id: "electrónica",           label: "Electrónica",  emoji: "📱" },
  { id: "hogar y muebles",       label: "Hogar",        emoji: "🏠" },
  { id: "ferretería",            label: "Herramientas", emoji: "🔧" },
  { id: "repuestos automotriz",  label: "Vehículos",    emoji: "🚗" },
  { id: "ropa y calzado",        label: "Ropa",         emoji: "👕" },
  { id: "alimentos y bebidas",   label: "Alimentos",    emoji: "🍔" },
  { id: "deportes",              label: "Deportes",     emoji: "⚽" },
  { id: "tecnología y accesorios", label: "Tecnología", emoji: "💻" },
  { id: "salud y farmacia",      label: "Salud",        emoji: "💊" },
  { id: "mascotas",              label: "Mascotas",     emoji: "🐾" },
];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Filter types ─────────────────────────────────────────────────────────────
interface FilterState {
  category: string;
  priceMin: string;
  priceMax: string;
  delivery: boolean | null;
  minRating: number | null;
  condition: string;
  sortBy: string;
}

const DEFAULT_FILTERS: FilterState = {
  category: "",
  priceMin: "",
  priceMax: "",
  delivery: null,
  minRating: null,
  condition: "",
  sortBy: "default",
};

function countActiveFilters(f: FilterState) {
  let n = 0;
  if (f.category) n++;
  if (f.priceMin || f.priceMax) n++;
  if (f.delivery !== null) n++;
  if (f.minRating !== null) n++;
  if (f.condition) n++;
  if (f.sortBy !== "default") n++;
  return n;
}

// ─── Filter panel ─────────────────────────────────────────────────────────────
function FilterPanel({
  open, draft, onDraftChange, onApply, onClose,
}: {
  open: boolean;
  draft: FilterState;
  onDraftChange: (f: FilterState) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const set = (patch: Partial<FilterState>) => onDraftChange({ ...draft, ...patch });
  const SORT_OPTIONS = [
    { value: "nearest", label: "📍 Más cercanos" },
    { value: "default", label: "Relevancia" },
    { value: "price_asc", label: "Precio: menor a mayor" },
    { value: "price_desc", label: "Precio: mayor a menor" },
    { value: "rating", label: "Mejor calificación" },
    { value: "newest", label: "Más recientes" },
  ];

  const activeCount = countActiveFilters(draft);

  return (
    <div className="fixed inset-0 z-[400] flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-sm bg-[#0d0e14] border-l border-white/[0.08] flex flex-col h-full overflow-hidden shadow-2xl animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-foreground text-base">Filtros</h2>
            {activeCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{activeCount}</span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* SORT */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Ordenar por</h3>
            </div>
            <div className="space-y-1.5">
              {SORT_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => set({ sortBy: o.value })}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all ${draft.sortBy === o.value ? "bg-primary/15 border border-primary/40 text-primary font-semibold" : "bg-white/[0.04] border border-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.07]"}`}
                >
                  {o.label}
                  {draft.sortBy === o.value && <CheckCircle className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          </section>

          {/* CATEGORY */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Categoría</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => set({ category: "" })}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${!draft.category ? "bg-primary text-white" : "bg-white/[0.05] border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}
              >
                Todas
              </button>
              {PRODUCT_CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => set({ category: draft.category === c ? "" : c })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all ${draft.category === c ? "bg-primary text-white" : "bg-white/[0.05] border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </section>

          {/* PRICE */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Rango de precio (USD)</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number" min="0" placeholder="Mín"
                  value={draft.priceMin}
                  onChange={e => set({ priceMin: e.target.value })}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl pl-7 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <span className="text-muted-foreground text-sm">—</span>
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number" min="0" placeholder="Máx"
                  value={draft.priceMax}
                  onChange={e => set({ priceMax: e.target.value })}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl pl-7 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            {/* Quick price ranges */}
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[["<$10","","10"],["$10–$50","10","50"],["$50–$200","50","200"],[">$200","200",""]].map(([label, min, max]) => (
                <button
                  key={label}
                  onClick={() => set({ priceMin: min, priceMax: max })}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${draft.priceMin === min && draft.priceMax === max ? "bg-primary/15 border-primary/40 text-primary" : "border-white/[0.08] text-muted-foreground hover:text-foreground bg-white/[0.04]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* DELIVERY */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Delivery</h3>
            </div>
            <div className="flex gap-2">
              {[
                { value: null, label: "Todos" },
                { value: true, label: "Con delivery" },
                { value: false, label: "Sin delivery" },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => set({ delivery: opt.value })}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${draft.delivery === opt.value ? "bg-primary/15 border border-primary/40 text-primary" : "bg-white/[0.05] border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* CONDITION */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Estado del producto</h3>
            </div>
            <div className="flex gap-2">
              {[
                { value: "", label: "Todos" },
                { value: "new", label: "Nuevo" },
                { value: "used", label: "Usado" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set({ condition: opt.value })}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${draft.condition === opt.value ? "bg-primary/15 border border-primary/40 text-primary" : "bg-white/[0.05] border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* RATING */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Calificación mínima</h3>
            </div>
            <div className="flex gap-2">
              {[
                { value: null, label: "Todas" },
                { value: 3, label: "3★ +" },
                { value: 4, label: "4★ +" },
                { value: 4.5, label: "4.5★ +" },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => set({ minRating: opt.value })}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${draft.minRating === opt.value ? "bg-amber-400/15 border border-amber-400/40 text-amber-400" : "bg-white/[0.05] border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-white/[0.08] space-y-2">
          <button
            onClick={onApply}
            className="w-full py-3.5 rounded-xl btn-gradient text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            <Filter className="w-4 h-4" />
            Aplicar filtros{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
          <button
            onClick={() => onDraftChange(DEFAULT_FILTERS)}
            className="w-full py-2.5 rounded-xl border border-white/[0.08] text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-white/[0.04] transition-colors"
          >
            Limpiar todos los filtros
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rating stars ────────────────────────────────────────────────────────────
function StarRow({ rating = 4.5, size = "sm" }: { rating?: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`${cls} ${s <= Math.floor(rating) ? "fill-amber-400 text-amber-400" : s - 0.5 <= rating ? "fill-amber-400/50 text-amber-400" : "fill-transparent text-muted-foreground/40"}`}
        />
      ))}
      <span className="text-[10px] text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

// ─── High-value product types — skip in-app payment ─────────────────────────
const HIGH_VALUE_PRODUCT_TYPES = new Set(["vehicle", "property"]);
const HIGH_VALUE_RENTAL_TYPES  = new Set(["vehicle", "property", "experience"]);

function isHighValue(p: Product): boolean {
  if (p.listingType === "rental") return HIGH_VALUE_RENTAL_TYPES.has(p.rentalType ?? "");
  return HIGH_VALUE_PRODUCT_TYPES.has(p.productType ?? "");
}

const PAYMENT_METHODS = [
  { icon: "💸", label: "Zelle" },
  { icon: "🔶", label: "Binance Pay" },
  { icon: "💵", label: "USD Efectivo" },
];

// ─── Product Detail + Buy Modal ──────────────────────────────────────────────
function ProductModal({
  product,
  bcvRate,
  canBuy,
  onClose,
  onSuccess,
  onRentClick,
  onBuyAction,
  onContactClick,
}: {
  product: Product;
  bcvRate: number;
  canBuy: boolean;
  onClose: () => void;
  onSuccess: (id: number) => void;
  onRentClick?: (p: Product) => void;
  onBuyAction?: () => void;
  onContactClick?: () => void;
  onDeliveryCreated?: (id: number) => void;
}) {
  const { token } = useAuth();
  const [step, setStep] = useState<"detail" | "buy">("detail");
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [imgZoomed, setImgZoomed] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const maxQty = product.stock ?? 99;
  const subtotal = +(product.priceUsd * quantity).toFixed(2);
  const subtotalVes = +(subtotal * bcvRate).toFixed(0);

  const fakeViewers = 3 + (product.id * 7 % 17); // 3–19, deterministic
  const realRating = product.avgProductRating ? +Number(product.avgProductRating).toFixed(1) : null;
  const realCount = +product.countProductRatings || 0;

  const handleBuy = async () => {
    if (!deliveryAddress.trim()) { setError("La dirección de entrega es obligatoria"); return; }
    setError("");
    setPlacing(true);
    const combinedNotes = quantity > 1
      ? `Cantidad: ${quantity}${notes.trim() ? ` | ${notes.trim()}` : ""}`
      : notes.trim() || null;
    try {
      await apiFetch("/api/product-orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          deliveryAddress: deliveryAddress.trim(),
          notes: combinedNotes,
        }),
      });
      setSuccess(true);
      setTimeout(() => { onSuccess(product.id); }, 1600);
    } catch (err: any) {
      setError(err?.message ?? "Error al realizar el pedido");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">

        {/* ── Success screen ── */}
        {success && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-bold text-lg">¡Pedido enviado!</p>
              <p className="text-sm text-muted-foreground mt-1">Puedes ver el estado en "Mis Compras"</p>
            </div>
          </div>
        )}

        {/* ── Detail step ── */}
        {!success && step === "detail" && (
          <>
            {/* Image area */}
            <div
              className="relative flex-shrink-0 bg-[#0e0f14] overflow-hidden cursor-zoom-in"
              style={{ height: imgZoomed ? 420 : 300, transition: "height 0.35s cubic-bezier(.4,0,.2,1)" }}
              onClick={() => setImgZoomed(z => !z)}
            >
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-contain transition-transform duration-500"
                  style={{ transform: imgZoomed ? "scale(1.25)" : "scale(1)", padding: imgZoomed ? 8 : 24 }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-20 h-20 text-white/10" />
                </div>
              )}
              {/* Zoom hint */}
              {product.image && !imgZoomed && (
                <div className="absolute bottom-12 right-3 flex items-center gap-1 text-[10px] text-white/50 bg-black/40 rounded-full px-2 py-0.5 backdrop-blur-sm pointer-events-none">
                  <Eye className="w-3 h-3" /> Toca para ampliar
                </div>
              )}
              {imgZoomed && (
                <div className="absolute bottom-12 right-3 flex items-center gap-1 text-[10px] text-white/50 bg-black/40 rounded-full px-2 py-0.5 backdrop-blur-sm pointer-events-none">
                  <RotateCcw className="w-3 h-3" /> Toca para reducir
                </div>
              )}
              {/* Close */}
              <button
                onClick={e => { e.stopPropagation(); onClose(); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              {/* Condition + delivery badges */}
              <div className="absolute bottom-3 left-3 flex gap-1.5">
                <span className={`text-[11px] px-2 py-1 rounded-full font-semibold backdrop-blur-sm ${product.condition === "used" ? "bg-amber-500/90 text-white" : "bg-emerald-500/90 text-white"}`}>
                  {product.condition === "used" ? "Usado" : "Nuevo"}
                </span>
                {product.hasDelivery && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-blue-500/90 text-white backdrop-blur-sm flex items-center gap-1">
                    <Truck className="w-2.5 h-2.5" /> Delivery gratis
                  </span>
                )}
                {product.stock != null && product.stock <= 5 && product.stock > 0 && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-red-600/90 text-white backdrop-blur-sm flex items-center gap-1 font-bold">
                    <AlertTriangle className="w-2.5 h-2.5" /> ¡Solo {product.stock}!
                  </span>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Name */}
              <h2 className="text-foreground font-bold text-lg leading-tight">{product.name}</h2>

              {/* Rating + social proof */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-1.5">
                  {realRating !== null ? (
                    <>
                      <StarRow rating={realRating} size="md" />
                      <span className="text-sm font-bold text-foreground">{realRating}</span>
                      <span className="text-xs text-muted-foreground">({realCount} {realCount === 1 ? "venta" : "ventas"})</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sin calificaciones aún</span>
                  )}
                </div>
                {product.hasDelivery && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <Zap className="w-3 h-3" /> Entrega rápida
                  </span>
                )}
              </div>

              {/* Price block */}
              {product.listingType === "rental" ? (
                <div className="space-y-3">
                  {/* Rental pricing panel */}
                  <div className="rounded-xl bg-violet-500/10 border border-violet-500/25 px-4 py-3">
                    <div className="flex items-center gap-2 text-violet-300 font-semibold text-sm mb-2">
                      <KeyRound className="w-4 h-4" /> Tarifas de Alquiler
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      {product.rentalPricePerDay != null && (
                        <div>
                          <div className="text-2xl font-black text-violet-200">${product.rentalPricePerDay.toFixed(2)}</div>
                          <div className="text-xs text-violet-400/70">por día</div>
                        </div>
                      )}
                      {product.rentalPricePerWeek != null && (
                        <div>
                          <div className="text-2xl font-black text-violet-200">${product.rentalPricePerWeek.toFixed(2)}</div>
                          <div className="text-xs text-violet-400/70">por semana</div>
                        </div>
                      )}
                    </div>
                    {product.rentalDeposit != null && (
                      <div className="mt-2 flex items-center gap-2 text-xs"
                        style={{ color: "rgba(167,139,250,0.8)" }}>
                        <ShieldCheck className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                        Depósito: <span className="text-violet-300 font-semibold">${product.rentalDeposit.toFixed(2)}</span>
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>
                          Protegido
                        </span>
                      </div>
                    )}

                    {/* Trust badges */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(16,185,129,0.1)", color: "rgba(52,211,153,0.85)", border: "1px solid rgba(16,185,129,0.2)" }}>
                        <ShieldCheck className="w-3 h-3" /> Pago seguro
                      </span>
                      <span
                        title="El depósito se mantiene seguro y solo se libera cuando el producto es devuelto correctamente"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-help"
                        style={{ background: "rgba(139,92,246,0.1)", color: "rgba(167,139,250,0.85)", border: "1px solid rgba(139,92,246,0.2)" }}>
                        <ShieldCheck className="w-3 h-3" /> Depósito protegido
                      </span>
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: "rgba(167,139,250,0.5)" }}>
                      El dinero se libera al completar el servicio · Transacción protegida por LinkServi.
                    </p>
                  </div>

                  {/* Blocked dates calendar preview */}
                  {product.blockedDates && product.blockedDates.length > 0 && (
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-2">
                        <CalendarDays className="w-3.5 h-3.5" /> Fechas no disponibles
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {product.blockedDates.map(d => (
                          <span key={d} className="text-[10px] bg-red-500/15 text-red-300 border border-red-500/20 px-2 py-0.5 rounded-full">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rules */}
                  {product.rentalRules && (
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1.5">
                        <FileText className="w-3.5 h-3.5" /> Condiciones de uso
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">{product.rentalRules}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-foreground">${(product.priceUsd * quantity).toFixed(2)}</span>
                      <span className="text-sm text-muted-foreground">USD</span>
                    </div>
                    <span className="text-sm text-emerald-400 font-semibold">
                      Bs. {((product.priceUsd * quantity) * bcvRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
                    </span>
                    {quantity > 1 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">${product.priceUsd.toFixed(2)} × {quantity} unidades</p>
                    )}
                  </div>
                  {/* Quantity selector */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-foreground hover:bg-white/[0.08] transition-colors disabled:opacity-30"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-xl font-black text-foreground w-7 text-center">{quantity}</span>
                    <button
                      onClick={() => setQuantity(q => Math.min(maxQty, q + 1))}
                      disabled={quantity >= maxQty}
                      className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-foreground hover:bg-white/[0.08] transition-colors disabled:opacity-30"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Urgency signals */}
              <div className="flex flex-col gap-1.5">
                {/* Viewers */}
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-medium">{fakeViewers} personas están viendo este producto ahora</span>
                </div>
                {/* Stock */}
                {product.stock != null && (
                  <div className={`flex items-center gap-2 text-xs font-medium ${product.stock > 5 ? "text-emerald-400" : product.stock > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${product.stock > 5 ? "bg-emerald-400" : product.stock > 0 ? "bg-red-400 animate-pulse" : "bg-muted-foreground"}`} />
                    {product.stock > 5
                      ? `${product.stock} unidades disponibles en stock`
                      : product.stock > 0
                        ? `⚡ ¡Últimas ${product.stock} unidades disponibles!`
                        : "Sin stock"}
                  </div>
                )}
              </div>

              {/* Seller */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Store className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Vendido por</p>
                    <p className="text-sm font-semibold text-foreground">{product.storeName ?? product.coHostName ?? "Host"}</p>
                  </div>
                  <BadgeCheck className="w-4 h-4 text-primary ml-1" />
                </div>
                {product.storeId && (
                  <Link href={`/stores/${product.storeId}`} onClick={onClose}>
                    <button className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                      Ver tienda <ExternalLink className="w-3 h-3" />
                    </button>
                  </Link>
                )}
              </div>

              {/* Description */}
              {product.description && (
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Descripción</p>
                  <p className="text-sm text-foreground leading-relaxed">{product.description}</p>
                </div>
              )}

              {/* Category */}
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground capitalize">{product.category}</span>
              </div>
            </div>

            {/* CTA */}
            <div className="flex-shrink-0 p-4 border-t border-white/[0.06] space-y-3">
              {product.listingType === "rental" ? (
                <>
                  {!token ? (
                    <button
                      onClick={() => onBuyAction?.()}
                      className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-violet-600/25 hover:shadow-violet-500/45 transition-all"
                    >
                      <CalendarDays className="w-5 h-5" /> Reservar Alquiler
                    </button>
                  ) : canBuy && product.storeId ? (
                    <button
                      onClick={() => { onClose(); onRentClick?.(product); }}
                      className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-violet-600/25 hover:shadow-violet-500/45 transition-all"
                    >
                      <CalendarDays className="w-5 h-5" /> Reservar Alquiler
                    </button>
                  ) : canBuy ? null : (
                    <p className="text-xs text-center text-muted-foreground py-2">Inicia sesión como cliente para reservar este alquiler</p>
                  )}
                  <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-center"
                    style={{ color: "rgba(167,139,250,0.55)" }}>
                    <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                    Pago seguro · Protección para ambas partes
                  </p>

                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { Icon: Lock, label: "Depósito en escrow" },
                      { Icon: ShieldCheck, label: "Alquiler protegido" },
                      { Icon: BadgeCheck, label: "Entrega verificada" },
                    ].map(({ Icon, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-violet-500/5 border border-violet-500/15 py-2 px-1">
                        <Icon className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-[9px] text-muted-foreground text-center leading-tight font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : isHighValue(product) ? (
                /* ── Alto valor: contacto directo, sin pago in-app ── */
                <>
                  <button
                    onClick={() => { if (!token) { onBuyAction?.(); } else { onClose(); onContactClick?.(); } }}
                    className="w-full py-4 rounded-xl text-white font-black text-base flex items-center justify-center gap-2.5 transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", boxShadow: "0 8px 24px rgba(245,158,11,0.3)" }}
                  >
                    <MessageCircle className="w-5 h-5" />
                    {token ? "Contactar al vendedor" : "Iniciar sesión para contactar"}
                  </button>

                  {/* Payment methods */}
                  <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Pagos aceptados
                    </p>
                    <div className="flex gap-2">
                      {PAYMENT_METHODS.map(m => (
                        <div key={m.label}
                          className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <span className="text-base leading-none">{m.icon}</span>
                          <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: "rgba(255,255,255,0.55)" }}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Clarity note */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
                    <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
                    <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                      El pago final se acuerda directamente con el proveedor
                    </p>
                  </div>

                  {product.storeId && (
                    <Link href={`/stores/${product.storeId}`} onClick={onClose}>
                      <button className="w-full py-2.5 rounded-xl border border-white/10 text-muted-foreground text-sm hover:text-foreground hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-2">
                        <Store className="w-4 h-4" /> Ver tienda completa
                      </button>
                    </Link>
                  )}
                </>
              ) : !token ? (
                <>
                  {product.stock === 0 ? (
                    <div className="w-full py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium text-center">
                      Sin stock disponible
                    </div>
                  ) : (
                    <button
                      onClick={() => onBuyAction?.()}
                      className="w-full py-4 rounded-xl btn-gradient text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-primary/25 hover:shadow-primary/45 transition-all"
                    >
                      <Shield className="w-5 h-5" /> Comprar con protección
                    </button>
                  )}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { Icon: Lock, label: "Pago protegido" },
                      { Icon: BadgeCheck, label: "Entrega verificada" },
                      { Icon: RotateCcw, label: "Garantía devolución" },
                    ].map(({ Icon, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] border border-white/[0.06] py-2 px-1">
                        <Icon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[9px] text-muted-foreground text-center leading-tight font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                  {product.storeId && (
                    <Link href={`/stores/${product.storeId}`} onClick={onClose}>
                      <button className="w-full py-2.5 rounded-xl border border-white/10 text-muted-foreground text-sm hover:text-foreground hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-2">
                        <Store className="w-4 h-4" /> Ver tienda completa
                      </button>
                    </Link>
                  )}
                </>
              ) : canBuy ? (
                <>
                  {product.stock === 0 ? (
                    <div className="w-full py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium text-center">
                      Sin stock disponible
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={() => setStep("buy")}
                        data-testid="buy-now-btn"
                        className="w-full py-4 rounded-xl btn-gradient text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-primary/25 hover:shadow-primary/45 transition-all"
                      >
                        <Shield className="w-5 h-5" /> Comprar con protección
                      </button>
                      <AddToCartButton product={product} />
                    </div>
                  )}

                  {/* Trust row */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { Icon: Lock, label: "Pago protegido" },
                      { Icon: BadgeCheck, label: "Entrega verificada" },
                      { Icon: RotateCcw, label: "Garantía devolución" },
                    ].map(({ Icon, label }) => (
                      <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] border border-white/[0.06] py-2 px-1">
                        <Icon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[9px] text-muted-foreground text-center leading-tight font-medium">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Delivery on demand — for products without built-in delivery */}
                  {!product.hasDelivery && product.stock !== 0 && (
                    <button
                      onClick={() => { if (!token) { onBuyAction?.(); } else { setShowDeliveryModal(true); } }}
                      className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all hover:opacity-80"
                      style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", color: "#3b82f6" }}
                    >
                      <Truck className="w-4 h-4" />
                      Solicitar Delivery · $3.00
                    </button>
                  )}

                  {product.storeId && (
                    <Link href={`/stores/${product.storeId}`} onClick={onClose}>
                      <button className="w-full py-2.5 rounded-xl border border-white/10 text-muted-foreground text-sm hover:text-foreground hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-2">
                        <Store className="w-4 h-4" /> Ver tienda completa
                      </button>
                    </Link>
                  )}
                </>
              ) : (
                <p className="text-xs text-center text-muted-foreground py-2">Inicia sesión como cliente para comprar</p>
              )}
            </div>
          </>
        )}

        {/* ── Delivery Request Modal ── */}
        {showDeliveryModal && (
          <DeliveryRequestModal
            product={product}
            onClose={() => setShowDeliveryModal(false)}
            onCreated={(id) => {
              setShowDeliveryModal(false);
              onClose();
              onDeliveryCreated?.(id);
            }}
          />
        )}

        {/* ── Buy step ── */}
        {!success && step === "buy" && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-white/[0.06] flex-shrink-0">
              <button onClick={() => setStep("detail")} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Comprando</p>
                <p className="text-sm font-bold text-foreground truncate">{product.name}</p>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Escrow banner */}
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
                <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground leading-relaxed">
                  Tu pago queda <span className="font-bold text-primary">retenido en escrow</span>. Se libera al vendedor solo cuando confirmes que recibiste el producto en perfecto estado.
                </p>
              </div>

              {/* Price breakdown */}
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
                  <span className="text-sm text-muted-foreground">Subtotal ({quantity} unid.)</span>
                  <span className="text-sm font-semibold text-foreground">${subtotal.toFixed(2)} USD</span>
                </div>
                {product.hasDelivery && (
                  <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
                    <span className="text-sm text-muted-foreground flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Delivery</span>
                    <span className="text-sm font-semibold text-emerald-400">Gratis</span>
                  </div>
                )}
                <div className="px-4 py-3 flex items-center justify-between bg-white/[0.03]">
                  <span className="text-sm font-bold text-foreground">Total</span>
                  <div className="text-right">
                    <p className="text-base font-black text-foreground">${subtotal.toFixed(2)} USD</p>
                    <p className="text-xs text-emerald-400">Bs. {subtotalVes.toLocaleString("es-VE")}</p>
                  </div>
                </div>
              </div>

              {/* Delivery address */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Dirección de entrega *</label>
                <textarea
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  placeholder="Estado, ciudad, municipio, sector y calle..."
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Notas adicionales</label>
                <input
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Color, talla, instrucciones especiales..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                </div>
              )}
            </div>

            {/* Confirm button */}
            <div className="flex-shrink-0 p-4 border-t border-white/[0.06] space-y-2">
              <button
                onClick={handleBuy}
                disabled={placing}
                className="w-full py-4 rounded-xl btn-gradient text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all disabled:opacity-60"
              >
                {placing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</>
                ) : (
                  <><Lock className="w-5 h-5" /> Confirmar compra · ${subtotal.toFixed(2)}</>
                )}
              </button>
              <p className="text-[10px] text-center text-muted-foreground">
                Al confirmar aceptas los términos de LinkServi. Tu pago quedará retenido en escrow hasta que recibas el producto.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Add-to-cart helper used inside the product modal ───────────────────────
function AddToCartButton({ product }: { product: Product }) {
  const { addItem, openDrawer } = useCart();
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image ?? null,
      priceUsd: product.priceUsd,
      storeId: product.storeId ?? null,
      storeName: product.storeName ?? null,
    }, 1);
    setAdded(true);
    openDrawer();
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      onClick={handleAdd}
      data-testid="add-to-cart-btn"
      className={`w-full py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
        added
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
          : "bg-white/5 border-white/15 text-white/85 hover:bg-white/10"
      }`}
    >
      {added ? (
        <><CheckCircle className="w-4 h-4" /> Agregado al carrito</>
      ) : (
        <><ShoppingBag className="w-4 h-4" /> Agregar al carrito</>
      )}
    </button>
  );
}

// ─── Product card ────────────────────────────────────────────────────────────
function ProductCard({
  product,
  bcvRate,
  canBuy,
  onOpen,
  successId,
  distKm,
  isTopSeller,
  isBestRated,
}: {
  product: Product;
  bcvRate: number;
  canBuy: boolean;
  onOpen: (p: Product) => void;
  successId: number | null;
  distKm: number | null;
  isTopSeller?: boolean;
  isBestRated?: boolean;
}) {
  const priceVes = +(product.priceUsd * bcvRate).toFixed(0);
  const isSuccess = successId === product.id;
  const realRating = product.avgProductRating ? +Number(product.avgProductRating).toFixed(1) : null;
  const realCount = +product.countProductRatings || 0;

  const isPrem = product.isPremium && (!product.premiumUntil || new Date(product.premiumUntil) > new Date());

  const sellerStatus: "now" | "today" = product.id % 4 === 0 ? "now" : "today";

  return (
    <div
      className="glass rounded-2xl overflow-hidden flex flex-col group hover:shadow-lg transition-all cursor-pointer"
      style={isPrem ? {
        ring: "none",
        boxShadow: "0 0 0 1.5px rgba(251,191,36,0.55), 0 8px 24px rgba(251,191,36,0.13)",
      } : undefined}
      onClick={() => onOpen(product)}
    >
      {/* Image */}
      <div className="h-36 bg-[#12131a] flex items-center justify-center overflow-hidden relative flex-shrink-0">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <ShoppingBag className="w-14 h-14 text-white/10" />
        )}

        {/* Category */}
        <span className="absolute top-2 left-2 text-[10px] bg-black/60 backdrop-blur-sm text-white/80 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Tag className="w-2.5 h-2.5" />{product.category}
        </span>

        {/* Conversion badges */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {isPrem && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-black flex items-center gap-1 shadow-lg"
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", boxShadow: "0 0 10px rgba(245,158,11,0.5)" }}>
              ⭐ Destacado
            </span>
          )}
          {distKm != null && (
            <span className="text-[10px] bg-primary/80 backdrop-blur-sm text-white px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
              <Navigation className="w-2.5 h-2.5" />
              {distKm < 1 ? `${(distKm * 1000).toFixed(0)}m` : `${distKm.toFixed(1)}km`}
            </span>
          )}
          {isTopSeller && !isPrem && (
            <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-lg">
              🔥 Más vendido
            </span>
          )}
          {isBestRated && !isTopSeller && !isPrem && (
            <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-lg">
              ⭐ Mejor valorado
            </span>
          )}
        </div>

        {/* Bottom badges */}
        <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
          {product.listingType === "rental" ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-600/90 text-white flex items-center gap-0.5 font-bold">
              <KeyRound className="w-2.5 h-2.5" /> Alquiler
            </span>
          ) : (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${product.condition === "used" ? "bg-amber-500/85 text-white" : "bg-emerald-500/85 text-white"}`}>
              {product.condition === "used" ? "Usado" : "Nuevo"}
            </span>
          )}
          {product.hasDelivery && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/85 text-white flex items-center gap-0.5">
              <Truck className="w-2.5 h-2.5" /> Delivery
            </span>
          )}
          {product.stock != null && product.stock > 0 && product.stock <= 5 && product.listingType !== "rental" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/85 text-white">
              ¡Solo {product.stock}!
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        {/* Name */}
        <h3 className="font-bold text-foreground text-sm leading-tight mb-1.5 line-clamp-2">{product.name}</h3>

        {/* Rating */}
        <div className="flex items-center gap-1.5 mb-2">
          {realRating !== null ? (
            <>
              <StarRow rating={realRating} size="md" />
              <span className="text-xs text-amber-400 font-bold">{realRating}</span>
              <span className="text-[11px] text-muted-foreground">({realCount} {realCount === 1 ? "venta" : "ventas"})</span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 italic">Sin calificaciones</span>
          )}
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2 leading-relaxed">{product.description}</p>
        )}

        {/* Seller + active status */}
        <div className="mb-1.5 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
              {product.storeName ? (
                <span className="flex items-center gap-1 min-w-0">
                  <Store className="w-3 h-3 flex-shrink-0" />
                  <span className="text-foreground font-medium line-clamp-1">{product.storeName}</span>
                  <BadgeCheck className="w-3 h-3 text-primary flex-shrink-0" />
                </span>
              ) : (
                <><Package className="w-3 h-3 flex-shrink-0" /><span className="line-clamp-1 ml-0.5">por {product.coHostName ?? "Host"}</span></>
              )}
            </div>
            <span className="flex items-center gap-0.5 text-[9px] font-semibold flex-shrink-0 ml-1"
              style={{ color: sellerStatus === "now" ? "rgba(52,211,153,0.9)" : "rgba(6,182,212,0.8)" }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: sellerStatus === "now" ? "#34d399" : "#06B6D4",
                  animation: sellerStatus === "now" ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" : "none",
                }} />
              {sellerStatus === "now" ? "Respondiendo ahora" : "Activo hoy"}
            </span>
          </div>

          {/* Delivery indicator */}
          {product.hasDelivery && (
            <div className="flex items-center">
              <span className="flex items-center gap-0.5 text-[10px] flex-shrink-0"
                style={{ color: "rgba(52,211,153,0.75)" }}>
                <MapPin className="w-2.5 h-2.5" /> Entrega disponible
              </span>
            </div>
          )}
        </div>

        <div className="mt-auto space-y-2">
          {/* Price block */}
          <div>
            {product.listingType === "rental" && product.rentalPricePerDay != null ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-violet-300">${product.rentalPricePerDay.toFixed(2)}</span>
                  <span className="text-xs font-semibold" style={{ color: "rgba(167,139,250,0.65)" }}>/ día</span>
                </div>
                {product.rentalDeposit != null && (
                  <div className="text-[10px] flex items-center gap-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                    <ShieldCheck className="w-2.5 h-2.5" /> Dep. ${product.rentalDeposit.toFixed(2)}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-foreground">${product.priceUsd.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">USD</span>
                  {product.stock != null && product.stock > 0 && product.stock <= 5 && product.listingType !== "rental" && (
                    <span className="text-[9px] font-bold ml-1"
                      style={{ color: "rgba(248,113,113,0.9)" }}>
                      · Solo {product.stock} disp.
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: "rgba(52,211,153,0.85)" }}>
                  Bs. {priceVes.toLocaleString("es-VE")}
                </span>
              </>
            )}
          </div>

          {/* CTA button */}
          {canBuy ? (
            isSuccess ? (
              <div className="w-full h-9 rounded-xl flex items-center justify-center gap-1.5"
                style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
                <CheckCircle className="w-3.5 h-3.5" style={{ color: "#34d399" }} />
                <span className="text-xs font-bold" style={{ color: "#34d399" }}>Pedido enviado</span>
              </div>
            ) : isHighValue(product) ? (
              <button
                onClick={e => { e.stopPropagation(); onOpen(product); }}
                className="w-full h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-white transition-all active:scale-[0.98] hover:opacity-90"
                style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.85),rgba(217,119,6,0.85))", boxShadow: "0 4px 12px rgba(245,158,11,0.25)" }}
              >
                <MessageCircle className="w-3.5 h-3.5" /> Contactar
              </button>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onOpen(product); }}
                className="w-full h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-white transition-all active:scale-[0.98] hover:opacity-90"
                style={product.listingType === "rental"
                  ? { background: "rgba(139,92,246,0.85)", boxShadow: "0 4px 12px rgba(139,92,246,0.28)" }
                  : { background: "linear-gradient(135deg,rgba(6,182,212,0.88),rgba(99,102,241,0.82))", boxShadow: "0 4px 12px rgba(6,182,212,0.22)" }}
              >
                {product.listingType === "rental"
                  ? <><KeyRound className="w-3.5 h-3.5" /> Ver alquiler</>
                  : <><Shield className="w-3.5 h-3.5" /> Comprar con protección</>}
              </button>
            )
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onOpen(product); }}
              className="w-full h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-all active:scale-[0.98]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Ver detalles</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mini product card (map view sidebar) ────────────────────────────────────
function MiniProductCard({
  product, bcvRate, canBuy, onOpen, successId,
}: {
  product: Product;
  bcvRate: number;
  canBuy: boolean;
  onOpen: (p: Product) => void;
  successId: number | null;
}) {
  const isSuccess = successId === product.id;
  return (
    <div className="glass rounded-xl overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all" onClick={() => onOpen(product)}>
      <div className="aspect-square bg-[#12131a] flex items-center justify-center relative overflow-hidden rounded-t-xl">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <ShoppingBag className="w-8 h-8 text-white/10" />
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-foreground line-clamp-2 mb-1">{product.name}</p>
        <p className="text-xs font-black text-foreground mb-0.5">${product.priceUsd.toFixed(2)}</p>
        <p className="text-[10px] text-emerald-400 mb-2">Bs. {(product.priceUsd * bcvRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</p>
        {canBuy && (
          isSuccess ? (
            <div className="text-center text-[10px] text-emerald-400 font-semibold">✓ Pedido enviado</div>
          ) : isHighValue(product) ? (
            <button onClick={e => { e.stopPropagation(); onOpen(product); }}
              className="w-full py-1.5 rounded-lg text-white text-[11px] font-bold flex items-center justify-center gap-1"
              style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.85),rgba(217,119,6,0.85))" }}>
              <MessageCircle className="w-3 h-3" /> Contactar
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onOpen(product); }} className="w-full py-1.5 rounded-lg btn-gradient text-white text-[11px] font-bold">
              Ver y comprar
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Public store types ───────────────────────────────────────────────────────
interface PublicStore {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  ownerName: string | null;
  coHostName: string | null;
  avgStoreRating: number | null;
  countStoreRatings: number;
  productCount: number;
}

// ─── Store card ───────────────────────────────────────────────────────────────
function StoreCard({ store, navigate }: { store: PublicStore; navigate: (p: string) => void }) {
  const rating = store.avgStoreRating ? +Number(store.avgStoreRating).toFixed(1) : null;
  const count = +store.countStoreRatings || 0;
  const productCount = +store.productCount || 0;

  return (
    <div
      className="glass rounded-2xl overflow-hidden flex flex-col group hover:ring-1 hover:ring-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all cursor-pointer"
      onClick={() => navigate(`/stores/${store.id}`)}
    >
      {/* Logo / hero — 16:9 */}
      <div className="aspect-video bg-[#12131a] flex items-center justify-center overflow-hidden relative flex-shrink-0 w-full">
        {store.logoUrl ? (
          <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/10">
            <Store className="w-12 h-12" />
            <span className="text-[10px] font-medium uppercase tracking-widest">Tienda</span>
          </div>
        )}
        {/* Verified badge */}
        <div className="absolute top-2 right-2">
          <span className="flex items-center gap-1 text-[10px] bg-emerald-500/90 backdrop-blur-sm text-white px-2 py-0.5 rounded-full font-semibold">
            <BadgeCheck className="w-3 h-3" /> Verificada
          </span>
        </div>
        {productCount > 0 && (
          <div className="absolute bottom-2 left-2">
            <span className="flex items-center gap-1 text-[10px] bg-black/60 backdrop-blur-sm text-white/80 px-2 py-0.5 rounded-full">
              <Package className="w-2.5 h-2.5" /> {productCount} producto{productCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        {/* Name */}
        <h3 className="font-bold text-foreground text-sm leading-tight mb-1 line-clamp-1">{store.name}</h3>

        {/* Owner */}
        {(store.coHostName ?? store.ownerName) && (
          <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> por {store.coHostName ?? store.ownerName}
          </p>
        )}

        {/* Description */}
        {store.description && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed flex-1">{store.description}</p>
        )}

        {/* Rating */}
        <div className="flex items-center gap-1.5 mt-auto">
          {rating !== null ? (
            <>
              <div className="flex items-center gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`w-3 h-3 ${s <= Math.floor(rating) ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40"}`} />
                ))}
              </div>
              <span className="text-xs text-amber-400 font-bold">{rating}</span>
              <span className="text-[11px] text-muted-foreground">({count} reseña{count !== 1 ? "s" : ""})</span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 italic">Sin reseñas aún</span>
          )}
        </div>

        {/* CTA */}
        <button className="mt-3 w-full py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/20 transition-colors group-hover:border-primary/40">
          <Store className="w-3.5 h-3.5" /> Ver tienda <ChevronRight className="w-3 h-3 opacity-60" />
        </button>
      </div>
    </div>
  );
}

// ─── Stores view ──────────────────────────────────────────────────────────────
function StoresView({ navigate }: { navigate: (path: string) => void }) {
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/public/stores", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setStores(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = stores.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (s.coHostName ?? s.ownerName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full space-y-4">

      {/* Brand banner */}
      <div
        className="rounded-2xl p-4 flex items-center gap-4"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))", border: "1px solid rgba(139,92,246,0.15)" }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl" style={{ background: "rgba(139,92,246,0.15)" }}>
          🏬
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Explora los negocios verificados de ServiMarket</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-400 bg-violet-400/10 border border-violet-400/20 px-2 py-0.5 rounded-full">
              🏅 Tiendas verificadas
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
              🛒 Pago protegido en escrow
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Buscar tiendas por nombre, descripción..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Count */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{filtered.length}</span> tienda{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}
          {search && ` para "${search}"`}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="glass rounded-2xl h-64 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Store className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-foreground">No se encontraron tiendas</p>
          {search ? (
            <>
              <p className="text-sm mt-1">Intenta con otra búsqueda</p>
              <button onClick={() => setSearch("")} className="mt-4 btn-gradient text-white px-4 py-2 rounded-xl text-sm">Limpiar búsqueda</button>
            </>
          ) : (
            <p className="text-sm mt-1">Aún no hay tiendas activas</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {filtered.map(s => <StoreCard key={s.id} store={s} navigate={navigate} />)}
        </div>
      )}
    </div>
  );
}

// ─── Rental Reservation Modal ────────────────────────────────────────────────
function RentalReservationModal({
  product,
  onClose,
  navigate,
}: {
  product: Product;
  onClose: () => void;
  navigate: (to: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const days = startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 1;
  const totalCost = product.rentalPricePerDay != null ? (days * product.rentalPricePerDay).toFixed(2) : null;

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const handleConfirm = () => {
    if (!product.storeId || !startDate || !endDate) return;
    const params = new URLSearchParams({
      product: String(product.id),
      productName: product.name,
      start: fmtDate(startDate),
      end: fmtDate(endDate),
    });
    navigate(`/store-chat/${product.storeId}?${params}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl w-full max-w-sm p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-violet-400" /> Reservar Alquiler
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/[0.06]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 rounded-xl" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
          <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
          {product.rentalPricePerDay != null && (
            <p className="text-xs text-violet-300 mt-0.5">${product.rentalPricePerDay.toFixed(2)} / día</p>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Fecha de inicio</label>
            <input
              type="date" min={today} value={startDate}
              onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
              style={{ colorScheme: "dark" }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Fecha de fin</label>
            <input
              type="date" min={startDate || today} value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
              style={{ colorScheme: "dark" }}
            />
          </div>
        </div>

        {totalCost && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
            <span className="text-sm text-muted-foreground">{days} día{days !== 1 ? "s" : ""} × ${product.rentalPricePerDay?.toFixed(2)}</span>
            <span className="text-base font-black text-violet-300">${totalCost}</span>
          </div>
        )}

        {product.rentalDeposit != null && (
          <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-xs text-amber-300 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Depósito de garantía</span>
            <span className="text-xs font-bold text-amber-300">${product.rentalDeposit.toFixed(2)}</span>
          </div>
        )}

        {product.rentalRules && (
          <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Condiciones</p>
            <p className="text-xs text-muted-foreground">{product.rentalRules}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium glass text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!startDate || !endDate || endDate < startDate}
            className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Enviar solicitud
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Virtualized product grid (FASE 2 T006) ──────────────────────────────────
// Render-vacío de filas fuera del viewport con @tanstack/react-virtual.
// La página entera scrollea (window scroll), por eso usamos useWindowVirtualizer.
// itemsPerRow se ajusta a Tailwind: <640 ⇒ 1, 640-1024 ⇒ 2, ≥1024 ⇒ 3.
//
// El infinite-scroll dispara `onReachEnd` cuando faltan ≤2 filas para el final.
function VirtualizedProductGrid(props: {
  products: Product[];
  bcvRate: number;
  canBuy: boolean;
  onOpen: (p: Product) => void;
  successId: number | null;
  userLat: number | null;
  userLng: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onReachEnd: () => void;
}) {
  const { products, bcvRate, canBuy, onOpen, successId, userLat, userLng, hasMore, loadingMore, onReachEnd } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const itemsPerRow = containerWidth >= 1024 ? 3 : containerWidth >= 640 ? 2 : 1;
  const rowCount = Math.ceil(products.length / itemsPerRow);

  // Badges globales se calculan sobre TODO el set cargado, no por fila.
  // Con paginación, esto se va refinando a medida que llegan más páginas.
  const { topSellerId, bestRatedId } = useMemo(() => {
    const withRatings = products.filter(p => p.countProductRatings > 0);
    if (withRatings.length === 0) return { topSellerId: null as number | null, bestRatedId: null as number | null };
    const top = withRatings.reduce((a, b) => b.countProductRatings > a.countProductRatings ? b : a);
    const best = withRatings.reduce((a, b) => (+(b.avgProductRating ?? 0)) > (+(a.avgProductRating ?? 0)) ? b : a);
    return { topSellerId: top.id, bestRatedId: best.id };
  }, [products]);

  // useWindowVirtualizer scrollea contra la ventana; offset compensa el
  // espacio antes del grid (sticky header + sidebar trust panels).
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setScrollMargin(rect.top + window.scrollY);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Estimación: card ProductCard ronda los 360-420 px alto + gap-5 (20px).
  const ESTIMATED_ROW_HEIGHT = 420;

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 4,
    scrollMargin,
  });

  // Disparo de infinite scroll: cuando estamos a ≤2 filas del final.
  const items = virtualizer.getVirtualItems();
  const lastItem = items[items.length - 1];
  useEffect(() => {
    if (!lastItem || !hasMore || loadingMore) return;
    if (lastItem.index >= rowCount - 2) onReachEnd();
  }, [lastItem, rowCount, hasMore, loadingMore, onReachEnd]);

  const totalSize = virtualizer.getTotalSize();

  return (
    <>
      <div ref={containerRef} style={{ position: "relative", height: totalSize, width: "100%" }}>
        {items.map(virtualRow => {
          const rowIdx = virtualRow.index;
          const start = rowIdx * itemsPerRow;
          const rowProducts = products.slice(start, start + itemsPerRow);
          const colsClass = itemsPerRow === 3
            ? "grid-cols-3"
            : itemsPerRow === 2 ? "grid-cols-2" : "grid-cols-1";
          return (
            <div
              key={virtualRow.key}
              data-index={rowIdx}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                paddingBottom: 20,
              }}
            >
              <div className={`grid ${colsClass} gap-5`}>
                {rowProducts.map(p => {
                  const distKm = userLat && userLng && p.latitude && p.longitude
                    ? distanceKm(userLat, userLng, p.latitude, p.longitude)
                    : null;
                  return (
                    <ProductCard
                      key={p.id}
                      product={p}
                      bcvRate={bcvRate}
                      canBuy={canBuy}
                      onOpen={onOpen}
                      successId={successId}
                      distKm={distKm}
                      isTopSeller={p.id === topSellerId}
                      isBestRated={p.id === bestRatedId && (+(p.avgProductRating ?? 0)) >= 4.0}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Indicador de carga incremental + estado fin de lista */}
      {hasMore ? (
        <div className="flex items-center justify-center py-6">
          {loadingMore ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <span className="text-xs text-muted-foreground">Desliza para ver más</span>
          )}
        </div>
      ) : products.length > PAGE_SIZE_CONST ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          Has visto los {products.length} productos disponibles
        </div>
      ) : null}
    </>
  );
}

// Constante usada por VirtualizedProductGrid (decide si mostrar el footer
// de "se acabaron"). Coincide con el PAGE_SIZE de StorePage.
const PAGE_SIZE_CONST = 24;

// ─── Main page ───────────────────────────────────────────────────────────────
export function StorePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);
  const initialMode = urlParams.get("mode") === "stores" ? "stores" : "products";
  const initialType = (urlParams.get("type") === "rental" ? "rental" : "sale") as "sale" | "rental";

  const [mode, setMode] = useState<"stores" | "products">(initialMode);
  const [listingTypeFilter, setListingTypeFilter] = useState<"sale" | "rental">(initialType);
  const [subTypeFilter, setSubTypeFilter] = useState<string>("all");
  const [rentalModal, setRentalModal] = useState<Product | null>(null);
  const [showLoginWall, setShowLoginWall] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  // FASE 2 T005 — paginación real (24 por página). hasMore=false cuando la
  // última página vino corta. loadingMore evita race-conditions de scroll.
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 24;
  const [bcvRate, setBcvRate] = useState<number>(() => {
    try {
      const pinned = localStorage.getItem("bcv_pinned_rate");
      const val = pinned ? parseFloat(pinned) : NaN;
      return isNaN(val) ? 36 : val;
    } catch { return 36; }
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "map">("grid");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterApplied, setFilterApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterDraft, setFilterDraft] = useState<FilterState>(DEFAULT_FILTERS);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locRequested, setLocRequested] = useState(false);
  const [locError, setLocError] = useState(false);

  // Modal state
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [successId, setSuccessId] = useState<number | null>(null);

  // Map ↔ list bidirectional sync
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null);
  const [mapVisibleIds, setMapVisibleIds] = useState<number[] | null>(null);

  const openFilters = () => { setFilterDraft(filterApplied); setFilterOpen(true); };
  const applyFilters = () => { setFilterApplied(filterDraft); setFilterOpen(false); };
  const removeFilterChip = (key: keyof FilterState, resetVal: any) => {
    setFilterApplied(f => ({ ...f, [key]: resetVal }));
  };

  useEffect(() => {
    apiFetch("/api/bcv-rate").then((d: any) => {
      if (d?.rate) {
        setBcvRate(d.rate);
        try { localStorage.setItem("bcv_pinned_rate", String(d.rate)); } catch { /* storage blocked */ }
      }
    }).catch(() => {});
  }, []);

  const requestLocation = useCallback(() => {
    setLocRequested(true);
    navigator.geolocation?.getCurrentPosition(
      pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); setLocError(false); },
      () => setLocError(true),
      { timeout: 10000 }
    );
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  // Auto-select "nearest" sort when GPS first becomes available
  const sortAutoSetRef = useRef(false);
  useEffect(() => {
    if (userLat != null && !sortAutoSetRef.current) {
      sortAutoSetRef.current = true;
      setFilterApplied(f => f.sortBy === "default" ? { ...f, sortBy: "nearest" } : f);
      setFilterDraft(f => f.sortBy === "default" ? { ...f, sortBy: "nearest" } : f);
    }
  }, [userLat]);

  // FASE 2 T008 — debounce del campo de búsqueda libre, para no disparar
  // requests por cada tecla. 300 ms es el sweet spot UX vs traffic.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Construye los query params que viajan al backend. Memo-izado por estabilidad
  // referencial (sirve como key del effect de carga inicial).
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filterApplied.category) p.set("category", filterApplied.category);
    if (userLat != null) p.set("lat", String(userLat));
    if (userLng != null) p.set("lng", String(userLng));
    p.set("type", listingTypeFilter);
    if (subTypeFilter !== "all") p.set("subType", subTypeFilter);
    if (debouncedSearch.trim()) p.set("q", debouncedSearch.trim());
    if (filterApplied.priceMin) p.set("priceMin", filterApplied.priceMin);
    if (filterApplied.priceMax) p.set("priceMax", filterApplied.priceMax);
    if (filterApplied.delivery !== null) p.set("delivery", String(filterApplied.delivery));
    if (filterApplied.condition) p.set("condition", filterApplied.condition);
    if (filterApplied.minRating !== null) p.set("minRating", String(filterApplied.minRating));
    if (filterApplied.sortBy && filterApplied.sortBy !== "default") p.set("sort", filterApplied.sortBy);
    return p.toString();
  }, [filterApplied, userLat, userLng, listingTypeFilter, subTypeFilter, debouncedSearch]);

  // FASE 2 T005 — fetch paginated (grid) o full (map). El mapa necesita TODOS
  // los productos con coords para mostrar todos los pines, así que en mapa
  // caemos al modo legacy del endpoint (sin ?page) en una sola request.
  // En grid, traemos página por página y append-eamos al state.
  const reqIdRef = useRef(0); // anti-stale-fetch
  const load = useCallback(async (targetPage: number, append: boolean) => {
    const myReq = ++reqIdRef.current;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const url = view === "map"
        ? `/api/products?${queryParams}`
        : `/api/products?${queryParams}&page=${targetPage}&limit=${PAGE_SIZE}`;
      const data = await apiFetch(url);
      // Si llegó otra request más nueva mientras esperábamos, descartamos.
      if (myReq !== reqIdRef.current) return;
      const normalized = (data as Product[]).map(normalizeProduct);
      setProducts(prev => append ? [...prev, ...normalized] : normalized);
      setHasMore(view === "grid" ? normalized.length === PAGE_SIZE : false);
      setPage(targetPage);
    } catch {
      if (myReq === reqIdRef.current) {
        if (!append) setProducts([]);
        setHasMore(false);
      }
    } finally {
      if (myReq === reqIdRef.current) {
        setLoadingMore(false);
        setLoading(false);
      }
    }
  }, [queryParams, view]);

  // Reset de paginación + carga de página 1 cuando cambia cualquier filtro o el view.
  useEffect(() => { load(1, false); }, [load]);

  // Reset sub-type when top-level type changes
  useEffect(() => { setSubTypeFilter("all"); }, [listingTypeFilter]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore || view === "map") return;
    load(page + 1, true);
  }, [hasMore, loading, loadingMore, page, load, view]);

  // FASE 2 T008 — TODO el filtrado/sorting ocurre ahora server-side.
  // El frontend solo presenta. Mantenemos `filtered` como alias para no tocar
  // el resto de la UI (mapa, premium section, etc).
  const filtered = products;

  // Active filter chips to display
  const activeChips: { label: string; onRemove: () => void }[] = [];
  if (filterApplied.category) activeChips.push({ label: filterApplied.category, onRemove: () => removeFilterChip("category", "") });
  if (filterApplied.priceMin || filterApplied.priceMax) activeChips.push({ label: `$${filterApplied.priceMin || "0"}–$${filterApplied.priceMax || "∞"}`, onRemove: () => setFilterApplied(f => ({ ...f, priceMin: "", priceMax: "" })) });
  if (filterApplied.delivery !== null) activeChips.push({ label: filterApplied.delivery ? "Con delivery" : "Sin delivery", onRemove: () => removeFilterChip("delivery", null) });
  if (filterApplied.condition) activeChips.push({ label: filterApplied.condition === "new" ? "Nuevo" : "Usado", onRemove: () => removeFilterChip("condition", "") });
  if (filterApplied.minRating !== null) activeChips.push({ label: `${filterApplied.minRating}★ +`, onRemove: () => removeFilterChip("minRating", null) });
  if (filterApplied.sortBy !== "default") {
    const label = { nearest: "📍 Más cercanos", price_asc: "Precio ↑", price_desc: "Precio ↓", rating: "Mejor rating", newest: "Más recientes" }[filterApplied.sortBy] ?? filterApplied.sortBy;
    activeChips.push({ label, onRemove: () => removeFilterChip("sortBy", "default") });
  }

  const activeFilterCount = countActiveFilters(filterApplied);

  const openModal = (product: Product) => {
    setModalProduct(product);
    fetch(`/api/products/${product.id}/track-click`, { method: "POST" }).catch(() => {});
  };
  const closeModal = () => setModalProduct(null);
  const handleSuccess = (id: number) => {
    setModalProduct(null);
    setSuccessId(id);
    setTimeout(() => setSuccessId(null), 5000);
  };

  const canBuy = user?.role === "client" || user?.role === "worker";

  // ── Profile-incomplete gate modal ─────────────────────────────────────────
  const [profileGateProduct, setProfileGateProduct] = useState<Product | null>(null);

  // ── Auto-open product from redirect (after login) ─────────────────────────
  const openProductIdRef = useRef<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("openProduct");
    if (id) openProductIdRef.current = parseInt(id, 10);
  }, []);

  useEffect(() => {
    if (!loading && openProductIdRef.current && products.length > 0) {
      const target = products.find(p => p.id === openProductIdRef.current);
      openProductIdRef.current = null;
      if (target) {
        // slight delay so the product list is visible first
        setTimeout(() => openModal(target), 300);
      }
    }
  }, [loading, products]);

  // ── Buy gate — intercepts ALL "buy" clicks ────────────────────────────────
  const handleBuyGate = (product: Product) => {
    if (!user) {
      setShowLoginWall(true);
      return;
    }
    if (!canBuy) {
      // Logged in but wrong role (seller, cohost, admin) → open modal, they'll see "no compras" message
      openModal(product);
      return;
    }
    if (!user.avatarUrl) {
      // Logged in, right role, but profile incomplete → soft gate
      setProfileGateProduct(product);
      return;
    }
    openModal(product);
  };
  const productsOnMap = filtered.filter(p => p.latitude != null && p.longitude != null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─── Top bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 space-y-3">

        {/* Title row */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" /> ServiMarket 🛒
          </h1>
          {mode === "products" && (
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              <button
                onClick={() => setView("grid")}
                className={`px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors ${view === "grid" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Grid3X3 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Grilla</span>
              </button>
              <button
                onClick={() => setView("map")}
                className={`px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors ${view === "map" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Map className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Mapa</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Mode toggle ─────────────────────────────────────────── */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("stores")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === "stores"
                ? "bg-violet-500/20 border border-violet-500/50 text-violet-300"
                : "bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.07]"
            }`}
          >
            <Store className="w-4 h-4" /> 🏬 Explorar tiendas
          </button>
          <button
            onClick={() => setMode("products")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === "products"
                ? "bg-primary/20 border border-primary/50 text-primary"
                : "bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.07]"
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> 🛒 Explorar productos
          </button>
        </div>

        {/* Products-only: BCV rate + location + search + filters */}
        {mode === "products" && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Tasa BCV: <span className="text-emerald-400 font-semibold">Bs. {bcvRate.toFixed(2)}</span>
              </span>
              {userLat ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> Ordenado por cercanía
                </span>
              ) : locError ? (
                <button onClick={requestLocation} className="text-xs text-amber-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Activar ubicación
                </button>
              ) : (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Obteniendo ubicación...
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Buscar productos, tiendas, categorías..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={openFilters}
                className={`relative px-3.5 py-2 rounded-xl border text-sm flex items-center gap-1.5 transition-colors ${activeFilterCount > 0 ? "border-primary text-primary bg-primary/10" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">Filtros</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* ── Listing type tabs ─────────────────────────────────── */}
            <div className="flex gap-2 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {([
                { id: "sale",   label: "🛒 Productos",  activeColor: "#06B6D4", activeBg: "rgba(6,182,212,0.15)", activeBorder: "rgba(6,182,212,0.35)" },
                { id: "rental", label: "🔑 Alquileres", activeColor: "#a78bfa", activeBg: "rgba(139,92,246,0.15)", activeBorder: "rgba(139,92,246,0.35)" },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setListingTypeFilter(tab.id)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={listingTypeFilter === tab.id
                    ? { background: tab.activeBg, border: `1px solid ${tab.activeBorder}`, color: tab.activeColor }
                    : { background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Sub-type tabs ─────────────────────────────────────────── */}
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              {(listingTypeFilter === "rental"
                ? [
                    { id: "all",        label: "Todos",      icon: "✨" },
                    { id: "tool",       label: "Objetos",    icon: "🔧" },
                    { id: "vehicle",    label: "Vehículos",  icon: "🚗" },
                    { id: "property",   label: "Propiedades",icon: "🏠" },
                    { id: "experience", label: "Experiencias",icon: "🛥️" },
                  ]
                : [
                    { id: "all",      label: "Todos",       icon: "✨" },
                    { id: "general",  label: "Productos",   icon: "📦" },
                    { id: "vehicle",  label: "Vehículos",   icon: "🚗" },
                    { id: "property", label: "Inmuebles",   icon: "🏠" },
                  ]
              ).map(st => {
                const isActive = subTypeFilter === st.id;
                const accentColor = listingTypeFilter === "rental" ? "#a78bfa" : "#06B6D4";
                const accentBg   = listingTypeFilter === "rental" ? "rgba(139,92,246,0.15)" : "rgba(6,182,212,0.12)";
                const accentBdr  = listingTypeFilter === "rental" ? "rgba(139,92,246,0.35)" : "rgba(6,182,212,0.3)";
                return (
                  <button
                    key={st.id}
                    onClick={() => setSubTypeFilter(st.id)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                    style={isActive
                      ? { background: accentBg, border: `1px solid ${accentBdr}`, color: accentColor }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
                  >
                    <span>{st.icon}</span> {st.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ─── Stores View ───────────────────────────────────────────── */}
      {mode === "stores" && <StoresView navigate={navigate} />}

      {/* ─── Map View ──────────────────────────────────────────────── */}
      {mode === "products" && view === "map" && (
        <div className="flex-1 px-3 md:px-6 pb-6 w-full max-w-7xl mx-auto">
          {/* Two-column layout: list (desktop) + map */}
          <div className="flex gap-3" style={{ height: "min(620px, calc(100vh - 260px))" }}>

            {/* ── LEFT: Product list panel (desktop only) ── */}
            {!loading && (() => {
              const visibleProducts = mapVisibleIds !== null
                ? filtered.filter(p => mapVisibleIds.includes(p.id) && p.latitude != null && p.longitude != null)
                : filtered.filter(p => p.latitude != null && p.longitude != null);
              return (
                <div className="hidden lg:flex flex-col flex-shrink-0 rounded-2xl overflow-hidden"
                  style={{ width: 280, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {/* Panel header */}
                  <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                    <div className="flex items-center justify-between">
                      <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)", margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
                        <Map style={{ width: 12, height: 12 }} />
                        {mapVisibleIds !== null
                          ? `${visibleProducts.length} en esta zona`
                          : `${visibleProducts.length} en el mapa`}
                      </p>
                      {mapVisibleIds !== null && (
                        <button onClick={() => setMapVisibleIds(null)}
                          style={{ fontSize: 10, fontWeight: 600, color: "rgba(99,102,241,0.8)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          Ver todos
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Scrollable product list */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "6px", scrollbarWidth: "thin" as const }}>
                    {visibleProducts.length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center" }}>
                        <MapPin style={{ width: 28, height: 28, color: "rgba(255,255,255,0.1)", margin: "0 auto 8px" }} />
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>Mueve el mapa para ver productos</p>
                      </div>
                    ) : visibleProducts.map(p => {
                      const isSelected = mapSelectedId === p.id;
                      const isRental = p.listingType === "rental";
                      const displayPrice = isRental && p.rentalPricePerDay != null ? p.rentalPricePerDay : p.priceUsd;
                      const priceVes = Math.round(displayPrice * bcvRate);
                      return (
                        <button key={p.id}
                          onClick={() => setMapSelectedId(prev => prev === p.id ? null : p.id)}
                          style={{
                            width: "100%", display: "flex", gap: 10, padding: "8px", borderRadius: 12,
                            background: isSelected ? "rgba(99,102,241,0.15)" : "transparent",
                            border: isSelected ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
                            cursor: "pointer", textAlign: "left", transition: "all .18s ease",
                            marginBottom: 3,
                          }}>
                          {/* Thumbnail */}
                          <div style={{ width: 58, height: 58, borderRadius: 9, overflow: "hidden", background: "#1e293b", flexShrink: 0, position: "relative" }}>
                            {p.image ? (
                              <img src={p.image} alt={p.name} loading="lazy"
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <ShoppingBag style={{ width: 18, height: 18, color: "rgba(255,255,255,0.1)" }} />
                              </div>
                            )}
                            {isRental && (
                              <div style={{ position: "absolute", bottom: 2, right: 2, fontSize: 8, padding: "1px 4px", borderRadius: 6, background: "rgba(139,92,246,.9)", color: "#fff", fontWeight: 700 }}>🔑</div>
                            )}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: isSelected ? "#c7d2fe" : "rgba(255,255,255,0.85)", lineHeight: 1.3, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                              {p.name}
                            </p>
                            <p style={{ fontSize: 13, fontWeight: 800, color: isSelected ? "#a5b4fc" : "#e2e8f0", margin: "0 0 1px" }}>
                              ${displayPrice.toFixed(0)}{isRental ? <span style={{ fontSize: 10, fontWeight: 500 }}>/día</span> : ""}
                            </p>
                            {bcvRate > 0 && (
                              <p style={{ fontSize: 10, color: "rgba(52,211,153,0.75)", margin: 0 }}>
                                Bs. {priceVes.toLocaleString("es-VE")}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Products without coords footer */}
                  {!loading && filtered.length > productsOnMap.length && (
                    <div style={{ padding: "8px 12px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                        <MapPin style={{ width: 10, height: 10 }} />
                        {filtered.length - productsOnMap.length} sin ubicación no mostrados
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── RIGHT: Map ── */}
            <div className="flex-1 rounded-3xl overflow-hidden relative" style={{ minHeight: 320 }}>
              {loading ? (
                <div className="w-full h-full flex items-center justify-center bg-[#0d0f14]">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Cargando mapa...</p>
                  </div>
                </div>
              ) : (
                <Suspense fallback={
                  <div className="w-full h-full flex items-center justify-center bg-[#0d0f14]">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                }>
                  <div style={{ width: "100%", height: "100%" }}>
                    <ProductMap
                      products={filtered}
                      userLat={userLat}
                      userLng={userLng}
                      bcvRate={bcvRate}
                      onBuy={id => { const p = products.find(x => x.id === id); if (p) openModal(p); }}
                      canBuy={canBuy}
                      successId={successId}
                      selectedProductId={mapSelectedId}
                      onProductSelect={id => setMapSelectedId(id)}
                      onVisibleProductsChange={ids => setMapVisibleIds(ids)}
                    />
                  </div>
                </Suspense>
              )}
            </div>
          </div>

          {/* ── Mobile: horizontal strip (hidden on lg+) ── */}
          {!loading && (() => {
            const visibleProducts = mapVisibleIds !== null
              ? filtered.filter(p => mapVisibleIds.includes(p.id) && p.latitude != null && p.longitude != null)
              : filtered.filter(p => p.latitude != null && p.longitude != null);
            if (visibleProducts.length === 0) return null;
            return (
              <div className="lg:hidden mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                    <Map className="w-3 h-3" />
                    {mapVisibleIds !== null ? `${visibleProducts.length} en esta zona` : `${visibleProducts.length} en el mapa`}
                  </p>
                  {mapVisibleIds !== null && (
                    <button onClick={() => setMapVisibleIds(null)} className="text-[10px] font-semibold" style={{ color: "rgba(99,102,241,0.8)" }}>
                      Ver todos
                    </button>
                  )}
                </div>
                <div className="flex gap-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
                  {visibleProducts.map(p => {
                    const isSelected = mapSelectedId === p.id;
                    const isRental = p.listingType === "rental";
                    const displayPrice = isRental && p.rentalPricePerDay != null ? p.rentalPricePerDay : p.priceUsd;
                    return (
                      <button key={p.id} onClick={() => setMapSelectedId(prev => prev === p.id ? null : p.id)}
                        style={{ flexShrink: 0, width: 130, borderRadius: 12, overflow: "hidden", background: isSelected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)", border: isSelected ? "1.5px solid rgba(99,102,241,0.6)" : "1px solid rgba(255,255,255,0.08)", cursor: "pointer", textAlign: "left", transition: "all .2s ease", padding: 0 }}>
                        <div style={{ width: "100%", height: 72, background: "#1e293b", overflow: "hidden" }}>
                          {p.image ? <img src={p.image} alt={p.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><ShoppingBag style={{ width: 18, height: 18, color: "rgba(255,255,255,0.1)" }} /></div>}
                        </div>
                        <div style={{ padding: "6px 8px 8px" }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                          <p style={{ fontSize: 11, fontWeight: 800, color: isSelected ? "#a5b4fc" : "#94a3b8", margin: 0 }}>${displayPrice.toFixed(0)}{isRental ? "/d" : ""}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── Grid View ─────────────────────────────────────────────── */}
      {mode === "products" && view === "grid" && (
        <div className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full space-y-5">

          {/* ── Hero contextual por tab ──────────────────────────────── */}
          {listingTypeFilter === "sale" ? (
            <div className="rounded-2xl px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{ background: "linear-gradient(135deg,rgba(6,182,212,0.07) 0%,rgba(99,102,241,0.05) 100%)", border: "1px solid rgba(6,182,212,0.15)" }}>
              <div>
                <h2 className="text-xl font-black text-white mb-1">🛒 Productos en venta</h2>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Artículos verificados · pagos protegidos · delivery disponible
                </p>
              </div>
              <button
                onClick={() => setListingTypeFilter("rental")}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}
              >
                🔑 Ver alquileres
              </button>
            </div>
          ) : (
            <div className="rounded-2xl px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.08) 0%,rgba(99,102,241,0.04) 100%)", border: "1px solid rgba(139,92,246,0.2)" }}>
              <div>
                <h2 className="text-xl font-black text-white mb-1">🔑 Productos en alquiler</h2>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Elige fechas · depósito garantizado · devuelves y listo
                </p>
              </div>
              <button
                onClick={() => setListingTypeFilter("sale")}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                style={{ background: "rgba(6,182,212,0.14)", border: "1px solid rgba(6,182,212,0.3)", color: "#06B6D4" }}
              >
                🛒 Ver productos
              </button>
            </div>
          )}

          {/* ── Trust bar ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { icon: Lock,         color: "#34d399", title: "Pago protegido",         desc: "Escrow seguro" },
              { icon: BadgeCheck,   color: "#06B6D4", title: "Vendedores verificados", desc: "Identidad comprobada" },
              { icon: Zap,          color: "#fbbf24", title: "Entrega rápida",          desc: "En tu puerta" },
              { icon: MessageCircle,color: "#818cf8", title: "Soporte 24/7",            desc: "Siempre disponible" },
            ] as const).map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight">{title}</p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.38)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Category chips ────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "rgba(255,255,255,0.28)" }}>
              Categorías populares
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ICONS.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFilterApplied(f => ({ ...f, category: f.category === cat.id ? "" : cat.id }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={filterApplied.category === cat.id
                    ? { background: "rgba(6,182,212,0.16)", border: "1px solid rgba(6,182,212,0.42)", color: "#06B6D4" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
                >
                  <span>{cat.emoji}</span>{cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Active filter chips ── */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {activeChips.map(chip => (
                <span key={chip.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-primary/10 border border-primary/25 text-primary">
                  {chip.label}
                  <button onClick={chip.onRemove} className="hover:opacity-70 transition-opacity"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <button onClick={() => setFilterApplied(DEFAULT_FILTERS)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1">
                Limpiar todo
              </button>
            </div>
          )}

          {/* ── 2-column layout ───────────────────────────────────────── */}
          <div className="flex gap-5 items-start">

            {/* ── LEFT: Desktop sidebar filters ─────────────────────── */}
            <div className="hidden lg:flex flex-col gap-4 w-56 flex-shrink-0 sticky top-20">

              {/* Sort */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>Ordenar por</p>
                <div className="space-y-1.5">
                  {([
                    { value: "nearest",   label: "📍 Más cercanos" },
                    { value: "default",   label: "Relevancia" },
                    { value: "price_asc", label: "Precio ↑" },
                    { value: "price_desc",label: "Precio ↓" },
                    { value: "rating",    label: "⭐ Mejor calificación" },
                    { value: "newest",    label: "Más recientes" },
                  ] as const).map(o => (
                    <button key={o.value} onClick={() => setFilterApplied(f => ({ ...f, sortBy: o.value }))}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs transition-all"
                      style={filterApplied.sortBy === o.value
                        ? { background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)", color: "#06B6D4", fontWeight: 700 }
                        : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Condition */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>Estado del producto</p>
                <div className="space-y-1.5">
                  {[{ value: "", label: "Todos" }, { value: "new", label: "✨ Nuevo" }, { value: "used", label: "🔄 Usado" }].map(o => (
                    <button key={o.value} onClick={() => setFilterApplied(f => ({ ...f, condition: o.value }))}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs transition-all"
                      style={filterApplied.condition === o.value
                        ? { background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)", color: "#06B6D4", fontWeight: 700 }
                        : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>Precio (USD)</p>
                <div className="flex gap-2 items-center mb-2">
                  <input type="number" min="0" placeholder="Mín" value={filterApplied.priceMin}
                    onChange={e => setFilterApplied(f => ({ ...f, priceMin: e.target.value }))}
                    className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <span className="text-muted-foreground text-xs">—</span>
                  <input type="number" min="0" placeholder="Máx" value={filterApplied.priceMax}
                    onChange={e => setFilterApplied(f => ({ ...f, priceMax: e.target.value }))}
                    className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {([["<$10","","10"],["$10–50","10","50"],["$50+","50",""]] as const).map(([label, min, max]) => (
                    <button key={label} onClick={() => setFilterApplied(f => ({ ...f, priceMin: min, priceMax: max }))}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium transition-all"
                      style={filterApplied.priceMin === min && filterApplied.priceMax === max
                        ? { background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)", color: "#06B6D4" }
                        : { border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>Delivery</p>
                <div className="space-y-1.5">
                  {([{ value: null, label: "Todos" }, { value: true, label: "🚚 Con delivery" }, { value: false, label: "Sin delivery" }] as const).map(o => (
                    <button key={String(o.value)} onClick={() => setFilterApplied(f => ({ ...f, delivery: o.value }))}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs transition-all"
                      style={filterApplied.delivery === o.value
                        ? { background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)", color: "#06B6D4", fontWeight: 700 }
                        : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trust panel */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.15)" }}>
                <p className="text-xs font-bold mb-3" style={{ color: "rgba(52,211,153,0.85)" }}>🛡️ Compra con confianza</p>
                <div className="space-y-2.5">
                  {([
                    { icon: Lock,         text: "Pago protegido en escrow" },
                    { icon: RotateCcw,    text: "Garantía de devolución" },
                    { icon: ShieldCheck,  text: "Vendedores verificados" },
                    { icon: MessageCircle,text: "Soporte siempre disponible" },
                  ] as const).map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(52,211,153,0.6)" }} />
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.48)" }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* ── RIGHT: Products ───────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-6">

              {/* Result count + map link */}
              {!loading && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{filtered.length}</span> producto{filtered.length !== 1 ? "s" : ""}
                    {search && ` para "${search}"`}
                  </p>
                  {filtered.length > 0 && (
                    <button onClick={() => setView("map")} className="text-xs text-primary flex items-center gap-1 hover:underline">
                      <Map className="w-3 h-3" /> Ver en mapa
                    </button>
                  )}
                </div>
              )}

              {/* ⭐ Productos destacados — solo Premium */}
              {!loading && (() => {
                const now = new Date();
                const premiumOnes = filtered.filter(p =>
                  p.listingType !== "rental" && p.isPremium &&
                  (!p.premiumUntil || new Date(p.premiumUntil) > now)
                );
                if (premiumOnes.length === 0 || listingTypeFilter === "rental") return null;
                return (
                  <div
                    className="rounded-2xl p-4"
                    style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.06) 0%,rgba(251,191,36,0.03) 100%)", border: "1px solid rgba(245,158,11,0.18)" }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-black text-sm flex items-center gap-2" style={{ color: "#fbbf24" }}>
                        ⭐ Productos destacados
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
                          {premiumOnes.length} {premiumOnes.length === 1 ? "producto" : "productos"}
                        </span>
                      </h3>
                      <span className="text-[10px] font-semibold flex items-center gap-1"
                        style={{ color: "rgba(245,158,11,0.6)" }}>
                        <Shield className="w-3 h-3" /> Mayor visibilidad
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {premiumOnes.map(p => {
                        const distKm = userLat && userLng && p.latitude && p.longitude ? distanceKm(userLat, userLng, p.latitude, p.longitude) : null;
                        return <ProductCard key={`feat-${p.id}`} product={p} bcvRate={bcvRate} canBuy={canBuy} onOpen={openModal} successId={successId} distKm={distKm} />;
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Main product grid — FASE 2 T006 virtualizado por filas */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => <div key={i} className="glass rounded-2xl h-80 animate-pulse" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  {listingTypeFilter === "rental"
                    ? <KeyRound className="w-14 h-14 mx-auto mb-4 opacity-20" />
                    : <ShoppingBag className="w-14 h-14 mx-auto mb-4 opacity-20" />}
                  <p className="font-semibold text-foreground">
                    {listingTypeFilter === "rental" ? "No se encontraron alquileres" : "No se encontraron productos"}
                  </p>
                  <p className="text-sm mt-1">Intenta con otra búsqueda o categoría</p>
                  {search && (
                    <button onClick={() => setSearch("")} className="mt-4 btn-gradient text-white px-4 py-2 rounded-xl text-sm">
                      Limpiar búsqueda
                    </button>
                  )}
                </div>
              ) : (
                <VirtualizedProductGrid
                  products={filtered}
                  bcvRate={bcvRate}
                  canBuy={canBuy}
                  onOpen={openModal}
                  successId={successId}
                  userLat={userLat}
                  userLng={userLng}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onReachEnd={loadMore}
                />
              )}

              {/* 🔄 Cross-sell CTA */}
              {!loading && filtered.length > 0 && (
                listingTypeFilter === "sale" ? (
                  <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
                    style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)" }}>
                    <div>
                      <p className="text-sm font-bold text-white">🔑 ¿Necesitas alquilar algo?</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Equipos, vehículos, herramientas y más — por días
                      </p>
                    </div>
                    <button
                      onClick={() => setListingTypeFilter("rental")}
                      className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
                      style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }}
                    >
                      Ver alquileres →
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
                    style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.18)" }}>
                    <div>
                      <p className="text-sm font-bold text-white">🛒 ¿Prefieres comprar?</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Artículos nuevos y usados con delivery disponible
                      </p>
                    </div>
                    <button
                      onClick={() => setListingTypeFilter("sale")}
                      className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
                      style={{ background: "rgba(6,182,212,0.14)", border: "1px solid rgba(6,182,212,0.35)", color: "#06B6D4" }}
                    >
                      Ver productos →
                    </button>
                  </div>
                )
              )}

              {/* ¿Quieres vender? CTA */}
              {!loading && (
                <div className="rounded-2xl px-6 py-7 text-center" style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.07) 0%,rgba(6,182,212,0.05) 100%)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <p className="text-base font-black text-white mb-1">¿Quieres vender en ServiMarket?</p>
                  <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.42)" }}>
                    Crea tu tienda gratis y llega a miles de compradores en Venezuela
                  </p>
                  <button
                    onClick={() => navigate("/cohost/stores")}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.97]"
                    style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.88),rgba(6,182,212,0.82))", boxShadow: "0 4px 20px rgba(99,102,241,0.22)" }}
                  >
                    <Store className="w-4 h-4" /> Vender ahora
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ─── Filter Panel ──────────────────────────────────────────── */}
      <FilterPanel
        open={filterOpen}
        draft={filterDraft}
        onDraftChange={setFilterDraft}
        onApply={applyFilters}
        onClose={() => setFilterOpen(false)}
      />

      {/* ─── Profile Incomplete Gate Modal ─────────────────────────── */}
      {profileGateProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] glass-strong border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Header */}
            <div className="px-8 pt-8 pb-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                <Lock className="w-7 h-7 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white mb-2">Completa tu perfil primero</h2>
                <p className="text-sm font-medium text-white/50 leading-relaxed">
                  Para comprar en ServiMarket necesitas tener tu foto de perfil configurada. ¡Solo toma un segundo!
                </p>
              </div>
            </div>

            {/* Product preview */}
            <div className="mx-6 mb-6 px-4 py-3 rounded-2xl glass border border-white/5 flex items-center gap-3">
              {profileGateProduct.image && (
                <img
                  src={profileGateProduct.image}
                  alt={profileGateProduct.name}
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{profileGateProduct.name}</p>
                <p className="text-xs font-medium text-cyan-400 mt-0.5">
                  ${profileGateProduct.priceUsd.toFixed(2)} USD
                </p>
              </div>
            </div>

            {/* Benefits */}
            <div className="mx-6 mb-6 space-y-2">
              {["Pago seguro con garantía LinkServi", "Historial de compras protegido", "Soporte prioritario incluido"].map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-white/60">{b}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="px-6 pb-8 flex flex-col gap-3">
              <button
                onClick={() => {
                  const returnTo = encodeURIComponent(`/store?openProduct=${profileGateProduct.id}`);
                  setProfileGateProduct(null);
                  navigate(`/profile/setup?returnTo=${returnTo}`);
                }}
                className="btn-gradient w-full py-4 text-base font-bold rounded-[18px] shadow-[0_10px_30px_rgba(6,182,212,0.3)] hover:shadow-[0_15px_40px_rgba(6,182,212,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Completar perfil ahora
              </button>
              <button
                onClick={() => setProfileGateProduct(null)}
                className="w-full py-3 text-sm font-bold text-white/40 hover:text-white/60 transition-colors text-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Product Detail + Buy Modal ────────────────────────────── */}
      {modalProduct && (
        <ProductModal
          product={modalProduct}
          bcvRate={bcvRate}
          canBuy={canBuy}
          onClose={closeModal}
          onSuccess={handleSuccess}
          onRentClick={p => setRentalModal(p)}
          onBuyAction={() => setShowLoginWall(true)}
          onContactClick={() => {
            const sid = modalProduct.storeId;
            closeModal();
            if (sid) navigate(`/store-chat/${sid}`);
          }}
          onDeliveryCreated={(id) => {
            closeModal();
            navigate(`/delivery/${id}`);
          }}
        />
      )}

      {/* ─── Rental Reservation Modal ────────────────────────────── */}
      {rentalModal && (
        <RentalReservationModal
          product={rentalModal}
          onClose={() => setRentalModal(null)}
          navigate={navigate}
        />
      )}

      {/* ─── Login Wall ────────────────────────────── */}
      <LoginWallModal
        open={showLoginWall}
        onClose={() => setShowLoginWall(false)}
        context="store"
      />
    </div>
  );
}
