import { useEffect, useRef, useState } from "react";
import { useAcceptBooking, useRejectBooking } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MapPin, Zap, CheckCircle, XCircle, Bell, Clock, DollarSign } from "lucide-react";
import { getRequestOptions } from "@/lib/api";
import { type AlertBooking } from "@/hooks/useNewBookingAlert";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  booking: AlertBooking;
  queueLength: number;
  onDismiss: () => void;
}

export function NewBookingAlert({ booking, queueLength, onDismiss }: Props) {
  const opts = getRequestOptions();
  const [, navigate] = useLocation();
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const animatedDismiss = (cb: () => void) => {
    setVisible(false);
    setTimeout(() => { cb(); onDismiss(); }, 300);
  };

  const { mutate: accept } = useAcceptBooking({
    ...opts,
    mutation: {
      onSuccess: () => animatedDismiss(() => {}),
      onError: (err: any) => {
        const code = err?.response?.data?.code;
        if (code === "NO_AVATAR") {
          animatedDismiss(() => navigate("/profile/setup"));
        } else {
          setAccepting(false);
        }
      },
    },
  } as any);

  const { mutate: reject } = useRejectBooking({
    ...opts,
    mutation: {
      onSuccess: () => animatedDismiss(() => {}),
      onError: () => setRejecting(false),
    },
  } as any);

  const handleAccept = () => {
    setAccepting(true);
    accept({ bookingId: booking.id });
  };

  const handleReject = () => {
    setRejecting(true);
    reject({ bookingId: booking.id });
    animatedDismiss(() => {});
  };

  const desc = booking.isUrgent
    ? booking.description.replace("[URGENTE] ", "")
    : booking.description;

  const amount = booking.totalAmount ?? booking.clientBudget;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className={`relative w-full max-w-sm transition-all duration-300 ${visible ? "translate-y-0 scale-100" : "translate-y-6 scale-95"}`}
      >
        {/* Glow ring for urgent */}
        {booking.isUrgent && (
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-red-400 to-orange-400 blur-lg opacity-60 animate-pulse" />
        )}

        <div className={`relative rounded-3xl overflow-hidden shadow-2xl border-2 bg-card ${booking.isUrgent ? "border-red-400 dark:border-red-500" : "border-blue-400 dark:border-blue-500"}`}>

          {/* Header strip */}
          <div className={`px-5 py-4 flex items-center gap-3 ${booking.isUrgent ? "bg-gradient-to-r from-red-500 to-orange-500" : "bg-gradient-to-r from-blue-500 to-blue-600"}`}>
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/20 flex-shrink-0">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm leading-tight">
                {booking.isUrgent ? "⚡ Solicitud URGENTE" : "Nueva solicitud de servicio"}
              </p>
              <p className="text-white/75 text-xs mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3 flex-shrink-0" />
                {formatDistanceToNow(new Date(booking.createdAt), { addSuffix: true, locale: es })}
              </p>
            </div>
            {queueLength > 1 && (
              <span className="flex-shrink-0 bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                +{queueLength - 1} más
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4">
            {/* Service type */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Servicio</p>
              <p className="text-xl font-bold text-foreground">{booking.categoryName}</p>
            </div>

            {/* Info grid */}
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="text-sm font-semibold text-foreground">{booking.clientName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4 text-rose-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ubicación</p>
                  <p className="text-sm font-semibold text-foreground line-clamp-2">{booking.address}</p>
                </div>
              </div>

              {amount && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {booking.clientBudget && !booking.totalAmount ? "Oferta del cliente" : "Monto"}
                    </p>
                    <p className="text-sm font-bold text-emerald-600">${amount.toFixed(2)}</p>
                  </div>
                </div>
              )}

              {booking.isUrgent && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
                  <Zap className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs font-bold text-red-700 dark:text-red-400">Tarifa urgente aplicada (×1.5)</p>
                </div>
              )}
            </div>

            {/* Description preview */}
            {desc && (
              <p className="text-sm text-muted-foreground line-clamp-2 border-t border-border pt-3">
                {desc}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleReject}
                disabled={accepting || rejecting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-all disabled:opacity-50 active:scale-95"
              >
                <XCircle className="w-4 h-4" />
                {rejecting ? "..." : "Rechazar"}
              </button>
              <button
                onClick={handleAccept}
                disabled={accepting || rejecting}
                className={`flex-[1.8] flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50 active:scale-95 shadow-lg ${booking.isUrgent ? "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-red-200 dark:shadow-red-900/40" : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-200 dark:shadow-blue-900/40"}`}
              >
                <CheckCircle className="w-5 h-5" />
                {accepting ? "Aceptando..." : "Aceptar trabajo"}
              </button>
            </div>

            {/* Dismiss link */}
            <button
              onClick={() => animatedDismiss(() => {})}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Ver más tarde
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
