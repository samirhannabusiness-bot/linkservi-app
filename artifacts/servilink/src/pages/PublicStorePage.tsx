import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { LoginWallModal } from "@/components/ui/LoginWallModal";
import { PublicShell } from "@/components/layout/PublicShell";
import {
  Store, Package, ShoppingBag, ArrowLeft, MapPin,
  Loader2, Tag, Truck, BadgeCheck, Star, User,
  Zap, Clock, Shield, Lock, RotateCcw,
  Minus, Plus, X, CheckCircle, AlertTriangle,
  Eye, Users, ExternalLink, Search, MessageCircle,
  ChevronLeft, ChevronRight, Heart,
} from "lucide-react";

interface Product {
  id: number;
  name: string;
  description: string | null;
  priceUsd: number;
  image: string | null;
  images: string[] | null;
  category: string;
  condition: string;
  hasDelivery: boolean;
  latitude: number | null;
  longitude: number | null;
  stock: number | null;
  isActive: boolean;
  avgProductRating: number | string | null;
  countProductRatings: number;
}

// Helper: get ordered gallery from a product (images[] first, then fallback to image)
function getGallery(product: Product): string[] {
  if (Array.isArray(product.images) && product.images.length > 0) return product.images.filter(Boolean);
  if (product.image) return [product.image];
  return [];
}

interface StoreData {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  theme: string | null;
  builderConfig: string | null;
  ownerName: string;
  ownerPhone: string | null;
  coHostId: number;
  coHostName: string | null;
  isActive: boolean;
  createdAt: string;
  tagline: string | null;
  whatsapp: string | null;
  instagram: string | null;
  city: string | null;
  accentColor: string | null;
  promoText: string | null;
  avgStoreRating: number | null;
  countStoreRatings: number;
  products: Product[];
}

// ─── Theme map (mirrors StoreBuilder themes) ────────────────────────────────
const STORE_THEMES: Record<string, { from: string; to: string; accent: string }> = {
  moderno:   { from: "#06B6D4", to: "#7C3AED", accent: "#06B6D4" },
  minimal:   { from: "#64748B", to: "#94A3B8", accent: "#64748B" },
  oscuro:    { from: "#1E293B", to: "#475569", accent: "#94A3B8" },
  esmeralda: { from: "#059669", to: "#34D399", accent: "#059669" },
  fuego:     { from: "#DC2626", to: "#F97316", accent: "#F97316" },
  royal:     { from: "#7C3AED", to: "#A78BFA", accent: "#7C3AED" },
};

// ─── Lazy image with skeleton (premium feel: blur-up + pulse) ─────────────────
function LazyImg({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse"
          style={{ background: "linear-gradient(110deg, #1a1d24 0%, #232732 50%, #1a1d24 100%)" }}
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}

// ─── Star row ──────────────────────────────────────────────────────────────────
function StarRow({ rating = 4.5, size = "sm" }: { rating?: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "w-5 h-5" : size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`${cls} ${s <= Math.floor(rating) ? "fill-amber-400 text-amber-400" : s - 0.5 <= rating ? "fill-amber-400/50 text-amber-400" : "fill-transparent text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

// ─── Product detail + buy modal ──────────────────────────────────────────────
function ProductModal({
  product, bcvRate, storeId, storeName, onClose, onSuccess,
}: {
  product: Product;
  bcvRate: number;
  storeId: number;
  storeName: string;
  onClose: () => void;
  onSuccess: (id: number) => void;
}) {
  const { token } = useAuth();
  const [step, setStep] = useState<"detail" | "buy">("detail");
  const [quantity, setQuantity] = useState(1);
  const [imgZoomed, setImgZoomed] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const gallery = getGallery(product);

  useEffect(() => { setCarouselIndex(0); setImgZoomed(false); }, [product.id]);

  const maxQty = product.stock ?? 99;
  const subtotal = +(product.priceUsd * quantity).toFixed(2);
  const realRating = product.avgProductRating ? +Number(product.avgProductRating).toFixed(1) : null;
  const realCount = +product.countProductRatings || 0;
  const fakeViewers = 3 + (product.id * 7 % 17);

  const handleBuy = async () => {
    if (!deliveryAddress.trim()) { setError("La dirección de entrega es obligatoria"); return; }
    setError(""); setPlacing(true);
    const combinedNotes = quantity > 1
      ? `Cantidad: ${quantity}${notes.trim() ? ` | ${notes.trim()}` : ""}`
      : notes.trim() || null;
    try {
      await apiFetch("/api/product-orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, deliveryAddress: deliveryAddress.trim(), notes: combinedNotes }),
      });
      setDone(true);
      setTimeout(() => { onSuccess(product.id); }, 1500);
    } catch (err: any) {
      setError(err?.message ?? "Error al realizar el pedido");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">

        {done && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <p className="text-foreground font-bold text-lg">¡Pedido enviado!</p>
            <p className="text-sm text-muted-foreground">Puedes ver el estado en "Mis Compras"</p>
          </div>
        )}

        {!done && step === "detail" && (
          <>
            {/* ── Image Carousel ─────────────────────────────────────────── */}
            <div className="relative flex-shrink-0 bg-[#0e0f14] overflow-hidden select-none"
              style={{ height: imgZoomed ? 420 : 280, transition: "height 0.35s cubic-bezier(.4,0,.2,1)" }}>

              {gallery.length > 0 ? (
                <img
                  src={gallery[carouselIndex]}
                  alt={product.name}
                  className="w-full h-full object-contain transition-all duration-500 cursor-zoom-in"
                  style={{ transform: imgZoomed ? "scale(1.18)" : "scale(1)", padding: imgZoomed ? 6 : 20 }}
                  onClick={() => setImgZoomed(z => !z)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-20 h-20 text-white/10" />
                </div>
              )}

              {/* Left / Right arrows */}
              {gallery.length > 1 && !imgZoomed && (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); setCarouselIndex(i => (i - 1 + gallery.length) % gallery.length); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 z-10 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setCarouselIndex(i => (i + 1) % gallery.length); }}
                    className="absolute right-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 z-10 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Counter */}
              {gallery.length > 1 && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 pointer-events-none">
                  {gallery.map((_, i) => (
                    <div key={i} className={`rounded-full transition-all duration-300 ${i === carouselIndex ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"}`} />
                  ))}
                </div>
              )}

              {/* Zoom hint */}
              {gallery.length > 0 && (
                <div className="absolute bottom-10 right-3 flex items-center gap-1 text-[10px] text-white/40 bg-black/40 rounded-full px-2 py-0.5 backdrop-blur-sm pointer-events-none">
                  <Eye className="w-3 h-3" /> {imgZoomed ? "Toca para reducir" : "Toca para ampliar"}
                </div>
              )}

              {/* Close button */}
              <button
                onClick={e => { e.stopPropagation(); onClose(); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Condition / delivery / stock chips */}
              <div className="absolute bottom-3 left-3 flex gap-1.5 z-10">
                <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${product.condition === "new" ? "bg-emerald-500/90 text-white" : "bg-amber-500/90 text-white"}`}>
                  {product.condition === "new" ? "Nuevo" : "Usado"}
                </span>
                {product.hasDelivery && <span className="text-[11px] px-2 py-1 rounded-full bg-blue-500/90 text-white flex items-center gap-1"><Truck className="w-2.5 h-2.5" /> Delivery</span>}
                {product.stock != null && product.stock <= 5 && product.stock > 0 && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-red-600/90 text-white font-bold flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> ¡Solo {product.stock}!</span>
                )}
              </div>
            </div>

            {/* Thumbnail strip */}
            {gallery.length > 1 && (
              <div className="flex gap-2 px-4 py-2 bg-[#0a0b10] overflow-x-auto flex-shrink-0 scrollbar-none">
                {gallery.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => { setCarouselIndex(i); setImgZoomed(false); }}
                    className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === carouselIndex ? "border-primary scale-105" : "border-transparent opacity-50 hover:opacity-80"}`}
                  >
                    <img src={url} alt={`foto ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <h2 className="text-foreground font-bold text-lg leading-tight">{product.name}</h2>

              {/* Rating */}
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
                {product.hasDelivery && <span className="text-xs text-emerald-400 flex items-center gap-1"><Zap className="w-3 h-3" /> Entrega rápida</span>}
              </div>

              {/* Price + qty */}
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-foreground">${(product.priceUsd * quantity).toFixed(2)}</span>
                    <span className="text-sm text-muted-foreground">USD</span>
                  </div>
                  <span className="text-sm text-emerald-400 font-semibold">
                    Bs. {((product.priceUsd * quantity) * bcvRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
                  </span>
                  {quantity > 1 && <p className="text-[10px] text-muted-foreground mt-0.5">${product.priceUsd.toFixed(2)} × {quantity} unidades</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1} className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center hover:bg-white/[0.08] disabled:opacity-30">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-xl font-black text-foreground w-7 text-center">{quantity}</span>
                  <button onClick={() => setQuantity(q => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty} className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center hover:bg-white/[0.08] disabled:opacity-30">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Urgency */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-medium">{fakeViewers} personas viendo este producto ahora</span>
                </div>
                {product.stock != null && (
                  <div className={`flex items-center gap-2 text-xs font-medium ${product.stock > 5 ? "text-emerald-400" : product.stock > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${product.stock > 5 ? "bg-emerald-400" : "bg-red-400 animate-pulse"}`} />
                    {product.stock > 5 ? `${product.stock} unidades en stock` : product.stock > 0 ? `⚡ ¡Últimas ${product.stock} unidades!` : "Sin stock"}
                  </div>
                )}
              </div>

              {product.description && (
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Descripción</p>
                  <p className="text-sm text-foreground leading-relaxed">{product.description}</p>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground capitalize">{product.category}</span>
              </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-white/[0.06] space-y-3">
              {product.stock === 0 ? (
                <div className="w-full py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium text-center">Sin stock disponible</div>
              ) : (
                <button onClick={() => setStep("buy")} className="w-full py-4 rounded-xl btn-gradient text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-primary/25 hover:shadow-primary/45 transition-all">
                  <Shield className="w-5 h-5" /> Comprar con protección
                </button>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {[{ Icon: Lock, label: "Pago protegido" }, { Icon: BadgeCheck, label: "Entrega verificada" }, { Icon: RotateCcw, label: "Garantía devolución" }].map(({ Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] border border-white/[0.06] py-2 px-1">
                    <Icon className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] text-muted-foreground text-center leading-tight font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!done && step === "buy" && (
          <>
            <div className="flex items-center gap-3 p-4 border-b border-white/[0.06] flex-shrink-0">
              <button onClick={() => setStep("detail")} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Comprando en {storeName}</p>
                <p className="text-sm font-bold text-foreground truncate">{product.name}</p>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
                <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground leading-relaxed">Tu pago queda <span className="font-bold text-primary">retenido en escrow</span>. Se libera al vendedor solo cuando confirmes que recibiste el producto.</p>
              </div>

              {/* Price summary */}
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
                  <span className="text-xs text-muted-foreground">Subtotal ({quantity} unid.)</span>
                  <span className="text-sm font-semibold text-foreground">${subtotal.toFixed(2)} USD</span>
                </div>
                {product.hasDelivery && (
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> Delivery</span>
                    <span className="text-xs font-semibold text-emerald-400">Gratis</span>
                  </div>
                )}
                <div className="px-4 py-2.5 flex items-center justify-between bg-white/[0.03]">
                  <span className="text-sm font-bold text-foreground">Total</span>
                  <div className="text-right">
                    <p className="text-base font-black text-foreground">${subtotal.toFixed(2)} USD</p>
                    <p className="text-[10px] text-emerald-400">Bs. {(subtotal * bcvRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Dirección de entrega *</label>
                <textarea className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={2} placeholder="Estado, ciudad, municipio, sector y calle..." value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Notas adicionales</label>
                <input className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Color, talla, instrucciones..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
              {error && <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}
            </div>

            <div className="flex-shrink-0 p-4 border-t border-white/[0.06] space-y-2">
              <button onClick={handleBuy} disabled={placing} className="w-full py-4 rounded-xl btn-gradient text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-primary/30 disabled:opacity-60">
                {placing ? <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</> : <><Lock className="w-5 h-5" /> Confirmar compra · ${subtotal.toFixed(2)}</>}
              </button>
              <p className="text-[10px] text-center text-muted-foreground">Pago retenido en escrow hasta que confirmes recepción.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function PublicStorePage() {
  const [, params] = useRoute("/stores/:storeId");
  const [, navigate] = useLocation();
  const { token, user } = useAuth();
  const storeId = params?.storeId ? parseInt(params.storeId) : null;

  const [store, setStore] = useState<StoreData | null>(null);
  const [bcvRate, setBcvRate] = useState(36);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("todos");
  const [search, setSearch] = useState("");
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [successId, setSuccessId] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showLoginWall, setShowLoginWall] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setVisibleCount(24); }, [category, search]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleCount(c => c + 24);
    }, { rootMargin: "600px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [store, category, search]);

  useEffect(() => {
    apiFetch("/api/bcv-rate").then((d: any) => { if (d?.rate) setBcvRate(d.rate); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!storeId || !token) return;
    setLoading(true);
    apiFetch(`/api/public/stores/${storeId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(setStore)
      .catch(() => setError("No se pudo cargar la tienda"))
      .finally(() => setLoading(false));
  }, [storeId, token]);

  const canBuy = user?.role === "client" || user?.role === "worker";

  const activeProducts = store?.products.filter(p => p.isActive !== false) ?? [];
  const uniqueCategories = ["todos", ...Array.from(new Set(activeProducts.map(p => p.category)))];

  // Auto-open product modal when ?product=<id> is in the URL
  useEffect(() => {
    if (!store) return;
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("product");
    if (!productId) return;
    const pid = parseInt(productId, 10);
    const found = store.products.find(p => p.id === pid && p.isActive !== false);
    if (found) setModalProduct(found);
  }, [store]);

  const filtered = activeProducts.filter(p => {
    const matchesCat = category === "todos" || p.category === category;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Store stats — all guarded so they're safe while store is still null
  const deliveryCount = activeProducts.filter(p => p.hasDelivery).length;
  const newCount = activeProducts.filter(p => p.condition === "new").length;
  const storeRating = store?.avgStoreRating ? +store.avgStoreRating.toFixed(1) : null;
  const storeRatingCount = store ? (+store.countStoreRatings || 0) : 0;
  const deliveredCount = activeProducts.reduce((acc, p) => acc + (+p.countProductRatings || 0), 0);

  // ── Parse builderConfig — BUILDER CONFIG IS LAW ─────────────────────────
  const bc = (() => { try { return JSON.parse(store?.builderConfig ?? "{}"); } catch { return {}; } })();
  const sections = {
    hero: true, carousel: true, video: false, testimonials: false,
    ...(bc.sections ?? {}),
  };
  const builderVideoUrl: string = bc.videoUrl ?? "";

  // ── Theme system — resolve colors from theme name ─────────────────────────
  const themeKey = store?.theme ?? "moderno";
  const themeColors = STORE_THEMES[themeKey] ?? STORE_THEMES.moderno;
  const accent = store?.accentColor ?? themeColors.accent;
  const heroFallbackGradient = `linear-gradient(160deg, ${themeColors.from}28 0%, ${themeColors.to}14 40%, rgba(0,0,0,0.88) 100%)`;

  const handleSuccess = (id: number) => {
    setModalProduct(null);
    setSuccessId(id);
    setTimeout(() => setSuccessId(null), 5000);
  };

  return (
    <PublicShell>
      <div className="min-w-0">

        {/* ─── Loading / Error ────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-muted-foreground">
            <Store className="w-12 h-12 opacity-20" />
            <p className="font-semibold">{error}</p>
            <button onClick={() => navigate("/store")} className="text-sm text-primary hover:underline">Volver al ServiMarket</button>
          </div>
        )}

        {!loading && store && (
          <>
            {/* ─── Hero Banner — controlled by builderConfig.sections.hero ── */}
            {sections.hero && (
            <div className="relative w-full overflow-hidden" style={{ minHeight: 420 }}>

              {/* Hero background — custom banner or theme-based cinematic fallback */}
              <div className="absolute inset-0">
                {store.bannerUrl ? (
                  <img src={store.bannerUrl} alt="" className="w-full h-full object-cover" />
                ) : activeProducts[0] && getGallery(activeProducts[0] as Product)[0] ? (
                  <img src={getGallery(activeProducts[0] as Product)[0]} alt="" className="w-full h-full object-cover scale-125 blur-3xl opacity-25 saturate-150" />
                ) : null}
                <div className="absolute inset-0" style={{
                  background: store.bannerUrl
                    ? "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.95) 100%)"
                    : heroFallbackGradient
                }} />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                {!store.bannerUrl && (
                  <div className="absolute inset-0 opacity-[0.04]" style={{
                    backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
                    backgroundSize: "40px 40px"
                  }} />
                )}
              </div>

              {/* Back button */}
              <button
                onClick={() => navigate("/store")}
                className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-xs text-white/70 hover:text-white bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5 transition-all hover:bg-black/60"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Volver al ServiMarket
              </button>

              {/* ─── Center layout ─── */}
              <div className="relative z-10 flex flex-col items-center text-center px-6 pt-14 pb-6 gap-4">

                {/* Promo banner */}
                {store.promoText && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
                    style={{
                      background: `${accent}22`,
                      border: `1px solid ${accent}55`,
                      color: accent,
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
                    {store.promoText}
                  </div>
                )}

                {/* Logo — the star of the show */}
                <div className="relative mt-2">
                  <div className="absolute -inset-3 rounded-3xl opacity-40 blur-xl" style={{
                    background: `linear-gradient(135deg, ${accent}, #8B5CF6, ${accent})`
                  }} />
                  <div className="absolute -inset-1.5 rounded-3xl opacity-60" style={{
                    background: `linear-gradient(135deg, ${accent}80, rgba(139,92,246,0.5))`,
                  }} />
                  {store.logoUrl ? (
                    <img
                      src={store.logoUrl}
                      alt={store.name}
                      className="relative w-32 h-32 rounded-2xl object-cover shadow-2xl"
                      style={{ boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 0 2px rgba(255,255,255,0.15)` }}
                    />
                  ) : (
                    <div
                      className="relative w-32 h-32 rounded-2xl flex items-center justify-center shadow-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${accent}dd, #7c3aed)`,
                        boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 2px rgba(255,255,255,0.15)"
                      }}
                    >
                      <span className="text-5xl font-black text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        {store.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {store.isActive && (
                    <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border"
                      style={{ background: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.35)", color: "#34d399" }}>
                      <BadgeCheck className="w-3 h-3" /> Tienda verificada
                    </span>
                  )}
                  {storeRating !== null && storeRating >= 4.5 && (
                    <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border"
                      style={{ background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)", color: "#fbbf24" }}>
                      🏆 Top tienda
                    </span>
                  )}
                  {store.city && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border border-white/10 text-white/60 bg-white/[0.05]">
                      <MapPin className="w-3 h-3" /> {store.city}
                    </span>
                  )}
                </div>

                {/* Store name — premium typography */}
                <div>
                  <h1
                    className="font-black leading-none tracking-tight"
                    style={{
                      fontSize: "clamp(2rem, 6vw, 3.5rem)",
                      background: "linear-gradient(135deg, #ffffff 0%, #e2e8f0 40%, #94a3b8 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {store.name}
                  </h1>
                  <div className="flex justify-center mt-2">
                    <div className="h-0.5 w-16 rounded-full" style={{
                      background: `linear-gradient(90deg, transparent, ${accent}, #8B5CF6, transparent)`
                    }} />
                  </div>
                </div>

                {/* Tagline */}
                {store.tagline && (
                  <p className="text-sm font-semibold italic" style={{ color: `${accent}cc` }}>
                    "{store.tagline}"
                  </p>
                )}

                {/* Rating */}
                {storeRating !== null ? (
                  <div className="flex items-center gap-2">
                    <StarRow rating={storeRating} size="md" />
                    <span className="text-sm font-bold text-white">{storeRating}</span>
                    <span className="text-xs text-white/40">·</span>
                    <span className="text-xs text-white/60">{storeRatingCount} {storeRatingCount === 1 ? "calificación" : "calificaciones"}</span>
                  </div>
                ) : (
                  <p className="text-xs text-white/40 italic">Sin calificaciones aún</p>
                )}

                {/* Description */}
                {store.description && (
                  <p className="text-sm text-white/65 leading-relaxed max-w-md">{store.description}</p>
                )}

                {/* CTA row */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                  {/* Chat CTA — visible para todos; guest → login wall */}
                  {user?.id !== store.coHostId && (
                    <button
                      onClick={() => {
                        if (!user) { setShowLoginWall(true); return; }
                        navigate(`/store-chat/${store.id}`);
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-100"
                      style={{
                        background: `linear-gradient(135deg, ${accent}dd, ${accent}88)`,
                        boxShadow: `0 4px 20px ${accent}40`,
                        color: "#fff",
                      }}
                    >
                      <MessageCircle className="w-4 h-4" /> Contactar tienda
                    </button>
                  )}

                  {/* Seguir tienda */}
                  <button
                    onClick={() => setFollowing(f => !f)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-100 border"
                    style={following ? {
                      background: `${accent}22`,
                      borderColor: `${accent}55`,
                      color: accent,
                    } : {
                      background: "rgba(255,255,255,0.06)",
                      borderColor: "rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {following ? <BadgeCheck className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
                    {following ? "Siguiendo" : "Seguir tienda"}
                  </button>

                  {/* Ver ofertas — scroll to products */}
                  <button
                    onClick={() => document.getElementById("store-products")?.scrollIntoView({ behavior: "smooth" })}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-100 border border-white/10 bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.1]"
                  >
                    <ShoppingBag className="w-4 h-4" /> Ver ofertas
                  </button>
                </div>

              </div>

              {/* ─── Stats bar ─── */}
              <div className="relative z-10 mx-4 mb-4 rounded-2xl overflow-hidden border border-white/[0.08]"
                style={{ background: "rgba(15,20,35,0.75)", backdropFilter: "blur(16px)" }}>
                <div className="flex divide-x divide-white/[0.08]">
                  {[
                    { value: activeProducts.length, label: "Productos", color: accent },
                    { value: deliveryCount, label: "Con delivery", color: "#34d399" },
                    { value: newCount, label: "Nuevos", color: "#a78bfa" },
                    { value: deliveredCount, label: "Ventas", color: "#fbbf24" },
                  ].map(stat => (
                    <div key={stat.label} className="flex-1 py-3 text-center">
                      <p className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</p>
                      <p className="text-[10px] text-white/35 font-medium mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ─── Trust strip ─── */}
              <div className="relative z-10 flex items-center justify-center gap-4 px-4 pb-4">
                {[
                  { Icon: Lock, label: "Pago protegido" },
                  { Icon: Shield, label: "Compra garantizada" },
                  { Icon: RotateCcw, label: "Devolución segura" },
                ].map(({ Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-[11px] text-white/40">
                    <Icon className="w-3 h-3 text-emerald-400/70" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>

            </div>
            )} {/* end sections.hero */}

            {/* ─── Sobre la tienda ──────────────────────────────────────── */}
            {(store.description || store.city || store.whatsapp || store.instagram) && (
              <div className="mx-4 md:mx-6 my-4 rounded-2xl overflow-hidden border border-white/[0.07]"
                style={{ background: "rgba(255,255,255,0.03)" }}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/[0.04] transition-colors"
                  onClick={() => setAboutOpen(o => !o)}
                >
                  <span className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-primary" />
                    Sobre la tienda
                  </span>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${aboutOpen ? "rotate-90" : ""}`} />
                </button>
                {aboutOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
                    {store.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{store.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {store.city && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 text-primary/70" /> {store.city}
                        </span>
                      )}
                      {store.whatsapp && (
                        <a
                          href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-emerald-400 hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                        </a>
                      )}
                      {store.instagram && (
                        <a
                          href={`https://instagram.com/${store.instagram}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-pink-400 hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> @{store.instagram}
                        </a>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground/50">
                      Tienda activa desde {new Date(store.createdAt).toLocaleDateString("es-VE", { month: "long", year: "numeric" })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── Video de Marca — controlled by builderConfig.sections.video ── */}
            {sections.video && builderVideoUrl && (
              <div className="mx-4 md:mx-6 my-4 rounded-2xl overflow-hidden border border-white/[0.07]"
                style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}22` }}>
                    <Zap className="w-3.5 h-3.5" style={{ color: accent }} />
                  </div>
                  <span className="text-sm font-bold text-foreground">Video de {store.name}</span>
                </div>
                <div className="relative mx-4 mb-4 rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%", height: 0 }}>
                  <iframe
                    src={builderVideoUrl.includes("youtu") ? builderVideoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/") : builderVideoUrl}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={`Video de ${store.name}`}
                  />
                </div>
              </div>
            )}

            {/* ─── Carousel Destacado — controlled by builderConfig.sections.carousel ── */}
            {sections.carousel && activeProducts.length > 0 && (
              <div className="my-4">
                <div className="px-4 md:px-6 flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}22` }}>
                    <Zap className="w-3.5 h-3.5" style={{ color: accent }} />
                  </div>
                  <span className="text-sm font-bold text-foreground">Productos Destacados</span>
                  <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: `${accent}18`, color: accent }}>
                    ✨ Selección especial
                  </div>
                </div>
                <div className="flex gap-3 overflow-x-auto px-4 md:px-6 pb-3 snap-x snap-mandatory"
                  style={{ scrollbarWidth: "none" }}>
                  {activeProducts.slice(0, 8).map(product => {
                    const img = getGallery(product)[0];
                    return (
                      <div key={product.id}
                        onClick={() => setModalProduct(product)}
                        className="flex-shrink-0 snap-start w-36 rounded-2xl overflow-hidden cursor-pointer group transition-transform hover:scale-105"
                        style={{ border: `1px solid ${accent}25`, background: "rgba(255,255,255,0.04)" }}>
                        <div className="w-full aspect-square bg-black/20 overflow-hidden">
                          {img ? (
                            <img src={img} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-8 h-8 text-white/10" />
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-[11px] font-bold text-foreground truncate">{product.name}</p>
                          <p className="text-[11px] font-black mt-0.5" style={{ color: accent }}>${product.priceUsd.toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Search + Filter ──────────────────────────────────────── */}
            <div id="store-products" className="px-4 py-4 md:px-6 space-y-3 border-b border-white/[0.06]">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={`Buscar en ${store.name}...`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category chips */}
              {uniqueCategories.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {uniqueCategories.map(c => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                        category === c
                          ? "bg-primary text-white shadow-sm shadow-primary/30"
                          : "bg-white/[0.05] border border-white/[0.08] text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c === "todos" ? `Todos (${activeProducts.length})` : `${c} (${activeProducts.filter(p => p.category === c).length})`}
                    </button>
                  ))}
                </div>
              )}

              {!loading && (
                <p className="text-xs text-muted-foreground">
                  {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
                  {search && ` para "${search}"`}
                </p>
              )}
            </div>

            {/* ─── Products Grid ────────────────────────────────────────── */}
            <div className="px-4 py-5 md:px-6">
              {filtered.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Package className="w-8 h-8 text-muted-foreground opacity-40" />
                  </div>
                  <p className="font-semibold text-foreground">Sin productos</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {search ? `No se encontraron resultados para "${search}"` : "No hay productos en esta categoría"}
                  </p>
                  {search && (
                    <button onClick={() => setSearch("")} className="mt-4 text-sm text-primary hover:underline">Limpiar búsqueda</button>
                  )}
                </div>
              ) : (
                <div className={`grid gap-5 ${filtered.length === 1 ? "grid-cols-1 max-w-sm" : filtered.length === 2 ? "grid-cols-2 max-w-xl" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
                  {(() => {
                    const withRatings = filtered.filter(p => p.countProductRatings > 0);
                    const topSellerId = withRatings.length > 0
                      ? withRatings.reduce((a, b) => b.countProductRatings > a.countProductRatings ? b : a).id
                      : null;
                    const bestRatedId = withRatings.length > 0
                      ? withRatings.reduce((a, b) => (b.avgProductRating ?? 0) > (a.avgProductRating ?? 0) ? b : a).id
                      : null;
                    return filtered.slice(0, visibleCount).map(product => {
                    const isSuccess = successId === product.id;
                    const productRating = product.avgProductRating ? +Number(product.avgProductRating).toFixed(1) : null;
                    const productRatingCount = +product.countProductRatings || 0;
                    const priceVes = +(product.priceUsd * bcvRate).toFixed(0);
                    const isTopSeller = product.id === topSellerId;
                    const isBestRated = product.id === bestRatedId && +(product.avgProductRating ?? 0) >= 4.0;

                    return (
                      <div
                        key={product.id}
                        className="glass rounded-2xl overflow-hidden flex flex-col group hover:ring-1 hover:ring-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all cursor-pointer"
                        onClick={() => setModalProduct(product)}
                      >
                        {/* Image — 1:1 */}
                        <div className="aspect-square bg-[#0e0f14] flex items-center justify-center overflow-hidden relative flex-shrink-0 w-full rounded-t-2xl shadow-sm">
                          {getGallery(product)[0] ? (
                            <LazyImg src={getGallery(product)[0]} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <Package className="w-12 h-12 text-white/10" />
                          )}
                          {/* Multi-image count badge */}
                          {getGallery(product).length > 1 && (
                            <div className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Eye className="w-2.5 h-2.5" /> {getGallery(product).length}
                            </div>
                          )}
                          {/* Conversion badges — top right */}
                          <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                            {isTopSeller && (
                              <span className="text-[9px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold shadow-md">🔥 Más vendido</span>
                            )}
                            {isBestRated && !isTopSeller && (
                              <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold shadow-md">⭐ Mejor valorado</span>
                            )}
                          </div>
                          {/* Bottom badges */}
                          <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${product.condition === "new" ? "bg-emerald-500/85 text-white" : "bg-amber-500/85 text-white"}`}>
                              {product.condition === "new" ? "Nuevo" : "Usado"}
                            </span>
                            {product.hasDelivery && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/85 text-white flex items-center gap-0.5">
                                <Truck className="w-2 h-2" /> Delivery
                              </span>
                            )}
                            {product.stock != null && product.stock > 0 && product.stock <= 5 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/85 text-white font-bold">¡Solo {product.stock}!</span>
                            )}
                          </div>
                        </div>

                        <div className="p-3 flex flex-col flex-1">
                          <h3 className="font-bold text-foreground text-xs leading-tight mb-1 line-clamp-2">{product.name}</h3>

                          {/* Stars */}
                          <div className="flex items-center gap-1.5 mb-2">
                            {productRating !== null ? (
                              <>
                                <StarRow rating={productRating} size="md" />
                                <span className="text-xs text-amber-400 font-bold">{productRating}</span>
                                <span className="text-[10px] text-muted-foreground">({productRatingCount} {productRatingCount === 1 ? "venta" : "ventas"})</span>
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/50 italic">Sin calif.</span>
                            )}
                          </div>

                          {/* Price */}
                          <div className="mt-auto">
                            <div className="flex items-baseline gap-1 mb-2">
                              <span className="text-base font-black text-foreground">${product.priceUsd.toFixed(2)}</span>
                              <span className="text-[9px] text-muted-foreground">USD</span>
                            </div>
                            <p className="text-xs text-emerald-400 font-semibold mb-2">Bs. {priceVes.toLocaleString("es-VE")}</p>

                            {canBuy ? (
                              isSuccess ? (
                                <div className="w-full py-2 rounded-xl bg-emerald-400/15 text-emerald-400 text-[11px] font-bold flex items-center justify-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> Pedido enviado
                                </div>
                              ) : (
                                <button
                                  onClick={e => { e.stopPropagation(); setModalProduct(product); }}
                                  className="w-full py-2 rounded-xl btn-gradient text-white text-[11px] font-bold flex items-center justify-center gap-1.5 hover:shadow-lg hover:shadow-primary/20 transition-all"
                                >
                                  <ShoppingBag className="w-3 h-3" /> Comprar ahora
                                </button>
                              )
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); setModalProduct(product); }}
                                className="w-full py-2 rounded-xl border border-white/10 text-muted-foreground text-[11px] hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Eye className="w-3 h-3" /> Ver detalles
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                  })()}
                </div>
              )}
              {filtered.length > visibleCount && (
                <div ref={sentinelRef} className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* ─── Testimonios / Valoraciones — controlled by builderConfig.sections.testimonials ── */}
            {sections.testimonials && (() => {
              const ratedProducts = activeProducts.filter(p => p.countProductRatings > 0 && p.avgProductRating);
              if (ratedProducts.length === 0) return null;
              return (
                <div className="mx-4 md:mx-6 my-6 space-y-3">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}22` }}>
                      <Star className="w-3.5 h-3.5" style={{ color: accent }} />
                    </div>
                    <span className="text-sm font-bold text-foreground">Lo que dicen nuestros clientes</span>
                    {storeRating !== null && (
                      <span className="ml-auto text-xs font-black" style={{ color: accent }}>⭐ {storeRating} promedio</span>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ratedProducts.slice(0, 4).map(product => {
                      const rating = +Number(product.avgProductRating).toFixed(1);
                      const count = +product.countProductRatings;
                      return (
                        <div key={product.id}
                          className="rounded-2xl p-4 cursor-pointer hover:ring-1 transition-all"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", ["--tw-ring-color" as string]: `${accent}50` }}
                          onClick={() => setModalProduct(product)}>
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-black/20 relative">
                              {getGallery(product)[0] ? (
                                <LazyImg src={getGallery(product)[0]} alt={product.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-5 h-5 text-white/10" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">{product.name}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <StarRow rating={rating} size="sm" />
                                <span className="text-[11px] font-black text-amber-400">{rating}</span>
                                <span className="text-[10px] text-muted-foreground">· {count} {count === 1 ? "compra" : "compras"}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          </>
        )}
      </div>

      {/* ─── Product Modal ────────────────────────────────────────────── */}
      {modalProduct && (
        <ProductModal
          product={modalProduct}
          bcvRate={bcvRate}
          storeId={store!.id}
          storeName={store!.name}
          onClose={() => setModalProduct(null)}
          onSuccess={handleSuccess}
        />
      )}

      {/* Login wall — guests who click "Contactar tienda" */}
      <LoginWallModal
        open={showLoginWall}
        onClose={() => setShowLoginWall(false)}
        context="chat"
      />
    </PublicShell>
  );
}
