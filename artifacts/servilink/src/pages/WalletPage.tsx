import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Wallet as WalletIcon,
  Lock,
  ArrowDownToLine,
  ArrowUpToLine,
  Receipt,
  ShieldCheck,
  Clock,
  RefreshCw,
  Send,
  X,
  KeyRound,
} from "lucide-react";

type WalletData = {
  wallet: {
    balanceCents: number;
    holdCents: number;
    totalCents: number;
    currency: string;
    updatedAt: string;
    hasPin?: boolean;
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
  transfer_out: "Transferencia enviada",
  transfer_in: "Transferencia recibida",
};

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [showTransfer, setShowTransfer] = useState(false);

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
        <div className="grid grid-cols-3 gap-2">
          <button
            disabled
            className="flex flex-col items-center justify-center gap-1 bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl opacity-60 cursor-not-allowed text-xs"
            title="Próximamente"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Recargar
          </button>
          <button
            onClick={() => setShowTransfer(true)}
            className="flex flex-col items-center justify-center gap-1 bg-primary text-primary-foreground font-semibold py-3 rounded-xl text-xs hover:bg-primary/90 transition"
          >
            <Send className="w-4 h-4" />
            Transferir
          </button>
          <button
            disabled
            className="flex flex-col items-center justify-center gap-1 border border-border text-foreground font-semibold py-3 rounded-xl opacity-60 cursor-not-allowed text-xs"
            title="Próximamente"
          >
            <ArrowUpToLine className="w-4 h-4" />
            Retirar
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center -mt-2">
          Recarga y retiro estarán disponibles muy pronto. Las transferencias entre usuarios LinkServi son sin comisión.
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

      {showTransfer ? (
        <TransferModal
          balanceCents={data?.wallet.balanceCents ?? 0}
          hasPin={!!data?.wallet.hasPin}
          onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); void load(); }}
        />
      ) : null}
    </AppLayout>
  );
}

// ── Transferir modal ─────────────────────────────────────────────────────────
type TransferModalProps = {
  balanceCents: number;
  hasPin: boolean;
  onClose: () => void;
  onDone: () => void;
};

function TransferModal({ balanceCents, hasPin, onClose, onDone }: TransferModalProps) {
  const [step, setStep] = useState<"form" | "confirm" | "pin-setup">(hasPin ? "form" : "form");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
  const [preview, setPreview] = useState<{ recipient: { name: string; email: string }; amountCents: number } | null>(null);
  const [needsPinSetup, setNeedsPinSetup] = useState(!hasPin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Clave de idempotencia única por intento de transferencia: se genera al
  // pasar al paso "confirm" y se reutiliza en cada reintento del mismo monto
  // hacia el mismo destinatario, para que el servidor no duplique el cargo.
  const [idemKey, setIdemKey] = useState("");

  // ── Setup PIN flow ──
  const [pinPassword, setPinPassword] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!email.trim() || !Number.isFinite(cents) || cents <= 0) {
      setErr("Completa correo y monto válido");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/transfer/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ email: email.trim(), amountCents: cents }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "No se pudo verificar"); return; }
      setPreview({ recipient: j.recipient, amountCents: j.amountCents });
      setNeedsPinSetup(!!j.needsPinSetup);
      // Generamos una clave única para esta operación. Si el usuario hace
      // doble click en "Confirmar" o reintenta tras un timeout, mandamos
      // la misma clave y el backend la deduplicará.
      setIdemKey(
        (typeof crypto !== "undefined" && "randomUUID" in crypto)
          ? crypto.randomUUID()
          : `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      );
      setStep(j.needsPinSetup ? "pin-setup" : "confirm");
    } catch (e: any) {
      setErr(e?.message || "Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetupPin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!/^\d{4}$/.test(pinNew)) { setErr("El PIN debe ser de 4 dígitos"); return; }
    if (pinNew !== pinConfirm) { setErr("Los PINs no coinciden"); return; }
    if (!pinPassword) { setErr("Confirma tu contraseña"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/pin/set", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ password: pinPassword, pin: pinNew }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "No se pudo guardar el PIN"); return; }
      toast({ title: "PIN configurado", description: "Ya puedes confirmar tu transferencia." });
      setNeedsPinSetup(false);
      setStep("confirm");
    } catch (e: any) {
      setErr(e?.message || "Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!/^\d{4}$/.test(pin)) { setErr("PIN de 4 dígitos requerido"); return; }
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/transfer", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idemKey,
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          email: email.trim(),
          amountCents: preview.amountCents,
          pin,
          description: description.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "Transferencia fallida"); return; }
      toast({
        title: "Transferencia exitosa",
        description: `Enviaste ${fmtUsd(preview.amountCents)} a ${preview.recipient.name}.`,
      });
      onDone();
    } catch (e: any) {
      setErr(e?.message || "Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Send className="w-5 h-5 text-primary" />
            {step === "pin-setup" ? "Configura tu PIN" : step === "confirm" ? "Confirmar transferencia" : "Transferir dinero"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Saldo disponible: <strong className="text-foreground">{fmtUsd(balanceCents)}</strong>
        </p>

        {err ? (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
            {err}
          </div>
        ) : null}

        {step === "form" ? (
          <form onSubmit={handlePreview} className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Correo del destinatario</label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Monto en USD</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25.00"
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-lg font-semibold text-foreground"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">Mínimo $0.10 — máximo $500 por operación.</p>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Concepto (opcional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pago por la mudanza"
                maxLength={140}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl disabled:opacity-50"
            >
              {busy ? "Verificando…" : "Continuar"}
            </button>
          </form>
        ) : null}

        {step === "pin-setup" ? (
          <form onSubmit={handleSetupPin} className="space-y-3">
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg p-3 text-xs flex items-start gap-2">
              <KeyRound className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Es la primera vez que mueves dinero en LinkWallet. Crea un PIN de 4 dígitos para autorizar esta y futuras transferencias.</span>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Tu contraseña de LinkServi</label>
              <input
                type="password"
                value={pinPassword}
                onChange={(e) => setPinPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nuevo PIN (4 dígitos)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pinNew}
                  onChange={(e) => setPinNew(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-center text-xl tracking-widest text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Repetir PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-center text-xl tracking-widest text-foreground"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl disabled:opacity-50"
            >
              {busy ? "Guardando…" : "Guardar PIN y continuar"}
            </button>
          </form>
        ) : null}

        {step === "confirm" && preview ? (
          <form onSubmit={handleConfirm} className="space-y-3">
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Vas a enviar</p>
              <p className="text-3xl font-bold text-foreground">{fmtUsd(preview.amountCents)}</p>
              <p className="text-sm text-foreground mt-2">
                a <strong>{preview.recipient.name}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{preview.recipient.email}</p>
              {description ? (
                <p className="text-xs text-muted-foreground border-t border-border/50 pt-2 mt-2">
                  Concepto: {description}
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Tu PIN de billetera (4 dígitos)</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                autoFocus
                className="w-full bg-background border border-border rounded-lg px-3 py-3 text-center text-2xl tracking-[0.5em] text-foreground"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setStep("form"); setPin(""); }}
                disabled={busy}
                className="border border-border text-foreground font-medium py-3 rounded-xl disabled:opacity-50"
              >
                Atrás
              </button>
              <button
                type="submit"
                disabled={busy || pin.length !== 4}
                className="bg-primary text-primary-foreground font-semibold py-3 rounded-xl disabled:opacity-50"
              >
                {busy ? "Enviando…" : "Confirmar"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
