import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

document.getElementById("seo-content")?.remove();

// ── PWA install prompt — capture as early as possible ──────────────────────
// `beforeinstallprompt` only fires once per page load. If we wait until a
// React component mounts to attach the listener, we can lose the event when
// the browser fires it before hydration. Capture it on `window` here so the
// install button works no matter when the UI mounts.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
declare global {
  interface Window {
    __slDeferredInstallPrompt: BeforeInstallPromptEvent | null;
    __slPwaInstalled: boolean;
  }
}
window.__slDeferredInstallPrompt = null;
window.__slPwaInstalled =
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (window.navigator as any).standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__slDeferredInstallPrompt = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event("sl:install-prompt-ready"));
});

window.addEventListener("appinstalled", () => {
  window.__slDeferredInstallPrompt = null;
  window.__slPwaInstalled = true;
  window.dispatchEvent(new Event("sl:installed"));
});

createRoot(document.getElementById("root")!).render(<App />);

// Service Worker: solo se registra en producción. En desarrollo lo dejamos
// apagado para evitar que cachee bundles viejos y esconda cambios recientes.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const { registerSW } = await import("virtual:pwa-register");
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          updateSW(true);
        },
        onOfflineReady() {
          // PWA ready — no user-visible action needed
        },
      });
    } catch (e) {
      console.warn("[PWA] Service worker registration skipped:", e);
    }
  });
}
