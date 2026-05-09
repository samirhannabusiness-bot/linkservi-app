import { useState } from "react";
import { Crown, X, Zap } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { C2PModal } from "@/components/payments/C2PModal";

export const DURATION_OPTIONS = [
  { months: 1,  label: "1 mes",    price: 4.99,  perMonth: 4.99,  badge: "" },
  { months: 3,  label: "3 meses",  price: 13.47, perMonth: 4.49,  badge: "Ahorra 10%" },
  { months: 6,  label: "6 meses",  price: 23.95, perMonth: 3.99,  badge: "Ahorra 20%" },
  { months: 12, label: "12 meses", price: 41.92, perMonth: 3.49,  badge: "🔥 Más popular" },
];

export function WorkerPremiumModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [c2pOpen, setC2pOpen] = useState(false);

  const duration = DURATION_OPTIONS.find(d => d.months === selectedMonths)!;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">

        <div
          className="flex items-center justify-between px-5 py-4 border-b border-border"
          style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.12),rgba(124,58,237,0.08))" }}
        >
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-foreground">Activar Premium</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">¿Por cuánto tiempo?</p>
            <div className="grid grid-cols-2 gap-2">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.months}
                  onClick={() => setSelectedMonths(opt.months)}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    selectedMonths === opt.months
                      ? "border-amber-400/60 bg-amber-400/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  {opt.badge && (
                    <span className="absolute -top-2 -right-1 text-[10px] bg-amber-400 text-black font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                      {opt.badge}
                    </span>
                  )}
                  <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                  <div className="text-xl font-black text-foreground mt-0.5">${opt.price}</div>
                  {opt.months > 1 && (
                    <div className="text-xs text-muted-foreground">${opt.perMonth.toFixed(2)}/mes</div>
                  )}
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
            <Zap className="w-4 h-4" /> Pagar al instante con C2P (BDV) — ${duration.price}
          </button>

          <p className="text-center text-[11px] text-muted-foreground">
            Pago seguro al instante con tu cuenta Banco de Venezuela. Activación inmediata.
          </p>

        </div>
      </div>

      {c2pOpen && (
        <C2PModal
          open={c2pOpen}
          onClose={() => setC2pOpen(false)}
          amountUsd={duration.price}
          concept={`Premium Profesional — ${duration.label}`}
          referenceType="worker_premium"
          metadata={{ days: selectedMonths * 30 }}
          onSuccess={() => {
            setC2pOpen(false);
            toast({ title: "¡Premium activado!", description: "Tu cuenta Premium ya está activa." });
            onSuccess();
          }}
        />
      )}
    </div>
  );
}
