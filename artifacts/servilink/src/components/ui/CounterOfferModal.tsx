import { useState } from "react";
import { DollarSign, X, Send } from "lucide-react";
import { getAuthHeader } from "@/lib/api";

interface Props {
  bookingId: number;
  clientBudget?: number | null;
  categoryName?: string;
  onClose: () => void;
  onSuccess: (updatedBooking: any) => void;
}

export function CounterOfferModal({ bookingId, clientBudget, categoryName, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState(clientBudget ? String(clientBudget) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setError("Ingresa un monto válido"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/counter-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ amount: num }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al enviar propuesta");
      onSuccess(data);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">Proponer precio</p>
              {categoryName && <p className="text-xs text-muted-foreground">{categoryName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {clientBudget && (
            <div className="p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Oferta del cliente</span>
              <span className="text-sm font-semibold text-foreground">${clientBudget.toFixed(2)}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tu precio propuesto (USD)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-border bg-background text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3 border border-border">
            💡 El cliente recibirá una notificación con tu propuesta y podrá aceptarla o rechazarla. Si la acepta, la solicitud quedará automáticamente confirmada.
          </p>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all font-medium text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !amount}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? "Enviando..." : "Enviar propuesta"}
          </button>
        </div>
      </div>
    </div>
  );
}
