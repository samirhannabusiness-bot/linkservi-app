/**
 * Floating cart icon with badge — placed next to the notification bell.
 * Clicking opens the cart drawer.
 */
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { motion, AnimatePresence } from "framer-motion";

export function CartButton() {
  const { totalCount, openDrawer } = useCart();

  return (
    <button
      onClick={openDrawer}
      data-testid="cart-button"
      aria-label="Abrir carrito"
      className="relative w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
    >
      <ShoppingCart className="w-5 h-5 text-white/80" />
      <AnimatePresence>
        {totalCount > 0 && (
          <motion.span
            key={totalCount}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_10px_rgba(34,211,238,.5)]"
            data-testid="cart-badge"
          >
            {totalCount > 99 ? "99+" : totalCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
