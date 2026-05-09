import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { uploadImage } from "@/lib/upload-image";
import { useLocation } from "wouter";
import { SellerPremiumBanner } from "@/components/ui/SellerPremiumBanner";
import {
  Store, Plus, ChevronRight, DollarSign, X, Loader2, Image, Check, Edit3,
  MapPin, Palette, Megaphone, Sparkles, TrendingUp, Zap, Layout, User,
  CreditCard, Video, MessageSquare, Eye, EyeOff, Smartphone, ChevronLeft,
  Star, Lightbulb, Globe, AtSign, FileUp,
} from "lucide-react";
import { useCohostStores, useCreateStore, useUpdateStore } from "@/hooks/cohost";
import { SkeletonCard, QueryError } from "@/components/ui/Skeleton";

// ─── Constants ────────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { id: "pago_movil", label: "📱 Pago Móvil" },
  { id: "zelle", label: "💵 Zelle" },
  { id: "paypal", label: "🅿 PayPal" },
  { id: "transferencia", label: "🏦 Transferencia" },
  { id: "binance", label: "🟡 Binance Pay" },
];

const THEMES = [
  { id: "moderno", label: "Moderno", emoji: "⚡", from: "#06B6D4", to: "#7C3AED", accent: "#06B6D4", desc: "Gradientes vibrantes" },
  { id: "minimal", label: "Minimal", emoji: "◻", from: "#64748B", to: "#94A3B8", accent: "#64748B", desc: "Limpio y elegante" },
  { id: "oscuro", label: "Oscuro", emoji: "🌑", from: "#1E293B", to: "#475569", accent: "#94A3B8", desc: "Profundo y exclusivo" },
  { id: "esmeralda", label: "Esmeralda", emoji: "🍃", from: "#059669", to: "#34D399", accent: "#059669", desc: "Fresco y natural" },
  { id: "fuego", label: "Fuego", emoji: "🔥", from: "#DC2626", to: "#F97316", accent: "#F97316", desc: "Energético y audaz" },
  { id: "royal", label: "Royal", emoji: "👑", from: "#7C3AED", to: "#A78BFA", accent: "#7C3AED", desc: "Premium y lujoso" },
];

const TABS = [
  { id: "design", label: "Diseño", icon: Palette },
  { id: "sections", label: "Secciones", icon: Layout },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "owner", label: "Datos", icon: User },
  { id: "payment", label: "Pagos", icon: CreditCard },
];

const TIPS: Record<string, { icon: string; text: string }[]> = {
  design: [
    { icon: "🎨", text: "Un tema coherente genera confianza y aumenta ventas hasta 30%." },
    { icon: "🖼", text: "Usa un banner que muestre tu producto estrella o tu local." },
    { icon: "🎯", text: "El color de acento afecta la psicología del comprador. Usa colores cálidos para urgencia." },
    { icon: "📱", text: "Más del 80% de tus compradores verán tu tienda desde un celular." },
  ],
  sections: [
    { icon: "🏆", text: "El Hero Banner es lo primero que ven — hazlo impactante." },
    { icon: "🎬", text: "Un video de marca aumenta el tiempo en tu tienda un 50%." },
    { icon: "⭐", text: "Las tiendas con testimonios convierten 3× más que las que no los tienen." },
    { icon: "🛍", text: "El carrusel de destacados debe mostrar tus 3-5 productos más vendidos." },
  ],
  marketing: [
    { icon: "📣", text: "La barra de anuncio con urgencia (ej. '¡Hoy con envío gratis!') aumenta clicks un 25%." },
    { icon: "✍", text: "Un eslogan memorable hace que los clientes recuerden tu marca." },
    { icon: "📍", text: "Agrega tu ciudad — los compradores locales confían más en tiendas cercanas." },
    { icon: "📲", text: "WhatsApp es el canal de ventas #1 en Venezuela. Ponlo visible." },
  ],
  owner: [
    { icon: "👤", text: "Una tienda con nombre de dueño real genera 40% más confianza." },
    { icon: "📞", text: "El teléfono visible reduce el abandono de carrito." },
  ],
  payment: [
    { icon: "💳", text: "Ofrece Pago Móvil + Zelle para cubrir el 90% del mercado venezolano." },
    { icon: "🔒", text: "Los datos de pago solo los usa el sistema para transferirte tu balance." },
    { icon: "💡", text: "Binance Pay es ideal para compradores en el exterior." },
  ],
};

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface BuilderConfig {
  sections: { hero: boolean; carousel: boolean; video: boolean; testimonials: boolean };
  menuStyle: "minimal" | "detailed";
  videoUrl: string;
}

const DEFAULT_BUILDER_CONFIG: BuilderConfig = {
  sections: { hero: true, carousel: true, video: false, testimonials: false },
  menuStyle: "minimal",
  videoUrl: "",
};

interface StoreFormData {
  name: string; description: string; ownerName: string; ownerPhone: string;
  ownerCedula: string; paymentMethod: string;
  logoUrl: string; bannerUrl: string; theme: string;
  bank: string; phone: string; cedula: string;
  email: string; accountNumber: string; accountHolder: string; walletAddress: string;
  tagline: string; city: string; accentColor: string; promoText: string;
  whatsapp: string; instagram: string;
  builderConfig: BuilderConfig;
}

const emptyForm: StoreFormData = {
  name: "", description: "", ownerName: "", ownerPhone: "", ownerCedula: "",
  paymentMethod: "pago_movil", logoUrl: "", bannerUrl: "", theme: "moderno",
  bank: "", phone: "", cedula: "", email: "", accountNumber: "", accountHolder: "", walletAddress: "",
  tagline: "", city: "", accentColor: "#06B6D4", promoText: "",
  whatsapp: "", instagram: "",
  builderConfig: DEFAULT_BUILDER_CONFIG,
};

function storeToForm(s: any): StoreFormData {
  let details: any = {};
  try { details = s.paymentDetails ? JSON.parse(s.paymentDetails) : {}; } catch {}
  let builderConfig: BuilderConfig = DEFAULT_BUILDER_CONFIG;
  try { if (s.builderConfig) builderConfig = { ...DEFAULT_BUILDER_CONFIG, ...JSON.parse(s.builderConfig), sections: { ...DEFAULT_BUILDER_CONFIG.sections, ...(JSON.parse(s.builderConfig)?.sections ?? {}) } }; } catch {}
  return {
    name: s.name ?? "", description: s.description ?? "", ownerName: s.ownerName ?? "",
    ownerPhone: s.ownerPhone ?? "", ownerCedula: s.ownerCedula ?? "",
    paymentMethod: s.paymentMethod ?? "pago_movil", logoUrl: s.logoUrl ?? "",
    bannerUrl: s.bannerUrl ?? "", theme: s.theme ?? "moderno",
    bank: details.bank ?? "", phone: details.phone ?? "", cedula: details.cedula ?? "",
    email: details.email ?? "", accountNumber: details.accountNumber ?? "",
    accountHolder: details.accountHolder ?? "", walletAddress: details.walletAddress ?? "",
    tagline: s.tagline ?? "", city: s.city ?? "",
    accentColor: s.accentColor ?? "#06B6D4", promoText: s.promoText ?? "",
    whatsapp: s.whatsapp ?? "", instagram: s.instagram ?? "",
    builderConfig,
  };
}

const inputStyle = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px", padding: "10px 12px", fontSize: "14px",
  color: "var(--foreground)", outline: "none", width: "100%",
} as React.CSSProperties;

// ─── Mobile Preview ────────────────────────────────────────────────────────────
function MobilePreview({ form }: { form: StoreFormData }) {
  const theme = THEMES.find(t => t.id === form.theme) ?? THEMES[0];
  const accent = form.accentColor || theme.accent;

  return (
    <div className="flex flex-col items-center py-6 px-3">
      <div className="flex items-center gap-2 mb-4">
        <Smartphone className="w-3.5 h-3.5 text-primary" />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Vista previa</p>
      </div>

      <div className="relative w-[180px]" style={{ aspectRatio: "9/19" }}>
        <div className="absolute inset-0 rounded-[28px] border-[3px] border-white/15 overflow-hidden shadow-2xl" style={{ background: "#0a0a0f" }}>
          {/* Status bar */}
          <div className="flex justify-between items-center px-3 pt-2 pb-1">
            <span className="text-[7px] text-white/50 font-bold">9:41</span>
            <div className="flex gap-0.5">
              {[1,2,3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-white/40" />)}
            </div>
          </div>

          {/* Promo bar */}
          {form.promoText ? (
            <div className="px-2 py-1 text-center" style={{ background: accent }}>
              <p className="text-[7px] font-bold text-white leading-tight truncate">{form.promoText}</p>
            </div>
          ) : null}

          {/* Banner / Hero */}
          <div className="relative overflow-hidden" style={{ height: 60, background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}>
            {form.bannerUrl && <img src={form.bannerUrl} alt="" className="w-full h-full object-cover mix-blend-overlay opacity-70" />}
            <div className="absolute inset-0 flex items-end px-2 pb-1">
              <div className="flex items-center gap-1.5">
                {form.logoUrl ? (
                  <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/30 flex-shrink-0">
                    <img src={form.logoUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Store className="w-3.5 h-3.5 text-white/80" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[8px] font-black text-white truncate leading-tight">{form.name || "Tu Tienda"}</p>
                  {form.tagline && <p className="text-[6px] text-white/60 italic truncate">{form.tagline}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Stats mini bar */}
          <div className="flex border-b border-white/5" style={{ background: "rgba(255,255,255,0.03)" }}>
            {["Productos", "Delivery", "Ventas"].map(l => (
              <div key={l} className="flex-1 py-1 text-center">
                <p className="text-[8px] font-black" style={{ color: accent }}>—</p>
                <p className="text-[6px] text-white/30">{l}</p>
              </div>
            ))}
          </div>

          {/* Product grid */}
          <div className="p-2 grid grid-cols-2 gap-1.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="aspect-square flex items-center justify-center" style={{ background: `${accent}15` }}>
                  <div className="w-4 h-4 rounded opacity-30" style={{ background: accent }} />
                </div>
                <div className="px-1 py-0.5">
                  <div className="h-1 rounded bg-white/10 mb-0.5" />
                  <div className="h-1 rounded bg-white/20 w-2/3" />
                </div>
              </div>
            ))}
          </div>

          {/* Theme label */}
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[6px] font-bold text-white/50" style={{ background: "rgba(0,0,0,0.4)" }}>
            {theme.emoji} {theme.label}
          </div>
        </div>

        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-3 z-10 rounded-b-xl" style={{ background: "#0a0a0f" }} />
      </div>

      <p className="text-[10px] text-muted-foreground/60 mt-3 text-center leading-snug max-w-[160px]">
        Vista en tiempo real según tus cambios
      </p>
    </div>
  );
}

// ─── Marketing Tips Panel ─────────────────────────────────────────────────────
function MarketingTipsPanel({ activeTab }: { activeTab: string }) {
  const tips = TIPS[activeTab] ?? TIPS.design;
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Guía de Éxito</p>
      </div>
      {tips.map((tip, i) => (
        <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}>
          <span className="text-sm leading-none mt-0.5 flex-shrink-0">{tip.icon}</span>
          <p className="text-[11px] text-amber-200/70 leading-snug">{tip.text}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Section Toggle ────────────────────────────────────────────────────────────
function SectionToggle({ label, icon, desc, value, onChange }: {
  label: string; icon: React.ReactNode; desc: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left"
      style={value
        ? { background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)" }
        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: value ? "rgba(6,182,212,0.2)" : "rgba(255,255,255,0.06)" }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: value ? "#06B6D4" : "var(--foreground)" }}>{label}</p>
        <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
      </div>
      <div className={`w-10 h-6 rounded-full transition-all flex-shrink-0 ${value ? "bg-primary" : "bg-white/10"}`}>
        <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-1 transition-all ${value ? "ml-5" : "ml-1"}`} />
      </div>
    </button>
  );
}

// ─── Store Builder Panel ──────────────────────────────────────────────────────
function StoreBuilderPanel({
  store,
  editingId,
  onClose,
  saving,
  onSave,
}: {
  store: any;
  editingId: number | null;
  onClose: () => void;
  saving: boolean;
  onSave: (body: any) => void;
}) {
  const { user, isManager } = useAuth();
  const isSeller = user?.role === "seller";
  const [activeTab, setActiveTab] = useState("design");
  const [form, setForm] = useState<StoreFormData>(store ? storeToForm(store) : emptyForm);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const f = (key: keyof StoreFormData, val: any) => setForm(p => ({ ...p, [key]: val }));
  const fbc = (key: keyof BuilderConfig, val: any) => setForm(p => ({
    ...p, builderConfig: { ...p.builderConfig, [key]: val }
  }));
  const fsec = (key: keyof BuilderConfig["sections"], val: boolean) => setForm(p => ({
    ...p, builderConfig: { ...p.builderConfig, sections: { ...p.builderConfig.sections, [key]: val } }
  }));

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Logo: solo JPG, PNG o WebP");
      return;
    }
    if (file.size > 15 * 1024 * 1024) { setError("Logo máx. 15 MB"); return; }
    setLogoUploading(true);
    setError("");
    try {
      const { url } = await uploadImage(file, "stores");
      f("logoUrl", url);
    } catch (err: any) {
      setError(err?.message ?? "Error al subir logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Banner: solo JPG, PNG o WebP");
      return;
    }
    if (file.size > 15 * 1024 * 1024) { setError("Banner máx. 15 MB"); return; }
    setBannerUploading(true);
    setError("");
    try {
      const { url } = await uploadImage(file, "stores");
      f("bannerUrl", url);
    } catch (err: any) {
      setError(err?.message ?? "Error al subir banner");
    } finally {
      setBannerUploading(false);
      if (bannerRef.current) bannerRef.current.value = "";
    }
  };

  const buildPaymentDetails = () => {
    const m = form.paymentMethod;
    if (m === "pago_movil") return { bank: form.bank, phone: form.phone, cedula: form.cedula };
    if (m === "zelle" || m === "paypal") return { email: form.email };
    if (m === "transferencia") return { accountNumber: form.accountNumber, accountHolder: form.accountHolder, cedula: form.cedula };
    if (m === "binance") return { walletAddress: form.walletAddress };
    return {};
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.ownerName.trim()) { setError("Nombre de tienda y dueño son requeridos"); return; }
    setError("");
    onSave({
      name: form.name, description: form.description || null, logoUrl: form.logoUrl || null,
      ownerName: form.ownerName, ownerPhone: form.ownerPhone || null, ownerCedula: form.ownerCedula || null,
      paymentMethod: form.paymentMethod, paymentDetails: buildPaymentDetails(),
      tagline: form.tagline || null, city: form.city || null,
      accentColor: form.accentColor || null, promoText: form.promoText || null,
      bannerUrl: form.bannerUrl || null, theme: form.theme || "moderno",
      whatsapp: form.whatsapp || null, instagram: form.instagram || null,
      builderConfig: form.builderConfig,
    });
  };

  const currentTheme = THEMES.find(t => t.id === form.theme) ?? THEMES[0];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* ── Builder Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              {editingId ? "Store Builder" : "Nueva Tienda"}
            </h1>
            <p className="text-[10px] text-muted-foreground">{form.name || "Sin nombre"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(v => !v)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{ background: showPreview ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.06)", color: showPreview ? "#06B6D4" : "var(--muted-foreground)", border: `1px solid ${showPreview ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.08)"}` }}
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? "Ocultar" : "Preview"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl btn-gradient text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Guardando…" : editingId ? "Guardar" : "Crear tienda"}
          </button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] overflow-x-auto flex-shrink-0 bg-card/50">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              style={activeTab === tab.id ? { background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)" } : { border: "1px solid transparent" }}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile preview overlay */}
        {showPreview && (
          <div className="lg:hidden absolute inset-0 z-10 bg-background/95 backdrop-blur-sm flex items-center justify-center">
            <div className="w-full max-w-xs">
              <MobilePreview form={form} />
            </div>
          </div>
        )}

        {/* Form Panel */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">

          {/* ── DISEÑO TAB ── */}
          {activeTab === "design" && (
            <div className="space-y-5">
              {/* Logo */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Image className="w-3.5 h-3.5 text-cyan-400" /> Logo de la tienda
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${currentTheme.from}30, ${currentTheme.to}20)`, border: "1.5px dashed rgba(255,255,255,0.15)" }}>
                    {form.logoUrl
                      ? <img src={form.logoUrl} alt="" className="w-full h-full object-cover" />
                      : logoUploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      : <Store className="w-8 h-8 text-white/20" />}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    <button onClick={() => logoRef.current?.click()} disabled={logoUploading} className="w-full py-2 rounded-xl text-sm text-primary font-medium border border-primary/30 hover:bg-primary/10 transition-colors">
                      {form.logoUrl ? "Cambiar logo" : "📷 Subir logo"}
                    </button>
                    {form.logoUrl && <button onClick={() => f("logoUrl", "")} className="w-full py-1.5 rounded-xl text-xs text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-colors">Quitar</button>}
                    <p className="text-[10px] text-muted-foreground/60 text-center">PNG, JPG · Cuadrado (1:1) · Máx. 15 MB</p>
                  </div>
                </div>
              </div>

              {/* Banner */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Image className="w-3.5 h-3.5 text-purple-400" /> Banner / Portada (16:9)
                </label>
                <div
                  className="relative w-full rounded-2xl overflow-hidden cursor-pointer group border border-dashed border-white/15 hover:border-primary/40 transition-colors"
                  style={{ aspectRatio: "16/5", background: form.bannerUrl ? "transparent" : `linear-gradient(135deg, ${currentTheme.from}20, ${currentTheme.to}10)` }}
                  onClick={() => bannerRef.current?.click()}
                >
                  {form.bannerUrl
                    ? <img src={form.bannerUrl} alt="banner" className="w-full h-full object-cover" />
                    : <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                        {bannerUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Image className="w-8 h-8 opacity-25" />}
                        <span className="text-xs">{bannerUploading ? "Subiendo…" : "Haz que tu negocio brille — sube un banner"}</span>
                        <span className="text-[10px] text-muted-foreground/50">1200×400 px · JPG, PNG · Máx. 8 MB</span>
                      </div>}
                  {form.bannerUrl && <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><span className="text-white text-sm font-semibold">Cambiar banner</span></div>}
                </div>
                <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                {form.bannerUrl && <button onClick={() => f("bannerUrl", "")} className="text-xs text-red-400 hover:underline mt-1">Quitar banner</button>}
              </div>

              {/* Theme selector */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Tema visual
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { f("theme", t.id); f("accentColor", t.accent); }}
                      className="flex flex-col gap-2 p-3 rounded-2xl text-left transition-all"
                      style={form.theme === t.id
                        ? { border: "2px solid rgba(6,182,212,0.6)", background: "rgba(6,182,212,0.08)" }
                        : { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                    >
                      <div className="w-full h-5 rounded-lg" style={{ background: `linear-gradient(90deg, ${t.from}, ${t.to})` }} />
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{t.emoji} {t.label}</span>
                        {form.theme === t.id && <div className="w-3 h-3 rounded-full bg-primary flex items-center justify-center"><Check className="w-2 h-2 text-white" /></div>}
                      </div>
                      <p className="text-[9px] text-muted-foreground leading-tight">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color personalizado */}
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <Palette className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-foreground flex-1">Color de acento</span>
                <input type="color" value={form.accentColor} onChange={e => f("accentColor", e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent" />
                <span className="text-xs font-mono text-muted-foreground w-16">{form.accentColor}</span>
              </div>

              {/* Menu style */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Layout className="w-3.5 h-3.5 text-indigo-400" /> Estilo del menú
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "minimal", label: "Minimalista", desc: "Solo lo esencial, máximo impacto", icon: "◻" },
                    { id: "detailed", label: "Detallado", desc: "Categorías, filtros y descripción completa", icon: "▤" },
                  ].map(style => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => fbc("menuStyle", style.id)}
                      className="flex flex-col gap-1 p-3 rounded-xl text-left transition-all"
                      style={form.builderConfig.menuStyle === style.id
                        ? { border: "1.5px solid rgba(6,182,212,0.5)", background: "rgba(6,182,212,0.08)" }
                        : { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                    >
                      <span className="text-base">{style.icon}</span>
                      <p className="text-xs font-semibold text-foreground">{style.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SECCIONES TAB ── */}
          {activeTab === "sections" && (
            <div className="space-y-4">
              <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}>
                <p className="text-xs text-cyan-300/80 leading-snug">Activa o desactiva las secciones de tu tienda. Los cambios se verán cuando tus clientes la visiten.</p>
              </div>

              <div className="space-y-2.5">
                <SectionToggle
                  label="Hero Banner"
                  icon={<Image className="w-4 h-4" style={{ color: form.builderConfig.sections.hero ? "#06B6D4" : "rgba(255,255,255,0.3)" }} />}
                  desc="Imagen de portada a pantalla completa — primera impresión memorable"
                  value={form.builderConfig.sections.hero}
                  onChange={v => fsec("hero", v)}
                />
                <SectionToggle
                  label="Carrusel de Destacados"
                  icon={<Star className="w-4 h-4" style={{ color: form.builderConfig.sections.carousel ? "#06B6D4" : "rgba(255,255,255,0.3)" }} />}
                  desc="Muestra tus mejores productos en un carrusel interactivo"
                  value={form.builderConfig.sections.carousel}
                  onChange={v => fsec("carousel", v)}
                />
                <SectionToggle
                  label="Video de Marca"
                  icon={<Video className="w-4 h-4" style={{ color: form.builderConfig.sections.video ? "#06B6D4" : "rgba(255,255,255,0.3)" }} />}
                  desc="Video explicativo de tu negocio o producto estrella"
                  value={form.builderConfig.sections.video}
                  onChange={v => fsec("video", v)}
                />
                {form.builderConfig.sections.video && (
                  <div className="ml-2 pl-3 border-l-2 border-primary/30">
                    <label className="text-xs text-muted-foreground mb-1.5 block">URL del video (YouTube / Vimeo)</label>
                    <input
                      style={inputStyle}
                      placeholder="https://youtube.com/watch?v=..."
                      value={form.builderConfig.videoUrl}
                      onChange={e => fbc("videoUrl", e.target.value)}
                    />
                  </div>
                )}
                <SectionToggle
                  label="Testimonios de Clientes"
                  icon={<MessageSquare className="w-4 h-4" style={{ color: form.builderConfig.sections.testimonials ? "#06B6D4" : "rgba(255,255,255,0.3)" }} />}
                  desc="Las reseñas verificadas de clientes reales de tu tienda"
                  value={form.builderConfig.sections.testimonials}
                  onChange={v => fsec("testimonials", v)}
                />
              </div>

              <div className="px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 space-y-1">
                <p className="text-xs text-amber-400/90 leading-snug">
                  💡 Las tiendas con Hero + Video + Testimonios activos convierten <span className="font-bold">3× más</span> que las que solo muestran productos.
                </p>
              </div>
            </div>
          )}

          {/* ── MARKETING TAB ── */}
          {activeTab === "marketing" && (
            <div className="space-y-4">
              {/* Promo bar announcement */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Megaphone className="w-3.5 h-3.5 text-amber-400" /> Barra de Anuncio Superior
                </label>
                <div className="relative">
                  <Megaphone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400" />
                  <input
                    style={{ ...inputStyle, paddingLeft: "32px" }}
                    placeholder="ej. ¡Envíos gratis hoy en toda la tienda! 🚀"
                    value={form.promoText}
                    onChange={e => f("promoText", e.target.value)}
                    maxLength={100}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Se muestra como una barra destacada al tope de tu tienda</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Nombre de la tienda *</label>
                  <input style={inputStyle} placeholder="ej. Tech Store Venezuela" value={form.name} onChange={e => f("name", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Eslogan / Tagline</label>
                  <input style={inputStyle} placeholder="ej. Los mejores precios del mercado" value={form.tagline} onChange={e => f("tagline", e.target.value)} maxLength={80} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Descripción de la tienda</label>
                  <textarea style={{ ...inputStyle, resize: "none" } as React.CSSProperties} placeholder="Cuéntale a tus clientes qué ofreces y por qué elegirte" rows={3} value={form.description} onChange={e => f("description", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Ciudad</label>
                  <input style={inputStyle} placeholder="ej. Caracas, Miranda" value={form.city} onChange={e => f("city", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-green-400" /> WhatsApp</label>
                  <input style={inputStyle} placeholder="+58 412 000 0000" value={form.whatsapp} onChange={e => f("whatsapp", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><AtSign className="w-3.5 h-3.5 text-pink-400" /> Instagram</label>
                  <input style={inputStyle} placeholder="@mitienda (sin @)" value={form.instagram} onChange={e => f("instagram", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── DATOS TAB ── */}
          {activeTab === "owner" && (
            <div className="space-y-3">
              <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}>
                <p className="text-xs text-cyan-300/80">Estos datos identifican al dueño de la tienda. Son privados y solo los usa el equipo de ServiLink.</p>
              </div>
              <input style={inputStyle} placeholder="Nombre completo del dueño *" value={form.ownerName} onChange={e => f("ownerName", e.target.value)} />
              <input style={inputStyle} placeholder="Teléfono de contacto" value={form.ownerPhone} onChange={e => f("ownerPhone", e.target.value)} />
              <input style={inputStyle} placeholder="Cédula de identidad (V-00000000)" value={form.ownerCedula} onChange={e => f("ownerCedula", e.target.value)} />
            </div>
          )}

          {/* ── PAGOS TAB ── */}
          {activeTab === "payment" && (
            <div className="space-y-4">
              <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}>
                <p className="text-xs text-cyan-300/80">Aquí recibirás tus ganancias. Solo el sistema usa estos datos para transferirte tu balance disponible.</p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Método de cobro</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.id} onClick={() => f("paymentMethod", m.id)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${form.paymentMethod === m.id ? "bg-foreground text-background border-foreground" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.paymentMethod === "pago_movil" && (
                <div className="grid grid-cols-1 gap-2">
                  {[["bank", "Banco"], ["phone", "Teléfono"], ["cedula", "Cédula"]].map(([k, l]) => (
                    <input key={k} style={inputStyle} placeholder={l} value={(form as any)[k]} onChange={e => f(k as any, e.target.value)} />
                  ))}
                </div>
              )}
              {(form.paymentMethod === "zelle" || form.paymentMethod === "paypal") && (
                <input style={inputStyle} placeholder="Correo electrónico" value={form.email} onChange={e => f("email", e.target.value)} />
              )}
              {form.paymentMethod === "transferencia" && (
                <div className="grid grid-cols-1 gap-2">
                  {[["accountNumber", "Número de cuenta"], ["accountHolder", "Titular"], ["cedula", "Cédula"]].map(([k, l]) => (
                    <input key={k} style={inputStyle} placeholder={l} value={(form as any)[k]} onChange={e => f(k as any, e.target.value)} />
                  ))}
                </div>
              )}
              {form.paymentMethod === "binance" && (
                <input style={inputStyle} placeholder="Wallet address / Pay ID" value={form.walletAddress} onChange={e => f("walletAddress", e.target.value)} />
              )}

              {!isSeller && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <p className="text-xs text-amber-400/90 leading-snug">
                    💡 <span className="font-semibold">Tip:</span> Ofrece Pago Móvil + Zelle para cubrir el 90% del mercado venezolano.
                  </p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400 px-1">{error}</p>}
        </div>

        {/* Live Preview Panel (lg+) */}
        <div className="hidden lg:flex w-56 xl:w-64 border-l border-white/[0.06] flex-col overflow-y-auto bg-card/30 flex-shrink-0">
          <MobilePreview form={form} />
        </div>

        {/* Tips Sidebar (xl+) */}
        <div className="hidden xl:flex w-64 border-l border-white/[0.06] flex-col overflow-y-auto bg-card/20 flex-shrink-0">
          <MarketingTipsPanel activeTab={activeTab} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CoHostStoresPage() {
  const { user, isManager } = useAuth();
  const isWorker = user?.role === "worker";
  const isSeller = user?.role === "seller";
  const [, navigate] = useLocation();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [commissionData, setCommissionData] = useState<{ commissionPct: number; plan: string; monthlyVolumeUsd: number } | null>(null);

  useEffect(() => {
    if (!user || isWorker) return;
    fetch("/api/user/my-commission", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCommissionData(d); })
      .catch(() => {});
  }, [user, isWorker]);

  const { data: stores = [], isLoading, isError, refetch } = useCohostStores();
  const createStore = useCreateStore();
  const updateStore = useUpdateStore();
  const saving = createStore.isPending || updateStore.isPending;

  const openCreate = () => { setEditingId(null); setEditingStore(null); setShowBuilder(true); };
  const openEdit = (s: any, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingId(s.id); setEditingStore(s); setShowBuilder(true);
  };

  const handleSave = (body: any) => {
    if (editingId) {
      updateStore.mutate({ id: editingId, body }, {
        onSuccess: () => { setShowBuilder(false); setEditingStore(null); setEditingId(null); refetch(); },
        onError: (err: any) => console.error(err),
      });
    } else {
      createStore.mutate(body, {
        onSuccess: () => { setShowBuilder(false); refetch(); },
        onError: (err: any) => console.error(err),
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Store className="w-6 h-6 text-primary" /> {isWorker ? "Mi Tienda" : "Mis Tiendas"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isWorker ? "Vende tus productos en ServiMarket" : "Crea y gestiona tus tiendas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(stores as any[]).length > 0 && (
            <button
              data-testid="bulk-import-stores-header"
              onClick={() => {
                const list = stores as any[];
                const target = list.length === 1 ? `?storeId=${list[0].id}` : "";
                navigate(`/enterprise/import${target}`);
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
              style={{
                background: "rgba(6,182,212,0.10)",
                border: "1px solid rgba(6,182,212,0.35)",
                color: "rgb(165,243,252)",
              }}
              title="Sube CSV o Excel para crear productos en masa"
            >
              <FileUp className="w-4 h-4" /> Importar productos
            </button>
          )}
          <button onClick={openCreate} className="btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nueva tienda
          </button>
        </div>
      </div>

      {/* Commission info banner — sellers ven su fee de venta; gestores ven sus
          comisiones por volumen. Cohost legacy / dueño de tienda no ve nada. */}
      {!isWorker && commissionData && (isSeller || isManager) && (
        isSeller ? (
          <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: commissionData.plan === "premium" ? "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.08))" : "rgba(255,255,255,0.04)", border: commissionData.plan === "premium" ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.08)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(6,182,212,0.12)" }}>
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-foreground">Pagas <span style={{ color: commissionData.plan === "premium" ? "#A78BFA" : "#F87171" }}>{commissionData.commissionPct}%</span> por cada venta</span>
              <p className="text-xs text-muted-foreground mt-0.5">{commissionData.plan === "premium" ? "Comisión reducida con Plan Premium" : "Con Premium pagas solo 7%"}</p>
            </div>
            {commissionData.plan !== "premium" && (
              <button onClick={() => navigate("/cohost/plan")} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.3)" }}>
                <Zap className="w-3.5 h-3.5" /> Baja a 7%
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: commissionData.plan === "premium" ? "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.08))" : "rgba(255,255,255,0.04)", border: commissionData.plan === "premium" ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.08)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: commissionData.plan === "premium" ? "rgba(139,92,246,0.25)" : "rgba(6,182,212,0.12)" }}>
              <TrendingUp className="w-5 h-5" style={{ color: commissionData.plan === "premium" ? "#A78BFA" : "#06B6D4" }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-foreground">Tu comisión actual: <span style={{ color: commissionData.plan === "premium" ? "#A78BFA" : "#06B6D4" }}>{commissionData.commissionPct}%</span></span>
              <p className="text-xs text-muted-foreground mt-0.5">{commissionData.plan === "premium" ? `Vol. mensual: $${commissionData.monthlyVolumeUsd.toFixed(0)}` : "Plan Gratis · Comisión fija del 5%"}</p>
            </div>
            {commissionData.plan !== "premium" && (
              <button onClick={() => navigate("/cohost/plan")} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.3)" }}>
                <Zap className="w-3.5 h-3.5" /> Hasta 10%
              </button>
            )}
          </div>
        )
      )}

      {isSeller && <SellerPremiumBanner compact />}

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <SkeletonCard key={i} lines={3} />)}</div>
      ) : isError ? (
        <QueryError message="No se pudieron cargar tus tiendas" onRetry={() => refetch()} />
      ) : (stores as any[]).length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Store className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-foreground font-medium">{isWorker ? "Aún no tienes una tienda" : "No tienes tiendas aún"}</p>
          <p className="text-sm text-muted-foreground mt-1">Crea tu primera tienda para empezar a vender</p>
          <button onClick={openCreate} className="mt-4 btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Crear tienda
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {(stores as any[]).map((s: any) => (
            <div key={s.id} className="glass rounded-2xl overflow-hidden hover:ring-1 hover:ring-primary/40 transition-all">
              {s.bannerUrl && (
                <div className="w-full" style={{ aspectRatio: "16/4", background: "#12131a" }}>
                  <img src={s.bannerUrl} alt="" className="w-full h-full object-cover opacity-70" />
                </div>
              )}
              <div className="flex items-center gap-4 p-4">
                <button onClick={() => navigate(`/cohost/stores/${s.id}`)} className="flex-1 flex items-center gap-4 text-left min-w-0">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.06] overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {s.logoUrl ? <img src={s.logoUrl} alt="" className="w-full h-full object-cover" /> : <Store className="w-7 h-7 text-muted-foreground opacity-40" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{s.name}</h3>
                      {!s.isActive && <span className="text-xs bg-red-400/20 text-red-400 px-2 py-0.5 rounded-full">Inactiva</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.ownerName}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-emerald-400 font-medium flex items-center gap-1"><DollarSign className="w-3 h-3" /> Saldo: ${s.balanceUsd.toFixed(2)}</span>
                      {!isWorker && (isSeller
                        ? <span className="text-xs text-muted-foreground">Fee: {s.cohostCommissionPct}%</span>
                        : <span className="text-xs text-muted-foreground">Comisión: {s.cohostCommissionPct}%</span>)}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => openEdit(s, e)}
                    title="Store Builder"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                    style={{ background: "rgba(6,182,212,0.1)", color: "#06B6D4", border: "1px solid rgba(6,182,212,0.25)" }}
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Builder
                  </button>
                  <button onClick={() => navigate(`/cohost/stores/${s.id}`)} title="Ver productos" className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Store Builder (full-screen) */}
      {showBuilder && (
        <StoreBuilderPanel
          store={editingStore}
          editingId={editingId}
          onClose={() => { setShowBuilder(false); setEditingStore(null); setEditingId(null); }}
          saving={saving}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
