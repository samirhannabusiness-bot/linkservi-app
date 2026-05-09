import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useBcvRate } from "@/hooks/useBcvRate";
import {
  Lock, Loader2, ShoppingBag, Store, X, CheckCircle,
  Minus, Plus, Shield, BadgeCheck, AlertTriangle, Truck
} from "lucide-react";

interface Product {
  id: number;
  name: string;
  priceUsd: number;
  image?: string | null;
  storeName?: string | null;
  storeId?: number | null;
  stock?: number | null;
  hasDelivery?: boolean;
}

interface Props {
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}

export function BuyProductModal({ product, onClose, onSuccess }: Props) {
  const { token } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const { data: bcvData } = useBcvRate();

  const maxQty = product.stock ?? 99;
  const subtotal = +(product.priceUsd * quantity).toFixed(2);
  const subtotalVes = +(subtotal * (bcvData?.rate ?? 36)).toFixed(0);

  const handleBuy = async () => {
    if (!deliveryAddress.trim()) { setError("La dirección de entrega es obligatoria"); return; }
    setError("");
    setPlacing(true);
    const combinedNotes = quantity > 1
      ? `Cantidad: ${quantity}${notes.trim() ? ` | ${notes.trim()}` : ""}`
      : notes.trim() || null;
    try {
      await apiFetch("/api/product-orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          deliveryAddress: deliveryAddress.trim(),
          notes: combinedNotes,
        }),
      });
      setSuccess(true);
      setTimeout(() => { onSuccess(); }, 1500);
    } catch (err: any) {
      setError(err?.message ?? "Error al realizar el pedido");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {success ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-bold text-lg">¡Pedido enviado!</p>
              <p className="text-sm text-muted-foreground mt-1">Puedes ver el estado en "Mis Compras"</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-white/[0.06] flex-shrink-0">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#12131a] flex items-center justify-center flex-shrink-0">
                {product.image ? (
                  <img src={product.image} alt="" className="w-full h-full object-contain p-1" />
                ) : (
                  <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-sm line-clamp-2">{product.name}</h3>
                {product.storeName && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Store className="w-3 h-3" /> {product.storeName}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Escrow notice */}
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tu pago queda <span className="text-foreground font-bold">retenido en escrow</span>. Se libera al vendedor solo cuando confirmes que recibiste el producto en perfecto estado.
                </p>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">Pago protegido</p>
                    <p className="text-[9px] text-muted-foreground">100% seguro</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                  <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">Garantía total</p>
                    <p className="text-[9px] text-muted-foreground">o reembolso</p>
                  </div>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block font-medium">Cantidad</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xl font-black text-foreground w-8 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => Math.min(maxQty, q + 1))}
                    className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                    disabled={quantity >= maxQty}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <span className="ml-1 text-sm text-muted-foreground">× ${product.priceUsd.toFixed(2)}</span>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
                  <span className="text-xs text-muted-foreground">Subtotal ({quantity} unid.)</span>
                  <span className="text-sm font-semibold text-foreground">${subtotal.toFixed(2)}</span>
                </div>
                {product.hasDelivery && (
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> Delivery</span>
                    <span className="text-xs font-semibold text-emerald-400">Gratis</span>
                  </div>
                )}
                <div className="px-4 py-2.5 flex items-center justify-between bg-white/[0.03]">
                  <span className="text-sm font-bold text-foreground">Total</span>
                  <div className="text-right">
                    <p className="text-base font-black text-foreground">${subtotal.toFixed(2)} USD</p>
                    <p className="text-[10px] text-emerald-400">Bs. {subtotalVes.toLocaleString("es-VE")}</p>
                  </div>
                </div>
              </div>

              {/* Delivery address */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Dirección de entrega *</label>
                <textarea
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  placeholder="Estado, ciudad, municipio, sector y calle..."
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Notas adicionales</label>
                <input
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Color, talla, instrucciones especiales..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                </div>
              )}
            </div>

            {/* Confirm */}
            <div className="flex-shrink-0 p-4 border-t border-white/[0.06] space-y-2">
              <button
                onClick={handleBuy}
                disabled={placing}
                className="w-full py-4 rounded-xl btn-gradient text-white font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all disabled:opacity-60"
              >
                {placing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</>
                ) : (
                  <><Lock className="w-5 h-5" /> Confirmar compra · ${subtotal.toFixed(2)}</>
                )}
              </button>
              <button onClick={onClose} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
