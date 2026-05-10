import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Clock, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp,
  ArrowDownToLine, ExternalLink, MessageCircle,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type Deposit = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  method: "bdv" | "binance" | "zelle";
  amountCents: number;
  status: "pending" | "approved" | "rejected";
  proofUrl: string | null;
  externalRef: string | null;
  userNotes: string | null;
  adminNotes: string | null;
  bdvTransactionId: number | null;
  processedAt: string | null;
  createdAt: string;
};

const METHOD_LABELS: Record<string, string> = {
  bdv: "BDV (automático)",
  binance: "Binance",
  zelle: "Zelle",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  pending: { label: "Pendiente", icon: Clock, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800" },
  approved: { label: "Acreditado", icon: CheckCircle, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
  rejected: { label: "Rechazado", icon: XCircle, color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800" },
};

async function fetchDeposits(): Promise<Deposit[]> {
  const res = await fetch("/api/admin/wallet/deposits", { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function depositAction(id: number, action: "approve" | "reject", notes?: string) {
  const res = await fetch(`/api/admin/wallet/deposits/${id}/${action}`, {
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

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function DepositRow({ d, onUpdated }: { d: Deposit; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(d.adminNotes ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    setError("");
    try { await depositAction(d.id, action, notes); onUpdated(); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(null); }
  };

  const waLink = (() => {
    if (!d.userPhone) return null;
    const clean = d.userPhone.replace(/[^0-9]/g, "");
    const formatted = clean.startsWith("58") ? clean : `58${clean.replace(/^0/, "")}`;
    const msg = `Hola ${d.userName}, sobre tu recarga de ${fmtUsd(d.amountCents)} en LinkServi.`;
    return `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
  })();

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${cfg.border}`}>
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-foreground text-sm truncate">{d.userName}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{d.userEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="text-right">
            <p className="text-base font-bold text-foreground">{fmtUsd(d.amountCents)}</p>
            <p className="text-xs text-muted-foreground">{METHOD_LABELS[d.method] ?? d.method}</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Solicitado: {format(new Date(d.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            )}
          </div>

          {d.method !== "bdv" && d.proofUrl && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Comprobante</p>
              <a href={d.proofUrl} target="_blank" rel="noopener noreferrer" className="block">
                <img src={d.proofUrl} alt="Comprobante" className="max-h-80 w-auto rounded-lg border border-border" />
                <span className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" /> Abrir en pestaña nueva
                </span>
              </a>
            </div>
          )}

          {d.externalRef && (
            <div className="p-3 rounded-xl bg-muted/40 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referencia externa</span>
                <span className="font-medium text-foreground break-all">{d.externalRef}</span>
              </div>
              {d.bdvTransactionId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Txn BDV</span>
                  <span className="font-medium text-foreground">#{d.bdvTransactionId}</span>
                </div>
              )}
            </div>
          )}

          {d.userNotes && (
            <div className="p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Nota del usuario:</span> {d.userNotes}
            </div>
          )}

          {d.status === "pending" && (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Nota interna (opcional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Motivo de aprobación o rechazo..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => handle("reject")} disabled={!!loading}
                  className="flex-1 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                  {loading === "reject" ? "…" : "Rechazar"}
                </button>
                <button onClick={() => handle("approve")} disabled={!!loading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  {loading === "approve" ? "…" : "Aprobar y acreditar"}
                </button>
              </div>
            </>
          )}

          {d.status !== "pending" && d.adminNotes && (
            <div className="p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Nota admin:</span> {d.adminNotes}
            </div>
          )}
          {d.processedAt && (
            <p className="text-xs text-muted-foreground">
              Procesado: {format(new Date(d.processedAt), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Acreditados" },
  { id: "rejected", label: "Rechazados" },
];

export function AdminWalletDepositsPage() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchDeposits();
    setDeposits(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? deposits : deposits.filter(d => d.status === filter);
  const pendingCount = deposits.filter(d => d.status === "pending").length;
  const totalPending = deposits.filter(d => d.status === "pending").reduce((s, d) => s + d.amountCents, 0);
  const totalApproved = deposits.filter(d => d.status === "approved").reduce((s, d) => s + d.amountCents, 0);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ArrowDownToLine className="w-6 h-6 text-primary" />
              Recargas LinkWallet
            </h1>
            <p className="text-sm text-muted-foreground">Aprobar recargas Binance y Zelle. BDV es automático.</p>
          </div>
          <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pendientes</p>
            {totalPending > 0 && <p className="text-xs text-amber-600 font-medium">{fmtUsd(totalPending)}</p>}
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{deposits.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{fmtUsd(totalApproved)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Acreditado</p>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
              {f.label}
              {f.id !== "all" && (
                <span className="ml-1 opacity-70">({deposits.filter(d => d.status === f.id).length})</span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {loading && deposits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay recargas en esta categoría.</p>
          ) : (
            filtered.map(d => <DepositRow key={d.id} d={d} onUpdated={load} />)
          )}
        </div>
      </div>
    </AppLayout>
  );
}
