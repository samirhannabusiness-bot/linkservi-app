import { useState } from "react";
import { useLocation } from "wouter";
import { Zap, Wrench, Package, Briefcase, X } from "lucide-react";

const OPTIONS = [
  {
    label: "Servicios",
    icon: Wrench,
    href: "/workers",
    gradient: "linear-gradient(135deg,#06B6D4,#0891B2)",
    glow: "rgba(6,182,212,0.35)",
  },
  {
    label: "ServiRent",
    icon: Package,
    href: "/store",
    gradient: "linear-gradient(135deg,#8B5CF6,#7C3AED)",
    glow: "rgba(139,92,246,0.35)",
  },
  {
    label: "Bolsa de Empleo",
    icon: Briefcase,
    href: "/jobs",
    gradient: "linear-gradient(135deg,#F59E0B,#D97706)",
    glow: "rgba(245,158,11,0.35)",
  },
];

// Pages where the FAB should not appear (has its own bottom nav or sidebar-only pages)
const HIDDEN_ON = ["/mensajes", "/admin", "/jobs/chat", "/jobs/conversations"];

export function MobileFAB() {
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();

  // Hide on desktop and on specific routes
  const shouldHide = HIDDEN_ON.some(p => location === p || location.startsWith(p + "/"));
  if (shouldHide) return null;

  const toggle = () => setOpen(v => !v);

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[44] md:hidden"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Speed-dial container — above MobileNav (z-45) */}
      <div className="fixed bottom-[72px] right-4 z-[45] md:hidden flex flex-col items-end gap-3">
        {/* Options — animate from bottom */}
        {open && OPTIONS.map((opt, i) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.href}
              onClick={() => go(opt.href)}
              className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-lg transition-all active:scale-95"
              style={{
                background: "rgba(15,15,25,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: `0 4px 24px ${opt.glow}, 0 1px 4px rgba(0,0,0,0.6)`,
                animation: `fabOption ${0.15 + i * 0.06}s cubic-bezier(0.34,1.56,0.64,1) both`,
              }}
            >
              <span
                className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ background: opt.gradient }}
              >
                <Icon className="w-4 h-4 text-white" strokeWidth={2.2} />
              </span>
              <span className="text-sm font-semibold text-white whitespace-nowrap pr-1">
                {opt.label}
              </span>
            </button>
          );
        })}

        {/* Main trigger button */}
        <button
          onClick={toggle}
          className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-90"
          style={{
            background: open
              ? "rgba(255,255,255,0.1)"
              : "linear-gradient(135deg,#06B6D4,#2563EB)",
            boxShadow: open
              ? "0 2px 12px rgba(0,0,0,0.4)"
              : "0 4px 20px rgba(6,182,212,0.5), 0 1px 4px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.15)",
            transform: open ? "rotate(45deg)" : "none",
            transition: "all 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          }}
          aria-label="Explorar"
        >
          {open
            ? <X className="w-5 h-5 text-white" />
            : <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          }
        </button>
      </div>

      <style>{`
        @keyframes fabOption {
          from { opacity: 0; transform: translateY(12px) scale(0.88); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </>
  );
}
