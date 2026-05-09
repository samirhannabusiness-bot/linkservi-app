import { useRef, useState, useCallback } from "react";
import { Camera, ImageIcon, Upload, Eye, X, AlertCircle } from "lucide-react";
import { InAppCamera, type InAppCameraWatermark } from "@/components/ui/InAppCamera";

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ACCEPTED_FORMATS = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Lightbox({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[99] bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
      >
        <X className="w-5 h-5 text-white" />
      </button>
      <img
        src={src}
        alt={label}
        className="max-w-full max-h-[85vh] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <p className="text-white/60 text-sm mt-3">{label}</p>
    </div>
  );
}

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card rounded-t-2xl p-4 pb-safe animate-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
    </div>
  );
}

interface ImagePickerFieldProps {
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (base64: string) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
  allowPdf?: boolean;
  /** Use the in-app camera (getUserMedia) instead of the OS camera. */
  inAppCamera?: boolean;
  /** When inAppCamera is true, applies a watermark on the captured photo. */
  watermark?: InAppCameraWatermark;
  /** Front (user) camera by default for selfies. */
  facingMode?: "user" | "environment";
  /** Hides the gallery option (forces the user to take a fresh photo). */
  cameraOnly?: boolean;
}

export function ImagePickerField({
  label,
  sublabel,
  icon,
  value,
  onChange,
  onError: onErrorProp,
  disabled = false,
  allowPdf = false,
  inAppCamera = false,
  watermark,
  facingMode = "environment",
  cameraOnly = false,
}: ImagePickerFieldProps) {
  // Default to a no-op alert so callers that omit onError still get feedback
  // and the component never crashes with "onError is not a function".
  const onError = useCallback(
    (msg: string) => {
      if (onErrorProp) { onErrorProp(msg); return; }
      if (msg) {
        // eslint-disable-next-line no-alert
        try { alert(msg); } catch { /* ignore */ }
      }
    },
    [onErrorProp]
  );
  const [showSheet, setShowSheet] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showInApp, setShowInApp] = useState(false);

  // Two separate refs: one for camera, one for gallery
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const accept = allowPdf
    ? "image/jpeg,image/jpg,image/png,image/webp,application/pdf"
    : "image/jpeg,image/jpg,image/png,image/webp";

  const processFile = useCallback(
    async (file: File) => {
      // Format validation (skip for PDF)
      if (file.type !== "application/pdf" && !ACCEPTED_FORMATS.includes(file.type)) {
        onError("Formato no válido. Usa JPG, PNG o WEBP.");
        return;
      }
      // Size validation
      if (file.size > MAX_SIZE_BYTES) {
        onError(`El archivo supera los 15 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
        return;
      }
      onError("");
      setProcessing(true);
      try {
        const base64 = await readFileAsBase64(file);
        onChange(base64);
      } catch {
        onError("No se pudo procesar la imagen. Intenta con otra.");
      } finally {
        setProcessing(false);
      }
    },
    [onChange, onError]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so same file can be re-selected if needed
      e.target.value = "";
      setShowSheet(false);
      processFile(file);
    },
    [processFile]
  );

  const openCamera = () => {
    setShowSheet(false);
    if (inAppCamera) {
      setTimeout(() => setShowInApp(true), 50);
      return;
    }
    // Use timeout to ensure sheet closes before triggering input (iOS requirement)
    setTimeout(() => cameraInputRef.current?.click(), 50);
  };

  const handleInAppCapture = useCallback(
    (file: File) => {
      void processFile(file);
    },
    [processFile],
  );

  const openGallery = () => {
    setShowSheet(false);
    setTimeout(() => galleryInputRef.current?.click(), 50);
  };

  const isPdf = value?.startsWith("data:application/pdf");

  return (
    <>
      {/* Hidden inputs — always in DOM so iOS can trigger them from user gesture */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={accept}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
        disabled={disabled}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {value ? (
        // Preview state
        <div className="relative group w-full">
          {isPdf ? (
            <div className="w-full h-28 rounded-xl border border-border bg-muted/40 flex flex-col items-center justify-center gap-1">
              <ImageIcon className="w-7 h-7 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">PDF subido</p>
            </div>
          ) : (
            <img
              src={value}
              alt={label}
              className="w-full h-28 object-cover rounded-xl border border-border"
            />
          )}

          {/* Hover/tap overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 active:opacity-100 rounded-xl transition-opacity flex items-center justify-center gap-2">
            {!isPdf && (
              <button
                type="button"
                onClick={() => setLightbox(true)}
                className="p-2 bg-white/20 rounded-full backdrop-blur-sm"
                aria-label="Ver imagen completa"
              >
                <Eye className="w-4 h-4 text-white" />
              </button>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="p-2 bg-white/20 rounded-full backdrop-blur-sm"
                aria-label="Quitar imagen"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Always-visible mobile action buttons */}
          <div className="flex gap-1.5 mt-2">
            {!isPdf && (
              <button
                type="button"
                onClick={() => setLightbox(true)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-muted text-xs text-foreground font-medium hover:bg-muted/80"
              >
                <Eye className="w-3.5 h-3.5" /> Ver
              </button>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-xs text-red-600 dark:text-red-400 font-medium hover:bg-red-200"
              >
                <X className="w-3.5 h-3.5" /> Cambiar
              </button>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground mt-1 truncate">{label}</p>
        </div>
      ) : (
        // Upload zone
        <button
          type="button"
          disabled={disabled || processing}
          onClick={() => setShowSheet(true)}
          className="w-full min-h-[7rem] rounded-xl border-2 border-dashed border-border bg-muted/20 hover:border-primary hover:bg-primary/5 active:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1.5 px-3 py-4 text-center"
        >
          {processing ? (
            <>
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted-foreground">Procesando…</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                {icon ?? <Upload className="w-5 h-5 text-muted-foreground" />}
              </div>
              <p className="text-xs font-semibold text-foreground">{label}</p>
              {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
              <span className="mt-0.5 text-xs text-primary font-medium flex items-center gap-1">
                <Camera className="w-3 h-3" /> Tomar foto o subir
              </span>
            </>
          )}
        </button>
      )}

      {/* Bottom sheet picker */}
      <BottomSheet open={showSheet} onClose={() => setShowSheet(false)}>
        <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground mb-4">{sublabel}</p>}

        <div className="flex flex-col gap-3 mt-3">
          <button
            type="button"
            onClick={openCamera}
            className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold">Tomar foto</p>
              <p className="text-xs opacity-80">Usar la cámara del dispositivo</p>
            </div>
          </button>

          {!cameraOnly && (
            <button
              type="button"
              onClick={openGallery}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-muted hover:bg-muted/80 active:scale-[0.98] transition-all"
            >
              <div className="w-9 h-9 rounded-full bg-background flex items-center justify-center border border-border">
                <ImageIcon className="w-5 h-5 text-foreground" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-foreground text-sm">Elegir de la galería</p>
                <p className="text-xs text-muted-foreground">Seleccionar desde el almacenamiento</p>
              </div>
            </button>
          )}

          {allowPdf && (
            <p className="text-center text-xs text-muted-foreground">
              También acepta archivos PDF
            </p>
          )}

          <div className="flex items-start gap-2 px-1 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              JPG, PNG{allowPdf ? ", PDF" : ""}. Máximo 15 MB. La imagen debe ser clara y legible.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSheet(false)}
          className="w-full mt-2 py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted"
        >
          Cancelar
        </button>
      </BottomSheet>

      {/* Lightbox */}
      {lightbox && !isPdf && (
        <Lightbox src={value} label={label} onClose={() => setLightbox(false)} />
      )}

      {/* In-app camera */}
      {inAppCamera && (
        <InAppCamera
          open={showInApp}
          onClose={() => setShowInApp(false)}
          onCapture={handleInAppCapture}
          facingMode={facingMode}
          watermark={watermark}
          title={label}
          subtitle={sublabel}
        />
      )}
    </>
  );
}
