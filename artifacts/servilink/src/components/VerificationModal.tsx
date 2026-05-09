import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, ShieldCheck, Sparkles } from "lucide-react";
import type { VerificationErrorPayload } from "@/lib/api";

const DEDUP_MS = 4000;
const SNOOZE_KEY = "sl_verif_snooze_until";
const RETURN_TO_KEY = "sl_verify_return_to";

export function VerificationModal(): React.ReactElement | null {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<VerificationErrorPayload | null>(null);
  const lastShownAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    function onVerificationRequired(e: Event) {
      const detail = (e as CustomEvent<VerificationErrorPayload>).detail;
      if (!detail) return;

      // Snooze: si el usuario ya hizo clic "Más tarde" en esta sesión, no
      // re-abrimos el modal hasta que pase el cooldown.
      const snoozeUntil = Number(sessionStorage.getItem(SNOOZE_KEY) ?? 0);
      if (snoozeUntil > Date.now()) return;

      // Si el usuario ya está en la ruta destino, no abrimos modal redundante
      const href = detail.action?.href ?? "/verify-email";
      if (typeof window !== "undefined" && window.location.pathname === href) return;

      // Dedup
      const now = Date.now();
      const last = lastShownAtRef.current[detail.code] ?? 0;
      if (now - last < DEDUP_MS) return;
      lastShownAtRef.current[detail.code] = now;

      setPayload(detail);
      setOpen(true);
    }
    window.addEventListener("sl:verification-required", onVerificationRequired);
    return () => window.removeEventListener("sl:verification-required", onVerificationRequired);
  }, []);

  if (!payload) return null;

  const isProfile = payload.code === "PROFILE_INCOMPLETE";
  const title = isProfile ? "Completa tu perfil" : "Verifica tu cuenta";
  const subtitle = isProfile
    ? "Necesitamos algunos datos extra para que puedas continuar."
    : "Esto nos permite proteger tus pagos y mantener la plataforma segura.";
  const ctaLabel = payload.action?.label ?? "Verificar ahora";
  const ctaHref = payload.action?.href ?? "/verify-email";

  function handleVerifyNow() {
    // Recordamos la ruta actual para volver después del éxito
    try { sessionStorage.setItem(RETURN_TO_KEY, window.location.pathname + window.location.search); } catch {}
    setOpen(false);
    navigate(ctaHref);
  }

  function handleLater() {
    // Snooze por 5 minutos: el usuario sigue navegando sin re-popups.
    try { sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + 5 * 60 * 1000)); } catch {}
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleLater(); }}>
      <DialogContent className="max-w-md" data-testid="verification-modal">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-sky-400/10 flex items-center justify-center mb-3">
            {isProfile ? <Sparkles className="w-7 h-7 text-sky-400" /> : <ShieldCheck className="w-7 h-7 text-sky-400" />}
          </div>
          <DialogTitle className="text-center text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-center text-sm pt-1">
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        {!isProfile && (
          <div className="space-y-2 text-sm text-white/70 px-2">
            <p className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              Protegemos tu cuenta y evitamos fraudes.
            </p>
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-sky-400 shrink-0" />
              Toma menos de 10 segundos.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            onClick={handleVerifyNow}
            className="w-full"
            data-testid="button-verify-now"
          >
            {ctaLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleLater}
            className="w-full text-white/60 hover:text-white"
            data-testid="button-verify-later"
          >
            Más tarde
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
