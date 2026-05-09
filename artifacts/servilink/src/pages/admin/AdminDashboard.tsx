import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetAdminDashboard } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getRequestOptions, getAuthHeader } from "@/lib/api";
import { ExportReportModal } from "./ExportReportModal";
import {
  Users, Briefcase, DollarSign, TrendingUp, Shield,
  Percent, AlertOctagon, Wallet, ChevronRight, Zap,
  Lock, CheckCircle2, Store, ArrowUpRight, ArrowDownRight,
  RefreshCw, Activity, BarChart2, Clock, Award, ShoppingBag,
  Home, Wrench, AlertTriangle, Target, Star, Gauge,
  FileText, Flame, ArrowRight, Sparkles, Bell, Package,
  TrendingDown, Trophy, ChevronUp, ChevronDown, Download,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area,
} from "recharts";

// ── tiny helpers ──────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function pctChange(current: number, base: number) {
  if (base === 0) return current > 0 ? 100 : 0;
  return ((current - base) / base) * 100;
}

function convRate(done: number, total: number) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.35)" }} />
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
        {label}
      </p>
    </div>
  );
}

// ── Money card ─────────────────────────────────────────────────────────────────
function MoneyCard({
  label, amount, sub, glowColor, borderColor, textColor, onClick,
}: {
  label: string; amount: number; sub: string;
  glowColor: string; borderColor: string; textColor: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={onClick ? "cursor-pointer" : ""}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        padding: "18px 20px",
        boxShadow: `0 0 24px ${glowColor}`,
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.transform = ""; }}
    >
      <p className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: textColor }}>{fmt(amount)}</p>
      <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>
    </div>
  );
}

// ── Risk item ──────────────────────────────────────────────────────────────────
function RiskItem({
  count, label, sub, dotColor, borderColor, bgColor, textColor, onClick,
}: {
  count: number; label: string; sub: string;
  dotColor: string; borderColor: string; bgColor: string; textColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left transition-opacity hover:opacity-80"
      style={{ padding: "12px 14px", borderRadius: 14, background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <span
        className="flex-shrink-0 text-[11px] font-black w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: dotColor, color: "#fff" }}
      >
        {count > 9 ? "9+" : count}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: textColor }}>{label}</p>
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: textColor }} />
    </button>
  );
}

// ── Conversion ring ────────────────────────────────────────────────────────────
function ConvRing({ pct, color, label, sub }: { pct: number; color: string; label: string; sub: string }) {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg width="64" height="64" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <span
          className="absolute text-[11px] font-black"
          style={{ color, transform: "rotate(0deg)" }}
        >
          {pct}%
        </span>
      </div>
      <p className="text-xs font-semibold text-center text-white leading-tight">{label}</p>
      <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>
    </div>
  );
}

// ── Migración legacy /worker → /professional (compact admin block) ───────────
function LegacyWorkerStatusBlock() {
  const [data, setData] = useState<{ last24h: number; last7d: number; uniqueUsers: number; readyForRemoval: boolean } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/legacy-worker/status", {
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled && json?.ok) {
          setData({
            last24h:         json.last24h ?? 0,
            last7d:          json.last7d ?? 0,
            uniqueUsers:     json.uniqueUsers ?? 0,
            readyForRemoval: !!json.readyForRemoval,
          });
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error || !data) return null;

  const ready = data.readyForRemoval;
  const accent = ready ? "#34d399" : "#fbbf24";
  const bg     = ready ? "rgba(52,211,153,0.06)" : "rgba(251,191,36,0.05)";
  const border = ready ? "rgba(52,211,153,0.2)"  : "rgba(251,191,36,0.18)";

  return (
    <div>
      <SectionHeader icon={Activity} label="Migración legacy /worker" />
      <div
        className="flex items-center gap-3"
        style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 18px" }}
      >
        {ready ? (
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
        ) : (
          <Activity className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: accent }}>
            {ready ? "Listo para eliminar rutas legacy" : "Tráfico legacy aún activo"}
          </p>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {`Tráfico legacy (/worker): ${data.last24h} accesos en 24h · ${data.last7d} en 7 días · ${data.uniqueUsers} usuarios únicos`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AdminDashboard() {
  const opts = getRequestOptions();
  const [, navigate] = useLocation();
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [metrics, setMetrics] = useState<any>(null);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const { data: stats, isLoading, refetch } = useGetAdminDashboard({
    ...opts,
    query: { refetchInterval: 60_000 },
  } as any);
  const s = stats as any;

  // Fetch advanced metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/metrics", opts as any);
      if (res.ok) setMetrics(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);
  useEffect(() => { if (s) setLastRefreshed(Date.now()); }, [s]);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
    fetchMetrics();
    setLastRefreshed(Date.now());
  }, [refetch, fetchMetrics]);

  const handleSendAlert = useCallback(async (alertType = "manual") => {
    setSendingAlert(true);
    try {
      await fetch("/api/admin/intelligence/send-alert", {
        ...(opts as any),
        method: "POST",
        body: JSON.stringify({
          payload: {
            today:               s?.revenueToday        ?? 0,
            todayComm:           s?.commissionsToday    ?? 0,
            thisWeek:            s?.revenueThisWeek     ?? 0,
            revenueYesterday:    metrics?.revenueYesterday ?? 0,
            openDisputes:        s?.openDisputes         ?? 0,
            pendingWithdrawals:  s?.pendingWithdrawals   ?? 0,
            pendingVerifications: s?.pendingVerifications ?? 0,
            totalUsers:          s?.totalUsers           ?? 0,
            suggestions:         computeSuggestions(),
            alertType,
          },
        }),
      });
      setAlertSent(true);
      setTimeout(() => setAlertSent(false), 4000);
    } catch { /* ignore */ }
    setSendingAlert(false);
  }, [opts, s, metrics]);

  // ── Derived metrics ──────────────────────────────────────────────────────
  const liberated  = (s?.totalRevenue ?? 0) - (s?.escrowAmount ?? 0);
  const today      = s?.revenueToday       ?? 0;
  const todayComm  = s?.commissionsToday   ?? 0;
  const thisWeek   = s?.revenueThisWeek    ?? 0;
  const thisMonth  = s?.revenueThisMonth   ?? 0;
  const weekComm   = s?.commissionsThisWeek ?? 0;
  const monthComm  = s?.commissionsThisMonth ?? 0;
  const totalComm  = s?.totalCommissions   ?? 0;

  const weekDailyAvg = thisWeek / 7;
  const todayPct     = pctChange(today, weekDailyAvg);
  const todayUp      = todayPct >= 0;

  // ── Smart alerts ─────────────────────────────────────────────────────────
  const revenueYesterday   = metrics?.revenueYesterday   ?? 0;
  const revenueLastWeek    = metrics?.revenueLastWeek    ?? 0;
  const commissionsLastWeek = metrics?.commissionsLastWeek ?? 0;
  const revDropPct = revenueYesterday > 0 ? pctChange(today, revenueYesterday) : null;
  const smartAlerts: { icon: string; msg: string; color: string; border: string; bg: string; action: string; actionPath: string }[] = [];

  if (revDropPct !== null && revDropPct <= -10) {
    smartAlerts.push({
      icon: "⚠️",
      msg: `Ingresos ↓ ${Math.abs(revDropPct).toFixed(0)}% vs ayer`,
      color: "#fbbf24",
      border: "rgba(245,158,11,0.3)",
      bg:    "rgba(245,158,11,0.07)",
      action: "Ver analíticas",
      actionPath: "/admin/analytics",
    });
  }
  if (today === 0 && revenueYesterday > 0) {
    smartAlerts.push({
      icon: "🔇",
      msg: "Sin ingresos registrados hoy — actividad baja",
      color: "#f87171",
      border: "rgba(239,68,68,0.3)",
      bg:    "rgba(239,68,68,0.07)",
      action: "Ver analíticas",
      actionPath: "/admin/analytics",
    });
  }
  if ((s?.openDisputes ?? 0) >= 5) {
    smartAlerts.push({
      icon: "🔴",
      msg: `${s.openDisputes} disputas activas — revisión urgente`,
      color: "#f87171",
      border: "rgba(239,68,68,0.3)",
      bg:    "rgba(239,68,68,0.07)",
      action: "Ver disputas",
      actionPath: "/admin/disputes",
    });
  }
  if ((s?.pendingVerifications ?? 0) >= 10) {
    smartAlerts.push({
      icon: "🟡",
      msg: `${s.pendingVerifications} verificaciones KYC en cola`,
      color: "#fbbf24",
      border: "rgba(245,158,11,0.3)",
      bg:    "rgba(245,158,11,0.07)",
      action: "Ir a KYC",
      actionPath: "/admin/verificaciones",
    });
  }
  if ((s?.pendingWithdrawals ?? 0) >= 3) {
    smartAlerts.push({
      icon: "💸",
      msg: `${s.pendingWithdrawals} retiros por aprobar`,
      color: "#93c5fd",
      border: "rgba(59,130,246,0.3)",
      bg:    "rgba(59,130,246,0.07)",
      action: "Ver retiros",
      actionPath: "/admin/withdrawals",
    });
  }

  // ── Daily goal ────────────────────────────────────────────────────────────
  const dailyGoal = revenueLastWeek > 0 ? (revenueLastWeek / 7) * 1.2 : weekDailyAvg * 1.2 || 500;
  const goalPct   = dailyGoal > 0 ? Math.min(100, Math.round((today / dailyGoal) * 100)) : 0;
  const goalColor = goalPct >= 80 ? "#34d399" : goalPct >= 50 ? "#fbbf24" : "#f87171";

  // ── Temporal comparisons ──────────────────────────────────────────────────
  const todayVsYesterday = revenueYesterday > 0 ? pctChange(today, revenueYesterday) : null;
  const weekVsLastWeek   = revenueLastWeek  > 0 ? pctChange(thisWeek, revenueLastWeek) : null;
  const commVsYesterday  = (metrics?.commissionsYesterday ?? 0) > 0
    ? pctChange(todayComm, metrics?.commissionsYesterday ?? 0) : null;
  const weekCommVsLast   = commissionsLastWeek > 0
    ? pctChange(weekComm, commissionsLastWeek) : null;

  // ── Revenue by channel ────────────────────────────────────────────────────
  const servicesRevenue = metrics?.revenueByCategory?.reduce((sum: number, c: any) => sum + c.revenue, 0) ?? 0;

  // ── Smart suggestions (business intelligence) ─────────────────────────────
  function computeSuggestions(): string[] {
    const suggestions: string[] = [];
    const cats: any[] = metrics?.revenueByCategory ?? [];

    // Category growth/decline vs last week
    for (const cat of cats) {
      if (cat.revenueLastWeek > 0 && cat.revenueThisWeek > 0) {
        const pct = ((cat.revenueThisWeek - cat.revenueLastWeek) / cat.revenueLastWeek) * 100;
        if (pct >= 25)  suggestions.push(`📈 "${cat.categoryName}" creció +${pct.toFixed(0)}% esta semana — refuerza este canal`);
        if (pct <= -25) suggestions.push(`⚠️ "${cat.categoryName}" cayó ${pct.toFixed(0)}% vs semana anterior`);
      }
      if (cat.revenueThisWeek > 0 && cat.revenueLastWeek === 0) {
        suggestions.push(`🚀 "${cat.categoryName}" genera ingresos por primera vez esta semana`);
      }
    }

    // Conversion rate
    const totalDone  = (metrics?.bookingsDone ?? 0) + (metrics?.storeOrdersDone ?? 0) + (metrics?.rentalsDone ?? 0);
    const totalAll   = (metrics?.bookingsTotal ?? 0) + (metrics?.storeOrdersTotal ?? 0) + (metrics?.rentalsTotal ?? 0);
    const globalConv = totalAll > 0 ? (totalDone / totalAll) * 100 : 0;
    if (globalConv < 40 && totalAll > 10) suggestions.push(`💡 Conversión global baja (${globalConv.toFixed(0)}%) — revisa el flujo de reservas`);
    if (globalConv >= 75 && totalAll > 5)  suggestions.push(`✅ Conversión excelente (${globalConv.toFixed(0)}%) — plataforma funcionando bien`);

    // Channel opportunity
    const rentalRev  = metrics?.rentalRevenue ?? 0;
    const storeRev   = metrics?.storeRevenue  ?? 0;
    if (rentalRev > servicesRevenue && rentalRev > 0) suggestions.push("🏠 Alquileres supera a servicios — oportunidad de escalar ServiRent");
    if (storeRev > servicesRevenue && storeRev > 0)   suggestions.push("🛍️ La tienda supera a servicios — considera destacar productos premium");

    // Top product insight
    if ((metrics?.topProducts ?? []).length > 0) {
      const tp = metrics.topProducts[0];
      suggestions.push(`📦 "${tp.name}" lidera la tienda con ${tp.orders} pedidos (${fmt(tp.revenue)})`);
    }

    // Low activity alert
    if (today === 0 && revenueYesterday > 0) suggestions.push("🔇 Sin ingresos hoy — considera activar una campaña de impulso");

    // Revenue drop opportunity
    if (revDropPct !== null && revDropPct <= -20) {
      suggestions.push(`💡 Caída de ${Math.abs(revDropPct).toFixed(0)}% vs ayer — revisa disponibilidad de profesionales`);
    }

    // Positive goal
    if (goalPct >= 100) suggestions.push("🎉 ¡Meta diaria superada! Registra el récord y analiza qué funcionó");

    return suggestions.slice(0, 6);
  }

  const suggestions = computeSuggestions();

  // ── Revenue projection ────────────────────────────────────────────────────
  const now = new Date();
  const dayOfWeek   = now.getDay(); // 0=Sun,1=Mon,...6=Sat
  const daysMonday  = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days elapsed since Mon
  const daysElapsed = Math.max(1, daysMonday + 1); // include today
  const dailyAvgWeek = thisWeek / daysElapsed;
  const projectedWeek = dailyAvgWeek * 7;
  const daysInMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth    = now.getDate();
  const dailyAvgMonth = thisMonth / Math.max(1, dayOfMonth);
  const projectedMonth = dailyAvgMonth * daysInMonth;
  const projWeekGrowth = revenueLastWeek > 0 ? ((projectedWeek - revenueLastWeek) / revenueLastWeek) * 100 : null;
  const storeRevenue    = metrics?.storeRevenue    ?? 0;
  const rentalRevenue   = metrics?.rentalRevenue   ?? 0;
  const totalChannel    = servicesRevenue + storeRevenue + rentalRevenue;
  const channelPct = (v: number) => totalChannel > 0 ? Math.round((v / totalChannel) * 100) : 0;

  // ── Conversion ────────────────────────────────────────────────────────────
  const bookConv  = convRate(metrics?.bookingsDone  ?? 0, metrics?.bookingsTotal  ?? 0);
  const storeConv = convRate(metrics?.storeOrdersDone ?? 0, metrics?.storeOrdersTotal ?? 0);
  const rentConv  = convRate(metrics?.rentalsDone ?? 0, metrics?.rentalsTotal ?? 0);

  // ── Risk items ────────────────────────────────────────────────────────────
  const riskItems = s ? [
    { count: s.openDisputes ?? 0, label: "Disputas activas", sub: "Requieren resolución inmediata", dotColor: "#ef4444", borderColor: "rgba(239,68,68,0.2)", bgColor: "rgba(239,68,68,0.06)", textColor: "#f87171", path: "/admin/disputes" },
    { count: s.pendingWithdrawals ?? 0, label: "Retiros por procesar", sub: "Pagos pendientes de aprobación", dotColor: "#3b82f6", borderColor: "rgba(59,130,246,0.2)", bgColor: "rgba(59,130,246,0.06)", textColor: "#93c5fd", path: "/admin/withdrawals" },
    { count: s.pendingVerifications ?? 0, label: "Verificaciones pendientes", sub: "KYC en cola de revisión", dotColor: "#f59e0b", borderColor: "rgba(245,158,11,0.2)", bgColor: "rgba(245,158,11,0.06)", textColor: "#fbbf24", path: "/admin/verificaciones" },
  ].filter(item => item.count > 0) : [];

  // ── Skeleton ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
          <div className="h-36 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => <div key={i} className="h-28 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />)}
          </div>
          <div className="h-48 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <>
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Panel financiero</h1>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}
              >
                Inteligente
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              LinkServi — control en tiempo real
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
                color: "#34d399",
              }}
            >
              <Download className="w-3 h-3" />
              Exportar reporte
            </button>
            <button
              onClick={() => handleSendAlert("manual")}
              disabled={sendingAlert}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: alertSent ? "rgba(52,211,153,0.15)" : "rgba(99,102,241,0.12)",
                border: `1px solid ${alertSent ? "rgba(52,211,153,0.35)" : "rgba(99,102,241,0.3)"}`,
                color: alertSent ? "#34d399" : "#a5b4fc",
                opacity: sendingAlert ? 0.6 : 1,
              }}
            >
              {alertSent ? <CheckCircle2 className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
              {alertSent ? "Enviado" : sendingAlert ? "Enviando…" : "Enviar alerta"}
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
            >
              <RefreshCw className="w-3 h-3" />
              hace {timeAgo(lastRefreshed)}
            </button>
          </div>
        </div>

        {/* ── QUICK ACTIONS ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Ver ventas",   icon: TrendingUp,   path: "/admin/analytics",     color: "#6366f1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.18)",  badge: 0 },
            { label: "Ver usuarios", icon: Users,         path: "/admin/users",         color: "#06b6d4", bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.18)",   badge: 0 },
            { label: "Ver reportes", icon: FileText,      path: "/admin/analytics",     color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.18)",  badge: 0 },
            { label: "Disputas",     icon: AlertOctagon,  path: "/admin/disputes",      color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.18)",   badge: s?.openDisputes ?? 0 },
          ].map(({ label, icon: Icon, path, color, bg, border, badge }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="relative flex flex-col items-center justify-center gap-2 py-3 rounded-2xl transition-all hover:opacity-80 active:scale-95"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
              <span className="text-xs font-semibold" style={{ color }}>{label}</span>
              {badge > 0 && (
                <span
                  className="absolute top-2 right-2 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: color, color: "#fff" }}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── ALERTAS INTELIGENTES ────────────────────────────────────────── */}
        {smartAlerts.length > 0 && (
          <div className="space-y-2">
            <SectionHeader icon={AlertTriangle} label="Alertas inteligentes" />
            {smartAlerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-center gap-3"
                style={{
                  background: alert.bg,
                  border: `1px solid ${alert.border}`,
                  borderRadius: 14,
                  padding: "12px 16px",
                }}
              >
                <span className="text-lg flex-shrink-0">{alert.icon}</span>
                <p className="flex-1 text-sm font-semibold" style={{ color: alert.color }}>{alert.msg}</p>
                <button
                  onClick={() => navigate(alert.actionPath)}
                  className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-75"
                  style={{ background: `${alert.border}`, color: alert.color, border: `1px solid ${alert.border}`, whiteSpace: "nowrap" }}
                >
                  {alert.action}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── SUGERENCIAS IA ──────────────────────────────────────────────── */}
        {suggestions.length > 0 && metrics && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" style={{ color: "rgba(165,180,252,0.7)" }} />
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Sugerencias de negocio
                </p>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                {suggestions.length} insights
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {suggestions.map((s, i) => {
                const isWarning  = s.startsWith("⚠️") || s.startsWith("🔇");
                const isSuccess  = s.startsWith("✅") || s.startsWith("🎉") || s.startsWith("📈") || s.startsWith("🚀");
                const isOppt     = s.startsWith("💡") || s.startsWith("🏠") || s.startsWith("🛍️");
                const color  = isWarning ? "#f87171"  : isSuccess ? "#34d399" : isOppt ? "#fbbf24" : "#a5b4fc";
                const border = isWarning ? "rgba(239,68,68,0.2)" : isSuccess ? "rgba(52,211,153,0.2)" : isOppt ? "rgba(245,158,11,0.2)" : "rgba(99,102,241,0.2)";
                const bg     = isWarning ? "rgba(239,68,68,0.05)" : isSuccess ? "rgba(52,211,153,0.05)" : isOppt ? "rgba(245,158,11,0.05)" : "rgba(99,102,241,0.05)";
                const icon   = isWarning ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                             : isSuccess ? <TrendingUp    className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                             : isOppt    ? <Sparkles      className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                             :             <Sparkles      className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3"
                    style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "11px 14px" }}
                  >
                    {icon}
                    <p className="text-xs leading-relaxed" style={{ color }}>{s}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 1. HERO — Ganancias hoy ─────────────────────────────────────── */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(99,102,241,0.14) 50%, rgba(16,185,129,0.10) 100%)",
            border: "1px solid rgba(6,182,212,0.2)",
            borderRadius: 20,
            padding: "28px 32px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(99,102,241,0.12)", filter: "blur(48px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -30, left: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(6,182,212,0.1)", filter: "blur(36px)", pointerEvents: "none" }} />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4" style={{ color: "#fbbf24" }} />
                <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Ganancias hoy</span>
              </div>
              <p className="text-5xl font-black text-white leading-none">{fmt(today)}</p>
              <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                <span style={{ color: "#34d399" }}>{fmt(todayComm)}</span> en comisiones para LinkServi
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{
                  background: todayUp ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                  border: `1px solid ${todayUp ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                }}
              >
                {todayUp
                  ? <ArrowUpRight className="w-4 h-4" style={{ color: "#34d399" }} />
                  : <ArrowDownRight className="w-4 h-4" style={{ color: "#f87171" }} />
                }
                <span className="text-sm font-bold" style={{ color: todayUp ? "#34d399" : "#f87171" }}>
                  {todayUp ? "+" : ""}{todayPct.toFixed(1)}%
                </span>
              </div>
              <p className="text-[11px] text-right" style={{ color: "rgba(255,255,255,0.3)" }}>
                vs media diaria<br />de esta semana
              </p>
            </div>
          </div>

          <div className="relative flex items-center gap-6 mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              { label: "Esta semana", value: thisWeek, comm: weekComm },
              { label: "Este mes",    value: thisMonth, comm: monthComm },
              { label: "Total acumulado", value: s?.totalRevenue ?? 0, comm: totalComm },
            ].map(({ label, value, comm }) => (
              <div key={label}>
                <p className="text-[11px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
                <p className="text-lg font-bold text-white">{fmt(value)}</p>
                <p className="text-[10px]" style={{ color: "rgba(52,211,153,0.7)" }}>+{fmt(comm)}</p>
              </div>
            ))}
          </div>

          {/* ── Meta diaria ─────────────────────────────────────────────── */}
          <div className="relative mt-5 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5" style={{ color: goalColor }} />
                <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Meta diaria</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: goalColor }}>{goalPct}%</span>
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {fmt(today)} / {fmt(dailyGoal)}
                </span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div
                className="h-2 rounded-full transition-all duration-1000"
                style={{
                  width: `${goalPct}%`,
                  background: goalPct >= 80
                    ? "linear-gradient(90deg, #34d399, #6ee7b7)"
                    : goalPct >= 50
                    ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                    : "linear-gradient(90deg, #ef4444, #f87171)",
                  boxShadow: `0 0 10px ${goalColor}55`,
                }}
              />
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
              {goalPct >= 100
                ? "🎉 ¡Meta superada hoy!"
                : goalPct >= 80
                ? `Falta ${fmt(dailyGoal - today)} para la meta`
                : `Objetivo: +20% sobre el promedio semanal anterior`}
            </p>
          </div>
        </div>

        {/* ── COMPARACIÓN TEMPORAL ────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={TrendingUp} label="Comparación temporal" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "Hoy vs Ayer",
                current: today,
                previous: revenueYesterday,
                pct: todayVsYesterday,
                sub: "Ingresos de servicios",
                color: "#6366f1",
                glow: "rgba(99,102,241,0.08)",
                border: "rgba(99,102,241,0.18)",
              },
              {
                label: "Esta semana vs anterior",
                current: thisWeek,
                previous: revenueLastWeek,
                pct: weekVsLastWeek,
                sub: "Ingresos semanales",
                color: "#06b6d4",
                glow: "rgba(6,182,212,0.08)",
                border: "rgba(6,182,212,0.18)",
              },
              {
                label: "Comisiones hoy vs ayer",
                current: todayComm,
                previous: metrics?.commissionsYesterday ?? 0,
                pct: commVsYesterday,
                sub: "Comisión LinkServi",
                color: "#10b981",
                glow: "rgba(16,185,129,0.08)",
                border: "rgba(16,185,129,0.18)",
              },
              {
                label: "Comisiones semana",
                current: weekComm,
                previous: commissionsLastWeek,
                pct: weekCommVsLast,
                sub: "Vs semana anterior",
                color: "#f59e0b",
                glow: "rgba(245,158,11,0.08)",
                border: "rgba(245,158,11,0.18)",
              },
            ].map(({ label, current, previous, pct, sub, color, glow, border }) => {
              const up = pct === null ? true : pct >= 0;
              const arrowColor = pct === null ? "rgba(255,255,255,0.3)" : up ? "#34d399" : "#f87171";
              return (
                <div
                  key={label}
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${border}`, borderRadius: 16, padding: "16px", boxShadow: `0 0 18px ${glow}` }}
                >
                  <p className="text-[11px] font-medium mb-2 leading-tight" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
                  <p className="text-xl font-black mb-1" style={{ color }}>{fmt(current)}</p>
                  <div className="flex items-center gap-1.5">
                    {pct !== null ? (
                      <>
                        {up ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: arrowColor }} /> : <ArrowDownRight className="w-3.5 h-3.5" style={{ color: arrowColor }} />}
                        <span className="text-xs font-bold" style={{ color: arrowColor }}>
                          {up ? "+" : ""}{pct.toFixed(1)}%
                        </span>
                        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>({fmt(previous)})</span>
                      </>
                    ) : (
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>Sin datos anteriores</span>
                    )}
                  </div>
                  <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>{sub}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 2. INGRESOS POR CANAL ───────────────────────────────────────── */}
        <div>
          <SectionHeader icon={DollarSign} label="Ingresos por canal" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label: "Servicios", icon: Wrench, revenue: servicesRevenue,
                pct: channelPct(servicesRevenue),
                color: "#6366f1", glow: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.22)",
                sub: `${metrics?.revenueByCategory?.filter((c: any) => c.count > 0).length ?? 0} categorías activas`,
              },
              {
                label: "Tienda", icon: ShoppingBag, revenue: storeRevenue,
                pct: channelPct(storeRevenue),
                color: "#ec4899", glow: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.22)",
                sub: `${metrics?.storeOrdersDone ?? 0} pedidos entregados`,
              },
              {
                label: "Alquileres", icon: Home, revenue: rentalRevenue,
                pct: channelPct(rentalRevenue),
                color: "#f59e0b", glow: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.22)",
                sub: `${metrics?.rentalsDone ?? 0} alquileres completados`,
              },
            ].map(({ label, icon: Icon, revenue, pct, color, glow, border, sub }) => (
              <div
                key={label}
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${border}`, borderRadius: 16, padding: "18px 20px", boxShadow: `0 0 20px ${glow}` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color }} />
                    <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</p>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
                  >
                    {pct}%
                  </span>
                </div>
                <p className="text-2xl font-bold mb-1" style={{ color }}>{fmt(revenue)}</p>
                {/* progress bar */}
                <div className="w-full h-1 rounded-full mt-3 mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-1 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── PROYECCIÓN DE INGRESOS ──────────────────────────────────────── */}
        {metrics?.dailyTrend?.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.35)" }} />
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Tendencia y proyección
                </p>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 20px 12px" }}>
              {/* Projection KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  {
                    label: "Proyección semana",
                    value: projectedWeek,
                    sub: projWeekGrowth !== null ? `${projWeekGrowth >= 0 ? "+" : ""}${projWeekGrowth.toFixed(0)}% vs sem. anterior` : `${daysElapsed}/7 días transurridos`,
                    color: projWeekGrowth !== null && projWeekGrowth >= 0 ? "#34d399" : "#f87171",
                  },
                  {
                    label: "Proyección mes",
                    value: projectedMonth,
                    sub: `Basado en ${fmt(dailyAvgMonth)}/día promedio`,
                    color: "#a5b4fc",
                  },
                  {
                    label: "Media diaria (sem.)",
                    value: dailyAvgWeek,
                    sub: "Últimos días esta semana",
                    color: "#fbbf24",
                  },
                  {
                    label: "Media diaria (mes)",
                    value: dailyAvgMonth,
                    sub: `Día ${new Date().getDate()} de ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}`,
                    color: "#67e8f9",
                  },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 16px" }}>
                    <p className="text-[11px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
                    <p className="text-xl font-bold mb-0.5" style={{ color }}>{fmt(value)}</p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{sub}</p>
                  </div>
                ))}
              </div>
              {/* 7-day area chart */}
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={metrics.dailyTrend} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#34d399" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#fff" }}
                    formatter={(v: number, name: string) => [fmt(v), name === "revenue" ? "Ingresos" : "Comisiones"]}
                  />
                  <Area type="monotone" dataKey="revenue"    stroke="#6366f1" strokeWidth={2} fill="url(#areaGrad)" name="revenue" />
                  <Area type="monotone" dataKey="commission" stroke="#34d399" strokeWidth={1.5} fill="url(#commGrad)" name="commission" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                Últimos 7 días · morado = ingresos · verde = comisiones LinkServi
              </p>
            </div>
          </div>
        )}

        {/* ── 3. DINERO EN MOVIMIENTO ─────────────────────────────────────── */}
        <div>
          <SectionHeader icon={Activity} label="Dinero en movimiento" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MoneyCard label="En escrow" amount={s?.escrowAmount ?? 0} sub="Fondos retenidos en servicios activos" glowColor="rgba(245,158,11,0.08)" borderColor="rgba(245,158,11,0.2)" textColor="#fbbf24" />
            <MoneyCard label="Liberado" amount={liberated} sub="Pagado a profesionales (histórico)" glowColor="rgba(52,211,153,0.08)" borderColor="rgba(52,211,153,0.2)" textColor="#34d399" />
            <MoneyCard label="Retiros pendientes" amount={0} sub={`${s?.pendingWithdrawals ?? 0} solicitudes por aprobar`} glowColor="rgba(99,102,241,0.08)" borderColor="rgba(99,102,241,0.2)" textColor="#a5b4fc" onClick={() => navigate("/admin/withdrawals")} />
          </div>
        </div>

        {/* ── 4. COMISIONES ──────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={Percent} label="Comisiones de la plataforma" />
          <div
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(6,182,212,0.10) 100%)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 16,
              padding: "20px 24px",
            }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total generado", value: totalComm, bold: true },
                { label: "Hoy",            value: todayComm },
                { label: "Esta semana",    value: weekComm },
                { label: "Este mes",       value: monthComm },
              ].map(({ label, value, bold }) => (
                <div key={label}>
                  <p className="text-[11px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
                  <p
                    className={bold ? "text-3xl font-black" : "text-xl font-bold"}
                    style={{ color: bold ? "#a5b4fc" : "rgba(165,180,252,0.75)" }}
                  >
                    {fmt(value)}
                  </p>
                  {bold && (
                    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mt-1" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                      Tasa 10%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 5. TOP VENDEDORES ────────────────────────────────────────────── */}
        {metrics?.topWorkers?.length > 0 && (
          <div>
            <SectionHeader icon={Award} label="Top profesionales por ingresos" />
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
              {metrics.topWorkers.map((w: any, idx: number) => {
                const rankColors = ["#fbbf24", "#9ca3af", "#b45309", "#6366f1", "#6ee7b7"];
                const rc = rankColors[idx] ?? "rgba(255,255,255,0.2)";
                const maxRev = metrics.topWorkers[0]?.revenue ?? 1;
                const barPct = maxRev > 0 ? Math.round((w.revenue / maxRev) * 100) : 0;
                return (
                  <div
                    key={w.workerId}
                    className="flex items-center gap-4"
                    style={{ padding: "14px 18px", borderBottom: idx < metrics.topWorkers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                  >
                    {/* Rank */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black"
                      style={{ background: `${rc}22`, color: rc, border: `1px solid ${rc}66` }}
                    >
                      {idx + 1}
                    </div>
                    {/* Avatar */}
                    {w.avatarUrl ? (
                      <img src={w.avatarUrl} alt={w.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
                        {w.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{w.name}</p>
                      <div className="w-full h-1 rounded-full mt-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${barPct}%`, background: rc }} />
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <p className="text-sm font-bold text-white">{fmt(w.revenue)}</p>
                      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{w.jobCount} servicios</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── RANKING DE NEGOCIO ──────────────────────────────────────────── */}
        {metrics && (
          <div>
            <SectionHeader icon={Trophy} label="Ranking de negocio" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Categories ranking */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <Wrench className="w-3.5 h-3.5" style={{ color: "#a5b4fc" }} />
                  <p className="text-xs font-bold text-white">Categorías más rentables</p>
                </div>
                {[...(metrics.revenueByCategory ?? [])]
                  .filter((c: any) => c.revenue > 0)
                  .sort((a: any, b: any) => b.revenue - a.revenue)
                  .slice(0, 5)
                  .map((cat: any, idx: number) => {
                    const rankColors = ["#fbbf24", "#9ca3af", "#b45309", "#6366f1", "#6ee7b7"];
                    const rc = rankColors[idx] ?? "rgba(255,255,255,0.2)";
                    const maxRev = [...(metrics.revenueByCategory ?? [])].sort((a: any, b: any) => b.revenue - a.revenue)[0]?.revenue ?? 1;
                    const barPct = maxRev > 0 ? Math.round((cat.revenue / maxRev) * 100) : 0;
                    const weekGrowth = cat.revenueLastWeek > 0
                      ? ((cat.revenueThisWeek - cat.revenueLastWeek) / cat.revenueLastWeek) * 100
                      : null;
                    return (
                      <div
                        key={cat.categoryName}
                        className="flex items-center gap-3"
                        style={{ padding: "11px 16px", borderBottom: idx < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black"
                          style={{ background: `${rc}22`, color: rc, border: `1px solid ${rc}55` }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{cat.categoryName}</p>
                          <div className="w-full h-0.5 rounded-full mt-1" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div className="h-0.5 rounded-full" style={{ width: `${barPct}%`, background: rc }} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <p className="text-xs font-bold text-white">{fmt(cat.revenue)}</p>
                          {weekGrowth !== null && (
                            <div className="flex items-center gap-0.5">
                              {weekGrowth >= 0
                                ? <ChevronUp   className="w-3 h-3" style={{ color: "#34d399" }} />
                                : <ChevronDown className="w-3 h-3" style={{ color: "#f87171" }} />}
                              <span className="text-[10px] font-semibold" style={{ color: weekGrowth >= 0 ? "#34d399" : "#f87171" }}>
                                {Math.abs(weekGrowth).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {(metrics.revenueByCategory ?? []).filter((c: any) => c.revenue > 0).length === 0 && (
                  <p className="text-xs px-4 py-5" style={{ color: "rgba(255,255,255,0.25)" }}>Sin datos de categorías aún</p>
                )}
              </div>

              {/* Top products */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <Package className="w-3.5 h-3.5" style={{ color: "#f472b6" }} />
                  <p className="text-xs font-bold text-white">Productos más vendidos</p>
                </div>
                {(metrics.topProducts ?? []).length > 0 ? (
                  (metrics.topProducts as any[]).map((prod, idx) => {
                    const rankColors = ["#fbbf24", "#9ca3af", "#b45309", "#6366f1", "#6ee7b7"];
                    const rc = rankColors[idx] ?? "rgba(255,255,255,0.2)";
                    const maxOrders = (metrics.topProducts as any[])[0]?.orders ?? 1;
                    const barPct = maxOrders > 0 ? Math.round((prod.orders / maxOrders) * 100) : 0;
                    return (
                      <div
                        key={prod.productId}
                        className="flex items-center gap-3"
                        style={{ padding: "11px 16px", borderBottom: idx < (metrics.topProducts as any[]).length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black"
                          style={{ background: `${rc}22`, color: rc, border: `1px solid ${rc}55` }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{prod.name}</p>
                          <div className="w-full h-0.5 rounded-full mt-1" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div className="h-0.5 rounded-full" style={{ width: `${barPct}%`, background: rc }} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <p className="text-xs font-bold text-white">{fmt(prod.revenue)}</p>
                          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{prod.orders} pedidos</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <ShoppingBag className="w-8 h-8" style={{ color: "rgba(255,255,255,0.1)" }} />
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>Sin pedidos completados aún</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 6. CRECIMIENTO POR CATEGORÍA ────────────────────────────────── */}
        {(s?.bookingsByCategory?.length > 0) && (
          <div>
            <SectionHeader icon={BarChart2} label="Solicitudes por categoría" />
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px" }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={s.bookingsByCategory} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="categoryName" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                  <Tooltip contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#fff" }} />
                  <Bar dataKey="count" fill="url(#barGrad)" radius={[5, 5, 0, 0]} name="Solicitudes" />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── 7. CONVERSIÓN ───────────────────────────────────────────────── */}
        {metrics && (
          <div>
            <SectionHeader icon={Target} label="Tasa de conversión" />
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16,
                padding: "24px",
              }}
            >
              <div className="grid grid-cols-3 gap-6">
                <ConvRing
                  pct={bookConv}
                  color="#6366f1"
                  label="Servicios"
                  sub={`${metrics.bookingsDone}/${metrics.bookingsTotal} completados`}
                />
                <ConvRing
                  pct={storeConv}
                  color="#ec4899"
                  label="Tienda"
                  sub={`${metrics.storeOrdersDone}/${metrics.storeOrdersTotal} entregados`}
                />
                <ConvRing
                  pct={rentConv}
                  color="#f59e0b"
                  label="Alquileres"
                  sub={`${metrics.rentalsDone}/${metrics.rentalsTotal} completados`}
                />
              </div>
              {/* Aggregate */}
              <div
                className="mt-5 pt-4 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Conversión global de la plataforma</p>
                  <p className="text-sm font-semibold mt-0.5 text-white">
                    {convRate(
                      (metrics.bookingsDone ?? 0) + (metrics.storeOrdersDone ?? 0) + (metrics.rentalsDone ?? 0),
                      (metrics.bookingsTotal ?? 0) + (metrics.storeOrdersTotal ?? 0) + (metrics.rentalsTotal ?? 0),
                    )}% de transacciones exitosas
                  </p>
                </div>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
                >
                  <Star className="w-3.5 h-3.5" style={{ color: "#a5b4fc" }} />
                  <span className="text-xs font-semibold" style={{ color: "#a5b4fc" }}>
                    {convRate(
                      (metrics.bookingsDone ?? 0) + (metrics.storeOrdersDone ?? 0) + (metrics.rentalsDone ?? 0),
                      (metrics.bookingsTotal ?? 0) + (metrics.storeOrdersTotal ?? 0) + (metrics.rentalsTotal ?? 0),
                    )}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 8. RIESGO / ALERTAS ─────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={AlertOctagon} label="Riesgo y alertas operativas" />
          {riskItems.length === 0 ? (
            <div
              className="flex items-center gap-3"
              style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 14, padding: "14px 18px" }}
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: "#34d399" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#34d399" }}>Todo en orden</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Sin disputas, retiros ni verificaciones pendientes.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {riskItems.map(item => (
                <RiskItem key={item.label} {...item} onClick={() => navigate(item.path)} />
              ))}
            </div>
          )}
        </div>

        {/* ── 9. MÉTRICAS DE PLATAFORMA ──────────────────────────────────── */}
        <div>
          <SectionHeader icon={Users} label="Métricas de plataforma" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {s && [
              { label: "Usuarios totales",  value: s.totalUsers,       icon: Users,    color: "#93c5fd", glow: "rgba(147,197,253,0.08)" },
              { label: "Profesionales",       value: s.totalWorkers,      icon: Briefcase, color: "#6ee7b7", glow: "rgba(110,231,183,0.08)" },
              { label: "Clientes",           value: s.totalClients,      icon: Users,    color: "#c4b5fd", glow: "rgba(196,181,253,0.08)" },
              { label: "Tiendas activas",    value: s.activeStores ?? 0, icon: Store,    color: "#67e8f9", glow: "rgba(103,232,249,0.08)" },
            ].map(({ label, value, icon: Icon, color, glow }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px", boxShadow: `0 0 20px ${glow}` }}>
                <Icon className="w-4 h-4 mb-3" style={{ color }} />
                <p className="text-3xl font-black text-white">{value}</p>
                <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
              </div>
            ))}
          </div>
          {s && (
            <div
              className="flex items-center justify-between mt-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 18px" }}
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4" style={{ color: "#6ee7b7" }} />
                <div>
                  <p className="text-sm font-semibold text-white">{s.completedBookings} servicios completados</p>
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.totalBookings} totales — {s.activeBookings} en progreso ahora</p>
                </div>
              </div>
              <div className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(110,231,183,0.12)", color: "#6ee7b7", border: "1px solid rgba(110,231,183,0.2)" }}>
                {s.totalBookings > 0 ? Math.round((s.completedBookings / s.totalBookings) * 100) : 0}% completados
              </div>
            </div>
          )}
        </div>

        {/* ── 9.5. MIGRACIÓN /worker → /professional ─────────────────────── */}
        <LegacyWorkerStatusBlock />

        {/* ── 10. ACTIVIDAD RECIENTE ──────────────────────────────────────── */}
        {s?.recentBookings?.length > 0 && (
          <div>
            <SectionHeader icon={Clock} label="Actividad reciente" />
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
              {s.recentBookings.slice(0, 8).map((b: any, idx: number) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3"
                  style={{ padding: "12px 16px", borderBottom: idx < 7 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background:
                        b.status === "completed"   ? "#34d399" :
                        b.status === "disputed"    ? "#f87171" :
                        b.status === "in_progress" ? "#60a5fa" :
                        b.status === "pending"     ? "#fbbf24" : "rgba(255,255,255,0.2)",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{b.categoryName}</p>
                    <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {b.clientName} → {b.workerName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {b.totalAmount != null && (
                      <span className="text-sm font-semibold text-white">{fmt(b.totalAmount)}</span>
                    )}
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </AppLayout>

    {showExport && <ExportReportModal onClose={() => setShowExport(false)} />}
    </>
  );
}
