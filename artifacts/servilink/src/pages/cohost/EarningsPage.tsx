import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { SellerPremiumBanner } from "@/components/ui/SellerPremiumBanner";
import {
  TrendingUp, DollarSign, ShoppingBag, BarChart3,
  Store, Users, ArrowDownToLine, Clock, CheckCircle,
  XCircle, Truck, Sparkles, Loader2, AlertCircle, Info,
} from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  venta: "Venta",
  retiro: "Retiro",
};
const TYPE_COLOR: Record<string, string> = {
  venta: "text-emerald-400",
  retiro: "text-violet-400",
};
const TYPE_BG: Record<string, string> = {
  venta: "bg-emerald-400/10",
  retiro: "bg-violet-400/10",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  payment_pending: "Verificando pago",
  payment_confirmed: "Pago OK",
  dispatched: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
  approved: "Aprobado",
  paid: "Pagado",
  rejected: "Rechazado",
};
const STATUS_COLOR: Record<string, string> = {
  delivered: "text-emerald-400",
  paid: "text-emerald-400",
  approved: "text-teal-400",
  pending: "text-amber-400",
  payment_pending: "text-cyan-400",
  payment_confirmed: "text-teal-400",
  dispatched: "text-violet-400",
  cancelled: "text-red-400",
  rejected: "text-red-400",
};

interface EarningsData {
  totalSold: number;
  totalEarned: number;
  completedCount: number;
  avgOrder: number;
  totalCommissionEarned: number;
  platformCut: number;
  storeCount: number;
  workerCount: number;
}

interface Transaction {
  id: string;
  date: string;
  type: "venta" | "retiro";
  amount: number;
  netAmount: number | null;
  commissionAmt: number | null;
  platformAmt: number | null;
  status: string;
  description: string;
  storeName: string;
}

function fmt(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function EarningsPage() {
  const { user } = useAuth();
  const isCohost = user?.role === "cohost";
  const isSeller = user?.role === "seller";

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch("/api/user/earnings", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setEarnings(d))
      .catch(() => setError("No se pudieron cargar las ganancias"))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setTxLoading(true);
    fetch("/api/user/transactions", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setTransactions(d))
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [user]);

  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const sellerStats = earnings ? [
    {
      label: "Total vendido",
      value: `$${fmt(earnings.totalSold)}`,
      sub: "Monto bruto en pedidos entregados",
      icon: ShoppingBag,
      color: "#06B6D4",
      bg: "rgba(6,182,212,0.1)",
    },
    {
      label: "Total ganado",
      value: `$${fmt(earnings.totalEarned)}`,
      sub: "Después del fee de venta de la plataforma",
      icon: DollarSign,
      color: "#10B981",
      bg: "rgba(16,185,129,0.1)",
    },
    {
      label: "Pedidos completados",
      value: String(earnings.completedCount),
      sub: "Pedidos entregados y confirmados",
      icon: CheckCircle,
      color: "#A78BFA",
      bg: "rgba(167,139,250,0.1)",
    },
    {
      label: "Promedio por pedido",
      value: `$${fmt(earnings.avgOrder)}`,
      sub: "Valor promedio de cada venta",
      icon: BarChart3,
      color: "#FBBF24",
      bg: "rgba(251,191,36,0.1)",
    },
  ] : [];

  const cohostStats = earnings ? [
    {
      label: "Generado por tu red",
      value: `$${fmt(earnings.totalSold)}`,
      sub: "Total vendido por todas tus tiendas",
      icon: TrendingUp,
      color: "#06B6D4",
      bg: "rgba(6,182,212,0.1)",
    },
    {
      label: "Tus comisiones",
      value: `$${fmt(earnings.totalCommissionEarned)}`,
      sub: "Comisión acumulada de tus tiendas",
      icon: DollarSign,
      color: "#10B981",
      bg: "rgba(16,185,129,0.1)",
    },
    {
      label: "Tiendas gestionadas",
      value: String(earnings.storeCount),
      sub: "Tiendas activas en tu red",
      icon: Store,
      color: "#A78BFA",
      bg: "rgba(167,139,250,0.1)",
    },
    {
      label: "Profesionales",
      value: String(earnings.workerCount),
      sub: "Profesionales en tu equipo",
      icon: Users,
      color: "#FBBF24",
      bg: "rgba(251,191,36,0.1)",
    },
  ] : [];

  const stats = isCohost ? cohostStats : sellerStats;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          {isCohost ? "Panel de Ganancias" : "Mis Ganancias"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isCohost
            ? "Rendimiento total de tu red de tiendas y profesionales"
            : "Resumen financiero de tus ventas en ServiMarket"
          }
        </p>
      </div>

      {/* Info banner — role-specific */}
      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.12)" }}
      >
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          {isSeller ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                Ya estás pagando comisión en cada venta
              </p>
              <p className="text-xs text-muted-foreground">
                La plataforma descuenta el 10% de cada pedido entregado. Cada venta sin Premium te cuesta más dinero — con Plan Premium ese costo baja al 7%.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                Tu comisión se calcula automáticamente según tu plan y volumen mensual
              </p>
              <p className="text-xs text-muted-foreground">
                Entre más vendes, mayor es tu porcentaje de ganancia. Plan Premium: hasta 10% de comisión sobre cada venta.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Premium upsell — sellers on free plan */}
      {isSeller && <SellerPremiumBanner />}

      {/* Stats grid */}
      {error ? (
        <div className="glass rounded-2xl p-8 text-center space-y-2">
          <AlertCircle className="w-8 h-8 mx-auto text-red-400 opacity-60" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass rounded-2xl p-4 animate-pulse space-y-3">
              <div className="w-8 h-8 rounded-xl bg-white/[0.06]" />
              <div className="h-6 w-24 rounded bg-white/[0.04]" />
              <div className="h-3 w-32 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => (
            <div
              key={s.label}
              className="glass rounded-2xl p-4 space-y-3 transition-all hover:bg-white/[0.04]"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: s.bg }}
              >
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground leading-tight">{s.label}</div>
              </div>
              <p className="text-[11px] text-muted-foreground/70 leading-tight">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Cost breakdown — seller only */}
      {!isCohost && earnings && earnings.completedCount > 0 && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Costo de comisión acumulado
          </p>
          <div className="space-y-2">
            {[
              { label: "Total vendido (bruto)", value: earnings.totalSold, color: "text-foreground", neg: false },
              { label: "Comisión de venta pagada (10%)", value: earnings.platformCut ?? 0, color: "text-red-400", neg: true },
              { label: "Tu ingreso neto", value: earnings.totalEarned, color: "text-emerald-400", neg: false },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <span className={`text-sm font-semibold ${row.color}`}>
                  {row.neg ? `-$${fmt(row.value)}` : `$${fmt(row.value)}`}
                </span>
              </div>
            ))}
          </div>
          {/* Premium comparison callout */}
          {(() => {
            const platformCut = earnings.platformCut ?? 0;
            const premiumCut = +(earnings.totalSold * 0.07).toFixed(2);
            const savings = +(platformCut - premiumCut).toFixed(2);
            return savings > 0 ? (
              <div
                className="mt-1 px-3 py-2.5 rounded-xl flex items-start gap-2"
                style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)" }}
              >
                <span className="text-amber-400 text-sm flex-shrink-0">⚡</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-400">
                    Con Premium habrías pagado ${fmt(premiumCut)} en comisión
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Te hubieras ahorrado <span className="text-amber-400 font-semibold">${fmt(savings)}</span> en costo de venta — solo por pagar 7% en vez de 10%
                  </p>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Transaction history */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Historial de transacciones</h2>

        {txLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass rounded-xl p-4 animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-white/[0.04]" />
                  <div className="h-2.5 w-24 rounded bg-white/[0.04]" />
                </div>
                <div className="h-4 w-16 rounded bg-white/[0.04]" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <BarChart3 className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-foreground font-medium">Sin transacciones aún</p>
            <p className="text-xs text-muted-foreground mt-1">
              Aquí verás tus ventas y retiros cuando empiecen a generarse.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => {
              const isExpanded = expandedTx === tx.id;
              const isVenta = tx.type === "venta";
              const isDelivered = tx.status === "delivered";
              const statusLabel = STATUS_LABEL[tx.status] ?? tx.status;
              const statusColor = STATUS_COLOR[tx.status] ?? "text-muted-foreground";

              return (
                <div key={tx.id} className="glass rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: TYPE_BG[tx.type] }}
                    >
                      {isVenta
                        ? <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                        : <ArrowDownToLine className="w-3.5 h-3.5 text-violet-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{tx.description}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TYPE_BG[tx.type]} ${TYPE_COLOR[tx.type]}`}>
                          {TYPE_LABEL[tx.type]}
                        </span>
                      </div>
                      <div className={`text-xs mt-0.5 flex items-center gap-1.5 ${statusColor}`}>
                        {tx.status === "delivered" || tx.status === "paid" ? <CheckCircle className="w-3 h-3" /> :
                         tx.status === "cancelled" || tx.status === "rejected" ? <XCircle className="w-3 h-3" /> :
                         tx.status === "dispatched" ? <Truck className="w-3 h-3" /> :
                         <Clock className="w-3 h-3" />}
                        {statusLabel} · {new Date(tx.date).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-sm font-bold ${isVenta ? "text-foreground" : "text-violet-400"}`}>
                        ${fmt(tx.amount)}
                      </div>
                      {isVenta && isDelivered && tx.netAmount != null && (
                        <div className="text-[10px] text-emerald-400">+${fmt(tx.netAmount)} neto</div>
                      )}
                    </div>
                  </button>

                  {/* Expanded detail — only for delivered sales */}
                  {isExpanded && isVenta && isDelivered && tx.netAmount != null && (
                    <div
                      className="px-4 pb-4 pt-1 space-y-2 border-t"
                      style={{ borderColor: "rgba(255,255,255,0.05)" }}
                    >
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">
                        {isSeller ? "Costo de venta" : "Desglose de ganancias"}
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monto total pagado</span>
                          <span className="font-medium text-foreground">${fmt(tx.amount)}</span>
                        </div>
                        {tx.platformAmt != null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {isSeller ? "Comisión de venta pagada (10%)" : "Comisión plataforma (10%)"}
                            </span>
                            <span className="text-red-400">−${fmt(tx.platformAmt)}</span>
                          </div>
                        )}
                        {tx.commissionAmt != null && tx.commissionAmt > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Comisión Host</span>
                            <span className="text-amber-400">−${fmt(tx.commissionAmt)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                          <span className="font-semibold text-foreground">
                            {isSeller ? "Tu ingreso neto" : "Ganancia neta del vendedor"}
                          </span>
                          <span className="font-bold text-emerald-400">${fmt(tx.netAmount)}</span>
                        </div>
                      </div>
                      {/* Seller: post-sale Premium comparison */}
                      {isSeller && tx.platformAmt != null && tx.platformAmt > 0 && (
                        <div
                          className="px-2.5 py-2 rounded-lg flex items-start gap-1.5"
                          style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)" }}
                        >
                          <span className="text-amber-400 text-xs flex-shrink-0">⚡</span>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            <span className="text-amber-400 font-semibold">Con Premium habrías pagado ${fmt(+(tx.amount * 0.07).toFixed(2))}</span>
                            {" "}en vez de ${fmt(tx.platformAmt)} — ahorro de{" "}
                            <span className="text-amber-400 font-semibold">${fmt(+(tx.platformAmt - tx.amount * 0.07).toFixed(2))}</span> en esta venta
                          </p>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground/60">
                        Tienda: {tx.storeName} · {new Date(tx.date).toLocaleString("es-VE")}
                      </p>
                    </div>
                  )}

                  {/* Expanded detail — for retiro */}
                  {isExpanded && !isVenta && (
                    <div
                      className="px-4 pb-4 pt-1 space-y-2 border-t"
                      style={{ borderColor: "rgba(255,255,255,0.05)" }}
                    >
                      <div className="flex justify-between text-xs pt-2">
                        <span className="text-muted-foreground">Monto solicitado</span>
                        <span className="font-bold text-violet-400">${fmt(tx.amount)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Estado</span>
                        <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60">
                        {tx.storeName} · {new Date(tx.date).toLocaleString("es-VE")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
