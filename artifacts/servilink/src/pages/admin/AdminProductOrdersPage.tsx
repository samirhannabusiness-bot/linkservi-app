import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  CheckCircle, XCircle, Eye, ChevronDown, ChevronUp, RefreshCw,
  Package, MapPin, User, ShoppingBag
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado — esperando pago",
  payment_pending: "⚡ Comprobante en revisión",
  payment_confirmed: "Pago confirmado ✓",
  dispatched: "En camino",
  delivered: "Entregado ✓",
  cancelled: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  payment_pending: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  payment_confirmed: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  dispatched: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};
const METHOD_LABEL: Record<string, string> = {
  pago_movil: "📱 Pago Móvil",
  zelle: "💵 Zelle",
  paypal: "🅿 PayPal",
  transferencia: "🏦 Transferencia",
};

async function productOrderAction(orderId: number, action: "confirm-payment" | "reject-payment" | "accept", reason?: string) {
  const res = await fetch(`/api/product-orders/${orderId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ reason: reason ?? "" }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error ?? "Error");
  }
  return res.json();
}

// ── Order Row ─────────────────────────────────────────────────────────────────
function OrderRow({ o, onUpdated }: { o: any; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isNewOrder = o.status === "pending";
  const isPending = o.status === "payment_pending";

  const handle = async (action: "confirm-payment" | "reject-payment" | "accept") => {
    setLoading(action);
    setError("");
    try {
      await productOrderAction(o.id, action, rejectReason);
      setExpanded(false);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-colors ${isPending ? "border-cyan-300 dark:border-cyan-700" : isNewOrder ? "border-amber-300 dark:border-amber-700" : "border-border"}`}>
      {/* Summary row */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isPending && <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0 animate-pulse" />}
          {isNewOrder && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" />}
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {o.productImage ? (
              <img src={o.productImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="w-5 h-5 m-2.5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">#{o.id}</span>
              <p className="font-medium text-foreground text-sm truncate">{o.productName ?? "Producto"}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[o.status] ?? "bg-muted text-muted-foreground"}`}>
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <User className="w-3 h-3" /> {o.clientName ?? "Cliente"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-sm font-bold text-foreground">${o.priceUsdAtMoment?.toFixed(2)}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Cliente</span>
              <p className="font-medium text-foreground mt-0.5">{o.clientName ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Monto USD</span>
              <p className="font-bold text-foreground mt-0.5">${o.priceUsdAtMoment?.toFixed(2)}</p>
            </div>
            {o.paymentMethod && (
              <div>
                <span className="text-muted-foreground">Método de pago</span>
                <p className="font-medium text-foreground mt-0.5">{METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</p>
              </div>
            )}
            {o.paymentAmount && (
              <div>
                <span className="text-muted-foreground">Monto pagado</span>
                <p className="font-bold text-foreground mt-0.5">${o.paymentAmount.toFixed(2)}</p>
              </div>
            )}
            {o.paymentReference && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Referencia</span>
                <p className="font-mono text-foreground mt-0.5">{o.paymentReference}</p>
              </div>
            )}
          </div>

          {o.deliveryAddress && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{o.deliveryAddress}</span>
            </div>
          )}

          {o.notes && (
            <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70 block mb-0.5">Nota:</span>{o.notes}
            </div>
          )}

          {/* Proof image */}
          {o.paymentProofUrl && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Comprobante</p>
              <a
                href={`/api/storage${o.paymentProofUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                <Eye className="w-3.5 h-3.5" /> Ver comprobante
              </a>
              {/* Try inline image preview */}
              <img
                src={`/api/storage${o.paymentProofUrl}`}
                alt="Comprobante"
                className="w-full max-h-48 object-contain rounded-xl border border-border bg-muted"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Accept new orders */}
          {isNewOrder && (
            <div className="pt-1">
              <div className="mb-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-300">
                ⏳ Este pedido espera que el vendedor lo acepte para que el cliente pueda pagar.
              </div>
              <button
                onClick={() => handle("accept")}
                disabled={!!loading}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {loading === "accept" ? "Aceptando..." : "✓ Aceptar pedido"}
              </button>
            </div>
          )}

          {/* Admin actions (only for payment_pending) */}
          {isPending && (
            <div className="space-y-2 pt-1">
              {!showRejectInput ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRejectInput(true)}
                    disabled={!!loading}
                    className="flex-1 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Rechazar
                  </button>
                  <button
                    onClick={() => handle("confirm-payment")}
                    disabled={!!loading}
                    className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {loading === "confirm-payment" ? "Confirmando..." : "✓ Confirmar pago"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Motivo del rechazo (ej: imagen borrosa, monto incorrecto...)"
                    rows={2}
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                      className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/30"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handle("reject-payment")}
                      disabled={!!loading || !rejectReason.trim()}
                      className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {loading === "reject-payment" ? "Rechazando..." : "Confirmar rechazo"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type FilterKey = "all" | "pending" | "payment_pending" | "accepted" | "payment_confirmed" | "dispatched" | "delivered";

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "⏳ Nuevos" },
  { key: "payment_pending", label: "⚡ Verificar pago" },
  { key: "accepted", label: "Por pagar" },
  { key: "payment_confirmed", label: "Pago OK" },
  { key: "dispatched", label: "En camino" },
  { key: "delivered", label: "Entregados" },
];

export function AdminProductOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/product-orders/admin", { headers: getAuthHeader() });
      if (!res.ok) throw new Error();
      setOrders(await res.json());
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const newOrderCount = orders.filter(o => o.status === "pending").length;
  const pendingPaymentCount = orders.filter(o => o.status === "payment_pending").length;

  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" /> Pedidos de Tienda
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Verifica comprobantes y gestiona el flujo de pedidos de productos
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTER_TABS.map(t => {
            const count = t.key === "payment_pending"
              ? pendingPaymentCount
              : t.key === "all"
              ? orders.length
              : orders.filter(o => o.status === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                  filter === t.key
                    ? "bg-foreground text-background border-foreground"
                    : t.key === "pending" && newOrderCount > 0
                    ? "border-amber-400 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100"
                    : t.key === "payment_pending" && pendingPaymentCount > 0
                    ? "border-cyan-400 text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${filter === t.key ? "bg-background text-foreground" : "bg-muted text-foreground"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Orders list */}
        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p>No hay pedidos{filter !== "all" ? ` en este estado` : ""}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(o => <OrderRow key={o.id} o={o} onUpdated={load} />)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
