import { useLocation } from "wouter";
import { useListBookings } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { RolesActivationCard } from "@/components/onboarding/RolesActivationCard";
import {
  Search, Wrench, ShoppingBag, Car, Home as HomeIcon, Tag, Briefcase,
  ChevronRight, Clock, MapPin, Star, Heart, ChevronLeft,
} from "lucide-react";
import { getRequestOptions, track } from "@/lib/api";

interface ModuleCfg {
  id: string;
  label: string;
  desc: string;
  Icon: React.ElementType;
  href: string;
}

const MODULES: ModuleCfg[] = [
  { id: "ondemand",    label: "Servicios",    desc: "Plomeros, electricistas y más", Icon: Wrench,      href: "/client/search" },
  { id: "marketplace", label: "Marketplace",  desc: "Productos cerca de ti",         Icon: ShoppingBag, href: "/store" },
  { id: "transporte",  label: "Transporte",   desc: "Pide tu viaje al instante",     Icon: Car,         href: "/transport" },
  { id: "alquiler",    label: "Alquiler",     desc: "Casas, autos y más",            Icon: HomeIcon,    href: "/store" },
  { id: "clasificados",label: "Clasificados", desc: "Compra y vende fácil",          Icon: Tag,         href: "/clasificados" },
  { id: "empleo",      label: "Consigue personal", desc: "Encuentra talento hoy",      Icon: Briefcase,   href: "/jobs" },
];

interface Booking {
  id?: string;
  workerName?: string;
  categoryName?: string;
  status?: string;
}

export function ClientDashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const opts = getRequestOptions();

  const { data: bookings = [] } = useListBookings(
    { role: "client", status: "accepted" },
    opts as any,
  );
  const { data: pendingBookings = [] } = useListBookings(
    { role: "client", status: "pending" },
    opts as any,
  );

  const acceptedList = bookings as Booking[];
  const totalActivity = acceptedList.length + (pendingBookings as Booking[]).length;
  const activeBooking = acceptedList[0];
  const firstName = user?.name?.split(" ")[0] ?? "";

  const handleSearch = () => {
    track("search_click", { source: "client_dashboard_hero" });
    navigate(totalActivity > 0 ? "/client/bookings" : "/client/search");
  };

  return (
    <AppLayout>
      <div className="max-w-[1100px] mx-auto pb-4">

        {/* ── Servicio en curso ─────────────────────────────────────────── */}
        {activeBooking && (
          <button
            onClick={() => navigate("/client/bookings")}
            className="w-full text-left rounded-2xl p-4 md:p-5 mb-5 flex items-center gap-4 transition-all hover:scale-[1.005] active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg,#06b6d4 0%,#3b82f6 100%)",
              boxShadow: "0 10px 30px -8px rgba(6,182,212,0.35)",
            }}
          >
            <div className="w-12 h-12 rounded-full bg-white/15 grid place-items-center shrink-0">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-cyan-100 font-medium">Servicio en curso</div>
              <div className="font-semibold leading-tight truncate text-white">
                {activeBooking.workerName ?? "Profesional"} — {activeBooking.categoryName ?? "Servicio"}
              </div>
              <div className="flex items-center gap-1 text-xs text-cyan-50 mt-0.5">
                <Clock className="w-3 h-3" /> En progreso
              </div>
            </div>
            <span className="hidden md:inline-flex items-center gap-1 bg-white text-cyan-700 text-sm font-semibold px-3.5 py-2 rounded-xl">
              Ver <ChevronRight className="w-4 h-4" />
            </span>
            <span className="md:hidden bg-white text-cyan-700 text-xs font-semibold px-3 py-2 rounded-lg shrink-0">Ver</span>
          </button>
        )}

        {/* ── Hero + buscador ───────────────────────────────────────────── */}
        <div
          className="relative rounded-3xl p-5 md:p-7 mb-6 overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
               style={{ background: "rgba(6,182,212,0.18)", filter: "blur(80px)" }} />
          <div className="absolute -bottom-24 -left-16 w-56 h-56 rounded-full pointer-events-none"
               style={{ background: "rgba(59,130,246,0.12)", filter: "blur(80px)" }} />
          <div className="relative">
            <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
              {firstName ? `Hola, ${firstName}` : "Hola"}
            </h1>
            <p className="text-sm md:text-base mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
              {totalActivity > 0
                ? `Tienes ${totalActivity} ${totalActivity === 1 ? "solicitud" : "solicitudes"} en curso.`
                : "Encuentra los mejores profesionales y servicios en un solo lugar."}
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
              className="mt-4 flex items-center gap-2 rounded-2xl p-1.5"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="pl-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                <Search className="w-5 h-5" />
              </div>
              <input
                placeholder="¿Qué necesitas hoy?"
                className="flex-1 bg-transparent outline-none text-sm md:text-base text-white px-2 py-2.5"
                style={{ color: "#f1f5f9" }}
              />
              <button
                type="submit"
                className="text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition"
                style={{
                  background: "linear-gradient(135deg,#06b6d4,#3b82f6)",
                  boxShadow: "0 6px 18px -6px rgba(6,182,212,0.45)",
                }}
              >
                {totalActivity > 0 ? "Ver solicitudes" : "Buscar"}
              </button>
            </form>
          </div>
        </div>

        {/* ── Activación de roles (Profesional, Tienda, Conductor, Agente) ── */}
        <div className="mb-6">
          <RolesActivationCard hideActive />
        </div>

        {/* ── Explorar categorías ──────────────────────────────────────── */}
        <section className="mb-7">
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg md:text-xl font-bold text-white">Explorar categorías</h2>
            <button
              onClick={() => navigate("/client/search")}
              className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
            >
              Ver todas
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {MODULES.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(m.href)}
                className="group relative overflow-hidden rounded-2xl transition p-4 md:p-5 text-left"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="w-10 h-10 md:w-11 md:h-11 rounded-xl grid place-items-center mb-3"
                  style={{
                    background: "linear-gradient(135deg,rgba(6,182,212,0.20),rgba(59,130,246,0.20))",
                    border: "1px solid rgba(6,182,212,0.25)",
                  }}
                >
                  <m.Icon className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="text-sm md:text-base font-semibold text-white leading-tight">{m.label}</div>
                <div className="text-[11px] md:text-xs mt-0.5 line-clamp-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {m.desc}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Recomendados (placeholder visual hasta tener API) ────────── */}
        {RECOMMENDED.length > 0 && (
          <section className="mb-4">
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-white">Recomendados para ti</h2>
                <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  <MapPin className="w-3 h-3" /> Cerca de tu ubicación
                </div>
              </div>
              <div className="hidden md:flex items-center gap-1">
                <button className="w-9 h-9 rounded-full grid place-items-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="w-9 h-9 rounded-full grid place-items-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="-mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto">
              <div className="flex gap-3 md:gap-4 pb-2 snap-x snap-mandatory">
                {RECOMMENDED.map((r) => (
                  <article
                    key={r.title}
                    onClick={() => navigate("/client/search")}
                    className="snap-start shrink-0 w-[200px] md:w-[230px] rounded-2xl overflow-hidden cursor-pointer"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="relative w-full h-28 md:h-32" style={{ background: "#0f1724" }}>
                      <img src={r.img} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <span
                        className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md text-cyan-300"
                        style={{ background: "rgba(11,15,25,0.8)", border: "1px solid rgba(6,182,212,0.25)" }}
                      >
                        {r.kind}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full grid place-items-center"
                        style={{
                          background: "rgba(11,15,25,0.8)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.7)",
                        }}
                      >
                        <Heart className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-semibold text-white leading-tight line-clamp-1">{r.title}</div>
                      <div className="flex items-center gap-1 text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-white/80 font-medium">{r.rating}</span>
                        <span>·</span>
                        <span>{r.distance}</span>
                      </div>
                      <div className="mt-1.5 text-sm font-bold text-cyan-400">{r.price}</div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}

const RECOMMENDED: Array<{ kind: string; title: string; price: string; rating: number; distance: string; img: string }> = [
  { kind: "Servicio", title: "Plomería express 24h",     price: "Desde $8",  rating: 4.9, distance: "1.2 km",       img: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600&q=70" },
  { kind: "Producto", title: "Café premium 1kg",         price: "$12,50",    rating: 4.8, distance: "Tienda Sol",    img: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&q=70" },
  { kind: "Servicio", title: "Limpieza profunda hogar",  price: "Desde $25", rating: 5.0, distance: "0.8 km",        img: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&q=70" },
  { kind: "Producto", title: "Fresas frescas 500g",      price: "$4,90",     rating: 4.7, distance: "Frutería Ana",  img: "https://images.unsplash.com/photo-1518635017498-87f514b751ba?w=600&q=70" },
  { kind: "Servicio", title: "Electricista certificado", price: "Desde $15", rating: 4.9, distance: "2.1 km",        img: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&q=70" },
];
