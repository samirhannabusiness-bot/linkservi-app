import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Shield, CheckCircle, AlertCircle, Clock, Phone, FileText, Camera, ArrowLeft,
  Lock, Eye, Users, BadgeCheck,
} from "lucide-react";
import { ImagePickerField } from "@/components/ui/ImagePickerField";

const API = "/api";

async function fetchMyVerification() {
  const res = await fetch(`${API}/me/verification`, { headers: getAuthHeader() });
  if (!res.ok) return null;
  return res.json();
}

async function submitMyVerification(data: any) {
  const res = await fetch(`${API}/me/verification`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Error al enviar verificación");
  return json;
}

const DOCUMENT_TYPES = [
  { id: "cedula", label: "Cédula de Identidad" },
  { id: "pasaporte", label: "Pasaporte" },
];

const STATUS_CONFIG = {
  approved: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    label: "Identidad verificada",
  },
  pending: {
    icon: Clock,
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/20",
    label: "En revisión",
  },
  rejected: {
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/10 border-red-500/20",
    label: "Rechazado — corrige y reenvía",
  },
};

const BENEFITS = [
  {
    icon: Lock,
    title: "Protección mutua",
    desc: "Los profesionales también necesitan saber quién los contrata. Tu identidad verificada crea un ambiente de confianza.",
  },
  {
    icon: Eye,
    title: "Acceso completo",
    desc: "Podrás reservar servicios, confirmar citas y proteger tus pagos en escrow.",
  },
  {
    icon: Users,
    title: "Datos seguros",
    desc: "Tu información está cifrada y solo se usa en caso de incidentes. LinkServi nunca la comparte.",
  },
];

export function ClientVerificationPage() {
  const [, navigate] = useLocation();
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ documentType: "cedula", documentNumber: "", emergencyContact: "", emergencyPhone: "" });
  const [documentImageUrl, setDocumentImageUrl] = useState("");
  const [selfieImageUrl, setSelfieImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMyVerification().then((data) => {
      setCurrent(data);
      if (data && data.status !== "not_submitted") {
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
    if (!documentImageUrl) { setError("Sube una foto de tu documento de identidad."); return; }
    if (!selfieImageUrl) { setError("Sube una selfie sosteniendo tu documento."); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await submitMyVerification({ ...form, documentImageUrl, selfieImageUrl });
      setCurrent(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message ?? "No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  const status: string = current?.status ?? "not_submitted";
  const StatusConf = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  const StatusIcon = StatusConf?.icon ?? Clock;
  const isApproved = status === "approved";
  const isPending = status === "pending";

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6 pb-10">

        {/* Back button */}
        <button onClick={() => navigate(-1 as any)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors -mb-2">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Verificación de Identidad</h1>
            <p className="text-xs text-muted-foreground">Requerida para solicitar servicios</p>
          </div>
        </div>

        {/* Status banner (if submitted before) */}
        {StatusConf && status !== "not_submitted" && (
          <div className={`p-4 rounded-xl border ${StatusConf.bg}`}>
            <div className="flex items-start gap-3">
              <StatusIcon className={`w-5 h-5 ${StatusConf.color} flex-shrink-0 mt-0.5`} />
              <div className="flex-1">
                <p className={`font-semibold text-sm ${StatusConf.color}`}>{StatusConf.label}</p>
                <p className={`text-xs mt-0.5 opacity-80 ${StatusConf.color}`}>
                  {isApproved && "Tu identidad está verificada. Puedes reservar servicios con total confianza."}
                  {isPending && "Tus documentos están en revisión. Recibirás una notificación cuando sean aprobados (menos de 24 horas)."}
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

        {/* Why verify — shown on first time or if not approved */}
        {!isApproved && (
          <div className="grid grid-cols-1 gap-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <b.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{b.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Approved — done state */}
        {isApproved && (
          <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto">
              <BadgeCheck className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="font-bold text-foreground">¡Identidad confirmada!</p>
            <p className="text-sm text-muted-foreground">
              Puedes reservar servicios, programar citas y realizar pagos en escrow con total tranquilidad.
            </p>
            <button
              onClick={() => navigate("/client")}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Ir al inicio
            </button>
          </div>
        )}

        {/* Form — shown when not approved (first time, pending retry, rejected retry) */}
        {!isApproved && (
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Document type */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="w-4 h-4 text-primary" /> Tipo de documento
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DOCUMENT_TYPES.map(dt => (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, documentType: dt.id }))}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${
                      form.documentType === dt.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Document number */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Número de documento</label>
              <input
                type="text"
                value={form.documentNumber}
                onChange={e => setForm(f => ({ ...f, documentNumber: e.target.value }))}
                placeholder="Ej: V-12.345.678"
                className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                required
              />
            </div>

            {/* Document photo */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Camera className="w-4 h-4 text-primary" /> Foto del documento
              </label>
              <p className="text-xs text-muted-foreground">Foto clara del frente de tu documento. Debe ser legible.</p>
              <ImagePickerField value={documentImageUrl} onChange={setDocumentImageUrl} label="Documento" />
            </div>

            {/* Selfie */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Camera className="w-4 h-4 text-primary" /> Selfie sosteniendo el documento
              </label>
              <p className="text-xs text-muted-foreground">Tu cara y el documento deben verse con claridad.</p>
              <ImagePickerField value={selfieImageUrl} onChange={setSelfieImageUrl} label="Selfie con documento" />
            </div>

            {/* Emergency contact (optional) */}
            <div className="space-y-3 p-4 rounded-xl bg-card border border-border">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" /> Contacto de emergencia
                <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
              </p>
              <input
                type="text"
                value={form.emergencyContact}
                onChange={e => setForm(f => ({ ...f, emergencyContact: e.target.value }))}
                placeholder="Nombre completo"
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <input
                type="tel"
                value={form.emergencyPhone}
                onChange={e => setForm(f => ({ ...f, emergencyPhone: e.target.value }))}
                placeholder="+58 412 000 0000"
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-xs text-emerald-400 font-semibold">
                  ✓ Documentos enviados. Recibirás una notificación cuando tu identidad sea verificada.
                </p>
              </div>
            )}

            {/* Submit */}
            {!isPending && (
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
                ) : (
                  <><Shield className="w-4 h-4" /> {status === "rejected" ? "Corregir y reenviar documentos" : "Enviar documentos para verificación"}</>
                )}
              </button>
            )}

            {isPending && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <Clock className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-amber-500">Documentos en revisión</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Un administrador está revisando tu identidad. Recibirás una notificación en menos de 24 horas.
                </p>
              </div>
            )}
          </form>
        )}
      </div>
    </AppLayout>
  );
}
