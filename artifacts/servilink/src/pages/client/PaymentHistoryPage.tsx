import { useListBookings } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getRequestOptions } from "@/lib/api";
import { Smartphone, DollarSign, Bitcoin, Wallet, Banknote, CheckCircle, TrendingUp, Receipt } from "lucide-react";
import { format } from "date-fns";

function fmtBs(amount: number) {
  return "Bs. " + amount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_ICONS: Record<string, React.ComponentType<any>> = {
  pago_movil: Smartphone,
  zelle: DollarSign,
  efectivo_usd: Banknote,
  efectivo_bs: Wallet,
  binance: Bitcoin,
  otro: Wallet,
};

const PAYMENT_LABELS: Record<string, string> = {
  pago_movil: "Pago Móvil",
  zelle: "Zelle",
  efectivo_usd: "Efectivo USD",
  efectivo_bs: "Efectivo Bs",
  binance: "Binance Pay",
  otro: "Otro",
};

const PAYMENT_COLORS: Record<string, string> = {
  pago_movil: "text-blue-600 bg-blue-50 border-blue-200",
  zelle: "text-purple-600 bg-purple-50 border-purple-200",
  efectivo_usd: "text-emerald-600 bg-emerald-50 border-emerald-200",
  efectivo_bs: "text-orange-600 bg-orange-50 border-orange-200",
  binance: "text-amber-600 bg-amber-50 border-amber-200",
  otro: "text-gray-600 bg-gray-50 border-gray-200",
};

export function PaymentHistoryPage() {
  const opts = getRequestOptions();
  const { data: bookings = [] } = useListBookings({ role: "client", status: "completed" }, opts as any);

  const completedWithPayment = (bookings as any[]).filter((b: any) => b.paymentMethod);
  const total = completedWithPayment.reduce((sum: number, b: any) => sum + (b.totalAmount ?? 0), 0);

  const byMethod: Record<string, number> = {};
  completedWithPayment.forEach((b: any) => {
    const m = b.paymentMethod;
    byMethod[m] = (byMethod[m] ?? 0) + (b.totalAmount ?? 0);
  });

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Historial de Pagos</h1>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Receipt className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{completedWithPayment.length}</p>
            <p className="text-xs text-muted-foreground">Pagos</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center col-span-2">
            <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">${total.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total invertido en servicios</p>
          </div>
        </div>

        {/* By method */}
        {Object.keys(byMethod).length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Por método de pago</p>
            <div className="space-y-2">
              {Object.entries(byMethod).map(([method, amount]) => {
                const Icon = PAYMENT_ICONS[method] ?? Wallet;
                const colors = PAYMENT_COLORS[method] ?? "text-gray-600 bg-gray-50 border-gray-200";
                return (
                  <div key={method} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${colors}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium flex-1">{PAYMENT_LABELS[method]}</span>
                    <span className="text-sm font-bold">${(amount as number).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transaction list */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Transacciones</h2>
          {completedWithPayment.length === 0 ? (
            <div className="py-12 text-center bg-card border border-border rounded-xl">
              <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No hay pagos registrados aún.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedWithPayment.map((b: any) => {
                const Icon = PAYMENT_ICONS[b.paymentMethod] ?? Wallet;
                const colors = PAYMENT_COLORS[b.paymentMethod] ?? "text-gray-600 bg-gray-50 border-gray-200";
                return (
                  <div key={b.id} className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${colors}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{b.categoryName}</p>
                      <p className="text-xs text-muted-foreground">{b.workerName} · {PAYMENT_LABELS[b.paymentMethod]}</p>
                      {b.paymentNote && (
                        <p className="text-xs text-muted-foreground/70 truncate">{b.paymentNote}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-foreground">${b.totalAmount?.toFixed(2)}</p>
                      {b.bcvAmountBs && (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          ≈ {fmtBs(b.bcvAmountBs)}
                        </p>
                      )}
                      {b.bcvRateUsed && (
                        <p className="text-xs text-muted-foreground/60">
                          Bs.&nbsp;{b.bcvRateUsed.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/$1
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{b.completedAt ? format(new Date(b.completedAt), "dd/MM/yy") : format(new Date(b.createdAt), "dd/MM/yy")}</p>
                    </div>
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Anti-fraud tip */}
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold mb-1">🛡️ Protección LinkServi</p>
          <p className="text-xs text-blue-600 dark:text-blue-500">
            LinkServi registra todos tus pagos como evidencia. Si tienes una disputa, contacta a soporte con el ID del servicio.
            <strong> Nunca realices pagos fuera de la plataforma</strong> — evita estafas con comprobantes falsos.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
