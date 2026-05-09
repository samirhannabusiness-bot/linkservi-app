import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Car, Power, Loader2, MapPin, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/lib/auth-context";
import { getSocket, joinRoom, leaveRoom } from "@/lib/socket";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleWelcomeModal } from "@/components/onboarding/RoleWelcomeModal";

interface IncomingRide {
  rideId: number;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  fareUsd: number;
  distanceKm: number;
}

const HEARTBEAT_INTERVAL_MS = 8_000; // 8s — dentro del rango pedido (5–10s)

export function DriverTransportPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { position, request: requestGeo, permission } = useGeolocation("none");

  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingRide[]>([]);
  const [accepting, setAccepting] = useState<number | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Guard: requerir datos del vehículo antes de operar ────────────────────
  // Si el usuario activó el rol "driver" pero aún no llenó el formulario,
  // lo mandamos a /driver/transport/setup. Sin estos datos no puede operar.
  const [profileChecked, setProfileChecked] = useState(false);
  useEffect(() => {
    apiFetch<{ profile: { userId: number } | null }>("/api/profile/driver-profile")
      .then((r) => {
        if (!r?.profile) {
          setLocation("/driver/transport/setup");
          return;
        }
        setProfileChecked(true);
      })
      .catch(() => {
        // En error, no bloqueamos — pero registramos para no quedar en limbo.
        setProfileChecked(true);
      });
  }, [setLocation]);

  // ── Cargar viaje activo al entrar ──────────────────────────────────────────
  useEffect(() => {
    if (!profileChecked) return;
    apiFetch<{ id: number } | null>("/api/transport/rides/active")
      .then((r) => { if (r?.id) setLocation(`/transport/ride/${r.id}`); })
      .catch(() => { /* sin viaje */ });
  }, [setLocation, profileChecked]);

  // ── Verificar permisos / solicitar al ir online ────────────────────────────
  const goOnline = async () => {
    setError(null);
    if (permission !== "granted") requestGeo();
    if (!position) {
      setError("Necesitamos tu ubicación para activarte como conductor");
      requestGeo();
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/drivers/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: position.lat, lng: position.lng, isOnline: true }),
      });
      setOnline(true);
    } catch (e: any) {
      setError(e?.message || "No se pudo activar");
    } finally {
      setBusy(false);
    }
  };

  const goOffline = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/drivers/offline", { method: "POST" });
      setOnline(false);
    } catch { /* ignorar */ }
    finally { setBusy(false); }
  };

  // ── Loop de heartbeat mientras esté online ────────────────────────────────
  useEffect(() => {
    if (!online) {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
      return;
    }
    const tick = () => {
      if (!position) return;
      apiFetch("/api/drivers/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: position.lat, lng: position.lng, isOnline: true }),
      }).catch(() => { /* tolerar fallos puntuales */ });
    };
    tick();
    heartbeatTimer.current = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    };
  }, [online, position]);

  // ── Socket: recibir solicitudes de carrera entrantes ──────────────────────
  // `transport:drivers` está protegida server-side y requiere role==="driver"
  // en el JWT. Los clientes nunca verán las ofertas crudas.
  useEffect(() => {
    if (!user || !online) return;
    const socket = getSocket();
    joinRoom("transport:drivers");

    const onRideRequest = (r: IncomingRide) => {
      setIncoming((prev) => {
        if (prev.some(p => p.rideId === r.rideId)) return prev;
        return [r, ...prev].slice(0, 8);
      });
    };
    const onRideTaken = ({ rideId }: { rideId: number }) => {
      setIncoming((prev) => prev.filter(p => p.rideId !== rideId));
    };

    socket.on("ride:request", onRideRequest);
    socket.on("ride:taken", onRideTaken);

    return () => {
      socket.off("ride:request", onRideRequest);
      socket.off("ride:taken", onRideTaken);
      leaveRoom("transport:drivers");
    };
  }, [user, online]);

  const acceptRide = async (rideId: number) => {
    setAccepting(rideId);
    setError(null);
    try {
      await apiFetch(`/api/transport/rides/${rideId}/accept`, { method: "POST" });
      setLocation(`/transport/ride/${rideId}`);
    } catch (e: any) {
      setError(e?.message || "No se pudo aceptar el viaje");
    } finally {
      setAccepting(null);
    }
  };

  return (
    <AppLayout>
      <RoleWelcomeModal
        storageKey="sl_seen_driver_intro"
        title="Bienvenido al Modo Conductor"
        subtitle="Recibe viajes y genera ingresos"
        bullets={[
          "Activa 'Conectar' para que tu ubicación se actualice cada pocos segundos.",
          "Recibirás solicitudes de viaje cerca de ti — acepta la que te convenga.",
          "Al completar el viaje, el cliente paga por Pago Móvil C2P.",
          "LinkServi se queda con un 15% de comisión, el resto es tu ingreso.",
        ]}
        ctaLabel="Empezar a manejar"
      />
      <div className="p-6 max-w-2xl mx-auto text-white space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="w-6 h-6 text-cyan-400" /> Modo Conductor
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Activa tu modo en línea para recibir solicitudes de viaje cerca de ti.
          </p>
        </div>
        <button
          onClick={online ? goOffline : goOnline}
          disabled={busy}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold transition ${
            online
              ? "bg-rose-500 hover:bg-rose-600 text-white"
              : "btn-gradient text-white"
          } disabled:opacity-50`}
          data-testid="button-toggle-online"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
          {online ? "Salir de línea" : "Conectar"}
        </button>
      </header>

      {/* Estado */}
      <div className="glass rounded-2xl p-4 border border-white/10 flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
        <span className="text-sm">{online ? "En línea — recibiendo solicitudes" : "Fuera de línea"}</span>
        {position && (
          <span className="ml-auto text-xs text-white/40">
            {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
          </span>
        )}
      </div>

      {permission === "denied" && (
        <div className="glass rounded-xl p-3 text-sm text-amber-300 border border-amber-400/30">
          Activa la ubicación de tu navegador para poder conducir.
        </div>
      )}
      {error && (
        <div className="glass rounded-xl p-3 text-sm text-rose-400 border border-rose-400/30">
          {error}
        </div>
      )}

      {/* Solicitudes entrantes */}
      <section>
        <h2 className="text-sm font-semibold uppercase text-white/50 mb-2">Solicitudes entrantes</h2>
        {incoming.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-white/50">
            {online
              ? "Esperando solicitudes…"
              : "Conéctate para empezar a recibir solicitudes."}
          </div>
        ) : (
          <ul className="space-y-2">
            {incoming.map((r) => (
              <li key={r.rideId} className="glass rounded-2xl p-4 border border-white/10" data-testid={`incoming-ride-${r.rideId}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-cyan-400" />
                      <span className="font-medium">{r.pickupAddress}</span>
                    </div>
                    <div className="text-xs text-white/60 mt-1 ml-6">→ {r.dropoffAddress}</div>
                    <div className="text-xs text-white/50 mt-2">
                      {r.distanceKm.toFixed(1)} km · ${r.fareUsd.toFixed(2)} USD
                    </div>
                  </div>
                  <button
                    onClick={() => acceptRide(r.rideId)}
                    disabled={accepting === r.rideId}
                    className="btn-gradient text-white font-semibold px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50"
                    data-testid={`button-accept-${r.rideId}`}
                  >
                    {accepting === r.rideId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Aceptar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </AppLayout>
  );
}
