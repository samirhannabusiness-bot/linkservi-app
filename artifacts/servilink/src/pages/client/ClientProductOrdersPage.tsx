import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useBcvRate } from "@/hooks/useBcvRate";
import { compressImageBlob } from "@/lib/imageUtils";
import { RatingModal } from "@/components/ui/RatingModal";
import {
  Package, Clock, CheckCircle, XCircle, Truck, MapPin,
  ChevronDown, ChevronUp, ShoppingBag, Star, Upload, DollarSign,
  Shield, Copy, Check, Banknote, AlertTriangle, TrendingUp, Info, X, Zap
} from "lucide-react";
import { C2PModal } from "@/components/payments/C2PModal";

interface ProductOrder {
  id: number;
  status: string;
  priceUsdAtMoment: number;
  bcvRateAtMoment: number;
  notes: string | null;
  deliveryAddress: string | null;
  paymentProofUrl: string | null;
  paymentMethod: string | null;
  paymentAmount: number | null;
  paymentReference: string | null;
  paymentRejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  productId: number | null;
  productName: string | null;
  productImage: string | null;
  productCategory: string | null;
  hasDelivery: boolean | null;
  storeId: number | null;
  hasRated: boolean;
}

// ── Payment method data (mirrors BookingsListPage) ────────────────────────────
const METHOD_DATA: Record<string, { title: string; color: string; borderColor: string; bgColor: string; titleColor: string; rows: { label: string; value: string; copyable?: boolean }[] }> = {
  pago_movil: {
    title: "Pago Móvil",
    color: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-300 dark:border-blue-700",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    titleColor: "text-blue-800 dark:text-blue-200",
    rows: [
      { label: "Banco", value: "Banco de Venezuela (BdV)" },
      { label: "Teléfono", value: "0414-830-1798", copyable: true },
      { label: "RIF", value: "J-41252119-5", copyable: true },
    ],
  },
  zelle: {
    title: "Zelle",
    color: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-300 dark:border-purple-700",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    titleColor: "text-purple-800 dark:text-purple-200",
    rows: [
      { label: "Correo Zelle", value: "leisterabaja@gmail.com", copyable: true },
    ],
  },
  paypal: {
    title: "PayPal",
    color: "text-indigo-700 dark:text-indigo-300",
    borderColor: "border-indigo-300 dark:border-indigo-700",
    bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
    titleColor: "text-indigo-800 dark:text-indigo-200",
    rows: [
      { label: "Correo PayPal", value: "samirhzv@gmail.com", copyable: true },
    ],
  },
  transferencia: {
    title: "Transferencia Bancaria",
    color: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    titleColor: "text-emerald-800 dark:text-emerald-200",
    rows: [
      { label: "Tipo de cuenta", value: "VES (Bolívares)" },
      { label: "Número de cuenta", value: "0102-0597-29-0000022651", copyable: true },
      { label: "RIF", value: "J-41252119-5", copyable: true },
      { label: "Titular", value: "LinkServi C.A." },
    ],
  },
};

function CopyFieldInline({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/50 dark:bg-black/20 border border-current border-opacity-20 hover:bg-white/80 dark:hover:bg-black/40 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
    </button>
  );
}

function MethodDataCard({ methodId }: { methodId: string }) {
  const [allCopied, setAllCopied] = useState(false);
  const data = METHOD_DATA[methodId];
  if (!data) return null;
  const copyAll = () => {
    const text = data.rows.map(r => `${r.label}: ${r.value}`).join("\n");
    navigator.clipboard.writeText(text).then(() => { setAllCopied(true); setTimeout(() => setAllCopied(false), 2000); });
  };
  return (
    <div className={`rounded-xl border-2 overflow-hidden ${data.borderColor} ${data.bgColor}`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${data.borderColor}`}>
        <p className={`text-sm font-bold ${data.titleColor}`}>📋 Datos de pago — {data.title}</p>
        <button
          onClick={copyAll}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${allCopied ? "bg-emerald-500 text-white border-emerald-500" : `${data.borderColor} ${data.color} hover:bg-white/40 dark:hover:bg-black/20`}`}
        >
          {allCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {allCopied ? "¡Copiado!" : "Copiar datos"}
        </button>
      </div>
      <div className="px-4 py-2 space-y-0">
        {data.rows.map(r => (
          <div key={r.label} className={`flex items-center justify-between py-2.5 border-b last:border-0 ${data.borderColor} border-opacity-40`}>
            <span className={`text-xs font-medium ${data.color} opacity-80 flex-shrink-0`}>{r.label}</span>
            <div className="flex items-center gap-2 min-w-0 ml-3">
              <span className={`text-sm font-bold ${data.titleColor} text-right break-all`}>{r.value}</span>
              {r.copyable && <CopyFieldInline value={r.value} />}
            </div>
          </div>
        ))}
      </div>
      <div className={`px-4 py-2.5 border-t ${data.borderColor} border-opacity-40`}>
        <p className={`text-xs ${data.color} opacity-70`}>✓ Envía el pago a estos datos y luego sube tu comprobante abajo.</p>
      </div>
    </div>
  );
}

// ── PaymentPanel ──────────────────────────────────────────────────────────────
function PaymentPanel({ order, token, onSubmitted }: { order: ProductOrder; token: string; onSubmitted: () => void }) {
  const [selectedMethod, setSelectedMethod] = useState<string>("pago_movil");
  const [proof, setProof] = useState<string | null>(null);
  const [proofName, setProofName] = useState("");
  const [proofPreviewUrl, setProofPreviewUrl] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [c2pOpen, setC2pOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: bcvData, formatBs } = useBcvRate();
  const expectedUsd = Number(order.priceUsdAtMoment) || 0;

  const METHOD_TABS = [
    { id: "pago_movil", label: "Pago Móvil", emoji: "📱" },
    { id: "zelle", label: "Zelle", emoji: "💵" },
    { id: "paypal", label: "PayPal", emoji: "🅿" },
    { id: "transferencia", label: "Transferencia", emoji: "🏦" },
  ];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("La imagen no debe superar 20 MB"); return; }
    setError("");
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setProofPreviewUrl(localUrl);
    try {
      // Compress image before upload (1280px max, JPEG 0.80 → ≈ 200–600 KB)
      const compressed = await compressImageBlob(file);
      const uploadName = file.name.replace(/\.[^.]+$/, ".jpg");
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name: uploadName, size: compressed.size, contentType: "image/jpeg" }),
      });
      if (!urlRes.ok) throw new Error("No se pudo obtener URL de carga");
      const { uploadURL, objectPath } = await urlRes.json();
      const uploadRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: compressed });
      if (!uploadRes.ok) throw new Error("Error al subir el comprobante");
      setProof(objectPath);
      setProofName(uploadName);
    } catch (e: any) {
      setProof("");
      setProofPreviewUrl("");
      setError(e.message ?? "Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!proof) return;
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      setError("Ingresa el monto que pagaste"); return;
    }
    setLoading(true);
    setError("");
    try {
      await apiFetch(`/api/product-orders/${order.id}/submit-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          proofUrl: proof,
          method: selectedMethod,
          paymentAmount: Number(paymentAmount),
          paymentReference: paymentReference || undefined,
        }),
      });
      onSubmitted();
    } catch (e: any) {
      setError(e.message ?? "Error al enviar comprobante");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 space-y-4">
      {/* C2P instant payment CTA */}
      <button
        onClick={() => setC2pOpen(true)}
        className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)", boxShadow: "0 8px 24px rgba(14,165,233,0.3)" }}
      >
        <Zap className="w-4 h-4" /> Pagar al instante con C2P (BDV) — ${expectedUsd.toFixed(2)}
      </button>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <div className="flex-1 h-px bg-white/10" />
        <span>o sube comprobante manual</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Amount to pay */}
      <div className="rounded-xl border-2 border-primary/30 overflow-hidden">
        <div className="p-4 bg-primary/5 text-center">
          <p className="text-xs text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">Total a pagar a LinkServi</p>
          <p className="text-4xl font-black text-foreground tracking-tight">${order.priceUsdAtMoment.toFixed(2)}</p>
          {bcvData && (
            <>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">≈ {formatBs(order.priceUsdAtMoment)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Monto aproximado en bolívares</p>
            </>
          )}
        </div>
        {bcvData && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-t border-emerald-200 dark:border-emerald-800">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Tasa BCV: Bs.&nbsp;{bcvData.rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por $1
            </span>
          </div>
        )}
      </div>

      {/* Security notice */}
      <div className="p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 flex items-start gap-2">
        <Shield className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-red-700 dark:text-red-400">
          ⚠ Paga ÚNICAMENTE a los datos oficiales de LinkServi abajo. Nunca pagues directamente al vendedor.
        </p>
      </div>

      {/* Rejected reason banner */}
      {order.paymentRejectedReason && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-300 dark:bg-red-900/20 dark:border-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700 dark:text-red-400">⚠ Comprobante anterior rechazado</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{order.paymentRejectedReason}</p>
          </div>
        </div>
      )}

      {/* Step 1: Method selector */}
      <div>
        <p className="text-sm font-bold text-foreground mb-3">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold mr-1.5">1</span>
          Elige tu método de pago
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {METHOD_TABS.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMethod(m.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all whitespace-nowrap ${selectedMethod === m.id ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3"><MethodDataCard methodId={selectedMethod} /></div>
      </div>

      {/* Step 2: Upload proof */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-foreground">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold mr-1.5">2</span>
          Sube tu comprobante de pago
        </p>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Monto que pagaste <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="number" min="0" step="0.01"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              placeholder={order.priceUsdAtMoment.toFixed(2)}
              className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {bcvData && paymentAmount && Number(paymentAmount) > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">≈ {formatBs(Number(paymentAmount))}</span>
              <span className="text-xs text-emerald-600/60 dark:text-emerald-500 ml-auto">
                Tasa BCV: Bs.&nbsp;{bcvData.rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por $1
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Número de referencia <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            type="text"
            value={paymentReference}
            onChange={e => setPaymentReference(e.target.value)}
            placeholder="Ej: REF-123456 o número de transacción"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Captura o foto del comprobante <span className="text-red-500">*</span>
          </label>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} disabled={uploading} />
          {uploading ? (
            <div className="w-full py-8 border-2 border-dashed border-primary/40 rounded-xl flex flex-col items-center gap-2 text-primary bg-primary/5">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold">Subiendo comprobante...</p>
            </div>
          ) : !proof ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/20"
            >
              <Upload className="w-7 h-7" />
              <div className="text-center">
                <p className="text-sm font-semibold">Toca aquí para subir la imagen</p>
                <p className="text-xs mt-0.5">Captura de pantalla, foto o PDF · Máx 8 MB</p>
              </div>
            </button>
          ) : (
            <div className="relative">
              {proofPreviewUrl ? (
                <img src={proofPreviewUrl} alt="Comprobante" className="w-full rounded-xl border-2 border-emerald-300 max-h-52 object-contain bg-muted" />
              ) : (
                <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-300 flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm text-foreground font-medium truncate">{proofName}</span>
                </div>
              )}
              <div className="absolute top-2 left-2 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" /> Comprobante subido
              </div>
              <button
                onClick={() => { setProof(null); setProofName(""); setProofPreviewUrl(""); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/90 border border-border flex items-center justify-center shadow"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        disabled={!proof || !paymentAmount || loading || uploading}
        onClick={handleSubmit}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 shadow-sm"
      >
        <Upload className="w-4 h-4 flex-shrink-0" />
        {loading ? "Enviando comprobante..." : uploading ? "Subiendo imagen..." : "Enviar comprobante a LinkServi"}
      </button>

      <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
        <Info className="w-3 h-3 flex-shrink-0" /> LinkServi verificará tu pago en un máximo de 30 minutos
      </p>
      <p className="text-[11px] text-center text-muted-foreground/60">
        ¿Problema con tu pago?{" "}
        <a href="mailto:pagos@linkservi.com" className="text-primary/70 hover:text-primary underline underline-offset-2">
          pagos@linkservi.com
        </a>
      </p>

      {c2pOpen && (
        <C2PModal
          open={c2pOpen}
          onClose={() => setC2pOpen(false)}
          amountUsd={expectedUsd}
          concept={`Pedido #${order.id} — ${order.productName ?? "Producto"}`}
          referenceType="product_order"
          referenceId={order.id}
          onSuccess={() => {
            setC2pOpen(false);
            onSubmitted();
          }}
        />
      )}
    </div>
  );
}

// ── Status config ─────────────────────────────────────────────────────────────
// FASE CHECKOUT MODERNO — labels driven by the new canonical states. The DB
// keeps legacy strings; the API exposes `statusCanonical`. We map both so the
// UI works for in-flight legacy orders as well as new ones.
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente de pago",
  accepted: "Pendiente de pago",
  payment_pending: "Comprobante en verificación",
  payment_confirmed: "Pagado ✓",
  dispatched: "Enviado 🚚",
  delivered: "Entregado ✓",
  cancelled: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-400/20 text-amber-400",
  accepted: "bg-amber-400/20 text-amber-400",
  payment_pending: "bg-cyan-400/20 text-cyan-400",
  payment_confirmed: "bg-teal-400/20 text-teal-400",
  dispatched: "bg-violet-400/20 text-violet-400",
  delivered: "bg-emerald-400/20 text-emerald-400",
  cancelled: "bg-red-400/20 text-red-400",
};

// ── Main page ─────────────────────────────────────────────────────────────────
export function ClientProductOrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [ratingOrder, setRatingOrder] = useState<ProductOrder | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("/api/product-orders/mine", { headers: { Authorization: `Bearer ${token}` } });
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleConfirmDelivery = async (order: ProductOrder) => {
    setConfirming(order.id);
    try {
      await apiFetch(`/api/product-orders/${order.id}/confirm-delivery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
      // Auto-show rating modal after confirming delivery
      setRatingOrder({ ...order, status: "delivered", hasRated: false });
    } catch { /* ignore */ } finally {
      setConfirming(null);
    }
  };

  const handleCancel = async (orderId: number) => {
    setCancelling(orderId);
    try {
      await apiFetch(`/api/product-orders/${orderId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch { /* ignore */ } finally {
      setCancelling(null);
    }
  };

  const PROGRESS_STEPS = [
    { key: "pending", label: "Solicitado", icon: Clock },
    { key: "payment_confirmed", label: "Pago", icon: CheckCircle },
    { key: "dispatched", label: "En camino", icon: Truck },
    { key: "delivered", label: "Entregado", icon: Star },
  ];
  const STATUS_ORDER = ["pending", "accepted", "payment_pending", "payment_confirmed", "dispatched", "delivered"];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mis Compras</h1>
        <p className="text-sm text-muted-foreground mt-1">Historial y estado de tus pedidos de la tienda</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="glass rounded-2xl h-24 animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-foreground font-medium">No tienes pedidos aún</p>
          <p className="text-sm text-muted-foreground mt-1">Visita la tienda y encuentra lo que necesitas</p>
          <a href="/store" className="inline-block mt-4 btn-gradient text-white px-4 py-2 rounded-xl text-sm font-medium">Ir a la tienda</a>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const isExpanded = expanded === o.id;
            const bsTotal = (o.priceUsdAtMoment * o.bcvRateAtMoment).toFixed(2);
            const orderIdx = STATUS_ORDER.indexOf(o.status);

            return (
              <div key={o.id} className="glass rounded-2xl overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : o.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0">
                    {o.productImage ? <img src={o.productImage} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 m-3 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm truncate">{o.productName ?? "Producto"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[o.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Pedido #{o.id} · {new Date(o.createdAt).toLocaleDateString("es-VE")}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-1">
                    <div className="font-bold text-foreground text-sm">${o.priceUsdAtMoment.toFixed(2)}</div>
                    <div className="text-xs text-emerald-400">Bs. {bsTotal}</div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">

                    {/* Progress tracker (4 simplified steps) */}
                    {o.status !== "cancelled" && (
                      <div className="flex items-center gap-1 py-2">
                        {PROGRESS_STEPS.map((step, i, arr) => {
                          const stepOrderIdx = STATUS_ORDER.indexOf(step.key);
                          const isDoneStep = orderIdx >= stepOrderIdx;
                          const Icon = step.icon;
                          return (
                            <div key={step.key} className="flex items-center gap-1 flex-1">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${isDoneStep ? "bg-emerald-400/30 text-emerald-400" : "bg-white/[0.06] text-muted-foreground/40"}`}>
                                  <Icon className="w-3 h-3" />
                                </div>
                                <span className={`text-[9px] whitespace-nowrap ${isDoneStep ? "text-emerald-400" : "text-muted-foreground/40"}`}>{step.label}</span>
                              </div>
                              {i < arr.length - 1 && (
                                <div className={`flex-1 h-px mb-3 ${isDoneStep && orderIdx > STATUS_ORDER.indexOf(arr[i + 1]?.key ?? "") ? "bg-emerald-400/40" : "bg-white/[0.06]"}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {o.deliveryAddress && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
                        <span>{o.deliveryAddress}</span>
                      </div>
                    )}
                    {o.notes && (
                      <div className="bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-muted-foreground">
                        <span className="text-xs font-medium text-foreground/60 block mb-0.5">Tu nota:</span>
                        {o.notes}
                      </div>
                    )}

                    {/* ── Pending or accepted (legacy buy-now path): show payment panel ──
                        Since seller acceptance was eliminated, new single-order purchases
                        land in "pending" instead of "accepted". Both states need the
                        payment panel so the buyer can submit a proof. Group orders
                        complete payment via /checkout, not here. */}
                    {(o.status === "accepted" || (o.status === "pending" && !o.groupId)) && (
                      <PaymentPanel order={o} token={token!} onSubmitted={load} />
                    )}
                    {o.status === "pending" && o.groupId && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-400/10 text-amber-400 text-sm">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        Pendiente de pago — completa el pago desde el carrito agrupado
                      </div>
                    )}

                    {/* ── Payment pending: waiting for admin ── */}
                    {o.status === "payment_pending" && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-400/10 text-cyan-400 text-sm">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        Comprobante enviado — LinkServi lo verificará en máx. 30 minutos
                      </div>
                    )}

                    {/* ── Payment confirmed: waiting for dispatch ── */}
                    {o.status === "payment_confirmed" && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-teal-400/10 text-teal-400 text-sm">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        Pago verificado — el vendedor preparará tu pedido
                      </div>
                    )}

                    {/* ── Shipped (legacy: dispatched) — buyer releases escrow ── */}
                    {o.status === "dispatched" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-400/10 text-violet-400 text-sm">
                          <Truck className="w-4 h-4 flex-shrink-0" />
                          Tu pedido está en camino. Cuando lo recibas, confirma para liberar el pago al vendedor.
                        </div>
                        <button
                          onClick={() => handleConfirmDelivery(o)}
                          disabled={confirming === o.id}
                          data-testid={`btn-recibi-${o.id}`}
                          className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-colors"
                        >
                          {confirming === o.id ? (
                            <span className="animate-pulse">Procesando…</span>
                          ) : (
                            <><CheckCircle className="w-5 h-5" /> Recibí mi producto</>
                          )}
                        </button>
                        <p className="text-[11px] text-muted-foreground text-center">
                          Al confirmar, el pago se libera al vendedor. Solo hazlo si recibiste el producto correctamente.
                        </p>
                      </div>
                    )}

                    {o.status === "delivered" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-400/10 text-emerald-400 text-sm">
                          <CheckCircle className="w-4 h-4" /> ¡Recepción confirmada! El pago fue liberado al vendedor.
                        </div>
                        {o.hasRated ? (
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-400/10 text-amber-400 text-sm">
                            <Star className="w-4 h-4 fill-current" /> Ya calificaste este pedido. ¡Gracias!
                          </div>
                        ) : (
                          <button
                            onClick={() => setRatingOrder(o)}
                            className="w-full py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-400/20 transition-colors"
                          >
                            <Star className="w-4 h-4" /> Calificar producto y tienda
                          </button>
                        )}
                      </div>
                    )}

                    {(o.status === "pending" || o.status === "accepted" || o.status === "payment_pending") && (
                      <button
                        onClick={() => handleCancel(o.id)}
                        disabled={cancelling === o.id || o.status === "payment_pending"}
                        className="w-full py-2 rounded-xl border border-red-400/20 text-red-400 text-xs hover:bg-red-400/10 transition-colors disabled:opacity-30"
                      >
                        {cancelling === o.id ? "Cancelando..." : o.status === "payment_pending" ? "No cancelable (comprobante en revisión)" : "Cancelar pedido"}
                      </button>
                    )}

                    {o.status === "cancelled" && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-400/10 text-red-400 text-sm">
                        <XCircle className="w-4 h-4" /> Pedido cancelado
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rating modal */}
    {ratingOrder && (
      <RatingModal
        orderId={ratingOrder.id}
        productName={ratingOrder.productName ?? "Producto"}
        storeName={null}
        hasStore={!!ratingOrder.storeId}
        onClose={() => setRatingOrder(null)}
        onSubmitted={() => { setRatingOrder(null); load(); }}
      />
    )}
    </div>
  );
}
