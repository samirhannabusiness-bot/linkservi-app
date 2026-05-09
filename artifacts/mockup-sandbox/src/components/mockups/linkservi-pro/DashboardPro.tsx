import {
  Search,
  ShoppingBag,
  Star,
  Shield,
  MapPin,
  ChevronRight,
  Zap,
  Home,
  LayoutGrid,
  Users,
  Store,
  Package,
  MessageSquare,
  User,
  Bell,
  Wrench,
  Scale,
  Car,
  Sparkles,
  Hammer,
  UtensilsCrossed,
  PartyPopper,
  Cpu,
  Lock,
  CheckCircle2,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Filter,
  Command,
} from "lucide-react";

const navItems = [
  { icon: Home, label: "Inicio", active: true, badge: null },
  { icon: LayoutGrid, label: "Categorías", active: false, badge: null },
  { icon: Users, label: "Profesionales", active: false, badge: "L3" },
  { icon: Store, label: "Tiendas", active: false, badge: null },
  { icon: Package, label: "Pedidos", active: false, badge: "4" },
  { icon: MessageSquare, label: "Mensajes", active: false, badge: "12" },
  { icon: User, label: "Cuenta", active: false, badge: null },
];

const categories = [
  { icon: Cpu, label: "Tecnología", count: "1.2k" },
  { icon: Home, label: "Hogar", count: "890" },
  { icon: Scale, label: "Servicios Legales", count: "245" },
  { icon: Car, label: "Transporte", count: "612" },
  { icon: Sparkles, label: "Belleza", count: "478" },
  { icon: Hammer, label: "Reparaciones", count: "1.5k" },
  { icon: UtensilsCrossed, label: "Comida", count: "2.1k" },
  { icon: PartyPopper, label: "Eventos", count: "302" },
];

const featured = [
  {
    name: "MacBook Pro M3 14\"",
    category: "Tecnología · TechVe Store",
    img: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&q=80",
    rating: 4.9,
    reviews: 218,
    price: "desde $1,299",
    bs: "Bs 47.200",
    response: "Tiempo respuesta: 6 min",
    level: "Verificado L3",
    type: "Tienda",
  },
  {
    name: "Carlos Méndez",
    category: "Reparación de aires · Caracas",
    img: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=600&q=80",
    rating: 5.0,
    reviews: 412,
    price: "desde $25/visita",
    bs: "Bs 910",
    response: "Tiempo respuesta: 8 min",
    level: "Verificado L3",
    type: "Profesional",
  },
  {
    name: "Sushi Akira",
    category: "Comida · Las Mercedes",
    img: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&q=80",
    rating: 4.8,
    reviews: 1083,
    price: "desde $12",
    bs: "Bs 437",
    response: "Entrega 25-35 min",
    level: "Verificado L2",
    type: "Tienda",
  },
  {
    name: "Andrea Salcedo",
    category: "Estilismo & Belleza · Maracaibo",
    img: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=80",
    rating: 4.9,
    reviews: 327,
    price: "desde $18",
    bs: "Bs 655",
    response: "Tiempo respuesta: 12 min",
    level: "Verificado L3",
    type: "Profesional",
  },
  {
    name: "Chevrolet Aveo 2019",
    category: "Transporte · Conductor verificado",
    img: "https://images.unsplash.com/photo-1542362567-b07e54358753?w=600&q=80",
    rating: 4.95,
    reviews: 2841,
    price: "desde $4/viaje",
    bs: "Bs 145",
    response: "Llega en 4 min",
    level: "Verificado L3",
    type: "Conductor",
  },
  {
    name: "Mueblería Roble",
    category: "Hogar · Showroom Chacao",
    img: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80",
    rating: 4.7,
    reviews: 156,
    price: "desde $89",
    bs: "Bs 3.234",
    response: "Despacho 24-48h",
    level: "Verificado L2",
    type: "Tienda",
  },
];

const orders = [
  { id: "#LS-48201", item: "Reparación A/C — C. Méndez", status: "En curso", color: "text-cyan-300" },
  { id: "#LS-48198", item: "MacBook Pro 14\" — TechVe", status: "En tránsito", color: "text-amber-300" },
  { id: "#LS-48190", item: "Sushi Akira x2", status: "Entregado", color: "text-emerald-300" },
];

export function DashboardPro() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white font-['Inter'] antialiased">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-white/[0.06] bg-[#070b14]/80 backdrop-blur-xl">
          <div className="px-6 pt-6 pb-8">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#00daf3] flex items-center justify-center shadow-[0_0_20px_rgba(0,218,243,0.45)]">
                <Zap className="w-5 h-5 text-[#04121a]" strokeWidth={2.75} />
              </div>
              <div>
                <div className="font-semibold tracking-tight text-[15px] leading-none">LinkServi</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mt-1">Pro Terminal</div>
              </div>
            </div>
          </div>

          <nav className="px-3 flex-1 space-y-1">
            <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Navegación</div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    item.active
                      ? "bg-[#00daf3]/[0.08] text-white border border-[#00daf3]/30 shadow-[0_0_24px_-4px_rgba(0,218,243,0.45)]"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  {item.active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[2px] rounded-r bg-[#00daf3] shadow-[0_0_10px_rgba(0,218,243,0.8)]" />
                  )}
                  <Icon className={`w-[18px] h-[18px] ${item.active ? "text-[#00daf3]" : ""}`} strokeWidth={2} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                        item.active
                          ? "bg-[#00daf3] text-[#04121a]"
                          : "bg-white/[0.06] text-slate-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-4 mx-3 mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-[#00daf3]" />
              <div className="text-xs font-semibold tracking-tight">Cuenta verificada L3</div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Pagos protegidos por escrow. Saldo: <span className="text-white font-medium">$248,30</span>
            </p>
            <button className="mt-3 w-full text-[11px] font-medium text-[#00daf3] flex items-center justify-between">
              Ver bóveda <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0a0e1a]/85 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-6 lg:px-10 h-16">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <MapPin className="w-3.5 h-3.5 text-[#00daf3]" />
                <span className="text-white font-medium">Caracas</span>
                <span className="text-slate-600">·</span>
                <button className="hover:text-white transition">Maracaibo</button>
                <span className="text-slate-600">·</span>
                <button className="hover:text-white transition">Valencia</button>
              </div>

              <div className="flex-1 max-w-2xl mx-auto">
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar servicios, productos, profesionales…"
                    className="w-full h-10 pl-10 pr-24 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00daf3]/50 focus:bg-white/[0.06] transition"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-slate-400 bg-white/[0.04] border border-white/[0.08] rounded-md px-1.5 py-1">
                    <Command className="w-3 h-3" /> K
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="w-9 h-9 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] flex items-center justify-center transition relative">
                  <Bell className="w-4 h-4 text-slate-300" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#00daf3] shadow-[0_0_8px_rgba(0,218,243,0.8)]" />
                </button>
                <button className="w-9 h-9 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] flex items-center justify-center transition relative">
                  <ShoppingBag className="w-4 h-4 text-slate-300" />
                  <span className="absolute -top-1 -right-1 text-[9px] font-semibold bg-[#00daf3] text-[#04121a] rounded-full w-4 h-4 flex items-center justify-center">
                    3
                  </span>
                </button>
                <button className="ml-1 h-9 px-3 rounded-xl text-xs font-semibold border border-white/[0.08] hover:bg-white/[0.04] transition">
                  Iniciar sesión
                </button>
                <button className="h-9 px-3 rounded-xl text-xs font-semibold bg-[#00daf3] text-[#04121a] hover:brightness-110 transition shadow-[0_0_24px_-4px_rgba(0,218,243,0.6)]">
                  Crear cuenta
                </button>
              </div>
            </div>
          </header>

          <div className="px-6 lg:px-10 py-8 space-y-12">
            {/* Greeting + KPI */}
            <section>
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 xl:col-span-8">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00daf3]" />
                    Panel — Martes 14:32 GMT-4
                  </div>
                  <h1 className="text-3xl xl:text-4xl font-bold tracking-tight leading-[1.1]">
                    Buenas tardes, Samir.
                    <br />
                    <span className="text-slate-400 font-medium">
                      Servicios, productos y transporte — todo en un solo lugar.
                    </span>
                  </h1>
                  <p className="mt-3 text-sm text-slate-400 max-w-xl">
                    Marketplace operado como un terminal profesional. Pagos en escrow, profesionales verificados y entrega en tiempo real.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button className="h-10 px-4 rounded-xl bg-[#00daf3] text-[#04121a] text-sm font-semibold flex items-center gap-2 shadow-[0_0_28px_-6px_rgba(0,218,243,0.7)] hover:brightness-110 transition">
                      Buscar servicios <ArrowUpRight className="w-4 h-4" />
                    </button>
                    <button className="h-10 px-4 rounded-xl border border-white/[0.1] bg-white/[0.03] text-sm font-medium hover:bg-white/[0.06] transition flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-400" /> Filtrar por zona
                    </button>
                    <div className="h-10 px-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-xs text-slate-400 flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[#00daf3]" /> Pagos protegidos · Escrow activo
                    </div>
                  </div>
                </div>

                <div className="col-span-12 xl:col-span-4 grid grid-cols-2 gap-3">
                  {[
                    { label: "Profesionales activos", value: "12.4k", trend: "+8.2%", icon: Users },
                    { label: "Tiendas verificadas", value: "3.1k", trend: "+2.1%", icon: Store },
                    { label: "Pedidos hoy", value: "847", trend: "+14%", icon: Package },
                    { label: "Tiempo resp. promedio", value: "9 min", trend: "-1.4 min", icon: Clock },
                  ].map((kpi) => {
                    const Icon = kpi.icon;
                    return (
                      <div
                        key={kpi.label}
                        className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-sm"
                      >
                        <div className="flex items-center justify-between">
                          <Icon className="w-4 h-4 text-slate-400" />
                          <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-300/10 px-1.5 py-0.5 rounded">
                            {kpi.trend}
                          </span>
                        </div>
                        <div className="mt-3 text-xl font-bold tracking-tight">{kpi.value}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{kpi.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Categorías */}
            <section>
              <div className="flex items-end justify-between mb-5">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-1">02 · Explorar</div>
                  <h2 className="text-xl font-bold tracking-tight">Categorías</h2>
                </div>
                <button className="text-xs text-slate-400 hover:text-[#00daf3] flex items-center gap-1 transition">
                  Ver todas <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.label}
                      className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#00daf3]/30 p-4 text-left transition"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 group-hover:bg-[#00daf3]/10 group-hover:border-[#00daf3]/40 transition">
                        <Icon className="w-4 h-4 text-slate-300 group-hover:text-[#00daf3] transition" />
                      </div>
                      <div className="text-sm font-semibold tracking-tight">{cat.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{cat.count} ofertas</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Featured grid */}
            <section>
              <div className="flex items-end justify-between mb-5">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-1">
                    03 · Destacados hoy
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">
                    Profesionales y tiendas verificadas
                  </h2>
                </div>
                <div className="hidden md:flex items-center gap-2 text-xs">
                  <button className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white font-medium">
                    Todos
                  </button>
                  <button className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
                    Profesionales
                  </button>
                  <button className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
                    Tiendas
                  </button>
                  <button className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
                    Transporte
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-5">
                {/* Cards */}
                <div className="col-span-12 xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {featured.slice(0, 4).map((f) => (
                    <article
                      key={f.name}
                      className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden hover:border-[#00daf3]/30 transition"
                    >
                      <div className="relative aspect-[16/9] overflow-hidden">
                        <img
                          src={f.img}
                          alt={f.name}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent" />
                        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-md border border-white/[0.1] rounded-full px-2 py-1 text-[10px] font-semibold">
                          <Shield className="w-3 h-3 text-[#00daf3]" /> {f.level}
                        </div>
                        <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 backdrop-blur-md border border-white/[0.1] rounded-full px-2 py-1 text-[10px] font-semibold">
                          <Star className="w-3 h-3 text-amber-300 fill-amber-300" />
                          {f.rating}
                          <span className="text-slate-400 font-normal">({f.reviews})</span>
                        </div>
                        <div className="absolute bottom-3 left-3 text-[10px] uppercase tracking-[0.16em] text-slate-300/80">
                          {f.type}
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold tracking-tight">{f.name}</h3>
                            <p className="text-[12px] text-slate-400 mt-0.5">{f.category}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-[#00daf3] tracking-tight">
                              {f.price}
                            </div>
                            <div className="text-[10px] text-slate-500">{f.bs}</div>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Clock className="w-3 h-3" /> {f.response}
                          </span>
                          <button className="font-semibold text-white flex items-center gap-1 hover:text-[#00daf3] transition">
                            Ver perfil <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Side panel */}
                <aside className="col-span-12 xl:col-span-4 space-y-4">
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold tracking-tight">Tus pedidos activos</h3>
                      <span className="text-[10px] text-slate-500 uppercase tracking-[0.18em]">
                        Live
                      </span>
                    </div>
                    <ul className="space-y-3">
                      {orders.map((o) => (
                        <li
                          key={o.id}
                          className="flex items-center justify-between text-xs border-b border-white/[0.05] pb-3 last:border-0 last:pb-0"
                        >
                          <div>
                            <div className="font-medium text-white">{o.item}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{o.id}</div>
                          </div>
                          <span className={`text-[11px] font-semibold ${o.color}`}>{o.status}</span>
                        </li>
                      ))}
                    </ul>
                    <button className="mt-4 w-full h-9 rounded-xl border border-white/[0.08] text-xs font-medium hover:bg-white/[0.04] transition flex items-center justify-center gap-1">
                      Abrir centro de pedidos <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {featured.slice(4).map((f) => (
                    <article
                      key={f.name}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 flex gap-4 hover:border-[#00daf3]/30 transition"
                    >
                      <img
                        src={f.img}
                        alt={f.name}
                        className="w-20 h-20 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <Shield className="w-3 h-3 text-[#00daf3]" /> {f.level}
                        </div>
                        <h4 className="text-sm font-semibold tracking-tight mt-1 truncate">
                          {f.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate">{f.category}</p>
                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1 text-amber-300">
                            <Star className="w-3 h-3 fill-amber-300" /> {f.rating}
                          </span>
                          <span className="font-bold text-[#00daf3]">{f.price}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </aside>
              </div>
            </section>

            {/* Cómo funciona */}
            <section>
              <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.03] to-transparent p-6 lg:p-8">
                <div className="flex items-end justify-between mb-6">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-1">
                      04 · Confianza
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">Cómo funciona LinkServi</h2>
                    <p className="text-sm text-slate-400 mt-1 max-w-lg">
                      Tres capas de protección entre tú y cada profesional o tienda. Sin sorpresas.
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400 border border-white/[0.08] rounded-full px-3 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    99,2% transacciones exitosas
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      icon: Lock,
                      title: "Pagos en escrow",
                      desc: "Tu dinero queda retenido hasta que confirmes que el servicio o producto fue entregado. Si algo falla, reembolso garantizado.",
                      tag: "Protección 100%",
                    },
                    {
                      icon: Shield,
                      title: "Profesionales verificados",
                      desc: "Validamos identidad, dirección y antecedentes. Niveles L1, L2 y L3 según historial y reseñas reales de clientes.",
                      tag: "12.400+ verificados",
                    },
                    {
                      icon: TrendingUp,
                      title: "Reputación transparente",
                      desc: "Calificaciones y reseñas auditadas. Tiempo de respuesta y tasa de cumplimiento visibles en cada perfil.",
                      tag: "Sin reseñas falsas",
                    },
                  ].map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.title}
                        className="rounded-2xl border border-white/[0.07] bg-[#0a0e1a]/60 p-5"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-10 h-10 rounded-xl bg-[#00daf3]/10 border border-[#00daf3]/30 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-[#00daf3]" />
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">0{i + 1}</span>
                        </div>
                        <h3 className="text-sm font-semibold tracking-tight">{step.title}</h3>
                        <p className="text-[12px] text-slate-400 mt-1.5 leading-relaxed">
                          {step.desc}
                        </p>
                        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {step.tag}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="pt-8 border-t border-white/[0.06]">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-8">
                <div className="col-span-2">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#00daf3] flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[#04121a]" strokeWidth={2.75} />
                    </div>
                    <span className="font-semibold tracking-tight">LinkServi</span>
                  </div>
                  <p className="text-[12px] text-slate-400 max-w-xs leading-relaxed">
                    El marketplace profesional de Venezuela. Servicios, productos, transporte y clasificados — protegidos por escrow.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    {["IG", "TT", "X", "YT"].map((s) => (
                      <a
                        key={s}
                        className="w-8 h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] flex items-center justify-center text-[10px] font-semibold text-slate-300 transition"
                      >
                        {s}
                      </a>
                    ))}
                  </div>
                </div>
                {[
                  {
                    title: "Marketplace",
                    items: ["Categorías", "Profesionales", "Tiendas", "Transporte"],
                  },
                  {
                    title: "Empresa",
                    items: ["Sobre nosotros", "Carreras", "Prensa", "Contacto"],
                  },
                  {
                    title: "Soporte",
                    items: ["Centro de ayuda", "Pagos y escrow", "Verificación", "Términos"],
                  },
                ].map((col) => (
                  <div key={col.title}>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                      {col.title}
                    </div>
                    <ul className="space-y-2">
                      {col.items.map((it) => (
                        <li key={it}>
                          <a className="text-[12px] text-slate-300 hover:text-[#00daf3] transition cursor-pointer">
                            {it}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-5 border-t border-white/[0.06] text-[11px] text-slate-500">
                <div>© 2025 LinkServi C.A. — Caracas, Venezuela. RIF J-50543210-9</div>
                <div className="flex items-center gap-4">
                  <span>Privacidad</span>
                  <span>Términos</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Sistemas operativos
                  </span>
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
