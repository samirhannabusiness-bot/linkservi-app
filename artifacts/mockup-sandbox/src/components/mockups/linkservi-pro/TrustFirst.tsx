import {
  Search,
  ShoppingBag,
  Star,
  Shield,
  ShieldCheck,
  MapPin,
  ChevronRight,
  Zap,
  Lock,
  Headphones,
  BadgeCheck,
  Clock,
  CheckCircle2,
  Briefcase,
  Truck,
  Wrench,
  Scale,
  Sparkles,
  Home as HomeIcon,
  Utensils,
  PartyPopper,
  Cpu,
  User,
  ArrowRight,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
} from "lucide-react";

const categories = [
  { name: "Tecnología", icon: Cpu, count: "2.4k" },
  { name: "Hogar", icon: HomeIcon, count: "1.8k" },
  { name: "Servicios Legales", icon: Scale, count: "320" },
  { name: "Transporte", icon: Truck, count: "950" },
  { name: "Belleza", icon: Sparkles, count: "1.2k" },
  { name: "Reparaciones", icon: Wrench, count: "1.5k" },
  { name: "Comida", icon: Utensils, count: "2.1k" },
  { name: "Eventos", icon: PartyPopper, count: "480" },
];

const pros = [
  {
    name: "María González",
    category: "Diseño Web · Frontend",
    img: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80",
    rating: 4.9,
    reviews: 218,
    jobs: 342,
    response: "15 min",
    price: "Desde $25",
    location: "Caracas",
  },
  {
    name: "Carlos Ramírez",
    category: "Reparación Electrodomésticos",
    img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
    rating: 5.0,
    reviews: 412,
    jobs: 589,
    response: "8 min",
    price: "Desde Bs 1.200",
    location: "Maracaibo",
  },
  {
    name: "Tienda TechVe",
    category: "Laptops y Accesorios",
    img: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&q=80",
    rating: 4.8,
    reviews: 1024,
    jobs: 2150,
    response: "5 min",
    price: "Desde $180",
    location: "Caracas",
  },
  {
    name: "Sabor Caribe",
    category: "Comida a domicilio",
    img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80",
    rating: 4.9,
    reviews: 678,
    jobs: 1890,
    response: "12 min",
    price: "Desde $8",
    location: "Caracas",
  },
  {
    name: "Andrea Suárez",
    category: "Abogada Civil y Mercantil",
    img: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80",
    rating: 5.0,
    reviews: 156,
    jobs: 198,
    response: "30 min",
    price: "Desde $45",
    location: "Valencia",
  },
  {
    name: "RideVe Drivers",
    category: "Transporte ejecutivo",
    img: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=400&q=80",
    rating: 4.7,
    reviews: 2890,
    jobs: 12400,
    response: "3 min",
    price: "Desde $5",
    location: "Caracas",
  },
];

const pillars = [
  {
    icon: Lock,
    title: "Pago en Escrow",
    desc: "Tu dinero queda retenido por LinkServi hasta que confirmes que el trabajo está completo.",
  },
  {
    icon: ShieldCheck,
    title: "Verificación KYC",
    desc: "Cada profesional pasa por verificación de identidad, cédula y antecedentes.",
  },
  {
    icon: BadgeCheck,
    title: "Seguro de respaldo",
    desc: "Hasta $500 de cobertura por servicio en caso de incumplimiento o daños.",
  },
  {
    icon: Headphones,
    title: "Soporte 24/7",
    desc: "Equipo humano disponible las 24 horas, listo para mediar cualquier disputa.",
  },
];

function VerifiedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#00daf3]/10 px-2 py-0.5 text-[11px] font-semibold text-[#00daf3] ring-1 ring-inset ring-[#00daf3]/30">
      <ShieldCheck className="h-3 w-3" />
      Verificado
    </span>
  );
}

function EscrowPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
      <Lock className="h-3 w-3" />
      Escrow
    </span>
  );
}

export function TrustFirst() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white font-['Inter'] antialiased">
      {/* Trust band */}
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-[#001318] via-[#00181f] to-[#001318]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-2 text-[12px] text-slate-300">
          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[#00daf3]" />
              Pago protegido por <span className="font-semibold text-white">LinkServi Escrow</span>
            </span>
            <span className="hidden items-center gap-1.5 md:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5 text-[#00daf3]" />
              Profesionales verificados
            </span>
            <span className="hidden items-center gap-1.5 lg:inline-flex">
              <Headphones className="h-3.5 w-3.5 text-[#00daf3]" />
              Soporte 24/7
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="hidden md:inline">Bs. 36,42 / USD</span>
            <a className="hover:text-white" href="#">Ayuda</a>
            <a className="hover:text-white" href="#">Vender en LinkServi</a>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0e1a]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-6 py-4">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#00daf3] text-[#001318]">
              <Zap className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">LinkServi</span>
          </a>

          {/* Location */}
          <button className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06] md:inline-flex">
            <MapPin className="h-4 w-4 text-[#00daf3]" />
            <span className="text-slate-400">Enviar a</span>
            <span className="font-semibold text-white">Caracas</span>
            <ChevronRight className="h-4 w-4 rotate-90 text-slate-500" />
          </button>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar servicios, productos o profesionales verificados…"
              className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-11 pr-28 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#00daf3]/50 focus:ring-2 focus:ring-[#00daf3]/20"
            />
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-[#00daf3] px-4 py-1.5 text-sm font-semibold text-[#001318] hover:brightness-110">
              Buscar
            </button>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06] sm:inline-flex">
              <User className="h-4 w-4" />
              Ingresar
            </button>
            <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]">
              <ShoppingBag className="h-5 w-5 text-slate-200" />
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#00daf3] px-1 text-[10px] font-bold text-[#001318]">
                3
              </span>
            </button>
          </div>
        </div>

        {/* Sub-nav */}
        <div className="border-t border-white/[0.04]">
          <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-6 py-2 text-sm text-slate-400">
            {[
              "Categorías",
              "Servicios",
              "Productos",
              "Transporte",
              "Clasificados",
              "Ofertas",
              "Cómo te protegemos",
            ].map((l, i) => (
              <a
                key={l}
                href="#"
                className={`whitespace-nowrap py-1 hover:text-white ${
                  i === 0 ? "font-semibold text-white" : ""
                }`}
              >
                {l}
              </a>
            ))}
            <span className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
              <CheckCircle2 className="h-3.5 w-3.5" /> 12.480 trabajos protegidos esta semana
            </span>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(800px 400px at 80% -10%, rgba(0,218,243,0.18), transparent 60%), radial-gradient(600px 400px at 0% 10%, rgba(0,218,243,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00daf3]/30 bg-[#00daf3]/10 px-3 py-1 text-xs font-semibold text-[#00daf3]">
              <ShieldCheck className="h-3.5 w-3.5" />
              ServiMarket #1 de Venezuela con pago protegido
            </div>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Contrata sin miedo.<br />
              <span className="bg-gradient-to-r from-[#00daf3] to-[#7af0ff] bg-clip-text text-transparent">
                Compra con respaldo.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-400">
              Servicios, productos y transporte en un solo lugar. Cada pago queda en
              custodia hasta que confirmes que todo salió bien. Sin sorpresas, sin riesgos.
            </p>

            {/* Hero search */}
            <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 shadow-2xl backdrop-blur sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <input
                  className="h-12 w-full rounded-xl bg-transparent pl-12 pr-4 text-sm text-white placeholder:text-slate-500 outline-none"
                  placeholder="¿Qué necesitas hoy? Ej: plomero, laptop, mudanza…"
                />
              </div>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#00daf3] px-6 text-sm font-bold text-[#001318] hover:brightness-110">
                Buscar protegido
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Trust mini-stats */}
            <div className="mt-7 grid grid-cols-3 gap-6">
              <div>
                <div className="text-2xl font-bold tracking-tight">98.7%</div>
                <div className="text-xs text-slate-500">trabajos completados con éxito</div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight">$2.4M+</div>
                <div className="text-xs text-slate-500">protegidos en escrow este mes</div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight">24.500+</div>
                <div className="text-xs text-slate-500">profesionales verificados</div>
              </div>
            </div>
          </div>

          {/* Hero card cluster */}
          <div className="relative">
            <div className="relative z-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-2xl backdrop-blur">
              <img
                src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=900&q=80"
                alt="Profesional"
                className="h-64 w-full object-cover"
              />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Equipo Maraven Refacciones</div>
                    <div className="text-xs text-slate-500">Reparación industrial · Caracas</div>
                  </div>
                  <VerifiedPill />
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-white">4.95</span>
                    <span className="text-slate-500">(1.2k)</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" /> 2.480 trabajos
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[#00daf3]" /> Responde en 5 min
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                  <EscrowPill />
                  <span className="text-sm font-bold text-white">Desde $35</span>
                </div>
              </div>
            </div>

            {/* Floating proof card */}
            <div className="absolute -bottom-6 -left-6 z-20 hidden w-64 rounded-2xl border border-white/[0.08] bg-[#0a0e1a]/95 p-4 shadow-2xl backdrop-blur md:block">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400">Pago en custodia</div>
                  <div className="text-sm font-bold">$ 320,00 protegidos</div>
                </div>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full w-3/4 rounded-full bg-[#00daf3]" />
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Liberación al confirmar entrega
              </div>
            </div>

            <div className="absolute -right-4 -top-4 z-20 hidden rounded-2xl border border-[#00daf3]/30 bg-[#00daf3]/10 px-4 py-3 text-xs font-semibold text-[#00daf3] backdrop-blur md:block">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Identidad verificada
              </div>
              <div className="mt-1 text-[10px] font-medium text-[#7af0ff]">
                Cédula, antecedentes y biometría
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Categorías destacadas</h2>
            <p className="mt-1 text-sm text-slate-400">
              Todo lo que necesitas, con respaldo de LinkServi.
            </p>
          </div>
          <a className="hidden items-center gap-1 text-sm font-semibold text-[#00daf3] hover:underline md:inline-flex" href="#">
            Ver todas <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <a
                key={c.name}
                href="#"
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 transition hover:border-[#00daf3]/40 hover:bg-white/[0.05]"
              >
                <div className="absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-[#00daf3] to-transparent transition-transform duration-300 group-hover:scale-x-100" />
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#00daf3]/10 text-[#00daf3]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.count} verificados</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:text-[#00daf3]" />
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* Featured Pros */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Profesionales y tiendas verificadas</h2>
            <p className="mt-1 text-sm text-slate-400">
              Con identidad confirmada, escrow activo y garantía de LinkServi.
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {["Todos", "Servicios", "Productos", "Transporte"].map((t, i) => (
              <button
                key={t}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  i === 0
                    ? "border-[#00daf3]/40 bg-[#00daf3]/10 text-[#00daf3]"
                    : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pros.map((p) => (
            <div
              key={p.name}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] transition hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.05]"
            >
              <div className="absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 bg-gradient-to-r from-[#00daf3] via-[#7af0ff] to-[#00daf3] transition-transform duration-300 group-hover:scale-x-100" />
              <div className="relative">
                <img src={p.img} alt={p.name} className="h-40 w-full object-cover" />
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <VerifiedPill />
                  <EscrowPill />
                </div>
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                  <MapPin className="h-3 w-3 text-[#00daf3]" />
                  {p.location}
                </div>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-base font-semibold">{p.name}</div>
                    <div className="inline-flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="font-bold">{p.rating}</span>
                      <span className="text-xs text-slate-500">({p.reviews})</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{p.category}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Briefcase className="h-3.5 w-3.5 text-[#00daf3]" />
                    <span>
                      <span className="font-semibold text-white">{p.jobs}</span> trabajos
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5 text-[#00daf3]" />
                    <span>
                      Responde en <span className="font-semibold text-white">{p.response}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Precio</div>
                    <div className="text-sm font-bold text-white">{p.price}</div>
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#00daf3] px-3.5 py-2 text-xs font-bold text-[#001318] hover:brightness-110">
                    Contratar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo te protegemos */}
      <section className="border-y border-white/[0.06] bg-gradient-to-b from-transparent via-[#00daf3]/[0.03] to-transparent py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#00daf3]/30 bg-[#00daf3]/10 px-3 py-1 text-xs font-semibold text-[#00daf3]">
              <Shield className="h-3.5 w-3.5" />
              Cómo te protegemos
            </div>
            <h2 className="text-4xl font-bold tracking-tight">
              Tu confianza, nuestra prioridad
            </h2>
            <p className="mt-3 text-base text-slate-400">
              Cuatro pilares de seguridad bancaria diseñados para una economía como la nuestra.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {pillars.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition hover:border-[#00daf3]/40"
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] scale-x-0 bg-[#00daf3] transition-transform duration-300 group-hover:scale-x-100" />
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#00daf3]/10 text-[#00daf3] ring-1 ring-[#00daf3]/20">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="mt-5 text-xs font-bold tracking-widest text-[#00daf3]">
                    PILAR 0{i + 1}
                  </div>
                  <h3 className="mt-1 text-lg font-bold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Trust strip */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-5 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> SSL bancario
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> PCI-DSS compliant
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Verificación biométrica
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Mediación de disputas en 24h
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Reembolso garantizado
            </span>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="relative overflow-hidden rounded-3xl border border-[#00daf3]/20 bg-gradient-to-br from-[#001318] via-[#002830] to-[#001318] p-10 md:p-14">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(500px 250px at 90% 0%, rgba(0,218,243,0.18), transparent 60%)",
            }}
          />
          <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-xl">
              <h3 className="text-3xl font-bold tracking-tight">
                Empieza a contratar con respaldo total
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Únete a +180.000 venezolanos que ya operan con la confianza de LinkServi Escrow.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="inline-flex items-center gap-2 rounded-xl bg-[#00daf3] px-5 py-3 text-sm font-bold text-[#001318] hover:brightness-110">
                Crear cuenta gratis <ArrowRight className="h-4 w-4" />
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white hover:bg-white/[0.08]">
                Ofrecer mis servicios
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#06090f]">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-5">
            <div className="md:col-span-2">
              <a href="#" className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#00daf3] text-[#001318]">
                  <Zap className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <span className="text-lg font-bold tracking-tight">LinkServi</span>
              </a>
              <p className="mt-4 max-w-sm text-sm text-slate-400">
                El ServiMarket de Venezuela donde cada transacción está protegida.
                Servicios, productos y transporte con respaldo real.
              </p>
              <div className="mt-5 flex items-center gap-3">
                {[Facebook, Instagram, Twitter, Youtube].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-[#00daf3]"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {[
              {
                title: "ServiMarket",
                links: ["Servicios", "Productos", "Transporte", "Clasificados", "Ofertas"],
              },
              {
                title: "Confianza",
                links: ["Escrow", "Verificación KYC", "Centro de seguridad", "Disputas", "Reembolsos"],
              },
              {
                title: "Empresa",
                links: ["Sobre nosotros", "Vender en LinkServi", "Carreras", "Prensa", "Contacto"],
              },
            ].map((col) => (
              <div key={col.title}>
                <div className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {col.title}
                </div>
                <ul className="space-y-2.5 text-sm text-slate-300">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#" className="hover:text-[#00daf3]">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-slate-500 md:flex-row md:items-center">
            <div>© 2026 LinkServi C.A. — RIF J-50012345-6 · Caracas, Venezuela</div>
            <div className="flex items-center gap-5">
              <a href="#" className="hover:text-white">Términos</a>
              <a href="#" className="hover:text-white">Privacidad</a>
              <a href="#" className="hover:text-white">Cookies</a>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Sitio seguro
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
