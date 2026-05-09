import { Lock, ShieldCheck, Headphones } from "lucide-react";
import { useEffect, useState } from "react";

export function TrustBand() {
  const [bcvRate, setBcvRate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bcv-rate")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        const rate = typeof d.rate === "number" ? d.rate : Number(d.rate);
        if (Number.isFinite(rate)) setBcvRate(rate);
      })
      .catch(() => { /* silent — trust band is decorative */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="border-b border-white/[0.06] bg-gradient-to-r from-[#001318] via-[#00181f] to-[#001318]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-6 px-4 md:px-6 py-2 text-[12px] text-slate-300">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Lock className="h-3.5 w-3.5 shrink-0 text-[#00daf3]" />
            <span className="hidden sm:inline">Pago protegido por</span>
            <span className="font-semibold text-white truncate">LinkServi Escrow</span>
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
        <div className="flex items-center gap-3 sm:gap-4 text-slate-400 shrink-0">
          {bcvRate !== null && (
            <span className="hidden md:inline">
              Bs. {bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD
            </span>
          )}
          <a className="hidden sm:inline hover:text-white transition-colors" href="/terms">Ayuda</a>
          <a className="hidden md:inline hover:text-white transition-colors" href="/ganar-dinero">Vender en LinkServi</a>
        </div>
      </div>
    </div>
  );
}
