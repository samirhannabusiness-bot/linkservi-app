import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Wallet as WalletIcon,
  Lock,
  ArrowDownToLine,
  ArrowUpToLine,
  Receipt,
  ShieldCheck,
  Clock,
  RefreshCw,
} from "lucide-react";

type WalletData = {
  wallet: {
    balanceCents: number;
    holdCents: number;
    totalCents: number;
    currency: string;
    updatedAt: string;
  };
  recentTransactions: Array<{
    id: number;
    type: string;
    amountCents: number;
    balanceAfterCents: number;
    holdAfterCents: number;
    description: string | null;
    status: string;
    createdAt: string;
    refType: string | null;
    refId: number | null;
  }>;
  activeHolds: Array<{
    id: number;
    amountCents: number;
    commissionCents: number;
    status: string;
    refType: string;
    refId: number;
    role: "payer" | "payee";
    createdAt: string;
  }>;
};

function fmtUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents) / 100;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-VE", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

const TYPE_LABELS: Record<string, string> = {
  deposit: "Recarga",
  withdrawal: "Retiro",
  hold: "Retención (escrow)",
  release: "Liberación de escrow",
  refund: "Reembolso",
  commission: "Comisión LinkServi",
  bonus: "Bono",
  adjustment: "Ajuste",
};

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/wallet/me", {
        credentials: "include",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "No se pudo cargar tu billetera");
      }
      const json = (await res.json()) as WalletData;
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <WalletIcon className="w-6 h-6 text-primary" />
              Mi LinkWallet
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Tu billetera segura dentro de LinkServi
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="Actualizar"
            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 text-sm">
            {error}
          </div>
        ) : null}

        {/* Balance card */}
        <div
          className="rounded-2xl p-5 text-white border border-primary/30"
          style={{
            background: "linear-gradient(135deg, rgba(8,16,32,0.95) 0%, rgba(6,182,212,0.18) 100%)",
          }}
        >
          <p className="text-xs uppercase tracking-wider text-cyan-300/80">Saldo disponible</p>
          <p className="text-4xl font-bold mt-1">
            {data ? fmtUsd(data.wallet.balanceCents) : loading ? "···" : "$0.00"}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-black/30 rounded-lg p-3 border border-white/10">
              <div className="flex items-center gap-1.5 text-[11px] text-cyan-200/80 uppercase tracking-wide">
                <Lock className="w-3 h-3" /> Retenido
              </div>
              <p className="text-lg font-semibold mt-0.5">
                {data ? fmtUsd(data.wallet.holdCents) : "$0.00"}
              </p>
            </div>
            <div className="bg-black/30 rounded-lg p-3 border border-white/10">
              <div className="flex items-center gap-1.5 text-[11px] text-cyan-200/80 uppercase tracking-wide">
                <ShieldCheck className="w-3 h-3" /> Total
              </div>
              <p className="text-lg font-semibold mt-0.5">
                {data ? fmtUsd(data.wallet.totalCents) : "$0.00"}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled
            className="flex items-center justify-center gap-2 bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl opacity-60 cursor-not-allowed"
            title="Próximamente"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Recargar
          </button>
          <button
            disabled
            className="flex items-center justify-center gap-2 border border-border text-foreground font-semibold py-3 rounded-xl opacity-60 cursor-not-allowed"
            title="Próximamente"
          >
            <ArrowUpToLine className="w-4 h-4" />
            Retirar
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center -mt-2">
          Recarga y retiro estarán disponibles muy pronto. Por ahora los pagos siguen funcionando como siempre.
        </p>

        {/* Active holds */}
        {data && data.activeHolds.length > 0 ? (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Retenciones activas ({data.activeHolds.length})
            </p>
            <div className="space-y-2">
              {data.activeHolds.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm border-b border-border/50 last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-foreground truncate">
                      {h.role === "payer" ? "Pago retenido" : "A cobrar al confirmar"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.refType} #{h.refId} · {fmtDate(h.createdAt)}
                    </p>
                  </div>
                  <div className={`font-semibold ${h.role === "payer" ? "text-amber-400" : "text-emerald-400"}`}>
                    {h.role === "payer" ? "−" : "+"}{fmtUsd(h.amountCents)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Transactions */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Movimientos recientes
          </p>
          {loading && !data ? (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          ) : !data || data.recentTransactions.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aún no tienes movimientos.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Aquí aparecerán tus recargas, pagos y cobros.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recentTransactions.map((tx) => {
                const positive = tx.amountCents >= 0;
                return (
                  <div key={tx.id} className="flex items-center justify-between text-sm border-b border-border/50 last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-foreground truncate">
                        {TYPE_LABELS[tx.type] ?? tx.type}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.description || (tx.refType ? `${tx.refType} #${tx.refId}` : "")} · {fmtDate(tx.createdAt)}
                      </p>
                    </div>
                    <div className={`font-semibold ${positive ? "text-emerald-400" : "text-red-400"}`}>
                      {positive ? "+" : ""}{fmtUsd(tx.amountCents)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs text-muted-foreground space-y-1.5">
          <p className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Pago seguro con escrow:</strong> cuando pagues un servicio,
              tu dinero queda retenido en LinkWallet y solo se libera al trabajador cuando confirmas que el
              trabajo se hizo bien.
            </span>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
