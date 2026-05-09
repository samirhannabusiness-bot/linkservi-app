import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGetMyWorkerProfile, useUpdateMyWorkerProfile, useListCategories } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getRequestOptions, getAuthHeader, apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/upload-image";
import { ServiScore } from "@/components/ui/ServiScore";
import {
  Save, Plus, X, DollarSign, MapPin, ChevronDown, Camera, Loader2,
  CheckCircle, BadgeCheck, Star, Clock, MessageSquare, CalendarDays,
  Pencil, Trash2, ListOrdered, Image as ImageIcon, User, ChevronRight,
  Eye, Zap, Tag,
} from "lucide-react";
import { VENEZUELA_STATES, getCitiesForState } from "@/lib/venezuela-locations";
import { BiometricSettings } from "@/components/ui/BiometricSettings";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";

const MAX_PHOTOS = 6;

type Tab = "perfil" | "servicios" | "portafolio";

interface MenuItem {
  id: number;
  name: string;
  basePrice: number;
  description?: string | null;
  isActive?: boolean;
}

function avatarInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ─── Profile Preview Card ─────────────────────────────────────────────────────
function ProfilePreviewCard({
  avatarUrl, name, category, state, city, basePrice, description, isVerified, rating, completedJobs, skills,
  onBook, onInquiry,
}: any) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Cover gradient */}
      <div className="h-20 bg-gradient-to-br from-emerald-600/30 via-teal-600/20 to-blue-600/20 relative">
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: "radial-gradient(circle at 30% 50%, rgba(16,185,129,0.4) 0%, transparent 60%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent" />
      </div>

      {/* Avatar + info */}
      <div className="px-4 pb-4 -mt-8 relative">
        <div className="flex items-end gap-3 mb-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name}
              className="w-16 h-16 rounded-2xl object-cover ring-4 ring-card shadow-lg flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl ring-4 ring-card shadow-lg flex-shrink-0">
              {avatarInitials(name)}
            </div>
          )}
          <div className="flex-1 min-w-0 mb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-bold text-foreground text-sm truncate">{name ?? "Tu nombre"}</p>
              {isVerified && <BadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />}
            </div>
            {category && <p className="text-xs text-muted-foreground truncate">{category}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
          {(state || city) && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="w-3 h-3" />{[city, state].filter(Boolean).join(", ")}
            </span>
          )}
          {basePrice && (
            <span className="flex items-center gap-1 font-semibold text-emerald-500">
              <DollarSign className="w-3 h-3" />Desde ${basePrice}
            </span>
          )}
          {rating != null && rating > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <Star className="w-3 h-3 fill-amber-500" />{Number(rating).toFixed(1)}
            </span>
          )}
          <ServiScore rating={rating ?? 0} completedJobs={completedJobs ?? 0} isVerified={isVerified} size="sm" />
        </div>

        {description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{description}</p>
        )}

        {skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {skills.slice(0, 4).map((s: string) => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{s}</span>
            ))}
            {skills.length > 4 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">+{skills.length - 4}</span>}
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex gap-2">
          <button
            onClick={onBook}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" />Reservar servicio
          </button>
          <button
            onClick={onInquiry}
            className="flex-1 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />Cotización
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function WorkerProfileEdit() {
  const opts = getRequestOptions();
  const { user, token, setAuth } = useAuth() as any;
  const { data: profile, refetch } = useGetMyWorkerProfile(opts as any);
  const { data: categories = [] } = useListCategories();

  const [activeTab, setActiveTab] = useState<Tab>("perfil");
  const [form, setForm] = useState({
    categoryId: "",
    description: "",
    basePrice: 10,
    servicePrice: 50,
    skills: [] as string[],
    state: "",
    city: "",
  });
  const [newSkill, setNewSkill] = useState("");
  const [saved, setSaved] = useState(false);

  // Avatar
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [avatarError, setAvatarError] = useState("");

  // Portfolio
  const [portfolioPhotos, setPortfolioPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Service menu
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingItem, setSavingItem] = useState(false);

  const cities = form.state ? getCitiesForState(form.state) : [];

  useEffect(() => {
    if (profile) {
      const p = profile as any;
      setForm({
        categoryId: p.categoryId ? String(p.categoryId) : "",
        description: p.description ?? "",
        basePrice: p.basePrice ?? p.hourlyRate ?? 10,
        servicePrice: p.servicePrice ?? p.fixedPrice ?? 50,
        skills: p.skills ?? [],
        state: p.state ?? "",
        city: p.city ?? "",
      });
      setPortfolioPhotos(p.portfolioPhotos ?? []);
    }
  }, [profile]);

  // Load menu items from API
  const loadMenuItems = async () => {
    setMenuLoading(true);
    try {
      const data = await apiFetch("/api/my/services", { headers: getAuthHeader() });
      setMenuItems(data ?? []);
    } catch {
      setMenuItems([]);
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadMenuItems();
  }, [token]);

  const { mutate: updateProfile, isPending } = useUpdateMyWorkerProfile({
    ...opts,
    mutation: {
      onSuccess: () => {
        setSaved(true);
        refetch();
        setTimeout(() => setSaved(false), 2500);
        toast({ title: "✅ Perfil actualizado correctamente" });
      },
    },
  } as any);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      data: {
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        description: form.description,
        basePrice: form.basePrice,
        servicePrice: form.servicePrice,
        hourlyRate: form.basePrice,
        fixedPrice: form.servicePrice,
        skills: form.skills,
        state: form.state || null,
        city: form.city || null,
      } as any,
    });
  };

  const addSkill = () => {
    const s = newSkill.trim();
    if (s && !form.skills.includes(s)) {
      setForm(f => ({ ...f, skills: [...f.skills, s] }));
      setNewSkill("");
    }
  };

  const removeSkill = (skill: string) => setForm(f => ({ ...f, skills: f.skills.filter(s => s !== skill) }));

  // Avatar handlers
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setAvatarError("Solo imágenes JPG, PNG o WebP."); return; }
    if (file.size > 15 * 1024 * 1024) { setAvatarError("La imagen no puede superar 15 MB."); return; }
    setAvatarError("");
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarStatus("idle");
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile || !token) return;
    setAvatarStatus("uploading");
    setAvatarError("");
    try {
      const { url: avatarUrl } = await uploadImage(avatarFile, "profile");
      const saveRes = await fetch("/api/profile/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ avatarUrl }),
      });
      if (!saveRes.ok) throw new Error("Error al guardar la foto");
      const updated = await saveRes.json();
      setAuth({ ...user, ...updated }, token);
      setAvatarStatus("done");
      setAvatarFile(null);
      setAvatarPreview(null);
      setTimeout(() => setAvatarStatus("idle"), 2500);
    } catch (err: any) {
      setAvatarStatus("error");
      setAvatarError(err.message ?? "Error inesperado");
    }
  };

  // Portfolio handlers
  const savePhotos = async (photos: string[]) => {
    await fetch("/api/workers/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ portfolioPhotos: photos }),
    });
    refetch();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target) return;
    e.target.value = "";
    if (!file) return;
    if (portfolioPhotos.length >= MAX_PHOTOS) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic)$/i)) {
      setUploadError("Solo se permiten imágenes JPG, PNG o WebP");
      setTimeout(() => setUploadError(""), 3000);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError("La imagen no puede superar 8 MB");
      setTimeout(() => setUploadError(""), 3000);
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const { url } = await uploadImage(file, "general");
      const newPhotos = [...portfolioPhotos, url];
      setPortfolioPhotos(newPhotos);
      await savePhotos(newPhotos);
    } catch (err: any) {
      setUploadError(err.message ?? "Error al subir la foto");
      setTimeout(() => setUploadError(""), 4000);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (path: string) => {
    const newPhotos = portfolioPhotos.filter(p => p !== path);
    setPortfolioPhotos(newPhotos);
    await savePhotos(newPhotos);
  };

  // Menu item handlers (API-backed)
  const addMenuItem = async () => {
    const name = newItemName.trim();
    const price = parseFloat(newItemPrice);
    if (!name || isNaN(price) || price <= 0) return;
    setSavingItem(true);
    try {
      await apiFetch("/api/my/services", {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ name, basePrice: price }),
      });
      setNewItemName("");
      setNewItemPrice("");
      await loadMenuItems();
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al agregar servicio", variant: "destructive" });
    } finally {
      setSavingItem(false);
    }
  };

  const removeMenuItem = async (id: number) => {
    try {
      await apiFetch(`/api/my/services/${id}`, { method: "DELETE", headers: getAuthHeader() });
      setMenuItems(prev => prev.filter(m => m.id !== id));
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al eliminar servicio", variant: "destructive" });
    }
  };

  const startEdit = (item: MenuItem) => {
    setEditingItem(item.id);
    setEditName(item.name);
    setEditPrice(String(item.basePrice));
  };

  const saveEdit = async (id: number) => {
    const name = editName.trim();
    const price = parseFloat(editPrice);
    if (!name || isNaN(price) || price <= 0) { setEditingItem(null); return; }
    setSavingItem(true);
    try {
      await apiFetch(`/api/my/services/${id}`, {
        method: "PUT",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ name, basePrice: price }),
      });
      setMenuItems(prev => prev.map(m => m.id === id ? { ...m, name, basePrice: price } : m));
      setEditingItem(null);
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al guardar servicio", variant: "destructive" });
    } finally {
      setSavingItem(false);
    }
  };

  const [, navigate] = useLocation();
  const w = profile as any;
  const workerId = w?.id;
  const currentAvatar = avatarPreview ?? user?.avatarUrl;
  const selectedCategory = (categories as any[]).find((c: any) => String(c.id) === form.categoryId);
  const selectClass = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none";

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "perfil",     label: "Perfil",     icon: <User className="w-3.5 h-3.5" /> },
    { key: "servicios",  label: "Servicios",  icon: <ListOrdered className="w-3.5 h-3.5" /> },
    { key: "portafolio", label: "Portafolio", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-5">

        {/* ── Page header ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Mi Servicio</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Edita tu perfil profesional</p>
          </div>
          <button
            onClick={() => workerId && navigate(`/client/worker/${workerId}`)}
            disabled={!workerId}
            className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1.5 rounded-lg border border-border hover:text-foreground hover:bg-muted hover:border-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="w-3.5 h-3.5" />
            Vista previa
          </button>
        </div>

        {/* ── Profile preview card ────────────────────────────────────────── */}
        <ProfilePreviewCard
          avatarUrl={currentAvatar}
          name={user?.name}
          category={selectedCategory ? `${selectedCategory.icon} ${selectedCategory.name}` : null}
          state={form.state}
          city={form.city}
          basePrice={form.basePrice}
          description={form.description}
          isVerified={w?.isVerified}
          rating={w?.rating}
          completedJobs={w?.completedJobs}
          skills={form.skills}
          onBook={() => workerId && navigate(`/client/book/${workerId}`)}
          onInquiry={() => workerId && navigate(`/client/worker/${workerId}`)}
        />

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex bg-muted/50 border border-border rounded-xl p-1 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.key
                  ? "bg-card shadow-sm text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: PERFIL
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "perfil" && (
          <div className="space-y-4">

            {/* Avatar card */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Foto de perfil</p>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  {currentAvatar ? (
                    <img src={currentAvatar} alt={user?.name}
                      className="w-20 h-20 rounded-2xl object-cover ring-2 ring-emerald-500/30" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-2xl">
                      {avatarInitials(user?.name)}
                    </div>
                  )}
                  {avatarStatus === "done" && (
                    <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-emerald-400" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="w-4 h-4 text-primary-foreground" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  {w?.isVerified && (
                    <div className="flex items-center gap-1 mt-1">
                      <BadgeCheck className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs text-blue-500 font-medium">Verificado</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {w?.rating > 0 && (
                      <span className="flex items-center gap-1 text-xs text-amber-500">
                        <Star className="w-3 h-3 fill-amber-500" />{Number(w.rating).toFixed(1)}
                      </span>
                    )}
                    {w?.completedJobs > 0 && (
                      <span className="text-xs text-muted-foreground">{w.completedJobs} trabajos</span>
                    )}
                  </div>
                </div>
              </div>

              {avatarFile && avatarStatus !== "done" && (
                <div className="mt-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                  <p className="text-xs font-semibold text-emerald-400">Nueva foto — ¿Guardar?</p>
                  {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSaveAvatar} disabled={avatarStatus === "uploading"}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                      {avatarStatus === "uploading"
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Subiendo...</>
                        : <><Save className="w-3.5 h-3.5" />Guardar foto</>}
                    </button>
                    <button type="button"
                      onClick={() => { setAvatarFile(null); setAvatarPreview(null); setAvatarError(""); setAvatarStatus("idle"); }}
                      className="px-3 py-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              {avatarStatus === "done" && (
                <div className="mt-3 flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                  <CheckCircle className="w-4 h-4" />Foto actualizada correctamente
                </div>
              )}
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
            </div>

            {/* Main form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Category */}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoría</p>
                <div className="relative">
                  <select value={form.categoryId}
                    onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                    className={selectClass}>
                    <option value="">Seleccionar categoría</option>
                    {(categories as any[]).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Description */}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Descripción profesional</p>
                  <p className="text-xs text-muted-foreground">Cuéntale a los clientes tu experiencia y forma de trabajo</p>
                </div>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={4}
                  placeholder="Ej: Más de 5 años de experiencia en instalaciones eléctricas residenciales y comerciales. Trabajo limpio, puntual y garantizado..."
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <p className="text-xs text-muted-foreground/60 text-right">{form.description.length}/500 caracteres</p>
              </div>

              {/* Location */}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ubicación</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Estado</label>
                    <div className="relative">
                      <select value={form.state}
                        onChange={e => setForm(f => ({ ...f, state: e.target.value, city: "" }))}
                        className={selectClass}>
                        <option value="">Seleccionar...</option>
                        {VENEZUELA_STATES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Ciudad</label>
                    <div className="relative">
                      <select value={form.city}
                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                        className={selectClass}
                        disabled={!form.state}>
                        <option value="">{form.state ? "Seleccionar..." : "Primero elige estado"}</option>
                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
                {form.state && form.city && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                    <MapPin className="w-3 h-3" />
                    <span>Clientes en <strong>{form.city}, {form.state}</strong> te encontrarán</span>
                  </div>
                )}
              </div>

              {/* Pricing */}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Precio referencial</p>
                  <p className="text-xs text-muted-foreground">Guía de precios que los clientes ven en tu perfil</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Tarifa mínima (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
                      <input type="number" min={1}
                        value={form.basePrice}
                        onChange={e => setForm(f => ({ ...f, basePrice: Number(e.target.value) }))}
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Precio de salida / mínimo</p>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Servicio completo (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
                      <input type="number" min={1}
                        value={form.servicePrice}
                        onChange={e => setForm(f => ({ ...f, servicePrice: Number(e.target.value) }))}
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Trabajo típico completo</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2 border border-border">
                  <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                  Los clientes verán: <strong className="text-emerald-500">Desde ${form.basePrice}</strong> · Servicio completo desde <strong className="text-foreground">${form.servicePrice}</strong>
                </div>
              </div>

              {/* Skills */}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Habilidades</p>
                  <p className="text-xs text-muted-foreground">Aparecen como etiquetas en tu perfil</p>
                </div>
                <div className="flex gap-2">
                  <input type="text"
                    value={newSkill}
                    onChange={e => setNewSkill(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addSkill())}
                    placeholder="Ej: Instalación eléctrica..."
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <button type="button" onClick={addSkill}
                    className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 flex-shrink-0">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {form.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.skills.map(s => (
                      <span key={s} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {s}
                        <button type="button" onClick={() => removeSkill(s)} className="hover:text-red-500 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Save button */}
              <button type="submit" disabled={isPending}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                  saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
                } disabled:opacity-50`}>
                {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando...</> :
                  saved ? <><CheckCircle className="w-4 h-4" />¡Cambios guardados!</> :
                  <><Save className="w-4 h-4" />Guardar cambios</>}
              </button>
            </form>

            <BiometricSettings />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: SERVICIOS (MENÚ)
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "servicios" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Menú de servicios</p>
              </div>
              <p className="text-xs text-muted-foreground">Define cada servicio que ofreces con su precio. Los clientes lo verán en tu perfil.</p>
            </div>

            {/* Existing items */}
            <div className="space-y-2">
              {menuLoading && (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Cargando servicios...</span>
                </div>
              )}

              {!menuLoading && menuItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-card border border-dashed border-border rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <ListOrdered className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Sin servicios todavía</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Agrega los servicios que ofreces con sus precios</p>
                  </div>
                </div>
              )}

              {menuItems.map(item => (
                <div key={item.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {editingItem === item.id ? (
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-[1fr,auto] gap-3">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Nombre del servicio"
                          className="px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          autoFocus
                        />
                        <div className="relative w-28">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <input
                            type="number" min={1}
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(item.id)} disabled={savingItem}
                          className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                          {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Guardar
                        </button>
                        <button onClick={() => setEditingItem(null)} disabled={savingItem}
                          className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                        <p className="text-lg font-black text-emerald-500 leading-tight">${Number(item.basePrice).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(item)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeMenuItem(item.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add new item */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agregar servicio</p>
              <div className="grid grid-cols-[1fr,auto] gap-3">
                <input
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addMenuItem())}
                  placeholder="Nombre del servicio..."
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number" min={1}
                    value={newItemPrice}
                    onChange={e => setNewItemPrice(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addMenuItem())}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <button
                onClick={addMenuItem}
                disabled={!newItemName.trim() || !newItemPrice || parseFloat(newItemPrice) <= 0 || savingItem}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {savingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {savingItem ? "Guardando..." : "Agregar servicio"}
              </button>
            </div>

            {menuItems.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border rounded-xl px-3 py-2.5">
                <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                Los clientes verán tu menú de <strong className="text-foreground">{menuItems.length} servicios</strong> directamente en tu perfil
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: PORTAFOLIO
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "portafolio" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Portafolio de trabajos</p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">
                  {portfolioPhotos.length}/{MAX_PHOTOS}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Muestra fotos de tus trabajos anteriores. Los clientes las ven en tu perfil y generan más confianza.
              </p>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 gap-3">
              {portfolioPhotos.map((path, i) => (
                <div key={path} className="relative aspect-video rounded-2xl overflow-hidden bg-muted group">
                  <img
                    src={`/api/storage${path}`}
                    alt={`Trabajo ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = ""; }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <button
                      onClick={() => removePhoto(path)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-9 h-9 rounded-xl bg-red-600/90 text-white flex items-center justify-center shadow-lg"
                      title="Eliminar foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-white">{i + 1}</span>
                  </div>
                </div>
              ))}

              {portfolioPhotos.length < MAX_PHOTOS && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-video rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                      <span className="text-xs text-muted-foreground">Subiendo...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <Plus className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">Agregar foto</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <X className="w-3.5 h-3.5 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            {portfolioPhotos.length === 0 && !uploading && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center bg-card border border-dashed border-border rounded-2xl">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Sin fotos todavía</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Los perfiles con fotos reciben 2x más solicitudes</p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Subir primera foto
                </button>
              </div>
            )}

            {portfolioPhotos.length > 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || portfolioPhotos.length >= MAX_PHOTOS}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-40"
              >
                <Camera className="w-4 h-4" />
                {portfolioPhotos.length >= MAX_PHOTOS ? `Límite de ${MAX_PHOTOS} fotos alcanzado` : "Agregar más fotos"}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
        )}

      </div>
    </AppLayout>
  );
}
