import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { Shield, CheckCircle, AlertCircle, Clock, FileText, Phone, Store, Building2, RefreshCw, Camera } from "lucide-react";
import { ImagePickerField } from "@/components/ui/ImagePickerField";

async function fetchVerification() {
  const res = await fetch("/api/me/verification", { headers: getAuthHeader() });
  if (!res.ok) return null;
  return res.json();
}

async function submitVerification(data: any) {
  const res = await fetch("/api/me/verification", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al enviar verificación");
  }
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
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/25 dark:bg-emerald-900/20",
    label: "Verificado",
  },
  pending: {
    icon: Clock,
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/25 dark:bg-amber-900/20",
    label: "En revisión",
  },
  rejected: {
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/10 border-red-500/25 dark:bg-red-900/20",
    label: "Rechazado",
  },
};

const ROLE_COPY: Record<string, { heading: string; why: string; benefits: { icon: any; label: string; desc: string }[] }> = {
  seller: {
    heading: "Verifica tu identidad como Vendedor",
    why: "Para publicar y vender productos en LinkServi debes verificar tu identidad. Es rápido y protege a toda la comunidad.",
    benefits: [
      { icon: Store,        label: "Vender sin límites",  desc: "Publica tus productos y llega a más clientes" },
      { icon: CheckCircle,  label: "Sello de confianza",  desc: "Los compradores confían más en vendedores verificados" },
      { icon: Shield,       label: "Protección mutua",    desc: "Seguridad para ti y para tus compradores" },
    ],
  },
  cohost: {
    heading: "Verifica tu identidad como Co-Host",
    why: "Para gestionar profesionales e invitar a tu equipo en LinkServi debes verificar tu identidad primero.",
    benefits: [
      { icon: Building2,    label: "Gestiona tu equipo",  desc: "Invita y administra profesionales en tu red" },
      { icon: CheckCircle,  label: "Responsabilidad",     desc: "Certifica que eres el responsable de tu equipo" },
      { icon: Shield,       label: "Comunidad segura",    desc: "Garantizas la integridad de los profesionales que gestionas" },
    ],
  },
  default: {
    heading: "Verifica tu identidad",
    why: "Para operar en LinkServi debes verificar tu identidad. Es rápido y solo se hace una vez.",
    benefits: [
      { icon: Shield,       label: "Mayor confianza",     desc: "Los usuarios prefieren perfiles verificados" },
      { icon: CheckCircle,  label: "Badge verificado",    desc: "Insignia de verificado en tu perfil" },
      { icon: FileText,     label: "Acceso completo",     desc: "Desbloquea todas las funciones de la plataforma" },
    ],
  },
};

export function UserVerificationPage() {
  const { user } = useAuth();
  const role = user?.role ?? "default";
  const copy = ROLE_COPY[role] ?? ROLE_COPY.default;

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
  const [justUpdated, setJustUpdated] = useState<"approved" | "rejected" | null>(null);

  const currentStatusRef = useRef<string | null>(null);

  const applyData = useCallback((data: any) => {
    setCurrent(data);
    currentStatusRef.current = data?.status ?? null;
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
  }, []);

  // Initial full fetch
  useEffect(() => {
    fetchVerification().then((data) => {
      applyData(data);
      setLoading(false);
    });
  }, [applyData]);

  // Lightweight polling — only while status is 'pending'
  // Polls /api/me/verification/status every 6 s.
  // When the DB status changes, does a full re-fetch to refresh all fields.
  useEffect(() => {
    const tick = async () => {
      if (currentStatusRef.current !== "pending") return;
      try {
        const res = await fetch("/api/me/verification/status", { headers: getAuthHeader() });
        if (!res.ok) return;
        const { status } = await res.json();
        if (status !== currentStatusRef.current) {
          // Status changed in DB — do a full re-fetch to get all fields
          const freshData = await fetchVerification();
          applyData(freshData);
          if (status === "approved" || status === "rejected") {
            setJustUpdated(status);
            setTimeout(() => setJustUpdated(null), 8000);
          }
        }
      } catch {
        // Polling is best-effort; ignore network errors
      }
    };

    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [applyData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentImageUrl) { setError("Por favor sube una foto de tu documento de identidad."); return; }
    if (!selfieImageUrl) { setError("Por favor sube una selfie sosteniendo tu documento."); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await submitVerification({ ...form, documentImageUrl, selfieImageUrl });
      setCurrent(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message ?? "No se pudo enviar la verificación. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto space-y-4 px-4 py-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </AppLayout>
    );
  }

  const status = current?.status ?? "not_submitted";
  const StatusConf = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const StatusIcon = StatusConf?.icon ?? Clock;
  const isApproved = status === "approved";

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6 pb-8 px-4 py-8">
        <div>
          <p className="text-xs font-semibold tracking-widest text-cyan-400 uppercase mb-1">KYC</p>
          <h1 className="text-2xl font-bold text-foreground">{copy.heading}</h1>
          <p className="text-sm text-muted-foreground mt-1">{copy.why}</p>
        </div>

        {/* Live-update toast banner — appears automatically when admin acts */}
        {justUpdated && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-500 ${
            justUpdated === "approved"
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            {justUpdated === "approved"
              ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            }
            <div>
              <p className={`text-sm font-bold ${justUpdated === "approved" ? "text-emerald-400" : "text-red-400"}`}>
                {justUpdated === "approved" ? "✅ ¡Identidad verificada!" : "❌ Verificación rechazada"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {justUpdated === "approved"
                  ? "Tu estado se actualizó automáticamente. Ya puedes operar con total confianza."
                  : "Tu estado se actualizó. Revisa el motivo a continuación y reenvía tus documentos."}
              </p>
            </div>
          </div>
        )}

        {/* Status banner */}
        {current && status !== "not_submitted" && (
          <div className={`p-4 rounded-xl border ${StatusConf.bg}`}>
            <div className="flex items-start gap-3">
              <StatusIcon className={`w-6 h-6 ${StatusConf.color} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-semibold text-sm ${StatusConf.color}`}>{StatusConf.label}</p>
                  {status === "pending" && (
                    <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" title="Actualizando automáticamente..." />
                  )}
                </div>
                <p className={`text-xs mt-0.5 opacity-80 ${StatusConf.color}`}>
                  {status === "approved" && "Tu perfil está verificado. Puedes operar en LinkServi con total confianza."}
                  {status === "pending" && "Tus documentos están siendo revisados. Esta pantalla se actualizará automáticamente."}
                  {status === "rejected" && "Tu verificación fue rechazada. Corrige el problema y reenvía tus documentos."}
                </p>
                {status === "rejected" && current?.notes && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-0.5">Motivo del rechazo</p>
                    <p className="text-xs text-red-400 leading-relaxed">"{current.notes}"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-3">
          {copy.benefits.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="text-center p-3 bg-card border border-border rounded-xl">
              <Icon className="w-5 h-5 text-primary mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Document info */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Información del documento
            </h2>

            {success && (
              <div className="px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm">
                ✅ Documentos enviados correctamente. El equipo los revisará en 24-48 horas.
              </div>
            )}
            {error && (
              <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tipo de documento</label>
              <select
                value={form.documentType}
                onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
                disabled={isApproved}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              >
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Número de documento</label>
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

          {/* Photo uploads */}
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
              />
              <ImagePickerField
                label="Selfie con documento"
                sublabel="Sosteniendo la cédula"
                icon={<Camera className="w-5 h-5 text-muted-foreground" />}
                value={selfieImageUrl}
                onChange={setSelfieImageUrl}
                onError={setError}
                disabled={isApproved}
              />
            </div>
            <ul className="space-y-1">
              {[
                "La foto del documento debe mostrar frente y reverso",
                "En la selfie debes sujetar el documento junto a tu cara",
                "JPG, PNG o PDF · máximo 5 MB por imagen",
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="text-primary mt-0.5">•</span> {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Emergency contact */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              Contacto de emergencia <span className="text-muted-foreground font-normal">(opcional)</span>
            </h2>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nombre del contacto</label>
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
              <label className="block text-sm font-medium text-foreground mb-1.5">Teléfono de emergencia</label>
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
