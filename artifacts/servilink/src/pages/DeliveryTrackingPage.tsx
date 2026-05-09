import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import {
  Truck, MapPin, Phone, User, Package, CheckCircle,
  Clock, X, ArrowLeft, Loader2, AlertTriangle, RefreshCw
} from "lucide-react";

interface DeliveryRequest {
  id: number;
  productName: string;
  productImage?: string | null;
  status: string;
  dropoffAddress: string;
  pickupAddress?: string | null;
  deliveryFeeUsd: number;
  currentRadiusKm: number;
  createdAt: string;
  assignedAt?: string | null;
  driver?: {
    id: number;
    name: string;
    phone?: string | null;
    avatarUrl?: string | null;
  } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; step: number }> = {
  searching:  { label: "Buscando repartidor...", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", icon: <Loader2 className="w-6 h-6 animate-spin" />, step: 1 },
  assigned:   { label: "Repartidor asignado",   color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: <User className="w-6 h-6" />,             step: 2 },
  picked_up:  { label: "Pedido recogido",        color: "#8b5cf6", bg: "rgba(139,92,246,0.12)",  icon: <Package className="w-6 h-6" />,          step: 3 },
  in_transit: { label: "En camino hacia ti",     color: "#06b6d4", bg: "rgba(6,182,212,0.12)",   icon: <Truck className="w-6 h-6" />,             step: 4 },
  delivered:  { label: "¡Pedido entregado!",     color: "#34d399", bg: "rgba(52,211,153,0.12)",  icon: <CheckCircle className="w-6 h-6" />,       step: 5 },
  cancelled:  { label: "Delivery cancelado",     color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: <X className="w-6 h-6" />,                  step: 0 },
  expired:    { label: "Sin repartidores disponibles", color: "#6b7280", bg: "rgba(107,114,128,0.12)", icon: <AlertTriangle className="w-6 h-6" />, step: 0 },
};

const STEPS = [
  { key: "searching",  label: "Buscando" },
  { key: "assigned",   label: "Asignado" },
  { key: "picked_up",  label: "Recogido" },
  { key: "in_transit", label: "En camino" },
  { key: "delivered",  label: "Entregado" },
];

export function DeliveryTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const [request, setRequest] = useState<DeliveryRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchRequest = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/delivery/requests/${id}`, { headers: getAuthHeader() });
      if (!res.ok) return;
      const data = await res.json();
      setRequest(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [id, token]);

  useEffect(() => {
    fetchRequest();
    const interval = setInterval(fetchRequest, 5000);
    return () => clearInterval(interval);
  }, [fetchRequest]);

  const handleCancel = async () => {
    if (!confirm("¿Cancelar esta solicitud?")) return;
    setCancelling(true);
    await fetch(`/api/delivery/requests/${id}/cancel`, {
      method: "POST",
      headers: getAuthHeader(),
    });
    await fetchRequest();
    setCancelling(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">Solicitud no encontrada</p>
        <button onClick={() => navigate("/store")} className="btn-gradient text-white px-6 py-2.5 rounded-xl text-sm font-bold">
          Ir al marketplace
        </button>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.searching;
  const currentStep = cfg.step;
  const isTerminal = ["delivered", "cancelled", "expired"].includes(request.status);
  const canCancel  = ["searching", "assigned"].includes(request.status);

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto space-y-4 pb-10">
      {/* Back */}
      <button onClick={() => navigate("/store")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2">
        <ArrowLeft className="w-4 h-4" /> Volver al marketplace
      </button>

      {/* Status card */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}33`, color: cfg.color }}>
            {cfg.icon}
          </div>
          <div className="flex-1">
            <p className="text-base font-black text-foreground">{cfg.label}</p>
            <p className="text-xs text-muted-foreground line-clamp-1">{request.productName}</p>
          </div>
          <button onClick={fetchRequest} className="p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        {!isTerminal && (
          <div className="space-y-2">
            <div className="flex justify-between">
              {STEPS.map((s, i) => {
                const isActive = i + 1 === currentStep;
                const isDone   = i + 1 < currentStep;
                return (
                  <div key={s.key} className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all"
                      style={{
                        background: isDone ? "#34d399" : isActive ? cfg.color : "rgba(255,255,255,0.08)",
                        color: isDone || isActive ? "#fff" : "rgba(255,255,255,0.3)",
                      }}>
                      {isDone ? "✓" : i + 1}
                    </div>
                    <span className="text-[9px] text-center leading-tight"
                      style={{ color: isActive ? cfg.color : "rgba(255,255,255,0.3)" }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="relative h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="absolute left-0 top-0 h-1 rounded-full transition-all duration-700"
                style={{ width: `${Math.max(0, ((currentStep - 1) / 4) * 100)}%`, background: cfg.color }} />
            </div>
          </div>
        )}

        {/* Searching: radius info */}
        {request.status === "searching" && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              Buscando en un radio de {request.currentRadiusKm} km. El radio se amplía automáticamente si no hay respuesta.
            </p>
          </div>
        )}
      </div>

      {/* Driver card */}
      {request.driver && (
        <div className="glass rounded-2xl p-4 flex items-center gap-4"
          style={{ border: "1px solid rgba(59,130,246,0.2)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
            {request.driver.avatarUrl ? (
              <img src={request.driver.avatarUrl} alt={request.driver.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5" style={{ color: "#3b82f6" }} />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">{request.driver.name}</p>
            <p className="text-xs text-muted-foreground">Tu repartidor</p>
          </div>
          {request.driver.phone && (
            <a href={`tel:${request.driver.phone}`}
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
              <Phone className="w-4 h-4" style={{ color: "#34d399" }} />
            </a>
          )}
        </div>
      )}

      {/* Delivery info */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Detalles del envío</p>

        {request.pickupAddress && (
          <div className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#8b5cf6" }} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Recoge en</p>
              <p className="text-xs text-foreground">{request.pickupAddress}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2.5">
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)" }}>
            <MapPin className="w-3 h-3" style={{ color: "#34d399" }} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Entrega en</p>
            <p className="text-xs text-foreground">{request.dropoffAddress}</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Tarifa de delivery
          </span>
          <span className="text-xs font-bold text-foreground">${request.deliveryFeeUsd.toFixed(2)} USD</span>
        </div>
      </div>

      {/* Time */}
      <p className="text-center text-[10px] text-muted-foreground">
        Solicitud creada: {new Date(request.createdAt).toLocaleString("es-VE")}
      </p>

      {/* Cancel button */}
      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}
        >
          {cancelling ? "Cancelando..." : "Cancelar solicitud"}
        </button>
      )}

      {/* Back to store */}
      {isTerminal && (
        <button onClick={() => navigate("/store")}
          className="w-full py-3 rounded-xl btn-gradient text-white font-bold text-sm">
          Volver al ServiMarket
        </button>
      )}
    </div>
  );
}
