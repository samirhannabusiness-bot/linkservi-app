import { useState, useEffect, useCallback } from "react";
import { useAdminListPendingWorkers, useAdminVerifyWorker } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getRequestOptions, getAuthHeader } from "@/lib/api";
import { CheckCircle, XCircle, Shield, FileText, User, Phone, Eye, MessageCircle, Mail, Star, MapPin, Rocket, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

function DocImage({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="relative group cursor-pointer rounded-lg overflow-hidden border border-border"
        onClick={() => setOpen(true)}
      >
        <img src={src} alt={label} className="w-full h-20 object-cover" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Eye className="w-5 h-5 text-white" />
        </div>
        <p className="text-xs text-center text-muted-foreground py-1 bg-card">{label}</p>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <img src={src} alt={label} className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}

function RejectModal({ worker, onClose, onReject }: {
  worker: any;
  onClose: () => void;
  onReject: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <h2 className="font-bold text-foreground">Rechazar verificación</h2>
        <p className="text-sm text-muted-foreground">Profesional: <span className="font-medium text-foreground">{worker.workerName ?? `#${worker.userId}`}</span></p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Motivo del rechazo (se enviará al profesional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Ej: La foto del documento no es legible. Por favor sube una imagen más clara."
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={() => onReject(notes)}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600"
          >
            Confirmar rechazo
          </button>
        </div>
      </div>
    </div>
  );
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cedula: "Cédula de Identidad",
  pasaporte: "Pasaporte",
  rif: "RIF",
};

function WhatsAppButton({ phone, name, type }: { phone?: string | null; name?: string; type: "approve" | "reject" }) {
  if (!phone) return null;
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const formattedPhone = cleanPhone.startsWith("58") ? cleanPhone : `58${cleanPhone.replace(/^0/, "")}`;
  const message = type === "approve"
    ? `Hola ${name ?? ""},  tu perfil en LinkServi ha sido VERIFICADO exitosamente ✅. Ya puedes recibir solicitudes de trabajo. ¡Mucho éxito!`
    : `Hola ${name ?? ""}, tu verificación en LinkServi fue rechazada ❌. Por favor actualiza tus documentos en la app e intenta de nuevo.`;
  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Notificar por WhatsApp`}
      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
    >
      <MessageCircle className="w-3 h-3" />
      WhatsApp
    </a>
  );
}

// ─── Premium Requests Tab ────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  pago_movil: "Pago Móvil",
  zelle: "Zelle",
  paypal: "PayPal",
  transferencia: "Transferencia",
};

function PremiumRequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Record<number, boolean>>({});
  const [rejectNotes, setRejectNotes] = useState<Record<number, string>>({});
  const [showRejectFor, setShowRejectFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/premium-requests", { headers: getAuthHeader() });
      setRequests(res.ok ? await res.json() : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: number) => {
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      await fetch(`/api/admin/premium-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
      });
      await load();
    } finally { setProcessing(p => ({ ...p, [id]: false })); }
  };

  const reject = async (id: number) => {
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      await fetch(`/api/admin/premium-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ adminNotes: rejectNotes[id] || "" }),
      });
      setShowRejectFor(null);
      await load();
    } finally { setProcessing(p => ({ ...p, [id]: false })); }
  };

  const pending = requests.filter(r => r.status === "pending");
  const others = requests.filter(r => r.status !== "pending");

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-700 flex items-start gap-3">
        <Rocket className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Solicitudes de Activación Premium</p>
          <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
            Los profesionales pagan $5 USD y envían su comprobante. Verifica el pago y activa su cuenta.
          </p>
        </div>
      </div>

      {pending.length === 0 && others.length === 0 && (
        <div className="py-16 text-center bg-card border border-border rounded-xl">
          <Rocket className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">Sin solicitudes</p>
          <p className="text-sm text-muted-foreground mt-1">No hay solicitudes Premium pendientes.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Pendientes de revisión ({pending.length})
          </p>
          <div className="space-y-3">
            {pending.map((r: any) => (
              <div key={r.id} className="bg-card border border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-bold text-primary text-xs">{(r.workerName ?? "?").charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{r.workerName}</p>
                          <p className="text-xs text-muted-foreground">{r.workerEmail}</p>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 font-semibold flex-shrink-0">
                      Pendiente
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-muted">
                      <p className="text-muted-foreground mb-0.5">Método de pago</p>
                      <p className="font-semibold text-foreground">{METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted">
                      <p className="text-muted-foreground mb-0.5">Monto</p>
                      <p className="font-semibold text-amber-600">${r.amount} USD</p>
                    </div>
                    {r.transactionRef && (
                      <div className="col-span-2 p-2.5 rounded-lg bg-muted">
                        <p className="text-muted-foreground mb-0.5">Referencia del pago</p>
                        <p className="font-mono font-semibold text-foreground break-all">{r.transactionRef}</p>
                      </div>
                    )}
                    <div className="col-span-2 p-2.5 rounded-lg bg-muted">
                      <p className="text-muted-foreground mb-0.5">Solicitado el</p>
                      <p className="font-semibold text-foreground">
                        {format(new Date(r.createdAt), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>

                  {r.receiptUrl && (
                    <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                      <Eye className="w-3.5 h-3.5" /> Ver comprobante adjunto
                    </a>
                  )}

                  {/* Reject notes inline */}
                  {showRejectFor === r.id && (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-foreground">Motivo del rechazo (se enviará al profesional)</label>
                      <textarea
                        value={rejectNotes[r.id] ?? ""}
                        onChange={e => setRejectNotes(n => ({ ...n, [r.id]: e.target.value }))}
                        rows={2}
                        placeholder="Ej: No pudimos verificar el pago con la referencia indicada..."
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {showRejectFor === r.id ? (
                      <>
                        <button
                          onClick={() => setShowRejectFor(null)}
                          className="flex-1 py-2 rounded-xl border border-border text-foreground text-xs font-medium hover:bg-muted"
                        >Cancelar</button>
                        <button
                          onClick={() => reject(r.id)}
                          disabled={processing[r.id]}
                          className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-60"
                        >{processing[r.id] ? "Rechazando..." : "Confirmar rechazo"}</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setShowRejectFor(r.id)}
                          className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Rechazar
                        </button>
                        <button
                          onClick={() => approve(r.id)}
                          disabled={processing[r.id]}
                          className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-60 flex items-center justify-center gap-1"
                        >
                          {processing[r.id] ? "Activando..." : <><Star className="w-3.5 h-3.5 fill-white" /> Activar Premium</>}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-3">Historial</p>
          <div className="space-y-2">
            {others.map((r: any) => (
              <div key={r.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${r.status === "approved" ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-700" : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.workerName}</p>
                  <p className="text-xs text-muted-foreground">{METHOD_LABEL[r.paymentMethod]} · ${r.amount} USD</p>
                  {r.adminNotes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">Nota: {r.adminNotes}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0 ${r.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                  {r.status === "approved" ? "Aprobado" : "Rechazado"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PremiumTab (existing - activate/revoke manually) ────────────────────────

function PremiumTab() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [premiumLoading, setPremiumLoading] = useState<Record<number, boolean>>({});
  const [days, setDays] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/workers", { headers: getAuthHeader() });
      const data = await res.json();
      setWorkers(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePremium = async (w: any, enable: boolean) => {
    setPremiumLoading(l => ({ ...l, [w.id]: true }));
    try {
      await fetch(`/api/admin/workers/${w.id}/premium`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ isPremium: enable, days: enable ? (days[w.id] ?? 30) : undefined }),
      });
      await load();
    } finally {
      setPremiumLoading(l => ({ ...l, [w.id]: false }));
    }
  };

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
    </div>
  );

  const premiumWorkers = workers.filter(w => w.isPremium);
  const regularWorkers = workers.filter(w => !w.isPremium);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-700">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Sistema Premium</p>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-500">
          Los profesionales Premium aparecen primero en todas las búsquedas — incluso en otras ciudades y estados. 
          Actualmente <strong>{premiumWorkers.length} profesional{premiumWorkers.length !== 1 ? "es" : ""}</strong> tienen Premium activo.
        </p>
      </div>

      {/* Premium workers */}
      {premiumWorkers.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Premium activo ({premiumWorkers.length})
          </p>
          <div className="space-y-2">
            {premiumWorkers.map(w => (
              <div key={w.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-xl gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground text-sm">{w.workerName}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 font-medium">⭐ Premium</span>
                    {w.isVerified && <span className="text-xs text-primary">✓ Verificado</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted-foreground">{w.workerEmail}</p>
                    {w.state && w.city && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" /> {w.city}, {w.state}
                      </span>
                    )}
                    {w.premiumUntil && (() => {
                      const daysLeft = Math.ceil((new Date(w.premiumUntil).getTime() - Date.now()) / 86_400_000);
                      const isUrgent = daysLeft <= 7;
                      const isExpired = daysLeft <= 0;
                      return (
                        <span className={`text-xs font-medium ${isExpired ? "text-red-500" : isUrgent ? "text-orange-400" : "text-amber-500"}`}>
                          Vence: {new Date(w.premiumUntil).toLocaleDateString("es-VE")}
                          {" · "}
                          <span className="font-bold">
                            {isExpired
                              ? "Expirado"
                              : daysLeft === 1
                                ? "queda 1 día"
                                : `quedan ${daysLeft} días`}
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <button
                  onClick={() => togglePremium(w, false)}
                  disabled={premiumLoading[w.id]}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0 disabled:opacity-50"
                >
                  {premiumLoading[w.id] ? "..." : "Revocar"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regular workers */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">Profesionales regulares ({regularWorkers.length})</p>
        <div className="space-y-2">
          {regularWorkers.map(w => (
            <div key={w.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground text-sm truncate">{w.workerName}</p>
                  {w.isVerified && <span className="text-xs text-primary">✓ Verificado</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <p className="text-xs text-muted-foreground truncate">{w.workerEmail}</p>
                  {w.state && w.city && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" /> {w.city}, {w.state}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{w.completedJobs} servicios</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days[w.id] ?? 30}
                  onChange={(e) => setDays(d => ({ ...d, [w.id]: Number(e.target.value) }))}
                  className="w-16 px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
                  title="Días de Premium"
                />
                <span className="text-xs text-muted-foreground">días</span>
                <button
                  onClick={() => togglePremium(w, true)}
                  disabled={premiumLoading[w.id]}
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50"
                >
                  {premiumLoading[w.id] ? "..." : "⭐ Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminWorkersPage() {
  const opts = getRequestOptions();
  const { data: workers = [], refetch } = useAdminListPendingWorkers(opts as any);
  const { mutate: verify } = useAdminVerifyWorker({ ...opts, mutation: { onSuccess: () => refetch() } } as any);
  const [rejectingWorker, setRejectingWorker] = useState<any>(null);
  const [tab, setTab] = useState<"verification" | "premium" | "premium_requests">("verification");
  const [premiumRequestCount, setPremiumRequestCount] = useState(0);

  useEffect(() => {
    fetch("/api/admin/premium-requests", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setPremiumRequestCount(data.filter((r: any) => r.status === "pending").length))
      .catch(() => {});
  }, []);

  const handleApprove = (w: any) => {
    verify({ workerId: w.id, data: { approved: true } });
  };

  const handleReject = (worker: any, notes: string) => {
    verify({ workerId: worker.id, data: { approved: false, notes } });
    setRejectingWorker(null);
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profesionales</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTab("verification")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "verification" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Shield className="w-3.5 h-3.5" /> Verificación
            {(workers as any[]).length > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">{(workers as any[]).length}</span>
            )}
          </button>
          <button
            onClick={() => setTab("premium_requests")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "premium_requests" ? "bg-amber-500 text-white" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Rocket className="w-3.5 h-3.5" /> Solicitudes Premium
            {premiumRequestCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">{premiumRequestCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab("premium")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "premium" ? "bg-amber-400 text-slate-900" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Star className="w-3.5 h-3.5" /> Gestionar Premium
          </button>
        </div>

        {tab === "premium_requests" && <PremiumRequestsTab />}
        {tab === "premium" && <PremiumTab />}

        {tab === "verification" && <>
          {(workers as any[]).length === 0 ? (
            <div className="py-16 text-center bg-card border border-border rounded-xl">
              <Shield className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="font-medium text-foreground">Todo al día</p>
              <p className="text-sm text-muted-foreground mt-1">No hay profesionales pendientes de verificación.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(workers as any[]).map((w: any) => (
                <div key={w.id} className="p-5 bg-card border border-border rounded-xl space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary text-sm">{(w.workerName ?? "?").charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">{w.workerName ?? `Profesional #${w.userId}`}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Pendiente</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {w.workerEmail && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" />{w.workerEmail}
                            </span>
                          )}
                          {w.completedJobs > 0 && (
                            <span className="text-xs text-muted-foreground">{w.completedJobs} servicios</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <WhatsAppButton phone={w.workerPhone} name={w.workerName} type="reject" />
                      <button
                        onClick={() => setRejectingWorker(w)}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <XCircle className="w-3 h-3" /> Rechazar
                      </button>
                      <button
                        onClick={() => handleApprove(w)}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" /> Aprobar
                      </button>
                    </div>
                  </div>

                  {/* Document images */}
                  {(w.documentImageUrl || w.selfieImageUrl) && (
                    <div className="grid grid-cols-2 gap-3">
                      {w.documentImageUrl && <DocImage src={w.documentImageUrl} label="Foto del documento" />}
                      {w.selfieImageUrl && <DocImage src={w.selfieImageUrl} label="Selfie con documento" />}
                    </div>
                  )}

                  {/* Document info */}
                  {(w.documentType || w.documentNumber) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                      <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span className="text-xs text-blue-700 dark:text-blue-400">
                        {DOC_TYPE_LABELS[w.documentType] ?? w.documentType}: {w.documentNumber}
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  {w.description && (
                    <p className="text-sm text-muted-foreground">{w.description}</p>
                  )}

                  {/* Emergency contact */}
                  {(w.emergencyContact || w.emergencyPhone) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Emergencia: {w.emergencyContact} {w.emergencyPhone && `· ${w.emergencyPhone}`}
                      </span>
                    </div>
                  )}

                  {/* Skills */}
                  {(w.skills ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {w.skills.map((s: string) => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  )}

                  {/* WhatsApp approve notification hint */}
                  {w.workerPhone && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <WhatsAppButton phone={w.workerPhone} name={w.workerName} type="approve" />
                      <span className="text-xs text-muted-foreground">Notificar al profesional tras aprobar</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>}
      </div>

      {rejectingWorker && (
        <RejectModal
          worker={rejectingWorker}
          onClose={() => setRejectingWorker(null)}
          onReject={(notes) => handleReject(rejectingWorker, notes)}
        />
      )}
    </AppLayout>
  );
}
