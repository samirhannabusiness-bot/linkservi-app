import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, RotateCcw, RefreshCw, ImageOff, MapPin, Check } from "lucide-react";

export interface InAppCameraWatermark {
  workerName?: string;
  includeTimestamp?: boolean;
  includeGps?: boolean;
  brand?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  facingMode?: "user" | "environment";
  watermark?: InAppCameraWatermark;
  title?: string;
  subtitle?: string;
}

const MAX_DIM = 1600;

function formatStamp(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fileNameStamp(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function getGps(): Promise<{ lat: number; lng: number; acc: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 30000 },
    );
  });
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lines: string[],
  brand: string,
) {
  if (lines.length === 0 && !brand) return;
  const fontSize = Math.max(14, Math.round(w * 0.022));
  const padding = Math.round(fontSize * 0.7);
  const lineH = Math.round(fontSize * 1.35);
  const boxH = lines.length * lineH + padding * 2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, h - boxH, w, boxH);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.fillText(line, padding, h - boxH + padding + i * lineH);
  });
  if (brand) {
    ctx.font = `700 ${Math.round(fontSize * 1.05)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = "rgba(34, 211, 238, 0.95)";
    const brandW = ctx.measureText(brand).width;
    ctx.fillText(brand, w - brandW - padding, h - boxH + padding);
  }
}

export function InAppCamera({
  open,
  onClose,
  onCapture,
  facingMode: initialFacing = "environment",
  watermark,
  title = "Toma la foto",
  subtitle,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">(initialFacing);
  const [error, setError] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [gpsHint, setGpsHint] = useState<string>("");

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* noop */ }
    }
  }, []);

  const start = useCallback(async (mode: "user" | "environment") => {
    setError("");
    setStarting(true);
    stopStream();
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Tu navegador no soporta la cámara. Usa la opción alternativa.");
      }
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        v.setAttribute("autoplay", "true");
        v.muted = true;
        try { await v.play(); } catch { /* iOS may need a tap */ }
      }
    } catch (e: any) {
      const msg = e?.name === "NotAllowedError"
        ? "Permiso de cámara denegado. Habilítalo en los ajustes del navegador."
        : e?.name === "NotFoundError"
        ? "No se detectó ninguna cámara en este dispositivo."
        : e?.message ?? "No se pudo abrir la cámara.";
      setError(msg);
    } finally {
      setStarting(false);
    }
  }, [stopStream]);

  // Open / close lifecycle
  useEffect(() => {
    if (!open) {
      stopStream();
      setPreview((p) => {
        if (p) { try { URL.revokeObjectURL(p.url); } catch { /* noop */ } }
        return null;
      });
      setError("");
      return;
    }
    setFacing(initialFacing);
    void start(initialFacing);
    return () => { stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pre-warm GPS hint
  useEffect(() => {
    if (!open || !watermark?.includeGps) { setGpsHint(""); return; }
    let cancel = false;
    void getGps().then((g) => {
      if (cancel) return;
      setGpsHint(g ? `GPS ±${Math.round(g.acc)}m listo` : "GPS no disponible");
    });
    return () => { cancel = true; };
  }, [open, watermark?.includeGps]);

  const flip = useCallback(() => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    void start(next);
  }, [facing, start]);

  const capture = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) {
      setError("La cámara aún no está lista. Espera un momento.");
      return;
    }
    setBusy(true);
    try {
      let w = v.videoWidth;
      let h = v.videoHeight;
      const scale = Math.min(1, MAX_DIM / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no disponible");
      // Mirror for selfie so the saved image matches the preview
      if (facing === "user") {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, 0, 0, w, h);
      if (facing === "user") {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // Watermark
      if (watermark) {
        const lines: string[] = [];
        const now = new Date();
        if (watermark.includeTimestamp !== false) lines.push(formatStamp(now));
        if (watermark.workerName) lines.push(watermark.workerName);
        if (watermark.includeGps) {
          const g = await getGps();
          if (g) {
            lines.push(`Lat ${g.lat.toFixed(5)}, Lng ${g.lng.toFixed(5)} (±${Math.round(g.acc)}m)`);
          }
        }
        drawWatermark(ctx, w, h, lines, watermark.brand ?? "LinkServi");
      }

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("No se pudo generar la imagen");
      const file = new File([blob], `linkservi-${fileNameStamp(new Date())}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setPreview({ url, file });
    } catch (e: any) {
      setError(e?.message ?? "No se pudo capturar la foto.");
    } finally {
      setBusy(false);
    }
  }, [facing, watermark]);

  const confirm = useCallback(() => {
    if (!preview) return;
    onCapture(preview.file);
    URL.revokeObjectURL(preview.url);
    setPreview(null);
    onClose();
  }, [preview, onCapture, onClose]);

  const retake = useCallback(() => {
    if (preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
    void start(facing);
  }, [preview, facing, start]);

  const onFallbackFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      onCapture(f);
      onClose();
    },
    [onCapture, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col" role="dialog" aria-label={title}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Cerrar cámara"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {subtitle && <p className="text-xs opacity-70 leading-tight">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={flip}
          className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Cambiar cámara"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white gap-3">
            <ImageOff className="w-10 h-10 opacity-70" />
            <p className="text-sm opacity-90">{error}</p>
            <button
              type="button"
              onClick={() => fallbackInputRef.current?.click()}
              className="mt-2 px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur text-sm font-medium active:scale-95 transition-transform"
            >
              Usar la cámara del sistema
            </button>
            <input
              ref={fallbackInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={onFallbackFile}
            />
          </div>
        ) : preview ? (
          <img
            src={preview.url}
            alt="Vista previa"
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`absolute inset-0 w-full h-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
            />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
                <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />
                Iniciando cámara…
              </div>
            )}
            {/* Hints */}
            <div
              className="absolute left-0 right-0 px-4 pointer-events-none flex flex-wrap gap-2 justify-center"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 8.5rem)" }}
            >
              {watermark?.includeGps && gpsHint && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-black/55 text-white backdrop-blur">
                  <MapPin className="w-3 h-3" /> {gpsHint}
                </span>
              )}
              {watermark?.workerName && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-black/55 text-white backdrop-blur">
                  {watermark.workerName}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="px-6 pt-4 pb-6 bg-black"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
      >
        {preview ? (
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/15 text-white text-sm font-semibold active:scale-95 transition-transform"
            >
              <RotateCcw className="w-4 h-4" /> Repetir
            </button>
            <button
              type="button"
              onClick={confirm}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 text-black text-sm font-bold active:scale-95 transition-transform"
            >
              <Check className="w-4 h-4" /> Usar foto
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={capture}
              disabled={busy || starting || !!error}
              className="w-[72px] h-[72px] rounded-full bg-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform shadow-[0_0_0_4px_rgba(255,255,255,0.25)]"
              aria-label="Capturar"
            >
              {busy ? (
                <div className="w-7 h-7 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Camera className="w-7 h-7 text-black" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
