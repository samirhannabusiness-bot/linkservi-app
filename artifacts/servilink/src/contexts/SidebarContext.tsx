import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const COMPACT_KEY = "sl_sidebar_compact";

interface SidebarCtx {
  compact: boolean;
  toggleCompact: () => void;
}

const SidebarContext = createContext<SidebarCtx>({ compact: false, toggleCompact: () => {} });

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState<boolean>(() => {
    try { return localStorage.getItem(COMPACT_KEY) === "1"; } catch { return false; }
  });

  const toggleCompact = useCallback(() => {
    setCompact(v => {
      const next = !v;
      try { localStorage.setItem(COMPACT_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ compact, toggleCompact }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebarCompact = () => useContext(SidebarContext);
