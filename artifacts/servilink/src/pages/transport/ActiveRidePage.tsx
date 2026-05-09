import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Phone, X, Car, Flag, CheckCircle2, Loader2, Star, MessageCircle, Send,
  CreditCard, Wallet,
} from "lucide-react";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getSocket, joinRoom, leaveRoom } from "@/lib/socket";
import { AppLayout } from "@/components/layout/AppLayout";
import { C2PModal, type C2PSuccessPayload } from "@/components/payments/C2PModal";
import { loadMapsLib, loadMarkerLib, DARK_MAP_STYLE } from "@/lib/google-maps";

interface RideDetails {
  id: number;
  status: string;
  clientId: number;
  driverId: number | null;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  fareUsd: number;
  distanceKm: number | null;
  paymentStatus?: string;
  commissionPct?: number;
  commissionUsd?: number | null;
  driverEarningsUsd?: number | null;
  paidAt?: string | null;
  paymentIssue?: {
    transactionId: number;
    referencia: string | null;
    domainError: string | null;
    createdAt: string;
  } | null;
  driver: { id: number; name: string; phone: string | null; avatarUrl: string | null } | null;
  client: { id: number; name: string; phone: string | null; avatarUrl: string | null } | null;
}

interface ChatMsg {
  id: number;
  rideId: number | null;
  senderId: number;
  content: string;
  createdAt: string;
}

interface RatingsResponse {
  clientToDriver: { id: number; rating: number; comment: string | null } | null;
  driverToClient: { id: number; rating: number; comment: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  searching: "Buscando conductor…",
  accepted: "Conductor en camino",
  in_progress: "Viaje en progreso",
  completed: "Viaje completado",
  cancelled: "Viaje cancelado",
  expired: "No se encontró conductor",
};

function injectStyles() {
  if (document.getElementById("ride-map-styles")) return;
  const s = document.createElement("style");
  s.id = "ride-map-styles";
  s.textContent = `@keyframes ride-spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(s);
}

function buildDotEl(color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;`;
  return el;
}

function buildDriverDotEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:18px;height:18px;border-radius:50%;background:#facc15;border:2px solid white;box-shadow:0 0 0 4px rgba(250,204,21,0.25);";
  return el;
}

export function ActiveRidePage() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);

  const [ride, setRide] = useState<RideDetails | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [c2pOpen, setC2pOpen] = useState(false);

  const [ratings, setRatings] = useState<RatingsResponse>({ clientToDriver: null, driverToClient: null });
  const [myRating, setMyRating] = useState<number>(0);
  const [myComment, setMyComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const isDriver = !!ride && ride.driverId === user?.id;
  const isClient = !!ride && ride.clientId === user?.id;

  const loadRide = async () => {
    try {
      const path = Number.isFinite(id) && id > 0
        ? `/api/transport/rides/${id}`
        : `/api/transport/rides/active`;
      const r = await apiFetch<RideDetails>(path);
      if (r) setRide(r);
    } catch (e: any) {
      setError(e?.message ?? "No se pudo cargar el viaje");
    }
  };

  const loadRatings = async () => {
    if (!ride) return;
    try {
      const r = await apiFetch<RatingsResponse>(`/api/transport/rides/${ride.id}/rating`);
      if (r) setRatings(r);
    } catch { }
  };

  const loadMessages = async () => {
    if (!ride) return;
    try {
      const m = await apiFetch<ChatMsg[]>(`/api/transport/rides/${ride.id}/messages`);
      if (m) setMessages(m);
    } catch { }
  };

  useEffect(() => { loadRide(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { if (ride?.status === "completed") loadRatings(); /* eslint-disable-next-line */ }, [ride?.status]);
  useEffect(() => { if (ride?.id && ride.driverId) loadMessages(); /* eslint-disable-next-line */ }, [ride?.id, ride?.driverId]);

  // ── Init map ─────────────────────────────────────────────────────────────────
  const center = useMemo(() => {
    if (!ride) return { lat: 10.4806, lng: -66.9036 };
    return { lat: ride.pickupLat, lng: ride.pickupLng };
  }, [ride]);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current || !ride) return;

    injectStyles();
    let destroyed = false;

    (async () => {
      try {
        const [{ Map, LatLngBounds }, { AdvancedMarkerElement }] = await Promise.all([
          loadMapsLib(),
          loadMarkerLib(),
        ]);
        if (destroyed || !mapDivRef.current) return;

        const map = new Map(mapDivRef.current, {
          center,
          zoom: 13,
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: false,
          gestureHandling: "none",
          styles: DARK_MAP_STYLE,
        });

        new AdvancedMarkerElement({
          map,
          position: { lat: ride.pickupLat, lng: ride.pickupLng },
          content: buildDotEl("#38bdf8"),
          title: "Recogida",
          zIndex: 10,
        });

        new AdvancedMarkerElement({
          map,
          position: { lat: ride.dropoffLat, lng: ride.dropoffLng },
          content: buildDotEl("#34d399"),
          title: "Destino",
          zIndex: 10,
        });

        const bounds = new LatLngBounds();
        bounds.extend({ lat: ride.pickupLat, lng: ride.pickupLng });
        bounds.extend({ lat: ride.dropoffLat, lng: ride.dropoffLng });
        map.fitBounds(bounds, { top: 60, right: 20, bottom: 200, left: 20 });

        mapRef.current = map;
      } catch { /* map unavailable */ }
    })();

    return () => {
      destroyed = true;
      if (driverMarkerRef.current) { driverMarkerRef.current.map = null; driverMarkerRef.current = null; }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  // ── Driver location marker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !driverPos) return;
    loadMarkerLib().then(({ AdvancedMarkerElement }) => {
      const map = mapRef.current;
      if (!map) return;
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new AdvancedMarkerElement({
          map,
          position: { lat: driverPos.lat, lng: driverPos.lng },
          content: buildDriverDotEl(),
          title: "Conductor",
          zIndex: 100,
        });
      } else {
        driverMarkerRef.current.position = { lat: driverPos.lat, lng: driverPos.lng };
      }
    });
  }, [driverPos]);

  // ── Socket ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ride) return;
    const room = `ride:${ride.id}`;
    joinRoom(room);
    const socket = getSocket();

    const onLocation = (p: { driverId: number; lat: number; lng: number }) => {
      setDriverPos({ lat: p.lat, lng: p.lng });
    };
    const onAccepted = () => loadRide();
    const onStatus = ({ status }: { status: string }) => {
      setRide(prev => prev ? { ...prev, status } : prev);
      if (status === "completed" || status === "cancelled") setTimeout(() => loadRide(), 400);
    };
    const onMessage = (m: ChatMsg) => {
      setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
    };

    socket.on("driver:location", onLocation);
    socket.on("ride:accepted", onAccepted);
    socket.on("ride:status", onStatus);
    socket.on("new_message", onMessage);

    return () => {
      socket.off("driver:location", onLocation);
      socket.off("ride:accepted", onAccepted);
      socket.off("ride:status", onStatus);
      socket.off("new_message", onMessage);
      leaveRoom(room);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, chatOpen]);

  const updateStatus = async (next: "in_progress" | "completed") => {
    if (!ride) return;
    setBusy(true); setError(null);
    try {
      const updated = await apiFetch<RideDetails>(`/api/transport/rides/${ride.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      setRide((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      setError(e?.message ?? "No se pudo actualizar el viaje");
    } finally {
      setBusy(false);
    }
  };

  const cancelRide = async () => {
    if (!ride) return;
    if (!confirm("¿Seguro que quieres cancelar el viaje?")) return;
    setBusy(true);
    try {
      await apiFetch(`/api/transport/rides/${ride.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelado por el usuario" }),
      });
      setLocation(isDriver ? "/driver/transport" : "/client");
    } catch (e: any) {
      setError(e?.message ?? "No se pudo cancelar");
    } finally {
      setBusy(false);
    }
  };

  const handleC2PSuccess = (_payload: C2PSuccessPayload) => {
    setC2pOpen(false);
    setTimeout(() => loadRide(), 600);
  };

  const submitRating = async () => {
    if (!ride || myRating < 1) return;
    setRatingBusy(true); setRatingError(null);
    try {
      await apiFetch(`/api/transport/rides/${ride.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ rating: myRating, comment: myComment.trim() || undefined }),
      });
      await loadRatings();
      setMyRating(0); setMyComment("");
    } catch (e: any) {
      setRatingError(e?.message ?? "No se pudo enviar la calificación");
    } finally {
      setRatingBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!ride || !draft.trim()) return;
    const content = draft.trim();
    setDraft(""); setChatBusy(true);
    try {
      await apiFetch(`/api/transport/rides/${ride.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ content }),
      });
      await loadMessages();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo enviar el mensaje");
    } finally {
      setChatBusy(false);
    }
  };

  if (!ride) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-white/60">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Cargando viaje…
          {error && <p className="text-rose-400 text-sm mt-2">{error}</p>}
        </div>
      </AppLayout>
    );
  }

  const otherParty = isDriver ? ride.client : ride.driver;
  const finished = ["completed", "cancelled", "expired"].includes(ride.status);
  const isCompleted = ride.status === "completed";
  const isPaid = ride.paymentStatus === "paid";
  const showClientPaymentCard = isClient && isCompleted && !isPaid;
  const showPaidCard = isCompleted && isPaid;
  const showRatingCard = isCompleted && (
    (isClient && !ratings.clientToDriver) ||
    (isDriver && !ratings.driverToClient)
  );
  const myExistingRating = isClient ? ratings.clientToDriver : ratings.driverToClient;
  const showChat = !!ride.driverId && ["accepted", "in_progress", "completed"].includes(ride.status);

  return (
    <AppLayout>
      <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden">
        <div ref={mapDivRef} className="absolute inset-0" />

        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
          <div className="bg-[#040c1a]/90 backdrop-blur px-3 py-2 rounded-xl border border-white/10 pointer-events-auto" data-testid="ride-status-badge">
            <span className="text-sm font-semibold text-white">{STATUS_LABEL[ride.status] ?? ride.status}</span>
          </div>
          {!finished && (
            <button onClick={cancelRide} disabled={busy}
              className="bg-rose-500/90 hover:bg-rose-600 backdrop-blur p-2 rounded-xl text-white pointer-events-auto disabled:opacity-50"
              data-testid="button-cancel-ride" aria-label="Cancelar viaje">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-[#040c1a] rounded-t-3xl border-t border-white/10 max-h-[70vh] overflow-y-auto">
          <div className="p-4 space-y-3">
            {otherParty && (
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 font-bold">
                  {otherParty.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate" data-testid="text-other-party-name">{otherParty.name}</p>
                  <p className="text-xs text-white/50">{isDriver ? "Pasajero" : "Conductor"}</p>
                </div>
                {otherParty.phone && (
                  <a href={`tel:${otherParty.phone}`} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-xl"
                    aria-label="Llamar" data-testid="button-call-other-party">
                    <Phone className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                <p className="text-white/80 truncate">{ride.pickupAddress}</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <p className="text-white/80 truncate">{ride.dropoffAddress}</p>
              </div>
              <div className="text-xs text-white/50 pt-1">
                {ride.distanceKm ? `${ride.distanceKm.toFixed(1)} km · ` : ""}
                ${ride.fareUsd.toFixed(2)} USD
              </div>
            </div>

            {isDriver && !finished && (
              <div className="flex gap-2">
                {ride.status === "accepted" && (
                  <button onClick={() => updateStatus("in_progress")} disabled={busy}
                    className="flex-1 btn-gradient text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                    data-testid="button-start-ride">
                    <Flag className="w-4 h-4" /> Iniciar viaje
                  </button>
                )}
                {ride.status === "in_progress" && (
                  <button onClick={() => updateStatus("completed")} disabled={busy}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                    data-testid="button-complete-ride">
                    <CheckCircle2 className="w-4 h-4" /> Completar viaje
                  </button>
                )}
              </div>
            )}

            {showClientPaymentCard && ride.paymentIssue && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 space-y-2" data-testid="card-payment-issue">
                <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
                  <CreditCard className="w-4 h-4" /> Pago en revisión
                </div>
                <p className="text-xs text-white/80 leading-relaxed">
                  El banco aprobó el cobro de <span className="text-white font-bold">${ride.fareUsd.toFixed(2)}</span>,
                  pero hubo un problema técnico al activar el viaje. <span className="text-white">Tu dinero no se perdió.</span> Soporte está revisando.
                </p>
                {ride.paymentIssue.referencia && (
                  <p className="text-[11px] text-white/60">
                    Referencia: <span className="font-mono text-white/80">{ride.paymentIssue.referencia}</span>
                  </p>
                )}
                <a href={`https://wa.me/?text=${encodeURIComponent(`Hola, soporte LinkServi. Mi pago del viaje #${ride.id} quedó en revisión. Referencia: ${ride.paymentIssue.referencia ?? "N/D"}`)}`}
                  target="_blank" rel="noreferrer"
                  className="block w-full text-center bg-white/10 hover:bg-white/15 text-white font-semibold py-2 rounded-lg text-sm"
                  data-testid="link-payment-issue-support">
                  Contactar soporte
                </a>
              </div>
            )}

            {showClientPaymentCard && !ride.paymentIssue && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2" data-testid="card-pay-ride">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <CreditCard className="w-4 h-4" /> Paga tu viaje
                </div>
                <p className="text-xs text-white/70">
                  Total a pagar: <span className="text-white font-bold">${ride.fareUsd.toFixed(2)} USD</span> vía Pago Móvil C2P.
                </p>
                <button onClick={() => setC2pOpen(true)}
                  className="w-full btn-gradient text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
                  data-testid="button-open-c2p">
                  <CreditCard className="w-4 h-4" /> Pagar ${ride.fareUsd.toFixed(2)}
                </button>
              </div>
            )}

            {showPaidCard && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-start gap-2" data-testid="card-payment-confirmed">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  {isClient && (
                    <>
                      <p className="text-emerald-300 font-semibold">Pago realizado</p>
                      <p className="text-xs text-white/60">Pagaste ${ride.fareUsd.toFixed(2)} por este viaje. ¡Gracias!</p>
                    </>
                  )}
                  {isDriver && (
                    <>
                      <p className="text-emerald-300 font-semibold flex items-center gap-1">
                        <Wallet className="w-4 h-4" /> Ingreso recibido
                      </p>
                      <p className="text-xs text-white/60">
                        Tu ganancia: <span className="text-white font-bold">${(ride.driverEarningsUsd ?? 0).toFixed(2)}</span>
                        <span className="text-white/40"> · Comisión LinkServi: ${(ride.commissionUsd ?? 0).toFixed(2)}</span>
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {showRatingCard && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3" data-testid="card-rate-ride">
                <p className="text-sm font-semibold text-white">
                  Califica {isDriver ? "al pasajero" : "al conductor"}
                </p>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setMyRating(n)} className="p-1"
                      aria-label={`${n} estrella${n > 1 ? "s" : ""}`} data-testid={`button-star-${n}`}>
                      <Star className={`w-7 h-7 transition ${n <= myRating ? "fill-amber-400 text-amber-400" : "text-white/30"}`} />
                    </button>
                  ))}
                </div>
                <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)}
                  placeholder="Comentario (opcional)…" maxLength={500}
                  className="w-full bg-[#040c1a] border border-white/10 rounded-lg p-2 text-sm text-white resize-none"
                  rows={2} data-testid="input-rating-comment" />
                {ratingError && <p className="text-xs text-rose-400">{ratingError}</p>}
                <button onClick={submitRating} disabled={ratingBusy || myRating < 1}
                  className="w-full btn-gradient text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50"
                  data-testid="button-submit-rating">
                  {ratingBusy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Enviar calificación"}
                </button>
              </div>
            )}

            {myExistingRating && (
              <div className="bg-amber-500/10 border border-amber-400/20 rounded-xl p-3 flex items-center gap-2">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <p className="text-xs text-white/70">
                  Calificaste con <span className="text-amber-300 font-bold">{myExistingRating.rating}/5</span>
                  {myExistingRating.comment && <span className="italic"> · "{myExistingRating.comment}"</span>}
                </p>
              </div>
            )}

            {error && <p className="text-xs text-rose-400 text-center">{error}</p>}

            {finished && (
              <button onClick={() => setLocation(isDriver ? "/driver/transport" : "/client")}
                className="w-full bg-white/10 hover:bg-white/15 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                <Car className="w-4 h-4" /> Volver al inicio
              </button>
            )}

            {showChat && (
              <div>
                <button onClick={() => setChatOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10">
                  <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Chat</span>
                  <span className="text-xs">{chatOpen ? "▲" : "▼"}</span>
                </button>
                {chatOpen && (
                  <div className="mt-2 border border-white/10 rounded-xl overflow-hidden">
                    <div ref={chatScrollRef} className="max-h-48 overflow-y-auto p-3 space-y-2 bg-[#020810]">
                      {messages.length === 0 && (
                        <p className="text-xs text-white/40 text-center py-4">No hay mensajes aún</p>
                      )}
                      {messages.map((m) => {
                        const isMine = m.senderId === user?.id;
                        return (
                          <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] px-3 py-2 rounded-xl text-xs ${isMine ? "bg-sky-600 text-white" : "bg-white/10 text-white/80"}`}>
                              {m.content}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 p-2 bg-[#040c1a] border-t border-white/10">
                      <input value={draft} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                        placeholder="Escribe un mensaje…"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-400"
                        data-testid="input-chat-message" />
                      <button onClick={sendMessage} disabled={chatBusy || !draft.trim()}
                        className="bg-sky-600 hover:bg-sky-500 text-white p-2 rounded-lg disabled:opacity-40"
                        data-testid="button-send-message">
                        {chatBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {ride && c2pOpen && (
          <C2PModal
            isOpen={c2pOpen}
            onClose={() => setC2pOpen(false)}
            onSuccess={handleC2PSuccess}
            amountUsd={ride.fareUsd}
            rideId={ride.id}
          />
        )}
      </div>
    </AppLayout>
  );
}
