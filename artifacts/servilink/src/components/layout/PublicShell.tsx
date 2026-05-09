import { type ReactNode } from "react";
import { TrustBand } from "./TrustBand";
import { PublicMarketplaceHeader } from "./PublicMarketplaceHeader";
import { PublicMarketplaceFooter } from "./PublicMarketplaceFooter";
import { CartDrawer } from "@/components/cart/CartDrawer";

/**
 * PublicShell — Trust First chrome for all public marketplace pages.
 *
 * Wraps page content with:
 *   - Trust band (top: escrow + verified + 24/7)
 *   - Sticky header (logo + search + cart + sub-nav)
 *   - Footer (4 trust badges + link columns + legal)
 *   - Global cart drawer (so the header cart button works standalone)
 *
 * Use on: PublicStorePage, LandingPage, ClasificadosPage, PublicWorkerPage,
 * BlogIndexPage, BlogArticlePage, GlobalSearchResultsPage, etc.
 *
 * Do NOT use inside AppLayout (authenticated areas) — they have their own shell.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0e1a] text-white font-sans antialiased flex flex-col">
      <TrustBand />
      <PublicMarketplaceHeader />
      <main className="flex-1 min-w-0">
        {children}
      </main>
      <PublicMarketplaceFooter />
      <CartDrawer />
    </div>
  );
}
