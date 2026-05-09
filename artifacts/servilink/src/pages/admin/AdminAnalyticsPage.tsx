import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, DollarSign,
  BarChart3, FileDown, Loader2, RefreshCw,
  ShieldCheck, ArrowUpRight, ArrowDownRight,
  Zap, Star, MousePointerClick, UserCheck, SendHorizonal,
  AlertTriangle, Lightbulb, Eye,
} from "lucide-react";

interface ConversionData {
  period: string;
  searchClicks: number;
  contactClicks: number;
  loginWallRegister: number;
  loginWallLogin: number;
  bookingSent: number;
  profileViews: number;
  contactRate: number | null;
  bookingRate: number | null;
  registrationRate: number | null;
  funnel: { step: string; count: number; key: string }[];
}
interface TopProfileEntry {
  workerId: number;
  count: number;
  name: string;
  avatar: string | null;
}
interface TopProfilesData {
  topViewed: TopProfileEntry[];
  topContacted: TopProfileEntry[];
}

type Period = "24h" | "7d" | "30d";

interface AnalyticsData {
  period: string;
  periodStart: string;
  gmv: number;
  gmvGrowth: number;
  newUsers: number;
  userGrowth: number;
  totalUsers: number;
  completedBookings: number;
  bookingGrowth: number;
  churnRate: number;
  commissions: number;
  roleBreakdown: { role: string; count: number }[];
  dailyUsers: { date: string; users: number }[];
  dailyRevenue: { date: string; gmv: number; commission: number }[];
  pendingVerifications: number;
}

const ROLE_LABELS: Record<string, string> = {
  client: "Clientes",
  worker: "Profesionales",
  cohost: "Co-Anfitriones",
  seller: "Vendedores",
};

const ROLE_COLORS: Record<string, string> = {
  client: "#06B6D4",
  worker: "#818CF8",
  cohost: "#FBBF24",
  seller: "#34D399",
};

const PERIOD_LABELS: Record<Period, string> = {
  "24h": "Últimas 24h",
  "7d": "Últimos 7 días",
  "30d": "Último mes",
};

function GrowthBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
        isPositive
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/15 text-red-400"
      }`}
    >
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KPICard({
  label,
  value,
  sub,
  growth,
  icon: Icon,
  accent,
  format: fmt = "number",
}: {
  label: string;
  value: number;
  sub?: string;
  growth?: number;
  icon: React.ElementType;
  accent: string;
  format?: "number" | "currency" | "percent";
}) {
  const display =
    fmt === "currency"
      ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : fmt === "percent"
      ? `${value.toFixed(1)}%`
      : value.toLocaleString("en-US");

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/5 card-interactive">
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}
        >
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
        {growth !== undefined && <GrowthBadge value={growth} />}
      </div>
      <div>
        <p className="text-2xl font-black text-white tracking-tight">{display}</p>
        <p className="text-xs font-semibold text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "rgba(15,23,42,0.95)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    fontSize: 12,
    color: "#e2e8f0",
  },
  labelStyle: { color: "#94a3b8", fontWeight: 600 },
};

export function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["admin-analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics?period=${period}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error("Error al cargar analíticas");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: conv } = useQuery<ConversionData>({
    queryKey: ["admin-conversion", period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/conversion?period=${period}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: topProfiles } = useQuery<TopProfilesData>({
    queryKey: ["admin-top-profiles", period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/top-profiles?period=${period}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  const handleExportPDF = async () => {
    if (!data) return;
    setIsExporting(true);
    setExportError(null);
    try {
      // Dynamic imports so they don't bloat initial bundle
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      // ── Background ───────────────────────────────────────────────────────
      pdf.setFillColor(11, 15, 25);
      pdf.rect(0, 0, pdfW, pdfH, "F");

      // ── Header bar ───────────────────────────────────────────────────────
      pdf.setFillColor(6, 182, 212);
      pdf.rect(0, 0, pdfW, 18, "F");

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("LinkServi", 12, 12);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const dateStr = new Date().toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" });
      pdf.text(
        `Executive Analytics Report  ·  ${PERIOD_LABELS[period]}  ·  ${dateStr}`,
        pdfW - 12, 12,
        { align: "right" }
      );

      // ── Executive Summary ────────────────────────────────────────────────
      const yStart = 26;
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont("helvetica", "bold");
      pdf.text("RESUMEN EJECUTIVO", 12, yStart);

      pdf.setDrawColor(6, 182, 212);
      pdf.setLineWidth(0.4);
      pdf.line(12, yStart + 2, pdfW - 12, yStart + 2);

      const kpiY = yStart + 8;
      const colW = (pdfW - 24) / 4;
      const kpis = [
        { label: "GMV Total",              value: `$${(data.gmv            ?? 0).toFixed(2)}` },
        { label: "Nuevos Usuarios",        value: String(data.newUsers     ?? 0)              },
        { label: "Servicios Completados",  value: String(data.completedBookings ?? 0)         },
        { label: "Comisiones",             value: `$${(data.commissions    ?? 0).toFixed(2)}` },
      ];

      kpis.forEach((kpi, i) => {
        const x = 12 + i * colW;
        pdf.setFillColor(20, 30, 50);
        pdf.roundedRect(x, kpiY, colW - 3, 22, 2, 2, "F");
        pdf.setTextColor(6, 182, 212);
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text(kpi.value, x + (colW - 3) / 2, kpiY + 11, { align: "center" });
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.text(kpi.label, x + (colW - 3) / 2, kpiY + 17, { align: "center" });
      });

      // ── Secondary KPIs ────────────────────────────────────────────────────
      const sec2Y = kpiY + 27;
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont("helvetica", "bold");
      pdf.text("INDICADORES ADICIONALES", 12, sec2Y);
      pdf.setDrawColor(6, 182, 212);
      pdf.line(12, sec2Y + 2, pdfW - 12, sec2Y + 2);

      const sec2Kpis = [
        { label: "Total Usuarios",       value: data.totalUsers.toLocaleString() },
        { label: "Churn Rate",           value: `${data.churnRate.toFixed(1)}%` },
        { label: "Verif. pendientes",    value: String(data.pendingVerifications) },
        { label: "Crecimiento MoM",      value: `${data.userGrowth >= 0 ? "+" : ""}${data.userGrowth.toFixed(1)}%` },
      ];
      sec2Kpis.forEach((kpi, i) => {
        const x = 12 + i * colW;
        pdf.setFillColor(15, 25, 45);
        pdf.roundedRect(x, sec2Y + 5, colW - 3, 18, 2, 2, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text(kpi.value, x + (colW - 3) / 2, sec2Y + 15, { align: "center" });
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.text(kpi.label, x + (colW - 3) / 2, sec2Y + 20, { align: "center" });
      });

      // ── Role breakdown ────────────────────────────────────────────────────
      const rolesY = sec2Y + 32;
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont("helvetica", "bold");
      pdf.text("DESGLOSE POR ROL", 12, rolesY);
      pdf.setDrawColor(6, 182, 212);
      pdf.line(12, rolesY + 2, pdfW - 12, rolesY + 2);

      const roleColW = (pdfW - 24) / Math.max(data.roleBreakdown?.length ?? 1, 1);
      (data.roleBreakdown ?? []).forEach((r, i) => {
        const x = 12 + i * roleColW;
        pdf.setFillColor(20, 30, 50);
        pdf.roundedRect(x, rolesY + 5, roleColW - 3, 18, 2, 2, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
        pdf.text(String(r.count), x + (roleColW - 3) / 2, rolesY + 16, { align: "center" });
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.text(ROLE_LABELS[r.role] ?? r.role, x + (roleColW - 3) / 2, rolesY + 21, { align: "center" });
      });

      // ── Chart screenshot ──────────────────────────────────────────────────
      // Isolated try-catch: if chart capture fails, the PDF is still saved without charts
      let chartY = rolesY + 32;
      const chartSection = document.getElementById("analytics-charts");
      if (chartSection) {
        try {
          // Wait one frame to ensure SVG charts are fully painted
          await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 200)));

          const chartCanvas = await html2canvas(chartSection, {
            backgroundColor: "#0B0F19",
            scale: 1.5,
            useCORS: true,
            allowTaint: true,
            logging: false,
            ignoreElements: (el) => el.classList.contains("recharts-tooltip-wrapper"),
          });

          const chartImg = chartCanvas.toDataURL("image/png");
          const chartRenderH = (chartCanvas.height * (pdfW - 24)) / chartCanvas.width;
          const clampedH = Math.min(chartRenderH, pdfH - chartY - 18);

          // Add second page if charts overflow
          if (chartY + clampedH > pdfH - 18) {
            pdf.addPage();
            pdf.setFillColor(11, 15, 25);
            pdf.rect(0, 0, pdfW, pdfH, "F");
            chartY = 12;
          }

          pdf.setFontSize(9);
          pdf.setTextColor(148, 163, 184);
          pdf.setFont("helvetica", "bold");
          pdf.text("GRÁFICOS DE TENDENCIA", 12, chartY);
          pdf.setDrawColor(6, 182, 212);
          pdf.line(12, chartY + 2, pdfW - 12, chartY + 2);
          pdf.addImage(chartImg, "PNG", 12, chartY + 6, pdfW - 24, clampedH);
        } catch (chartErr) {
          console.warn("PDF: chart screenshot skipped —", chartErr);
        }
      }

      // ── Footer on every page ──────────────────────────────────────────────
      const totalPages = (pdf.internal as any).pages.length - 1;
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFillColor(6, 182, 212);
        pdf.rect(0, pdfH - 10, pdfW, 10, "F");
        pdf.setTextColor(11, 15, 25);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "bold");
        pdf.text(
          "LinkServi Confidential — Business Intelligence Report",
          pdfW / 2, pdfH - 4,
          { align: "center" }
        );
      }

      // ── Save — direct download, no popups ────────────────────────────────
      pdf.save(`Reporte-LinkServi-${period}-${Date.now()}.pdf`);
    } catch (err: any) {
      console.error("PDF export error:", err);
      setExportError(err?.message ?? "No se pudo generar el PDF. Inténtalo de nuevo.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="label-eyebrow mb-2">Business Intelligence</div>
            <h1 className="text-2xl font-black text-white tracking-tight">Executive Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Métricas clave de la plataforma LinkServi</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Period filter */}
            <div className="flex gap-1 glass rounded-xl p-1 border border-white/5">
              {(["24h", "7d", "30d"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === p
                      ? "bg-primary text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>

            <button
              onClick={() => refetch()}
              className="btn-ghost px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleExportPDF}
              disabled={isExporting || !data}
              className="btn-gradient px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {isExporting ? "Generando..." : "Exportar PDF"}
            </button>
          </div>
        </div>

        {/* ── Export error banner ───────────────────────────────────────────── */}
        {exportError && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold">Error al exportar PDF</p>
              <p className="text-xs text-red-400/70 mt-0.5">{exportError}</p>
            </div>
            <button
              onClick={() => setExportError(null)}
              className="ml-auto text-red-400/50 hover:text-red-400 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Loading skeleton ──────────────────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-muted/30 animate-pulse" />
              ))}
            </div>
            <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
          </div>
        )}

        {data && (
          <div ref={reportRef} className="space-y-6">

            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard
                label="GMV (Volumen Total)"
                value={data.gmv}
                growth={data.gmvGrowth}
                icon={DollarSign}
                accent="#06B6D4"
                format="currency"
                sub="Servicios completados"
              />
              <KPICard
                label="Nuevos Usuarios"
                value={data.newUsers}
                growth={data.userGrowth}
                icon={Users}
                accent="#818CF8"
                sub={`${data.totalUsers.toLocaleString()} usuarios totales`}
              />
              <KPICard
                label="Churn Rate"
                value={data.churnRate}
                icon={TrendingDown}
                accent="#F59E0B"
                format="percent"
                sub="Clientes sin actividad"
              />
              <KPICard
                label="Servicios Completados"
                value={data.completedBookings}
                growth={data.bookingGrowth}
                icon={BarChart3}
                accent="#34D399"
                sub={`$${data.commissions.toFixed(2)} comisiones`}
              />
            </div>

            {/* ── Secondary KPIs ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Usuarios", value: data.totalUsers.toLocaleString(), icon: Users, color: "#06B6D4" },
                { label: "Comisiones Plataforma", value: `$${data.commissions.toFixed(2)}`, icon: DollarSign, color: "#34D399" },
                { label: "Verificaciones pendientes", value: String(data.pendingVerifications), icon: ShieldCheck, color: "#F59E0B" },
                { label: "Crecimiento MoM", value: `${data.userGrowth >= 0 ? "+" : ""}${data.userGrowth.toFixed(1)}%`, icon: TrendingUp, color: data.userGrowth >= 0 ? "#34D399" : "#F87171" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="glass rounded-xl px-4 py-3 flex items-center gap-3 border border-white/5">
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                  <div className="min-w-0">
                    <p className="text-base font-black text-white">{value}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Charts ────────────────────────────────────────────────────── */}
            <div id="analytics-charts" className="space-y-4">

              {/* User Growth Trend */}
              <div className="glass rounded-2xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="label-eyebrow mb-1">Tendencia</p>
                    <h2 className="text-base font-bold text-white">Crecimiento de Usuarios</h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-3 h-0.5 rounded bg-indigo-400 inline-block" />
                    Registros diarios
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.dailyUsers} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Area
                      type="monotone"
                      dataKey="users"
                      stroke="#818CF8"
                      strokeWidth={2.5}
                      fill="url(#userGrad)"
                      name="Usuarios"
                      dot={{ r: 3, fill: "#818CF8", strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: "#818CF8" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue Trend */}
              <div className="glass rounded-2xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="label-eyebrow mb-1">Financiero</p>
                    <h2 className="text-base font-bold text-white">GMV y Comisiones</h2>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded bg-cyan-400 inline-block" /> GMV
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded bg-emerald-400 inline-block" /> Comisión
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.dailyRevenue} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34D399" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number) => `$${v.toFixed(2)}`} />
                    <Area
                      type="monotone"
                      dataKey="gmv"
                      stroke="#06B6D4"
                      strokeWidth={2.5}
                      fill="url(#gmvGrad)"
                      name="GMV"
                    />
                    <Area
                      type="monotone"
                      dataKey="commission"
                      stroke="#34D399"
                      strokeWidth={2}
                      fill="url(#commGrad)"
                      name="Comisión"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

            </div>

            {/* ── Role breakdown ─────────────────────────────────────────────── */}
            <div className="glass rounded-2xl p-6 border border-white/5">
              <div className="mb-5">
                <p className="label-eyebrow mb-1">Operaciones</p>
                <h2 className="text-base font-bold text-white">Desglose por Rol</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Total acumulado de usuarios activos por tipo</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(data.roleBreakdown ?? []).map(({ role, count }) => {
                  const color = ROLE_COLORS[role] ?? "#94a3b8";
                  const pct = data.totalUsers > 0 ? (count / data.totalUsers) * 100 : 0;
                  return (
                    <div key={role} className="rounded-xl p-4" style={{ background: `${color}0f`, border: `1px solid ${color}25` }}>
                      <p className="text-2xl font-black text-white">{count.toLocaleString()}</p>
                      <p className="text-xs font-semibold mt-1" style={{ color }}>
                        {ROLE_LABELS[role] ?? role}
                      </p>
                      <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{pct.toFixed(1)}% del total</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Conversion Funnel Panel (enhanced) ─────────────────────────── */}
            {conv && (() => {
              // ── Compute drop-offs ────────────────────────────────────────────
              const steps = [
                { label: "Búsquedas",        value: conv.searchClicks,                          key: "search",   color: "#818CF8", icon: MousePointerClick },
                { label: "Vistas de perfil", value: conv.profileViews,                          key: "profile",  color: "#06B6D4", icon: Eye },
                { label: "Contactos",        value: conv.contactClicks,                         key: "contact",  color: "#F59E0B", icon: MousePointerClick },
                { label: "Registros",        value: conv.loginWallRegister + conv.loginWallLogin, key: "register", color: "#A78BFA", icon: UserCheck },
                { label: "Solicitudes",      value: conv.bookingSent,                           key: "booking",  color: "#34D399", icon: SendHorizonal },
              ];

              const drops = steps.map((s, i) => {
                if (i === 0) return null;
                const prev = steps[i - 1].value;
                return prev > 0 ? Math.round((1 - s.value / prev) * 100) : null;
              });

              const maxDropIdx = drops.reduce((best, d, i) => {
                if (d == null) return best;
                if (best === -1 || d > (drops[best] ?? 0)) return i;
                return best;
              }, -1);

              const maxDrop = maxDropIdx >= 0 ? drops[maxDropIdx] : null;
              const hasAlert = maxDrop != null && maxDrop > 40;

              // Smart recommendation based on worst bottleneck
              const recs: Record<string, { title: string; tip: string }> = {
                profile:  { title: "Mejorar engagement del perfil",      tip: "Los visitantes no pasan a contacto. Revisa que los perfiles de profesionales muestren fotos, reseñas y CTA visible." },
                contact:  { title: "Optimizar el CTA de contacto",       tip: "Alta caída al intentar contactar. Considera reducir fricción: simplifica el formulario o resalta la propuesta de valor." },
                register: { title: "Optimizar el Login Wall",            tip: "Los usuarios abandonan en el registro. Prueba reducir campos, agregar login social o un mensaje de valor más claro." },
                booking:  { title: "Mejorar cierre de solicitudes",      tip: "Usuarios registrados que no envían solicitud. Revisa el flujo de reserva: pasos confusos o campos excesivos." },
                search:   { title: "Aumentar tráfico de búsquedas",      tip: "Pocas búsquedas en el período. Considera mejorar el SEO, notificaciones push o el diseño del buscador principal." },
              };
              const worstKey = maxDropIdx >= 0 ? steps[maxDropIdx].key : null;
              const rec = worstKey ? recs[worstKey] : null;

              return (
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${hasAlert ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.07)"}` }}>

                  {/* Header */}
                  <div className="flex items-center gap-3 px-5 py-4"
                    style={{ background: hasAlert ? "rgba(248,113,113,0.06)" : "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={hasAlert
                        ? { background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)" }
                        : { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
                      {hasAlert
                        ? <AlertTriangle className="w-4 h-4 text-red-400" />
                        : <TrendingUp className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black text-white">Embudo de Conversión</h3>
                      <p className="text-[11px] text-white/35">Análisis de cuellos de botella · {PERIOD_LABELS[period]}</p>
                    </div>
                    <div className="flex gap-3 flex-shrink-0">
                      {conv.contactRate != null && (
                        <div className="text-center">
                          <p className="text-sm font-black" style={{ color: conv.contactRate < 10 ? "#f87171" : "#34d399" }}>{conv.contactRate}%</p>
                          <p className="text-[10px] text-white/30">Vista→Contacto</p>
                        </div>
                      )}
                      {conv.bookingRate != null && (
                        <div className="text-center">
                          <p className="text-sm font-black" style={{ color: conv.bookingRate < 20 ? "#f87171" : "#22d3ee" }}>{conv.bookingRate}%</p>
                          <p className="text-[10px] text-white/30">Contacto→Solicitud</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    {/* ── Critical alert ─────────────────────────────────────── */}
                    {hasAlert && rec && (
                      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                        style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)" }}>
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-red-300">
                            ⚠ Alta caída en "{steps[maxDropIdx].label}" — {maxDrop}% abandono
                          </p>
                          <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{rec.tip}</p>
                        </div>
                      </div>
                    )}

                    {/* ── Funnel steps ───────────────────────────────────────── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {steps.map((item, i) => {
                        const drop = drops[i];
                        const isWorst = i === maxDropIdx && hasAlert;
                        return (
                          <div key={item.key} className="relative rounded-xl p-3 text-center transition-all"
                            style={isWorst ? {
                              background: "rgba(248,113,113,0.09)",
                              border: "1px solid rgba(248,113,113,0.35)",
                              boxShadow: "0 0 16px rgba(248,113,113,0.12)",
                            } : {
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}>

                            {/* Drop badge */}
                            {drop != null && drop > 0 && (
                              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                style={isWorst ? {
                                  background: "rgba(248,113,113,0.25)",
                                  color: "#fca5a5",
                                  border: "1px solid rgba(248,113,113,0.45)",
                                } : {
                                  background: "rgba(248,113,113,0.12)",
                                  color: "#f87171",
                                  border: "1px solid rgba(248,113,113,0.2)",
                                }}>
                                −{drop}%
                              </div>
                            )}

                            {/* Step indicator */}
                            <div className="flex items-center justify-center gap-1 mb-2">
                              <span className="text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0"
                                style={{ background: `${item.color}22`, color: item.color }}>
                                {i + 1}
                              </span>
                            </div>

                            <p className="text-xl font-black" style={{ color: isWorst ? "#fca5a5" : item.color }}>
                              {item.value.toLocaleString()}
                            </p>
                            <p className="text-[11px] mt-1 leading-tight" style={{ color: isWorst ? "rgba(252,165,165,0.7)" : "rgba(255,255,255,0.40)" }}>
                              {item.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Recommendation card ────────────────────────────────── */}
                    {rec && (
                      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                        style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)" }}>
                        <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-black text-amber-300">{rec.title}</p>
                          <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{rec.tip}</p>
                        </div>
                      </div>
                    )}

                    {/* ── Login wall breakdown ───────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-3 pt-1 border-t border-white/[0.05]">
                      <div className="text-center">
                        <p className="text-xs font-black text-violet-400">{conv.loginWallRegister}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">Nuevos registros</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-black text-amber-400">{conv.loginWallLogin}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">Reenganchados</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-black text-emerald-400">{conv.bookingSent}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">Solicitudes enviadas</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Top Perfiles ───────────────────────────────────────────────── */}
            {topProfiles && (topProfiles.topViewed.length > 0 || topProfiles.topContacted.length > 0) && (
              <div className="rounded-2xl p-5 space-y-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">Top Perfiles</h3>
                  <span className="text-[11px] text-white/30 ml-1">· {PERIOD_LABELS[period]}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Most viewed */}
                  {topProfiles.topViewed.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Eye className="w-3 h-3" /> Más vistos
                      </p>
                      <div className="space-y-2">
                        {topProfiles.topViewed.map((w, i) => (
                          <div key={w.workerId} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <span className="text-[10px] font-black w-4 text-center flex-shrink-0"
                              style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "rgba(255,255,255,0.2)" }}>
                              #{i + 1}
                            </span>
                            {w.avatar
                              ? <img src={w.avatar} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                              : <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                                  style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
                                  {w.name.charAt(0).toUpperCase()}
                                </div>
                            }
                            <span className="flex-1 text-xs font-semibold text-white/80 truncate">{w.name}</span>
                            <span className="text-[11px] font-black text-cyan-400 flex-shrink-0">{w.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Most contacted */}
                  {topProfiles.topContacted.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MousePointerClick className="w-3 h-3" /> Más contactados
                      </p>
                      <div className="space-y-2">
                        {topProfiles.topContacted.map((w, i) => (
                          <div key={w.workerId} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <span className="text-[10px] font-black w-4 text-center flex-shrink-0"
                              style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "rgba(255,255,255,0.2)" }}>
                              #{i + 1}
                            </span>
                            {w.avatar
                              ? <img src={w.avatar} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                              : <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                                  style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
                                  {w.name.charAt(0).toUpperCase()}
                                </div>
                            }
                            <span className="flex-1 text-xs font-semibold text-white/80 truncate">{w.name}</span>
                            <span className="text-[11px] font-black text-amber-400 flex-shrink-0">{w.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Report footer watermark ────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-2 pb-1 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                <Zap className="w-3 h-3" />
                <span>LinkServi · Business Intelligence</span>
              </div>
              <p className="text-[11px] text-muted-foreground/30">
                {PERIOD_LABELS[period]} · Generado {new Date().toLocaleDateString("es-VE")}
              </p>
            </div>

          </div>
        )}

      </div>
    </AppLayout>
  );
}
