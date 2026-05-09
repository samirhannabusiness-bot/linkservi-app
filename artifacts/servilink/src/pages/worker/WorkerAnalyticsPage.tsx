import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useWorkerAnalytics } from "@/hooks/useWorkerAnalytics";
import {
  TrendingUp, DollarSign, CheckCircle, Star, BarChart2,
  ArrowLeft, Award, Target, Clock
} from "lucide-react";

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
        <div
          className={`w-full rounded-t-md transition-all ${color}`}
          style={{ height: `${Math.max(pct, 2)}%`, minHeight: 3 }}
        />
      </div>
    </div>
  );
}

function StatusPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${color} border`}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-bold">{count}</span>
    </div>
  );
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendientes", color: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/10 dark:border-amber-800 dark:text-amber-400" },
  accepted: { label: "Aceptados", color: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/10 dark:border-blue-800 dark:text-blue-400" },
  payment_pending: { label: "Pago pendiente", color: "bg-cyan-50 border-cyan-200 text-cyan-800 dark:bg-cyan-900/10 dark:border-cyan-800 dark:text-cyan-400" },
  payment_confirmed: { label: "Pago confirmado", color: "bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-900/10 dark:border-teal-800 dark:text-teal-400" },
  in_progress: { label: "En progreso", color: "bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/10 dark:border-purple-800 dark:text-purple-400" },
  finished: { label: "Finalizados", color: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/10 dark:border-orange-800 dark:text-orange-400" },
  completed: { label: "Completados ✓", color: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/10 dark:border-emerald-800 dark:text-emerald-400" },
  cancelled: { label: "Cancelados", color: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/10 dark:border-red-800 dark:text-red-400" },
  disputed: { label: "En disputa", color: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/10 dark:border-rose-800 dark:text-rose-400" },
};

export function WorkerAnalyticsPage() {
  const [, navigate] = useLocation();
  const { data, loading, error } = useWorkerAnalytics();
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");

  type EarningsEntry = { label: string; earnings: number; jobs: number };
  const earningsData: EarningsEntry[] = data
    ? (period === "weekly"
        ? data.weeklyEarnings.map(e => ({ label: e.week, earnings: e.earnings, jobs: e.jobs }))
        : data.monthlyEarnings.map(e => ({ label: e.month, earnings: e.earnings, jobs: e.jobs })))
    : [];
  const maxEarnings = Math.max(...earningsData.map(e => e.earnings), 1);
  const totalEarnings = earningsData.reduce((s, e) => s + e.earnings, 0);
  const totalJobs = earningsData.reduce((s, e) => s + e.jobs, 0);

  const presentStatuses = Object.entries(data?.byStatus ?? {}).filter(([, cnt]) => cnt > 0);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/professional")} className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mis Analíticas</h1>
            <p className="text-sm text-muted-foreground">Rendimiento de tu negocio</p>
          </div>
        </div>

        {loading && (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando analíticas...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-xs text-muted-foreground">Ganancias totales</span>
                </div>
                <p className="text-2xl font-bold text-foreground">${data.totalEarnings.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">90% del monto total</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs text-muted-foreground">Trabajos completados</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.completedJobs}</p>
                <p className="text-xs text-muted-foreground mt-0.5">servicios entregados</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                    <Star className="w-4 h-4 text-amber-500" />
                  </div>
                  <span className="text-xs text-muted-foreground">Calificación promedio</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.avgRating > 0 ? data.avgRating.toFixed(1) : "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{data.reviewCount} reseña{data.reviewCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                    <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-xs text-muted-foreground">Tasa de aceptación</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.acceptanceRate !== null ? `${data.acceptanceRate}%` : "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">solicitudes aceptadas</p>
              </div>
            </div>

            {/* Earnings chart */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm text-foreground">Ganancias</p>
                </div>
                <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => setPeriod("weekly")}
                    className={`text-xs px-3 py-1 rounded-md transition-all ${period === "weekly" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >Semanal</button>
                  <button
                    onClick={() => setPeriod("monthly")}
                    className={`text-xs px-3 py-1 rounded-md transition-all ${period === "monthly" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >Mensual</button>
                </div>
              </div>

              {/* Summary row */}
              <div className="flex gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total período</p>
                  <p className="text-lg font-bold text-emerald-600">${totalEarnings.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trabajos</p>
                  <p className="text-lg font-bold text-foreground">{totalJobs}</p>
                </div>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                {earningsData.map((e, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${e.label}: $${e.earnings.toFixed(2)} (${e.jobs} trabajos)`}>
                    <div className="w-full flex items-end" style={{ height: 60 }}>
                      <div
                        className="w-full rounded-t-sm bg-primary/70 hover:bg-primary transition-colors cursor-default"
                        style={{ height: `${Math.max((e.earnings / maxEarnings) * 100, e.earnings > 0 ? 8 : 2)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-tight">
                      {e.label}
                    </span>
                  </div>
                ))}
              </div>
              {earningsData.every(e => e.earnings === 0) && (
                <p className="text-xs text-center text-muted-foreground mt-2">Aún no tienes ganancias en este período</p>
              )}
            </div>

            {/* Booking status breakdown */}
            {presentStatuses.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm text-foreground">Estado de solicitudes</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {presentStatuses.map(([status, cnt]) => {
                    const meta = STATUS_META[status];
                    if (!meta) return null;
                    return (
                      <StatusPill key={status} label={meta.label} count={cnt} color={meta.color} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent rating trend */}
            {data.recentReviews.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-amber-500" />
                  <p className="font-semibold text-sm text-foreground">Tendencia de calificaciones</p>
                  <span className="text-xs text-muted-foreground ml-auto">últimas {data.recentReviews.length}</span>
                </div>
                <div className="flex items-end gap-2">
                  {[...data.recentReviews].reverse().map((r, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end" style={{ height: 48 }}>
                        <div
                          className="w-full rounded-t-sm bg-amber-400/80 hover:bg-amber-500 transition-colors"
                          style={{ height: `${(r.rating / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{r.rating}★</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs text-muted-foreground">
                    Promedio últimas reseñas: {(data.recentReviews.reduce((s, r) => s + r.rating, 0) / data.recentReviews.length).toFixed(1)} / 5.0
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
