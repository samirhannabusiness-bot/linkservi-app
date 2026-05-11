import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { Shield, CheckCircle, AlertCircle, Clock, User, Phone, FileText, Camera } from "lucide-react";
import { ImagePickerField } from "@/components/ui/ImagePickerField";

async function fetchVerification() {
  const res = await fetch("/api/workers/me/verification", { headers: getAuthHeader() });
  if (!res.ok) return null;
  return res.json();
}

async function submitVerification(data: any) {
  const res = await fetch("/api/workers/me/verification", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error al enviar verificación");
  return res.json();
}

const DOCUMENT_TYPES = [
  { id: "cedula", label: "Cédula de Identidad" },
  { id: "pasaporte", label: "Pasaporte" },
  { id: "rif", label: "RIF (Empresas)" },
];

const STATUS_CONFIG = {
  approved: {
    icon: CheckCircle,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
    label: "Verificado",
  },
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
    label: "En revisión",
  },
  rejected: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
    label: "Rechazado",
  },
};

export function WorkerVerificationPage() {
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    documentType: "cedula",
    documentNumber: "",
    emergencyContact: "",
    emergencyPhone: "",
  });
  const [documentImageUrl, setDocumentImageUrl] = useState<string>("");
  const [selfieImageUrl, setSelfieImageUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchVerification().then((data) => {
      setCurrent(data);
      if (data) {
        setForm({
          documentType: data.documentType ?? "cedula",
          documentNumber: data.documentNumber ?? "",
          emergencyContact: data.emergencyContact ?? "",
          emergencyPhone: data.emergencyPhone ?? "",
        });
        if (data.documentImageUrl) setDocumentImageUrl(data.documentImageUrl);
        if (data.selfieImageUrl) setSelfieImageUrl(data.selfieImageUrl);
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentImageUrl) {
      setError("Por favor sube una foto de tu documento de identidad.");
      return;
    }
    if (!selfieImageUrl) {
      setError("Por favor sube una selfie sosteniendo tu documento.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await submitVerification({
        ...form,
        documentImageUrl,
        selfieImageUrl,
      });
      setCurrent(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setError("No se pudo enviar la verificación. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </AppLayout>
    );
  }

  const status = current?.verificationStatus ?? "not_submitted";
  const StatusConf = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const StatusIcon = StatusConf?.icon ?? Clock;
  const isApproved = status === "approved";

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6 pb-8">
        <h1 className="text-2xl font-bold text-foreground">Verificación de Identidad</h1>

        {/* Status banner */}
        {current && (
          <div className={`p-4 rounded-xl border ${StatusConf.bg}`}>
            <div className="flex items-start gap-3">
              <StatusIcon className={`w-6 h-6 ${StatusConf.color} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${StatusConf.color}`}>{StatusConf.label}</p>
                <p className={`text-xs mt-0.5 opacity-80 ${StatusConf.color}`}>
                  {status === "approved" &&
                    "Tu perfil está verificado. Eres un profesional de confianza en LinkServi."}
                  {status === "pending" &&
                    "Tus documentos están siendo revisados. Normalmente toma menos de 24 horas."}
                  {status === "rejected" && (
                    <span>Tu verificación fue rechazada. Corrige el problema y reenvía tus documentos.</span>
                  )}
                </p>
                {/* Rejection note — shown prominently */}
                {status === "rejected" && current?.verificationNotes && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-0.5">
                      Motivo del rechazo
                    </p>
                    <p className="text-xs text-red-400 leading-relaxed">
                      "{current.verificationNotes}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Shield, label: "Mayor confianza", desc: "Los clientes prefieren profesionales verificados" },
            { icon: CheckCircle, label: "Badge especial", desc: "Insignia de verificado en tu perfil" },
            { icon: User, label: "Más trabajo", desc: "Apareces primero en los resultados" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="text-center p-3 bg-card border border-border rounded-xl">
              <Icon className="w-5 h-5 text-primary mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Document info card */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Información del documento
            </h2>

            {success && (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                ✅ Documentos enviados correctamente. El equipo los revisará en 24-48 horas.
              </div>
            )}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Tipo de documento
              </label>
              <select
                value={form.documentType}
                onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
                disabled={isApproved}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              >
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Número de documento
              </label>
              <input
                type="text"
                value={form.documentNumber}
                onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value }))}
                placeholder="Ej: V-12345678"
                disabled={isApproved}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                required
              />
            </div>
          </div>

          {/* Photo uploads card */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                Fotos de verificación
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Las fotos deben ser nítidas, bien iluminadas y sin reflejos. Ambas son obligatorias.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ImagePickerField
                label="Foto del documento"
                sublabel="Frente y reverso visibles"
                icon={<FileText className="w-5 h-5 text-muted-foreground" />}
                value={documentImageUrl}
                onChange={setDocumentImageUrl}
                onError={setError}
                disabled={isApproved}
                allowPdf
                inAppCamera
                watermark={{ includeTimestamp: true, brand: "LinkServi · Verificación" }}
              />

              <ImagePickerField
                label="Selfie con documento"
                sublabel="Sosteniendo la cédula"
                icon={<Camera className="w-5 h-5 text-muted-foreground" />}
                value={selfieImageUrl}
                onChange={setSelfieImageUrl}
                onError={setError}
                disabled={isApproved}
                inAppCamera
                cameraOnly
                facingMode="user"
                watermark={{ includeTimestamp: true, includeGps: true, brand: "LinkServi · Selfie" }}
              />
            </div>

            <ul className="space-y-1">
              {[
                "La foto del documento debe mostrar frente y reverso",
                "En la selfie debes sujetar el documento junto a tu cara",
                "JPG, PNG o PDF · máximo 18 MB por imagen",
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="text-primary mt-0.5">•</span> {tip}
                </li>
              ))}
            </ul>

            {/* KYC photo tip */}
            <div className="px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">💡</span>
              <p className="text-xs text-amber-400/90 leading-snug">
                <span className="font-semibold">Consejo KYC:</span> Asegúrate de que tu cédula sea legible y no tenga reflejos de luz. Apóyala sobre una superficie plana y usa luz natural si es posible.
              </p>
            </div>
          </div>

          {/* Emergency contact card */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              Contacto de emergencia
            </h2>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Nombre del contacto
              </label>
              <input
                type="text"
                value={form.emergencyContact}
                onChange={(e) => setForm((f) => ({ ...f, emergencyContact: e.target.value }))}
                placeholder="Nombre del familiar o amigo"
                disabled={isApproved}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Teléfono de emergencia
              </label>
              <input
                type="tel"
                value={form.emergencyPhone}
                onChange={(e) => setForm((f) => ({ ...f, emergencyPhone: e.target.value }))}
                placeholder="+58-412-0000000"
                disabled={isApproved}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || isApproved}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApproved
              ? "✅ Ya estás verificado"
              : saving
              ? "Enviando documentos…"
              : "Enviar documentos para verificación"}
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
