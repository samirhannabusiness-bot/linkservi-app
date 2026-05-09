import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Car, Loader2, AlertCircle, CheckCircle2, Clock, ArrowLeft,
  Camera, Image as ImageIcon, X, Bike, Truck, Wrench,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useSeo } from "@/lib/seo-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DriverSetupPage
//
// Formulario obligatorio que aparece tras activar el rol "Conductor".
// Captura los datos del vehículo y los guarda en /api/profile/driver-profile.
//
// Mejoras UX:
//  - Selector de tipo de vehículo con tarjetas visuales e iconos.
//  - Sugerencias de marca y modelo dinámicas según el tipo (datalist).
//  - Campo extra "tipo de grúa" sólo cuando el vehículo es grúa.
//  - Subida real de la foto del vehículo (cámara móvil + galería + dropzone +
//    preview), con validación de formato (jpg/png/webp) y tamaño (≤15 MB).
//  - Foto obligatoria en el primer registro; al editar se conserva la actual.
// ─────────────────────────────────────────────────────────────────────────────

type VehicleType = "moto" | "carro" | "camioneta" | "grua";

interface VehicleTypeMeta {
  value: VehicleType;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  brands: string[];
  models: string[];
  brandPlaceholder: string;
  modelPlaceholder: string;
  photoHint: string;
}

const VEHICLE_TYPES: VehicleTypeMeta[] = [
  {
    value: "moto",
    label: "Moto",
    Icon: Bike,
    brands: ["Yamaha", "Honda", "Suzuki", "Bera", "Empire", "Skygo", "Kawasaki", "Bajaj"],
    models: ["FZ", "BWS", "MT-03", "CBF 150", "AX-100", "Pulsar", "Ronco", "Owen", "Socialista"],
    brandPlaceholder: "Ej: Yamaha",
    modelPlaceholder: "Ej: FZ",
    photoHint: "Toma una foto clara de tu moto, completa, de lado.",
  },
  {
    value: "carro",
    label: "Carro",
    Icon: Car,
    brands: ["Toyota", "Chevrolet", "Ford", "Hyundai", "Kia", "Renault", "Nissan", "Mazda", "Fiat", "Jeep", "Volkswagen"],
    models: ["Corolla", "Aveo", "Spark", "Optra", "Fiesta", "Accent", "Picanto", "Logan", "Sentra", "Skyline"],
    brandPlaceholder: "Ej: Toyota",
    modelPlaceholder: "Ej: Corolla",
    photoHint: "Toma una foto clara de tu carro, completo, de lado.",
  },
  {
    value: "camioneta",
    label: "Camioneta",
    Icon: Car,
    brands: ["Toyota", "Chevrolet", "Ford", "Mitsubishi", "Nissan", "Jeep", "Hyundai", "Kia", "Mazda"],
    models: ["Hilux", "Fortuner", "Silverado", "Blazer", "Explorer", "Tucson", "Sportage", "BT-50", "Grand Vitara"],
    brandPlaceholder: "Ej: Toyota",
    modelPlaceholder: "Ej: Hilux",
    photoHint: "Toma una foto clara de tu camioneta, completa, de lado.",
  },
  {
    value: "grua",
    label: "Grúa",
    Icon: Wrench,
    brands: ["Mack", "International", "Ford", "Chevrolet", "Mercedes-Benz", "Hino", "Iveco", "Freightliner"],
    models: ["F-350", "F-750", "NPR", "DT-466", "Atego", "Hustler", "Cargo", "Granite"],
    brandPlaceholder: "Ej: Ford",
    modelPlaceholder: "Ej: F-350",
    photoHint: "Toma una foto clara de la grúa completa, mostrando la plataforma o el brazo.",
  },
];

const TOW_SUBTYPES = [
  { value: "plataforma", label: "Plataforma" },
  { value: "arrastre",   label: "Arrastre" },
  { value: "otro",       label: "Otro" },
] as const;

interface DriverProfile {
  userId: number;
  vehicleType: VehicleType;
  vehicleSubtype: string | null;
  brand: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  photoUrl: string | null;
  status: "pending_verification" | "approved" | "rejected";
}

const CURRENT_YEAR = new Date().getFullYear();
const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// Convierte un objectPath devuelto por el backend (`/objects/uploads/xxx`) en
// la URL pública servida por la API (`/api/storage/objects/uploads/xxx`).
function resolvePhotoSrc(stored: string | null): string | null {
  if (!stored) return null;
  if (stored.startsWith("blob:") || stored.startsWith("data:") || stored.startsWith("http")) {
    return stored;
  }
  if (stored.startsWith("/objects/")) return `/api/storage${stored}`;
  if (stored.startsWith("/api/storage")) return stored;
  return stored;
}

export function DriverSetupPage() {
  useSeo({ title: "Datos del vehículo — LinkServi", noIndex: true });
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<DriverProfile | null>(null);

  const [vehicleType, setVehicleType] = useState<VehicleType | "">("");
  const [vehicleSubtype, setVehicleSubtype] = useState<string>("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));
  const [color, setColor] = useState("");
  const [plate, setPlate] = useState("");

  // Foto: guardamos el path final (objectPath del storage) y un blob local
  // para mostrar preview inmediato durante/después del upload.
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [photoLocalPreview, setPhotoLocalPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const typeMeta = VEHICLE_TYPES.find((t) => t.value === vehicleType);
  const isGrua = vehicleType === "grua";

  // ── Carga el perfil existente al montar ────────────────────────────────────
  useEffect(() => {
    apiFetch<{ profile: DriverProfile | null }>("/api/profile/driver-profile")
      .then((r) => {
        if (r?.profile) {
          const p = r.profile;
          setExisting(p);
          setVehicleType(p.vehicleType);
          setVehicleSubtype(p.vehicleSubtype ?? "");
          setBrand(p.brand);
          setModel(p.model);
          setYear(String(p.year));
          setColor(p.color);
          setPlate(p.plate);
          setPhotoUrl(p.photoUrl ?? "");
        }
      })
      .catch(() => { /* sin perfil aún — formulario en blanco */ })
      .finally(() => setLoading(false));
  }, []);

  // ── Limpiar object URL cuando el componente se desmonta ────────────────────
  useEffect(() => {
    return () => {
      if (photoLocalPreview) URL.revokeObjectURL(photoLocalPreview);
    };
  }, [photoLocalPreview]);

  // ── Subida real de la foto al storage ──────────────────────────────────────
  async function uploadPhoto(file: File) {
    setPhotoError("");

    // Validación cliente
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Formato no soportado. Usa JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("La foto no debe pesar más de 15 MB.");
      return;
    }

    // Preview inmediato
    if (photoLocalPreview) URL.revokeObjectURL(photoLocalPreview);
    const localUrl = URL.createObjectURL(file);
    setPhotoLocalPreview(localUrl);
    setUploadingPhoto(true);

    try {
      // 1) pedir URL firmada
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("No se pudo iniciar la carga.");
      const { uploadURL, objectPath } = await urlRes.json();

      // 2) subir el archivo directo al bucket
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Error al subir la foto. Inténtalo de nuevo.");

      setPhotoUrl(objectPath);
    } catch (e: any) {
      setPhotoError(e?.message ?? "Error al subir la foto.");
      setPhotoLocalPreview(null);
      setPhotoUrl("");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadPhoto(file);
    // reset input value to allow re-picking the same file
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadPhoto(file);
  }

  function handleClearPhoto() {
    if (photoLocalPreview) URL.revokeObjectURL(photoLocalPreview);
    setPhotoLocalPreview(null);
    setPhotoUrl("");
    setPhotoError("");
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!vehicleType) { setError("Selecciona el tipo de vehículo"); return; }
    if (isGrua && !vehicleSubtype) { setError("Selecciona el tipo de grúa"); return; }
    if (!brand.trim()) { setError("Marca requerida"); return; }
    if (!model.trim()) { setError("Modelo requerido"); return; }
    if (!color.trim()) { setError("Color requerido"); return; }
    if (!plate.trim()) { setError("Placa requerida"); return; }
    const yNum = Number(year);
    if (!Number.isInteger(yNum) || yNum < 1980 || yNum > CURRENT_YEAR + 1) {
      setError("Año inválido"); return;
    }
    if (uploadingPhoto) { setError("Espera a que termine la carga de la foto"); return; }
    if (!photoUrl) { setError("La foto del vehículo es obligatoria"); return; }

    setSaving(true);
    try {
      const r = await apiFetch<{ profile: DriverProfile }>("/api/profile/driver-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType,
          vehicleSubtype: isGrua ? vehicleSubtype : null,
          brand, model, year: yNum,
          color, plate, photoUrl: photoUrl.trim() || null,
        }),
      });
      if (r?.profile) setExisting(r.profile);
      navigate("/driver/transport");
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar el vehículo");
    } finally {
      setSaving(false);
    }
  };

  // ── Estilos compartidos ───────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(15,23,42,0.8)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#f1f5f9",
    fontSize: 14,
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  const photoSrc = photoLocalPreview ?? resolvePhotoSrc(photoUrl);

  return (
    <AppLayout>
      <div className="px-4 py-6 max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label="Volver"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Car className="w-5 h-5 text-sky-400" />
              Datos del vehículo
            </h1>
            <p className="text-xs text-muted-foreground">
              Completa estos datos para usar el modo Conductor
            </p>
          </div>
        </div>

        {/* Estado del perfil */}
        {existing && existing.status === "pending_verification" && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-400/10" data-testid="status-pending">
            <Clock className="w-4 h-4 text-amber-300" />
            <span className="text-xs text-amber-100">Tu vehículo está en revisión. Puedes editar los datos mientras tanto.</span>
          </div>
        )}
        {existing && existing.status === "approved" && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10" data-testid="status-approved">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span className="text-xs text-emerald-100">Vehículo verificado. Cualquier cambio reinicia la revisión.</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={cardStyle} className="space-y-5" data-testid="driver-setup-form">
            {/* Tipo de vehículo — tarjetas visuales */}
            <div>
              <label style={labelStyle}>Tipo de vehículo</label>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Tipo de vehículo">
                {VEHICLE_TYPES.map((t) => {
                  const selected = vehicleType === t.value;
                  const Icon = t.Icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setVehicleType(t.value);
                        if (t.value !== "grua") setVehicleSubtype("");
                      }}
                      data-testid={`vehicle-type-${t.value}`}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all ${
                        selected
                          ? "bg-sky-500/15 border-sky-400 text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]"
                          : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tipo de grúa — sólo cuando aplica */}
            {isGrua && (
              <div>
                <label htmlFor="vehicleSubtype" style={labelStyle}>Tipo de grúa</label>
                <select
                  id="vehicleSubtype"
                  value={vehicleSubtype}
                  onChange={(e) => setVehicleSubtype(e.target.value)}
                  style={inputStyle}
                  required
                  data-testid="select-vehicle-subtype"
                >
                  <option value="">Selecciona…</option>
                  {TOW_SUBTYPES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Marca / Modelo con sugerencias por tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="brand" style={labelStyle}>Marca</label>
                <input
                  id="brand" value={brand} onChange={(e) => setBrand(e.target.value)}
                  placeholder={typeMeta?.brandPlaceholder ?? "Marca"}
                  list={typeMeta ? `brands-${typeMeta.value}` : undefined}
                  style={inputStyle} required maxLength={60}
                  data-testid="input-brand"
                  autoComplete="off"
                />
                {typeMeta && (
                  <datalist id={`brands-${typeMeta.value}`}>
                    {typeMeta.brands.map((b) => <option key={b} value={b} />)}
                  </datalist>
                )}
              </div>
              <div>
                <label htmlFor="model" style={labelStyle}>Modelo</label>
                <input
                  id="model" value={model} onChange={(e) => setModel(e.target.value)}
                  placeholder={typeMeta?.modelPlaceholder ?? "Modelo"}
                  list={typeMeta ? `models-${typeMeta.value}` : undefined}
                  style={inputStyle} required maxLength={60}
                  data-testid="input-model"
                  autoComplete="off"
                />
                {typeMeta && (
                  <datalist id={`models-${typeMeta.value}`}>
                    {typeMeta.models.map((m) => <option key={m} value={m} />)}
                  </datalist>
                )}
              </div>
            </div>

            {/* Año / Color */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="year" style={labelStyle}>Año</label>
                <input
                  id="year" type="number" inputMode="numeric"
                  min={1980} max={CURRENT_YEAR + 1}
                  value={year} onChange={(e) => setYear(e.target.value)}
                  style={inputStyle} required
                  data-testid="input-year"
                />
              </div>
              <div>
                <label htmlFor="color" style={labelStyle}>Color</label>
                <input
                  id="color" value={color} onChange={(e) => setColor(e.target.value)}
                  placeholder="Negro"
                  style={inputStyle} required maxLength={30}
                  data-testid="input-color"
                />
              </div>
            </div>

            {/* Placa */}
            <div>
              <label htmlFor="plate" style={labelStyle}>Placa</label>
              <input
                id="plate" value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC123"
                style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: 1 }}
                required maxLength={12}
                data-testid="input-plate"
              />
            </div>

            {/* Foto del vehículo — uploader real */}
            <div>
              <label style={labelStyle}>Foto del vehículo</label>

              {/* Input nativo oculto. capture="environment" abre la cámara
                  trasera en móvil; en desktop abre el selector de archivos. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-photo-file"
              />

              {photoSrc ? (
                <div
                  className="relative rounded-xl overflow-hidden border border-white/10 bg-black/30"
                  data-testid="photo-preview"
                >
                  <img src={photoSrc} alt="Vista previa del vehículo" className="w-full h-44 object-cover" />
                  {uploadingPhoto && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-white text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Subiendo…
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-semibold flex items-center gap-1"
                      data-testid="button-change-photo"
                    >
                      <Camera className="w-3.5 h-3.5" /> Cambiar
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPhoto}
                      className="w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                      aria-label="Quitar foto"
                      data-testid="button-clear-photo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Subir foto del vehículo"
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  data-testid="photo-dropzone"
                  className={`flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                    dragOver
                      ? "border-sky-400 bg-sky-400/10"
                      : "border-white/15 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {uploadingPhoto ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-sky-300" />
                      <span className="text-xs text-slate-300">Subiendo foto…</span>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-sky-500/15 border border-sky-400/30 flex items-center justify-center">
                        <Camera className="w-5 h-5 text-sky-300" />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-foreground">Subir foto del vehículo</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Toca para tomar una foto o seleccionar de tu galería
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
                <ImageIcon className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  {typeMeta?.photoHint ?? "Toma una foto clara de tu vehículo."}{" "}
                  Formatos: JPG, PNG o WEBP. Máximo 15 MB.
                </span>
              </p>

              {photoError && (
                <p className="text-xs text-red-300 mt-2 flex items-center gap-1.5" data-testid="photo-error">
                  <AlertCircle className="w-3.5 h-3.5" /> {photoError}
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-400/30 bg-red-400/10" data-testid="error-msg">
                <AlertCircle className="w-4 h-4 text-red-300" />
                <span className="text-xs text-red-100">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-[#040c1a] text-sm font-bold transition-colors"
              data-testid="button-save-driver-profile"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                </span>
              ) : existing ? "Guardar cambios" : "Enviar para verificación"}
            </button>

            <p className="text-[11px] text-muted-foreground text-center">
              Tu vehículo entra en revisión apenas lo envías. Te avisamos cuando esté aprobado.
            </p>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
