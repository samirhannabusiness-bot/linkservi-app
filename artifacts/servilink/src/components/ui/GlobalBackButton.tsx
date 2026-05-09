import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

const HIDE_ROUTES = new Set<string>([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/profile/setup",
  "/client",
  "/professional",
  "/admin",
  "/cohost",
  "/seller",
  "/ganar-dinero",
  "/search",
  "/verification",
]);

function fallbackHome(loc: string): string {
  if (loc.startsWith("/admin")) return "/admin";
  if (loc.startsWith("/professional")) return "/professional";
  if (loc.startsWith("/cohost")) return "/cohost";
  if (loc.startsWith("/seller")) return "/seller";
  if (loc.startsWith("/client")) return "/client";
  if (loc.startsWith("/jobs")) return "/jobs";
  if (loc.startsWith("/store") || loc.startsWith("/stores")) return "/store";
  return "/";
}

export function GlobalBackButton() {
  const [location, navigate] = useLocation();

  if (HIDE_ROUTES.has(location)) return null;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate(fallbackHome(location));
    }
  };

  return (
    <button
      onClick={handleBack}
      aria-label="Volver"
      className="md:hidden fixed z-[300] flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-95"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        left: "4.25rem",
        background: "rgba(4, 12, 26, 0.85)",
        border: "1px solid rgba(56, 189, 248, 0.22)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      }}
    >
      <ArrowLeft className="w-5 h-5" style={{ color: "rgba(255,255,255,0.92)" }} />
    </button>
  );
}
