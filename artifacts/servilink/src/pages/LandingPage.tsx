import { useLocation } from "wouter";
import { useListWorkers } from "@workspace/api-client-react";
import {
  Zap, Star, ShieldCheck, Clock, Wrench, Briefcase,
  Search, ArrowRight, Plus, X, CheckCircle,
  TrendingUp, Calculator, RefreshCw, BarChart2, Landmark, ArrowLeftRight,
  Store, KeyRound, CarFront, Newspaper, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { publishRates } from "@/lib/sharedRates";
import { NeonBackground } from "@/components/ui/NeonBackground";
import { GlobalSearchBar } from "@/components/ui/GlobalSearchBar";
import { LinkServiLogoIcon } from "@/components/ui/ServiLinkLogoIcon";
// InstallBanner removed — PWA install is now handled globally by
// PWAInstallPrompt (mounted in App.tsx). Having two listeners caused the
// `beforeinstallprompt` event to be consumed by whichever component mounted
// first, leaving the other button non-functional.
import { StickyRateBar, ScrollHint } from "@/components/RateDiscovery";

// ── 6 Pilares del ecosistema LinkServi ───────────────────────────────────────────
const PILLARS = [
  {
    icon: Store,
    label: "ServiMarket",
    desc: "Productos, tiendas y envíos",
    color: "#818cf8",
    bg: "rgba(129,140,248,0.10)",
    border: "rgba(129,140,248,0.28)",
    action: "/store",
  },
  {
    icon: Wrench,
    label: "Servicios",
    desc: "Profesionales on-demand verificados",
    color: "#06B6D4",
    bg: "rgba(6,182,212,0.10)",
    border: "rgba(6,182,212,0.28)",
    action: "/search",
  },
  {
    icon: KeyRound,
    label: "Alquileres",
    desc: "Herramientas, inmuebles y más",
    color: "#c084fc",
    bg: "rgba(192,132,252,0.10)",
    border: "rgba(192,132,252,0.30)",
    action: "/store?type=rental",
  },
  {
    icon: Briefcase,
    label: "Consigue personal",
    desc: "Bolsa de trabajo y talento",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.35)",
    action: "/jobs",
  },
  {
    icon: CarFront,
    label: "Transporte / Delivery",
    desc: "Viajes y logística integrada",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.28)",
    action: "/transport",
  },
  {
    icon: Newspaper,
    label: "Clasificados · LinkAds",
    desc: "Vitrina de alto valor (próximamente)",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.08)",
    border: "rgba(148,163,184,0.25)",
    action: "/clasificados",
    badge: "Próximamente",
  },
] as const;

// ── FAB (mobile) — mismos 6 pilares ─────────────────────────────────────────────
const FAB_OPTIONS = [
  { icon: Store,      label: "ServiMarket",            color: "#818cf8", bg: "rgba(129,140,248,0.16)", border: "rgba(129,140,248,0.38)", action: "/store" },
  { icon: Wrench,     label: "Servicios",             color: "#06B6D4", bg: "rgba(6,182,212,0.16)",   border: "rgba(6,182,212,0.38)",   action: "/search" },
  { icon: KeyRound,   label: "Alquileres",            color: "#c084fc", bg: "rgba(192,132,252,0.16)", border: "rgba(192,132,252,0.38)", action: "/store?type=rental" },
  { icon: Briefcase,  label: "Consigue personal",     color: "#f59e0b", bg: "rgba(245,158,11,0.16)",  border: "rgba(245,158,11,0.40)",  action: "/jobs" },
  { icon: CarFront,   label: "Transporte / Delivery", color: "#34d399", bg: "rgba(52,211,153,0.14)",   border: "rgba(52,211,153,0.36)",  action: "/transport" },
  { icon: Newspaper,  label: "Clasificados",          color: "#94a3b8", bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.34)", action: "/clasificados" },
];

// ── Multi-source Rate Card ────────────────────────────────────────────────────

const RATE_MODE_KEY = "servilink_rate_mode";

function loadSavedMode(): RateMode {
  try {
    const m = localStorage.getItem(RATE_MODE_KEY) as RateMode | null;
    return m && ["bcv", "binance", "euro"].includes(m) ? m : "bcv";
  } catch { return "bcv"; }
}

type RateMode = "bcv" | "binance" | "euro";

interface RateData {
  rate: number;
  source: string;
  minutesAgo: number;
  fetchedAt: string;
}

interface AllRates {
  bcv:     RateData | null;
  binance: RateData | null;
  euro:    RateData | null;
}

const MODE_CONFIG: Record<RateMode, {
  label: string; short: string;
  currency: string; symbol: string;
  color: string; colorA: string; colorB: string;
  glow: string; glowDim: string;
  sourceName: string; refreshLabel: string;
  gradient: string;
  // Identity layer
  accentBand:  string;
  bgOverlayA:  string;
  bgOverlayB:  string;
  tabIcon: "ve" | "binance" | "euro";
  headerIcon: "bar" | "trend" | "landmark";
}> = {
  bcv: {
    label: "BCV", short: "BCV",
    currency: "USD", symbol: "$",
    color: "#22d3ee",
    colorA: "rgba(34,211,238,0.16)", colorB: "rgba(34,211,238,0.07)",
    glow: "rgba(34,211,238,0.35)",   glowDim: "rgba(34,211,238,0.10)",
    sourceName: "Banco Central de Venezuela", refreshLabel: "Cada 10 min",
    gradient: "linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)",
    accentBand:  "linear-gradient(90deg,rgba(207,20,43,0.80) 0%,rgba(0,48,135,0.80) 50%,rgba(255,200,0,0.80) 100%)",
    bgOverlayA:  "radial-gradient(ellipse at top right,rgba(255,200,0,0.07) 0%,rgba(0,51,160,0.10) 45%,rgba(207,20,43,0.05) 100%)",
    bgOverlayB:  "radial-gradient(ellipse,rgba(34,211,238,0.09) 0%,transparent 70%)",
    tabIcon: "ve", headerIcon: "bar",
  },
  binance: {
    label: "Binance", short: "USDT",
    currency: "USDT", symbol: "₮",
    color: "#FCD535",
    colorA: "rgba(252,213,53,0.20)", colorB: "rgba(252,213,53,0.07)",
    glow: "rgba(252,213,53,0.40)",  glowDim: "rgba(252,213,53,0.13)",
    sourceName: "Binance P2P", refreshLabel: "Cada 30 s",
    gradient: "linear-gradient(135deg,#92400e 0%,#d97706 50%,#FCD535 100%)",
    accentBand:  "linear-gradient(90deg,rgba(240,185,11,0.90) 0%,rgba(252,213,53,0.90) 50%,rgba(180,83,9,0.90) 100%)",
    bgOverlayA:  "radial-gradient(ellipse at top right,rgba(252,213,53,0.09) 0%,rgba(180,83,9,0.07) 55%,transparent 100%)",
    bgOverlayB:  "radial-gradient(ellipse,rgba(252,213,53,0.07) 0%,transparent 65%)",
    tabIcon: "binance", headerIcon: "trend",
  },
  euro: {
    label: "Euro", short: "EUR",
    currency: "EUR", symbol: "€",
    color: "#93c5fd",
    colorA: "rgba(147,197,253,0.16)", colorB: "rgba(30,58,138,0.14)",
    glow: "rgba(147,197,253,0.35)",   glowDim: "rgba(30,58,138,0.28)",
    sourceName: "Euro oficial", refreshLabel: "Cada 10 min",
    gradient: "linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#60a5fa 100%)",
    accentBand:  "linear-gradient(90deg,rgba(30,58,138,0.90) 0%,rgba(37,99,235,0.85) 65%,rgba(212,175,55,0.65) 100%)",
    bgOverlayA:  "radial-gradient(ellipse at top right,rgba(30,58,138,0.22) 0%,rgba(37,99,235,0.10) 55%,transparent 100%)",
    bgOverlayB:  "radial-gradient(ellipse,rgba(147,197,253,0.07) 0%,transparent 65%)",
    tabIcon: "euro", headerIcon: "landmark",
  },
};

const EQUIV_AMOUNTS = [10, 50, 100, 500];
const EQUIV_COLORS  = ["#22d3ee", "#a78bfa", "#3b82f6", "#f97316"];
const EQUIV_GLOWS   = ["rgba(34,211,238,0.28)", "rgba(167,139,250,0.28)", "rgba(59,130,246,0.28)", "rgba(249,115,22,0.28)"];

const STAR_POSITIONS: [number, number, number][] = [
  [8, 20, 2], [20, 55, 3], [35, 10, 2], [55, 35, 2],
  [70, 18, 3], [80, 60, 2], [50, 75, 2], [15, 80, 3],
];

// Euro abstract stars — 8 dots in a circle (EU flag inspired, not literal)
const EURO_STAR_POS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (i * 45 - 90) * (Math.PI / 180);
  return [68 + 20 * Math.cos(a), 28 + 18 * Math.sin(a)];
});

// ── Mini inline icons per mode — no emojis ────────────────────────────────────
function ModeTabIcon({ type, active, color }: { type: "ve" | "binance" | "euro"; active: boolean; color: string }) {
  if (type === "ve") {
    // Venezuela flag — 3 horizontal stripes (amarillo / azul / rojo)
    return (
      <div style={{
        display: "flex", flexDirection: "column", width: "15px", height: "10px",
        borderRadius: "2px", overflow: "hidden", flexShrink: 0,
        opacity: active ? 1 : 0.45, transition: "opacity 0.2s",
        boxShadow: active ? "0 0 4px rgba(0,0,0,0.4)" : "none",
      }}>
        <div style={{ flex: 1, background: "#FFCC00" }} />
        <div style={{ flex: 1, background: "#003087" }} />
        <div style={{ flex: 1, background: "#CF142B" }} />
      </div>
    );
  }
  if (type === "binance") {
    // Gold diamond — Binance-style abstract mark
    return (
      <div style={{
        width: "13px", height: "13px", flexShrink: 0,
        transform: "rotate(45deg)",
        background: active ? color : "rgba(255,255,255,0.2)",
        borderRadius: "2px",
        opacity: active ? 1 : 0.45,
        transition: "background 0.2s, opacity 0.2s",
        boxShadow: active ? `0 0 6px ${color}60` : "none",
      }} />
    );
  }
  // Euro — circle of dots
  return (
    <div style={{ position: "relative", width: "14px", height: "14px", flexShrink: 0 }}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * 45 - 90) * (Math.PI / 180);
        return (
          <div key={i} style={{
            position: "absolute",
            left: `${50 + 45 * Math.cos(a)}%`,
            top:  `${50 + 45 * Math.sin(a)}%`,
            width: "2.5px", height: "2.5px", borderRadius: "50%",
            transform: "translate(-50%,-50%)",
            background: active ? "#D4AF37" : "rgba(255,255,255,0.25)",
            opacity: active ? 1 : 0.5,
            transition: "background 0.2s, opacity 0.2s",
          }} />
        );
      })}
    </div>
  );
}

function RateCard() {
  const [, navigate]  = useLocation();
  const [mode, setMode]       = useState<RateMode>(loadSavedMode);
  const [rates, setRates]     = useState<AllRates>({ bcv: null, binance: null, euro: null });
  const [loading, setLoading] = useState(true);
  const [amount, setAmount]   = useState("");
  const [bsInput, setBsInput] = useState("");
  const [calcDir, setCalcDir] = useState<"fwd" | "inv">("fwd");
  const [swapAnim, setSwapAnim] = useState(false);
  const [activated, setActivated] = useState(false);
  const [visible, setVisible] = useState(false);
  const [fading, setFading]   = useState(false);
  const [spinning, setSpinning] = useState(false);
  const binanceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRatesRef = useRef<AllRates>({ bcv: null, binance: null, euro: null });

  const cfg = MODE_CONFIG[mode];
  const currentRate = rates[mode]?.rate ?? null;

  // ── Fetch all rates ──────────────────────────────────────────────────────────
  const fetchRates = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch("/api/rates");
      const data = await r.json() as {
        bcv?: { rate: number; source: string; minutesAgo: number; fetchedAt: string } | { error: string };
        binance?: { rate: number; source: string; minutesAgo: number; fetchedAt: string } | { error: string };
        euro?: { rate: number; source: string; minutesAgo: number; fetchedAt: string } | { error: string };
      };
      const newRates: AllRates = {
        bcv:     data.bcv     && "rate" in data.bcv     ? data.bcv     as RateData : null,
        binance: data.binance && "rate" in data.binance ? data.binance as RateData : null,
        euro:    data.euro    && "rate" in data.euro    ? data.euro    as RateData : null,
      };
      setRates(prev => { prevRatesRef.current = prev; return newRates; });
      publishRates({
        bcv:     newRates.bcv     ? { rate: newRates.bcv.rate,     source: newRates.bcv.source     } : null,
        binance: newRates.binance ? { rate: newRates.binance.rate, source: newRates.binance.source } : null,
        euro:    newRates.euro    ? { rate: newRates.euro.rate,    source: newRates.euro.source    } : null,
      });
    } catch { /* ignore — keep stale */ }
    finally { setLoading(false); }
  }, []);

  // ── Initial load + Binance 60s refresh ───────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);

    // Initial fetch — always fetches all 3 rates
    fetchRates().then(() => {
      // If any rate is still missing after first fetch, retry once in 3 s
      // (backend may still be warming up caches on cold start)
      setRates(current => {
        if (!current.bcv || !current.binance || !current.euro) {
          setTimeout(() => fetchRates(true), 3000);
        }
        return current;
      });
    });

    // Binance P2P refreshes every 30s (direct Binance feed); BCV/EUR every 10min
    binanceTimer.current = setInterval(() => fetchRates(true), 30_000);
    return () => {
      clearTimeout(t);
      if (binanceTimer.current) clearInterval(binanceTimer.current);
    };
  }, [fetchRates]);

  // ── Manual refresh ────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setSpinning(true);
    await fetchRates();
    setTimeout(() => setSpinning(false), 600);
  };

  // ── Switch mode with fade + auto-fetch if data missing ──────────────────────
  const switchMode = (m: RateMode) => {
    if (m === mode) return;
    try { localStorage.setItem(RATE_MODE_KEY, m); } catch { /* blocked */ }
    // Snapshot BEFORE the 160ms fade so the closure is fresh
    const alreadyLoaded = !!rates[m];
    if (!alreadyLoaded) setLoading(true);  // show skeleton early if no data yet
    setFading(true);
    setTimeout(() => {
      setMode(m);
      setFading(false);
      // Refresh rates: quiet (background) if we already have data, full if missing
      fetchRates(!alreadyLoaded ? false : true);
    }, 160);
  };

  // ── Formatter ────────────────────────────────────────────────────────────────
  const fmt = (bs: number) =>
    bs >= 1000
      ? bs.toLocaleString("es-VE", { maximumFractionDigits: 0 })
      : bs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Calculator derived values ─────────────────────────────────────────────────
  const calcBs  = currentRate && amount  && parseFloat(amount)  > 0
    ? parseFloat(amount)  * currentRate : null;
  const calcFx  = currentRate && bsInput && parseFloat(bsInput) > 0
    ? parseFloat(bsInput) / currentRate : null;

  const handleSwap = () => {
    setSwapAnim(true);
    setTimeout(() => setSwapAnim(false), 300);
    setCalcDir(d => d === "fwd" ? "inv" : "fwd");
    setAmount(""); setBsInput("");
  };

  const handleActivate = () => {
    if (!currentRate) return;
    try { localStorage.setItem("bcv_pinned_rate", String(currentRate)); } catch { /* blocked */ }
    setActivated(true);
    setTimeout(() => navigate("/store"), 700);
  };

  const minutesAgo = rates[mode]?.minutesAgo ?? null;
  const updatedLabel = minutesAgo === null
    ? "Actualizando…"
    : minutesAgo === 0
      ? "Justo ahora"
      : `Hace ${minutesAgo} min`;

  // ── Trend: compare current vs previous rate ───────────────────────────────────
  const prevRate = prevRatesRef.current[mode]?.rate ?? null;
  const trend: "up" | "down" | "stable" | null =
    currentRate && prevRate && currentRate !== prevRate
      ? currentRate > prevRate * 1.0005 ? "up"
      : currentRate < prevRate * 0.9995 ? "down"
      : "stable"
      : null;
  const TREND_ICON  = { up: "↑", down: "↓", stable: "→" };
  const TREND_COLOR = { up: "#f87171", down: "#34d399", stable: "#94a3b8" };

  // ── Diff badge vs BCV (only when mode ≠ bcv) ─────────────────────────────────
  const bcvRate   = rates.bcv?.rate ?? null;
  const diffPct   = mode !== "bcv" && currentRate && bcvRate
    ? ((currentRate - bcvRate) / bcvRate * 100) : null;
  const diffLabel = diffPct !== null
    ? `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}% vs oficial`
    : null;
  const diffColor = diffPct === null ? "transparent"
    : diffPct > 0 ? "rgba(248,113,113,0.9)" : "rgba(52,211,153,0.9)";

  return (
    <section className="px-4 pb-10 max-w-2xl mx-auto w-full">
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? "translateY(0)" : "translateY(24px)",
          position:   "relative",
          borderRadius: "28px",
          overflow:   "hidden",
          background: "linear-gradient(150deg, rgba(8,12,28,0.98) 0%, rgba(4,8,20,0.96) 100%)",
          border:     `1px solid ${cfg.glowDim}`,
          backdropFilter: "blur(28px)",
          boxShadow:  `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px ${cfg.glowDim} inset`,
          transition: "border-color 0.25s ease, box-shadow 0.25s ease, opacity 0.55s ease, transform 0.55s ease",
        } as React.CSSProperties}
      >
        {/* ── TOP ACCENT STRIP — identity band per mode ── */}
        <div style={{
          height: "3px",
          background: cfg.accentBand,
          transition: "background 0.25s ease",
          flexShrink: 0,
        }} />

        {/* ── BACKGROUND LAYERS ── */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: "28px" }}>
          {/* Overlay A — main ambient radial (mode-specific) */}
          <div style={{
            position: "absolute", top: "-30%", right: "-20%", width: "70%", height: "130%",
            background: cfg.bgOverlayA,
            filter: "blur(48px)", transform: "rotate(-12deg)",
            transition: "background 0.3s ease",
          }} />
          {/* Overlay B — mode color left glow */}
          <div style={{
            position: "absolute", top: "-10%", left: "-10%", width: "60%", height: "60%",
            background: cfg.bgOverlayB,
            filter: "blur(32px)",
            transition: "background 0.3s ease",
          }} />
          {/* Binance — subtle trading grid pattern */}
          {mode === "binance" && (
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "linear-gradient(rgba(252,213,53,0.030) 1px,transparent 1px),linear-gradient(90deg,rgba(252,213,53,0.030) 1px,transparent 1px)",
              backgroundSize: "28px 28px",
            }} />
          )}
          {/* Euro — abstract star dots (EU circle, not literal) */}
          {mode === "euro" && EURO_STAR_POS.map(([x, y], i) => (
            <div key={i} style={{
              position: "absolute", left: `${x}%`, top: `${y}%`,
              width: "3.5px", height: "3.5px", borderRadius: "50%",
              background: "rgba(212,175,55,0.30)",
              transform: "translate(-50%,-50%)",
            }} />
          ))}
        </div>

        {/* Static micro-stars (all modes) */}
        {STAR_POSITIONS.map(([x, y, sz], i) => (
          <div key={i} style={{
            position: "absolute", left: `${x}%`, top: `${y}%`,
            width: `${sz}px`, height: `${sz}px`, borderRadius: "50%",
            background: "rgba(255,255,255,0.35)", filter: "blur(0.6px)", pointerEvents: "none",
          }} />
        ))}

        {/* ── Header ── */}
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${cfg.glowDim}`, position: "relative", transition: "border-color 0.3s" }}>

          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "13px", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: cfg.colorB, border: `1px solid ${cfg.colorA}`,
                boxShadow: `0 0 18px ${cfg.glowDim}`,
                transition: "background 0.25s, border-color 0.25s, box-shadow 0.25s",
              }}>
                {cfg.headerIcon === "bar"      && <BarChart2  style={{ width: "18px", height: "18px", color: cfg.color }} />}
                {cfg.headerIcon === "trend"    && <TrendingUp style={{ width: "18px", height: "18px", color: cfg.color }} />}
                {cfg.headerIcon === "landmark" && <Landmark   style={{ width: "18px", height: "18px", color: cfg.color }} />}
              </div>
              <div>
                <p style={{ color: "#fff", fontWeight: 800, fontSize: "15px", lineHeight: 1.2 }}>
                  Conversor de Divisas
                </p>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px", marginTop: "1px" }}>
                  Venezuela · Tasas en tiempo real
                </p>
              </div>
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              title="Actualizar tasas"
              style={{
                width: "34px", height: "34px", borderRadius: "10px", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer",
              }}
            >
              <RefreshCw style={{
                width: "14px", height: "14px", color: "rgba(255,255,255,0.35)",
                transform: spinning ? "rotate(360deg)" : "rotate(0deg)",
                transition: spinning ? "transform 0.6s linear" : "none",
              }} />
            </button>
          </div>

          {/* ── Mode selector (segmented pill) ── */}
          <div style={{
            display: "flex", gap: "4px", padding: "4px",
            borderRadius: "16px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            {(["bcv", "binance", "euro"] as RateMode[]).map(m => {
              const c = MODE_CONFIG[m];
              const active = m === mode;
              return (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    borderRadius: "12px",
                    fontWeight: 700,
                    fontSize: "12px",
                    cursor: "pointer",
                    border: active ? `1px solid ${c.colorA}` : "1px solid transparent",
                    background: active ? c.colorB : "transparent",
                    color: active ? c.color : "rgba(255,255,255,0.35)",
                    boxShadow: active ? `0 0 14px ${c.glowDim}, inset 0 1px 0 rgba(255,255,255,0.06)` : "none",
                    transition: "all 0.2s ease",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <ModeTabIcon type={c.tabIcon} active={active} color={c.color} />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Rate display + source badge ── */}
        <div
          style={{
            padding: "18px 20px 0",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
            opacity: fading ? 0 : 1,
            transform: fading ? "translateY(4px)" : "translateY(0)",
            transition: "opacity 0.16s ease, transform 0.16s ease",
          }}
        >
          {/* Source + updated */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "4px 10px", borderRadius: "100px",
              background: cfg.colorB, border: `1px solid ${cfg.colorA}`,
              width: "fit-content", transition: "background 0.3s, border-color 0.3s",
            }}>
              <ShieldCheck style={{ width: "10px", height: "10px", color: cfg.color, flexShrink: 0 }} />
              <span style={{ color: cfg.color, fontSize: "10px", fontWeight: 700, letterSpacing: "0.02em" }}>
                {cfg.sourceName}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: currentRate ? "#34d399" : "#fbbf24",
                boxShadow: currentRate ? "0 0 6px rgba(52,211,153,0.8)" : "none",
              }} />
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", fontWeight: 600 }}>
                {updatedLabel}
              </span>
              {trend && (
                <span style={{
                  fontSize: "10px", fontWeight: 800, color: TREND_COLOR[trend],
                  lineHeight: 1, letterSpacing: "-0.02em",
                }}>
                  {TREND_ICON[trend]}
                </span>
              )}
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "10px" }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.22)", fontSize: "10px" }}>{cfg.refreshLabel}</span>
            </div>
          </div>

          {/* Rate number */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {loading ? (
              <>
                <div style={{ width: "110px", height: "40px", borderRadius: "10px", background: "rgba(255,255,255,0.07)", marginBottom: "6px" }} />
                <div style={{ width: "60px", height: "13px", borderRadius: "6px", background: "rgba(255,255,255,0.05)", marginLeft: "auto" }} />
              </>
            ) : (
              <>
                <p style={{
                  fontSize: "40px", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em",
                  color: "#ffffff",
                  textShadow: `0 0 28px ${cfg.glow}`,
                  transition: "text-shadow 0.3s",
                  position: "relative", zIndex: 1,
                }}>
                  {currentRate
                    ? currentRate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "—"
                  }
                </p>
                <p style={{ color: cfg.color, fontSize: "12px", fontWeight: 700, marginTop: "4px", letterSpacing: "0.06em", transition: "color 0.3s" }}>
                  Bs / {cfg.currency}
                </p>
                {diffLabel && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    marginTop: "6px", padding: "2px 8px", borderRadius: "100px",
                    background: diffPct! > 0 ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.12)",
                    border: `1px solid ${diffPct! > 0 ? "rgba(239,68,68,0.3)" : "rgba(52,211,153,0.3)"}`,
                    float: "right",
                  }}>
                    <span style={{
                      fontSize: "10px", fontWeight: 800, color: diffColor,
                      letterSpacing: "0.01em",
                    }}>
                      {diffLabel}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div
          style={{
            padding: "16px 20px 22px",
            display: "flex", flexDirection: "column", gap: "18px",
            position: "relative",
            opacity: fading ? 0 : 1,
            transition: "opacity 0.16s ease",
          }}
        >
          {/* Equivalencias rápidas */}
          <div>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "9px" }}>
              Equivalencias rápidas
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "7px" }}>
              {EQUIV_AMOUNTS.map((amt, i) => (
                <div
                  key={amt}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 20px ${EQUIV_GLOWS[i]}`;
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                    padding: "12px 4px", borderRadius: "15px",
                    background: "rgba(255,255,255,0.02)", border: `1px solid ${EQUIV_COLORS[i]}33`,
                    transition: "box-shadow 0.22s ease, transform 0.22s ease", cursor: "default",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.38)", fontSize: "11px", fontWeight: 700 }}>
                    {cfg.symbol}{amt}
                  </span>
                  {loading ? (
                    <div style={{ width: "36px", height: "12px", borderRadius: "4px", background: "rgba(255,255,255,0.07)" }} />
                  ) : currentRate ? (
                    <div style={{ textAlign: "center" }}>
                      <span style={{ color: EQUIV_COLORS[i], fontSize: "11px", fontWeight: 900, display: "block", lineHeight: 1.2 }}>
                        {fmt(amt * currentRate)}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px", fontWeight: 600 }}>Bs</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Calculadora bidireccional */}
          <div style={{
            borderRadius: "20px", padding: "15px",
            background: cfg.colorB, border: `1px solid ${cfg.colorA}`,
            transition: "background 0.3s, border-color 0.3s",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Calculator style={{ width: "13px", height: "13px", color: cfg.color }} />
                <span style={{ color: cfg.color, fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", transition: "color 0.3s" }}>
                  Calculadora · {cfg.currency}
                </span>
              </div>
              {/* Direction pill */}
              <div style={{
                display: "flex", alignItems: "center", gap: "4px",
                padding: "3px 8px", borderRadius: "100px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.30)",
                letterSpacing: "0.06em",
              }}>
                {calcDir === "fwd" ? `${cfg.currency} → Bs` : `Bs → ${cfg.currency}`}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
              {/* Left input */}
              <div style={{ flex: 1 }}>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
                  {calcDir === "fwd" ? `Tú pagas (${cfg.currency})` : "Tú pagas (Bs)"}
                </p>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", fontSize: "14px", fontWeight: 700 }}>
                    {calcDir === "fwd" ? cfg.symbol : "Bs"}
                  </span>
                  {calcDir === "fwd" ? (
                    <input
                      type="number" inputMode="decimal" placeholder="0.00"
                      value={amount} onChange={e => setAmount(e.target.value)}
                      style={{
                        width: "100%", paddingLeft: "34px", paddingRight: "12px",
                        paddingTop: "11px", paddingBottom: "11px",
                        borderRadius: "13px", background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.1)", color: "#fff",
                        fontSize: "15px", fontWeight: 700, outline: "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = cfg.color + "80"; e.currentTarget.style.boxShadow = `0 0 0 3px ${cfg.glowDim}`; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  ) : (
                    <input
                      type="number" inputMode="decimal" placeholder="0.00"
                      value={bsInput} onChange={e => setBsInput(e.target.value)}
                      style={{
                        width: "100%", paddingLeft: "34px", paddingRight: "12px",
                        paddingTop: "11px", paddingBottom: "11px",
                        borderRadius: "13px", background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.1)", color: "#fff",
                        fontSize: "15px", fontWeight: 700, outline: "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = cfg.color + "80"; e.currentTarget.style.boxShadow = `0 0 0 3px ${cfg.glowDim}`; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  )}
                </div>
              </div>

              {/* Swap button */}
              <button
                onClick={handleSwap}
                title="Invertir dirección"
                style={{
                  flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: cfg.colorB, border: `1px solid ${cfg.colorA}`,
                  cursor: "pointer", marginBottom: "2px",
                  transform: swapAnim ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.28s ease, background 0.25s, border-color 0.25s, box-shadow 0.2s",
                  boxShadow: `0 0 10px ${cfg.glowDim}`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 16px ${cfg.glow}`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 10px ${cfg.glowDim}`; }}
              >
                <ArrowLeftRight style={{ width: "14px", height: "14px", color: cfg.color }} />
              </button>

              {/* Right output */}
              <div style={{ flex: 1 }}>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
                  {calcDir === "fwd" ? "Recibes (Bs)" : `Recibes (${cfg.currency})`}
                </p>
                <div style={{
                  padding: "11px 12px", borderRadius: "13px",
                  background: (calcDir === "fwd" ? calcBs : calcFx) ? cfg.colorB : "rgba(255,255,255,0.03)",
                  border: (calcDir === "fwd" ? calcBs : calcFx) ? `1px solid ${cfg.colorA}` : "1px solid rgba(255,255,255,0.07)",
                  minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px",
                  transition: "border-color 0.2s, background 0.2s",
                }}>
                  {calcDir === "fwd" ? (
                    calcBs ? (
                      <>
                        <span style={{ color: cfg.color, fontWeight: 900, fontSize: "15px", transition: "color 0.3s" }}>{fmt(calcBs)}</span>
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px", fontWeight: 600 }}>Bs</span>
                      </>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.15)", fontWeight: 700, fontSize: "15px" }}>— Bs</span>
                    )
                  ) : (
                    calcFx ? (
                      <>
                        <span style={{ color: cfg.color, fontWeight: 900, fontSize: "15px", transition: "color 0.3s" }}>
                          {calcFx >= 1000
                            ? calcFx.toLocaleString("es-VE", { maximumFractionDigits: 0 })
                            : calcFx.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px", fontWeight: 600 }}>{cfg.currency}</span>
                      </>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.15)", fontWeight: 700, fontSize: "15px" }}>— {cfg.currency}</span>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleActivate}
            disabled={!currentRate || activated}
            className="active:scale-[0.97]"
            style={{
              width: "100%", padding: "15px 20px", borderRadius: "18px",
              fontWeight: 700, fontSize: "14px",
              border: activated ? "1px solid rgba(52,211,153,0.35)" : "none",
              cursor: !currentRate ? "not-allowed" : "pointer",
              background: activated
                ? "rgba(52,211,153,0.12)"
                : !currentRate
                  ? "rgba(255,255,255,0.05)"
                  : cfg.gradient,
              color: activated ? "#34d399" : "#fff",
              boxShadow: activated || !currentRate
                ? "none"
                : `0 4px 24px ${cfg.glowDim}, 0 0 48px ${cfg.glowDim}`,
              opacity: !currentRate ? 0.5 : 1,
              transition: "all 0.3s ease",
            }}
          >
            {activated
              ? `✓ Tasa ${cfg.short} activada — abriendo marketplace…`
              : <>Ver productos con esta tasa <ArrowRight style={{ width: "13px", height: "13px", display: "inline", verticalAlign: "middle", marginLeft: "4px" }} /></>
            }
          </button>

          <p style={{ textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.18)", marginTop: "-10px" }}>
            Filtra el marketplace con la tasa {cfg.short} activa
          </p>

          {/* Footer info */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px",
            paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.05)",
          }}>
            {[
              { label: "Fuente", value: cfg.short,           sub: cfg.sourceName.split("·")[0].trim() },
              { label: "Refresh",value: cfg.refreshLabel,    sub: "Automático"                         },
              { label: "Datos",  value: rates[mode] ? "Live" : "—", sub: "Tiempo real"                },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ textAlign: "center", padding: "10px 4px" }}>
                <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
                  {label}
                </p>
                <p style={{ color: cfg.color, fontSize: "11px", fontWeight: 700, lineHeight: 1.3, transition: "color 0.3s" }}>
                  {value}
                </p>
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", marginTop: "2px" }}>
                  {sub}
                </p>
              </div>
            ))}
          </div>

          {/* Diferenciador — earn money tagline */}
          <div style={{
            paddingTop: "12px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
            textAlign: "center",
          }}>
            <span style={{
              color: "rgba(255,255,255,0.14)", fontSize: "9px", fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase",
            }}>
              LINKSERVI
            </span>
            <span style={{
              color: "rgba(255,255,255,0.35)", fontSize: "11px", fontWeight: 600,
              letterSpacing: "0.01em",
            }}>
              Más que tasas — una plataforma para ganar dinero
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [fabOpen, setFabOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const { data: workers = [] } = useListWorkers({});

  // Si el usuario ya está logueado, mandamos directo a su dashboard
  // (donde ven los botones de activación de roles). Sin esto, un usuario
  // que vuelve al inicio se queda en la landing pública y no encuentra
  // dónde activar Profesional / Conductor / Tienda.
  useEffect(() => {
    if (!user) return;
    const dest =
      user.role === "admin" ? "/admin"
      : user.role === "worker" ? "/professional"
      : user.role === "cohost" ? "/cohost"
      : user.role === "seller" ? "/seller"
      : "/client";
    navigate(dest);
  }, [user, navigate]);

  const availableCount = (workers as any[]).filter((w: any) => w.isAvailable || w.hasRecentContact).length;

  return (
    <div className="min-h-screen text-foreground overflow-x-hidden relative bg-background selection:bg-primary/30">
      <NeonBackground />
      {/* InstallBanner removed — global PWAInstallPrompt handles install UX */}
      <StickyRateBar />

      {/* ── Header ── */}
      <header className="fixed top-0 inset-x-0 z-50 glass-nav border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="LinkServi" className="h-9 w-auto object-contain" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 hidden sm:block">
            Un ecosistema · Un registro
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/login")}
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors px-4 py-2"
          >
            Ingresar
          </button>
          <button
            onClick={() => navigate("/register")}
            className="text-sm font-semibold px-6 py-2.5 rounded-2xl active:scale-[0.98] transition-all duration-200"
            style={{
              border: "1px solid rgba(6,182,212,0.35)",
              color: "rgba(6,182,212,0.85)",
              background: "rgba(6,182,212,0.07)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(6,182,212,0.13)";
              e.currentTarget.style.borderColor = "rgba(6,182,212,0.55)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(6,182,212,0.07)";
              e.currentTarget.style.borderColor = "rgba(6,182,212,0.35)";
            }}
          >
            Comenzar gratis
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="relative pt-20 pb-20 px-6 min-h-screen flex flex-col justify-center items-center">
        <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center w-full">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-5 rounded-full glass border border-primary/20 text-primary text-xs font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <Zap className="w-3.5 h-3.5" fill="currentColor" />
            Ecosistema LinkServi
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl font-black leading-[1.1] mb-3 tracking-tight text-white drop-shadow-2xl">
            ¿Qué necesitas <span className="text-gradient">hoy</span>?
          </h1>

          <p className="text-base md:text-lg text-muted-foreground mb-8 max-w-lg mx-auto leading-relaxed">
            Un solo lugar para comprar, contratar, alquilar, moverte y crecer profesionalmente — con respaldo y pagos seguros.
          </p>

          {/* Buscador global — protagonista */}
          <div className="w-full max-w-2xl mb-3 relative z-20">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-2 text-left pl-1">
              Buscador global
            </p>
            <GlobalSearchBar
              variant="hero"
              placeholder="¿Qué necesitas hoy?"
              className="w-full"
            />
          </div>

          <p className="text-[11px] text-white/30 mb-10 max-w-md">
            Busca en productos, servicios, tiendas y empleo a la vez. Tu ubicación ayuda a ordenar por cercanía.
          </p>

          {/* 6 pilares — grid imponente */}
          <div id="pilares" className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 w-full max-w-4xl mb-5 scroll-mt-28">
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              const badge = "badge" in pillar ? pillar.badge : undefined;
              return (
                <button
                  key={pillar.label}
                  type="button"
                  onClick={() => navigate(pillar.action)}
                  className="group relative flex flex-col items-start gap-3 px-4 sm:px-5 py-5 sm:py-6 rounded-2xl sm:rounded-3xl text-left transition-all duration-300 hover:-translate-y-1 active:scale-[0.97] overflow-hidden min-h-[118px]"
                  style={{
                    background: pillar.bg,
                    border: `1px solid ${pillar.border}`,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 12px 36px ${pillar.color}28, 0 4px 16px rgba(0,0,0,0.35)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.25)";
                  }}
                >
                  {badge && (
                    <span
                      className="absolute top-2.5 right-2.5 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide"
                      style={{
                        background: "rgba(15,23,42,0.85)",
                        color: pillar.color,
                        border: `1px solid ${pillar.border}`,
                      }}
                    >
                      {badge}
                    </span>
                  )}

                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl sm:rounded-3xl"
                    style={{ background: `linear-gradient(135deg, ${pillar.color}0d 0%, transparent 55%)` }}
                  />

                  <div className="flex items-center justify-between w-full">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                      style={{ background: `${pillar.color}22` }}
                    >
                      <Icon className="w-5 h-5 sm:w-[22px] sm:h-[22px]" style={{ color: pillar.color }} strokeWidth={1.75} />
                    </div>
                    <ArrowRight
                      className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0.5"
                      style={{ color: pillar.color }}
                    />
                  </div>

                  <div>
                    <p className="font-bold text-white text-sm sm:text-[15px] leading-tight tracking-tight">{pillar.label}</p>
                    <p className="text-[11px] sm:text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {pillar.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Intención secundaria — profesional */}
          <button
            onClick={() => navigate("/ganar-dinero")}
            className="flex items-center gap-1.5 text-sm transition-all duration-200 hover:gap-2.5 active:scale-[0.98] mb-8"
            style={{ color: "rgba(52,211,153,0.7)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(52,211,153,1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(52,211,153,0.7)")}
          >
            ¿Quieres ganar dinero? Ofrece tus servicios
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Stats bar — social proof — todas en una sola fila */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-white/80">
            <div className="flex items-center gap-2 glass px-3 py-2 rounded-2xl">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <strong className="text-white">{availableCount > 0 ? availableCount : "100+"}</strong>
              <span className="text-white/60">profesionales</span>
            </div>
            <div className="flex items-center gap-2 glass px-3 py-2 rounded-2xl">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span className="text-white/60">Calificaciones <strong className="text-white">reales</strong></span>
            </div>
            <div className="flex items-center gap-2 glass px-3 py-2 rounded-2xl">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span className="text-white/60">Identidad <strong className="text-white">verificada</strong></span>
            </div>
            <div className="flex items-center gap-2 glass px-3 py-2 rounded-2xl">
              <Clock className="w-3.5 h-3.5 text-white/50" />
              <span className="text-white/60">Respuesta <strong className="text-white">&lt; 5 min</strong></span>
            </div>
          </div>

          {/* Scroll hint — mobile only, below hero */}
          <ScrollHint />
        </div>
      </main>

      {/* ── Conversor de Divisas — widget colapsable ── */}
      <div className="px-4 pb-10 max-w-2xl mx-auto w-full">
        {/* Pill colapsada */}
        {!rateOpen && (
          <button
            onClick={() => setRateOpen(true)}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              backdropFilter: "blur(12px)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(34,211,238,0.05)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.18)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.20)" }}>
                <BarChart2 className="w-4 h-4" style={{ color: "#22d3ee" }} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white leading-tight">Conversor de Divisas</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>BCV · Binance · Euro · Toca para calcular</p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4" style={{ color: "rgba(255,255,255,0.35)" }} />
          </button>
        )}

        {/* Tarjeta expandida */}
        {rateOpen && (
          <div>
            <button
              onClick={() => setRateOpen(false)}
              className="w-full flex items-center justify-between px-5 py-2.5 mb-2 rounded-2xl transition-all"
              style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)" }}
            >
              <span className="text-xs font-bold" style={{ color: "rgba(34,211,238,0.8)" }}>Conversor de Divisas</span>
              <ChevronUp className="w-4 h-4" style={{ color: "rgba(34,211,238,0.6)" }} />
            </button>
            <RateCard />
          </div>
        )}
      </div>

      {/* ── FAB (mobile only) ── */}
      <div className="fixed bottom-6 right-4 z-50 flex flex-col items-end gap-2 sm:hidden">
        {fabOpen && (
          <div className="flex flex-col gap-2 mb-1">
            {[...FAB_OPTIONS].reverse().map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.label}
                  onClick={() => { setFabOpen(false); navigate(opt.action); }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl transition-all active:scale-[0.96]"
                  style={{ background: opt.bg, border: `1px solid ${opt.border}`, backdropFilter: "blur(12px)" }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${opt.color}20` }}>
                    <Icon className="w-4 h-4" style={{ color: opt.color }} />
                  </div>
                  <p className="text-xs font-bold text-white leading-tight whitespace-nowrap">{opt.label}</p>
                </button>
              );
            })}
          </div>
        )}
        <button
          onClick={() => setFabOpen(v => !v)}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,#06B6D4,#7c3aed)", boxShadow: "0 0 24px rgba(6,182,212,0.4)" }}
        >
          {fabOpen ? <X className="w-6 h-6 text-white" /> : <Plus className="w-6 h-6 text-white" />}
        </button>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 bg-black/60 backdrop-blur-md px-6 pt-12 pb-8">
        <div className="max-w-4xl mx-auto space-y-8">

          <div className="flex flex-col md:flex-row items-start justify-between gap-8">

            {/* Brand */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <img src="/logo.png" alt="LinkServi" className="h-8 w-auto object-contain" />
              </div>
              <p className="text-xs text-white/40 leading-relaxed max-w-[240px]">
                ServiMarket, servicios, alquileres, empleo, transporte y clasificados — en una sola app.
              </p>
            </div>

            {/* Legal */}
            <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest col-span-2 mb-1">Legal</p>
              <button onClick={() => navigate("/terms")} className="text-white/50 hover:text-white transition-colors text-left">Términos de uso</button>
              <button onClick={() => navigate("/privacy")} className="text-white/50 hover:text-white transition-colors text-left">Privacidad</button>
              <button onClick={() => navigate("/cookies")} className="text-white/50 hover:text-white transition-colors text-left">Cookies</button>
              <button onClick={() => navigate("/refunds")} className="text-white/50 hover:text-white transition-colors text-left">Reembolsos</button>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-3 text-sm">
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-1">Contacto</p>
              <a href="mailto:soporte@linkservi.com" className="text-white/50 hover:text-white transition-colors flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" /> soporte@linkservi.com
              </a>
              <a href="mailto:pagos@linkservi.com" className="text-white/50 hover:text-white transition-colors flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> pagos@linkservi.com
              </a>
              <a href="mailto:aliados@linkservi.com" className="text-white/50 hover:text-white transition-colors flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> aliados@linkservi.com
              </a>
              <a
                href="https://wa.me/584126978870?text=Hola%20Equipo%20de%20Soporte%20LinkServi%2C%20vengo%20de%20la%20aplicaci%C3%B3n%20y%20necesito%20asistencia%20con%20un%20servicio.%20Mi%20nombre%20es%3A%20"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp Soporte
              </a>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-white/20">© {new Date().getFullYear()} LinkServi. Todos los derechos reservados.</p>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/8 bg-white/[0.03]">
              <ShieldCheck className="w-3.5 h-3.5 text-primary/60" />
              <p className="text-[11px] text-white/35 font-medium">
                Propiedad de <span className="text-white/55 font-bold">Tartus Digital Solutions</span>
              </p>
            </div>
          </div>

        </div>
      </footer>
    </div>
  );
}
