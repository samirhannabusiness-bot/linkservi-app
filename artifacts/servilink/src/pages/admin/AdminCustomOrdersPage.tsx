import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { mediaSrc } from "@/lib/media-url";
import {
  CheckCircle, XCircle, Eye, ChevronDown, ChevronUp,
  RefreshCw, Package, User, MessageSquare, Truck
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  payment_pending: "⚡ Comprobante en revisión",
  paid:            "Pago confirmado ✓",
  payment_rejected:"Pago rechazado",
  dispatched:      "Despachado por vendedor",
  delivered:       "Entregado ✓",
  cancelled:       "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  payment_pending:  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  paid:             "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  payment_rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  dispatched:       "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  delivered:        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled:        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
};
const METHOD_LABEL: Record<string, string> = {
  pago_movil:    "📱 Pago Móvil",
  zelle:         "💵 Zelle",
  paypal:        "🅿 PayPal",
  transferencia: "🏦 Transferencia",
};

async function customOrderAction(orderId: number, action: "approve" | "reject", reason?: string) {
  const res = await fetch(`/api/custom-orders/${orderId}/${action}`, {
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

function OrderRow({ o, onUpdated }: { o: any; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isPending = o.status === "payment_pending";

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    setError("");
    try {
      await customOrderAction(o.id, action, rejectReason);
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
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isPending && <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0 animate-pulse" />}
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {o.imageUrl ? (
              <img src={mediaSrc(o.imageUrl)} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <Package className="w-5 h-5 m-2.5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">#{o.id}</span>
              <p className="font-medium text-foreground text-sm truncate">{o.productName ?? "Pedido personalizado"}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[o.status] ?? "bg-muted text-muted-foreground"}`}>
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {o.clientName ?? "Cliente"}</span>
              {o.storeName && <span className="truncate">{o.storeName}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-sm font-bold text-foreground">${Number(o.priceUsd).toFixed(2)}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Cliente</span>
              <p className="font-medium text-foreground mt-0.5">{o.clientName ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tienda</span>
              <p className="font-medium text-foreground mt-0.5">{o.storeName ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Precio USD</span>
              <p className="font-bold text-foreground mt-0.5">${Number(o.priceUsd).toFixed(2)}</p>
            </div>
            {o.paymentMethod && (
              <div>
                <span className="text-muted-foreground">Método</span>
                <p className="font-medium text-foreground mt-0.5">{METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</p>
              </div>
            )}
            {o.paymentAmount != null && (
              <div>
                <span className="text-muted-foreground">Monto pagado</span>
                <p className="font-bold text-foreground mt-0.5">${Number(o.paymentAmount).toFixed(2)}</p>
              </div>
            )}
            {o.paymentReference && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Referencia</span>
                <p className="font-mono text-foreground mt-0.5">{o.paymentReference}</p>
              </div>
            )}
            {o.hasDelivery && (
              <div className="col-span-2 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                <Truck className="w-3 h-3" /> Con delivery incluido
              </div>
            )}
          </div>

          {o.notes && (
            <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground/70 mb-0.5"><MessageSquare className="w-3 h-3" /> Nota del cliente:</span>
              {o.notes}
            </div>
          )}

          {o.paymentRejectedReason && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
              <span className="font-medium">Motivo de rechazo anterior:</span> {o.paymentRejectedReason}
            </div>
          )}

          {o.paymentProofUrl && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Comprobante de pago</p>
              <a
                href={mediaSrc(o.paymentProofUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                <Eye className="w-3.5 h-3.5" /> Ver comprobante
              </a>
              <img
                src={mediaSrc(o.paymentProofUrl)}
                alt="Comprobante"
                className="w-full max-h-52 object-contain rounded-xl border border-border bg-muted"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

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
                    onClick={() => handle("approve")}
                    disabled={!!loading}
                    className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {loading === "approve" ? "Aprobando..." : "✓ Aprobar pago"}
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
                      onClick={() => handle("reject")}
                      disabled={!!loading || !rejectReason.trim()}
                      className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {loading === "reject" ? "Rechazando..." : "Confirmar rechazo"}
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

type FilterKey = "all" | "payment_pending" | "paid" | "payment_rejected" | "delivered";

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all",              label: "Todos" },
  { key: "payment_pending",  label: "⚡ Verificar pago" },
  { key: "paid",             label: "Pago OK" },
  { key: "payment_rejected", label: "Rechazados" },
  { key: "delivered",        label: "Entregados" },
];

export function AdminCustomOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/custom-orders/admin", { headers: getAuthHeader() });
      if (!res.ok) throw new Error();
      setOrders(await res.json());
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCount = orders.filter(o => o.status === "payment_pending").length;
  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" /> Pedidos Personalizados
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pedidos del chat de tienda — verifica comprobantes y aprueba pagos
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

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTER_TABS.map(t => {
            const count = t.key === "all" ? orders.length : orders.filter(o => o.status === t.key).length;
            const isAlert = t.key === "payment_pending" && pendingCount > 0;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                  filter === t.key
                    ? "bg-foreground text-background border-foreground"
                    : isAlert
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

        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p>No hay pedidos{filter !== "all" ? " en este estado" : ""}</p>
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
