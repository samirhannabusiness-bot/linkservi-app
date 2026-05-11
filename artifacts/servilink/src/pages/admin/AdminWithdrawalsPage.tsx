import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Clock, CheckCircle, XCircle, Banknote, ChevronDown, ChevronUp,
  DollarSign, RefreshCw, Store, User, Building2, MessageCircle, Phone, Wallet
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const METHOD_LABELS: Record<string, string> = {
  pago_movil: "Pago Móvil",
  binance: "Binance",
  zelle: "Zelle",
  paypal: "PayPal",
  transferencia: "Transferencia",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  pending: { label: "Pendiente", icon: Clock, color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800" },
  approved: { label: "Aprobado", icon: CheckCircle, color: "text-blue-700", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
  rejected: { label: "Rechazado", icon: XCircle, color: "text-red-700", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800" },
  paid: { label: "Pagado", icon: Banknote, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
  completed: { label: "Completado", icon: Banknote, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
};

async function fetchWorkerWithdrawals() {
  const res = await fetch("/api/admin/withdrawals", { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function fetchStoreWithdrawals() {
  const res = await fetch("/api/admin/store-withdrawals", { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function fetchWalletWithdrawals() {
  const res = await fetch("/api/admin/wallet/withdrawals", { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function walletAction(id: number, action: "complete" | "reject", notes?: string) {
  const res = await fetch(`/api/admin/wallet/withdrawals/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ notes: notes ?? "" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al procesar");
  }
  return res.json();
}

async function workerAction(id: number, action: "approve" | "reject" | "mark-paid", notes?: string) {
  const res = await fetch(`/api/admin/withdrawals/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ notes: notes ?? "" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al procesar");
  }
  return res.json();
}

async function storeAction(id: number, action: "approve" | "reject" | "mark-paid", notes?: string) {
  const res = await fetch(`/api/admin/store-withdrawals/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ notes: notes ?? "" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Error al procesar");
  }
  return res.json();
}

function PaymentDetails({ method, details }: { method: string; details: any }) {
  if (!details) return null;
  if (method === "pago_movil") return (
    <div className="space-y-1 text-xs">
      {details.banco && <div className="flex justify-between"><span className="text-muted-foreground">Banco</span><span className="font-medium text-foreground">{details.banco}</span></div>}
      {details.phone && <div className="flex justify-between"><span className="text-muted-foreground">Teléfono</span><span className="font-medium text-foreground">{details.phone}</span></div>}
      {details.telefono && <div className="flex justify-between"><span className="text-muted-foreground">Teléfono</span><span className="font-medium text-foreground">{details.telefono}</span></div>}
      {details.cedula && <div className="flex justify-between"><span className="text-muted-foreground">Cédula</span><span className="font-medium text-foreground">{details.cedula}</span></div>}
    </div>
  );
  if (method === "binance") return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">Binance ID/Correo</span>
      <span className="font-medium text-foreground">{details.binanceId ?? details.walletAddress}</span>
    </div>
  );
  if (method === "zelle" || method === "paypal") return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">Correo</span>
      <span className="font-medium text-foreground">{details.email}</span>
    </div>
  );
  if (method === "transferencia") return (
    <div className="space-y-1 text-xs">
      {details.accountNumber && <div className="flex justify-between"><span className="text-muted-foreground">Cuenta</span><span className="font-medium text-foreground">{details.accountNumber}</span></div>}
      {details.accountHolder && <div className="flex justify-between"><span className="text-muted-foreground">Titular</span><span className="font-medium text-foreground">{details.accountHolder}</span></div>}
      {details.cedula && <div className="flex justify-between"><span className="text-muted-foreground">Cédula</span><span className="font-medium text-foreground">{details.cedula}</span></div>}
    </div>
  );
  return <pre className="text-xs text-muted-foreground">{JSON.stringify(details, null, 2)}</pre>;
}

function WorkerWithdrawalRow({ w, onUpdated }: { w: any; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(w.adminNotes ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const details = w.paymentDetails ?? {};

  const handle = async (action: "approve" | "reject" | "mark-paid") => {
    setLoading(action);
    setError("");
    try { await workerAction(w.id, action, notes); onUpdated(); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(null); }
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${cfg.border}`}>
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-foreground text-sm truncate">{w.workerName}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{w.workerEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="text-right">
            <p className="text-base font-bold text-foreground">${w.amount.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{METHOD_LABELS[w.method] ?? w.method}</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          <p className="text-xs text-muted-foreground">
            Solicitado: {format(new Date(w.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
          </p>
          <div className="p-3 rounded-xl bg-muted/40 space-y-2">
            <p className="text-xs font-semibold text-foreground">Datos de pago ({METHOD_LABELS[w.method] ?? w.method})</p>
            {w.method === "pago_movil" && (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Banco</span><span className="font-medium">{details.banco}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Teléfono</span><span className="font-medium">{details.telefono}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cédula</span><span className="font-medium">{details.cedula}</span></div>
              </div>
            )}
            {w.method === "binance" && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Binance ID</span><span className="font-medium">{details.binanceId}</span></div>}
            {w.method === "zelle" && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Correo Zelle</span><span className="font-medium">{details.email}</span></div>}
          </div>
          {w.workerPhone && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Teléfono:</span> {w.workerPhone}</p>}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nota interna (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Referencia del pago, motivo de rechazo..."
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
          {w.status === "pending" && (
            <div className="flex gap-2">
              <button onClick={() => handle("reject")} disabled={!!loading}
                className="flex-1 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                {loading === "reject" ? "…" : "✕ Rechazar"}
              </button>
              <button onClick={() => handle("approve")} disabled={!!loading}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                {loading === "approve" ? "…" : "✓ Aprobar"}
              </button>
            </div>
          )}
          {w.status === "approved" && (
            <button onClick={() => handle("mark-paid")} disabled={!!loading}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              {loading === "mark-paid" ? "Procesando…" : "Marcar como pagado"}
            </button>
          )}
          {(w.status === "rejected" || w.status === "paid") && w.adminNotes && (
            <div className="p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <span className="font-medium">Nota:</span> {w.adminNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const REQUESTER_ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  cohost:  { label: "Co-Anfitrión", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
  seller:  { label: "Vendedor",     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  worker:  { label: "Profesional",   color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
};

function StoreWithdrawalRow({ w, onUpdated }: { w: any; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(w.adminNotes ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const roleBadge = REQUESTER_ROLE_BADGE[w.requesterRole];

  const handle = async (action: "approve" | "reject" | "mark-paid") => {
    setLoading(action);
    setError("");
    try { await storeAction(w.id, action, notes); onUpdated(); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(null); }
  };

  // WhatsApp helper
  const waLink = (phone?: string) => {
    if (!phone) return null;
    const clean = phone.replace(/[^0-9]/g, "");
    const formatted = clean.startsWith("58") ? clean : `58${clean.replace(/^0/, "")}`;
    const msg = `Hola ${w.requesterName ?? ""}, sobre tu solicitud de retiro de $${w.amount.toFixed(2)} de la tienda "${w.storeName}".`;
    return `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${cfg.border}`}>
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Store className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <p className="font-semibold text-foreground text-sm truncate">{w.storeName}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground truncate">
                {roleBadge ? (
                  <span className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded ${roleBadge.bg} ${roleBadge.color} mr-1`}>
                    <Building2 className="w-3 h-3" />{roleBadge.label}
                  </span>
                ) : null}
                {w.requesterName}
              </p>
              {w.requesterEmail && <p className="text-xs text-muted-foreground truncate">· {w.requesterEmail}</p>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="text-right">
            <p className="text-base font-bold text-foreground">${w.amount.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{METHOD_LABELS[w.paymentMethod] ?? w.paymentMethod}</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Solicitado: {format(new Date(w.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
            {w.requesterPhone && (() => { const link = waLink(w.requesterPhone); return link ? (
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            ) : null; })()}
          </div>

          {/* Requester info */}
          <div className="p-3 rounded-xl bg-muted/40 space-y-1.5">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Solicitante
              {roleBadge && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${roleBadge.bg} ${roleBadge.color}`}>{roleBadge.label}</span>
              )}
            </p>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Nombre</span><span className="font-medium text-foreground">{w.requesterName}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Correo</span><span className="font-medium text-foreground">{w.requesterEmail}</span></div>
            {w.requesterPhone && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Teléfono</span><span className="font-medium text-foreground">{w.requesterPhone}</span></div>}
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Tienda</span><span className="font-medium text-foreground">{w.storeName} <span className="text-muted-foreground">({w.ownerName})</span></span></div>
          </div>

          <div className="p-3 rounded-xl bg-muted/40 space-y-2">
            <p className="text-xs font-semibold text-foreground">Datos de pago ({METHOD_LABELS[w.paymentMethod] ?? w.paymentMethod})</p>
            <PaymentDetails method={w.paymentMethod} details={w.paymentDetails} />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nota interna (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Referencia del pago, motivo de rechazo..."
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
          {w.status === "pending" && (
            <div className="flex gap-2">
              <button onClick={() => handle("reject")} disabled={!!loading}
                className="flex-1 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                {loading === "reject" ? "…" : "✕ Rechazar"}
              </button>
              <button onClick={() => handle("approve")} disabled={!!loading}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                {loading === "approve" ? "…" : "✓ Aprobar Retiro"}
              </button>
            </div>
          )}
          {w.status === "approved" && (
            <button onClick={() => handle("mark-paid")} disabled={!!loading}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              {loading === "mark-paid" ? "Procesando…" : "Marcar como pagado"}
            </button>
          )}
          {(w.status === "rejected" || w.status === "paid") && w.adminNotes && (
            <div className="p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <span className="font-medium">Nota:</span> {w.adminNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobados" },
  { id: "rejected", label: "Rechazados" },
  { id: "paid", label: "Pagados" },
];

// ── Fila para retiros desde LinkWallet del usuario ───────────────────────────
function WalletWithdrawalRow({ w, onUpdated }: { w: any; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(w.adminNotes ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Mapear status de wallet ("completed") al config visual del compartido.
  const visualStatus = w.status === "completed" ? "completed" : w.status;
  const cfg = STATUS_CONFIG[visualStatus] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const dest = w.destinationData ?? {};
  const amountUsd = (w.amountCents ?? 0) / 100;
  const feeUsd = (w.feeCents ?? 0) / 100;
  const grossUsd = (w.grossCents ?? 0) / 100;

  const handle = async (action: "complete" | "reject") => {
    setLoading(action);
    setError("");
    try { await walletAction(w.id, action, notes); onUpdated(); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(null); }
  };

  const waLink = (phone?: string) => {
    if (!phone) return null;
    const clean = phone.replace(/[^0-9]/g, "");
    const formatted = clean.startsWith("58") ? clean : `58${clean.replace(/^0/, "")}`;
    const msg = `Hola ${w.userName ?? ""}, sobre tu retiro de $${amountUsd.toFixed(2)} de tu LinkWallet.`;
    return `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${cfg.border}`}>
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Wallet className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <p className="font-semibold text-foreground text-sm truncate">{w.userName}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{w.userEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="text-right">
            <p className="text-base font-bold text-foreground">${amountUsd.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Pago Móvil</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Solicitado: {format(new Date(w.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
            {w.userPhone && (() => { const link = waLink(w.userPhone); return link ? (
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            ) : null; })()}
          </div>

          {/* Desglose monetario */}
          <div className="p-3 rounded-xl bg-muted/40 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">A transferir al usuario</span><span className="font-semibold text-foreground">${amountUsd.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Comisión LinkServi</span><span className="font-medium text-emerald-600">${feeUsd.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-foreground font-semibold">Debitado del usuario</span><span className="font-bold text-foreground">${grossUsd.toFixed(2)}</span></div>
          </div>

          {/* Datos bancarios destino */}
          <div className="p-3 rounded-xl bg-muted/40 space-y-2">
            <p className="text-xs font-semibold text-foreground">Datos Pago Móvil destino</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Banco</span><span className="font-medium text-foreground">{dest.banco}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Teléfono</span><span className="font-medium text-foreground font-mono">{dest.telefono}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cédula</span><span className="font-medium text-foreground font-mono">{dest.cedula}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Titular</span><span className="font-medium text-foreground">{dest.titular}</span></div>
            </div>
          </div>

          {w.userPhone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Phone className="w-3 h-3" />
              <span className="font-medium text-foreground">Tel del usuario:</span> {w.userPhone}
            </p>
          )}

          {w.userNotes && (
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-foreground">
              <span className="font-semibold">Nota del usuario:</span> {w.userNotes}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {w.status === "pending" ? "Referencia / Nota interna" : "Nota"}
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Ref de la transferencia o motivo de rechazo..."
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          {w.status === "pending" && (
            <div className="flex gap-2">
              <button onClick={() => handle("reject")} disabled={!!loading}
                className="flex-1 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                {loading === "reject" ? "…" : "✕ Rechazar y devolver saldo"}
              </button>
              <button onClick={() => handle("complete")} disabled={!!loading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                {loading === "complete" ? "…" : "Marcar como pagado"}
              </button>
            </div>
          )}

          {(w.status === "rejected" || w.status === "completed") && w.adminNotes && (
            <div className="p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <span className="font-medium">Nota:</span> {w.adminNotes}
            </div>
          )}
          {(w.status === "rejected" || w.status === "completed") && w.processedAt && (
            <p className="text-[11px] text-muted-foreground">
              Procesado: {format(new Date(w.processedAt), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminWithdrawalsPage() {
  const [tab, setTab] = useState<"workers" | "stores" | "wallet">("wallet");
  const [workerWithdrawals, setWorkerWithdrawals] = useState<any[]>([]);
  const [storeWithdrawals, setStoreWithdrawals] = useState<any[]>([]);
  const [walletWithdrawals, setWalletWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [w, s, wal] = await Promise.all([
      fetchWorkerWithdrawals(),
      fetchStoreWithdrawals(),
      fetchWalletWithdrawals(),
    ]);
    setWorkerWithdrawals(w);
    setStoreWithdrawals(s);
    setWalletWithdrawals(wal);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const list =
    tab === "workers" ? workerWithdrawals :
    tab === "stores"  ? storeWithdrawals :
                        walletWithdrawals;
  const filtered = filter === "all" ? list : list.filter((w: any) => w.status === filter);

  const pendingWorkers = workerWithdrawals.filter(w => w.status === "pending").length;
  const pendingStores  = storeWithdrawals.filter(w => w.status === "pending").length;
  const pendingWallet  = walletWithdrawals.filter(w => w.status === "pending").length;

  // Para wallet, los montos están en cents; para los otros en USD float.
  const amountOf = (w: any) =>
    tab === "wallet" ? (w.amountCents ?? 0) / 100 : (w.amount ?? 0);
  const totalPending = list.filter(w => w.status === "pending").reduce((s: number, w: any) => s + amountOf(w), 0);
  const totalPaid = list.filter(w => w.status === "paid" || w.status === "completed").reduce((s: number, w: any) => s + amountOf(w), 0);

  // Status filters específicos por tab — wallet usa pending/completed/rejected.
  const statusFilters = tab === "wallet"
    ? [
        { id: "all", label: "Todos" },
        { id: "pending", label: "Pendientes" },
        { id: "completed", label: "Completados" },
        { id: "rejected", label: "Rechazados" },
      ]
    : STATUS_FILTERS;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestión de Retiros</h1>
            <p className="text-sm text-muted-foreground">LinkWallet, profesionales y Hosts / Co-Anfitriones</p>
          </div>
          <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Type tabs */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => { setTab("wallet"); setFilter("all"); }}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${tab === "wallet" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Wallet className="w-4 h-4" />
            <span className="hidden sm:inline">Billetera</span>
            <span className="sm:hidden">LinkWallet</span>
            {pendingWallet > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === "wallet" ? "bg-white/20" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                {pendingWallet}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("workers"); setFilter("all"); }}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${tab === "workers" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Profesionales</span>
            <span className="sm:hidden">Pros</span>
            {pendingWorkers > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === "workers" ? "bg-white/20" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                {pendingWorkers}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("stores"); setFilter("all"); }}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${tab === "stores" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Hosts</span>
            <span className="sm:hidden">Hosts</span>
            {pendingStores > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === "stores" ? "bg-white/20" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                {pendingStores}
              </span>
            )}
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{list.filter((w: any) => w.status === "pending").length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pendientes</p>
            {totalPending > 0 && <p className="text-xs text-amber-600 font-medium">${totalPending.toFixed(2)}</p>}
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{list.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">${totalPaid.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total pagado</p>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >
              {f.label}
              {f.id !== "all" && (
                <span className="ml-1 opacity-70">({list.filter((w: any) => w.status === f.id).length})</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? `No hay solicitudes de retiro de ${tab === "workers" ? "profesionales" : tab === "stores" ? "tiendas" : "billeteras"} aún.`
                : `No hay retiros con estado "${statusFilters.find(f => f.id === filter)?.label}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tab === "workers" && filtered.map((w: any) => <WorkerWithdrawalRow key={w.id} w={w} onUpdated={load} />)}
            {tab === "stores"  && filtered.map((w: any) => <StoreWithdrawalRow  key={w.id} w={w} onUpdated={load} />)}
            {tab === "wallet"  && filtered.map((w: any) => <WalletWithdrawalRow key={w.id} w={w} onUpdated={load} />)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
