import { useState, useEffect, useCallback } from "react";
import { Download, X, Smartphone, Bell, CheckCircle, Share } from "lucide-react";
import { requestPushPermission, getPushPermission, isPushSupported } from "@/lib/push";
import { useAuth } from "@/lib/auth-context";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa_install_dismissed_until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true ||
    window.__slPwaInstalled === true
  );
}

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch {
    return false;
  }
}

export function PWAInstallPrompt() {
  const { user } = useAuth();
  const [showInstall, setShowInstall] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [iosFallback, setIosFallback] = useState(false);

  // ── Install prompt: read from window (captured early in main.tsx) ─────────
  useEffect(() => {
    if (isStandalone()) return;
    if (isDismissed()) return;

    // Always wire up listeners first (so a background install or late event
    // doesn't slip past us when the prompt was already pending).
    const onReady = () => setShowInstall(true);
    const onInstalled = () => setShowInstall(false);
    window.addEventListener("sl:install-prompt-ready", onReady);
    window.addEventListener("sl:installed", onInstalled);

    // Native prompt already captured (Android / Desktop Chrome): show now.
    if (window.__slDeferredInstallPrompt) {
      setShowInstall(true);
    }

    // iOS Safari never fires `beforeinstallprompt` — show manual instructions
    // after a short delay so users on iPhone/iPad still get an install hint.
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS()) {
      iosTimer = setTimeout(() => {
        setIosFallback(true);
        setShowInstall(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener("sl:install-prompt-ready", onReady);
      window.removeEventListener("sl:installed", onInstalled);
      if (iosTimer !== null) clearTimeout(iosTimer);
    };
  }, []);

  // ── Push prompt — unchanged ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (!isPushSupported()) return;
    const dismissed = !!localStorage.getItem("push_prompt_dismissed");
    if (dismissed) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    getPushPermission().then((perm) => {
      if (perm === "default") {
        timerId = setTimeout(() => setShowPush(true), 3500);
      }
    });

    return () => {
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [user]);

  const dismissInstall = useCallback(() => {
    setShowInstall(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch { /* private mode — no-op */ }
  }, []);

  const handleInstall = useCallback(async () => {
    const evt = window.__slDeferredInstallPrompt;
    if (!evt) {
      // No native event (iOS or event not yet fired). On iOS the user has
      // to manually use Share → Add to Home Screen, which is already shown.
      return;
    }
    setInstalling(true);
    try {
      await evt.prompt();
      const result = await evt.userChoice;
      // Whether the user accepted or dismissed the *native* prompt, the
      // browser will not let us call prompt() again on this event. Hide the
      // banner in both cases — leaving it visible after a "Cancel" would
      // produce a button that does nothing on subsequent clicks.
      setShowInstall(false);
      if (result.outcome === "dismissed") {
        // Apply the 7-day cooldown so we don't nag the user again right away.
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
        } catch { /* private mode — no-op */ }
      }
      // On accepted, the browser fires `appinstalled` which our listener
      // already handles to clear state.
    } catch {
      // prompt() threw — hide the banner anyway, the event is now spent.
      setShowInstall(false);
    } finally {
      // The prompt can only be used once — drop the reference.
      window.__slDeferredInstallPrompt = null;
      setInstalling(false);
    }
  }, []);

  const handleEnablePush = useCallback(async () => {
    const ok = await requestPushPermission();
    if (ok) {
      setPushSuccess(true);
      setTimeout(() => {
        setShowPush(false);
        setPushSuccess(false);
      }, 2000);
    } else {
      setShowPush(false);
    }
    localStorage.setItem("push_prompt_dismissed", "1");
  }, []);

  const dismissPush = useCallback(() => {
    setShowPush(false);
    localStorage.setItem("push_prompt_dismissed", "1");
  }, []);

  if (!showInstall && !showPush) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50">
      {showInstall && (
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 mb-2 animate-in slide-in-from-bottom-4" data-testid="pwa-install-banner">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground text-sm">Instalar LinkServi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {iosFallback ? (
                  <>
                    Toca <Share className="w-3 h-3 inline align-middle" /> y luego{" "}
                    <strong className="text-foreground/80">"Añadir a pantalla de inicio"</strong>
                  </>
                ) : (
                  <>Agrégala a tu pantalla de inicio. Sin Play Store, sin App Store.</>
                )}
              </p>
            </div>
            <button onClick={dismissInstall} className="text-muted-foreground hover:text-foreground flex-shrink-0" data-testid="button-dismiss-install" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
          {!iosFallback && (
            <div className="flex gap-2 mt-3">
              <button onClick={dismissInstall} className="flex-1 py-2 rounded-xl border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors">
                Ahora no
              </button>
              <button
                onClick={handleInstall}
                disabled={installing}
                data-testid="button-install-pwa"
                className="flex-1 py-2 rounded-xl bg-cyan-400 text-slate-900 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-cyan-300 transition-colors disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" /> {installing ? "Instalando…" : "Instalar"}
              </button>
            </div>
          )}
        </div>
      )}

      {showPush && (
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-4">
          {pushSuccess ? (
            <div className="flex items-center gap-3 py-1">
              <CheckCircle className="w-6 h-6 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground text-sm">¡Notificaciones activadas!</p>
                <p className="text-xs text-muted-foreground">Te avisaremos sobre tus servicios y mensajes.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-sm">Activar notificaciones</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Recibe alertas cuando acepten tu servicio, llegue un mensaje o confirmen tu pago.
                  </p>
                </div>
                <button onClick={dismissPush} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={dismissPush} className="flex-1 py-2 rounded-xl border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors">
                  No, gracias
                </button>
                <button onClick={handleEnablePush} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1 hover:bg-primary/90 transition-colors">
                  <Bell className="w-3.5 h-3.5" /> Activar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
