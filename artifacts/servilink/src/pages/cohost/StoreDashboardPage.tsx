import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  Store, Package, ShoppingBag, DollarSign, TrendingUp, CheckCircle,
  ArrowLeft, Wallet, ArrowDownToLine, Loader2, BarChart3,
  User, MapPin, ChevronDown, ChevronUp, Plus, X, Image, Edit3,
  ToggleLeft, ToggleRight, Tag, KeyRound, Users, FileUp,
} from "lucide-react";
import { ManagersPanel } from "@/components/managers/ManagersPanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { useStoreDetail, useStoreOrders, useRequestStoreWithdrawal } from "@/hooks/cohost";
import { SkeletonCard, SkeletonStats, QueryError } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/use-toast";
import { mediaSrc } from "@/lib/media-url";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", accepted: "Aceptado", payment_pending: "Verificando pago",
  payment_confirmed: "Pago confirmado", dispatched: "En camino",
  delivered: "Entregado ✓", cancelled: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-400/20 text-amber-400", accepted: "bg-orange-400/20 text-orange-400",
  payment_pending: "bg-cyan-400/20 text-cyan-400", payment_confirmed: "bg-teal-400/20 text-teal-400",
  dispatched: "bg-violet-400/20 text-violet-400", delivered: "bg-emerald-400/20 text-emerald-400",
  cancelled: "bg-red-400/20 text-red-400",
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pago_movil: "📱 Pago Móvil", zelle: "💵 Zelle", paypal: "🅿 PayPal",
  transferencia: "🏦 Transferencia", binance: "🟡 Binance",
};

const CATEGORIES = [
  "Electrónica", "Ropa y Accesorios", "Hogar y Jardín", "Alimentos", "Salud y Belleza",
  "Deportes", "Juguetes", "Libros", "Automóviles", "Servicios", "Otros",
];

const CONDITIONS = [
  { id: "new", label: "Nuevo" },
  { id: "used", label: "Usado" },
  { id: "refurbished", label: "Reacondicionado" },
];

const inputStyle = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px", padding: "10px 12px", fontSize: "14px",
  color: "var(--foreground)", outline: "none", width: "100%",
} as React.CSSProperties;

// ServiRent sub-type definitions
const RENTAL_SUBTYPES = [
  { id: "tool",       label: "Objeto / Herramienta", icon: "🔧", desc: "Equipos, herramientas, electrónica, vehículos menores" },
  { id: "vehicle",    label: "Vehículo",              icon: "🚗", desc: "Carros, motos, bicicletas, lanchas" },
  { id: "property",   label: "Propiedad",             icon: "🏠", desc: "Apartamentos, casas, habitaciones, locales" },
  { id: "experience", label: "Experiencia",           icon: "🛥️", desc: "Tours, paseos, actividades, eventos" },
] as const;
const SALE_SUBTYPES = [
  { id: "general",  label: "Producto general", icon: "📦", desc: "Cualquier artículo nuevo o usado a la venta" },
  { id: "vehicle",  label: "Vehículo",          icon: "🚗", desc: "Carros, motos y más — con datos técnicos" },
  { id: "property", label: "Propiedad",         icon: "🏠", desc: "Inmuebles con m², habitaciones y baños" },
] as const;

interface ProductForm {
  name: string; description: string; priceUsd: string;
  category: string; condition: string; hasDelivery: boolean;
  stock: string; images: string[];
  listingType: "sale" | "rental";
  rentalPricePerDay: string; rentalPricePerWeek: string;
  rentalDeposit: string; rentalRules: string;
  // ServiRent sub-types
  rentalType: "tool" | "vehicle" | "property" | "experience";
  productType: "general" | "vehicle" | "property";
  // Type-specific extra fields (flattened, serialised to JSON on save)
  metaBrand: string; metaModel: string; metaYear: string; metaKm: string;    // vehicle
  metaSqm: string; metaBedrooms: string; metaBathrooms: string;              // property
  metaGuests: string; metaHouseRules: string;                                // rental property
  metaDuration: string; metaCapacity: string; metaIncludes: string;          // experience
  metaTransmission: string; metaLicense: string;                             // rental vehicle
}
const emptyProduct: ProductForm = {
  name: "", description: "", priceUsd: "", category: "Otros",
  condition: "new", hasDelivery: false, stock: "", images: [],
  listingType: "sale", rentalPricePerDay: "", rentalPricePerWeek: "",
  rentalDeposit: "", rentalRules: "",
  rentalType: "tool", productType: "general",
  metaBrand: "", metaModel: "", metaYear: "", metaKm: "",
  metaSqm: "", metaBedrooms: "", metaBathrooms: "",
  metaGuests: "", metaHouseRules: "",
  metaDuration: "", metaCapacity: "", metaIncludes: "",
  metaTransmission: "", metaLicense: "",
};

function useStoreProducts(storeId: number) {
  return useQuery({
    queryKey: ["store-products", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/stores/${storeId}/products`, { headers: getAuthHeader() });
      if (!r.ok) throw new Error("Error al cargar productos");
      return r.json();
    },
    enabled: storeId > 0,
  });
}

export function StoreDashboardPage() {
  const params = useParams<{ storeId: string }>();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const isSeller = user?.role === "seller";
  const storeId = parseInt(params.storeId ?? "0");
  const qc = useQueryClient();

  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  // Read initial tab from `?tab=` so deep-links from ManagerDashboard land on the right view.
  const initialTab = (() => {
    if (typeof window === "undefined") return "overview" as const;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "orders" || t === "products" || t === "team") return t;
    return "overview" as const;
  })();
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "products" | "team">(initialTab);
  const [withdrawDone, setWithdrawDone] = useState(false);

  // Product form state
  const [showProductForm, setShowProductForm] = useState(false);
  const [formStep, setFormStep] = useState<"type_selector" | "sub_type" | "form">("type_selector");
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [productError, setProductError] = useState("");
  const [productSaving, setProductSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<number | null>(null);

  const { data: store, isLoading: storeLoading, isError: storeError, refetch } = useStoreDetail(storeId);
  // Backend-provided permission flags (set in GET /api/stores/:id). Owners /
  // admins implicitly hold every permission; managers carry an explicit map.
  const isOwner = !!(store as any)?._isOwner;
  const userPerms = (store as any)?._userPermissions ?? {
    canChat: true, canManageOrders: true, canManageProducts: true, canManageServices: true,
  };
  // Normalize tab against permissions so deep-links cannot bypass the UI.
  const isAllowedTab = (t: string): t is "overview" | "orders" | "products" | "team" => {
    if (t === "overview" || t === "products") return true;
    if (t === "orders") return isOwner || !!userPerms.canManageOrders;
    if (t === "team") return isOwner;
    return false;
  };
  // Reactive guard: if active tab becomes invalid (permission change, deep-link,
  // or click on a tab that should not have been clickable), bounce to overview.
  useEffect(() => {
    if (!store) return;
    if (!isAllowedTab(activeTab)) {
      setActiveTab("overview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, isOwner, userPerms.canManageOrders, activeTab]);

  // Safe setter so any future call site cannot land on a forbidden tab.
  const safeSetActiveTab = (t: "overview" | "orders" | "products" | "team") => {
    if (isAllowedTab(t)) setActiveTab(t);
    else setActiveTab("overview");
  };

  // Sync tab on deep-link / wouter navigation, validated against permissions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!store) return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && isAllowedTab(t) && t !== activeTab) {
      setActiveTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.storeId, location, store]);

  const shouldFetchOrders = (isOwner || !!userPerms.canManageOrders) && (isOwner || activeTab === "orders");
  const { data: orders = [], isLoading: ordersLoading, isError: ordersError } = useStoreOrders(shouldFetchOrders ? storeId : 0);
  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useStoreProducts(storeId);
  const requestWithdrawal = useRequestStoreWithdrawal();

  const pf = (key: keyof ProductForm, val: any) => setProductForm(p => ({ ...p, [key]: val }));

  const closeProductForm = () => {
    setShowProductForm(false);
    setProductError("");
    setFormStep("type_selector");
  };

  const openCreateProduct = () => {
    setEditingProductId(null);
    setProductForm(emptyProduct);
    setProductError("");
    setFormStep("type_selector");
    setShowProductForm(true);
  };
  const openEditProduct = (p: any) => {
    setEditingProductId(p.id);
    // Parse stored metadata JSON blobs back to flat fields
    let rm: Record<string, string> = {};
    let pm: Record<string, string> = {};
    try { rm = p.rentalMetadata ? JSON.parse(p.rentalMetadata) : {}; } catch { rm = {}; }
    try { pm = p.productMetadata ? JSON.parse(p.productMetadata) : {}; } catch { pm = {}; }
    setProductForm({
      name: p.name ?? "", description: p.description ?? "",
      priceUsd: String(p.priceUsd ?? ""), category: p.category ?? "Otros",
      condition: p.condition ?? "new", hasDelivery: p.hasDelivery ?? false,
      stock: p.stock != null ? String(p.stock) : "", images: p.images ?? (p.image ? [p.image] : []),
      listingType: p.listingType === "rental" ? "rental" : "sale",
      rentalPricePerDay: p.rentalPricePerDay != null ? String(p.rentalPricePerDay) : "",
      rentalPricePerWeek: p.rentalPricePerWeek != null ? String(p.rentalPricePerWeek) : "",
      rentalDeposit: p.rentalDeposit != null ? String(p.rentalDeposit) : "",
      rentalRules: p.rentalRules ?? "",
      rentalType: (p.rentalType as any) ?? "tool",
      productType: (p.productType as any) ?? "general",
      metaBrand: rm.brand ?? pm.brand ?? "",
      metaModel: rm.model ?? pm.model ?? "",
      metaYear: rm.year ?? pm.year ?? "",
      metaKm: rm.km ?? pm.km ?? "",
      metaSqm: rm.sqm ?? pm.sqm ?? "",
      metaBedrooms: rm.bedrooms ?? pm.bedrooms ?? "",
      metaBathrooms: rm.bathrooms ?? pm.bathrooms ?? "",
      metaGuests: rm.guests ?? "",
      metaHouseRules: rm.houseRules ?? "",
      metaDuration: rm.duration ?? "",
      metaCapacity: rm.capacity ?? "",
      metaIncludes: rm.includes ?? "",
      metaTransmission: rm.transmission ?? "",
      metaLicense: rm.license ?? "",
    });
    setProductError("");
    setFormStep("form");
    setShowProductForm(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) { setProductError("Imagen Máx. 18 MB"); return; }
    setImageUploading(true);
    try {
      const r = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!r.ok) throw new Error();
      const { uploadURL, objectPath } = await r.json();
      const up = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!up.ok) throw new Error();
      const url = mediaSrc(objectPath);
      pf("images", [...productForm.images, url]);
    } catch { setProductError("Error al subir imagen"); }
    finally { setImageUploading(false); if (imageRef.current) imageRef.current.value = ""; }
  };

  const handleSaveProduct = async () => {
    const isRental = productForm.listingType === "rental";

    if (productForm.images.length === 0) {
      setProductError("Debes agregar al menos una imagen"); return;
    }
    if (!productForm.name.trim() || !productForm.category) {
      setProductError("Nombre y categoría son requeridos"); return;
    }
    if (isRental) {
      if (!productForm.rentalPricePerDay) {
        setProductError("El precio por día es requerido para productos de alquiler"); return;
      }
    } else {
      if (!productForm.priceUsd) {
        setProductError("El precio de venta es requerido"); return;
      }
    }

    setProductError("");
    setProductSaving(true);
    try {
      // For rentals: use rentalPricePerDay as the reference price (shown in catalog)
      const effectivePriceUsd = isRental
        ? parseFloat(productForm.rentalPricePerDay)
        : parseFloat(productForm.priceUsd);

      // Build metadata JSON blobs from flat form fields
      const buildRentalMeta = () => {
        const rt = productForm.rentalType;
        if (rt === "vehicle") return JSON.stringify({ brand: productForm.metaBrand, model: productForm.metaModel, year: productForm.metaYear, km: productForm.metaKm, transmission: productForm.metaTransmission, license: productForm.metaLicense });
        if (rt === "property") return JSON.stringify({ sqm: productForm.metaSqm, bedrooms: productForm.metaBedrooms, bathrooms: productForm.metaBathrooms, guests: productForm.metaGuests, houseRules: productForm.metaHouseRules });
        if (rt === "experience") return JSON.stringify({ duration: productForm.metaDuration, capacity: productForm.metaCapacity, includes: productForm.metaIncludes });
        return null;
      };
      const buildProductMeta = () => {
        const pt = productForm.productType;
        if (pt === "vehicle") return JSON.stringify({ brand: productForm.metaBrand, model: productForm.metaModel, year: productForm.metaYear, km: productForm.metaKm });
        if (pt === "property") return JSON.stringify({ sqm: productForm.metaSqm, bedrooms: productForm.metaBedrooms, bathrooms: productForm.metaBathrooms });
        return null;
      };

      const body = {
        name: productForm.name, description: productForm.description || null,
        priceUsd: effectivePriceUsd, category: productForm.category,
        condition: productForm.condition, hasDelivery: productForm.hasDelivery,
        stock: productForm.stock ? parseInt(productForm.stock) : null,
        images: productForm.images, storeId,
        listingType: productForm.listingType,
        rentalPricePerDay: productForm.rentalPricePerDay ? parseFloat(productForm.rentalPricePerDay) : null,
        rentalPricePerWeek: productForm.rentalPricePerWeek ? parseFloat(productForm.rentalPricePerWeek) : null,
        rentalDeposit: productForm.rentalDeposit ? parseFloat(productForm.rentalDeposit) : null,
        rentalRules: productForm.rentalRules || null,
        rentalType: productForm.rentalType,
        productType: productForm.productType,
        rentalMetadata: isRental ? buildRentalMeta() : null,
        productMetadata: !isRental ? buildProductMeta() : null,
      };
      const url = editingProductId ? `/api/products/${editingProductId}` : "/api/products";
      const method = editingProductId ? "PUT" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Error"); }
      toast({ title: editingProductId ? "Producto actualizado" : "Producto creado" });
      setShowProductForm(false);
      qc.invalidateQueries({ queryKey: ["store-products", storeId] });
      qc.invalidateQueries({ queryKey: ["store-detail", storeId] });
    } catch (err: any) { setProductError(err.message ?? "Error al guardar"); }
    finally { setProductSaving(false); }
  };

  const handleToggleActive = async (p: any) => {
    try {
      const r = await fetch(`/api/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!r.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["store-products", storeId] });
      qc.invalidateQueries({ queryKey: ["store-detail", storeId] });
    } catch { toast({ title: "Error al cambiar estado", variant: "destructive" }); }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      const r = await fetch(`/api/products/${id}`, { method: "DELETE", headers: getAuthHeader() });
      if (!r.ok) throw new Error();
      toast({ title: "Producto desactivado" });
      setConfirmDeleteProductId(null);
      qc.invalidateQueries({ queryKey: ["store-products", storeId] });
      qc.invalidateQueries({ queryKey: ["store-detail", storeId] });
    } catch { toast({ title: "Error al eliminar", variant: "destructive" }); }
  };

  const handleWithdrawal = () => {
    if (!store || store.balanceUsd <= 0) return;
    requestWithdrawal.mutate(storeId, { onSuccess: () => setWithdrawDone(true) });
  };

  if (storeLoading || ordersLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] animate-pulse flex-shrink-0" />
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] animate-pulse flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-5 w-32 bg-white/[0.06] rounded animate-pulse" />
              <div className="h-3 w-20 bg-white/[0.06] rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="space-y-2">
            <div className="h-3 w-28 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-9 w-40 bg-white/[0.06] rounded animate-pulse" />
          </div>
          <div className="h-10 rounded-xl bg-white/[0.06] animate-pulse" />
        </div>
        <SkeletonStats cols={4} />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (storeError || !store) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        <button onClick={() => navigate("/cohost/stores")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver a tiendas
        </button>
        <QueryError message="No se pudo cargar la tienda" onRetry={() => refetch()} />
      </div>
    );
  }

  const paymentDetails = store.paymentDetails ? JSON.parse(store.paymentDetails) : null;
  const allOrders = orders as any[];
  const allProducts = products as any[];
  const platformEarnings = +(allOrders.filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + (o.platformCommissionAmt ?? 0), 0)).toFixed(2);
  const myEarnings = +(allOrders.filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + (o.cohostCommissionAmt ?? 0), 0)).toFixed(2);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/cohost/stores")} className="w-9 h-9 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {store.logoUrl ? (
            <img src={store.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl glass flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{store.name}</h1>
            <p className="text-xs text-muted-foreground">{store.ownerName}</p>
          </div>
        </div>
      </div>

      {/* Balance card */}
      {isOwner && (
        <div className="glass rounded-2xl p-5 bg-gradient-to-br from-primary/10 to-violet-500/10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Saldo disponible</p>
              <p className="text-3xl font-black text-foreground mt-1">${store.balanceUsd.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isSeller
                  ? `Fee de venta: ${store.platformCommissionPct}%`
                  : `Plataforma: ${store.platformCommissionPct}% · Tu comisión: ${store.cohostCommissionPct}%`}
              </p>
            </div>
            <Wallet className="w-8 h-8 text-primary opacity-60 flex-shrink-0" />
          </div>
          {withdrawDone ? (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-400/20 text-emerald-400 text-sm">
              <CheckCircle className="w-4 h-4" /> Solicitud enviada — el admin procesará el pago
            </div>
          ) : (
            <button
              onClick={handleWithdrawal}
              disabled={requestWithdrawal.isPending || store.balanceUsd <= 0}
              className="mt-4 w-full py-2.5 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {requestWithdrawal.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><ArrowDownToLine className="w-4 h-4" /> Solicitar retiro</>}
            </button>
          )}
          {store.balanceUsd <= 0 && !withdrawDone && (
            <p className="text-center text-xs text-muted-foreground mt-2">No hay saldo para retirar aún</p>
          )}
          {paymentDetails && store.paymentMethod && (
            <div className="mt-3 text-xs text-muted-foreground">
              Retiro via {PAYMENT_METHOD_LABELS[store.paymentMethod] ?? store.paymentMethod}
            </div>
          )}
        </div>
      )}

      {/* Tabs — "Pedidos" requiere canManageOrders, "Gestores" sólo dueño/admin */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "overview" as const, label: "Panel", icon: BarChart3 },
          { key: "products" as const, label: "Productos", icon: Package },
          ...((isOwner || userPerms.canManageOrders) ? [{ key: "orders" as const, label: "Pedidos", icon: ShoppingBag }] : []),
          ...(isOwner ? [{ key: "team" as const, label: "Gestores", icon: Users }] : []),
        ].map(t => (
          <button
            key={t.key}
            onClick={() => safeSetActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === t.key ? "bg-foreground text-background" : "glass text-muted-foreground hover:text-foreground"}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Productos activos", value: store.activeProductCount, icon: Package, color: "text-blue-400" },
              { label: "Ventas totales", value: store.orderStats?.delivered ?? 0, icon: CheckCircle, color: "text-emerald-400" },
              { label: "Ingresos tienda", value: `$${store.storeEarningsUsd?.toFixed(0) ?? "0"}`, icon: TrendingUp, color: "text-primary" },
              {
                label: isSeller ? "Tu ingreso neto" : "Mis ganancias",
                value: isSeller ? `$${store.storeEarningsUsd?.toFixed(2) ?? "0.00"}` : `$${myEarnings.toFixed(2)}`,
                icon: DollarSign,
                color: isSeller ? "text-emerald-400" : "text-violet-400",
              },
            ].map(s => (
              <div key={s.label} className="glass rounded-xl p-3 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                <div className="text-lg font-bold text-foreground">{s.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="glass rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Pedidos por estado</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "pending", label: "Pendientes", color: "text-amber-400" },
                { key: "payment_pending", label: "Verificando pago", color: "text-cyan-400" },
                { key: "payment_confirmed", label: "Pago OK", color: "text-teal-400" },
                { key: "dispatched", label: "En camino", color: "text-violet-400" },
                { key: "delivered", label: "Entregados", color: "text-emerald-400" },
                { key: "cancelled", label: "Cancelados", color: "text-red-400" },
              ].map(s => (
                <div key={s.key} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03]">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <span className={`text-sm font-bold ${s.color}`}>{(store.orderStats as any)?.[s.key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          {!isSeller && (
            <div className="glass rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Distribución de comisiones</h3>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Plataforma ({store.platformCommissionPct}%)</span>
                  <span className="font-medium text-foreground">${platformEarnings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Host ({store.cohostCommissionPct}%)</span>
                  <span className="font-medium text-foreground">${myEarnings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-white/[0.06] pt-1.5">
                  <span>Tienda ({100 - store.platformCommissionPct - store.cohostCommissionPct}%)</span>
                  <span className="font-semibold text-emerald-400">${store.storeEarningsUsd?.toFixed(2) ?? "0.00"}</span>
                </div>
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Información del dueño</h3>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><User className="w-3 h-3" /> {store.ownerName}</div>
              {store.ownerPhone && <div className="flex items-center gap-2"><span>📱</span> {store.ownerPhone}</div>}
              {store.ownerCedula && <div className="flex items-center gap-2"><span>🪪</span> {store.ownerCedula}</div>}
              {store.paymentMethod && (
                <div className="flex items-center gap-2">
                  <ArrowDownToLine className="w-3 h-3" />
                  Retiro: {PAYMENT_METHOD_LABELS[store.paymentMethod] ?? store.paymentMethod}
                  {paymentDetails && <span className="text-foreground/50">· {Object.values(paymentDetails).join(" / ")}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Products tab ── */}
      {activeTab === "products" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {allProducts.length} producto{allProducts.length !== 1 ? "s" : ""} en esta tienda
            </p>
            {(isOwner || userPerms.canManageProducts) && (
              <div className="flex items-center gap-2">
                {isOwner && (
                  <button
                    onClick={() => navigate(`/enterprise/import?storeId=${storeId}`)}
                    className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
                    style={{
                      background: "rgba(6,182,212,0.10)",
                      border: "1px solid rgba(6,182,212,0.35)",
                      color: "rgb(165,243,252)",
                    }}
                    title="Sube un archivo CSV o Excel para crear productos masivamente"
                  >
                    <FileUp className="w-4 h-4" /> Importar productos en masa
                  </button>
                )}
                <button
                  onClick={openCreateProduct}
                  className="btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Nuevo producto
                </button>
              </div>
            )}
          </div>

          {productsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={2} />)}
            </div>
          ) : allProducts.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-foreground font-medium">No hay productos aún</p>
              <p className="text-sm text-muted-foreground mt-1">Agrega tu primer producto o sube tu catálogo completo en segundos</p>
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                <button onClick={openCreateProduct} className="btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Agregar producto
                </button>
                <button
                  data-testid="bulk-import-store-empty"
                  onClick={() => navigate(`/enterprise/import?storeId=${storeId}`)}
                  className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all"
                  style={{
                    background: "rgba(6,182,212,0.10)",
                    border: "1px solid rgba(6,182,212,0.35)",
                    color: "rgb(165,243,252)",
                  }}
                >
                  <FileUp className="w-4 h-4" /> Importar CSV / Excel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {allProducts.map((p: any) => {
                const coverImg = (p.images && p.images.length > 0) ? p.images[0] : p.image;
                return (
                  <div
                    key={p.id}
                    className="glass rounded-2xl p-4 flex items-center gap-3"
                    style={{ opacity: p.isActive ? 1 : 0.5 }}
                  >
                    <div className="w-14 h-14 rounded-xl bg-white/[0.06] overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {coverImg
                        ? <img src={coverImg} alt="" className="w-full h-full object-cover" />
                        : <Package className="w-6 h-6 text-muted-foreground opacity-40" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground text-sm truncate">{p.name}</h3>
                        {!p.isActive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-400/20 text-red-400">Inactivo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-sm font-bold text-emerald-400">${Number(p.priceUsd).toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Tag className="w-3 h-3" /> {p.category}
                        </span>
                        {p.stock != null && (
                          <span className="text-xs text-muted-foreground">Stock: {p.stock}</span>
                        )}
                      </div>
                    </div>
                    {(isOwner || userPerms.canManageProducts) && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleToggleActive(p)}
                          title={p.isActive ? "Desactivar" : "Activar"}
                          className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
                        >
                          {p.isActive
                            ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        <button
                          onClick={() => openEditProduct(p)}
                          title="Editar"
                          className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {confirmDeleteProductId === p.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="text-xs px-2 py-1 rounded-lg bg-red-400/20 text-red-400 hover:bg-red-400/30 transition-colors"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setConfirmDeleteProductId(null)}
                              className="text-xs px-2 py-1 rounded-lg glass text-muted-foreground"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteProductId(p.id)}
                            title="Eliminar"
                            className="p-2 rounded-xl bg-white/[0.06] hover:bg-red-400/20 text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Team (gestores) tab ── */}
      {activeTab === "team" && (
        <ManagersPanel storeId={storeId} storeName={store.name} />
      )}

      {/* ── Orders tab ── */}
      {activeTab === "orders" && (
        <div className="space-y-3">
          {ordersError ? (
            <div className="glass rounded-2xl p-10 text-center">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-sm text-foreground font-medium">Sin permiso para ver pedidos</p>
              <p className="text-xs text-muted-foreground mt-1">Contacta al dueño de la tienda para solicitar acceso.</p>
            </div>
          ) : allOrders.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No hay pedidos aún</p>
            </div>
          ) : (
            allOrders.map((o: any) => {
              const isExpanded = expandedOrder === o.id;
              return (
                <div key={o.id} className="glass rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedOrder(isExpanded ? null : o.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{o.productName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[o.status] ?? "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <User className="w-3 h-3" /> {o.clientName ?? "Cliente"} · #{o.id}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 mr-1">
                      <div className="text-sm font-bold text-foreground">${o.priceUsdAtMoment.toFixed(2)}</div>
                      {o.storeEarningsAmt != null && <div className="text-xs text-emerald-400">+${o.storeEarningsAmt.toFixed(2)}</div>}
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-2 text-xs text-muted-foreground">
                      {o.deliveryAddress && <div className="flex items-start gap-1.5"><MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />{o.deliveryAddress}</div>}
                      {o.notes && <div className="bg-white/[0.04] rounded-lg px-2.5 py-2">{o.notes}</div>}
                      <div>Fecha: {new Date(o.createdAt).toLocaleString("es-VE")}</div>
                      {o.status === "delivered" && o.storeEarningsAmt != null && (
                        <div className="grid grid-cols-3 gap-2 mt-1 text-center">
                          <div className="bg-white/[0.04] rounded-lg p-2">
                            <div className="text-[10px]">Plataforma</div>
                            <div className="font-semibold text-foreground">${(o.platformCommissionAmt ?? 0).toFixed(2)}</div>
                          </div>
                          <div className="bg-white/[0.04] rounded-lg p-2">
                            <div className="text-[10px]">{isSeller ? "Fee venta" : "Host"}</div>
                            <div className="font-semibold text-foreground">${(o.cohostCommissionAmt ?? 0).toFixed(2)}</div>
                          </div>
                          <div className="bg-emerald-400/10 rounded-lg p-2">
                            <div className="text-[10px]">Tienda</div>
                            <div className="font-semibold text-emerald-400">${o.storeEarningsAmt.toFixed(2)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Product form modal ── */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: "90dvh" }}>

            {/* ── STEP 0: Type selector ─────────────────────────────────── */}
            {formStep === "type_selector" && (
              <>
                <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/[0.06]">
                  <h2 className="text-lg font-bold text-foreground">¿Qué quieres publicar?</h2>
                  <button onClick={closeProductForm} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/[0.06] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-6 py-6 space-y-3">
                  {/* Vender */}
                  <button
                    onClick={() => { pf("listingType", "sale"); pf("productType", "general"); setFormStep("sub_type"); }}
                    className="w-full flex items-start gap-4 p-5 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.25)" }}
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(6,182,212,0.15)" }}>
                      <ShoppingBag className="w-5 h-5" style={{ color: "#06B6D4" }} />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-base leading-tight">Vender producto</p>
                      <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Artículos nuevos / usados · vehículos · inmuebles · delivery opcional
                      </p>
                    </div>
                  </button>

                  {/* Alquilar */}
                  <button
                    onClick={() => { pf("listingType", "rental"); pf("rentalType", "tool"); setFormStep("sub_type"); }}
                    className="w-full flex items-start gap-4 p-5 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)" }}
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(139,92,246,0.15)" }}>
                      <KeyRound className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-base leading-tight">Alquilar</p>
                      <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Herramientas · vehículos · propiedades · experiencias por días
                      </p>
                    </div>
                  </button>
                </div>

                <div className="px-6 pb-5 flex-shrink-0 border-t border-white/[0.06] pt-4">
                  <button onClick={closeProductForm} className="w-full py-3 rounded-xl text-sm font-medium glass text-muted-foreground hover:text-foreground transition-colors">
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 1: Sub-type selector ────────────────────────────── */}
            {formStep === "sub_type" && (
              <>
                <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setFormStep("type_selector")}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors flex items-center gap-1"
                    >← Volver</button>
                    <h2 className="text-base font-bold text-foreground">
                      {productForm.listingType === "rental" ? "¿Qué quieres alquilar?" : "¿Qué quieres vender?"}
                    </h2>
                  </div>
                  <button onClick={closeProductForm} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/[0.06] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-2 overflow-y-auto">
                  {(productForm.listingType === "rental" ? RENTAL_SUBTYPES : SALE_SUBTYPES).map(st => {
                    const isRent = productForm.listingType === "rental";
                    const isSelected = isRent
                      ? productForm.rentalType === st.id
                      : productForm.productType === st.id;
                    return (
                      <button
                        key={st.id}
                        onClick={() => {
                          if (isRent) pf("rentalType", st.id); else pf("productType", st.id);
                          setFormStep("form");
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                        style={isSelected
                          ? { background: isRent ? "rgba(139,92,246,0.14)" : "rgba(6,182,212,0.12)", border: `1px solid ${isRent ? "rgba(139,92,246,0.4)" : "rgba(6,182,212,0.35)"}` }
                          : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                          style={{ background: isRent ? "rgba(139,92,246,0.12)" : "rgba(6,182,212,0.1)" }}>
                          {st.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-foreground leading-tight">{st.label}</p>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{st.desc}</p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: isRent ? "rgba(139,92,246,0.5)" : "rgba(6,182,212,0.5)" }}>
                            <span style={{ fontSize: 11, color: "#fff" }}>✓</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="px-6 pb-5 flex-shrink-0 border-t border-white/[0.06] pt-4">
                  <button onClick={closeProductForm} className="w-full py-3 rounded-xl text-sm font-medium glass text-muted-foreground hover:text-foreground transition-colors">
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 2: Form (fields depend on listingType + sub-type) ── */}
            {formStep === "form" && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    {/* Type + sub-type badge */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={productForm.listingType === "rental"
                          ? { background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }
                          : { background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)", color: "#06B6D4" }}>
                        {productForm.listingType === "rental"
                          ? <><KeyRound className="w-3.5 h-3.5" /> Alquiler</>
                          : <><ShoppingBag className="w-3.5 h-3.5" /> Venta</>}
                      </div>
                      {/* sub-type pill */}
                      {(() => {
                        const isRent = productForm.listingType === "rental";
                        const opts = isRent ? RENTAL_SUBTYPES : SALE_SUBTYPES;
                        const sel = opts.find(o => o.id === (isRent ? productForm.rentalType : productForm.productType));
                        if (!sel) return null;
                        return (
                          <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            {sel.icon} {sel.label}
                          </span>
                        );
                      })()}
                    </div>
                    <h2 className="text-base font-bold text-foreground">
                      {editingProductId ? "Editar producto" : "Nuevo producto"}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Back button — only for new products */}
                    {!editingProductId && (
                      <button
                        onClick={() => { setFormStep("sub_type"); setProductError(""); }}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors flex items-center gap-1"
                      >
                        ← Cambiar
                      </button>
                    )}
                    <button onClick={closeProductForm} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/[0.06] transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

                  {/* Images */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5" /> Imágenes del producto
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {productForm.images.map((img, i) => (
                        <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-white/[0.06]">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => pf("images", productForm.images.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                          {i === 0 && (
                            <div className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/60 text-primary py-0.5">Portada</div>
                          )}
                        </div>
                      ))}
                      {productForm.images.length < 5 && (
                        <button
                          onClick={() => imageRef.current?.click()}
                          disabled={imageUploading}
                          className="w-16 h-16 rounded-xl border-2 border-dashed border-white/15 flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-50"
                        >
                          {imageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                        </button>
                      )}
                      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Máx. 5 imágenes · La primera es la portada</p>
                  </div>

                  {/* Name + description — shared */}
                  <div className="space-y-3">
                    <input style={inputStyle} placeholder="Nombre del producto *" value={productForm.name} onChange={e => pf("name", e.target.value)} />
                    <textarea style={{ ...inputStyle, resize: "none" }} placeholder="Descripción (opcional)" rows={2} value={productForm.description} onChange={e => pf("description", e.target.value)} />
                  </div>

                  {/* ── SALE-SPECIFIC fields ───────────────────────────── */}
                  {productForm.listingType === "sale" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                          <input style={{ ...inputStyle, paddingLeft: "24px" }} placeholder="Precio USD *" type="number" min="0" step="0.01" value={productForm.priceUsd} onChange={e => pf("priceUsd", e.target.value)} />
                        </div>
                        <input style={inputStyle} placeholder="Stock (opcional)" type="number" min="0" value={productForm.stock} onChange={e => pf("stock", e.target.value)} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Categoría *</p>
                          <select style={inputStyle} value={productForm.category} onChange={e => pf("category", e.target.value)}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Estado del artículo</p>
                          <div className="flex gap-2">
                            {CONDITIONS.map(c => (
                              <button key={c.id} onClick={() => pf("condition", c.id)}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                                style={productForm.condition === c.id
                                  ? { background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.35)", color: "#06B6D4" }
                                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => pf("hasDelivery", !productForm.hasDelivery)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                        style={{
                          background: productForm.hasDelivery ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.04)",
                          border: productForm.hasDelivery ? "1px solid rgba(6,182,212,0.3)" : "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <span className="text-sm text-foreground">Ofrece envío / delivery</span>
                        {productForm.hasDelivery
                          ? <ToggleRight className="w-5 h-5 text-primary" />
                          : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                      </button>
                    </div>
                  )}

                  {/* ── RENTAL-SPECIFIC fields ─────────────────────────── */}
                  {productForm.listingType === "rental" && (
                    <div className="space-y-3">
                      {/* Pricing */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Precios de alquiler</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <input style={{ ...inputStyle, paddingLeft: "20px" }} placeholder="Precio / día *"
                                type="number" min="0" step="0.01" value={productForm.rentalPricePerDay}
                                onChange={e => pf("rentalPricePerDay", e.target.value)} />
                            </div>
                            <p className="text-[10px] mt-1" style={{ color: "rgba(167,139,250,0.8)" }}>💡 Se cobra por día</p>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                            <input style={{ ...inputStyle, paddingLeft: "20px" }} placeholder="Precio / semana"
                              type="number" min="0" step="0.01" value={productForm.rentalPricePerWeek}
                              onChange={e => pf("rentalPricePerWeek", e.target.value)} />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">El precio por semana es opcional — se muestra como descuento</p>
                      </div>

                      {/* Deposit */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Depósito de garantía (opcional)</p>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                          <input style={{ ...inputStyle, paddingLeft: "24px" }} placeholder="Monto del depósito"
                            type="number" min="0" step="0.01" value={productForm.rentalDeposit}
                            onChange={e => pf("rentalDeposit", e.target.value)} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">Se devuelve al cliente al finalizar el alquiler sin daños</p>
                      </div>

                      {/* Availability note */}
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
                        style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)" }}>
                        <Tag className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-violet-300">Disponibilidad automática</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                            Las fechas se bloquean automáticamente al confirmar cada reserva y se liberan al cancelarlas.
                          </p>
                        </div>
                      </div>

                      {/* Rules */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Condiciones (opcional)</p>
                        <textarea style={{ ...inputStyle, resize: "none" } as React.CSSProperties}
                          placeholder="Ej: No se puede sacar fuera del estado. Requiere cédula. Cuidado especial con..."
                          rows={2} value={productForm.rentalRules}
                          onChange={e => pf("rentalRules", e.target.value)} />
                      </div>

                      {/* Category */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Categoría *</p>
                        <select style={inputStyle} value={productForm.category} onChange={e => pf("category", e.target.value)}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      {/* Price reference for rental — hidden field set to rentalPricePerDay for API compat */}
                      <input type="hidden" value={productForm.rentalPricePerDay} onChange={() => {}} />
                    </div>
                  )}

                  {/* ── EXTRA FIELDS by sub-type ──────────────────────── */}
                  {/* Sale: vehicle */}
                  {productForm.listingType === "sale" && productForm.productType === "vehicle" && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        🚗 Datos del vehículo
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <input style={inputStyle} placeholder="Marca (ej: Toyota)" value={productForm.metaBrand} onChange={e => pf("metaBrand", e.target.value)} />
                        <input style={inputStyle} placeholder="Modelo" value={productForm.metaModel} onChange={e => pf("metaModel", e.target.value)} />
                        <input style={inputStyle} placeholder="Año" type="number" value={productForm.metaYear} onChange={e => pf("metaYear", e.target.value)} />
                        <input style={inputStyle} placeholder="Kilómetros" type="number" value={productForm.metaKm} onChange={e => pf("metaKm", e.target.value)} />
                      </div>
                    </div>
                  )}
                  {/* Sale: property */}
                  {productForm.listingType === "sale" && productForm.productType === "property" && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        🏠 Datos del inmueble
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <input style={inputStyle} placeholder="m²" type="number" value={productForm.metaSqm} onChange={e => pf("metaSqm", e.target.value)} />
                        <input style={inputStyle} placeholder="Hab." type="number" value={productForm.metaBedrooms} onChange={e => pf("metaBedrooms", e.target.value)} />
                        <input style={inputStyle} placeholder="Baños" type="number" value={productForm.metaBathrooms} onChange={e => pf("metaBathrooms", e.target.value)} />
                      </div>
                    </div>
                  )}
                  {/* Rental: vehicle */}
                  {productForm.listingType === "rental" && productForm.rentalType === "vehicle" && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        🚗 Datos del vehículo
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <input style={inputStyle} placeholder="Marca" value={productForm.metaBrand} onChange={e => pf("metaBrand", e.target.value)} />
                        <input style={inputStyle} placeholder="Modelo" value={productForm.metaModel} onChange={e => pf("metaModel", e.target.value)} />
                        <input style={inputStyle} placeholder="Año" type="number" value={productForm.metaYear} onChange={e => pf("metaYear", e.target.value)} />
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Transmisión</p>
                          <div className="flex gap-2">
                            {[{id:"manual",l:"Manual"},{id:"automatic",l:"Automático"}].map(t => (
                              <button key={t.id} onClick={() => pf("metaTransmission", t.id)}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                                style={productForm.metaTransmission === t.id
                                  ? { background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }
                                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                                {t.l}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">¿Requiere licencia?</p>
                          <div className="flex gap-2">
                            {[{id:"yes",l:"Sí"},{id:"no",l:"No"}].map(t => (
                              <button key={t.id} onClick={() => pf("metaLicense", t.id)}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                                style={productForm.metaLicense === t.id
                                  ? { background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }
                                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                                {t.l}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Rental: property */}
                  {productForm.listingType === "rental" && productForm.rentalType === "property" && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        🏠 Datos de la propiedad
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <input style={inputStyle} placeholder="m²" type="number" value={productForm.metaSqm} onChange={e => pf("metaSqm", e.target.value)} />
                        <input style={inputStyle} placeholder="Hab." type="number" value={productForm.metaBedrooms} onChange={e => pf("metaBedrooms", e.target.value)} />
                        <input style={inputStyle} placeholder="Baños" type="number" value={productForm.metaBathrooms} onChange={e => pf("metaBathrooms", e.target.value)} />
                      </div>
                      <input style={inputStyle} placeholder="Máx. huéspedes" type="number" value={productForm.metaGuests} onChange={e => pf("metaGuests", e.target.value)} />
                      <textarea style={{ ...inputStyle, resize: "none" }} placeholder="Normas de la casa (opcional)" rows={2} value={productForm.metaHouseRules} onChange={e => pf("metaHouseRules", e.target.value)} />
                    </div>
                  )}
                  {/* Rental: experience */}
                  {productForm.listingType === "rental" && productForm.rentalType === "experience" && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        🛥️ Datos de la experiencia
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <input style={inputStyle} placeholder="Duración (horas)" type="number" value={productForm.metaDuration} onChange={e => pf("metaDuration", e.target.value)} />
                        <input style={inputStyle} placeholder="Capacidad (pers.)" type="number" value={productForm.metaCapacity} onChange={e => pf("metaCapacity", e.target.value)} />
                      </div>
                      <input style={inputStyle} placeholder="¿Qué incluye? (ej: guía, comida, equipo)" value={productForm.metaIncludes} onChange={e => pf("metaIncludes", e.target.value)} />
                    </div>
                  )}

                  {/* ── Live preview card ─────────────────────────────── */}
                  {(productForm.name.trim() || productForm.images.length > 0) && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <span style={{ color: "rgba(255,255,255,0.25)" }}>👁</span> Vista previa
                      </p>
                      <div className="rounded-2xl overflow-hidden flex gap-3 p-3"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {/* Thumbnail */}
                        <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.06)" }}>
                          {productForm.images[0]
                            ? <img src={productForm.images[0]} alt="" className="w-full h-full object-cover" />
                            : <Package className="w-6 h-6 text-muted-foreground opacity-40" />}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <p className="text-sm font-bold text-foreground truncate leading-tight">
                              {productForm.name.trim() || <span className="text-muted-foreground italic">Sin nombre</span>}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {productForm.category}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {/* Price */}
                            {productForm.listingType === "sale" && productForm.priceUsd && (
                              <span className="text-sm font-extrabold" style={{ color: "#06B6D4" }}>
                                ${parseFloat(productForm.priceUsd || "0").toFixed(2)}
                              </span>
                            )}
                            {productForm.listingType === "rental" && productForm.rentalPricePerDay && (
                              <span className="text-sm font-extrabold text-violet-400">
                                ${parseFloat(productForm.rentalPricePerDay || "0").toFixed(2)}<span className="text-[10px] font-normal text-muted-foreground">/día</span>
                              </span>
                            )}
                            {/* Badges */}
                            {productForm.listingType === "sale" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                style={{ background: productForm.condition === "new" ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.18)", color: productForm.condition === "new" ? "#34d399" : "#fbbf24" }}>
                                {productForm.condition === "new" ? "Nuevo" : productForm.condition === "used" ? "Usado" : "Reacond."}
                              </span>
                            )}
                            {productForm.listingType === "rental" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                style={{ background: "rgba(139,92,246,0.18)", color: "#a78bfa" }}>
                                Alquiler
                              </span>
                            )}
                            {productForm.hasDelivery && productForm.listingType === "sale" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4" }}>
                                🚚 Delivery
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {productError && (
                    <p className="text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{productError}</p>
                  )}
                </div>

                {/* Sticky footer */}
                <div className="flex gap-3 px-6 pb-5 pt-4 flex-shrink-0 border-t border-white/[0.06]">
                  <button onClick={closeProductForm}
                    className="flex-1 py-3 rounded-xl text-sm font-medium glass text-muted-foreground hover:text-foreground transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleSaveProduct} disabled={productSaving}
                    className="flex-1 py-3 rounded-xl btn-gradient text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                    {productSaving
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                      : editingProductId
                        ? "Guardar cambios"
                        : productForm.listingType === "rental" ? "Publicar alquiler" : "Publicar en venta"}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
