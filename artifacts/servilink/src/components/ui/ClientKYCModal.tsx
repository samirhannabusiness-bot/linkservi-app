/**
 * ClientKYCModal — Selfie-Fast identity verification
 * Intercepts critical actions (book, chat) and guides the user through
 * a frictionless 2-photo flow before unlocking the action.
 *
 * Flow:
 *   Step 0 (intro)    → "¡Casi listo!" welcome with benefits
 *   Step 1 (selfie)   → Front-camera selfie capture
 *   Step 2 (document) → Document photo capture
 *   Step 3 (sending)  → Optimistic submit + unlock
 */

import { useState, useRef, useCallback } from "react";
import {
  Shield, Camera, CheckCircle, ChevronRight, X,
  Smile, FileText, Loader2, BadgeCheck, AlertCircle,
} from "lucide-react";
import { getAuthHeader } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClientKYCModalProps {
  onSuccess: () => void;          // called when docs submitted (optimistic unlock)
  onDismiss: () => void;          // called when user cancels
  rejectionNote?: string | null;  // if status === "rejected", show the reason
  isRejected?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MAX_BYTES = 5 * 1024 * 1024;

// Compress + resize image using Canvas API before base64 encoding.
// Modern smartphone cameras produce 8–12 MB photos; this brings them
// down to ≈ 200–500 KB so two images fit well within the server's 20 MB limit.
function compressAndReadAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX_DIM = 1280; // px — enough detail for facial recognition
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
          else                 { width = Math.round(width * MAX_DIM / height);  height = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.80)); // JPEG q=0.80 ≈ 200–600 KB
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

async function submitVerification(data: {
  selfieImageUrl: string;
  documentImageUrl: string;
  documentType: string;
}) {
  const res = await fetch("/api/me/verification", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "Error al enviar verificación");
  }
  return res.json();
}

// ── Camera capture tile ───────────────────────────────────────────────────────
function PhotoTile({
  value,
  onCapture,
  facingMode = "environment",
  label,
  sublabel,
  guide,
}: {
  value: string;
  onCapture: (base64: string) => void;
  facingMode?: "user" | "environment";
  label: string;
  sublabel: string;
  guide: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState("");

  const process = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) { setErr("Imagen muy grande (máx 5 MB)"); return; }
    setProcessing(true);
    setErr("");
    try {
      const b64 = await compressAndReadAsBase64(file);
      onCapture(b64);
    } catch {
      setErr("No se pudo procesar la imagen");
    } finally {
      setProcessing(false);
    }
  }, [onCapture]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    process(f);
  };

  if (value) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/40 bg-black">
          <img src={value} alt={label} className="w-full object-contain max-h-56" />
          <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" /> Tomar de nuevo
        </button>
        <input ref={inputRef} type="file" accept="image/*" capture={facingMode} className="sr-only" onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Guide frame */}
      <div className="relative rounded-2xl bg-black/60 border-2 border-dashed border-primary/40 flex flex-col items-center justify-center py-10 gap-3">
        <div className="text-muted-foreground/60 text-5xl">{guide}</div>
        <p className="text-xs text-muted-foreground text-center px-4">{sublabel}</p>
        {processing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-2xl">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
      </div>

      {err && <p className="text-xs text-red-400 text-center">{err}</p>}

      {/* Primary: native camera */}
      <button
        type="button"
        disabled={processing}
        onClick={() => inputRef.current?.click()}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
      >
        <Camera className="w-5 h-5" /> Tomar foto
      </button>

      {/* Secondary: gallery */}
      <button
        type="button"
        disabled={processing}
        onClick={() => galleryRef.current?.click()}
        className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        Elegir de la galería
      </button>

      <input ref={inputRef} type="file" accept="image/*" capture={facingMode} className="sr-only" onChange={onChange} />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={onChange} />
    </div>
  );
}

// ── Step indicators ───────────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current ? "w-5 h-2 bg-primary" : i < current ? "w-2 h-2 bg-primary/40" : "w-2 h-2 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function ClientKYCModal({ onSuccess, onDismiss, rejectionNote, isRejected }: ClientKYCModalProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [selfieUrl, setSelfieUrl] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!selfieUrl || !docUrl) { setError("Necesitamos ambas fotos para continuar."); return; }
    setSubmitting(true);
    setError("");
    try {
      await submitVerification({ selfieImageUrl: selfieUrl, documentImageUrl: docUrl, documentType: "cedula" });
      setStep(3);
      // Optimistic: unlock the action after a short visual confirmation
      setTimeout(() => onSuccess(), 1800);
    } catch (e: any) {
      setError(e.message ?? "Error al enviar. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-background" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground">LinkServi Seguro</span>
        </div>
        {step < 3 && (
          <button
            onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-2">

        {/* ── Step 0: Intro / Welcome ────────────────────────────────────── */}
        {step === 0 && (
          <div className="flex flex-col items-center text-center space-y-6 pt-4">

            {/* Icon */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-12 h-12 text-primary" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-background">
                <BadgeCheck className="w-5 h-5 text-white" />
              </div>
            </div>

            {/* Cashea-style headline */}
            {isRejected ? (
              <>
                <div>
                  <p className="text-2xl font-black text-foreground leading-tight">Actualiza tus documentos</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Tu verificación anterior fue rechazada. Envía fotos más claras para continuar.
                  </p>
                </div>
                {rejectionNote && (
                  <div className="w-full px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-left">
                    <p className="text-xs font-bold text-red-500 mb-1">Motivo del rechazo:</p>
                    <p className="text-xs text-red-400">"{rejectionNote}"</p>
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="text-2xl font-black text-foreground leading-tight">¡Casi listo! 🔐</p>
                <p className="text-base text-muted-foreground mt-2 leading-relaxed">
                  Solo necesitamos validar que eres tú para activar tus beneficios de seguridad.
                </p>
              </div>
            )}

            {/* Benefits */}
            <div className="w-full space-y-2.5">
              {[
                { icon: "⚡", text: "Proceso en menos de 2 minutos" },
                { icon: "🔒", text: "Tus datos están cifrados y protegidos" },
                { icon: "🛡️", text: "Proteges al profesional y te proteges a ti" },
              ].map(b => (
                <div key={b.text} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border text-left">
                  <span className="text-lg flex-shrink-0">{b.icon}</span>
                  <p className="text-sm text-foreground font-medium">{b.text}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Necesitarás: <span className="font-semibold text-foreground">tu cédula</span> y {" "}
              <span className="font-semibold text-foreground">una selfie</span>.
            </p>
          </div>
        )}

        {/* ── Step 1: Selfie ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="text-center space-y-1.5">
              <p className="text-xl font-black text-foreground">Tu selfie</p>
              <p className="text-sm text-muted-foreground">
                Tómate una foto con buena iluminación. ¡Mira a la cámara!
              </p>
            </div>

            <PhotoTile
              value={selfieUrl}
              onCapture={setSelfieUrl}
              facingMode="user"
              label="Selfie"
              sublabel="Mira a la cámara · Cara visible · Buena luz"
              guide={<Smile />}
            />

            {selfieUrl && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-emerald-500 font-semibold">¡Selfie capturada! Puedes continuar.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Document ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center space-y-1.5">
              <p className="text-xl font-black text-foreground">Tu cédula</p>
              <p className="text-sm text-muted-foreground">
                Fotografía el frente de tu documento. Todos los datos deben verse con claridad.
              </p>
            </div>

            <PhotoTile
              value={docUrl}
              onCapture={setDocUrl}
              facingMode="environment"
              label="Cédula"
              sublabel="Documento sobre superficie plana · Sin reflejos · Texto legible"
              guide={<FileText />}
            />

            {docUrl && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-emerald-500 font-semibold">¡Documento capturado! Ya puedes activar tu cuenta.</p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Sending / Success ──────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center text-center space-y-6 pt-8">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <BadgeCheck className="w-14 h-14 text-emerald-500" />
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/30 animate-ping" />
            </div>
            <div>
              <p className="text-2xl font-black text-foreground">¡Todo listo! ✨</p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Tus documentos están en revisión. Mientras tanto, ya puedes continuar.
              </p>
            </div>
            <div className="flex items-center gap-2 text-emerald-500 text-sm font-semibold">
              <Loader2 className="w-4 h-4 animate-spin" />
              Activando tu solicitud...
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {step < 3 && (
        <div className="px-4 pb-4 pt-3 space-y-2 flex-shrink-0 border-t border-border bg-background">

          {step > 0 && <StepDots current={step - 1} total={2} />}

          {step === 0 && (
            <button
              onClick={() => setStep(1)}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-base hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              Empezar verificación <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {step === 1 && (
            <button
              onClick={() => { if (selfieUrl) setStep(2); }}
              disabled={!selfieUrl}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-base hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente: mi cédula <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleSubmit}
              disabled={!docUrl || submitting}
              className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-base hover:bg-emerald-600 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</>
              ) : (
                <><BadgeCheck className="w-5 h-5" /> Activar mi cuenta</>
              )}
            </button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {step === 0 && "Solo toma 2 minutos. Tus datos están seguros."}
            {step === 1 && "Paso 1 de 2 — Tu rostro"}
            {step === 2 && "Paso 2 de 2 — Tu documento"}
          </p>
        </div>
      )}
    </div>
  );
}
