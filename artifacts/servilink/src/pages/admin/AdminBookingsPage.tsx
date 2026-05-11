import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getAuthHeader } from "@/lib/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { mediaSrc } from "@/lib/media-url";
import {
  CheckCircle, XCircle, Eye, X, ChevronDown, ChevronUp, RefreshCw,
  DollarSign, Clock, History,
} from "lucide-react";

// Statuses that require admin attention or are still in flight
const ACTIVE_STATUSES = new Set([
  "pending", "accepted", "payment_pending", "payment_confirmed", "in_progress", "finished",
]);
// Terminal / archived statuses
const ARCHIVE_STATUSES = new Set([
  "completed", "cancelled", "disputed", "dispute_in_review",
  "dispute_resolved_worker", "dispute_resolved_client",
]);

const STATUS_TABS = [
  { key: "active",           label: "Activas" },
  { key: "payment_pending",  label: "⚡ Verificar pago" },
  { key: "pending",          label: "Pendientes" },
  { key: "accepted",         label: "Por pagar" },
  { key: "payment_confirmed",label: "Pago OK" },
  { key: "in_progress",      label: "En Progreso" },
  { key: "archive",          label: "Historial" },
] as const;

type TabKey = typeof STATUS_TABS[number]["key"];

async function fetchAllBookings() {
  const res = await fetch("/api/admin/bookings", { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

async function adminPaymentAction(bookingId: number, action: "confirm-payment" | "reject-payment", reason?: string) {
  const res = await fetch(`/api/bookings/${bookingId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ reason: reason ?? "" }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error");
  }
  return res.json();
}

// ── Booking Row ───────────────────────────────────────────────────────────────

function BookingRow({ b, onUpdated }: { b: any; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isPending = b.status === "payment_pending";

  const handle = async (action: "confirm-payment" | "reject-payment") => {
    setLoading(action);
    setError("");
    try {
      await adminPaymentAction(b.id, action, rejectReason);
      setExpanded(false);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-colors ${isPending ? "border-cyan-300 dark:border-cyan-700" : "border-border"}`}>
      {/* Summary row */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isPending && <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0 animate-pulse" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">#{b.id}</span>
              <p className="font-medium text-foreground text-sm truncate">{b.categoryName}</p>
              <StatusBadge status={b.status} />
            </div>
            <p className="text-xs text-muted-foreground truncate">{b.clientName} → {b.workerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {b.totalAmount && <span className="text-sm font-bold text-foreground">${b.totalAmount.toFixed(2)}</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Fecha</span>
              <p className="font-medium text-foreground">{b.createdAt ? format(new Date(b.createdAt), "dd MMM yyyy, HH:mm", { locale: es }) : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Dirección</span>
              <p className="font-medium text-foreground truncate">{b.address ?? "—"}</p>
            </div>
          </div>

          {b.paymentProofUrl && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Comprobante de pago</p>
              {(b.paymentAmount || b.paymentReference || b.paymentMethod) && (
                <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                  {b.paymentAmount && (
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
                      <span className="text-muted-foreground block">Monto declarado</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">${Number(b.paymentAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {b.paymentMethod && (
                    <div className="p-2 rounded-lg bg-muted border border-border">
                      <span className="text-muted-foreground block">Método</span>
                      <span className="font-semibold text-foreground capitalize">{b.paymentMethod.replace("_", " ")}</span>
                    </div>
                  )}
                  {b.paymentReference && (
                    <div className="p-2 rounded-lg bg-muted border border-border col-span-2">
                      <span className="text-muted-foreground block">Referencia</span>
                      <span className="font-mono font-semibold text-foreground break-all">{b.paymentReference}</span>
                    </div>
                  )}
                </div>
              )}
              {(() => {
                const proofSrc = b.paymentProofUrl.startsWith("data:")
                  ? b.paymentProofUrl
                  : b.paymentProofUrl.startsWith("/objects/")
                    ? mediaSrc(b.paymentProofUrl)
                    : null;
                return proofSrc ? (
                  <div className="relative">
                    <img src={proofSrc} alt="Comprobante"
                      className="w-full max-h-56 object-contain rounded-xl bg-muted border border-border cursor-pointer"
                      onClick={() => setShowProof(true)} />
                    <button onClick={() => setShowProof(true)}
                      className="absolute bottom-2 right-2 flex items-center gap-1 text-xs bg-background/80 backdrop-blur border border-border px-2 py-1 rounded-lg">
                      <Eye className="w-3 h-3" /> Ver completo
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-muted rounded-xl border border-border text-xs text-muted-foreground">
                    Comprobante en formato PDF/otro
                  </div>
                );
              })()}
            </div>
          )}

          {!b.paymentProofUrl && b.status === "payment_pending" && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-xl">No se adjuntó imagen de comprobante.</p>
          )}

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          {b.status === "payment_pending" && (
            <div className="space-y-3">
              {!showRejectInput ? (
                <div className="flex gap-2">
                  <button onClick={() => setShowRejectInput(true)} disabled={!!loading}
                    className="flex-1 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                    <XCircle className="w-3.5 h-3.5 inline mr-1" /> Rechazar pago
                  </button>
                  <button onClick={() => handle("confirm-payment")} disabled={!!loading}
                    className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50">
                    <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                    {loading === "confirm-payment" ? "Confirmando..." : "✓ Confirmar pago"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
                    placeholder="Motivo del rechazo..."
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-500" />
                  <div className="flex gap-2">
                    <button onClick={() => setShowRejectInput(false)} className="flex-1 py-2 rounded-xl border border-border text-xs hover:bg-muted">Cancelar</button>
                    <button onClick={() => handle("reject-payment")} disabled={!!loading || !rejectReason.trim()}
                      className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-semibold disabled:opacity-50">
                      {loading === "reject-payment" ? "Rechazando..." : "Confirmar rechazo"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showProof && b.paymentProofUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowProof(false)}>
          <div className="relative max-w-2xl w-full">
            <img src={mediaSrc(b.paymentProofUrl)}
              alt="Comprobante" className="w-full rounded-xl" />
            <button onClick={() => setShowProof(false)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Collapsible archive section ───────────────────────────────────────────────

function ArchiveSection({ bookings, onUpdated }: { bookings: any[]; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  if (bookings.length === 0) return null;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="w-4 h-4" />
          Historial — {bookings.length} solicitud{bookings.length !== 1 ? "es" : ""} finalizada{bookings.length !== 1 ? "s" : ""}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-3 space-y-2 border-t border-border">
          {bookings.map(b => <BookingRow key={b.id} b={b} onUpdated={onUpdated} />)}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminBookingsPage() {
  const [tab, setTab] = useState<TabKey>("active");
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllBookings();
    setAllBookings(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Split into active vs archive
  const activeBookings  = allBookings.filter(b => ACTIVE_STATUSES.has(b.status));
  const archiveBookings = allBookings.filter(b => ARCHIVE_STATUSES.has(b.status));
  const paymentPendingCount = allBookings.filter(b => b.status === "payment_pending").length;

  // Apply status sub-filter
  const visibleBookings = (() => {
    if (tab === "active")   return activeBookings;
    if (tab === "archive")  return archiveBookings;
    return activeBookings.filter(b => b.status === tab);
  })();

  // Show archive section in "active" view at the bottom (collapsed)
  const showArchiveAccordion = tab === "active";

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Solicitudes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeBookings.length} activa{activeBookings.length !== 1 ? "s" : ""}
              {paymentPendingCount > 0 && (
                <span className="ml-2 text-cyan-600 font-semibold animate-pulse">
                  · ⚡ {paymentPendingCount} pago{paymentPendingCount > 1 ? "s" : ""} por verificar
                </span>
              )}
            </p>
          </div>
          <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
          {STATUS_TABS.map(t => {
            const count = t.key === "payment_pending"
              ? paymentPendingCount
              : t.key === "active"
                ? activeBookings.length
                : t.key === "archive"
                  ? archiveBookings.length
                  : allBookings.filter(b => b.status === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    tab === t.key
                      ? "bg-white/20 text-white"
                      : t.key === "payment_pending"
                        ? "bg-cyan-500 text-white animate-pulse"
                        : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Urgent payment alert */}
        {paymentPendingCount > 0 && (tab === "active" || tab === "payment_pending") && (
          <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/10 dark:border-cyan-800 flex items-start gap-3">
            <Clock className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">
                {paymentPendingCount} comprobante{paymentPendingCount > 1 ? "s" : ""} por verificar
              </p>
              <p className="text-xs text-cyan-700 dark:text-cyan-400 mt-0.5">
                Aprueba o rechaza cada comprobante para que los profesionales puedan iniciar el servicio.
              </p>
            </div>
          </div>
        )}

        {/* Bookings list */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : visibleBookings.length === 0 ? (
          <div className="py-16 text-center bg-card border border-border rounded-xl">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="font-semibold text-foreground">
              {tab === "payment_pending" ? "Sin pagos pendientes de verificar" : tab === "archive" ? "Sin solicitudes archivadas" : "Sin solicitudes activas"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === "active" ? "Todo en orden. No hay solicitudes activas ahora mismo." : "No hay solicitudes en esta categoría."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleBookings.map(b => <BookingRow key={b.id} b={b} onUpdated={load} />)}
          </div>
        )}

        {/* Collapsed archive at the bottom of "active" view */}
        {showArchiveAccordion && !loading && (
          <ArchiveSection bookings={archiveBookings} onUpdated={load} />
        )}
      </div>
    </AppLayout>
  );
}
