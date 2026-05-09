import { useState } from "react";
import { X, MapPin, Package, Truck, DollarSign, Loader2, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Product {
  id: number;
  name: string;
  image?: string | null;
  storeId?: number | null;
  priceUsd: number;
}

interface Props {
  product: Product;
  onClose: () => void;
  onCreated: (requestId: number) => void;
}

const DELIVERY_FEE = 3.00;

export function DeliveryRequestModal({ product, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!dropoffAddress.trim()) {
      setError("La dirección de entrega es obligatoria");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/delivery/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: product.id,
          storeId: product.storeId,
          productName: product.name,
          productImage: product.image,
          dropoffAddress,
          deliveryFeeUsd: DELIVERY_FEE,
          notes,
        }),
      });
      setDone(true);
      setTimeout(() => onCreated(data.id), 1200);
    } catch (e: any) {
      setError(e.message ?? "Error al crear la solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="glass rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
            <Truck className="w-4.5 h-4.5" style={{ color: "#3b82f6" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Solicitar Delivery</p>
            <p className="text-xs text-muted-foreground">Envío on-demand</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
                <CheckCircle className="w-8 h-8" style={{ color: "#34d399" }} />
              </div>
              <p className="text-base font-bold text-foreground">¡Solicitud creada!</p>
              <p className="text-sm text-muted-foreground text-center">Buscando repartidores disponibles cerca de ti...</p>
            </div>
          ) : (
            <>
              {/* Product summary */}
              <div className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.05)" }}>
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">${product.priceUsd.toFixed(2)} USD</p>
                </div>
              </div>

              {/* Delivery address */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Dirección de entrega *
                </label>
                <textarea
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  placeholder="Estado, ciudad, sector, calle y número..."
                  value={dropoffAddress}
                  onChange={e => setDropoffAddress(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Notas para el repartidor (opcional)
                </label>
                <input
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Edificio, piso, referencias..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              {/* Price breakdown */}
              <div className="rounded-xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
                  <span className="text-xs text-muted-foreground">Producto</span>
                  <span className="text-xs font-semibold text-foreground">${product.priceUsd.toFixed(2)}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> Tarifa de delivery
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "#3b82f6" }}>
                    +${DELIVERY_FEE.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* How it works */}
              <div className="rounded-xl p-3 space-y-2"
                style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.14)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(147,197,253,0.7)" }}>
                  Cómo funciona
                </p>
                {[
                  "Buscamos repartidores cercanos",
                  "El primero en aceptar toma tu pedido",
                  "Recibes su info y te notificamos en cada paso",
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-black mt-0.5"
                      style={{ background: "rgba(59,130,246,0.2)", color: "#93c5fd" }}>{i + 1}</span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>

              {/* Fee note */}
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Tarifa de ${DELIVERY_FEE.toFixed(2)} USD · El pago se acuerda con el vendedor
                </p>
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="flex-shrink-0 p-4 border-t border-white/[0.06]">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-4 rounded-xl text-white font-black text-base flex items-center justify-center gap-2.5 transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 8px 20px rgba(59,130,246,0.3)" }}
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creando solicitud...</>
              ) : (
                <><Truck className="w-5 h-5" /> Solicitar Delivery · ${DELIVERY_FEE.toFixed(2)}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
