import { useState, useRef } from "react";
import { Camera, Upload, X, Check, Image as ImageIcon } from "lucide-react";
import { getAuthHeader } from "@/lib/api";

interface Props {
  bookingId: number;
  photoType: "before" | "after";
  label: string;
  onUploaded?: (photo: any) => void;
}

export function ServicePhotoUpload({ bookingId, photoType, label, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("La imagen no debe superar 8 MB"); return; }
    setError("");
    setUploading(true);

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    try {
      // Step 1: get presigned URL
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("No se pudo obtener URL de carga");
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: upload to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Error al subir la foto");

      // Step 3: register with API
      const photoRes = await fetch("/api/service-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ bookingId, photoType, imageUrl: objectPath }),
      });
      if (!photoRes.ok) {
        const d = await photoRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Error al registrar la foto");
      }
      const photo = await photoRes.json();
      setSuccess(true);
      onUploaded?.(photo);
    } catch (e: any) {
      setError(e.message ?? "Error al subir la foto");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  if (success && previewUrl) {
    return (
      <div className="relative rounded-xl overflow-hidden border-2 border-emerald-300 dark:border-emerald-700">
        <img src={previewUrl} alt={label} className="w-full h-32 object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">
            <Check className="w-3.5 h-3.5" /> Foto {photoType === "before" ? "Antes" : "Después"} guardada
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed transition-all text-sm font-medium ${uploading ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/50 cursor-pointer"} ${photoType === "before" ? "border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400" : "border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400"}`}
      >
        {uploading ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Subiendo...
          </>
        ) : (
          <>
            <Camera className="w-4 h-4" />
            {label}
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

// ── ServicePhotoGallery — displayed to both client and worker ─────────────────
interface Photo {
  id: number;
  photoType: string;
  imageUrl: string;
  createdAt: string;
}

interface GalleryProps {
  bookingId: number;
  photos?: Photo[];
}

export function ServicePhotoGallery({ bookingId, photos: initialPhotos }: GalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos ?? []);
  const [loading, setLoading] = useState(!initialPhotos);
  const [expanded, setExpanded] = useState<string | null>(null);

  useState(() => {
    if (initialPhotos) return;
    setLoading(true);
    fetch(`/api/service-photos/booking/${bookingId}`, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setPhotos)
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  if (loading) return <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />;
  if (photos.length === 0) return null;

  const before = photos.filter(p => p.photoType === "before");
  const after = photos.filter(p => p.photoType === "after");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground">Fotos del servicio</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {before.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">📷 Antes</p>
            <div className="grid grid-cols-1 gap-1">
              {before.map(p => (
                <img
                  key={p.id}
                  src={`/api/storage${p.imageUrl}`}
                  alt="Antes del servicio"
                  className="w-full h-28 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity border border-blue-200 dark:border-blue-800"
                  onClick={() => setExpanded(`/api/storage${p.imageUrl}`)}
                />
              ))}
            </div>
          </div>
        )}
        {after.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">✅ Después</p>
            <div className="grid grid-cols-1 gap-1">
              {after.map(p => (
                <img
                  key={p.id}
                  src={`/api/storage${p.imageUrl}`}
                  alt="Después del servicio"
                  className="w-full h-28 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity border border-orange-200 dark:border-orange-800"
                  onClick={() => setExpanded(`/api/storage${p.imageUrl}`)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpanded(null)}
        >
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <img src={expanded} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}
