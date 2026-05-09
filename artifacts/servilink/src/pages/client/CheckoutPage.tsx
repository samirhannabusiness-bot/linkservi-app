/**
 * Multi-store cart checkout page (FASE CHECKOUT MODERNO).
 *
 * Flow A — Manual proof:
 *   1. Read cart items from CartContext, group by store.
 *   2. Buyer enters delivery address + selects payment method.
 *   3. Buyer uploads ONE proof for the whole cart.
 *   4. Submit → POST /api/order-groups → POST /api/order-groups/:id/submit-proof
 *   5. Clear cart + navigate to /client/product-orders.
 *
 * Flow B — C2P Instantáneo:
 *   1. Buyer selects "Pago Móvil C2P".
 *   2. Enters delivery address.
 *   3. Click "Pagar con C2P" → POST /api/order-groups → open C2PModal.
 *   4. C2P success → domain effect marks group + child orders as paid.
 *   5. Clear cart + navigate.
 */
import { useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ShoppingBag, Store, MapPin, Shield, Lock, Upload, Image as ImageIcon,
  CheckCircle, Loader2, ArrowLeft, AlertCircle, Zap,
} from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { compressImageBlob } from "@/lib/imageUtils";
import { toast } from "@/hooks/use-toast";
import { useBcvRate } from "@/hooks/useBcvRate";
import { C2PModal, type C2PSuccessPayload } from "@/components/payments/C2PModal";

const PAYMENT_METHODS = [
  { id: "c2p",           label: "C2P ⚡ Instante",  emoji: "📱", instant: true },
  { id: "pago_movil",    label: "Pago Móvil",        emoji: "📲" },
  { id: "zelle",         label: "Zelle",             emoji: "💵" },
  { id: "paypal",        label: "PayPal",            emoji: "🅿" },
  { id: "transferencia", label: "Transferencia",     emoji: "🏦" },
];

export function CheckoutPage() {
  const { items, byStore, totalUsd, totalCount, clear } = useCart();
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const { data: bcvData, formatBs } = useBcvRate();

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("c2p");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // C2P state
  const [c2pOpen, setC2pOpen] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<number | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const totalUsdRounded = useMemo(() => +totalUsd.toFixed(2), [totalUsd]);
  const isC2P = method === "c2p";

  // ── Empty cart guard ────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center mb-4">
            <ShoppingBag className="w-9 h-9 text-white/30" />
          </div>
          <h1 className="text-xl font-bold text-white">Tu carrito está vacío</h1>
          <p className="text-sm text-white/50 mt-1">Agrega productos antes de pagar.</p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-sm"
          >
            Explorar productos
          </button>
        </div>
      </div>
    );
  }

  // ── Proof upload ────────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("La imagen no debe superar 20 MB"); return; }
    setError("");
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setProofPreviewUrl(localUrl);
    try {
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
    } catch (e: any) {
      setProof(null);
      setProofPreviewUrl("");
      setError(e?.message ?? "Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  // ── Create order group (shared by both flows) ───────────────────────────────
  const createGroup = async (): Promise<number | null> => {
    if (!deliveryAddress.trim()) { setError("La dirección de entrega es obligatoria"); return null; }
    setError("");

    const PENDING_KEY = "linkservi_pending_group_v1";
    let groupId: number | null = null;
    try {
      const cached = sessionStorage.getItem(PENDING_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.id === "number") groupId = parsed.id;
      }
    } catch { /* ignore */ }

    if (!groupId) {
      try {
        const groupRes = await apiFetch("/api/order-groups", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
            deliveryAddress,
            notes: notes.trim() || null,
          }),
        }) as { group: { id: number } };
        groupId = groupRes.group.id;
        try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: groupId, ts: Date.now() })); } catch { /* ignore */ }
      } catch (e: any) {
        setError(e?.message ?? "Error al crear el pedido");
        return null;
      }
    }
    return groupId;
  };

  // ── Flow B: open C2P modal ──────────────────────────────────────────────────
  const handlePayWithC2P = async () => {
    setCreatingGroup(true);
    const groupId = await createGroup();
    setCreatingGroup(false);
    if (!groupId) return;
    setPendingGroupId(groupId);
    setC2pOpen(true);
  };

  const handleC2PSuccess = (_payload: C2PSuccessPayload) => {
    setC2pOpen(false);
    try { sessionStorage.removeItem("linkservi_pending_group_v1"); } catch { /* ignore */ }
    clear();
    toast({ title: "✅ ¡Pago confirmado!", description: "Tu pedido está confirmado. Las tiendas empezarán a prepararlo." });
    navigate("/client/product-orders");
  };

  // ── Flow A: manual proof submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!deliveryAddress.trim()) { setError("La dirección de entrega es obligatoria"); return; }
    if (!proof) { setError("Sube tu comprobante de pago"); return; }
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      setError("Ingresa el monto que pagaste"); return;
    }

    setSubmitting(true);
    const PENDING_KEY = "linkservi_pending_group_v1";
    let groupId: number | null = null;
    try {
      const cached = sessionStorage.getItem(PENDING_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.id === "number") groupId = parsed.id;
      }
    } catch { /* ignore */ }

    try {
      if (!groupId) {
        const groupRes = await apiFetch("/api/order-groups", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
            deliveryAddress,
            notes: notes.trim() || null,
          }),
        }) as { group: { id: number } };
        groupId = groupRes.group.id;
        try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: groupId, ts: Date.now() })); } catch { /* ignore */ }
      }

      await apiFetch(`/api/order-groups/${groupId}/submit-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          proofUrl: proof,
          method,
          paymentAmount: Number(paymentAmount),
          paymentReference: paymentReference || undefined,
        }),
      });

      try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
      clear();
      toast({ title: "¡Pedido enviado!", description: "Tu comprobante está siendo verificado. Te avisaremos cuando se confirme." });
      navigate("/client/product-orders");
    } catch (e: any) {
      setError(e?.message ?? "Error al enviar el pedido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/")}
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
          aria-label="Volver"
        >
          <ArrowLeft className="w-4 h-4 text-white/80" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Checkout</h1>
          <p className="text-sm text-white/50">{totalCount} {totalCount === 1 ? "producto" : "productos"} · pago único</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Cart summary ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <header className="px-4 py-3 border-b border-white/10 flex items-center gap-2 text-sm font-semibold text-white">
            <ShoppingBag className="w-4 h-4 text-cyan-300" /> Resumen del pedido
          </header>
          <div className="divide-y divide-white/5">
            {byStore.map((g) => (
              <div key={String(g.storeId ?? "no-store")} className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs text-white/50 uppercase tracking-wider">
                  <Store className="w-3.5 h-3.5" /> {g.storeName ?? "Tienda"}
                </div>
                {g.items.map((it) => (
                  <div key={it.productId} className="flex items-center gap-3" data-testid={`checkout-line-${it.productId}`}>
                    <div className="w-12 h-12 rounded-lg bg-black/40 overflow-hidden flex-shrink-0">
                      {it.image ? <img src={it.image} alt={it.name} className="w-full h-full object-cover" loading="lazy" /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{it.name}</p>
                      <p className="text-xs text-white/50">x{it.quantity} · ${it.priceUsd.toFixed(2)} c/u</p>
                    </div>
                    <p className="text-sm font-bold text-white tabular-nums">${(it.priceUsd * it.quantity).toFixed(2)}</p>
                  </div>
                ))}
                <div className="text-right text-xs text-white/40">
                  Subtotal: <span className="text-white/80 font-semibold">${g.subtotalUsd.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-cyan-500/5 border-t border-cyan-500/20 flex items-center justify-between">
            <span className="text-sm text-white/70">Total a pagar</span>
            <span className="text-2xl font-black text-white tabular-nums" data-testid="checkout-total">
              ${totalUsdRounded.toFixed(2)}
            </span>
          </div>
          {bcvData && (
            <div className="px-4 py-2 text-[11px] text-emerald-300 bg-emerald-500/5 border-t border-emerald-500/15 text-right">
              ≈ {formatBs(totalUsdRounded)} (BCV)
            </div>
          )}
        </section>

        {/* ── Delivery + notes ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <header className="flex items-center gap-2 text-sm font-semibold text-white">
            <MapPin className="w-4 h-4 text-cyan-300" /> Entrega
          </header>
          <div className="space-y-2">
            <label className="text-xs text-white/60 font-medium">Dirección de entrega *</label>
            <textarea
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Calle, número, referencia, ciudad…"
              rows={2}
              data-testid="checkout-address"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/60 font-medium">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Indicaciones adicionales para los vendedores…"
              rows={2}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </section>

        {/* ── Payment method ────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <header className="flex items-center gap-2 text-sm font-semibold text-white">
            <Shield className="w-4 h-4 text-emerald-300" /> Método de pago
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                data-testid={`pay-method-${m.id}`}
                className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  method === m.id
                    ? m.instant
                      ? "bg-sky-500/20 border border-sky-400/50 text-sky-100"
                      : "bg-cyan-500/15 border border-cyan-500/40 text-cyan-100"
                    : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                }`}
              >
                <span className="mr-1">{m.emoji}</span> {m.label}
              </button>
            ))}
          </div>

          {/* ── C2P instant payment ─────────────────────────────────────── */}
          {isC2P && (
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.20)" }}>
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#38bdf8" }} />
                <div>
                  <p className="text-sm font-bold text-white">Pago Móvil C2P — Banco de Venezuela</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                    El banco te envía una clave por SMS. Tu pago se confirma al instante, sin esperar verificación manual.
                  </p>
                </div>
              </div>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.40)" }}>
                Solo necesitas ingresar tu dirección de entrega arriba y hacer clic en el botón de abajo para iniciar el pago.
              </p>
            </div>
          )}

          {/* ── Manual proof (non-C2P) ──────────────────────────────────── */}
          {!isC2P && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-white/60 font-medium">Monto pagado (USD) *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={totalUsdRounded.toFixed(2)}
                    data-testid="checkout-amount"
                    className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/60 font-medium">Referencia (opcional)</label>
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Últimos dígitos…"
                    className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleFile}
                  data-testid="checkout-proof-input"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={`w-full py-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                    proof
                      ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                      : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                  data-testid="checkout-proof-btn"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo…</>
                  ) : proof ? (
                    <><CheckCircle className="w-4 h-4" /> Comprobante listo · cambiar</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Subir comprobante (imagen)</>
                  )}
                </button>
                {proofPreviewUrl && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-white/10 bg-black/30">
                    <img src={proofPreviewUrl} alt="Comprobante" className="w-full max-h-56 object-contain" />
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-[11px] text-white/50">
                <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-400" />
                <p>
                  LinkServi retiene tu pago. Tras verificarlo, las tiendas preparan los productos.
                  Recibirás cada producto y luego confirmas la recepción para liberar el pago.
                </p>
              </div>
            </div>
          )}
        </section>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── CTA button ───────────────────────────────────────────────── */}
        {isC2P ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={creatingGroup}
            onClick={handlePayWithC2P}
            data-testid="checkout-submit-c2p"
            className="w-full py-4 rounded-2xl text-white font-black text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{
              background: creatingGroup ? "#0369a1" : "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0284c7 100%)",
              boxShadow: "0 10px 30px rgba(56,189,248,0.35)",
            }}
          >
            {creatingGroup ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Creando pedido…</>
            ) : (
              <><Zap className="w-5 h-5" /> Pagar ${totalUsdRounded.toFixed(2)} con C2P · Banco de Venezuela</>
            )}
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={submitting || uploading || !proof}
            onClick={handleSubmit}
            data-testid="checkout-submit"
            className="w-full py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-white/5 disabled:text-white/30 text-white font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/20 transition-colors"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Procesando…</>
            ) : (
              <><Shield className="w-5 h-5" /> Enviar comprobante · ${totalUsdRounded.toFixed(2)}</>
            )}
          </motion.button>
        )}
      </div>

      {/* C2P Modal */}
      {c2pOpen && pendingGroupId && (
        <C2PModal
          open={c2pOpen}
          onClose={() => setC2pOpen(false)}
          amountUsd={totalUsdRounded}
          concept={`Pedido carrito LinkServi #${pendingGroupId}`}
          referenceType="order_group"
          referenceId={pendingGroupId}
          onSuccess={handleC2PSuccess}
        />
      )}
    </div>
  );
}
