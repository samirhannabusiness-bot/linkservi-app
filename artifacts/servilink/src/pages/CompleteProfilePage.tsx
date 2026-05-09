import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Zap, Camera, Upload, CheckCircle, Loader2, AlertCircle, User,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { VENEZUELA_STATES, getCitiesForState } from "@/lib/venezuela-locations";
import { useSeo } from "@/lib/seo-helpers";
import { uploadImage } from "@/lib/upload-image";

async function saveProfile(token: string, data: Record<string, string>): Promise<any> {
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Error al guardar datos");
  }
  return res.json();
}

async function saveAvatar(token: string, avatarUrl: string): Promise<any> {
  const res = await fetch("/api/profile/avatar", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ avatarUrl }),
  });
  if (!res.ok) throw new Error("No se pudo guardar la foto");
  return res.json();
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function CompleteProfilePage() {
  useSeo({ title: "Completar perfil — LinkServi", noIndex: true });
  const { user, token, setAuth } = useAuth();
  const [, navigate] = useLocation();

  // If user already has state/city filled (they've completed step 1 before),
  // skip straight to the photo step. This prevents existing users from seeing
  // a blank "new account" form when redirected here just to add a photo.
  const alreadyHasInfo = !!(user?.state && user?.city);
  const [step, setStep] = useState(alreadyHasInfo ? 2 : 1);

  // Step 1 state
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [step1Saving, setStep1Saving] = useState(false);
  const [step1Error, setStep1Error] = useState("");

  // Step 2 state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoStatus, setPhotoStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [photoError, setPhotoError] = useState("");

  const cities = state ? getCitiesForState(state) : [];
  const dashboardUrl = user?.role === "worker" ? "/professional" : "/client";

  // ── Step 1: save name/phone/state/city ────────────────────────────────────
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setStep1Error("Ingresa tu nombre completo."); return; }
    if (!state) { setStep1Error("Selecciona tu estado."); return; }
    if (!city) { setStep1Error("Selecciona tu ciudad."); return; }
    setStep1Error("");
    setStep1Saving(true);
    try {
      const updated = await saveProfile(token!, {
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        state,
        city,
      });
      if (user) setAuth({ ...user, ...updated }, token!);
      setStep(2);
    } catch (err: any) {
      setStep1Error(err.message ?? "Error al guardar datos");
    } finally {
      setStep1Saving(false);
    }
  };

  // ── Step 2: photo ─────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Solo se permiten imágenes (JPG, PNG, WebP)."); return; }
    if (file.size > 5 * 1024 * 1024) { setPhotoError("La imagen no puede superar 5 MB."); return; }
    setPhotoError("");
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSavePhoto = async () => {
    if (!selectedFile || !token) return;
    setPhotoStatus("uploading");
    setPhotoError("");
    try {
      const { url: avatarUrl } = await uploadImage(selectedFile, "profile");
      const updated = await saveAvatar(token, avatarUrl);
      setPhotoStatus("done");
      if (user) setAuth({ ...user, ...updated }, token);
      setTimeout(() => navigate(dashboardUrl), 800);
    } catch (e: any) {
      setPhotoStatus("error");
      setPhotoError(e.message ?? "Error inesperado");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, #0B0F19 0%, #0f1724 50%, #111827 100%)" }}
    >
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full pointer-events-none"
           style={{ background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)" }} />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 rounded-full pointer-events-none"
           style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />

      <div className="w-full max-w-sm relative z-10 py-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-11 h-11 rounded-2xl btn-gradient flex items-center justify-center shadow-lg glow-cyan">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">LinkServi</span>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-2 h-2 rounded-full transition-all ${step >= 1 ? "bg-cyan-400" : "bg-white/20"}`} />
          <div className={`w-8 h-0.5 transition-all ${step >= 2 ? "bg-cyan-400" : "bg-white/10"}`} />
          <div className={`w-2 h-2 rounded-full transition-all ${step >= 2 ? "bg-cyan-400" : "bg-white/20"}`} />
        </div>

        <div className="glass-strong rounded-3xl p-8">

          {/* ── STEP 1 — Basic Info ────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-white mb-1">Cuéntanos sobre ti</h1>
                <p className="text-white/45 text-sm">Paso 1 de 2 · Solo tarda 30 segundos</p>
              </div>

              {step1Error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {step1Error}
                </div>
              )}

              <form onSubmit={handleStep1} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-glass"
                    placeholder="Juan García"
                    autoComplete="name"
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                    Teléfono <span className="normal-case font-normal opacity-70">(opcional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input-glass"
                    placeholder="+58-412-0000000"
                    autoComplete="tel"
                  />
                </div>

                {/* State */}
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                    Estado <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={state}
                      onChange={(e) => { setState(e.target.value); setCity(""); }}
                      className="input-glass appearance-none pr-10 [&>option]:bg-[#0f1724] [&>option]:text-white"
                      required
                    >
                      <option value="">Selecciona tu estado</option>
                      {VENEZUELA_STATES.map((s) => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                  </div>
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                    Ciudad <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="input-glass appearance-none pr-10 [&>option]:bg-[#0f1724] [&>option]:text-white"
                      disabled={!state}
                      required
                    >
                      <option value="">{state ? "Selecciona tu ciudad" : "Primero elige un estado"}</option>
                      {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={step1Saving}
                  className="btn-gradient w-full py-3.5 text-sm mt-1 flex items-center justify-center gap-2"
                >
                  {step1Saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                  ) : (
                    <>Continuar <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs text-white/25 hover:text-white/40 transition-colors"
                >
                  Saltar por ahora
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2 — Photo ────────────────────────────────────────────── */}
          {step === 2 && (
            photoStatus === "done" ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">¡Perfil completado!</h2>
                  <p className="text-white/50 text-sm mt-1">Redirigiendo a tu panel...</p>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  {user?.name && (
                    <p className="text-cyan-400 text-sm font-medium mb-2">
                      Hola, {user.name.split(" ")[0]} 👋
                    </p>
                  )}
                  <h1 className="text-xl font-bold text-white mb-1">Solo falta tu foto</h1>
                  <p className="text-white/45 text-sm">
                    Tu cuenta está activa. Agrega una foto para que{" "}
                    {user?.role === "worker" ? "los clientes" : "los profesionales"} puedan reconocerte.
                  </p>
                </div>

                {/* Avatar picker */}
                <div className="flex flex-col items-center gap-4 mb-6">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="relative group cursor-pointer"
                  >
                    <div className={`w-28 h-28 rounded-full overflow-hidden flex items-center justify-center transition-all duration-200
                      ${preview
                        ? "border-2 border-cyan-400/50 ring-4 ring-cyan-400/10"
                        : "border-2 border-dashed border-white/20 bg-white/[0.03] hover:border-cyan-400/40 hover:bg-white/[0.06]"}`}>
                      {preview ? (
                        <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <User className="w-9 h-9 text-white/20" />
                          <span className="text-xs text-white/30">Sin foto</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-1 right-1 w-8 h-8 rounded-full btn-gradient flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                  >
                    <Upload className="w-4 h-4" />
                    {preview ? "Cambiar foto" : "Seleccionar foto"}
                  </button>

                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </div>

                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5 mb-5 text-xs text-white/35 space-y-0.5">
                  <p>• Formatos: JPG, PNG, WebP · Máximo 5 MB</p>
                  <p>• Usa una foto clara de tu rostro</p>
                </div>

                {photoError && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-4">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {photoError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSavePhoto}
                  disabled={!selectedFile || photoStatus === "uploading"}
                  className="btn-gradient w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {photoStatus === "uploading" ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Subiendo foto...</>
                  ) : "Guardar y continuar"}
                </button>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => navigate(dashboardUrl)}
                    className="text-xs text-white/25 hover:text-white/40 transition-colors"
                  >
                    Saltar por ahora (funciones limitadas)
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
