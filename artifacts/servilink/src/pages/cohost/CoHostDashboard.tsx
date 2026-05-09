import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import {
  Users, Calendar, DollarSign, ShoppingBag, Plus, ChevronRight,
  Briefcase, CheckCircle, Clock, PackageOpen, Trash2, ArrowDownToLine,
  Loader2, Store, Zap, Crown,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import {
  useCohostStats, useCohostWorkers, useCohostBookings, useCohostStores,
  useCreateWorker, useDeleteWorker, useBookingAction, useWithdrawCommission,
} from "@/hooks/cohost";
import { SkeletonRow, SkeletonStats } from "@/components/ui/Skeleton";

interface Category { id: number; name: string; icon: string; }

interface CreateWorkerForm {
  name: string; email: string; description: string;
  servicePrice: string; categoryId: string; state: string; city: string;
}

const statusLabel: Record<string, string> = {
  pending: "Pendiente", accepted: "Aceptado", in_progress: "En progreso",
  completed: "Completado", cancelled: "Cancelado", payment_confirmed: "Pago confirmado",
};
const statusColor: Record<string, string> = {
  pending: "bg-amber-400/20 text-amber-400",
  accepted: "bg-blue-400/20 text-blue-400",
  in_progress: "bg-violet-400/20 text-violet-400",
  completed: "bg-emerald-400/20 text-emerald-400",
  cancelled: "bg-red-400/20 text-red-400",
  payment_confirmed: "bg-cyan-400/20 text-cyan-400",
};

const EMPTY_WORKER_FORM: CreateWorkerForm = {
  name: "", email: "", description: "", servicePrice: "50",
  categoryId: "", state: "", city: "",
};

export function CoHostDashboard() {
  const { user, isManager } = useAuth();
  const [, navigate] = useLocation();
  const [showCreateWorker, setShowCreateWorker] = useState(false);
  const [form, setForm] = useState<CreateWorkerForm>(EMPTY_WORKER_FORM);
  const [confirmDeleteWorkerId, setConfirmDeleteWorkerId] = useState<number | null>(null);
  const [commissionWithdrawn, setCommissionWithdrawn] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: stats, isLoading: statsLoading } = useCohostStats();
  const { data: workers = [], isLoading: workersLoading } = useCohostWorkers();
  const { data: bookings = [], isLoading: bookingsLoading } = useCohostBookings();
  const { data: stores = [] } = useCohostStores();
  const { data: planInfo } = useQuery({
    queryKey: ["cohost", "plan"],
    queryFn: () => apiFetch("/api/cohost/plan", { headers: getAuthHeader() }),
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/api/categories"),
  });

  const loading = statsLoading || workersLoading || bookingsLoading;

  const createWorker = useCreateWorker();
  const deleteWorker = useDeleteWorker();
  const bookingAction = useBookingAction();
  const withdrawCommission = useWithdrawCommission();

  const handleWithdrawCommission = () => {
    withdrawCommission.mutate(undefined, {
      onSuccess: () => setCommissionWithdrawn(true),
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    createWorker.mutate(form, {
      onSuccess: () => {
        setShowCreateWorker(false);
        setForm(EMPTY_WORKER_FORM);
      },
      onError: (err: any) => setCreateError(err?.message ?? "Error al crear profesional"),
    });
  };

  const handleDeleteWorker = (workerId: number) => {
    deleteWorker.mutate(workerId, {
      onSettled: () => setConfirmDeleteWorkerId(null),
    });
  };

  const handleBookingAction = (id: number, action: "accept" | "reject") => {
    bookingAction.mutate({ id, action });
  };

  const pendingBookings = (bookings as any[]).filter((b: any) => b.status === "pending");
  const activeBookings = (bookings as any[]).filter((b: any) =>
    ["pending", "accepted", "in_progress", "payment_confirmed"].includes(b.status)
  );

  const firstName = user?.name?.split(" ")[0] ?? "Host";
  const serviceEarnings = stats?.estimatedEarnings ?? 0;
  const storeCommission = stats?.productCommissionBalanceUsd ?? 0;
  const totalBalance = serviceEarnings + storeCommission;

  // Activity flags — used to decide between onboarding vs active-user UI
  const hasEarnings = totalBalance > 0;
  const hasOrders = (stats?.totalProductOrders ?? 0) > 0;
  const hasProducts = (stats?.totalProducts ?? 0) > 0;
  const hasWorkers = (workers as any[]).length > 0;
  const hasActivity = hasEarnings || hasOrders || hasProducts || hasWorkers;
  const isNewUser = !loading && !hasActivity;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Tu equipo, {firstName} 👋</h1>
              {planInfo?.plan === "premium" && (
                <span className="flex items-center gap-1 text-xs bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold border border-amber-400/30">
                  <Crown className="w-3 h-3" /> Premium
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isNewUser ? "Agrega profesionales y empieza a ganar comisiones" : "Resumen de tu red y ganancias de hoy"}
            </p>
          </div>
          {planInfo?.plan === "premium" && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Ganas comisión</div>
              <div className="text-lg font-black text-amber-400">{planInfo?.commissionPct ?? 5}%</div>
            </div>
          )}
        </div>

        {/* ── BIENVENIDA — visible solo sin profesionales ── */}
        {!workersLoading && (workers as any[]).length === 0 && (
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              background: "linear-gradient(135deg,rgba(99,102,241,0.12) 0%,rgba(139,92,246,0.08) 100%)",
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            <div>
              <p className="text-lg font-black text-foreground leading-tight">Tu equipo está listo</p>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                Invita a tu primer profesional y empieza a ganar
              </p>
            </div>
            <button
              onClick={() => setShowCreateWorker(true)}
              className="btn-action-pulse w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:opacity-90 active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg,#4f46e5,#6366f1)",
                boxShadow: "0 0 24px rgba(99,102,241,0.4)",
              }}
            >
              <Users className="w-4 h-4" />
              Invitar profesional
            </button>
            <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
              Mientras más rápido invites, más rápido empiezas a ganar
            </p>
          </div>
        )}

        {/* ── PROGRESO — visible cuando ya tiene profesionales ── */}
        {!workersLoading && (workers as any[]).length > 0 && (
          <div
            className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{
              background: "linear-gradient(135deg,rgba(99,102,241,0.08) 0%,rgba(139,92,246,0.05) 100%)",
              border: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <span className="text-xl flex-shrink-0">💼</span>
            <p className="text-sm font-semibold text-foreground">Tu equipo ya está activo</p>
          </div>
        )}

        {/* ── ONBOARDING (usuario nuevo sin actividad) ── */}
        {isNewUser && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Primeros pasos</p>
            <div className="space-y-2">
              {[
                {
                  done: hasWorkers,
                  icon: Users,
                  color: "text-violet-400",
                  bg: "bg-violet-400/10",
                  label: "Agrega tu primer profesional",
                  sub: "Los profesionales son quienes prestan servicios en tu red",
                  href: undefined,
                  action: () => setShowCreateWorker(true),
                },
                {
                  done: (stores as any[]).length > 0,
                  icon: Store,
                  color: "text-emerald-400",
                  bg: "bg-emerald-400/10",
                  label: "Crea tu primera tienda",
                  sub: "Vende productos y gana comisiones por cada pedido",
                  href: "/cohost/stores",
                  action: undefined,
                },
                {
                  done: hasProducts,
                  icon: ShoppingBag,
                  color: "text-blue-400",
                  bg: "bg-blue-400/10",
                  label: "Sube tu primer producto",
                  sub: "Añade artículos a tu tienda para empezar a vender",
                  href: "/cohost/products",
                  action: undefined,
                },
              ].map(({ done, icon: Icon, color, bg, label, sub, href, action }) => {
                const inner = (
                  <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${done ? "opacity-50" : "hover:bg-white/[0.04] cursor-pointer"}`}>
                    <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                      {done
                        ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                        : <Icon className={`w-4 h-4 ${color}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{label}</p>
                      <p className="text-xs text-muted-foreground">{sub}</p>
                    </div>
                    {!done && <ChevronRight className={`w-4 h-4 ${color} flex-shrink-0`} />}
                  </div>
                );
                if (done) return <div key={label}>{inner}</div>;
                if (href) return <Link key={label} href={href}>{inner}</Link>;
                return <button key={label} onClick={action} className="w-full text-left">{inner}</button>;
              })}
            </div>
            <p className="text-xs text-muted-foreground pt-1 text-center">
              Una vez que empieces a generar ingresos, aquí verás tus métricas y opciones de crecimiento.
            </p>
          </div>
        )}

        {/* ── UPGRADE BANNER — solo gestores. Las comisiones por volumen y los
            beneficios Premium aplican al rol gestor, no al dueño de tienda. ── */}
        {isManager && !isNewUser && planInfo?.plan === "free" && !planInfo?.pendingRequest && (
          <Link href="/cohost/plan" className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-violet-500/10 border border-amber-400/20 hover:border-amber-400/40 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 flex items-center justify-center flex-shrink-0">
              <Crown className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Aumenta tus ganancias cuando ya estés vendiendo</p>
              <p className="text-xs text-muted-foreground">Ahora ganas 5% · Con Premium ganas hasta el doble</p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
          </Link>
        )}

        {/* ── SOLICITUD PENDIENTE ── */}
        {planInfo?.pendingRequest && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-400/10 border border-amber-400/20">
            <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-400 font-medium">Tu solicitud de Premium está en revisión</p>
          </div>
        )}

        {/* ── BALANCE HERO ── */}
        {loading ? (
          <div className="rounded-2xl bg-gradient-to-br from-violet-600/30 to-purple-700/30 p-6 animate-pulse space-y-4">
            <div className="h-3 w-36 bg-white/10 rounded" />
            <div className="h-12 w-48 bg-white/10 rounded" />
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
              <div className="space-y-2"><div className="h-2.5 w-24 bg-white/10 rounded" /><div className="h-6 w-16 bg-white/10 rounded" /></div>
              <div className="space-y-2"><div className="h-2.5 w-24 bg-white/10 rounded" /><div className="h-6 w-16 bg-white/10 rounded" /></div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 p-6 text-white shadow-xl">
            <p className="text-sm text-white/70 font-medium mb-1">Balance total estimado</p>
            <p className="text-5xl font-black tracking-tight">
              ${totalBalance.toFixed(2)}
              <span className="text-lg font-normal text-white/60 ml-1">USD</span>
            </p>
            <p className="text-xs text-white/50 mt-1">Servicios + comisiones de tienda</p>

            <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-white/20">
              <div>
                <p className="text-xs text-white/60 mb-0.5">Ganancias de servicios</p>
                <p className="text-xl font-bold">${serviceEarnings.toFixed(2)}</p>
                <p className="text-xs text-white/50">{stats?.completedBookings ?? 0} completados</p>
              </div>
              <div>
                <p className="text-xs text-white/60 mb-0.5">Comisiones de tienda (5%)</p>
                <p className="text-xl font-bold">${storeCommission.toFixed(2)}</p>
                {commissionWithdrawn ? (
                  <p className="text-xs text-emerald-300 flex items-center gap-1 mt-1">
                    <CheckCircle className="w-3 h-3" /> Retiro solicitado
                  </p>
                ) : (
                  <button
                    onClick={handleWithdrawCommission}
                    disabled={withdrawCommission.isPending || storeCommission <= 0}
                    className="mt-1 text-xs font-semibold text-white/80 hover:text-white flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {withdrawCommission.isPending ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Procesando...</>
                    ) : (
                      <><ArrowDownToLine className="w-3 h-3" /> Retirar comisiones</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ACCIÓN PRINCIPAL — Invitar profesional ── */}
        <div className="rounded-2xl p-4 flex items-center gap-4"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-sm">
              {(workers as any[]).length === 0
                ? "Agrega tu primer profesional"
                : `${(workers as any[]).length} profesional${(workers as any[]).length !== 1 ? "es" : ""} en tu equipo`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(workers as any[]).length === 0
                ? "Empieza invitando a alguien que conozcas"
                : "Agrega más para ganar más comisiones"}
            </p>
          </div>
          <button
            onClick={() => setShowCreateWorker(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white flex-shrink-0 transition-all hover:opacity-90 active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg,#4f46e5,#6366f1)" }}
          >
            <Plus className="w-4 h-4" /> Invitar
          </button>
        </div>

        {/* ── PENDIENTES ── */}
        {pendingBookings.length > 0 && (
          <button
            onClick={() => navigate("/cohost/bookings")}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 hover:border-amber-400 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-300">
                {pendingBookings.length === 1 ? "1 solicitud pendiente de aprobación" : `${pendingBookings.length} solicitudes pendientes de aprobación`}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Revísalas antes de que el cliente las cancele</p>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-500 flex-shrink-0" />
          </button>
        )}

        {/* ── Stats esenciales (siempre visibles) ── */}
        {statsLoading ? (
          <SkeletonStats cols={2} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "En tu equipo", value: stats?.totalWorkers ?? 0, icon: Users, color: "text-violet-500" },
              { label: "Servicios activos", value: stats?.activeBookings ?? 0, icon: Clock, color: "text-amber-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Toggle avanzado ── */}
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {showAdvanced ? "Ocultar herramientas adicionales ↑" : "Ver más herramientas (tiendas, productos) ↓"}
        </button>

        {/* ── Secciones avanzadas (colapsables) ── */}
        {showAdvanced && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Productos", value: stats?.totalProducts ?? 0, icon: ShoppingBag, color: "text-blue-500" },
                { label: "Pedidos", value: stats?.totalProductOrders ?? 0, icon: PackageOpen, color: "text-pink-500" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                  <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => navigate("/cohost/stores")}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border hover:border-emerald-400/50 transition-all group">
                <div className="w-9 h-9 rounded-xl bg-emerald-400/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Store className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-xs font-semibold text-foreground text-center">Mis Tiendas</span>
              </button>
              <button onClick={() => navigate("/cohost/products")}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border hover:border-blue-400/50 transition-all group">
                <div className="w-9 h-9 rounded-xl bg-blue-400/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ShoppingBag className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-xs font-semibold text-foreground text-center">Productos</span>
              </button>
              <button onClick={() => navigate("/cohost/orders")}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border hover:border-pink-400/50 transition-all group">
                <div className="w-9 h-9 rounded-xl bg-pink-400/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PackageOpen className="w-5 h-5 text-pink-400" />
                </div>
                <span className="text-xs font-semibold text-foreground text-center">Pedidos</span>
              </button>
            </div>
          </>
        )}

        {/* ── Mis Profesionales ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" /> Administrar equipo
            </h2>
            <div className="flex items-center gap-2">
              <Link href="/cohost/workers" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                Ver todos <ChevronRight className="w-3 h-3" />
              </Link>
              <button
                onClick={() => setShowCreateWorker(true)}
                className="btn-gradient text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>

          {workersLoading ? (
            <div className="divide-y divide-border">
              {[...Array(2)].map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : (workers as any[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm px-5">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Aún no tienes profesionales. ¡Agrega el primero!
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(workers as any[]).slice(0, 5).map((w: any) => (
                <div key={w.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {w.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{w.name}</span>
                      {w.isVerified && <span className="text-xs bg-emerald-400/20 text-emerald-500 px-1.5 py-0.5 rounded">✓ Verificado</span>}
                      {w.isAvailable
                        ? <span className="text-xs bg-emerald-400/20 text-emerald-500 px-1.5 py-0.5 rounded">Disponible</span>
                        : <span className="text-xs bg-red-400/20 text-red-400 px-1.5 py-0.5 rounded">No disponible</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">${w.servicePrice}/servicio · {w.completedJobs} completados · ★ {w.rating?.toFixed(1) ?? "0.0"}</div>
                  </div>
                  {confirmDeleteWorkerId === w.id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">¿Eliminar?</span>
                      <button
                        onClick={() => handleDeleteWorker(w.id)}
                        className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
                      >
                        Sí
                      </button>
                      <button
                        onClick={() => setConfirmDeleteWorkerId(null)}
                        className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs hover:bg-muted/80 transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteWorkerId(w.id)}
                      className="p-1.5 rounded-lg hover:bg-red-400/10 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {(workers as any[]).length > 5 && (
                <div className="px-5 py-3 text-center">
                  <Link href="/cohost/workers" className="text-xs text-primary">Ver los {(workers as any[]).length} profesionales →</Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Solicitudes activas ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" /> Solicitudes de trabajo
            </h2>
            <Link href="/cohost/bookings" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todas <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {bookingsLoading ? (
            <div className="divide-y divide-border">
              {[...Array(2)].map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : activeBookings.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm px-5">No hay solicitudes activas en este momento</p>
          ) : (
            <div className="divide-y divide-border">
              {activeBookings.slice(0, 5).map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[b.status] ?? "bg-muted text-muted-foreground"}`}>
                        {statusLabel[b.status] ?? b.status}
                      </span>
                      <span className="text-sm font-semibold text-foreground">${b.totalAmount?.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{b.workerName} · #{b.id}</div>
                  </div>
                  {b.status === "pending" && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleBookingAction(b.id, "accept")}
                        className="text-xs bg-emerald-400/20 text-emerald-500 px-3 py-1.5 rounded-lg hover:bg-emerald-400/30 transition-colors font-medium"
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={() => handleBookingAction(b.id, "reject")}
                        className="text-xs bg-red-400/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-400/30 transition-colors font-medium"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Create Worker Modal */}
      {showCreateWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">Agregar profesional</h3>
              <button onClick={() => { setShowCreateWorker(false); setCreateError(""); setForm(EMPTY_WORKER_FORM); }} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nombre completo *</label>
                <input
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Carlos Pérez"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email *</label>
                <input
                  type="email"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="carlos@email.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
                <textarea
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  placeholder="Plomero con 5 años de experiencia..."
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Precio base (USD)</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.servicePrice}
                    onChange={e => setForm(p => ({ ...p, servicePrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Categoría</label>
                  <select
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.categoryId}
                    onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                  >
                    <option value="">Sin categoría</option>
                    {(categories as Category[]).map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
                  <input
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Miranda"
                    value={form.state}
                    onChange={e => setForm(p => ({ ...p, state: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ciudad</label>
                  <input
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Caracas"
                    value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                  />
                </div>
              </div>
              {createError && <p className="text-xs text-red-400">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreateWorker(false); setCreateError(""); setForm(EMPTY_WORKER_FORM); }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createWorker.isPending}
                  className="flex-1 py-2.5 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createWorker.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : "Agregar profesional"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
