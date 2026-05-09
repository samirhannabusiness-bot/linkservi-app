import { useState, useEffect, useRef } from "react";
import { getSharedRates, subscribeRates, type SharedRates } from "@/lib/sharedRates";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: number) {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function scrollToRates() {
  const el = document.getElementById("rates-section");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Sticky mini-bar (mobile only) ─────────────────────────────────────────────

export function StickyRateBar() {
  const [rates, setRates]       = useState<SharedRates>(getSharedRates);
  const [visible, setVisible]   = useState(false);
  const [hidden, setHidden]     = useState(false);   // user reached card → auto-hide
  const [entered, setEntered]   = useState(false);   // has scrolled to card

  // Subscribe to live rate updates from RateCard
  useEffect(() => subscribeRates(setRates), []);

  // Show after 2 s on mobile
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Hide when RateCard is in viewport (user found it)
  useEffect(() => {
    const el = document.getElementById("rates-section");
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !entered) {
          setEntered(true);
          setTimeout(() => setHidden(true), 800); // small delay so user sees it found
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [entered]);

  const bcv     = rates.bcv?.rate;
  const binance = rates.binance?.rate;

  // Only render on mobile — CSS hides on desktop
  const show = visible && !hidden;

  return (
    <div
      aria-hidden={!show}
      style={{
        position: "fixed",
        bottom: "72px",         // above the FAB/nav
        left: "12px",
        right: "12px",
        zIndex: 998,
        opacity:   show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(16px)",
        pointerEvents: show ? "auto" : "none",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
      // Only visible on mobile (<768px)
      className="md:hidden"
    >
      <button
        onClick={scrollToRates}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderRadius: "18px",
          background: "rgba(8,12,28,0.92)",
          border: "1px solid rgba(6,182,212,0.18)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(6,182,212,0.06) inset",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Left: rates */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* BCV */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em" }}>
              BCV
            </span>
            <span style={{ color: "#22d3ee", fontSize: "13px", fontWeight: 900, letterSpacing: "-0.02em" }}>
              {bcv ? fmt2(bcv) : "—"} <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px", fontWeight: 600 }}>Bs</span>
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.07)" }} />

          {/* Binance */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em" }}>
              BINANCE
            </span>
            <span style={{ color: "#FCD535", fontSize: "13px", fontWeight: 900, letterSpacing: "-0.02em" }}>
              {binance ? fmt2(binance) : "—"} <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px", fontWeight: 600 }}>Bs</span>
            </span>
          </div>

          {/* Live dot */}
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 6px rgba(52,211,153,0.8)",
            flexShrink: 0,
          }} />
        </div>

        {/* Right: CTA */}
        <div style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "6px 12px", borderRadius: "12px",
          background: "rgba(6,182,212,0.14)", border: "1px solid rgba(6,182,212,0.22)",
          color: "#22d3ee", fontSize: "11px", fontWeight: 700,
          flexShrink: 0,
        }}>
          Ver tasas
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
    </div>
  );
}

// ── Scroll hint — below hero buttons ─────────────────────────────────────────

export function ScrollHint() {
  const [show, setShow]       = useState(true);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 60) {
        setShow(false);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Also hide after 8 s if user hasn't scrolled
    timerRef.current = setTimeout(() => setShow(false), 8000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    // Only on mobile
    <div
      className="md:hidden"
      onClick={scrollToRates}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
        padding: "10px 0 2px",
        cursor: "pointer",
        opacity: show ? 1 : 0,
        transition: "opacity 0.4s ease",
        pointerEvents: show ? "auto" : "none",
        userSelect: "none",
      }}
    >
      <span style={{
        color: "rgba(34,211,238,0.55)", fontSize: "11px", fontWeight: 600,
        letterSpacing: "0.02em",
      }}>
        Consulta la tasa del dólar en tiempo real
      </span>
      {/* Bouncing arrow */}
      <span style={{
        color: "rgba(34,211,238,0.55)", fontSize: "13px",
        display: "inline-block",
        animation: "bounceDown 1.4s ease-in-out infinite",
      }}>↓</span>
      <style>{`
        @keyframes bounceDown {
          0%, 100% { transform: translateY(0);   opacity: 0.55; }
          50%       { transform: translateY(4px); opacity: 1;    }
        }
      `}</style>
    </div>
  );
}
