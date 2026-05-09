import { useState, useEffect } from "react";
import { X, Share, Download } from "lucide-react";

const DISMISSED_KEY = "install_banner_dismissed_until";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function InstallBanner() {
  const [show, setShow]       = useState(false);
  const [isIos, setIsIos]     = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Already installed as PWA — never show
    if (isInStandalone()) return;

    // Dismissed recently — wait until expiry
    try {
      const until = localStorage.getItem(DISMISSED_KEY);
      if (until && Date.now() < parseInt(until)) return;
    } catch { /* blocked */ }

    const ios = isIOS();
    setIsIos(ios);

    if (ios) {
      // iOS: show manual instructions after 2 s
      const t = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(t);
    } else {
      // Android / Desktop Chrome: wait for native prompt event
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShow(true);
      };
      window.addEventListener("beforeinstallprompt", handler as any);
      return () => window.removeEventListener("beforeinstallprompt", handler as any);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      // Don't show again for 7 days
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch { /* blocked */ }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstalling(false);
    if (outcome === "accepted") setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "80px",
      left: "12px",
      right: "12px",
      zIndex: 9999,
      borderRadius: "20px",
      background: "rgba(8,12,28,0.97)",
      border: "1px solid rgba(6,182,212,0.22)",
      backdropFilter: "blur(24px)",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(6,182,212,0.08) inset",
      padding: "16px",
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
      animation: "slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)",
    }}>
      {/* App icon */}
      <div style={{
        width: "48px", height: "48px", borderRadius: "14px", flexShrink: 0,
        background: "linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 18px rgba(6,182,212,0.40)",
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" strokeWidth="1.5" stroke="white" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Text + action */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#ffffff", fontWeight: 800, fontSize: "14px", marginBottom: "2px", lineHeight: 1.3 }}>
          Instala LinkServi
        </p>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", fontWeight: 500, lineHeight: 1.4, marginBottom: "12px" }}>
          {isIos
            ? <>Toca <Share style={{ width: "11px", height: "11px", display: "inline", verticalAlign: "middle" }} /> y luego <strong style={{ color: "rgba(255,255,255,0.65)" }}>"Agregar a pantalla de inicio"</strong></>
            : "Acceso rápido desde tu pantalla de inicio, sin app store."
          }
        </p>

        {!isIos && (
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "12px",
              background: "linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)",
              color: "#fff", fontWeight: 700, fontSize: "12px",
              border: "none", cursor: "pointer",
              boxShadow: "0 4px 14px rgba(6,182,212,0.35)",
              opacity: installing ? 0.7 : 1,
              transition: "opacity 0.2s, transform 0.15s",
            }}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.96)")}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            <Download style={{ width: "12px", height: "12px" }} />
            {installing ? "Instalando…" : "Instalar app"}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{
          flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
          cursor: "pointer", color: "rgba(255,255,255,0.35)",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
      >
        <X style={{ width: "13px", height: "13px" }} />
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
