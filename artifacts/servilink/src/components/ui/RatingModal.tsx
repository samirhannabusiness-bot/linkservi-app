import { useState } from "react";
import { Star, X, Package, Store, MessageSquare, CheckCircle, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface RatingModalProps {
  orderId: number;
  productName: string;
  storeName: string | null;
  hasStore: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

function StarPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  const STAR_LABELS = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {value > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-500 font-bold">
            {STAR_LABELS[hover || value]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star)}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              className={`w-8 h-8 transition-colors ${star <= (hover || value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function RatingModal({ orderId, productName, storeName, hasStore, onClose, onSubmitted }: RatingModalProps) {
  const { token } = useAuth();
  const [productRating, setProductRating] = useState(0);
  const [storeRating, setStoreRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (productRating === 0) { setError("Selecciona una calificación para el producto"); return; }
    if (hasStore && storeRating === 0) { setError("Selecciona una calificación para la tienda"); return; }

    setLoading(true);
    setError("");
    try {
      await apiFetch(`/api/product-orders/${orderId}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          productRating,
          storeRating: hasStore ? storeRating : undefined,
          comment: comment.trim() || undefined,
        }),
      });
      setDone(true);
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 1800);
    } catch (e: any) {
      setError(e.message ?? "Error al enviar calificación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md glass rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/[0.07]">
          <div>
            <h2 className="text-lg font-black text-foreground">¿Cómo fue tu experiencia?</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">{productName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0 ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">
          {done ? (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-400/15 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-emerald-400" />
              </div>
              <p className="text-lg font-black text-foreground">¡Gracias por tu opinión!</p>
              <p className="text-sm text-muted-foreground">Tu calificación ayuda a otros compradores</p>
            </div>
          ) : (
            <>
              {/* Product rating */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                    <Package className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide">Calificación del producto</p>
                    <p className="text-[11px] text-muted-foreground">Calidad, estado y descripción</p>
                  </div>
                </div>
                <StarPicker value={productRating} onChange={setProductRating} label="¿Qué tal el producto?" />
              </div>

              {/* Store rating (only if belongs to a store) */}
              {hasStore && (
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
                      <Store className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground uppercase tracking-wide">Calificación de la tienda</p>
                      <p className="text-[11px] text-muted-foreground">{storeName ?? "Tienda"} · Servicio y atención</p>
                    </div>
                  </div>
                  <StarPicker value={storeRating} onChange={setStoreRating} label="¿Cómo fue el servicio?" />
                </div>
              )}

              {/* Comment */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  Comentario <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Cuéntanos más sobre tu experiencia..."
                  rows={3}
                  maxLength={500}
                  className="w-full px-4 py-3 rounded-2xl border border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
                />
                <p className="text-right text-[10px] text-muted-foreground mt-1">{comment.length}/500</p>
              </div>

              {error && (
                <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-2xl border border-border text-muted-foreground text-sm font-semibold hover:bg-white/[0.04] transition-colors"
                >
                  Ahora no
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || productRating === 0 || (hasStore && storeRating === 0)}
                  className="flex-1 py-3 rounded-2xl btn-gradient text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                    : <><Star className="w-4 h-4 fill-current" /> Enviar calificación</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
