import { useState } from "react";
import {
  Package, Clock, CheckCircle, XCircle, Truck, MapPin,
  Phone, User, ChevronDown, ChevronUp, ShoppingBag, Eye,
  TrendingUp, MessageSquare, Store,
} from "lucide-react";
import { useCohostOrders, useOrderAction, useCohostCustomOrders, useCustomOrderDispatch } from "@/hooks/cohost";
import { SkeletonCard, SkeletonStats, QueryError } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";
import { mediaSrc } from "@/lib/media-url";

// ─── Product-orders status maps ───────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado — esperando pago",
  payment_pending: "Comprobante en revisión",
  payment_confirmed: "Pago confirmado ✓",
  dispatched: "En camino",
  delivered: "Entregado ✓",
  cancelled: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-400/20 text-amber-400",
  accepted: "bg-orange-400/20 text-orange-400",
  payment_pending: "bg-cyan-400/20 text-cyan-400",
  payment_confirmed: "bg-teal-400/20 text-teal-400",
  dispatched: "bg-violet-400/20 text-violet-400",
  delivered: "bg-emerald-400/20 text-emerald-400",
  cancelled: "bg-red-400/20 text-red-400",
  paid: "bg-teal-400/20 text-teal-400",
  payment_rejected: "bg-red-400/20 text-red-400",
};
const CUSTOM_STATUS_LABEL: Record<string, string> = {
  payment_pending: "Verificando pago…",
  paid: "¡Pago confirmado! Listo para enviar",
  dispatched: "Enviado al cliente",
  payment_rejected: "Comprobante rechazado",
};
const METHOD_LABEL: Record<string, string> = {
  pago_movil: "📱 Pago Móvil", zelle: "💵 Zelle",
  paypal: "🅿 PayPal", transferencia: "🏦 Transferencia",
};

// ─── Custom Orders Tab ────────────────────────────────────────────────────────
function CustomOrdersTab() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data: orders = [], isLoading, isError, refetch } = useCohostCustomOrders();
  const dispatch = useCustomOrderDispatch();

  const all = orders as any[];
  const pending = all.filter((o: any) => o.status === "paid").length;
  const inTransit = all.filter((o: any) => o.status === "dispatched").length;
  const reviewing = all.filter((o: any) => o.status === "payment_pending").length;

  if (isLoading) return (
    <div className="space-y-3 mt-4">
      <SkeletonStats cols={3} />
      {[...Array(2)].map((_, i) => <SkeletonCard key={i} lines={3} />)}
    </div>
  );

  if (isError) return (
    <div className="mt-4">
      <QueryError message="No se pudieron cargar los pedidos del chat" onRetry={() => refetch()} />
    </div>
  );

  return (
    <div className="space-y-4 mt-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Verificando", count: reviewing, color: "text-cyan-400" },
          { label: "Para enviar", count: pending, color: "text-teal-400" },
          { label: "En camino", count: inTransit, color: "text-violet-400" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-foreground font-medium">No tienes pedidos del chat aún</p>
          <p className="text-sm text-muted-foreground mt-1">Los pedidos que los clientes hagan en el chat de tu tienda aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {all.map((o: any) => {
            const isExp = expanded === o.id;
            const isActing = dispatch.isPending && dispatch.variables === o.id;

            return (
              <div
                key={o.id}
                className="glass rounded-2xl overflow-hidden transition-opacity"
                style={{ opacity: isActing ? 0.6 : 1 }}
              >
                <button
                  onClick={() => setExpanded(isExp ? null : o.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0">
                    {o.imageUrl ? (
                      <img src={mediaSrc(o.imageUrl)} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <Package className="w-6 h-6 m-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm truncate">{o.productName ?? "Producto"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[o.status] ?? "bg-muted text-muted-foreground"}`}>
                        {CUSTOM_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" /> {o.clientName ?? "Cliente"} · #{o.id}
                    </div>
                    {o.storeName && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Store className="w-3 h-3" /> {o.storeName}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 mr-1">
                    <div className="font-bold text-foreground text-sm">${Number(o.priceUsd).toFixed(2)}</div>
                  </div>
                  {isExp ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {isExp && (
                  <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
                    {o.deliveryAddress && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{o.deliveryAddress}</span>
                      </div>
                    )}
                    {o.notes && (
                      <div className="bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-muted-foreground">
                        <span className="text-xs font-medium text-foreground/60 block mb-0.5">Nota:</span>
                        {o.notes}
                      </div>
                    )}

                    {/* Payment info */}
                    {o.paymentProofUrl && (
                      <div className="glass rounded-xl p-3 space-y-1.5">
                        <p className="text-xs font-medium text-foreground/70">Comprobante de pago</p>
                        {o.paymentMethod && <p className="text-xs text-muted-foreground">{METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</p>}
                        {o.paymentAmount && <p className="text-sm font-bold text-foreground">${Number(o.paymentAmount).toFixed(2)}</p>}
                        {o.paymentReference && <p className="text-xs text-muted-foreground">Ref: {o.paymentReference}</p>}
                        <a
                          href={mediaSrc(o.paymentProofUrl)}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver comprobante
                        </a>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Pedido recibido: {new Date(o.createdAt).toLocaleString("es-VE")}
                    </div>

                    {/* Action */}
                    {o.status === "payment_pending" && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-400/10 text-cyan-400 text-sm">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        LinkServi está verificando el pago del cliente
                      </div>
                    )}
                    {o.status === "paid" && (
                      <button
                        onClick={() => dispatch.mutate(o.id)}
                        disabled={isActing}
                        className="w-full py-2.5 rounded-xl btn-gradient text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Truck className="w-4 h-4" />
                        {isActing ? "Procesando…" : "Marcar como enviado"}
                      </button>
                    )}
                    {o.status === "dispatched" && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-400/10 text-violet-400 text-sm">
                        <Truck className="w-4 h-4" /> Pedido enviado al cliente ✓
                      </div>
                    )}
                    {o.status === "payment_rejected" && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-400/10 text-red-400 text-sm">
                        <XCircle className="w-4 h-4" /> Comprobante rechazado por LinkServi
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Product Orders Tab (existing system) ────────────────────────────────────
function ProductOrdersTab() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const { data: orders = [], isLoading, isError, refetch } = useCohostOrders();
  const orderAction = useOrderAction();

  const action = (orderId: number, endpoint: string) => {
    orderAction.mutate({ orderId, endpoint });
  };

  const allOrders = orders as any[];
  const filtered = filter === "all" ? allOrders : allOrders.filter((o: any) => o.status === filter);

  const stats = {
    pending: allOrders.filter((o: any) => o.status === "pending").length,
    payment_pending: allOrders.filter((o: any) => o.status === "payment_pending").length,
    payment_confirmed: allOrders.filter((o: any) => o.status === "payment_confirmed").length,
    dispatched: allOrders.filter((o: any) => o.status === "dispatched").length,
  };

  if (isLoading) return (
    <div className="space-y-3 mt-4">
      <SkeletonStats cols={4} />
      {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={3} />)}
    </div>
  );

  if (isError) return (
    <div className="mt-4">
      <QueryError message="No se pudieron cargar los pedidos" onRetry={() => refetch()} />
    </div>
  );

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Nuevos", count: stats.pending, color: "text-amber-400", status: "pending" },
          { label: "Verificando", count: stats.payment_pending, color: "text-cyan-400", status: "payment_pending" },
          { label: "Pago OK", count: stats.payment_confirmed, color: "text-teal-400", status: "payment_confirmed" },
          { label: "En camino", count: stats.dispatched, color: "text-violet-400", status: "dispatched" },
        ].map(s => (
          <button
            key={s.status}
            onClick={() => setFilter(filter === s.status ? "all" : s.status)}
            className={`glass rounded-xl p-3 text-center transition-all ${filter === s.status ? "ring-1 ring-primary" : ""}`}
          >
            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</div>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-foreground font-medium">No hay pedidos {filter !== "all" ? `con estado "${STATUS_LABEL[filter]}"` : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o: any) => {
            const isExpanded = expanded === o.id;
            const isActing = orderAction.isPending && orderAction.variables?.orderId === o.id;
            const bsTotal = (o.priceUsdAtMoment * o.bcvRateAtMoment).toFixed(2);

            return (
              <div key={o.id} className="glass rounded-2xl overflow-hidden transition-opacity duration-200" style={{ opacity: isActing ? 0.6 : 1 }}>
                <button onClick={() => setExpanded(isExpanded ? null : o.id)} className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors text-left">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0">
                    {o.productImage ? <img src={o.productImage} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 m-3 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm truncate">{o.productName ?? "Producto"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[o.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" /> {o.clientName ?? "Cliente"} · Pedido #{o.id}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-1">
                    <div className="font-bold text-foreground text-sm">${o.priceUsdAtMoment?.toFixed(2)}</div>
                    <div className="text-xs text-emerald-400">Bs. {bsTotal}</div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
                    {o.clientPhone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" /> {o.clientPhone}
                      </div>
                    )}
                    {o.deliveryAddress && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{o.deliveryAddress}</span>
                      </div>
                    )}
                    {o.notes && (
                      <div className="bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-muted-foreground">
                        <span className="text-xs font-medium text-foreground/60 block mb-0.5">Nota del cliente:</span>
                        {o.notes}
                      </div>
                    )}
                    {o.paymentProofUrl && (o.status === "payment_pending" || o.status === "payment_confirmed") && (
                      <div className="glass rounded-xl p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground/70">Comprobante del cliente</p>
                        {o.paymentMethod && <p className="text-xs text-muted-foreground">{METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</p>}
                        {o.paymentAmount && <p className="text-sm font-bold text-foreground">${o.paymentAmount.toFixed(2)}</p>}
                        <a href={mediaSrc(o.paymentProofUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                          <Eye className="w-3.5 h-3.5" /> Ver imagen del comprobante
                        </a>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Recibido: {new Date(o.createdAt).toLocaleString("es-VE")}</div>
                    {(o.status === "pending" || o.status === "accepted") && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-orange-400/10 text-orange-400 text-sm">
                          <Clock className="w-4 h-4 flex-shrink-0" /> Esperando que el cliente complete el pago a LinkServi
                        </div>
                        <button onClick={() => action(o.id, "cancel")} disabled={isActing} className="w-full py-2 rounded-xl bg-red-400/10 text-red-400 text-sm font-medium hover:bg-red-400/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                          <XCircle className="w-4 h-4" /> Cancelar pedido
                        </button>
                      </div>
                    )}
                    {o.status === "payment_pending" && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-400/10 text-cyan-400 text-sm">
                        <Clock className="w-4 h-4 flex-shrink-0" /> Comprobante enviado — LinkServi está verificando el pago
                      </div>
                    )}
                    {o.status === "payment_confirmed" && (
                      <button onClick={() => action(o.id, "dispatch")} disabled={isActing} className="w-full py-2.5 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                        <Truck className="w-4 h-4" /> Marcar como despachado
                      </button>
                    )}
                    {o.status === "dispatched" && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-400/10 text-violet-400 text-sm">
                        <Truck className="w-4 h-4" /> En camino — esperando confirmación del cliente
                      </div>
                    )}
                    {o.status === "delivered" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-400/10 text-emerald-400 text-sm">
                          <CheckCircle className="w-4 h-4" /> Entregado — pago liberado a tu cuenta
                        </div>
                        {(o.storeEarningsAmt != null || o.platformCommissionAmt != null) && (
                          <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                              <TrendingUp className="w-3 h-3" /> Desglose de ganancias
                            </p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Monto total pagado</span>
                                <span className="font-medium text-foreground">${o.priceUsdAtMoment.toFixed(2)}</span>
                              </div>
                              {o.platformCommissionAmt != null && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Comisión plataforma (10%)</span>
                                  <span className="text-red-400">−${o.platformCommissionAmt.toFixed(2)}</span>
                                </div>
                              )}
                              {o.cohostCommissionAmt != null && o.cohostCommissionAmt > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Comisión Host</span>
                                  <span className="text-amber-400">−${o.cohostCommissionAmt.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between pt-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                                <span className="font-semibold text-foreground">Ganancia neta del vendedor</span>
                                <span className="font-bold text-emerald-400">${(o.storeEarningsAmt ?? o.priceUsdAtMoment).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {o.status === "cancelled" && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-400/10 text-red-400 text-sm">
                        <XCircle className="w-4 h-4" /> Pedido cancelado
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CoHostOrdersPage() {
  const { user } = useAuth();
  // Gestores no tienen acceso al backend de custom-orders/chat (requireRole "cohost"),
  // así que abrimos directamente en "store" y ocultamos el tab "chat" para ellos.
  const userRoles = [
    user?.role,
    (user as any)?.secondaryRole,
    ...((user as any)?.roles ?? []),
  ].filter(Boolean) as string[];
  const isManagerOnly = userRoles.includes("gestor") && !userRoles.includes("cohost") && !userRoles.includes("seller") && user?.role !== "admin";
  const [tab, setTab] = useState<"chat" | "store">(isManagerOnly ? "store" : "chat");

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pedidos de Productos</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestiona los pedidos de tu tienda</p>
      </div>

      {/* Tabs */}
      {!isManagerOnly && (
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          <button
            onClick={() => setTab("chat")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "chat" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <MessageSquare className="w-4 h-4" /> Pedidos del Chat
          </button>
          <button
            onClick={() => setTab("store")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "store" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <ShoppingBag className="w-4 h-4" /> Pedidos Tienda
          </button>
        </div>
      )}

      {tab === "chat" ? <CustomOrdersTab /> : <ProductOrdersTab />}
    </div>
  );
}
