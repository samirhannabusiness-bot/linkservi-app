import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  Search, ShoppingBag, MapPin, ChevronRight, Zap, User, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";

const SUB_NAV: { label: string; href: string }[] = [
  { label: "Categorías",        href: "/buscar" },
  { label: "Servicios",         href: "/search" },
  { label: "Productos",         href: "/store" },
  { label: "Transporte",        href: "/transport" },
  { label: "Clasificados",      href: "/clasificados" },
  { label: "Empleos",           href: "/jobs" },
  { label: "Cómo te protegemos", href: "/terms" },
];

export function PublicMarketplaceHeader() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { totalCount, openDrawer } = useCart();
  const [query, setQuery] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/buscar?q=${encodeURIComponent(q)}` : "/buscar");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0e1a]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 md:gap-5 px-4 md:px-6 py-3 md:py-4">
        {/* Logo */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 shrink-0"
          aria-label="LinkServi - Inicio"
        >
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#00daf3] text-[#001318]">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">LinkServi</span>
        </button>

        {/* Location (desktop only) */}
        <button
          type="button"
          className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06] transition-colors lg:inline-flex"
        >
          <MapPin className="h-4 w-4 text-[#00daf3]" />
          <span className="text-slate-400">Enviar a</span>
          <span className="font-semibold text-white">Caracas</span>
          <ChevronRight className="h-4 w-4 rotate-90 text-slate-500" />
        </button>

        {/* Search */}
        <form onSubmit={onSearch} className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar servicios, productos o profesionales…"
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-11 pr-24 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#00daf3]/50 focus:ring-2 focus:ring-[#00daf3]/20 transition"
            aria-label="Buscar"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-[#00daf3] px-4 py-1.5 text-sm font-semibold text-[#001318] hover:brightness-110 transition"
          >
            Buscar
          </button>
        </form>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!user && (
            <button
              onClick={() => navigate("/login")}
              className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06] sm:inline-flex transition-colors"
            >
              <User className="h-4 w-4" />
              Ingresar
            </button>
          )}
          {user && (
            <button
              onClick={() => navigate(
                user.role === "worker" ? "/professional"
                  : user.role === "cohost" ? "/cohost"
                  : user.role === "seller" ? "/seller"
                  : user.role === "admin"  ? "/admin"
                  : "/client"
              )}
              className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06] sm:inline-flex transition-colors"
              title={(user as any).fullName ?? user.email ?? "Mi cuenta"}
            >
              <User className="h-4 w-4" />
              Mi cuenta
            </button>
          )}
          <button
            onClick={openDrawer}
            className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            aria-label={`Abrir carrito${totalCount > 0 ? ` (${totalCount} artículos)` : ""}`}
          >
            <ShoppingBag className="h-5 w-5 text-slate-200" />
            {totalCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#00daf3] px-1 text-[10px] font-bold text-[#001318]">
                {totalCount > 99 ? "99+" : totalCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 md:px-6 py-2 text-sm text-slate-400 scrollbar-hide">
          {SUB_NAV.map((l, i) => (
            <button
              key={l.label}
              onClick={() => navigate(l.href)}
              className={`whitespace-nowrap py-1 hover:text-white transition-colors ${
                i === 0 ? "font-semibold text-white" : ""
              }`}
            >
              {l.label}
            </button>
          ))}
          <span className="ml-auto hidden md:inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
            <CheckCircle2 className="h-3.5 w-3.5" /> 12.480 trabajos protegidos esta semana
          </span>
        </div>
      </div>
    </header>
  );
}
