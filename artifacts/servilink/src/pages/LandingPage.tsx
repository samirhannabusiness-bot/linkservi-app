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

// ── FAB (mobile) ──
const FAB_OPTIONS = [
  { icon: Store,      label: "ServiMarket",            color: "#818cf8", bg: "rgba(129,140,248,0.16)", border: "rgba(129,140,248,0.38)", action: "/store" },
  { icon: Wrench,     label: "Servicios",             color: "#06B6D4", bg: "rgba(6,182,212,0.16)",   border: "rgba(6,182,212,0.38)",   action: "/search" },
  { icon: KeyRound,   label: "Alquileres",            color: "#c084fc", bg: "rgba(192,132,252,0.16)", border: "rgba(192,132,252,0.38)", action: "/store?type=rental" },
  { icon: Briefcase,  label: "Consigue personal",     color: "#f59e0b", bg: "rgba(245,158,11,0.16)",  border: "rgba(245,158,11,0.40)",  action: "/jobs" },
  { icon: CarFront,   label: "Transporte / Delivery", color: "#34d399", bg: "rgba(52,211,153,0.14)",   border: "rgba(52,211,153,0.36)",  action: "/transport" },
  { icon: Newspaper,  label: "Clasificados",          color: "#94a3b8", bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.34)", action: "/clasificados" },
];

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
const EQUIV_COLORS   = ["#22d3ee", "#a78bfa", "#3b82f6", "#f97316"];
const EQUIV_GLOWS    = ["rgba(34,211,238,0.28)", "rgba(167,139,250,0.28)", "rgba(59,130,246,0.28)", "rgba(249,115,22,0.28)"];

const STAR_POSITIONS: [number, number, number][] = [
  [8, 20, 2], [20, 55, 3], [35, 10, 2], [55, 35, 2],
  [70, 18, 3], [80, 60, 2], [50, 75, 2], [15, 80, 3],
];

const EURO_STAR_POS: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (i * 45 - 90) * (Math.PI / 180);
  return [68 + 20 * Math.cos(a), 28 + 18 * Math.sin(a)];
});

function ModeTabIcon({ type, active, color }: { type: "ve" | "binance" | "euro"; active: boolean; color: string }) {
  if (type === "ve") {
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

  const fetchRates = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch("/api/rates");
      const data = await r.json() as any;
      const newRates: AllRates = {
        bcv:     data.bcv     && "rate" in data.bcv     ? data.bcv     : null,
        binance: data.binance && "rate" in data.binance ? data.binance : null,
        euro:    data.euro    && "rate" in data.euro    ? data.euro    : null,
      };
      setRates(prev => { prevRatesRef.current = prev; return newRates; });
      publishRates(newRates);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    fetchRates().then(() => {
      setRates(current => {
        if (!current.bcv || !current.binance || !current.euro) {
          setTimeout(() => fetchRates(true), 3000);
        }
        return current;
      });
    });
    binanceTimer.current = setInterval(() => fetchRates(true), 30_000);
    return () => {
      clearTimeout(t);
      if (binanceTimer.current) clearInterval(binanceTimer.current);
    };
  }, [fetchRates]);

  const handleRefresh = async () => {
    setSpinning(true);
    await fetchRates();
    setTimeout(() => setSpinning(false), 600);
  };

  const switchMode = (m: RateMode) => {
    if (m === mode) return;
    try { localStorage.setItem(RATE_MODE_KEY, m); } catch { }
    const alreadyLoaded = !!rates[m];
    if (!alreadyLoaded) setLoading(true);
    setFading(true);
    setTimeout(() => {
      setMode(m);
      setFading(false);
      fetchRates(!alreadyLoaded ? false : true);
    }, 160);
  };

  const fmt = (bs: number) =>
    bs >= 1000 ? bs.toLocaleString("es-VE", { maximumFractionDigits: 0 }) : bs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const calcBs  = currentRate && amount  && parseFloat(amount)  > 0 ? parseFloat(amount)  * currentRate : null;
  const calcFx  = currentRate && bsInput && parseFloat(bsInput) > 0 ? parseFloat(bsInput) / currentRate : null;

  const handleSwap = () => {
    setSwapAnim(true);
    setTimeout(() => setSwapAnim(false), 300);
    setCalcDir(d => d === "fwd" ? "inv" : "fwd");
    setAmount(""); setBsInput("");
  };

  const handleActivate = () => {
    if (!currentRate) return;
    try { localStorage.setItem("bcv_pinned_rate", String(currentRate)); } catch { }
    setActivated(true);
    setTimeout(() => navigate("/store"), 700);
  };

  const minutesAgo = rates[mode]?.minutesAgo ?? null;
  const updatedLabel = minutesAgo === null ? "Actualizando…" : minutesAgo === 0 ? "Justo ahora" : `Hace ${minutesAgo} min`;

  return (
    <section className="px-4 pb-10 max-w-2xl mx-auto w-full">
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(24px)",
          position: "relative",
          borderRadius: "28px",
          overflow: "hidden",
          background: "linear-gradient(150deg, rgba(8,12,28,0.98) 0%, rgba(4,8,20,0.96) 100%)",
          border: `1px solid ${cfg.glowDim}`,
          backdropFilter: "blur(28px)",
          boxShadow: `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px ${cfg.glowDim} inset`,
          transition: "all 0.55s ease",
        } as React.CSSProperties}
      >
        <div style={{ height: "3px", background: cfg.accentBand, transition: "background 0.25s ease" }} />

        {/* Header Widget */}
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${cfg.glowDim}`, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "13px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: cfg.colorB, border: `1px solid ${cfg.colorA}`,
              }}>
                {cfg.headerIcon === "bar"      && <BarChart2  style={{ width: "18px", height: "18px", color: cfg.color }} />}
                {cfg.headerIcon === "trend"    && <TrendingUp style={{ width: "18px", height: "18px", color: cfg.color }} />}
                {cfg.headerIcon === "landmark" && <Landmark   style={{ width: "18px", height: "18px", color: cfg.color }} />}
              </div>
              <div>
                <p style={{ color: "#fff", fontWeight: 800, fontSize: "15px", lineHeight: 1.2 }}>
                  CONVERSOR DE DIVISAS {/* CAMBIO: Mayúsculas */}
                </p>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px" }}>
                  Monitoreo oficial y P2P
                </p>
              </div>
            </div>
            <button onClick={handleRefresh} style={{ padding: "8px", borderRadius: "10px", background: "rgba(255,255,255,0.04)" }}>
              <RefreshCw style={{ width: "14px", height: "14px", color: "rgba(255,255,255,0.35)", transform: spinning ? "rotate(360deg)" : "rotate(0deg)", transition: spinning ? "transform 0.6s linear" : "none" }} />
            </button>
          </div>

          <div style={{ display: "flex", gap: "4px", padding: "4px", borderRadius: "16px", background: "rgba(255,255,255,0.04)" }}>
            {(["bcv", "binance", "euro"] as RateMode[]).map(m => {
              const active = m === mode;
              return (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1, padding: "8px 4px", borderRadius: "12px", fontWeight: 700, fontSize: "12px",
                    background: active ? MODE_CONFIG[m].colorB : "transparent",
                    color: active ? MODE_CONFIG[m].color : "rgba(255,255,255,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                  }}
                >
                  <ModeTabIcon type={MODE_CONFIG[m].tabIcon} active={active} color={MODE_CONFIG[m].color} />
                  <span>{MODE_CONFIG[m].label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rate Display */}
        <div style={{ padding: "18px 20px 22px", opacity: fading ? 0 : 1, transition: "opacity 0.16s ease" }}>
           <div style={{ textAlign: "right", marginBottom: "20px" }}>
              <p style={{ fontSize: "40px", fontWeight: 900, color: "#fff", textShadow: `0 0 28px ${cfg.glow}`, lineHeight: 1 }}>
                {currentRate ? currentRate.toLocaleString("es-VE", { minimumFractionDigits: 2 }) : "—"}
              </p>
              <p style={{ color: cfg.color, fontSize: "12px", fontWeight: 700 }}>Bs / {cfg.currency}</p>
           </div>

           {/* Calculadora compacta */}
           <div style={{ background: cfg.colorB, borderRadius: "20px", padding: "15px", border: `1px solid ${cfg.colorA}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                 <input
                    type="number"
                    placeholder={calcDir === "fwd" ? `Monto en ${cfg.currency}` : "Monto en Bs"}
                    value={calcDir === "fwd" ? amount : bsInput}
                    onChange={e => calcDir === "fwd" ? setAmount(e.target.value) : setBsInput(e.target.value)}
                    style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "10px", color: "#fff", fontSize: "14px", outline: "none" }}
                 />
                 <button onClick={handleSwap} style={{ padding: "10px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}>
                    <ArrowLeftRight className="w-4 h-4" style={{ color: cfg.color }} />
                 </button>
                 <div style={{ flex: 1, textAlign: "right" }}>
                    <p style={{ fontSize: "18px", fontWeight: 900, color: cfg.color }}>
                       {calcDir === "fwd" ? (calcBs ? fmt(calcBs) : "0,00") : (calcFx ? calcFx.toFixed(2) : "0,00")}
                    </p>
                    <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>{calcDir === "fwd" ? "Bolívares" : cfg.currency}</p>
                 </div>
              </div>
           </div>

           <button
            onClick={handleActivate}
            className="w-full mt-5 py-4 rounded-2xl font-bold text-white shadow-xl transition-all active:scale-[0.98]"
            style={{ background: cfg.gradient }}
           >
            Activar tasa {cfg.short} en Marketplace
           </button>
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
      <StickyRateBar />

      <header className="fixed top-0 inset-x-0 z-50 glass-nav border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="LinkServi" className="h-9 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/login")} className="text-sm font-medium text-muted-foreground hover:text-white px-4 py-2">Ingresar</button>
          <button onClick={() => navigate("/register")} className="text-sm font-semibold px-6 py-2.5 rounded-2xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all">Comenzar gratis</button>
        </div>
      </header>

      <main className="relative pt-32 pb-20 px-6 min-h-screen flex flex-col items-center">
        <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center w-full">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full glass border border-primary/20 text-primary text-xs font-bold tracking-widest uppercase">
            <Zap className="w-3.5 h-3.5" fill="currentColor" />
            ECOSISTEMA LINKSERVI
          </div>

          <h1 className="text-4xl sm:text-6xl font-black leading-[1.1] mb-5 tracking-tight text-white">
            ¿Qué necesitas <span className="text-primary">hoy</span>?
          </h1>

          <div className="w-full max-w-2xl mb-12 relative z-20">
            <GlobalSearchBar variant="hero" placeholder="Buscar servicios, tiendas, empleos..." className="w-full shadow-2xl" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl mb-12">
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <button
                  key={pillar.label}
                  onClick={() => navigate(pillar.action)}
                  className="group flex flex-col items-start gap-4 p-6 rounded-[28px] text-left transition-all hover:-translate-y-1 active:scale-[0.98]"
                  style={{ background: pillar.bg, border: `1px solid ${pillar.border}` }}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-black/20">
                    <Icon className="w-6 h-6" style={{ color: pillar.color }} />
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">{pillar.label}</p>
                    <p className="text-xs text-white/40 mt-1 leading-relaxed">{pillar.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <button onClick={() => setRateOpen(!rateOpen)} className="flex items-center gap-2 px-6 py-3 rounded-full glass border border-white/10 text-white/60 text-sm font-bold hover:text-white transition-all">
            <BarChart2 className="w-4 h-4" /> {rateOpen ? "Ocultar Tasas" : "Ver Conversor de Divisas"}
          </button>
        </div>

        {rateOpen && <div className="w-full mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500"><RateCard /></div>}
      </main>

      <footer className="border-t border-white/5 bg-black/60 backdrop-blur-md px-6 py-12">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-xs text-white/20">© {new Date().getFullYear()} LinkServi · Propiedad de Tartus Digital Solutions</p>
          <div className="flex gap-6">
            <button onClick={() => navigate("/terms")} className="text-xs text-white/40 hover:text-white">Términos</button>
            <button onClick={() => navigate("/privacy")} className="text-xs text-white/40 hover:text-white">Privacidad</button>
          </div>
        </div>
      </footer>
    </div>
  );
}