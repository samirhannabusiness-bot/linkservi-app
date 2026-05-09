import { useLocation } from "wouter";
import { ArrowLeft, Megaphone } from "lucide-react";
import { NeonBackground } from "@/components/ui/NeonBackground";
import { LinkServiLogoIcon } from "@/components/ui/ServiLinkLogoIcon";

/**
 * LinkAds / clasificados de alto valor — vitrina pública (roadmap).
 * Ruta pública para anclar el pilar del ecosistema desde la landing.
 */
export function ClasificadosPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen text-foreground overflow-x-hidden relative bg-[#040c1a] selection:bg-primary/30">
      <NeonBackground />
      <header className="relative z-10 border-b border-white/5 px-6 py-4 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-3 text-white hover:opacity-90 transition-opacity"
        >
          <LinkServiLogoIcon size={40} />
          <span className="text-lg font-bold tracking-tight">LinkServi</span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Inicio
        </button>
      </header>

      <main className="relative z-10 flex flex-col items-center justify-center px-6 py-20 max-w-lg mx-auto text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 border border-white/10"
          style={{ background: "rgba(56,189,248,0.08)" }}
        >
          <Megaphone className="w-8 h-8 text-sky-400" strokeWidth={1.75} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35 mb-3">
          Clasificados · LinkAds
        </p>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight mb-4">
          Próximamente
        </h1>
        <p className="text-sm sm:text-base text-white/50 leading-relaxed mb-10">
          Aquí podrás publicar y descubrir vehículos, inmuebles y activos de alto valor con suscripción y pauta interna.
          Estamos preparando la experiencia para que encaje con el resto del ecosistema LinkServi.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => navigate("/store")}
            className="px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98]"
            style={{
              background: "rgba(56,189,248,0.15)",
              border: "1px solid rgba(56,189,248,0.35)",
            }}
          >
            Ir al ServiMarket
          </button>
          <button
            type="button"
            onClick={() => navigate("/buscar")}
            className="px-6 py-3 rounded-2xl text-sm font-semibold text-white/80 border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all active:scale-[0.98]"
          >
            Buscador global
          </button>
        </div>
      </main>
    </div>
  );
}
