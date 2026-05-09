import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import {
  Package, Clock, CheckCircle, XCircle, Truck,
  ChevronDown, ChevronUp, ShoppingBag, Eye, AlertTriangle, Zap
} from "lucide-react";
import { C2PModal } from "@/components/payments/C2PModal";

interface CustomOrder {
  id: number;
  storeId: number | null;
  productName: string;
  imageUrl: string | null;
  priceUsd: number;
  hasDelivery: boolean;
  status: string;
  paymentMethod: string | null;
  paymentRejectedReason: string | null;
  notes: string | null;
  createdAt: string;
  storeName: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  payment_pending:  "Comprobante en verificación",
  paid:             "Pago confirmado — preparando pedido",
  payment_rejected: "Comprobante rechazado",
  dispatched:       "¡En camino! El vendedor lo envió",
  delivered:        "Entregado ✓",
  cancelled:        "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  payment_pending:  "bg-cyan-400/20 text-cyan-400",
  paid:             "bg-teal-400/20 text-teal-400",
  payment_rejected: "bg-red-400/20 text-red-400",
  dispatched:       "bg-violet-400/20 text-violet-400",
  delivered:        "bg-emerald-400/20 text-emerald-400",
  cancelled:        "bg-zinc-400/20 text-zinc-400",
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  payment_pending:  <Clock className="w-4 h-4" />,
  paid:             <CheckCircle className="w-4 h-4" />,
  payment_rejected: <XCircle className="w-4 h-4" />,
  dispatched:       <Truck className="w-4 h-4" />,
  delivered:        <Truck className="w-4 h-4" />,
  cancelled:        <XCircle className="w-4 h-4" />,
};
const METHOD_LABEL: Record<string, string> = {
  pago_movil:    "📱 Pago Móvil",
  zelle:         "💵 Zelle",
  paypal:        "🅿 PayPal",
  transferencia: "🏦 Transferencia",
};

function smartDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 24) return d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
  if (diffH < 48) return "Ayer";
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}

function OrderCard({ o, onPaid }: { o: CustomOrder; onPaid: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [c2pOpen, setC2pOpen] = useState(false);
  const isPending = o.status === "payment_pending";
  const isRejected = o.status === "payment_rejected";
  const canC2P = isPending || isRejected;

  return (
    <div className={`glass rounded-2xl overflow-hidden ${isRejected ? "ring-1 ring-red-500/40" : isPending ? "ring-1 ring-cyan-500/30" : ""}`}>
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0">
          {o.imageUrl
            ? <img src={o.imageUrl.startsWith("/api/storage") ? o.imageUrl : `/api/storage${o.imageUrl}`} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            : <Package className="w-6 h-6 m-3 text-white/30" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-white text-sm truncate">{o.productName}</p>
            <span className="text-xs text-white/40 flex-shrink-0">{smartDate(o.createdAt)}</span>
          </div>
          {o.storeName && <p className="text-xs text-white/40 truncate mt-0.5">{o.storeName}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[o.status] ?? "bg-white/10 text-white/50"}`}>
              {STATUS_ICON[o.status]} {STATUS_LABEL[o.status] ?? o.status}
            </span>
            <span className="text-sm font-bold text-white">${Number(o.priceUsd).toFixed(2)}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.07] px-4 pb-4 pt-3 space-y-3">
          {isRejected && o.paymentRejectedReason && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-400">Comprobante rechazado</p>
                <p className="text-xs text-red-300/80 mt-0.5">{o.paymentRejectedReason}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-white/40">Pedido #</span>
              <p className="font-mono text-white/80 mt-0.5">{o.id}</p>
            </div>
            <div>
              <span className="text-white/40">Precio</span>
              <p className="font-bold text-white mt-0.5">${Number(o.priceUsd).toFixed(2)}</p>
            </div>
            {o.paymentMethod && (
              <div>
                <span className="text-white/40">Método</span>
                <p className="text-white/80 mt-0.5">{METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</p>
              </div>
            )}
            {o.hasDelivery && (
              <div className="col-span-2 flex items-center gap-1.5 text-xs text-blue-400">
                <Truck className="w-3 h-3" /> Con delivery incluido
              </div>
            )}
          </div>

          {o.notes && (
            <div className="px-3 py-2 rounded-xl bg-white/[0.04] text-xs text-white/50">
              <span className="font-medium text-white/60 block mb-0.5">Tu nota:</span>
              {o.notes}
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Clock className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <p className="text-xs text-cyan-300">LinkServi está verificando tu pago. Recibirás una notificación en máx. 30 min.</p>
            </div>
          )}

          {o.status === "paid" && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20">
              <CheckCircle className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <p className="text-xs text-teal-300">¡Pago aprobado! El cohost está preparando tu pedido.</p>
            </div>
          )}

          {canC2P && (
            <button
              onClick={() => setC2pOpen(true)}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)", boxShadow: "0 8px 24px rgba(14,165,233,0.3)" }}
            >
              <Zap className="w-4 h-4" /> {isRejected ? "Reintentar pago al instante (C2P)" : "Pagar al instante con C2P (BDV)"}
            </button>
          )}

          <a
            href={`/store-chat/${o.storeId ?? ""}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/10 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white/80 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" /> Ver chat de la tienda
          </a>
        </div>
      )}

      {c2pOpen && (
        <C2PModal
          open={c2pOpen}
          onClose={() => setC2pOpen(false)}
          amountUsd={Number(o.priceUsd)}
          concept={`Pedido custom #${o.id} — ${o.productName}`}
          referenceType="custom_order"
          referenceId={o.id}
          onSuccess={() => {
            setC2pOpen(false);
            onPaid();
          }}
        />
      )}
    </div>
  );
}

export function ClientCustomOrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/custom-orders/my", { headers: getAuthHeader() });
      if (!res.ok) throw new Error();
      setOrders(await res.json());
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = orders.filter(o => o.status === "payment_pending").length;
  const rejectedCount = orders.filter(o => o.status === "payment_rejected").length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mis Pedidos de Tienda</h1>
        <p className="text-sm text-muted-foreground mt-1">Pedidos personalizados realizados desde el chat</p>
      </div>

      {(pendingCount > 0 || rejectedCount > 0) && (
        <div className="space-y-2">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Clock className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <p className="text-xs text-cyan-300 font-medium">
                {pendingCount === 1 ? "Tienes 1 comprobante en verificación" : `Tienes ${pendingCount} comprobantes en verificación`}
              </p>
            </div>
          )}
          {rejectedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-300 font-medium">
                {rejectedCount === 1 ? "1 comprobante fue rechazado" : `${rejectedCount} comprobantes fueron rechazados`} — ve al chat de la tienda para reenviar
              </p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="glass rounded-2xl h-24 animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-foreground font-medium">No tienes pedidos personalizados aún</p>
          <p className="text-sm text-muted-foreground mt-1">Cuando solicites un producto desde el chat de una tienda, aparecerá aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => <OrderCard key={o.id} o={o} onPaid={load} />)}
        </div>
      )}
    </div>
  );
}
