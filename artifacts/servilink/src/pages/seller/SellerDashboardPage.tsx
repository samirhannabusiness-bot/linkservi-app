import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import {
  Package, ShoppingBag, DollarSign, ChevronRight, Store,
  Crown, Clock, CheckCircle, TrendingUp, Tag, Zap, Eye,
  ArrowDownToLine, Loader2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { useCohostStores, useRequestStoreWithdrawal } from "@/hooks/cohost";
import { SkeletonStats, SkeletonCard } from "@/components/ui/Skeleton";
import { useBcvRate } from "@/hooks/useBcvRate";

function useSellerStats() {
  return useQuery({
    queryKey: ["seller", "stats"],
    queryFn: () => apiFetch("/api/user/earnings", { headers: getAuthHeader() }),
  });
}

function useSellerProductCount() {
  return useQuery({
    queryKey: ["seller", "products"],
    queryFn: () => apiFetch("/api/cohost/products", { headers: getAuthHeader() }),
    select: (data: any[]) => data.filter((p: any) => p.isActive).length,
  });
}

function useSellerOrderCount() {
  return useQuery({
    queryKey: ["seller", "order-count"],
    queryFn: () => apiFetch("/api/product-orders/cohost", { headers: getAuthHeader() }),
    select: (data: any[]) => ({
      total: data.length,
      delivered: data.filter((o: any) => o.status === "delivered").length,
    }),
  });
}

function useSellerPlan() {
  return useQuery({
    queryKey: ["cohost", "plan"],
    queryFn: () => apiFetch("/api/cohost/plan", { headers: getAuthHeader() }),
  });
}

function useStoreProducts(storeId: number) {
  return useQuery({
    queryKey: ["store-products-preview", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/stores/${storeId}/products`, { headers: getAuthHeader() });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: storeId > 0,
  });
}

function StoreProductsPreview({ store }: { store: any }) {
  const { data: products = [] } = useStoreProducts(store.id);
  const allProducts = products as any[];
  const activeProducts = allProducts.filter((p: any) => p.isActive);
  const requestWithdrawal = useRequestStoreWithdrawal();
  const [withdrawDone, setWithdrawDone] = useState(false);
  const { formatBs } = useBcvRate();

  const handleWithdraw = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (store.balanceUsd <= 0 || withdrawDone) return;
    requestWithdrawal.mutate(store.id, { onSuccess: () => setWithdrawDone(true) });
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Store header */}
      <div className="flex items-center gap-3 p-4">
        <Link href={`/cohost/stores/${store.id}`} className="flex items-center gap-3 flex-1 min-w-0 group hover:bg-white/[0.03] -m-1 p-1 rounded-xl transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/[0.06] overflow-hidden flex-shrink-0 flex items-center justify-center">
            {store.logoUrl
              ? <img src={store.logoUrl} alt="" className="w-full h-full object-cover" />
              : <Store className="w-6 h-6 text-muted-foreground opacity-40" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{store.name}</h3>
              {!store.isActive && (
                <span className="text-[10px] bg-red-400/20 text-red-400 px-1.5 py-0.5 rounded-full">Inactiva</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-emerald-400 font-medium">${store.balanceUsd.toFixed(2)} USD</span>
              <span className="text-[10px] text-emerald-400/60 font-medium">{formatBs(store.balanceUsd)}</span>
              <span className="text-xs text-muted-foreground">· {activeProducts.length} activos</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </Link>

        {/* Withdraw button */}
        {withdrawDone ? (
          <span className="flex-shrink-0 flex items-center gap-1 text-xs text-emerald-400 font-semibold px-3 py-1.5 rounded-lg bg-emerald-400/10 border border-emerald-400/20">
            <CheckCircle className="w-3.5 h-3.5" /> Solicitado
          </span>
        ) : (
          <button
            onClick={handleWithdraw}
            disabled={requestWithdrawal.isPending || store.balanceUsd <= 0}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: store.balanceUsd > 0
                ? "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.2))"
                : "rgba(255,255,255,0.04)",
              border: store.balanceUsd > 0 ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(255,255,255,0.08)",
              color: store.balanceUsd > 0 ? "#34d399" : "rgba(255,255,255,0.25)",
            }}
            title={store.balanceUsd <= 0 ? "Sin saldo disponible" : "Solicitar retiro de saldo"}
          >
            {requestWithdrawal.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
              : <><ArrowDownToLine className="w-3.5 h-3.5" /> Retirar</>}
          </button>
        )}

        {/* Public store button */}
        <Link
          href={`/stores/${store.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))",
            border: "1px solid rgba(139,92,246,0.4)",
            color: "#a78bfa",
          }}
        >
          <Eye className="w-3.5 h-3.5" />
          Ver tienda
        </Link>
      </div>

      {/* Products grid preview */}
      {activeProducts.length === 0 ? (
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.05]">
          <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-white/[0.03]">
            <Package className="w-4 h-4 text-muted-foreground opacity-40 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">Sin productos activos · <Link href={`/cohost/stores/${store.id}`} className="text-primary hover:underline">Agregar producto</Link></p>
          </div>
        </div>
      ) : (
        <div className="border-t border-white/[0.05]">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4">
            {activeProducts.slice(0, 6).map((p: any) => {
              const cover = (p.images && p.images.length > 0) ? p.images[0] : p.image;
              return (
                <div
                  key={p.id}
                  className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] hover:border-primary/30 transition-all group"
                >
                  <div className="aspect-square bg-white/[0.04] overflow-hidden">
                    {cover
                      ? <img src={cover} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-muted-foreground opacity-30" /></div>}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-foreground truncate leading-tight">{p.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-bold text-emerald-400">${Number(p.priceUsd).toFixed(2)}</span>
                      {p.category && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Tag className="w-2.5 h-2.5" />{p.category.split(" ")[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {activeProducts.length > 6 && (
            <div className="px-4 pb-4 pt-0">
              <Link href={`/cohost/stores/${store.id}`} className="block text-center text-xs text-primary hover:underline">
                Ver {activeProducts.length - 6} productos más →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SellerDashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "Vendedor";

  const { data: stats, isLoading: statsLoading } = useSellerStats();
  const { data: planInfo } = useSellerPlan();
  const { data: stores = [], isLoading: storesLoading } = useCohostStores();
  const { data: productCount = 0 } = useSellerProductCount();
  const { data: orderData } = useSellerOrderCount();

  const isPremium = planInfo?.plan === "premium";
  const hasPending = !!planInfo?.pendingRequest;
  const allStores = stores as any[];

  const { formatBs } = useBcvRate();

  const totalSold = stats?.totalSold ?? 0;
  const totalEarned = stats?.totalEarned ?? 0;
  const feePaid = stats?.platformCut ?? (totalSold > 0 ? +(totalSold - totalEarned).toFixed(2) : 0);
  const totalProducts = productCount as number;
  const totalOrders = orderData?.total ?? 0;
  const deliveredOrders = orderData?.delivered ?? stats?.completedCount ?? 0;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Hola, {firstName} 👋</h1>
              {isPremium && (
                <span className="flex items-center gap-1 text-xs bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold border border-amber-400/30">
                  <Crown className="w-3 h-3" /> Premium
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Panel de vendedor · aquí está el resumen de tu actividad
            </p>
          </div>
          {isPremium && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Fee de venta</div>
              <div className="text-lg font-black text-violet-400">7%</div>
            </div>
          )}
        </div>

        {/* Premium upgrade banner */}
        {!isPremium && !hasPending && (
          <Link
            href="/cohost/plan"
            className="flex items-center gap-3 p-3.5 rounded-xl transition-colors group"
            style={{
              background: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(217,119,6,0.06))",
              border: "1px solid rgba(251,191,36,0.25)",
            }}
          >
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 flex items-center justify-center flex-shrink-0">
              <Crown className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Cada venta sin Premium te cuesta más dinero</p>
              <p className="text-xs text-muted-foreground">Pagas 10% en cada venta · Con Premium ese fee baja al 7%</p>
            </div>
            <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
          </Link>
        )}

        {/* Pending plan request */}
        {hasPending && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-400/10 border border-amber-400/20">
            <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-400 font-medium">Tu solicitud de Plan Premium está en revisión</p>
          </div>
        )}

        {/* Balance hero */}
        {statsLoading ? (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600/30 to-teal-700/30 p-6 animate-pulse space-y-4">
            <div className="h-3 w-36 bg-white/10 rounded" />
            <div className="h-12 w-48 bg-white/10 rounded" />
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-2.5 w-20 bg-white/10 rounded" />
                  <div className="h-6 w-16 bg-white/10 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-6 text-white shadow-xl"
            style={{ background: "linear-gradient(135deg, #059669, #0f766e)" }}
          >
            <p className="text-sm text-white/70 font-medium mb-1">Ingreso neto acumulado</p>
            <p className="text-5xl font-black tracking-tight">
              ${totalEarned.toFixed(2)}
              <span className="text-lg font-normal text-white/60 ml-1">USD</span>
            </p>
            <p className="text-sm text-white/50 mt-1 font-medium">{formatBs(totalEarned)}</p>
            <p className="text-xs text-white/40 mt-0.5">Ya descontado el fee de venta de la plataforma</p>

            <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-white/20">
              <div>
                <p className="text-xs text-white/60 mb-0.5">Total vendido</p>
                <p className="text-xl font-bold">${totalSold.toFixed(2)}</p>
                <p className="text-[10px] text-white/40">{formatBs(totalSold)}</p>
              </div>
              <div>
                <p className="text-xs text-white/60 mb-0.5">Fee pagado ({isPremium ? "7%" : "10%"})</p>
                <p className="text-xl font-bold text-red-300">${feePaid.toFixed(2)}</p>
                <p className="text-[10px] text-white/40">a la plataforma</p>
              </div>
              <div>
                <p className="text-xs text-white/60 mb-0.5">Ventas completadas</p>
                <p className="text-xl font-bold">{deliveredOrders}</p>
                <p className="text-[10px] text-white/40">pedidos</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick stats */}
        {statsLoading ? (
          <SkeletonStats cols={3} />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Productos activos", value: totalProducts, icon: Package, color: "text-blue-400" },
              { label: "Pedidos totales", value: totalOrders, icon: ShoppingBag, color: "text-violet-400" },
              { label: "Entregados", value: deliveredOrders, icon: CheckCircle, color: "text-emerald-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="glass rounded-xl p-4 text-center">
                <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/cohost/stores" className="flex items-center gap-3 p-4 rounded-xl glass hover:ring-1 hover:ring-primary/40 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Mis Tiendas</p>
              <p className="text-xs text-muted-foreground">{allStores.length} tienda{allStores.length !== 1 ? "s" : ""}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/cohost/products" className="flex items-center gap-3 p-4 rounded-xl glass hover:ring-1 hover:ring-primary/40 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Mis Productos</p>
              <p className="text-xs text-muted-foreground">{totalProducts} en total</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/cohost/orders" className="flex items-center gap-3 p-4 rounded-xl glass hover:ring-1 hover:ring-primary/40 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-violet-400/10 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Pedidos Tienda</p>
              <p className="text-xs text-muted-foreground">{totalOrders} pedidos</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/cohost/earnings" className="flex items-center gap-3 p-4 rounded-xl glass hover:ring-1 hover:ring-primary/40 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Ganancias</p>
              <p className="text-xs text-muted-foreground">Ver desglose</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/cohost/stores" className="flex items-center gap-3 p-4 rounded-xl glass hover:ring-1 hover:ring-emerald-400/30 transition-all group col-span-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
              <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Retiros</p>
              <p className="text-xs text-muted-foreground">Solicitar pago de tu saldo disponible</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Store previews with products */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mis Tiendas y Productos</p>
            <Link href="/cohost/stores" className="text-xs text-primary hover:underline">Ver tiendas →</Link>
          </div>

          {storesLoading ? (
            <div className="space-y-4">
              {[...Array(1)].map((_, i) => <SkeletonCard key={i} lines={4} />)}
            </div>
          ) : allStores.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <Store className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-foreground font-medium">No tienes tiendas aún</p>
              <p className="text-sm text-muted-foreground mt-1">Crea tu primera tienda para empezar a vender</p>
              <Link href="/cohost/stores">
                <button className="mt-4 btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2">
                  <Store className="w-4 h-4" /> Crear tienda
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {allStores.map((store: any) => (
                <StoreProductsPreview key={store.id} store={store} />
              ))}
            </div>
          )}
        </div>

        {/* Fee awareness footer */}
        {!isPremium && totalSold > 0 && (
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}
          >
            <DollarSign className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                Pagaste <span className="text-amber-400 font-semibold">${feePaid.toFixed(2)}</span> en fee de venta (10%) ·{" "}
                Con Premium habrías pagado <span className="text-amber-400 font-semibold">${(totalSold * 0.07).toFixed(2)}</span>
              </p>
            </div>
            <Link href="/cohost/plan" className="text-xs font-semibold text-amber-400 hover:underline flex-shrink-0">
              Cambiar →
            </Link>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
