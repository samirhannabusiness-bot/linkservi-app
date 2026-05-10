import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import { useAuth, type AppMode } from "@/lib/auth-context";
import { getModeMeta, MODE_META } from "@/lib/mode-meta";
import { toast } from "@/hooks/use-toast";

const GESTOR_ONBOARDING_KEY_PREFIX = "linkservi:gestor-onboarded:";

// ── ModeSwitch ───────────────────────────────────────────────────────────────
// Pill toggle in the header that lets a user flip between the modes they
// actually have. Each tab is tinted with its mode's accent color so the active
// mode is obvious at a glance.
//
// Renders dynamically: only modes the user actually has are shown. Cliente is
// always available; Profesional / Gestor / Conductor appear when the user has
// the corresponding role. localStorage already persists the active mode (via
// setAppMode in auth-context); a fallback effect there forces back to Cliente
// if the user loses a role.
//
// First time the user enters Gestor mode we show a one-shot welcome toast.
export function ModeSwitch() {
  const { user, isManager, isWorker, isDriver, appMode, setAppMode, setActiveMode } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) return null;
  // Cliente puro (sin roles extra): mostramos un solo botón "+ Activar rol"
  // que lleva al dashboard donde están las tarjetas de Profesional / Conductor /
  // Tienda. Esto garantiza que el usuario SIEMPRE vea cómo activar otro rol
  // sin tener que navegar a un menú escondido.
  const isClientOnly = !isManager && !isWorker && !isDriver;
  if (isClientOnly) {
    return (
      <button
        type="button"
        onClick={() => setLocation("/client?activate=1")}
        data-testid="mode-switch-activate"
        title="Activar otro rol en tu cuenta"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: 700,
          color: "#06b6d4",
          background: "rgba(6,182,212,0.08)",
          border: "1px solid rgba(6,182,212,0.35)",
          cursor: "pointer",
          transition: "background 0.18s ease, border-color 0.18s ease",
        }}
      >
        <Plus style={{ width: 14, height: 14 }} />
        Activar otro rol
      </button>
    );
  }

  const syncActiveModeFor = (mode: AppMode) => {
    if (!user) return;
    if (mode === "worker") {
      setActiveMode(user.role === "worker" ? "primary" : "secondary");
    } else if (mode === "client") {
      setActiveMode(user.role === "client" ? "primary" : "secondary");
    }
  };

  const showGestorOnboardingIfNeeded = () => {
    try {
      if (typeof window === "undefined" || !user) return;
      // Namespace per-user so a shared device doesn't suppress onboarding for
      // other accounts on the same browser.
      const key = `${GESTOR_ONBOARDING_KEY_PREFIX}${user.id}`;
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
      const meta = MODE_META.manager;
      toast({
        title: `Bienvenido al Modo ${meta.label}`,
        description: meta.description,
        duration: 6000,
      });
    } catch {
      // localStorage may be unavailable (private mode) — no-op.
    }
  };

  const select = (mode: AppMode, dest: string) => {
    if (appMode === mode) return;
    setAppMode(mode);
    syncActiveModeFor(mode);
    if (mode === "manager") showGestorOnboardingIfNeeded();
    setLocation(dest);
  };

  const baseTab: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    transition: "background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease",
  };
  const styleFor = (mode: AppMode, active: boolean): React.CSSProperties => {
    const meta = getModeMeta(mode);
    return {
      ...baseTab,
      color: active ? meta.textOnAccent : "#94a3b8",
      background: active ? meta.accent : "transparent",
      boxShadow: active ? `0 0 0 1px ${meta.ring}, 0 4px 14px ${meta.glow}` : "none",
    };
  };

  const renderTab = (mode: AppMode, dest: string) => {
    const meta = getModeMeta(mode);
    const Icon = meta.icon;
    const active = appMode === mode;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={`Modo ${meta.label}: ${meta.description}`}
        title={meta.description}
        onClick={() => select(mode, dest)}
        data-testid={`mode-switch-${mode}`}
        style={styleFor(mode, active)}
      >
        <Icon style={{ width: 14, height: 14 }} />
        {meta.label}
      </button>
    );
  };

  return (
    <div
      role="tablist"
      aria-label="Cambiar modo"
      style={{
        display: "inline-flex",
        gap: "2px",
        padding: "3px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
      data-testid="mode-switch"
    >
      {renderTab("client", MODE_META.client.home)}
      {isWorker && renderTab("worker", MODE_META.worker.home)}
      {isManager && renderTab("manager", MODE_META.manager.home)}
      {isDriver && renderTab("driver", MODE_META.driver.home)}
    </div>
  );
}
