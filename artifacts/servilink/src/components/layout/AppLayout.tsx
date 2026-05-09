import { type ReactNode, useRef, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { MobileFAB } from "./MobileFAB";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { CartButton } from "@/components/cart/CartButton";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ModeSwitch } from "@/components/ModeSwitch";
import { VerifyEmailCard } from "@/components/VerifyEmailCard";
import { useAuth } from "@/lib/auth-context";
import { useNewBookingAlert } from "@/hooks/useNewBookingAlert";
import { NewBookingAlert } from "@/components/ui/NewBookingAlert";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useSidebarCompact } from "@/contexts/SidebarContext";
import { toast } from "@/hooks/use-toast";
import { disconnectSocket } from "@/lib/socket";

// ── iOS-style spring — feels physical, has weight ────────────────────────────
const ENTER_SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 26,
  mass: 0.85,
};

// ── Exit is fast — the previous screen "recedes" quickly ─────────────────────
const EXIT_TRANSITION = {
  duration: 0.13,
  ease: [0.4, 0, 1, 1] as [number, number, number, number],
};

function WorkerAlertLayer() {
  const { current, queueLength, dismissFirst } = useNewBookingAlert(true);
  if (!current) return null;
  return (
    <NewBookingAlert
      key={current.id}
      booking={current}
      queueLength={queueLength}
      onDismiss={dismissFirst}
    />
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isWorker = user?.role === "worker";
  const { compact } = useSidebarCompact();
  const [location, navigate] = useLocation();

  // ── Socket global event listeners ──────────────────────────────────────────
  useEffect(() => {
    function onSessionExpired() {
      disconnectSocket();
      toast({
        title: "Sesión expirada",
        description: "Inicia sesión nuevamente para continuar.",
        variant: "destructive",
      });
      navigate("/auth/login");
    }

    function onReconnectFailed() {
      toast({
        title: "Sin conexión",
        description: "No se pudo reconectar. Verifica tu conexión a internet.",
        variant: "destructive",
      });
    }

    window.addEventListener("socket:session-expired", onSessionExpired);
    window.addEventListener("socket:reconnect-failed", onReconnectFailed);
    return () => {
      window.removeEventListener("socket:session-expired", onSessionExpired);
      window.removeEventListener("socket:reconnect-failed", onReconnectFailed);
    };
  }, [navigate]);

  // ── Navigation direction — forward slides from right, back from left ─────
  const prevLocationRef = useRef(location);
  const dirRef = useRef<1 | -1>(1);

  if (location !== prevLocationRef.current) {
    const prevDepth = prevLocationRef.current.split("/").filter(Boolean).length;
    const nextDepth = location.split("/").filter(Boolean).length;
    // Same-level navigations (e.g. /client → /worker) count as forward
    dirRef.current = nextDepth >= prevDepth ? 1 : -1;
    prevLocationRef.current = location;
  }

  const dir = dirRef.current;

  return (
    <div className="flex min-h-dvh overflow-x-hidden bg-background dark:bg-transparent">
      <Sidebar />
      <main
        className="flex-1 md:pb-8 md:px-8 md:pt-8 overflow-x-hidden w-full min-w-0"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.75rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)",
        }}
        data-compact={compact ? "1" : "0"}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location}
            className="px-4 md:px-0 w-full"
            // Enter: slides in from the side + springs into place
            initial={{
              opacity: 0,
              x: dir * 46,
              scale: 0.97,
            }}
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
              transition: ENTER_SPRING,
            }}
            // Exit: recedes quickly — gives the "depth layer" feel
            exit={{
              opacity: 0,
              x: dir * -28,
              scale: 0.95,
              transition: EXIT_TRANSITION,
            }}
          >
            <VerifyEmailCard />
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <MobileNav />
      <MobileFAB />
      {isWorker && <WorkerAlertLayer />}

      {/* ── Top-right: mode switch (gestor) + notification bell + cart ── */}
      <div
        className="fixed right-4 z-[300] flex items-center gap-2"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <ModeSwitch />
        <NotificationBell />
        <CartButton />
      </div>

      {/* ── Cart drawer (slide-over) — global so it works from any page ── */}
      <CartDrawer />
    </div>
  );
}
