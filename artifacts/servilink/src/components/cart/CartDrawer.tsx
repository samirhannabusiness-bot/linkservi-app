/**
 * Slide-over cart drawer — Amazon/MercadoLibre style.
 * Shows items grouped by store with thumbnail + qty stepper, footer total,
 * and CTA to navigate to /checkout.
 */
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2, Store, ShoppingCart, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useCart } from "@/lib/cart-context";

export function CartDrawer() {
  const { isOpen, closeDrawer, byStore, totalUsd, totalCount, updateQty, removeItem } = useCart();
  const [, navigate] = useLocation();

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDrawer]);

  function goCheckout() {
    closeDrawer();
    navigate("/checkout");
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm"
            onClick={closeDrawer}
          />

          {/* Drawer */}
          <motion.aside
            key="cart-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-[401] w-full sm:w-[440px] bg-[#0a1628] border-l border-white/10 flex flex-col shadow-2xl"
            data-testid="cart-drawer"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <h2 className="text-white font-bold">Mi carrito</h2>
                  <p className="text-xs text-white/50">{totalCount} {totalCount === 1 ? "producto" : "productos"}</p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Cerrar carrito"
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {byStore.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    <ShoppingCart className="w-7 h-7 text-white/30" />
                  </div>
                  <p className="text-white/70 font-semibold">Tu carrito está vacío</p>
                  <p className="text-xs text-white/40 mt-1">Explora tiendas y agrega productos.</p>
                </div>
              ) : (
                byStore.map((g) => (
                  <div key={String(g.storeId ?? "no-store")} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-white/60 uppercase tracking-wider">
                      <Store className="w-3.5 h-3.5" />
                      <span className="truncate">{g.storeName ?? "Tienda"}</span>
                    </div>
                    <div className="space-y-2">
                      {g.items.map((it) => (
                        <div
                          key={it.productId}
                          className="bg-white/5 border border-white/10 rounded-xl p-3 flex gap-3"
                          data-testid={`cart-item-${it.productId}`}
                        >
                          <div className="w-16 h-16 rounded-lg bg-black/40 overflow-hidden flex-shrink-0">
                            {it.image ? (
                              <img src={it.image} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-semibold truncate">{it.name}</p>
                            <p className="text-xs text-cyan-300 font-bold mt-0.5">${(it.priceUsd * it.quantity).toFixed(2)}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex items-center bg-black/40 rounded-lg border border-white/10">
                                <button
                                  onClick={() => updateQty(it.productId, it.quantity - 1)}
                                  className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white"
                                  aria-label="Quitar uno"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-7 text-center text-xs font-semibold text-white tabular-nums">{it.quantity}</span>
                                <button
                                  onClick={() => updateQty(it.productId, it.quantity + 1)}
                                  className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white"
                                  aria-label="Agregar uno"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <button
                                onClick={() => removeItem(it.productId)}
                                className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10"
                                aria-label="Eliminar producto"
                                data-testid={`cart-remove-${it.productId}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-right text-xs text-white/40">
                      Subtotal tienda: <span className="text-white/80 font-semibold">${g.subtotalUsd.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {byStore.length > 0 && (
              <div className="border-t border-white/10 px-5 py-4 space-y-3 bg-[#040c1a]">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Total</span>
                  <span className="text-xl font-bold text-white tabular-nums" data-testid="cart-total-usd">
                    ${totalUsd.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={goCheckout}
                  data-testid="cart-checkout-btn"
                  className="w-full h-12 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  Ir a checkout
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-white/40 text-center">Pago único, escrow protegido por LinkServi.</p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
