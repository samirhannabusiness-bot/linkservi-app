import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Receipt, ArrowDownToLine, Clock, CheckCircle, XCircle, Banknote,
  ImageOff, ZoomIn, X, ChevronDown, ChevronUp, CreditCard, Loader2,
  DollarSign, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { mediaSrc } from "@/lib/media-url";

// ─── Constants ────────────────────────────────────────────────────────────────
const METHOD_LABELS: Record<string, string> = {
  pago_movil: "Pago Móvil",
  binance: "Binance",
  zelle: "Zelle",
  paypal: "PayPal",
  transferencia: "Transferencia",
};

const WITHDRAWAL_STATUS: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string; border: string }> = {
  pending:  { label: "Pendiente",  Icon: Clock,         color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  approved: { label: "Aprobado",   Icon: CheckCircle,   color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  rejected: { label: "Rechazado",  Icon: XCircle,       color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30" },
  paid:     { label: "Pagado",     Icon: Banknote,      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
};

const BOOKING_PAYMENT_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  payment_pending:   { label: "En verificación", color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  payment_confirmed: { label: "Confirmado",       color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  completed:         { label: "Completado",        color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  disputed:          { label: "En disputa",        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30" },
};

// ─── Image lightbox ───────────────────────────────────────────────────────────
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[600] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt="Comprobante"
        className="max-w-full max-h-[90vh] object-contain rounded-xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Payment proof card (booking) ─────────────────────────────────────────────
function BookingReceiptCard({ b }: { b: any }) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const statusCfg = BOOKING_PAYMENT_STATUS[b.status] ?? BOOKING_PAYMENT_STATUS.payment_confirmed;
  const proofUrl = b.paymentProofUrl ? mediaSrc(b.paymentProofUrl) : null;
  const earningsDisplay = b.workerEarnings != null
    ? b.workerEarnings
    : b.totalAmount != null
      ? (b.totalAmount * 0.9)
      : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${statusCfg.bg} border ${statusCfg.border}`}>
            <DollarSign className={`w-4 h-4 ${statusCfg.color}`} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm truncate">
              {b.categoryName} · {b.clientName}
            </p>
            <p className="text-xs text-muted-foreground">
              {b.createdAt ? format(new Date(b.createdAt), "dd MMM yyyy, HH:mm", { locale: es }) : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {earningsDisplay != null && (
            <span className="text-sm font-bold text-emerald-400">+${Number(earningsDisplay).toFixed(2)}</span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
            {statusCfg.label}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            {b.totalAmount != null && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground mb-0.5">Total del servicio</p>
                <p className="text-base font-bold text-foreground">${Number(b.totalAmount).toFixed(2)}</p>
              </div>
            )}
            {earningsDisplay != null && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] text-emerald-400 mb-0.5">Tu ganancia (90%)</p>
                <p className="text-base font-bold text-emerald-400">+${Number(earningsDisplay).toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Payment method + reference */}
          {(b.paymentMethod || b.paymentReference) && (
            <div className="space-y-1.5 text-xs">
              {b.paymentMethod && (
                <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Método de pago</span>
                  <span className="font-semibold text-foreground">{METHOD_LABELS[b.paymentMethod] ?? b.paymentMethod}</span>
                </div>
              )}
              {b.paymentReference && (
                <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Referencia</span>
                  <span className="font-mono font-semibold text-foreground">{b.paymentReference}</span>
                </div>
              )}
              {b.bcvRateUsed && (
                <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Tasa BCV usada</span>
                  <span className="font-semibold text-foreground">Bs. {Number(b.bcvRateUsed).toFixed(2)}</span>
                </div>
              )}
              {b.bcvAmountBs && (
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground">Monto en Bs.</span>
                  <span className="font-semibold text-foreground">Bs. {Number(b.bcvAmountBs).toLocaleString("es-VE", { maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          )}

          {/* Proof image */}
          {proofUrl ? (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Comprobante del cliente</p>
              <div
                className="relative group rounded-xl overflow-hidden border border-border cursor-zoom-in"
                onClick={() => setLightbox(true)}
              >
                <img
                  src={proofUrl}
                  alt="Comprobante de pago"
                  className="w-full max-h-48 object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">Toca para ampliar</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border">
              <ImageOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">Sin comprobante adjunto</p>
            </div>
          )}
        </div>
      )}

      {lightbox && proofUrl && (
        <ImageLightbox src={proofUrl} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}

// ─── Withdrawal card ──────────────────────────────────────────────────────────
function WithdrawalReceiptCard({ w }: { w: any }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = WITHDRAWAL_STATUS[w.status] ?? WITHDRAWAL_STATUS.pending;
  const Icon = cfg.Icon;
  const details = w.paymentDetails ?? {};

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">
              Retiro — {METHOD_LABELS[w.method] ?? w.method}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(w.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${cfg.color}`}>−${Number(w.amount).toFixed(2)}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
            {cfg.label}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
          <p className="text-xs font-semibold text-foreground mb-1">Datos de pago</p>
          {w.method === "pago_movil" && (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between py-1 border-b border-border/60">
                <span className="text-muted-foreground">Banco</span>
                <span className="font-semibold text-foreground">{details.banco}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/60">
                <span className="text-muted-foreground">Teléfono</span>
                <span className="font-mono font-semibold text-foreground">{details.telefono}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Cédula</span>
                <span className="font-semibold text-foreground">{details.cedula}</span>
              </div>
            </div>
          )}
          {w.method === "binance" && (
            <div className="flex justify-between py-1 text-xs">
              <span className="text-muted-foreground">ID / Correo Binance</span>
              <span className="font-semibold text-foreground">{details.binanceId}</span>
            </div>
          )}
          {w.method === "zelle" && (
            <div className="flex justify-between py-1 text-xs">
              <span className="text-muted-foreground">Correo Zelle</span>
              <span className="font-semibold text-foreground">{details.email}</span>
            </div>
          )}
          {w.adminNotes && (
            <div className="mt-2 p-2.5 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Nota del equipo: </span>{w.adminNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Month grouping helpers ────────────────────────────────────────────────────
function getMonthKey(dateStr: string): string {
  return format(new Date(dateStr), "yyyy-MM");
}
function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return format(d, "MMMM yyyy", { locale: es });
}
function isCurrentMonth(key: string): boolean {
  const now = new Date();
  return key === format(now, "yyyy-MM");
}

interface MonthGroup<T> { key: string; label: string; items: T[]; isCurrent: boolean }
function groupByMonth<T extends { createdAt: string }>(items: T[]): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getMonthKey(item.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ key, label: getMonthLabel(key), items, isCurrent: isCurrentMonth(key) }));
}

// ─── Collapsible month section ─────────────────────────────────────────────────
function MonthSection<T extends { createdAt: string }>({
  group,
  renderCard,
  amountFn,
  amountColor = "text-emerald-400",
}: {
  group: MonthGroup<T>;
  renderCard: (item: T) => React.ReactNode;
  amountFn?: (items: T[]) => number;
  amountColor?: string;
}) {
  const [open, setOpen] = useState(group.isCurrent);
  const total = amountFn ? amountFn(group.items) : null;

  if (group.isCurrent) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">
            Este mes · {group.items.length} movimiento{group.items.length !== 1 ? "s" : ""}
          </span>
          {total != null && (
            <span className={`text-xs font-bold ${amountColor}`}>${total.toFixed(2)}</span>
          )}
        </div>
        {group.items.map((item, i) => (
          <div key={(item as any).id ?? i}>{renderCard(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          {open
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground capitalize">{group.label}</span>
          <span className="text-xs text-muted-foreground">· {group.items.length} movimiento{group.items.length !== 1 ? "s" : ""}</span>
        </div>
        {total != null && (
          <span className={`text-sm font-bold ${amountColor}`}>${total.toFixed(2)}</span>
        )}
      </button>
      {open && (
        <div className="divide-y divide-border/60 px-3 py-3 space-y-2 bg-card/50">
          {group.items.map((item, i) => (
            <div key={(item as any).id ?? i} className={i > 0 ? "pt-2" : ""}>
              {renderCard(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
type Tab = "pagos" | "retiros";

export function WorkerReceiptsPage() {
  const [tab, setTab] = useState<Tab>("pagos");
  const [bookings, setBookings] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [bRes, wRes] = await Promise.all([
        fetch("/api/bookings?role=worker", { headers: getAuthHeader() }),
        fetch("/api/withdrawals", { headers: getAuthHeader() }),
      ]);
      const bData = bRes.ok ? await bRes.json() : [];
      const wData = wRes.ok ? await wRes.json() : [];
      const paymentBookings = (bData as any[]).filter((b: any) =>
        ["payment_pending", "payment_confirmed", "started", "completed", "disputed"].includes(b.status)
      );
      paymentBookings.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      (wData as any[]).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBookings(paymentBookings);
      setWithdrawals(wData);
      setLoading(false);
    };
    load();
  }, []);

  const totalEarned = bookings
    .filter(b => ["completed", "payment_confirmed", "started"].includes(b.status))
    .reduce((sum, b) => sum + (b.workerEarnings ?? (b.totalAmount ?? 0) * 0.9), 0);
  const totalWithdrawn = withdrawals
    .filter(w => w.status === "paid")
    .reduce((sum, w) => sum + w.amount, 0);

  const bookingGroups = groupByMonth(bookings);
  const withdrawalGroups = groupByMonth(withdrawals);

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" /> Mis Comprobantes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pagos de clientes y retiros de saldo</p>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[11px] text-emerald-400 mb-1 font-medium">Total ganado</p>
              <p className="text-xl font-black text-emerald-400">${totalEarned.toFixed(2)}</p>
              <p className="text-[10px] text-emerald-400/60 mt-0.5">
                {bookings.filter(b => ["completed","payment_confirmed","started"].includes(b.status)).length} trabajo{bookings.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <p className="text-[11px] text-violet-400 mb-1 font-medium">Total retirado</p>
              <p className="text-xl font-black text-violet-400">${totalWithdrawn.toFixed(2)}</p>
              <p className="text-[10px] text-violet-400/60 mt-0.5">
                {withdrawals.filter(w => w.status === "paid").length} retiro{withdrawals.filter(w => w.status === "paid").length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("pagos")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
              tab === "pagos"
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Pagos de trabajos
            {bookings.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === "pagos" ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground"}`}>
                {bookings.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("retiros")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
              tab === "retiros"
                ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowDownToLine className="w-4 h-4" />
            Retiros de saldo
            {withdrawals.length > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === "retiros" ? "bg-violet-500/20 text-violet-400" : "bg-white/10 text-muted-foreground"}`}>
                {withdrawals.length}
              </span>
            )}
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Cargando comprobantes...</p>
          </div>
        ) : tab === "pagos" ? (
          bookingGroups.length === 0 ? (
            <div className="py-14 flex flex-col items-center gap-3 text-center bg-card border border-border rounded-2xl">
              <FileText className="w-10 h-10 text-muted-foreground opacity-40" />
              <div>
                <p className="font-semibold text-foreground">Sin comprobantes de pago</p>
                <p className="text-sm text-muted-foreground mt-1">Aparecerán aquí cuando recibas pagos de clientes</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {bookingGroups.map(group => (
                <MonthSection
                  key={group.key}
                  group={group}
                  renderCard={(b: any) => <BookingReceiptCard b={b} />}
                  amountFn={(items: any[]) =>
                    items
                      .filter(b => ["completed","payment_confirmed","started"].includes(b.status))
                      .reduce((s, b) => s + (b.workerEarnings ?? (b.totalAmount ?? 0) * 0.9), 0)
                  }
                  amountColor="text-emerald-400"
                />
              ))}
            </div>
          )
        ) : (
          withdrawalGroups.length === 0 ? (
            <div className="py-14 flex flex-col items-center gap-3 text-center bg-card border border-border rounded-2xl">
              <ArrowDownToLine className="w-10 h-10 text-muted-foreground opacity-40" />
              <div>
                <p className="font-semibold text-foreground">Sin retiros registrados</p>
                <p className="text-sm text-muted-foreground mt-1">Aquí verás el historial de tus solicitudes de cobro</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {withdrawalGroups.map(group => (
                <MonthSection
                  key={group.key}
                  group={group}
                  renderCard={(w: any) => <WithdrawalReceiptCard w={w} />}
                  amountFn={(items: any[]) =>
                    items.filter(w => w.status === "paid").reduce((s, w) => s + w.amount, 0)
                  }
                  amountColor="text-violet-400"
                />
              ))}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}
