import {
  Search,
  ShoppingBag,
  Star,
  Shield,
  MapPin,
  ChevronRight,
  Zap,
  ChevronDown,
  User,
  Lock,
  CheckCircle2,
  ArrowUpRight,
  Cpu,
  Home,
  Scale,
  Car,
  Sparkles,
  Wrench,
  UtensilsCrossed,
  PartyPopper,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
} from "lucide-react";

export function HeroEditorial() {
  const categories = [
    { name: "Tecnología", icon: Cpu, count: "1,240" },
    { name: "Hogar", icon: Home, count: "980" },
    { name: "Servicios Legales", icon: Scale, count: "320" },
    { name: "Transporte", icon: Car, count: "2,150" },
    { name: "Belleza", icon: Sparkles, count: "760" },
    { name: "Reparaciones", icon: Wrench, count: "1,510" },
    { name: "Comida", icon: UtensilsCrossed, count: "640" },
    { name: "Eventos", icon: PartyPopper, count: "290" },
  ];

  const stores = [
    {
      name: "Andrea Marín",
      category: "Diseñadora UI/UX",
      rating: 4.9,
      reviews: 184,
      price: "desde $35",
      img: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=900&q=80",
      tag: "Profesional",
    },
    {
      name: "TecnoStore Caracas",
      category: "Laptops y accesorios",
      rating: 4.8,
      reviews: 412,
      price: "desde $120",
      img: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&q=80",
      tag: "Tienda verificada",
    },
    {
      name: "Cocina del Ávila",
      category: "Comida casera & catering",
      rating: 5.0,
      reviews: 96,
      price: "desde Bs 480",
      img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&q=80",
      tag: "Tienda verificada",
    },
    {
      name: "Carlos Méndez",
      category: "Conductor ejecutivo",
      rating: 4.9,
      reviews: 521,
      price: "desde $8",
      img: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=900&q=80",
      tag: "Conductor",
    },
    {
      name: "Casa Nova Hogar",
      category: "Muebles & decoración",
      rating: 4.7,
      reviews: 233,
      price: "desde $45",
      img: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80",
      tag: "Tienda verificada",
    },
    {
      name: "Mecánica Express",
      category: "Reparación a domicilio",
      rating: 4.8,
      reviews: 178,
      price: "desde $25",
      img: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=900&q=80",
      tag: "Profesional",
    },
  ];

  const collections = [
    {
      label: "Colección 01",
      title: "Profesionales que transforman ideas en obras.",
      img: "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1400&q=80",
    },
    {
      label: "Colección 02",
      title: "Tiendas curadas para el hogar venezolano moderno.",
      img: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1400&q=80",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white font-['Inter'] antialiased">
      {/* HEADER */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0e1a]/70 border-b border-white/[0.06]">
        <div className="max-w-[1320px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00daf3] flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#0a0e1a]" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-semibold tracking-tight">
              LinkServi
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-[13.5px] text-slate-300">
            <a href="#" className="hover:text-white transition">Servicios</a>
            <a href="#" className="hover:text-white transition">Tiendas</a>
            <a href="#" className="hover:text-white transition">Transporte</a>
            <a href="#" className="hover:text-white transition">Clasificados</a>
            <a href="#" className="hover:text-white transition">Empresas</a>
          </nav>

          <div className="flex items-center gap-2">
            <button className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-full text-[13px] text-slate-300 hover:text-white hover:bg-white/[0.04] transition">
              <MapPin className="w-3.5 h-3.5 text-[#00daf3]" />
              Caracas
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-300">
              <Search className="w-4 h-4" />
            </button>
            <button className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-300 relative">
              <ShoppingBag className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#00daf3]" />
            </button>
            <button className="hidden sm:flex items-center gap-1.5 px-4 h-9 rounded-full text-[13px] text-slate-200 hover:bg-white/[0.04] transition">
              Iniciar sesión
            </button>
            <button className="px-4 h-9 rounded-full bg-[#00daf3] text-[#0a0e1a] text-[13px] font-semibold hover:bg-[#5beaf8] transition">
              Crear cuenta
            </button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Glow */}
        <div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full opacity-30 blur-[120px]"
          style={{ background: "radial-gradient(circle, #00daf3 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-20 right-0 w-[500px] h-[500px] rounded-full opacity-20 blur-[140px]"
          style={{ background: "radial-gradient(circle, #00daf3 0%, transparent 70%)" }}
        />

        <div className="relative max-w-[1320px] mx-auto px-8 pt-24 pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-[12px] text-slate-300 mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00daf3] animate-pulse" />
                Nueva temporada · Más de 12,400 profesionales verificados
              </div>

              <h1 className="text-[64px] lg:text-[88px] leading-[0.95] font-bold tracking-tight">
                Todo lo que
                <br />
                necesitas.
                <br />
                <span className="text-[#00daf3]">En un solo lugar.</span>
              </h1>

              <p className="mt-8 text-[17px] leading-relaxed text-slate-400 max-w-xl">
                Servicios profesionales, tiendas físicas, transporte y clasificados.
                LinkServi conecta Venezuela con la economía digital — con pagos
                seguros, escrow y profesionales verificados.
              </p>

              {/* Search */}
              <div className="mt-10 flex items-center gap-2 p-2 rounded-2xl bg-white/[0.04] border border-white/10 max-w-2xl backdrop-blur-sm">
                <div className="flex items-center gap-2 px-3 h-12 border-r border-white/10 text-[13px] text-slate-300">
                  <MapPin className="w-4 h-4 text-[#00daf3]" />
                  Caracas
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 flex items-center gap-2 px-3">
                  <Search className="w-4 h-4 text-slate-500" />
                  <input
                    placeholder="Buscar servicios, tiendas, conductores…"
                    className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-slate-500"
                  />
                </div>
                <button className="px-6 h-12 rounded-xl bg-[#00daf3] text-[#0a0e1a] text-[14px] font-semibold hover:bg-[#5beaf8] transition">
                  Buscar
                </button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-4 text-[13px] text-slate-400">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#00daf3]" />
                  Pagos con escrow
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#00daf3]" />
                  Profesionales verificados
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#00daf3]" />
                  Respuesta en minutos
                </div>
              </div>
            </div>

            {/* Hero Photo */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-[28px] overflow-hidden border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,218,243,0.25)]">
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1000&q=80"
                  alt="Profesional"
                  className="w-full h-[560px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent" />

                {/* Floating card */}
                <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-[#0a0e1a]/80 backdrop-blur-xl border border-white/10 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-[#00daf3] font-semibold">
                        Profesional destacado
                      </div>
                      <div className="mt-1 text-[16px] font-semibold">
                        Lucía Hernández
                      </div>
                      <div className="text-[13px] text-slate-400">
                        Consultora financiera · Caracas
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Star className="w-3.5 h-3.5 fill-[#00daf3] text-[#00daf3]" />
                        <span className="text-[13px] font-semibold">4.98</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        312 trabajos
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stat pill */}
              <div className="absolute -left-6 top-10 hidden lg:flex flex-col gap-1 px-5 py-4 rounded-2xl bg-[#0a0e1a]/90 border border-white/10 backdrop-blur-xl">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  Pedidos hoy
                </div>
                <div className="text-[24px] font-bold tracking-tight">
                  8,420
                </div>
                <div className="text-[11px] text-[#00daf3]">+12% vs ayer</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="max-w-[1320px] mx-auto px-8 py-20 border-t border-white/[0.06]">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#00daf3] font-semibold mb-3">
              · Categorías
            </div>
            <h2 className="text-[40px] lg:text-[48px] font-bold tracking-tight leading-tight max-w-2xl">
              Explora todo lo que LinkServi tiene para ti.
            </h2>
          </div>
          <a
            href="#"
            className="hidden md:flex items-center gap-1.5 text-[13px] text-slate-300 hover:text-[#00daf3] transition"
          >
            Ver todas las categorías
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <a
                key={cat.name}
                href="#"
                className="group p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-[#00daf3]/40 hover:bg-white/[0.05] transition-all"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center group-hover:bg-[#00daf3]/10 group-hover:border-[#00daf3]/30 transition">
                    <Icon className="w-5 h-5 text-[#00daf3]" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#00daf3] group-hover:translate-x-0.5 transition" />
                </div>
                <div className="text-[15px] font-semibold">{cat.name}</div>
                <div className="text-[12px] text-slate-500 mt-1">
                  {cat.count} disponibles
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* EDITORIAL COLLECTIONS */}
      <section className="max-w-[1320px] mx-auto px-8 py-20 border-t border-white/[0.06]">
        <div className="text-[11px] uppercase tracking-[0.25em] text-[#00daf3] font-semibold mb-3">
          · Colecciones destacadas
        </div>
        <h2 className="text-[40px] lg:text-[48px] font-bold tracking-tight leading-tight max-w-3xl mb-14">
          Historias y oficios que mueven a Venezuela.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {collections.map((col) => (
            <a
              key={col.label}
              href="#"
              className="group relative rounded-3xl overflow-hidden border border-white/[0.08] aspect-[4/3]"
            >
              <img
                src={col.img}
                alt={col.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-[#0a0e1a]/30 to-transparent" />
              <div className="absolute inset-0 p-8 flex flex-col justify-end">
                <div className="text-[11px] uppercase tracking-[0.25em] text-[#00daf3] font-semibold mb-3">
                  {col.label}
                </div>
                <div className="text-[26px] font-bold tracking-tight leading-snug max-w-md">
                  {col.title}
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-slate-200">
                  Explorar colección
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* FEATURED STORES / WORKERS */}
      <section className="max-w-[1320px] mx-auto px-8 py-20 border-t border-white/[0.06]">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#00daf3] font-semibold mb-3">
              · Profesionales y tiendas destacadas
            </div>
            <h2 className="text-[40px] lg:text-[48px] font-bold tracking-tight leading-tight max-w-2xl">
              Curado por nuestro equipo. Verificado por la comunidad.
            </h2>
          </div>
          <a
            href="#"
            className="hidden md:flex items-center gap-1.5 text-[13px] text-slate-300 hover:text-[#00daf3] transition"
          >
            Ver todos
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {stores.map((store) => (
            <article
              key={store.name}
              className="group rounded-2xl bg-white/[0.03] border border-white/[0.08] overflow-hidden hover:border-white/20 transition-all"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={store.img}
                  alt={store.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#0a0e1a]/80 backdrop-blur-md border border-white/10 text-[11px] font-medium flex items-center gap-1">
                  <Shield className="w-3 h-3 text-[#00daf3]" />
                  {store.tag}
                </div>
                <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-[#0a0e1a]/80 backdrop-blur-md border border-white/10 text-[11px] font-semibold flex items-center gap-1">
                  <Star className="w-3 h-3 fill-[#00daf3] text-[#00daf3]" />
                  {store.rating}
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[16px] font-semibold tracking-tight">
                      {store.name}
                    </div>
                    <div className="text-[13px] text-slate-400 mt-0.5">
                      {store.category}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-[#00daf3]">
                      {store.price}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {store.reviews} reseñas
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between pt-5 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
                    <Zap className="w-3.5 h-3.5 text-[#00daf3]" />
                    Responde en ~10 min
                  </div>
                  <button className="text-[12px] font-semibold text-white hover:text-[#00daf3] flex items-center gap-1 transition">
                    Ver perfil
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-[1320px] mx-auto px-8 py-24 border-t border-white/[0.06]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-5">
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#00daf3] font-semibold mb-3">
              · Cómo funciona
            </div>
            <h2 className="text-[40px] lg:text-[48px] font-bold tracking-tight leading-tight">
              Una transacción segura, de principio a fin.
            </h2>
            <p className="mt-6 text-[15px] text-slate-400 leading-relaxed max-w-md">
              Diseñamos LinkServi para que cada bolívar y cada dólar viaje
              protegido. Nuestro sistema de escrow retiene el pago hasta que
              estés satisfecho con el servicio o producto.
            </p>
            <button className="mt-8 inline-flex items-center gap-2 px-5 h-11 rounded-full bg-[#00daf3] text-[#0a0e1a] text-[13px] font-semibold hover:bg-[#5beaf8] transition">
              Comenzar ahora
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: Lock,
                title: "Pagos con escrow",
                desc: "Tu dinero se libera solo cuando confirmas que todo está perfecto.",
              },
              {
                icon: Shield,
                title: "Profesionales verificados",
                desc: "KYC, cédula y antecedentes. Cada pro pasa por nuestro filtro.",
              },
              {
                icon: CheckCircle2,
                title: "Garantía LinkServi",
                desc: "Si algo falla, mediamos y te respaldamos en cada disputa.",
              },
              {
                icon: Zap,
                title: "Respuesta inmediata",
                desc: "Conecta en minutos con el profesional o tienda ideal.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08]"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#00daf3]/10 border border-[#00daf3]/20 flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5 text-[#00daf3]" />
                  </div>
                  <div className="text-[15px] font-semibold tracking-tight">
                    {item.title}
                  </div>
                  <div className="text-[13px] text-slate-400 mt-2 leading-relaxed">
                    {item.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* QUOTE / EDITORIAL */}
      <section className="max-w-[1320px] mx-auto px-8 py-24 border-t border-white/[0.06]">
        <div className="max-w-4xl">
          <div className="text-[11px] uppercase tracking-[0.25em] text-[#00daf3] font-semibold mb-6">
            · Manifiesto
          </div>
          <p className="font-['Playfair_Display'] text-[36px] lg:text-[52px] leading-[1.15] tracking-tight italic text-white">
            "Construimos el lugar donde Venezuela trabaja, compra, se mueve y
            crece — todo bajo un mismo techo digital."
          </p>
          <div className="mt-8 flex items-center gap-3 text-[13px] text-slate-400">
            <div className="w-8 h-8 rounded-full bg-[#00daf3]/20 border border-[#00daf3]/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-[#00daf3]" />
            </div>
            Equipo LinkServi · Caracas, 2025
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1320px] mx-auto px-8 pb-24">
        <div className="relative rounded-[32px] overflow-hidden border border-white/[0.08] bg-gradient-to-br from-[#0d1424] via-[#0a0e1a] to-[#0a0e1a] p-12 lg:p-16">
          <div
            className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]"
            style={{ background: "radial-gradient(circle, #00daf3 0%, transparent 70%)" }}
          />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div>
              <h3 className="text-[36px] lg:text-[44px] font-bold tracking-tight leading-tight max-w-2xl">
                ¿Listo para vender tus servicios o productos?
              </h3>
              <p className="mt-4 text-[15px] text-slate-400 max-w-xl">
                Únete a miles de venezolanos que ya monetizan su talento, su
                tienda o su vehículo en LinkServi.
              </p>
            </div>
            <div className="flex gap-3">
              <button className="px-6 h-12 rounded-full bg-[#00daf3] text-[#0a0e1a] text-[14px] font-semibold hover:bg-[#5beaf8] transition whitespace-nowrap">
                Crear cuenta gratis
              </button>
              <button className="px-6 h-12 rounded-full border border-white/15 text-[14px] font-semibold hover:bg-white/[0.04] transition whitespace-nowrap">
                Hablar con ventas
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-[1320px] mx-auto px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 rounded-lg bg-[#00daf3] flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[#0a0e1a]" strokeWidth={2.5} />
                </div>
                <span className="text-[17px] font-semibold tracking-tight">
                  LinkServi
                </span>
              </div>
              <p className="text-[13px] text-slate-400 max-w-xs leading-relaxed">
                El ServiMarket integral de Venezuela. Servicios, tiendas,
                transporte y clasificados — verificados y seguros.
              </p>
              <div className="mt-6 flex gap-2">
                {[Instagram, Twitter, Facebook, Youtube].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-slate-400 hover:text-[#00daf3] hover:border-[#00daf3]/40 transition"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>

            {[
              {
                title: "Producto",
                links: ["Servicios", "Tiendas", "Transporte", "Clasificados"],
              },
              {
                title: "Empresa",
                links: ["Sobre nosotros", "Carreras", "Prensa", "Contacto"],
              },
              {
                title: "Soporte",
                links: ["Centro de ayuda", "Confianza & Seguridad", "Términos", "Privacidad"],
              },
            ].map((col) => (
              <div key={col.title}>
                <div className="text-[12px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-5">
                  {col.title}
                </div>
                <ul className="space-y-3">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a
                        href="#"
                        className="text-[13px] text-slate-300 hover:text-[#00daf3] transition"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-14 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-[12px] text-slate-500">
              © 2025 LinkServi C.A. · Hecho en Venezuela 🇻🇪
            </div>
            <div className="flex items-center gap-6 text-[12px] text-slate-500">
              <a href="#" className="hover:text-white transition">Términos</a>
              <a href="#" className="hover:text-white transition">Privacidad</a>
              <a href="#" className="hover:text-white transition">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
