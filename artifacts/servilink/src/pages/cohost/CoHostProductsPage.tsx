import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  ShoppingBag, Plus, Pencil, Trash2, X, MapPin, MapPinOff,
  Camera, Loader2, ImageOff, TruckIcon, Search, ChevronLeft, ChevronRight, Star,
  KeyRound, CalendarDays, ShieldCheck, FileText, ToggleLeft, ToggleRight,
  Zap, Crown, TrendingUp, Eye, MousePointerClick, CheckCircle, Clock, FileUp,
} from "lucide-react";
import {
  useCohostProducts, useCohostStores,
  useCreateProduct, useUpdateProduct, useDeleteProduct,
} from "@/hooks/cohost";
import { SkeletonCard, QueryError } from "@/components/ui/Skeleton";
import { mediaSrc } from "@/lib/media-url";

interface NominatimResult {
  place_id: number; display_name: string; lat: string; lon: string;
}

interface ProductForm {
  name: string; description: string; priceUsd: string; category: string;
  condition: "new" | "used"; hasDelivery: boolean; images: string[];
  latitude: string; longitude: string; storeId: string; stock: string;
  listingType: "sale" | "rental";
  rentalPricePerDay: string;
  rentalPricePerWeek: string;
  rentalDeposit: string;
  rentalRules: string;
  blockedDates: string[];
}

const EMPTY_FORM: ProductForm = {
  name: "", description: "", priceUsd: "", category: "ferretería",
  condition: "new", hasDelivery: false, images: [],
  latitude: "", longitude: "", storeId: "", stock: "",
  listingType: "sale", rentalPricePerDay: "", rentalPricePerWeek: "",
  rentalDeposit: "", rentalRules: "", blockedDates: [],
};

const PRODUCT_CATEGORIES = [
  "ferretería", "barbería / peluquería", "electrónica", "repuestos automotriz",
  "ropa y calzado", "alimentos y bebidas", "hogar y muebles", "jardín y plantas",
  "materiales de construcción", "limpieza e higiene", "tecnología y accesorios",
  "salud y farmacia", "deportes", "juguetes y bebés", "mascotas",
  "papelería y oficina", "arte y manualidades", "música e instrumentos",
  "libros", "otros",
];

const PRICE_HINTS: Record<string, string> = {
  "ferretería": "$3 – $80",
  "barbería / peluquería": "$5 – $35",
  "electrónica": "$10 – $200",
  "repuestos automotriz": "$5 – $150",
  "ropa y calzado": "$5 – $60",
  "alimentos y bebidas": "$2 – $30",
  "hogar y muebles": "$10 – $200",
  "jardín y plantas": "$2 – $50",
  "materiales de construcción": "$5 – $100",
  "limpieza e higiene": "$2 – $20",
  "tecnología y accesorios": "$5 – $120",
  "salud y farmacia": "$2 – $30",
  "deportes": "$5 – $80",
  "juguetes y bebés": "$3 – $50",
  "mascotas": "$2 – $40",
  "papelería y oficina": "$1 – $20",
  "arte y manualidades": "$3 – $40",
  "música e instrumentos": "$20 – $300",
  "libros": "$1 – $15",
  "otros": "$1 – $100",
};

const MAX_IMAGES = 5;

export function CoHostProductsPage() {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // ── Premium ────────────────────────────────────────────────────────────────
  const [premiumProduct, setPremiumProduct] = useState<any | null>(null);
  const [premiumForm, setPremiumForm] = useState({ months: "1", phone: "", bank: "", ref: "" });
  const [premiumSending, setPremiumSending] = useState(false);
  const [trialStatus, setTrialStatus] = useState<"loading" | "available" | "used">("loading");
  const [trialActivating, setTrialActivating] = useState<number | null>(null);
  const qc = useQueryClient();
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "ok" | "denied">("idle");
  const [addressQuery, setAddressQuery] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimResult[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(
    () => localStorage.getItem("sl_growth_checklist_v1") === "1"
  );

  const { data: products = [], isLoading, isError, refetch } = useCohostProducts();
  const { data: stores = [] } = useCohostStores();
  const { data: bcvData } = useQuery({ queryKey: ["bcv-rate"], queryFn: () => apiFetch("/api/bcv-rate") });
  const bcvRate: number = (bcvData as any)?.rate ?? 36;

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const saving = createProduct.isPending || updateProduct.isPending;

  // ── Multi-photo upload ─────────────────────────────────────────────────────
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - form.images.length;
    const toUpload = files.slice(0, remaining);
    if (!toUpload.length) return;

    setUploading(true); setUploadError("");
    try {
      const newUrls: string[] = [];
      for (const file of toUpload) {
        const { uploadURL, objectPath } = await apiFetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { ...getAuthHeader(), "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        const up = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!up.ok) throw new Error("Error al subir imagen al servidor");
        newUrls.push(mediaSrc(objectPath));
      }
      setForm(f => ({ ...f, images: [...f.images, ...newUrls].slice(0, MAX_IMAGES) }));
    } catch (err: any) {
      setUploadError(err?.message ?? "Error al subir imagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };

  const moveImage = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= form.images.length) return;
    setForm(f => {
      const imgs = [...f.images];
      [imgs[idx], imgs[next]] = [imgs[next], imgs[idx]];
      return { ...f, images: imgs };
    });
  };

  // ── Address search ────────────────────────────────────────────────────────
  const searchAddress = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 3) { setAddressSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      setAddressSearching(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=0&accept-language=es`, { headers: { "Accept-Language": "es" } });
        const data: NominatimResult[] = await res.json();
        setAddressSuggestions(data); setShowSuggestions(data.length > 0);
      } catch { setAddressSuggestions([]); }
      finally { setAddressSearching(false); }
    }, 400);
  };

  const selectAddress = (result: NominatimResult) => {
    setSelectedAddress(result.display_name); setAddressQuery(result.display_name);
    setForm(f => ({ ...f, latitude: parseFloat(result.lat).toFixed(6), longitude: parseFloat(result.lon).toFixed(6) }));
    setAddressSuggestions([]); setShowSuggestions(false); setLocStatus("ok");
  };

  const clearLocation = () => {
    setForm(f => ({ ...f, latitude: "", longitude: "" }));
    setAddressQuery(""); setSelectedAddress(""); setAddressSuggestions([]); setShowSuggestions(false); setLocStatus("idle");
  };

  const handleGetLocation = () => {
    setLocStatus("loading");
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(6); const lng = pos.coords.longitude.toFixed(6);
        setForm(f => ({ ...f, latitude: lat, longitude: lng })); setLocStatus("ok");
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`).then(r => r.json()).then((d: any) => { const name = d.display_name ?? `${lat}, ${lng}`; setSelectedAddress(name); setAddressQuery(name); }).catch(() => setAddressQuery(`${lat}, ${lng}`));
      },
      () => setLocStatus("denied"),
      { timeout: 8000 }
    );
  };

  const resetAddressState = () => { setAddressQuery(""); setSelectedAddress(""); setAddressSuggestions([]); setShowSuggestions(false); setLocStatus("idle"); };

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setError(""); setUploadError(""); resetAddressState(); setShowForm(true); };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    const imgs: string[] = Array.isArray(p.images) && p.images.length > 0 ? p.images : (p.image ? [p.image] : []);
    setForm({
      name: p.name, description: p.description ?? "", priceUsd: String(p.priceUsd),
      category: p.category, condition: (p.condition === "used" ? "used" : "new") as "new" | "used",
      hasDelivery: p.hasDelivery, images: imgs,
      latitude: p.latitude != null ? String(p.latitude) : "",
      longitude: p.longitude != null ? String(p.longitude) : "",
      storeId: p.storeId != null ? String(p.storeId) : "",
      stock: p.stock != null ? String(p.stock) : "",
      listingType: p.listingType === "rental" ? "rental" : "sale",
      rentalPricePerDay: p.rentalPricePerDay != null ? String(p.rentalPricePerDay) : "",
      rentalPricePerWeek: p.rentalPricePerWeek != null ? String(p.rentalPricePerWeek) : "",
      rentalDeposit: p.rentalDeposit != null ? String(p.rentalDeposit) : "",
      rentalRules: p.rentalRules ?? "",
      blockedDates: Array.isArray(p.blockedDates) ? p.blockedDates : [],
    });
    if (p.latitude != null && p.longitude != null) {
      setLocStatus("ok"); const lat = String(p.latitude); const lng = String(p.longitude); setAddressQuery(`${lat}, ${lng}`);
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`).then(r => r.json()).then((d: any) => { const name = d.display_name ?? `${lat}, ${lng}`; setSelectedAddress(name); setAddressQuery(name); }).catch(() => {});
    } else { resetAddressState(); }
    setError(""); setUploadError(""); setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setUploadError(""); resetAddressState(); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.priceUsd) { setError("Nombre y precio son requeridos"); return; }
    if (form.listingType === "rental" && !form.rentalPricePerDay) { setError("El precio por día es requerido para alquiler"); return; }
    setError("");
    const body: Record<string, any> = {
      name: form.name, description: form.description || null,
      priceUsd: parseFloat(form.priceUsd), category: form.category,
      condition: form.condition, hasDelivery: form.hasDelivery,
      images: form.images,
      image: form.images[0] ?? null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      storeId: form.storeId ? parseInt(form.storeId) : null,
      stock: form.stock ? parseInt(form.stock) : null,
      listingType: form.listingType,
      rentalPricePerDay: form.rentalPricePerDay ? parseFloat(form.rentalPricePerDay) : null,
      rentalPricePerWeek: form.rentalPricePerWeek ? parseFloat(form.rentalPricePerWeek) : null,
      rentalDeposit: form.rentalDeposit ? parseFloat(form.rentalDeposit) : null,
      rentalRules: form.rentalRules || null,
      blockedDates: form.blockedDates,
    };
    if (editingId != null) {
      updateProduct.mutate({ id: editingId, body }, { onSuccess: closeForm, onError: (err: any) => setError(err?.message ?? "Error al guardar producto") });
    } else {
      createProduct.mutate(body, {
        onSuccess: (data: any) => {
          if (data?.autoTrialActivated) {
            setTimeout(() => toast({
              title: "🎉 ¡48h Premium activado!",
              description: "Tu primer producto ya aparece destacado gratuitamente. Aprovéchalo al máximo.",
            }), 400);
          }
          closeForm();
        },
        onError: (err: any) => setError(err?.message ?? "Error al guardar producto"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteProduct.mutate(id, { onSettled: () => setConfirmDeleteId(null) });
  };

  const PRICE_BY_MONTHS: Record<string, number> = { "1": 3, "3": 8, "6": 14 };

  const handlePremiumSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!premiumProduct) return;
    const { months, phone, bank, ref } = premiumForm;
    if (!phone.trim() || !ref.trim()) {
      toast({ title: "Completa el teléfono y la referencia de Pago Móvil", variant: "destructive" });
      return;
    }
    setPremiumSending(true);
    try {
      await apiFetch(`/api/products/${premiumProduct.id}/premium/request`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          months: parseInt(months),
          amountUsd: PRICE_BY_MONTHS[months],
          pagoMovilPhone: phone.trim(),
          pagoMovilBank: bank.trim() || null,
          pagoMovilRef: ref.trim(),
        }),
      });
      toast({ title: "Solicitud enviada", description: "Tu producto será destacado tras la verificación (máx. 24 h)." });
      setPremiumProduct(null);
      setPremiumForm({ months: "1", phone: "", bank: "", ref: "" });
      qc.invalidateQueries({ queryKey: ["cohost-products"] });
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al enviar solicitud", variant: "destructive" });
    } finally {
      setPremiumSending(false);
    }
  };

  // ── Trial status fetch ────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/products/trial-status", { headers: getAuthHeader() })
      .then((d: any) => setTrialStatus(d.used ? "used" : "available"))
      .catch(() => setTrialStatus("used"));
  }, []);

  const handleTrialActivate = async (productId: number) => {
    setTrialActivating(productId);
    try {
      await apiFetch(`/api/products/${productId}/premium/trial`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      });
      toast({ title: "¡Prueba Premium activada!", description: "Tu producto está destacado por las próximas 48 horas. ¡Revisa cuántas vistas ganas!" });
      setTrialStatus("used");
      qc.invalidateQueries({ queryKey: ["cohost-products"] });
    } catch (err: any) {
      if (err?.status === 409 || (typeof err?.message === "string" && err.message.includes("prueba"))) {
        setTrialStatus("used");
      }
      toast({ title: err?.message ?? "Error al activar período de prueba", variant: "destructive" });
    } finally {
      setTrialActivating(null);
    }
  };

  const coverImage = (p: any): string | null => {
    if (Array.isArray(p.images) && p.images.length > 0) return p.images[0];
    return p.image ?? null;
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mis Productos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tasa BCV hoy: <span className="text-emerald-400 font-medium">Bs. {bcvRate.toFixed(2)}</span> por USD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="bulk-import-button"
            onClick={() => {
              const list = stores as any[];
              const target = list.length === 1 ? `?storeId=${list[0].id}` : "";
              navigate(`/enterprise/import${target}`);
            }}
            disabled={(stores as any[]).length === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "rgba(6,182,212,0.10)",
              border: "1px solid rgba(6,182,212,0.35)",
              color: "rgb(165,243,252)",
            }}
            title={(stores as any[]).length === 0 ? "Crea una tienda primero" : "Sube CSV o Excel para crear productos en masa"}
          >
            <FileUp className="w-4 h-4" /> Importar en masa
          </button>
          <button onClick={openCreate} className="btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo producto
          </button>
        </div>
      </div>

      {/* ── Growth checklist ───────────────────────────────────────────────── */}
      {!checklistDismissed && (() => {
        const prodList = products as any[];
        const steps = [
          { done: true,                                                   label: "Cuenta creada" },
          { done: (stores as any[]).length > 0,                           label: "Tienda activa" },
          { done: prodList.length > 0,                                    label: "Primer producto publicado" },
          { done: prodList.some((p: any) => (p.images?.length ?? 0) > 0 || p.image), label: "Foto de producto" },
          { done: prodList.some((p: any) => p.description && p.description.length > 10), label: "Descripción añadida" },
        ];
        const done = steps.filter(s => s.done).length;
        const pct  = Math.round((done / steps.length) * 100);
        if (pct === 100) return null;
        return (
          <div className="rounded-2xl p-4" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.2)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-foreground">Completa tu perfil de vendedor</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(148,163,184,0.8)" }}>Cada paso aumenta tus posibilidades de venta</p>
              </div>
              <button
                onClick={() => { setChecklistDismissed(true); localStorage.setItem("sl_growth_checklist_v1", "1"); }}
                className="text-muted-foreground hover:text-foreground ml-3 mt-0.5"
              ><X className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#06b6d4,#3b82f6)" }} />
              </div>
              <span className="text-xs font-bold" style={{ color: "#06b6d4" }}>{done}/{steps.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                  style={{ background: s.done ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)", color: s.done ? "#6ee7b7" : "rgba(148,163,184,0.7)" }}>
                  {s.done ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      ) : isError ? (
        <QueryError message="No se pudieron cargar tus productos" onRetry={() => refetch()} />
      ) : (products as any[]).length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-foreground font-medium">Aún no tienes productos</p>
          <p className="text-sm text-muted-foreground mt-1">Crea tu primer producto o sube tu catálogo completo en segundos</p>
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            <button onClick={openCreate} className="btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Crear producto
            </button>
            <button
              data-testid="bulk-import-empty-state"
              onClick={() => {
                const list = stores as any[];
                const target = list.length === 1 ? `?storeId=${list[0].id}` : "";
                navigate(`/enterprise/import${target}`);
              }}
              disabled={(stores as any[]).length === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
          {(products as any[]).map((p: any) => {
            const cover = coverImage(p);
            const imgCount = Array.isArray(p.images) ? p.images.length : (p.image ? 1 : 0);
            return (
              <div
                key={p.id}
                className="glass rounded-2xl p-4 flex items-center gap-4 transition-opacity duration-200"
                style={{ opacity: deleteProduct.isPending && deleteProduct.variables === p.id ? 0.4 : 1 }}
              >
                <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {cover ? <img src={cover} alt={p.name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-6 h-6 text-white/30" />}
                  {imgCount > 1 && (
                    <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-bold px-1 rounded-tl-md leading-tight">
                      +{imgCount - 1}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground truncate">{p.name}</span>
                    {p.isPremium && (!p.premiumUntil || new Date(p.premiumUntil) > new Date()) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black flex items-center gap-1"
                        style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff" }}>
                        <Zap className="w-2.5 h-2.5" /> Destacado
                      </span>
                    )}
                    {p.listingType === "rental" && (
                      <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                        <KeyRound className="w-2.5 h-2.5" /> ALQUILER
                      </span>
                    )}
                    <span className="text-xs bg-white/10 text-muted-foreground px-2 py-0.5 rounded">{p.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${p.condition === "used" ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400"}`}>
                      {p.condition === "used" ? "Usado" : "Nuevo"}
                    </span>
                    {p.hasDelivery && (
                      <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded flex items-center gap-1">
                        <TruckIcon className="w-3 h-3" /> Delivery
                      </span>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>}
                  {/* Location + premium expiry */}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {p.latitude != null
                      ? <span className="flex items-center gap-1 text-xs text-emerald-400"><MapPin className="w-3 h-3" /> Ubicación activa</span>
                      : <span className="flex items-center gap-1 text-xs text-muted-foreground/60"><MapPinOff className="w-3 h-3" /> Sin ubicación</span>}
                    {p.isPremium && p.premiumUntil && new Date(p.premiumUntil) > new Date() && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400/70">
                        <Clock className="w-2.5 h-2.5" /> hasta {new Date(p.premiumUntil).toLocaleDateString("es-VE", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                  {/* Métricas + upsell contextual */}
                  {(() => {
                    const views = p.viewCount ?? 0;
                    const clicks = p.clickCount ?? 0;
                    const isPremActive = p.isPremium && p.premiumUntil && new Date(p.premiumUntil) > new Date();
                    const lowCTR = views > 0 && clicks === 0;
                    return (
                      <div className="mt-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-xs font-semibold"
                            style={{ color: views > 0 ? "rgba(6,182,212,0.85)" : "rgba(255,255,255,0.22)" }}>
                            <Eye className="w-3 h-3" /> {views} vista{views !== 1 ? "s" : ""}
                          </span>
                          <span className="flex items-center gap-1 text-xs font-semibold"
                            style={{ color: clicks > 0 ? "rgba(251,191,36,0.85)" : "rgba(255,255,255,0.22)" }}>
                            <MousePointerClick className="w-3 h-3" /> {clicks} clic{clicks !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {!isPremActive && lowCTR && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold"
                            style={{ color: "rgba(245,158,11,0.9)" }}>
                            <Zap className="w-2.5 h-2.5" /> Ya hay interés — con Premium puedes multiplicarlo
                          </div>
                        )}
                        {!isPremActive && views > 0 && clicks > 0 && (
                          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                            Con Premium podrías duplicar estos resultados
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="text-right flex-shrink-0">
                  {p.listingType === "rental" && p.rentalPricePerDay != null ? (
                    <>
                      <div className="font-bold text-violet-300">${Number(p.rentalPricePerDay).toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/día</span></div>
                      {p.rentalPricePerWeek && <div className="text-xs text-violet-400/70">${Number(p.rentalPricePerWeek).toFixed(2)}/sem</div>}
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-foreground">${p.priceUsd.toFixed(2)}</div>
                      <div className="text-xs text-emerald-400">≈ Bs. {(p.priceUsd * bcvRate).toFixed(0)}</div>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {confirmDeleteId === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">¿Eliminar?</span>
                      <button onClick={() => handleDelete(p.id)} disabled={deleteProduct.isPending} className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50">Sí</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-2.5 py-1 rounded-lg bg-white/[0.06] text-muted-foreground text-xs hover:bg-white/10 transition-colors">No</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-1.5">
                        <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteId(p.id)} className="p-2 rounded-lg hover:bg-red-400/10 text-muted-foreground hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {!(p.isPremium && p.premiumUntil && new Date(p.premiumUntil) > new Date()) && (
                        <>
                          <button
                            onClick={() => { setPremiumProduct(p); setPremiumForm({ months: "1", phone: "", bank: "", ref: "" }); }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all hover:opacity-90 flex items-center gap-1 whitespace-nowrap"
                            style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.18),rgba(217,119,6,0.15))", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)" }}>
                            <Crown className="w-3 h-3" /> Destacar
                          </button>
                          {trialStatus === "available" && p.listingType !== "rental" && (
                            <button
                              onClick={() => handleTrialActivate(p.id)}
                              disabled={trialActivating === p.id}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all hover:opacity-90 flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                              style={{ background: "rgba(52,211,153,0.1)", color: "rgba(52,211,153,0.9)", border: "1px solid rgba(52,211,153,0.28)" }}>
                              {trialActivating === p.id
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Activando...</>
                                : <><Zap className="w-3 h-3" /> 48h gratis</>}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Premium Modal ──────────────────────────────────────────────────── */}
      {premiumProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={() => setPremiumProduct(null)}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
            style={{ background: "#0a1628", border: "1px solid rgba(245,158,11,0.25)" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
                    <Crown className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Destacar producto</p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {premiumProduct.name}
                    </p>
                  </div>
                </div>
                <button onClick={() => setPremiumProduct(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.06)" }}>
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>

            {/* Body */}
            <form onSubmit={handlePremiumSubmit} className="p-5 space-y-4">
              {/* Benefits */}
              <div className="rounded-2xl p-3.5 space-y-2"
                style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
                {[
                  { icon: <Zap className="w-3.5 h-3.5" />, text: "Posición superior en el ServiMarket" },
                  { icon: <Eye className="w-3.5 h-3.5" />, text: "Los destacados reciben 2× más visitas" },
                  { icon: <TrendingUp className="w-3.5 h-3.5" />, text: "Estadísticas detalladas de vistas y clics" },
                  { icon: <CheckCircle className="w-3.5 h-3.5" />, text: "Badge ⭐ visible en búsquedas y tienda" },
                  { icon: <Star className="w-3.5 h-3.5" />, text: "Sección exclusiva 'Productos destacados'" },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                    <span style={{ color: "#fbbf24" }}>{b.icon}</span>{b.text}
                  </div>
                ))}
              </div>

              {/* Before / After comparison */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-2.5 text-center space-y-1"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Sin destaque</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>Grid principal</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>Sin badge</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>Score estándar</div>
                </div>
                <div className="rounded-xl p-2.5 text-center space-y-1"
                  style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <div className="text-[10px] font-bold" style={{ color: "#fbbf24" }}>⭐ Con destaque</div>
                  <div className="text-[10px]" style={{ color: "rgba(251,191,36,0.7)" }}>Sección exclusiva</div>
                  <div className="text-[10px]" style={{ color: "rgba(251,191,36,0.7)" }}>Badge dorado</div>
                  <div className="text-[10px]" style={{ color: "rgba(251,191,36,0.7)" }}>+10% score boost</div>
                </div>
              </div>

              {/* Duration selector */}
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: "rgba(255,255,255,0.5)" }}>Duración</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "1", label: "1 mes",   price: 3 },
                    { val: "3", label: "3 meses", price: 8 },
                    { val: "6", label: "6 meses", price: 14 },
                  ].map(opt => (
                    <button key={opt.val} type="button"
                      onClick={() => setPremiumForm(f => ({ ...f, months: opt.val }))}
                      className="rounded-xl py-2.5 px-2 text-center transition-all"
                      style={premiumForm.months === opt.val ? {
                        background: "rgba(245,158,11,0.20)",
                        border: "1.5px solid rgba(245,158,11,0.55)",
                        color: "#fbbf24",
                      } : {
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.55)",
                      }}>
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-sm font-black mt-0.5">${opt.price}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pago Móvil details */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  📱 Datos de tu Pago Móvil
                </p>
                <div className="rounded-xl p-3 text-xs space-y-0.5" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.18)" }}>
                  <p style={{ color: "rgba(255,255,255,0.7)" }}>Envía el pago a:</p>
                  <p className="font-bold text-white">0414-830-1798 · Banco de Venezuela · Producto Promoca C.A. · J-41252119-5</p>
                  <p className="font-black text-cyan-400">${PRICE_BY_MONTHS[premiumForm.months]} USD ≈ Bs. {(PRICE_BY_MONTHS[premiumForm.months] * bcvRate).toFixed(0)}</p>
                </div>
                <input
                  required
                  placeholder="Tu teléfono registrado en el banco"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                  value={premiumForm.phone}
                  onChange={e => setPremiumForm(f => ({ ...f, phone: e.target.value }))}
                />
                <input
                  placeholder="Banco (ej. Bancamiga, BDV, Banesco)"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                  value={premiumForm.bank}
                  onChange={e => setPremiumForm(f => ({ ...f, bank: e.target.value }))}
                />
                <input
                  required
                  placeholder="Número de referencia de la transacción"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                  value={premiumForm.ref}
                  onChange={e => setPremiumForm(f => ({ ...f, ref: e.target.value }))}
                />
              </div>

              <button type="submit" disabled={premiumSending}
                className="w-full py-3 rounded-xl font-black text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", boxShadow: "0 0 20px rgba(245,158,11,0.3)" }}>
                {premiumSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Crown className="w-4 h-4" /> Enviar solicitud</>}
              </button>
              <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
                Se activará en máx. 24 horas tras verificar el pago
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Image full-screen preview */}
      {previewIndex !== null && (
        <div className="fixed inset-0 z-[900] bg-black/95 backdrop-blur-md flex items-center justify-center" onClick={() => setPreviewIndex(null)}>
          <img
            src={form.images[previewIndex]}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button onClick={() => setPreviewIndex(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">{editingId ? "Editar producto" : "Nuevo producto"}</h3>
              <button onClick={closeForm} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">

              {/* ── Multi-image uploader ────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground font-medium">
                    Fotos del producto
                  </label>
                  <span className="text-[10px] text-muted-foreground/60 bg-white/[0.05] px-2 py-0.5 rounded-full">
                    {form.images.length}/{MAX_IMAGES}
                  </span>
                </div>

                {/* Image grid */}
                {form.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {form.images.map((url, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-white/10">
                        <img
                          src={url} alt={`foto ${idx + 1}`}
                          className="w-full h-full object-cover cursor-zoom-in"
                          onClick={() => setPreviewIndex(idx)}
                        />
                        {/* Portada badge */}
                        {idx === 0 && (
                          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-primary/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none">
                            <Star className="w-2.5 h-2.5 fill-white" /> Portada
                          </div>
                        )}
                        {/* Overlay controls */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => moveImage(idx, -1)}
                              className="w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 transition-colors"
                              title="Mover a la izquierda"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          {idx < form.images.length - 1 && (
                            <button
                              type="button"
                              onClick={() => moveImage(idx, 1)}
                              className="w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 transition-colors"
                              title="Mover a la derecha"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add-more slot */}
                    {form.images.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="aspect-square rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
                      >
                        {uploading
                          ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          : <><Camera className="w-5 h-5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">Añadir</span></>
                        }
                      </button>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {form.images.length === 0 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full h-28 rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {uploading
                      ? <><Loader2 className="w-6 h-6 text-primary animate-spin" /><span className="text-xs text-muted-foreground">Subiendo imagen...</span></>
                      : <>
                          <Camera className="w-6 h-6 text-muted-foreground" />
                          <span className="text-xs font-medium text-foreground/80">Haz que tu negocio brille con una foto nítida</span>
                          <span className="text-[10px] text-muted-foreground/60">Hasta 5 imágenes · JPG, PNG, WEBP</span>
                        </>
                    }
                  </button>
                )}

                {/* Sales tip */}
                <div className="mt-2 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 space-y-1">
                  <p className="text-xs text-amber-400/90 leading-snug">
                    💡 <span className="font-semibold">Tip de Ventas:</span> Usa fotos con buena iluminación y fondo neutro para resaltar tu producto.
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                    📐 <span>Formato recomendado: <strong className="text-muted-foreground">Cuadrado (1:1)</strong> para productos</span>
                  </p>
                </div>

                {uploading && form.images.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Subiendo imagen...
                  </div>
                )}

                {form.images.length > 1 && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                    <Star className="w-2.5 h-2.5" /> La primera foto es la portada. Usa las flechas para reordenar.
                  </p>
                )}

                {uploadError && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><ImageOff className="w-3 h-3" /> {uploadError}</p>}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
                <input className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Ej: Taladro percutor 800W" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
                <textarea className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={2} placeholder="Describe las características del producto..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              {/* ── Listing type toggle ──────────────────────────────────── */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block font-medium">Tipo de publicación</label>
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  {(["sale", "rental"] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setForm(f => ({ ...f, listingType: t }))}
                      className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${form.listingType === t ? (t === "rental" ? "bg-violet-600 text-white" : "bg-foreground text-background") : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t === "sale" ? <><ShoppingBag className="w-4 h-4" /> Venta</> : <><KeyRound className="w-4 h-4" /> Alquiler</>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {form.listingType === "rental" ? "Precio de referencia (USD)" : "Precio (USD) *"}
                  </label>
                  <input type="number" min="0.01" step="0.01" className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="0.00" value={form.priceUsd} onChange={e => setForm(f => ({ ...f, priceUsd: e.target.value }))} required />
                  {form.priceUsd && !isNaN(parseFloat(form.priceUsd))
                    ? <div className="text-xs text-emerald-400 mt-0.5">≈ Bs. {(parseFloat(form.priceUsd) * bcvRate).toFixed(0)}</div>
                    : PRICE_HINTS[form.category] && (
                        <div className="text-xs mt-0.5" style={{ color: "rgba(148,163,184,0.7)" }}>
                          Referencia: {PRICE_HINTS[form.category]}
                        </div>
                      )
                  }
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Categoría</label>
                  <select className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* ── ServiRent fields ─────────────────────────────────────────── */}
              {form.listingType === "rental" && (
                <div className="space-y-3 p-4 rounded-2xl border border-violet-500/30 bg-violet-500/5">
                  <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm mb-1">
                    <KeyRound className="w-4 h-4" /> Tarifas de Alquiler
                  </div>

                  {/* Daily + Weekly price */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Precio / día (USD) *</label>
                      <input type="number" min="0.01" step="0.01" className="w-full bg-white/[0.06] border border-violet-500/30 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500" placeholder="0.00" value={form.rentalPricePerDay} onChange={e => setForm(f => ({ ...f, rentalPricePerDay: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Precio / semana (USD)</label>
                      <input type="number" min="0.01" step="0.01" className="w-full bg-white/[0.06] border border-violet-500/30 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500" placeholder="0.00" value={form.rentalPricePerWeek} onChange={e => setForm(f => ({ ...f, rentalPricePerWeek: e.target.value }))} />
                    </div>
                  </div>

                  {/* Deposit */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-violet-400" /> Depósito de garantía (USD) *
                    </label>
                    <input type="number" min="0" step="0.01" className="w-full bg-white/[0.06] border border-violet-500/30 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500" placeholder="Monto en custodia hasta devolver el item" value={form.rentalDeposit} onChange={e => setForm(f => ({ ...f, rentalDeposit: e.target.value }))} />
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Se retiene en escrow hasta que el arrendatario devuelva el artículo.</p>
                  </div>

                  {/* Rules */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5 font-medium">
                      <FileText className="w-3.5 h-3.5 text-violet-400" /> Condiciones de uso
                    </label>
                    <textarea className="w-full bg-white/[0.06] border border-violet-500/30 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none" rows={3} placeholder="Reglas de uso, restricciones, horarios de entrega/devolución..." value={form.rentalRules} onChange={e => setForm(f => ({ ...f, rentalRules: e.target.value }))} />
                  </div>

                  {/* Blocked dates */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5 font-medium">
                      <CalendarDays className="w-3.5 h-3.5 text-violet-400" /> Fechas no disponibles
                    </label>
                    <input type="date" className="w-full bg-white/[0.06] border border-violet-500/30 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
                      onChange={e => {
                        const d = e.target.value;
                        if (d && !form.blockedDates.includes(d)) setForm(f => ({ ...f, blockedDates: [...f.blockedDates, d].sort() }));
                        e.target.value = "";
                      }}
                    />
                    {form.blockedDates.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {form.blockedDates.map(d => (
                          <span key={d} className="flex items-center gap-1 bg-violet-500/15 text-violet-300 text-[10px] px-2 py-0.5 rounded-full border border-violet-500/25">
                            {d}
                            <button type="button" onClick={() => setForm(f => ({ ...f, blockedDates: f.blockedDates.filter(x => x !== d) }))} className="hover:text-white"><X className="w-2.5 h-2.5" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Selecciona las fechas en que el artículo no está disponible.</p>
                  </div>

                  <p className="text-[10px] text-violet-300/60 flex items-start gap-1.5 mt-1">
                    <ShieldCheck className="w-3 h-3 mt-0.5 flex-shrink-0" /> Pago seguro · Transacción protegida por LinkServi.
                  </p>
                </div>
              )}

              {/* Condition + Delivery */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Condición</label>
                  <div className="flex rounded-xl overflow-hidden border border-white/10">
                    {(["new", "used"] as const).map(c => (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, condition: c }))} className={`flex-1 py-2 text-xs font-medium transition-colors ${form.condition === c ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                        {c === "new" ? "Nuevo" : "Usado"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Delivery</label>
                  <button type="button" onClick={() => setForm(f => ({ ...f, hasDelivery: !f.hasDelivery }))} className={`w-full py-2 rounded-xl text-xs font-medium border transition-all ${form.hasDelivery ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "border-white/10 text-muted-foreground"}`}>
                    {form.hasDelivery ? "🚚 Con delivery" : "Sin delivery"}
                  </button>
                </div>
              </div>

              {/* Stock */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Stock (vacío = ilimitado)</label>
                <input type="number" min="0" className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Cantidad disponible" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
              </div>

              {/* Store selector */}
              {(stores as any[]).length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tienda (opcional)</label>
                  <select className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
                    <option value="">Sin tienda asignada</option>
                    {(stores as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Location */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Ubicación del producto</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  {addressSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
                  <input
                    className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Buscar dirección..."
                    value={addressQuery}
                    onChange={e => { setAddressQuery(e.target.value); searchAddress(e.target.value); }}
                    onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                  />
                  {showSuggestions && addressSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 glass rounded-xl overflow-hidden shadow-2xl">
                      {addressSuggestions.map(r => (
                        <button key={r.place_id} type="button" onClick={() => selectAddress(r)} className="w-full text-left px-3 py-2.5 text-xs text-foreground hover:bg-white/[0.08] transition-colors border-b border-white/[0.06] last:border-0 flex items-start gap-2">
                          <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" />
                          <span className="line-clamp-2">{r.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={handleGetLocation} disabled={locStatus === "loading"} className="flex-1 py-2 rounded-xl border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {locStatus === "loading" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Obteniendo...</> : <><MapPin className="w-3.5 h-3.5" /> Usar mi ubicación</>}
                  </button>
                  {locStatus === "ok" && (
                    <button type="button" onClick={clearLocation} className="px-3 py-2 rounded-xl border border-red-400/20 text-red-400 text-xs hover:bg-red-400/10 transition-colors">
                      <MapPinOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {locStatus === "ok" && selectedAddress && (
                  <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedAddress.slice(0, 80)}{selectedAddress.length > 80 ? "…" : ""}</p>
                )}
                {locStatus === "denied" && <p className="text-[10px] text-red-400 mt-1.5">Permiso de ubicación denegado</p>}
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeForm} className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/[0.04]">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : (editingId ? "Guardar cambios" : "Crear producto")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
