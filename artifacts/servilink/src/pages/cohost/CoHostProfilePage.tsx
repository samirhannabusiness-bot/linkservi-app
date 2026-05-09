import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { uploadImage } from "@/lib/upload-image";
import { Save, User, Mail, Phone, Shield, Camera, Loader2, CheckCircle, X } from "lucide-react";
import { format } from "date-fns";
import { BiometricSettings } from "@/components/ui/BiometricSettings";

async function updateProfile(name: string, phone: string) {
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ name, phone }),
  });
  if (!res.ok) throw new Error("Error al actualizar");
  return res.json();
}

async function uploadAvatar(file: File, token: string): Promise<any> {
  const { url: avatarUrl } = await uploadImage(file, "profile");
  const saveRes = await fetch("/api/profile/avatar", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ avatarUrl }),
  });
  if (!saveRes.ok) throw new Error("Error al guardar la foto");
  return saveRes.json();
}

export function CoHostProfilePage() {
  const { user, token, setAuth } = useAuth() as any;
  const isSeller = user?.role === "seller";
  const [form, setForm] = useState({ name: user?.name ?? "", phone: user?.phone ?? "" });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    if (user) setForm({ name: user.name, phone: user.phone ?? "" });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await updateProfile(form.name, form.phone);
      setAuth({ ...user, ...updated }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setAvatarError("Solo se permiten imágenes (JPG, PNG, WebP)."); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError("La imagen no puede superar 5 MB."); return; }
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
      const updated = await uploadAvatar(avatarFile, token);
      setAuth({ ...user, ...updated }, token);
      setAvatarStatus("done");
      setAvatarFile(null);
      setAvatarPreview(null);
      setTimeout(() => setAvatarStatus("idle"), 2500);
    } catch (e: any) {
      setAvatarStatus("error");
      setAvatarError(e.message ?? "Error inesperado");
    }
  };

  const cancelAvatarChange = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarError("");
    setAvatarStatus("idle");
  };

  const currentAvatar = avatarPreview ?? user?.avatarUrl;

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Mi Perfil</h1>

        {/* Avatar card */}
        <div className="p-5 bg-card border border-border rounded-xl">
          <p className="text-sm font-semibold text-foreground mb-4">Foto de perfil</p>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt={user?.name}
                  className="w-20 h-20 rounded-full object-cover ring-2 ring-violet-500/30"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400 font-bold text-3xl">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}
              {avatarStatus === "done" && (
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center shadow-lg hover:bg-violet-600 transition-colors"
                title="Cambiar foto"
              >
                <Camera className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground text-base truncate">{user?.name}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {isSeller ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold">Vendedor</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">Host</span>
                )}
                {user?.createdAt && (
                  <span className="text-xs text-muted-foreground">desde {format(new Date(user.createdAt), "MM/yyyy")}</span>
                )}
              </div>
            </div>
          </div>

          {avatarFile && avatarStatus !== "done" && (
            <div className="mt-4 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-3">
              <p className="text-xs font-semibold text-violet-400">Nueva foto seleccionada — ¿Guardar?</p>
              {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveAvatar}
                  disabled={avatarStatus === "uploading"}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-violet-600 transition-colors"
                >
                  {avatarStatus === "uploading" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</>
                  ) : (
                    <><Save className="w-3.5 h-3.5" /> Guardar foto</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={cancelAvatarChange}
                  className="px-3 py-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {avatarStatus === "done" && (
            <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm font-semibold">
              <CheckCircle className="w-4 h-4" /> Foto actualizada correctamente
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </div>

        {/* Info form */}
        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-foreground">Información personal</h2>

          {error && <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-800 text-red-400 text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <User className="w-3.5 h-3.5 inline mr-1" />Nombre completo
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <Mail className="w-3.5 h-3.5 inline mr-1" />Correo electrónico
            </label>
            <input
              type="email"
              value={user?.email ?? ""}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted text-muted-foreground text-sm cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">El correo no se puede cambiar</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <Phone className="w-3.5 h-3.5 inline mr-1" />Teléfono
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+58-412-0000000"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-colors ${saved ? "bg-emerald-500 text-white" : "bg-violet-500 text-white hover:bg-violet-600"} disabled:opacity-50`}
          >
            <Save className="w-4 h-4" />
            {saved ? "¡Guardado!" : saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>

        <BiometricSettings />

        <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-800">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Seguridad de la cuenta</p>
              <p className="text-xs text-amber-400/80 mt-1">
                Tu información está protegida y nunca es compartida con terceros sin tu consentimiento.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
