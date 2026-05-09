import { Zap, Shield, Lock, ShieldCheck, BadgeCheck, Facebook, Instagram, Twitter, Youtube } from "lucide-react";
import { useLocation } from "wouter";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { label: "ServiMarket",    href: "/store" },
      { label: "Servicios",      href: "/search" },
      { label: "Transporte",     href: "/transport" },
      { label: "Clasificados",   href: "/clasificados" },
      { label: "Empleos",        href: "/jobs" },
    ],
  },
  {
    title: "LinkServi",
    links: [
      { label: "Cómo funciona",  href: "/ganar-dinero" },
      { label: "Vender",         href: "/ganar-dinero" },
      { label: "Blog",           href: "/blog" },
      { label: "Contacto",       href: "/terms" },
    ],
  },
  {
    title: "Confianza",
    links: [
      { label: "Pago en escrow",     href: "/terms" },
      { label: "Verificación KYC",   href: "/terms" },
      { label: "Centro de ayuda",    href: "/terms" },
      { label: "Reportar un problema", href: "/terms" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Términos",       href: "/terms" },
      { label: "Privacidad",     href: "/privacy" },
      { label: "Cookies",        href: "/cookies" },
      { label: "Reembolsos",     href: "/refunds" },
    ],
  },
];

const TRUST_BADGES = [
  { icon: Lock,        label: "Pago en Escrow" },
  { icon: ShieldCheck, label: "KYC Verificado" },
  { icon: BadgeCheck,  label: "Seguro $500" },
  { icon: Shield,      label: "Soporte 24/7" },
];

export function PublicMarketplaceFooter() {
  const [, navigate] = useLocation();

  return (
    <footer className="border-t border-white/[0.06] bg-[#06090f]">
      {/* Trust strip */}
      <div className="border-b border-white/[0.06]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 md:px-6 py-6 md:grid-cols-4">
          {TRUST_BADGES.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.label} className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#00daf3]/10 text-[#00daf3] ring-1 ring-inset ring-[#00daf3]/20">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold text-slate-200">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          {/* Brand block */}
          <div>
            <button onClick={() => navigate("/")} className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#00daf3] text-[#001318]">
                <Zap className="h-5 w-5" strokeWidth={2.5} />
              </div>
              <span className="text-lg font-bold tracking-tight text-white">LinkServi</span>
            </button>
            <p className="mt-4 max-w-xs text-sm text-slate-400 leading-relaxed">
              El marketplace #1 de Venezuela con pago protegido. Servicios, productos y transporte en un solo lugar, sin riesgos.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {([
                { Icon: Facebook,  label: "Facebook"  },
                { Icon: Instagram, label: "Instagram" },
                { Icon: Twitter,   label: "Twitter / X" },
                { Icon: Youtube,   label: "YouTube"   },
              ] as const).map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-[#00daf3]/40 hover:text-[#00daf3] transition-colors"
                  aria-label={`LinkServi en ${label}`}
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <button
                      onClick={() => navigate(l.href)}
                      className="text-sm text-slate-300 hover:text-[#00daf3] transition-colors text-left"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 md:px-6 py-5 text-xs text-slate-500 md:flex-row">
          <span>© {new Date().getFullYear()} LinkServi · Hecho en Venezuela 🇻🇪</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#00daf3]" />
            Pago protegido por LinkServi Escrow
          </span>
        </div>
      </div>
    </footer>
  );
}
