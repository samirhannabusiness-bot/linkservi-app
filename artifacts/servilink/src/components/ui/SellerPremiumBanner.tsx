import { useState } from "react";
import { useLocation } from "wouter";
import { usePremiumPreview } from "@/hooks/usePremiumPreview";
import { Crown, TrendingDown, Zap, ArrowRight, Loader2, ChevronDown, ChevronUp } from "lucide-react";

function fmt(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  compact?: boolean;
}

export function SellerPremiumBanner({ compact = false }: Props) {
  const [, navigate] = useLocation();
  const { data, loading } = usePremiumPreview();
  const [showDetails, setShowDetails] = useState(false);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-4 flex items-center gap-3 animate-pulse"
        style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.12)" }}
      >
        <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
        <div className="h-3 w-48 rounded bg-white/[0.06]" />
      </div>
    );
  }

  if (!data || data.alreadyPremium) return null;

  const hasVolume = data.monthlyVolumeUsd > 0;
  const savingsStr = fmt(data.potentialSavings ?? data.lostEarnings ?? 0);
  const remainingStr = fmt(data.remainingSalesNeeded);
  const breakEvenStr = fmt(data.salesNeededToBreakEven);

  if (compact) {
    return (
      <button
        onClick={() => navigate("/cohost/plan")}
        className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all group text-left"
        style={{
          background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))",
          border: "1px solid rgba(251,191,36,0.25)",
        }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(251,191,36,0.2)" }}>
          <Crown className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          {hasVolume ? (
            <>
              <p className="text-sm font-bold text-amber-400 leading-tight">
                Cada venta sin Premium te cuesta más dinero
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pagas {data.currentRate}% en cada venta — con Premium pagarías {data.premiumRate}% · Ahorro potencial: ${savingsStr}/mes
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-amber-400 leading-tight">
                Cada venta sin Premium te cuesta más dinero
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pagas 10% por cada venta. Con Premium ese costo baja a 7% · Se paga solo con ${breakEvenStr} en ventas
              </p>
            </>
          )}
        </div>
        <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(245,158,11,0.05), rgba(0,0,0,0))",
        border: "1px solid rgba(251,191,36,0.22)",
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(251,191,36,0.2)" }}>
          <Crown className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          {hasVolume ? (
            <>
              <p className="text-base font-bold text-amber-400">
                💸 Cada venta sin Premium te cuesta más dinero
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Este mes pagaste ${savingsStr} de más en comisión de venta — con Premium habrías pagado {data.premiumRate}% en vez del {data.currentRate}%
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-bold text-amber-400">
                Cada venta sin Premium te cuesta más dinero
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pagas el 10% de cada venta a la plataforma. Con Premium ese costo de venta baja al 7% — retienes más en cada pedido.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px mx-4 mb-4" style={{ background: "rgba(255,255,255,0.05)" }}>
        {[
          {
            label: "Tu fee actual",
            value: `${data.currentRate}%`,
            sub: hasVolume ? `-$${fmt((data as any).currentFeePaid ?? 0)}/mes` : "Plan Gratuito",
            color: "text-red-400",
          },
          {
            label: "Con Premium",
            value: `${data.premiumRate}%`,
            sub: hasVolume ? `-$${fmt((data as any).premiumFeePaid ?? 0)}/mes` : "Inmediato",
            color: "text-emerald-400",
          },
          {
            label: hasVolume ? "Ahorro/mes" : "Plan desde",
            value: hasVolume ? `$${savingsStr}` : `$${data.planCostUsd}`,
            sub: "al mes",
            color: "text-amber-400",
          },
        ].map(s => (
          <div
            key={s.label}
            className="py-3 px-3 text-center"
            style={{ background: "rgba(0,0,0,0.2)" }}
          >
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Break-even info */}
      {data.remainingSalesNeeded > 0 && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Solo necesitas ${remainingStr} más en ventas</span>{" "}
              para que Premium se pague solo (${data.planCostUsd}/mes)
            </p>
          </div>
        </div>
      )}

      {data.remainingSalesNeeded === 0 && hasVolume && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-xl" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}>
          <p className="text-xs text-emerald-400 font-medium">
            ✓ Ya vendes suficiente para que Premium sea rentable desde el primer mes
          </p>
        </div>
      )}

      {/* Expandable detail */}
      {hasVolume && (
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full px-4 py-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors border-t"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <span>Ver cuánto ahorrarías según tu volumen</span>
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}

      {showDetails && hasVolume && (
        <div className="px-4 pb-3 pt-2 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proyección de ahorro mensual con Premium</p>
          {[
            { label: "$500/mes en ventas", savings: fmt(500 * 0.03) },
            { label: "$1,000/mes en ventas", savings: fmt(1000 * 0.03) },
            { label: "$2,000/mes en ventas", savings: fmt(2000 * 0.03) },
            { label: "$5,000/mes en ventas", savings: fmt(5000 * 0.03) },
          ].map(t => (
            <div key={t.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t.label} (3% menos)</span>
              <span className="font-semibold text-emerald-400">−${t.savings} de fee</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Basado en tu volumen mensual actual de ${fmt(data.monthlyVolumeUsd)}
          </p>
        </div>
      )}

      {/* CTA */}
      <div className="p-4 pt-0">
        <button
          onClick={() => navigate("/cohost/plan")}
          className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            color: "#000",
            boxShadow: "0 4px 20px rgba(251,191,36,0.3)",
          }}
        >
          <Zap className="w-4 h-4" />
          Dejar de pagar 10% en cada venta
        </button>
        <p className="text-center text-[10px] text-muted-foreground mt-2">
          Con Premium pagas solo 7% · Se recupera con ${breakEvenStr} en ventas
        </p>
      </div>
    </div>
  );
}
