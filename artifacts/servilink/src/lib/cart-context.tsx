/**
 * Multi-store shopping cart context (FASE CHECKOUT MODERNO).
 *
 * Persisted to localStorage under `linkservi_cart_v1` so a refresh, tab close,
 * or login flow does not nuke the buyer's selection.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartItem {
  productId: number;
  name: string;
  image?: string | null;
  priceUsd: number;
  storeId: number | null;
  storeName?: string | null;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  updateQty: (productId: number, qty: number) => void;
  removeItem: (productId: number) => void;
  clear: () => void;
  totalCount: number;
  totalUsd: number;
  byStore: Array<{ storeId: number | null; storeName: string | null; items: CartItem[]; subtotalUsd: number }>;
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "linkservi_cart_v1";

function readStored(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is CartItem =>
      x && typeof x.productId === "number" && typeof x.priceUsd === "number" && typeof x.quantity === "number"
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => readStored());
  const [isOpen, setIsOpen] = useState(false);

  // Persist on every change
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* quota or private mode — ignore */
    }
  }, [items]);

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setItems(readStored());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const totalCount = items.reduce((s, it) => s + it.quantity, 0);
    const totalUsd = +items.reduce((s, it) => s + it.priceUsd * it.quantity, 0).toFixed(2);

    const groupMap = new Map<string, { storeId: number | null; storeName: string | null; items: CartItem[]; subtotalUsd: number }>();
    for (const it of items) {
      const key = String(it.storeId ?? "no-store");
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          storeId: it.storeId ?? null,
          storeName: it.storeName ?? null,
          items: [],
          subtotalUsd: 0,
        });
      }
      const g = groupMap.get(key)!;
      g.items.push(it);
      g.subtotalUsd = +(g.subtotalUsd + it.priceUsd * it.quantity).toFixed(2);
    }

    return {
      items,
      addItem: (item, qty = 1) => {
        setItems((cur) => {
          const idx = cur.findIndex((x) => x.productId === item.productId);
          if (idx === -1) return [...cur, { ...item, quantity: Math.max(1, qty) }];
          const next = [...cur];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
          return next;
        });
      },
      updateQty: (productId, qty) => {
        setItems((cur) => {
          if (qty <= 0) return cur.filter((x) => x.productId !== productId);
          return cur.map((x) => (x.productId === productId ? { ...x, quantity: qty } : x));
        });
      },
      removeItem: (productId) => setItems((cur) => cur.filter((x) => x.productId !== productId)),
      clear: () => setItems([]),
      totalCount,
      totalUsd,
      byStore: [...groupMap.values()],
      isOpen,
      openDrawer: () => setIsOpen(true),
      closeDrawer: () => setIsOpen(false),
    };
  }, [items, isOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
