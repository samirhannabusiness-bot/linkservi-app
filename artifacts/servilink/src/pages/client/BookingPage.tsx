import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useGetWorker, useCreateBooking, useListCategories } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  ChevronLeft, ChevronRight, Zap, Shield, Clock, MapPin,
  DollarSign, Gavel, CheckCircle, Info, TrendingUp,
  FileText, Star, BadgeCheck,
} from "lucide-react";
import { getRequestOptions } from "@/lib/api";
import { useGeolocation, haversineDistance } from "@/hooks/useGeolocation";
import { useBcvRate } from "@/hooks/useBcvRate";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { mediaSrc } from "@/lib/media-url";

type PricingMode = "service" | "bid";

const STEPS = [
  { label: "Servicio", icon: FileText },
  { label: "Dirección", icon: MapPin },
  { label: "Cuándo", icon: Clock },
  { label: "Confirmar", icon: CheckCircle },
];

export function BookingPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const [, navigate] = useLocation();
  const id = Number(workerId);
  const opts = getRequestOptions();
  const isUrgentFromUrl = window.location.search.includes("urgent=true");
  const { position } = useGeolocation();

  const { data: worker } = useGetWorker(id, { query: { enabled: !!id } } as any);
  const { data: categories = [] } = useListCategories();
  const { data: bcvData, formatBs } = useBcvRate();

  // ── Wizard state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);

  // Step 1 — Servicio
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [pricingMode, setPricingMode] = useState<PricingMode>("service");
  const [clientBudget, setClientBudget] = useState(0);
  const [isUrgent, setIsUrgent] = useState(isUrgentFromUrl);

  // Step 2 — Dirección
  const [address, setAddress] = useState("");
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);
  const [addressDetails, setAddressDetails] = useState(""); // urbanización, casa, edificio, referencias

  // Step 3 — Cuándo
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(undefined);

  const [error, setError] = useState("");

  const { mutate: createBooking, isPending } = useCreateBooking({
    ...opts,
    mutation: {
      onSuccess: () => navigate("/client/bookings"),
      onError: (err: any) => {
        const errData = err?.response?.data ?? err?.data;
        if (errData?.code === "NO_AVATAR") {
          navigate("/profile/setup");
        } else if (errData?.code === "CLIENT_NOT_VERIFIED") {
          navigate("/client/verification");
        } else {
          setError(errData?.error ?? "Error al crear la solicitud");
        }
      },
    },
  } as any);

  if (!worker) return null;
  const w = worker as any;

  const basePrice = w.basePrice ?? w.hourlyRate ?? 10;
  const servicePrice = w.servicePrice ?? w.fixedPrice ?? 50;
  const urgentMultiplier = isUrgent ? 1.5 : 1;
  const displayPrice = pricingMode === "bid" ? (clientBudget || 0) * urgentMultiplier : servicePrice * urgentMultiplier;
  const catId = categoryId ? Number(categoryId) : w.categoryId;

  const distance = position && w.lat && w.lng
    ? haversineDistance(position.lat, position.lng, w.lat, w.lng).toFixed(1)
    : null;

  // ── Step validation ─────────────────────────────────────────────────────────
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!description.trim()) return "Describe qué necesitas para que el profesional entienda tu caso.";
      if (pricingMode === "bid" && (!clientBudget || clientBudget < 1)) return "Ingresa un presupuesto válido.";
    }
    if (s === 1) {
      const hasAddress = address.trim().length > 0;
      const hasCoords = addressLat != null && addressLng != null;
      const hasDetails = addressDetails.trim().length >= 5;
      // Aceptamos: (a) una dirección escrita o seleccionada, o
      // (b) ubicación GPS + detalles escritos a mano (urbanización, casa, etc.)
      if (!hasAddress && !(hasCoords && hasDetails)) {
        return "Escribe tu dirección o usa tu ubicación actual y añade los detalles (urbanización, casa, edificio).";
      }
    }
    return null;
  };

  const goNext = () => {
    const msg = validateStep(step);
    if (msg) { setError(msg); return; }
    setError("");
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setError("");
    if (step === 0) navigate(`/client/worker/${id}`);
    else setStep((s) => s - 1);
  };

  const handleSubmit = () => {
    setError("");
    if (!catId) { setError("Selecciona una categoría de servicio."); return; }
    // Combinamos dirección base + detalles escritos por el cliente
    // (urbanización, casa, edificio, referencias). El profesional ve un
    // único texto claro, no coordenadas crudas.
    const cleanAddress = address.trim();
    const cleanDetails = addressDetails.trim();
    const fullAddress = [cleanAddress, cleanDetails].filter(Boolean).join(" — ");
    const payload: Record<string, unknown> = {
      workerId: id,
      categoryId: catId,
      description: isUrgent ? `[URGENTE] ${description}` : description,
      address: fullAddress,
      scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
    };
    if (addressLat != null && addressLng != null) {
      payload.lat = addressLat;
      payload.lng = addressLng;
    }
    if (pricingMode === "bid") payload.clientBudget = clientBudget * urgentMultiplier;
    createBooking({ data: payload as any });
  };

  // ── Worker card (compact, shown always) ─────────────────────────────────────
  const WorkerCard = () => (
    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border">
      <div className="relative flex-shrink-0">
        {w.avatarUrl
          ? <img src={mediaSrc(w.avatarUrl)} alt={w.name} className="w-10 h-10 rounded-full object-cover" />
          : <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{w.name?.charAt(0)}</div>
        }
        {w.isAvailable && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-card" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate">{w.name}</p>
          {w.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground truncate">{w.categoryName}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="flex items-center gap-0.5">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium text-foreground">{w.rating?.toFixed(1) ?? "—"}</span>
        </div>
        {distance && <p className="text-xs text-muted-foreground">{distance} km</p>}
      </div>
    </div>
  );

  // ── Step progress bar ────────────────────────────────────────────────────────
  const StepBar = () => (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center gap-1 flex-1 last:flex-none">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all text-xs font-bold
            ${i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"}`}>
            {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 flex-1 rounded-full transition-all ${i < step ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );

  const stepTitle = [
    "¿Qué necesitas?",
    "¿Dónde lo necesitas?",
    "¿Cuándo lo necesitas?",
    "Revisa y confirma",
  ][step];

  const stepSub = [
    "Describe el trabajo y elige cómo acordar el precio",
    "Indica la dirección exacta del servicio",
    "Elige una fecha o pídelo ahora mismo",
    "Todo listo. Revisa los detalles antes de enviar.",
  ][step];

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-5 pb-6">

        {/* Top nav */}
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <StepBar />
        </div>

        {/* Step header */}
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-0.5">
            Paso {step + 1} de {STEPS.length}
          </p>
          <h1 className="text-xl font-bold text-foreground">{stepTitle}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{stepSub}</p>
        </div>

        {/* Worker reference */}
        <WorkerCard />

        {/* ── STEP 1 — Servicio ──────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Categoría</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{w.categoryName ?? "Seleccionar categoría"}</option>
                {(categories as any[]).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Cuéntanos qué necesitas
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Ej: Tengo una fuga de agua en el baño. El grifo gotea hace 3 días y necesito que lo revisen hoy..."
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">Cuanto más detalles, mejor respuesta obtendrás.</p>
            </div>

            {/* Pricing mode */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">¿Cómo prefieres el precio?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPricingMode("service")}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all ${pricingMode === "service" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
                >
                  <DollarSign className={`w-5 h-5 mb-1.5 ${pricingMode === "service" ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-sm font-semibold text-foreground">Precio fijo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Acepto el precio del profesional</p>
                  <p className="text-base font-bold text-foreground mt-1.5">${servicePrice * urgentMultiplier}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode("bid")}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all ${pricingMode === "bid" ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20" : "border-border bg-card hover:border-amber-300"}`}
                >
                  <Gavel className={`w-5 h-5 mb-1.5 ${pricingMode === "bid" ? "text-amber-600" : "text-muted-foreground"}`} />
                  <p className="text-sm font-semibold text-foreground">Proponer precio</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Negocio con el profesional</p>
                  <p className="text-xs text-amber-600 font-medium mt-1.5">Mínimo ${basePrice}</p>
                </button>
              </div>
            </div>

            {/* Bid amount */}
            {pricingMode === "bid" && (
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Tu presupuesto (USD){isUrgent && <span className="text-red-400 font-normal ml-1">· se aplica recargo urgente ×1.5</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                  <input
                    type="number" min={1}
                    value={clientBudget || ""}
                    onChange={(e) => setClientBudget(Number(e.target.value))}
                    placeholder={`Ej: ${basePrice + 10}`}
                    className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                {isUrgent && clientBudget > 0 && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Total con recargo urgente (+50%)
                    </span>
                    <span className="text-sm font-bold text-red-400">${(clientBudget * 1.5).toFixed(2)}</span>
                  </div>
                )}
                {!isUrgent && clientBudget > 0 && clientBudget < basePrice && (
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    <Info className="w-3 h-3" /> El profesional cobra mínimo ${basePrice}. Tu oferta podría no ser aceptada.
                  </p>
                )}
                {!isUrgent && clientBudget >= basePrice && (
                  <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Buen presupuesto. El profesional puede aceptar directamente.
                  </p>
                )}
              </div>
            )}

            {/* Urgency selector — two cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Normal */}
              <button
                type="button"
                onClick={() => { setIsUrgent(false); }}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-center transition-all
                  ${!isUrgent
                    ? "border-blue-500 bg-blue-500/15 dark:bg-blue-500/20"
                    : "border-border bg-card hover:border-blue-400/50"}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!isUrgent ? "bg-blue-500" : "bg-muted"}`}>
                  <Clock className={`w-5 h-5 ${!isUrgent ? "text-white" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${!isUrgent ? "text-blue-400" : "text-foreground"}`}>Normal</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Programa una fecha</p>
                </div>
                {!isUrgent && <span className="text-[10px] font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-full">Seleccionado</span>}
              </button>

              {/* Urgente */}
              <button
                type="button"
                onClick={() => { setIsUrgent(true); setScheduledAt(undefined); }}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-center transition-all
                  ${isUrgent
                    ? "border-red-400 bg-red-500/15 dark:bg-red-500/20"
                    : "border-border bg-card hover:border-red-400/50"}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isUrgent ? "bg-red-500" : "bg-muted"}`}>
                  <Zap className={`w-5 h-5 ${isUrgent ? "text-white" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isUrgent ? "text-red-400" : "text-foreground"}`}>Urgente</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Ahora · +50% precio</p>
                </div>
                {isUrgent && <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">Seleccionado</span>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 — Dirección ────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Dirección del servicio</label>
              <AddressAutocomplete
                value={address}
                onChange={(v) => {
                  setAddress(v);
                  // Si el cliente edita el texto a mano, invalidamos las coords
                  if (addressLat != null) { setAddressLat(null); setAddressLng(null); }
                }}
                onSelect={(sel) => {
                  setAddress(sel.address);
                  setAddressLat(sel.lat);
                  setAddressLng(sel.lng);
                }}
                placeholder="Busca tu calle, urbanización o municipio..."
              />
              <p className="text-xs text-muted-foreground mt-2">
                Busca tu calle o usa tu ubicación actual. Luego añade los detalles abajo.
              </p>
            </div>

            {/* Detalles adicionales — donde la gente escribe lo que el GPS no sabe */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Detalles del lugar <span className="text-xs font-normal text-muted-foreground">(urbanización, casa, edificio, referencias)</span>
              </label>
              <textarea
                value={addressDetails}
                onChange={(e) => setAddressDetails(e.target.value)}
                placeholder="Ej: Zona Industrial, Residencias El Faro, Condominio Margarita, Calle 2, Casa 79"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Añade número de casa, piso, color del portón o cualquier referencia que ayude al profesional a llegar.
              </p>
            </div>

            {addressLat != null && addressLng != null ? (
              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <MapPin className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    {address && (
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 break-words">{address}</p>
                    )}
                    {addressDetails.trim() && (
                      <p className="text-sm text-emerald-700 dark:text-emerald-300/90 break-words mt-0.5">
                        {addressDetails.trim()}
                      </p>
                    )}
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Ubicación exacta confirmada · el profesional la verá en el mapa
                    </p>
                  </div>
                </div>
                <img
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${addressLat},${addressLng}&zoom=16&size=600x240&scale=2&markers=color:0x06b6d4%7C${addressLat},${addressLng}&style=feature:poi%7Cvisibility:off&style=element:geometry%7Ccolor:0x040c1a&style=element:labels.text.fill%7Ccolor:0x7a8599&style=element:labels.text.stroke%7Ccolor:0x040c1a&style=feature:road%7Celement:geometry%7Ccolor:0x152336&style=feature:water%7Celement:geometry%7Ccolor:0x0a1628&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                  alt="Mapa con tu ubicación"
                  className="w-full rounded-xl border border-border"
                  loading="lazy"
                />
              </div>
            ) : address ? (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Dirección sin coordenadas</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    Selecciona una opción de la lista o usa "Usar mi ubicación actual" para que el profesional pueda llegar exactamente a ti.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── STEP 3 — Cuándo ───────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {isUrgent ? (
              <div className="p-5 rounded-xl bg-red-50 dark:bg-red-900/20 border-2 border-red-300 text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center mx-auto">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <p className="font-semibold text-red-700 dark:text-red-400">Servicio urgente activo</p>
                <p className="text-sm text-muted-foreground">
                  El profesional será notificado <strong>ahora mismo</strong> y deberá responder en los próximos minutos.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Selecciona fecha y hora (opcional)
                  </label>
                  <DateTimePicker
                    value={scheduledAt}
                    onChange={setScheduledAt}
                    minDate={new Date()}
                    placeholder="Elige el día y hora que prefieres"
                  />
                </div>

                {scheduledAt ? (
                  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-primary/5 border border-primary/20">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {scheduledAt.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        a las {scheduledAt.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScheduledAt(undefined)}
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/50 border border-border">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Si no eliges una fecha, el profesional podrá contactarte para acordar el horario.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4 — Confirmación ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 space-y-3">
                <SummaryRow icon={<FileText className="w-4 h-4" />} label="Servicio">
                  <span className="text-sm font-medium text-foreground">
                    {(categories as any[]).find((c: any) => Number(c.id) === catId)?.name ?? w.categoryName}
                  </span>
                </SummaryRow>

                <SummaryRow icon={<Info className="w-4 h-4" />} label="Descripción">
                  <span className="text-sm text-foreground line-clamp-2">{description}</span>
                </SummaryRow>

                <SummaryRow icon={<MapPin className="w-4 h-4" />} label="Dirección">
                  <span className="text-sm text-foreground">{address}</span>
                </SummaryRow>

                <SummaryRow icon={<Clock className="w-4 h-4" />} label="Cuándo">
                  <span className="text-sm text-foreground">
                    {isUrgent
                      ? "🔴 Urgente — ahora mismo"
                      : scheduledAt
                        ? scheduledAt.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" }) + " · " + scheduledAt.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })
                        : "Por acordar con el profesional"}
                  </span>
                </SummaryRow>
              </div>

              {/* Price */}
              <div className={`p-4 border-t border-border ${isUrgent ? "bg-red-50 dark:bg-red-900/10" : pricingMode === "bid" ? "bg-amber-50 dark:bg-amber-900/10" : "bg-primary/5"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {pricingMode === "bid" ? "Tu oferta" : "Precio del servicio"}
                      {isUrgent && " (urgente ×1.5)"}
                    </p>
                    <p className={`text-2xl font-bold ${isUrgent ? "text-red-600" : pricingMode === "bid" ? "text-amber-700" : "text-foreground"}`}>
                      ${displayPrice.toFixed(2)}
                    </p>
                    {bcvData && displayPrice > 0 && (
                      <p className="text-xs text-emerald-600 font-semibold mt-0.5">≈ {formatBs(displayPrice)}</p>
                    )}
                  </div>
                  {bcvData && displayPrice > 0 && (
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-emerald-600">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Tasa BCV</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Bs. {bcvData.rate.toLocaleString("es-VE", { maximumFractionDigits: 2 })} / $1
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">El precio final puede ajustarse con el profesional antes de iniciar.</p>
              </div>
            </div>

            {/* Protection notice */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800">
              <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                <strong>Tu pago está protegido.</strong> El dinero solo se libera cuando tú confirmas que el trabajo quedó listo. Si hay problemas, puedes disputar.
              </p>
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Navigation buttons ────────────────────────────────────────────── */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Atrás
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Continuar <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50
                ${isUrgent ? "bg-red-500 hover:bg-red-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            >
              {isUrgent && <Zap className="w-4 h-4" />}
              {isPending ? "Enviando..." : isUrgent ? "Solicitar ahora (Urgente)" : "Confirmar solicitud"}
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function SummaryRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}
