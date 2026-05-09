import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Truck, Package, MapPin, Phone, User, CheckCircle,
  X, Loader2, Clock, DollarSign, Navigation, AlertTriangle
} from "lucide-react";

interface DeliveryRequest {
  id: number;
  offerId?: number;
  productName: string;
  productImage?: string | null;
  status: string;
  pickupAddress?: string | null;
  dropoffAddress: string;
  deliveryFeeUsd: number;
  platformCommissionUsd: number;
  createdAt: string;
  client?: { id: number; name: string; phone?: string | null } | null;
}

const STATUS_LABELS: Record<string, { label: string; next: string; nextLabel: string; color: string }> = {
  assigned:   { label: "Ir a recoger",    next: "picked_up",  nextLabel: "Confirmé recogida",   color: "#8b5cf6" },
  picked_up:  { label: "Pedido en mano",  next: "in_transit", nextLabel: "Iniciar trayecto",    color: "#06b6d4" },
  in_transit: { label: "En tránsito",      next: "delivered",  nextLabel: "Confirmar entrega",  color: "#34d399" },
};

export function DriverDeliveryPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [available, setAvailable] = useState<DeliveryRequest[]>([]);
  const [active, setActive] = useState<DeliveryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [tab, setTab] = useState<"available" | "active">("available");

  const fetchAll = useCallback(async () => {
    try {
      const [av, ac] = await Promise.all([
        fetch("/api/delivery/available", { headers: getAuthHeader() }).then(r => r.json()),
        fetch("/api/delivery/active",    { headers: getAuthHeader() }).then(r => r.json()),
      ]);
      setAvailable(Array.isArray(av) ? av : []);
      setActive(Array.isArray(ac) ? ac : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 6000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleAccept = async (req: DeliveryRequest) => {
    setActionId(req.id);
    try {
      await fetch(`/api/delivery/requests/${req.id}/accept`, { method: "POST", headers: getAuthHeader() });
      await fetchAll();
      setTab("active");
    } finally { setActionId(null); }
  };

  const handleReject = async (req: DeliveryRequest) => {
    setActionId(req.id);
    try {
      await fetch(`/api/delivery/requests/${req.id}/reject`, { method: "POST", headers: getAuthHeader() });
      await fetchAll();
    } finally { setActionId(null); }
  };

  const handleStatusUpdate = async (req: DeliveryRequest, status: string) => {
    setActionId(req.id);
    try {
      await fetch(`/api/delivery/requests/${req.id}/status`, {
        method: "PUT",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchAll();
    } finally { setActionId(null); }
  };

  if ((user?.role as string) !== "driver" && user?.secondaryRole !== "driver") {
    return (
      <AppLayout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
          <AlertTriangle className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm text-center">Necesitas rol de repartidor para acceder a esta sección.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
    <div className="min-h-screen p-4 max-w-lg mx-auto space-y-4 pb-10">
      {/* Header */}
      <div className="glass rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
          <Truck className="w-5 h-5" style={{ color: "#3b82f6" }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-black text-foreground">Panel del Repartidor</p>
          <p className="text-xs text-muted-foreground">ServiLink Delivery</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Disponibles</p>
          <p className="text-lg font-black text-primary">{available.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden gap-1 p-1"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {[
          { key: "available", label: `Disponibles (${available.length})` },
          { key: "active",    label: `Activos (${active.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold transition-all"
            style={tab === t.key
              ? { background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.3)" }
              : { color: "rgba(255,255,255,0.4)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Available tab */}
      {!loading && tab === "available" && (
        <>
          {available.length === 0 ? (
            <div className="glass rounded-2xl p-8 flex flex-col items-center gap-3">
              <Package className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm font-semibold text-muted-foreground">Sin solicitudes disponibles</p>
              <p className="text-xs text-muted-foreground text-center">
                Recibirás una notificación cuando haya una entrega cerca de tu ubicación.
              </p>
            </div>
          ) : (
            available.map(req => (
              <div key={req.id} className="glass rounded-2xl overflow-hidden">
                {/* Card header */}
                <div className="p-4 flex items-center gap-3 border-b border-white/[0.06]">
                  {req.productImage ? (
                    <img src={req.productImage} alt={req.productName}
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.05)" }}>
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{req.productName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(req.createdAt).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-foreground">${req.deliveryFeeUsd.toFixed(2)}</p>
                    <p className="text-[10px] text-emerald-400">Ganas ${(req.deliveryFeeUsd - req.platformCommissionUsd).toFixed(2)}</p>
                  </div>
                </div>

                {/* Addresses */}
                <div className="px-4 py-3 space-y-2.5">
                  {req.pickupAddress && (
                    <div className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                        style={{ background: "rgba(139,92,246,0.2)" }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#8b5cf6" }} />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{req.pickupAddress}</p>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#34d399" }} />
                    <p className="text-xs text-foreground leading-relaxed">{req.dropoffAddress}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => handleReject(req)}
                    disabled={actionId === req.id}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}
                  >
                    <X className="w-4 h-4 inline mr-1" /> Rechazar
                  </button>
                  <button
                    onClick={() => handleAccept(req)}
                    disabled={actionId === req.id}
                    className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", boxShadow: "0 4px 16px rgba(34,197,94,0.3)" }}
                  >
                    {actionId === req.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><CheckCircle className="w-4 h-4" /> Aceptar entrega</>}
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* Active tab */}
      {!loading && tab === "active" && (
        <>
          {active.length === 0 ? (
            <div className="glass rounded-2xl p-8 flex flex-col items-center gap-3">
              <Truck className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm font-semibold text-muted-foreground">Sin entregas activas</p>
            </div>
          ) : (
            active.map(req => {
              const sCfg = STATUS_LABELS[req.status];
              return (
                <div key={req.id} className="glass rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${sCfg?.color ?? "#ffffff"}22` }}>
                  <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-foreground truncate flex-1">{req.productName}</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0 ml-2"
                        style={{ background: `${sCfg?.color}15`, color: sCfg?.color, border: `1px solid ${sCfg?.color}33` }}>
                        {sCfg?.label ?? req.status}
                      </span>
                    </div>
                    <p className="text-base font-black text-foreground">${req.deliveryFeeUsd.toFixed(2)} USD</p>
                  </div>

                  <div className="px-4 py-3 space-y-2">
                    {req.pickupAddress && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                          style={{ background: "rgba(139,92,246,0.2)" }}>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#8b5cf6" }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{req.pickupAddress}</p>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#34d399" }} />
                      <p className="text-xs text-foreground">{req.dropoffAddress}</p>
                    </div>
                  </div>

                  {req.client && (
                    <div className="px-4 py-3 border-t border-white/[0.06] flex items-center gap-3">
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-foreground flex-1">{req.client.name}</span>
                      {req.client.phone && (
                        <a href={`tel:${req.client.phone}`}
                          className="w-8 h-8 rounded-xl flex items-center justify-center"
                          style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
                          <Phone className="w-3.5 h-3.5" style={{ color: "#34d399" }} />
                        </a>
                      )}
                    </div>
                  )}

                  {sCfg && (
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleStatusUpdate(req, sCfg.next)}
                        disabled={actionId === req.id}
                        className="w-full py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{ background: `linear-gradient(135deg,${sCfg.color},${sCfg.color}cc)`, boxShadow: `0 4px 16px ${sCfg.color}33` }}
                      >
                        {actionId === req.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <><Navigation className="w-4 h-4" /> {sCfg.nextLabel}</>}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
    </AppLayout>
  );
}
