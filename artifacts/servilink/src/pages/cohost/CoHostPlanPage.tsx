import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { SellerPremiumBanner } from "@/components/ui/SellerPremiumBanner";
import {
  Crown, CheckCircle, Clock, Zap, TrendingUp,
  X, ArrowUpCircle, ChevronRight, BarChart3
} from "lucide-react";
import { C2PModal } from "@/components/payments/C2PModal";

// ── Data hooks ────────────────────────────────────────────────────────────────
function useCohostPlan() {
  return useQuery({
    queryKey: ["cohost", "plan"],
    queryFn: () => apiFetch("/api/cohost/plan", { headers: getAuthHeader() }),
  });
}

// ── Plan config ───────────────────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { months: 1, label: "1 mes", price: 20, badge: "" },
  { months: 3, label: "3 meses", price: 54, badge: "Ahorra 10%" },
  { months: 6, label: "6 meses", price: 96, badge: "Ahorra 20%" },
  { months: 12, label: "12 meses", price: 168, badge: "🔥 Más popular" },
];

const TIERS = [
  { label: "Inicio (< $1k/mes)", pct: 6, color: "text-blue-400" },
  { label: "Crecimiento ($1k–$5k)", pct: 7.5, color: "text-violet-400" },
  { label: "Alto volumen ($5k+)", pct: 10, color: "text-emerald-400" },
];

export function CoHostPlanPage() {
  const { user, isManager } = useAuth();
  const isSeller = user?.role === "seller";
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [c2pOpen, setC2pOpen] = useState(false);
  const qc = useQueryClient();

  const { data: plan, isLoading } = useCohostPlan();

  const isPremium = plan?.plan === "premium";
  const hasPending = !!plan?.pendingRequest;
  const selectedDuration = DURATION_OPTIONS.find(d => d.months === selectedMonths)!;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <div className="h-40 rounded-2xl bg-white/[0.06] animate-pulse" />
        <div className="h-48 rounded-2xl bg-white/[0.06] animate-pulse" />
        <div className="h-32 rounded-2xl bg-white/[0.06] animate-pulse" />
      </div>
    );
  }

  // ── Acceso: solo vendedores (su fee de venta) o gestores (sus comisiones por
  //    volumen). Otros roles (cohost legacy, worker, cliente) no tienen plan
  //    aplicable aquí — mostramos un mensaje claro y los devolvemos al dashboard.
  if (!isSeller && !isManager) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 max-w-2xl mx-auto">
        <div className="glass rounded-2xl p-6 text-center space-y-3">
          <Crown className="w-10 h-10 text-amber-400 mx-auto opacity-60" />
          <h1 className="text-lg font-bold text-foreground">Mi Plan</h1>
          <p className="text-sm text-muted-foreground">
            Esta sección es para vendedores y gestores. No aplica a tu cuenta de dueño de negocio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" /> Mi Plan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSeller
            ? "Reduce tu comisión de venta y aumenta tus ganancias netas"
            : "Controla tu nivel de comisiones y acceso a beneficios"}
        </p>
      </div>

      {/* Premium upsell — sellers on free plan, placed before the plan card */}
      {isSeller && !isPremium && !hasPending && <SellerPremiumBanner />}

      {/* Current plan card */}
      <div className={`rounded-2xl p-6 ${isPremium ? "bg-gradient-to-br from-amber-500/20 to-violet-600/20 border border-amber-400/30" : "glass"}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isPremium
                ? <span className="flex items-center gap-1.5 text-amber-400 font-bold text-lg"><Crown className="w-5 h-5" /> Premium</span>
                : <span className="text-muted-foreground font-semibold text-lg">Plan Gratuito</span>}
            </div>
            {isPremium && plan?.planExpiresAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Vence: {new Date(plan.planExpiresAt).toLocaleDateString("es-VE", { dateStyle: "long" })}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <div className="text-3xl font-black text-foreground">
                {isSeller ? (isPremium ? "7%" : "10%") : `${plan?.commissionPct ?? 5}%`}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {isSeller ? "fee de venta (plataforma)" : "tu comisión actual"}
                </div>
                {isPremium && !isSeller && (
                  <div className="text-xs text-emerald-400">+${(plan?.monthlyVolumeUsd ?? 0).toFixed(0)} este mes</div>
                )}
                {isPremium && isSeller && (
                  <div className="text-xs text-emerald-400">Ahorro vs plan gratuito: 3%/venta</div>
                )}
              </div>
            </div>
          </div>
          {isPremium
            ? <div className="w-14 h-14 rounded-2xl bg-amber-400/20 flex items-center justify-center"><Crown className="w-7 h-7 text-amber-400" /></div>
            : <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center"><Zap className="w-7 h-7 text-muted-foreground opacity-40" /></div>}
        </div>

        {/* Premium: volume progress */}
        {isPremium && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Tu nivel este mes</p>
            <div className="space-y-1.5">
              {TIERS.map((t, i) => {
                const thresholds = [0, 1000, 5000];
                const isActive = (plan?.monthlyVolumeUsd ?? 0) >= thresholds[i] &&
                  (i === TIERS.length - 1 || (plan?.monthlyVolumeUsd ?? 0) < (thresholds[i + 1] ?? Infinity));
                return (
                  <div key={t.label} className={`flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${isActive ? "bg-white/[0.08] ring-1 ring-white/10" : "opacity-50"}`}>
                    <div className="flex items-center gap-2">
                      {isActive
                        ? <CheckCircle className={`w-3.5 h-3.5 ${t.color}`} />
                        : <div className="w-3.5 h-3.5 rounded-full border border-white/20" />}
                      <span className="text-xs text-foreground">{t.label}</span>
                    </div>
                    <span className={`text-sm font-bold ${t.color}`}>{t.pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Pending request banner */}
      {hasPending && (
        <div className="glass rounded-2xl p-4 flex items-start gap-3 border border-amber-400/20">
          <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Solicitud en revisión</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tu pago de ${plan?.pendingRequest?.amount} por {plan?.pendingRequest?.planMonths} {plan?.pendingRequest?.planMonths === 1 ? "mes" : "meses"} está siendo verificado.
              El admin lo activará pronto.
            </p>
          </div>
        </div>
      )}

      {/* Free plan: comparison + upgrade */}
      {!isPremium && !hasPending && (
        <>
          {/* What you get with premium */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" /> ¿Qué incluye Premium?
            </h2>
            {isSeller ? (
              /* Seller benefits */
              <>
                <div className="space-y-2">
                  {[
                    { text: "Comisión de venta reducida: 10% → 7%", highlight: true },
                    { text: "Ahorras $3 por cada $100 vendidos — acumulado mes a mes", highlight: true },
                    { text: "Mayor visibilidad en ServiMarket y búsquedas", highlight: false },
                    { text: "Hasta 50 productos activos (vs 10 en plan gratuito)", highlight: false },
                    { text: "Badge de Vendedor Verificado en tu tienda", highlight: false },
                    { text: "Soporte prioritario para incidencias de pedidos", highlight: false },
                  ].map(({ text, highlight }) => (
                    <div key={text} className={`flex items-start gap-2 px-3 py-2 rounded-xl ${highlight ? "bg-amber-400/10" : ""}`}>
                      <CheckCircle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${highlight ? "text-amber-400" : "text-emerald-400"}`} />
                      <span className="text-sm text-foreground">{text}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 bg-white/[0.03] rounded-xl p-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Tu fee de venta con Premium</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Plan Gratuito (actual)</span>
                    <span className="text-sm font-bold text-red-400">10%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Plan Premium</span>
                    <span className="text-sm font-bold text-emerald-400">7% ↓</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-1.5 mt-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <span className="text-xs font-medium text-foreground">Ahorro por cada $1,000 vendidos</span>
                    <span className="text-sm font-bold text-amber-400">$30</span>
                  </div>
                </div>
              </>
            ) : (
              /* Cohost benefits */
              <>
                <div className="space-y-2">
                  {[
                    { text: "Comisión hasta 10% (vs 5% gratis)", highlight: true },
                    { text: "Sube según tu volumen — gana más a medida que creces", highlight: true },
                    { text: "Profesionales y tiendas ilimitados", highlight: false },
                    { text: "Badge 'Host Verificado' en tu perfil", highlight: false },
                    { text: "Acceso prioritario a nuevas funcionalidades", highlight: false },
                  ].map(({ text, highlight }) => (
                    <div key={text} className={`flex items-start gap-2 px-3 py-2 rounded-xl ${highlight ? "bg-amber-400/10" : ""}`}>
                      <CheckCircle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${highlight ? "text-amber-400" : "text-emerald-400"}`} />
                      <span className="text-sm text-foreground">{text}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 bg-white/[0.03] rounded-xl p-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Tus comisiones con Premium</p>
                  {TIERS.map(t => (
                    <div key={t.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t.label}</span>
                      <span className={`text-sm font-bold ${t.color}`}>{t.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Upgrade button / form toggle */}
          {!showUpgradeForm ? (
            <button
              onClick={() => setShowUpgradeForm(true)}
              className="w-full py-4 rounded-2xl btn-gradient text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg"
            >
              <ArrowUpCircle className="w-5 h-5" /> Activar Premium — desde $20/mes
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" /> Activar Premium
                </h2>
                <button onClick={() => setShowUpgradeForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Duration picker */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">¿Por cuánto tiempo?</p>
                <div className="grid grid-cols-2 gap-2">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.months}
                      onClick={() => setSelectedMonths(opt.months)}
                      className={`relative p-3 rounded-xl border text-left transition-all ${selectedMonths === opt.months ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 hover:border-white/20"}`}
                    >
                      {opt.badge && (
                        <span className="absolute -top-2 -right-1 text-[10px] bg-amber-400 text-black font-bold px-2 py-0.5 rounded-full">
                          {opt.badge}
                        </span>
                      )}
                      <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                      <div className="text-lg font-black text-foreground mt-0.5">${opt.price}</div>
                      {opt.months > 1 && <div className="text-xs text-muted-foreground">${(opt.price / opt.months).toFixed(0)}/mes</div>}
                    </button>
                  ))}
                </div>
              </div>

              {/* C2P instant payment — único método disponible */}
              <button
                onClick={() => setC2pOpen(true)}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)", boxShadow: "0 8px 24px rgba(14,165,233,0.3)" }}
              >
                <Zap className="w-4 h-4" /> Pagar al instante con C2P (BDV) — ${selectedDuration.price}
              </button>

              <p className="text-center text-[11px] text-muted-foreground">
                Pago seguro al instante con tu cuenta Banco de Venezuela. Activación inmediata.
              </p>
            </div>
          )}
        </>
      )}

      {/* Premium: renewal option */}
      {isPremium && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-violet-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Plan activo y funcionando</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tus comisiones escalan automáticamente según tu volumen mensual</p>
          </div>
        </div>
      )}

      {c2pOpen && (
        <C2PModal
          open={c2pOpen}
          onClose={() => setC2pOpen(false)}
          amountUsd={selectedDuration.price}
          concept={`Plan Premium Cohost — ${selectedDuration.label}`}
          referenceType="cohost_plan"
          metadata={{ planMonths: selectedMonths }}
          onSuccess={() => {
            setC2pOpen(false);
            setShowUpgradeForm(false);
            qc.invalidateQueries({ queryKey: ["cohost", "plan"] });
            toast({ title: "¡Plan Premium activado!", description: "Tu plan Premium Cohost está activo." });
          }}
        />
      )}

      {/* Free vs Premium quick table — cohost only */}
      {!isPremium && !isSeller && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="grid grid-cols-3 text-xs font-semibold text-muted-foreground bg-white/[0.04] px-4 py-2.5">
            <span>Característica</span>
            <span className="text-center">Gratis</span>
            <span className="text-center text-amber-400">Premium</span>
          </div>
          {[
            ["Comisión base", "5%", "6%"],
            ["Comisión máxima", "5%", "10%"],
            ["Tiers por volumen", "—", "✓"],
            ["Profesionales", "Limitados", "Ilimitados"],
            ["Tiendas", "1", "Ilimitadas"],
            ["Badge verificado", "—", "✓"],
          ].map(([feat, free, prem]) => (
            <div key={feat} className="grid grid-cols-3 px-4 py-2.5 border-t border-white/[0.05] text-xs">
              <span className="text-muted-foreground">{feat}</span>
              <span className="text-center text-muted-foreground/70">{free}</span>
              <span className="text-center text-amber-400 font-medium">{prem}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
