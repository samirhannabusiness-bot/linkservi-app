import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader, notifyIfVerificationRequired } from "@/lib/api";
import { useWorkerVerification } from "@/lib/worker-verification-context";
import { Wallet, Clock, CheckCircle, XCircle, Banknote, ChevronDown, ChevronUp, AlertCircle, Plus, Shield, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const MIN_WITHDRAWAL = 5;

const BANKS = [
  "Banco de Venezuela", "Banesco", "Mercantil", "BBVA Provincial",
  "Banco Exterior", "BNC", "Bicentenario", "Bancaribe", "Del Sur", "Otro"
];

const METHOD_LABELS: Record<string, string> = {
  pago_movil: "Pago Móvil",
  binance: "Binance",
  zelle: "Zelle",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pending: { label: "Pendiente", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20" },
  approved: { label: "Aprobado", icon: CheckCircle, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
  rejected: { label: "Rechazado", icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" },
  paid: { label: "Pagado", icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
};

async function fetchWorkerProfile() {
  const res = await fetch("/api/workers/me", { headers: getAuthHeader() });
  if (!res.ok) return null;
  return res.json();
}

async function fetchWithdrawals() {
  const res = await fetch("/api/withdrawals", { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function createWithdrawal(data: object) {
  const res = await fetch("/api/withdrawals", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    // Si es 403 con code de verificación (email/perfil), dispara el toast
    // global con CTA "Verificar ahora" / "Completar perfil".
    notifyIfVerificationRequired(res, json);
    throw new Error(json.error ?? "Error al crear solicitud");
  }
  return json;
}

function WithdrawalCard({ w }: { w: any }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const details = w.paymentDetails ?? {};

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${cfg.bg}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">${w.amount.toFixed(2)} — {METHOD_LABELS[w.method] ?? w.method}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(w.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Datos de pago</p>
          {w.method === "pago_movil" && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">Banco:</span> {details.banco}</p>
              <p><span className="font-medium text-foreground">Teléfono:</span> {details.telefono}</p>
              <p><span className="font-medium text-foreground">Cédula:</span> {details.cedula}</p>
            </div>
          )}
          {w.method === "binance" && (
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">ID/Correo:</span> {details.binanceId}</p>
          )}
          {w.method === "zelle" && (
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Correo:</span> {details.email}</p>
          )}
          {w.adminNotes && (
            <div className="mt-2 p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <span className="font-medium">Nota del admin:</span> {w.adminNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WithdrawalModal({
  netBalance,
  onClose,
  onSuccess,
}: {
  netBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("pago_movil");
  const [details, setDetails] = useState({ banco: "", telefono: "", cedula: "", binanceId: "", email: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amountNum = parseFloat(amount) || 0;

  const isValid = () => {
    if (amountNum < MIN_WITHDRAWAL) return false;
    if (amountNum > netBalance) return false;
    if (method === "pago_movil") return !!(details.banco && details.telefono && details.cedula);
    if (method === "binance") return !!details.binanceId;
    if (method === "zelle") return !!details.email;
    return false;
  };

  const getPaymentDetails = () => {
    if (method === "pago_movil") return { banco: details.banco, telefono: details.telefono, cedula: details.cedula };
    if (method === "binance") return { binanceId: details.binanceId };
    if (method === "zelle") return { email: details.email };
    return {};
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      await createWithdrawal({ amount: amountNum, method, paymentDetails: getPaymentDetails() });
      onSuccess();
    } catch (e: any) {
      setError(e.message);
      setStep("form");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-foreground">
            {step === "form" ? "Solicitar retiro" : "Confirmar retiro"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
        </div>

        {step === "form" ? (
          <div className="space-y-4">
            {/* Balance info */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Saldo disponible</span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">${netBalance.toFixed(2)}</span>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Monto a retirar (USD)</label>
              <input
                type="number"
                min={MIN_WITHDRAWAL}
                max={netBalance}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={`Mínimo $${MIN_WITHDRAWAL}`}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {amountNum > netBalance && <p className="text-xs text-red-500 mt-1">Supera tu saldo disponible</p>}
              {amountNum > 0 && amountNum < MIN_WITHDRAWAL && (
                <p className="text-xs text-red-500 mt-1">Monto mínimo: ${MIN_WITHDRAWAL}</p>
              )}
            </div>

            {/* Method */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Método de pago</label>
              <div className="grid grid-cols-3 gap-2">
                {["pago_movil", "binance", "zelle"].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-semibold transition-colors ${
                      method === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Details per method */}
            {method === "pago_movil" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Banco</label>
                  <select
                    value={details.banco}
                    onChange={e => setDetails(d => ({ ...d, banco: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Selecciona tu banco</option>
                    {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={details.telefono}
                    onChange={e => setDetails(d => ({ ...d, telefono: e.target.value }))}
                    placeholder="0412-0000000"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Cédula</label>
                  <input
                    type="text"
                    value={details.cedula}
                    onChange={e => setDetails(d => ({ ...d, cedula: e.target.value }))}
                    placeholder="V-12345678"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {method === "binance" && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Correo o ID de Binance</label>
                <input
                  type="text"
                  value={details.binanceId}
                  onChange={e => setDetails(d => ({ ...d, binanceId: e.target.value }))}
                  placeholder="usuario@email.com o ID numérico"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {method === "zelle" && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Correo Zelle</label>
                <input
                  type="email"
                  value={details.email}
                  onChange={e => setDetails(d => ({ ...d, email: e.target.value }))}
                  placeholder="tu@correo.com"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted">
                Cancelar
              </button>
              <button
                disabled={!isValid()}
                onClick={() => setStep("confirm")}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : (
          // Confirmation step
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/50 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monto</span>
                <span className="font-bold text-foreground">${amountNum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Método</span>
                <span className="font-semibold text-foreground">{METHOD_LABELS[method]}</span>
              </div>
              {method === "pago_movil" && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Banco</span>
                    <span className="text-foreground">{details.banco}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Teléfono</span>
                    <span className="text-foreground">{details.telefono}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cédula</span>
                    <span className="text-foreground">{details.cedula}</span>
                  </div>
                </>
              )}
              {method === "binance" && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Binance ID</span>
                  <span className="text-foreground">{details.binanceId}</span>
                </div>
              )}
              {method === "zelle" && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Correo</span>
                  <span className="text-foreground">{details.email}</span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                El equipo LinkServi realizará el pago manualmente. Normalmente tarda 24-48 horas hábiles.
              </p>
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep("form")} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted">
                Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Enviando…" : "Confirmar retiro"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkerWithdrawalsPage() {
  const [, navigate] = useLocation();
  const kyc = useWorkerVerification();
  const [profile, setProfile] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const load = async () => {
    const [p, w] = await Promise.all([fetchWorkerProfile(), fetchWithdrawals()]);
    setProfile(p);
    setWithdrawals(w);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Balance model:
  //   worker.earnings = NET earnings (commission already deducted at booking completion)
  //   At withdrawal creation, we immediately deduct grossEquivalent = amount / 0.9 from earnings
  //   So: availableNet = earnings * 0.9  (reflects actual usable balance)
  //   reservedAmount = sum of pending/approved withdrawals (for transparency display)
  //   totalNet = availableNet + reservedAmount  (reconstructed total before in-flight deductions)
  const availableNet = profile ? Math.max(0, (profile.earnings ?? 0) * 0.9) : 0;
  const netBalance = availableNet; // alias kept for modal

  const handleSuccess = () => {
    setShowModal(false);
    setSuccessMsg("¡Solicitud enviada! Los fondos han sido reservados y el equipo la procesará en 24–48 horas.");
    load();
    setTimeout(() => setSuccessMsg(""), 6000);
  };

  const pending = withdrawals.filter(w => w.status === "pending").length;
  const totalPaid = withdrawals.filter(w => w.status === "paid").reduce((sum, w) => sum + w.amount, 0);
  const reservedAmount = withdrawals
    .filter(w => ["pending", "approved"].includes(w.status))
    .reduce((sum, w) => sum + w.amount, 0);
  const totalNet = availableNet + reservedAmount; // total net balance (including in-flight)

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  if (!kyc.isVerified) {
    const isPending = kyc.status === "pending";
    const isRejected = kyc.status === "rejected";
    return (
      <AppLayout>
        <div className="max-w-sm mx-auto py-16 flex flex-col items-center gap-6 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
            style={isRejected
              ? { background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.4)" }
              : isPending
              ? { background: "rgba(6,182,212,0.10)", border: "1.5px solid rgba(6,182,212,0.35)" }
              : { background: "rgba(251,191,36,0.12)", border: "1.5px solid rgba(251,191,36,0.4)" }}
          >
            {isRejected ? "⚠️" : isPending ? "🔍" : "🔒"}
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">
              {isRejected ? "Verificación rechazada" : isPending ? "Verificación en revisión" : "Sección bloqueada"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isRejected
                ? "Tu verificación fue rechazada. Corrígela para desbloquear tus retiros."
                : isPending
                ? "Tus documentos están siendo revisados. En menos de 24 horas se habilitarán los retiros."
                : "Para acceder a tu billetera y retirar fondos debes verificar tu identidad primero."}
            </p>
          </div>
          {isRejected && kyc.notes && (
            <div className="w-full px-4 py-3 rounded-2xl text-left bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">Motivo del rechazo</p>
              <p className="text-sm text-red-600 dark:text-red-400">"{kyc.notes}"</p>
            </div>
          )}
          {!isPending && (
            <button
              onClick={() => navigate("/professional/verification")}
              className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all"
              style={{ background: "linear-gradient(135deg,#06B6D4,#0891B2)", boxShadow: "0 0 20px rgba(6,182,212,0.3)" }}
            >
              <Shield className="w-4 h-4" />
              {isRejected ? "Corregir y reenviar" : "Verificar mi identidad"}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mis Retiros</h1>
            <p className="text-sm text-muted-foreground">Gestiona tus solicitudes de cobro</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={netBalance < MIN_WITHDRAWAL}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Solicitar
          </button>
        </div>

        {successMsg && (
          <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}
          </div>
        )}

        {/* Balance Panel — 3 levels */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-primary/5">
            <Wallet className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Mi Balance</h2>
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* Row 1: Balance neto total */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary/60 flex-shrink-0" />
                <span className="text-sm text-muted-foreground">Balance neto total</span>
              </div>
              <span className="text-sm font-semibold text-foreground">${totalNet.toFixed(2)}</span>
            </div>

            {/* Row 2: Fondos en proceso de retiro (only when > 0) */}
            {reservedAmount > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">Fondos en proceso de retiro</span>
                </div>
                <span className="text-sm font-semibold text-amber-600">−${reservedAmount.toFixed(2)}</span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-dashed border-border" />

            {/* Row 3: Disponible para retirar — hero number */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">Disponible para retirar</span>
              </div>
              <span className="text-xl font-bold text-emerald-600">${availableNet.toFixed(2)}</span>
            </div>

            {/* Explanation when reserved */}
            {reservedAmount > 0 && (
              <div className="flex items-start gap-2 mt-1 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  <strong>${reservedAmount.toFixed(2)}</strong> están bloqueados en retiros pendientes de aprobación.
                  Si son rechazados, el monto vuelve automáticamente a tu balance disponible.
                </p>
              </div>
            )}
          </div>

          {/* Footer: total cobrado */}
          <div className="px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total ya cobrado</span>
            <span className="text-sm font-semibold text-foreground">${totalPaid.toFixed(2)}</span>
          </div>
        </div>

        {netBalance < MIN_WITHDRAWAL && netBalance >= 0 && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Necesitas al menos <strong>${MIN_WITHDRAWAL}</strong> disponibles para solicitar un retiro.
              Actualmente tienes <strong>${netBalance.toFixed(2)}</strong>.
            </p>
          </div>
        )}

        {/* History */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Historial de retiros</h2>
          {withdrawals.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-xl">
              <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Aún no has solicitado retiros.</p>
              {netBalance >= MIN_WITHDRAWAL && (
                <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-primary font-medium">
                  Solicitar mi primer retiro →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawals.map(w => <WithdrawalCard key={w.id} w={w} />)}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <WithdrawalModal
          netBalance={netBalance}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </AppLayout>
  );
}
