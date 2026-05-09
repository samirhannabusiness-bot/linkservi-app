import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthHeader } from "@/lib/api";
import {
  Package, Shield, CheckCircle, AlertTriangle, Clock,
  TrendingUp, DollarSign, Lock, Unlock, Star, RefreshCw,
  ChevronDown, ChevronUp, FileText, Play, XCircle, Handshake,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Rental {
  id: number; productId: number; clientId: number; ownerId: number;
  startDate: string; endDate: string; days: number;
  dailyRate: number; subtotal: number; commission: number;
  depositAmount: number; depositStatus: string; status: string;
  productName: string; ownerName: string; clientName: string;
  clientNotes: string | null; createdAt: string;
}
interface Stats {
  commissionsToday: number; totalCommissions: number;
  totalDepositsHeld: number; activeRentals: number;
  pendingRentals: number; completedRentals: number;
  disputedRentals: number; totalRentals: number;
  topProducts: { name: string; count: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pendiente",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  active:    { label: "Activo",     color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  completed: { label: "Finalizado", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  disputed:  { label: "Disputa",    color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  cancelled: { label: "Cancelado",  color: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
};
const DEPOSIT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  held:     { label: "En Custodia", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  released: { label: "Liberado",    color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  retained: { label: "Retenido",    color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; color: string; bg: string }> }) {
  const s = map[status] ?? { label: status, color: "#9ca3af", bg: "rgba(156,163,175,0.1)" };
  return (
    <span className="text-[11px] font-bold px-2 py-1 rounded-full"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}30` }}>
      {s.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract PDF generator — jsPDF professional document
// ─────────────────────────────────────────────────────────────────────────────
async function downloadContract(r: Rental) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210; const margin = 18;
  const lineW = W - margin * 2;
  let y = 0;

  const generated = format(new Date(), "d 'de' MMMM yyyy 'a las' HH:mm", { locale: es });
  const total = +(r.subtotal + r.depositAmount).toFixed(2);

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, W, 30, "F");
  doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text("CONTRATO DE ARRENDAMIENTO", W / 2, 12, { align: "center" });
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`LinkServi · Plataforma de Servicios y Alquileres de Venezuela`, W / 2, 19, { align: "center" });
  doc.setFontSize(9);
  doc.text(`Contrato N° ${String(r.id).padStart(6, "0")}  ·  Generado: ${generated}`, W / 2, 26, { align: "center" });

  y = 38;

  // ── Helper functions ────────────────────────────────────────────────────────
  const sectionTitle = (title: string) => {
    doc.setFillColor(241, 245, 249); doc.rect(margin, y, lineW, 7, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(37, 99, 235);
    doc.text(title.toUpperCase(), margin + 3, y + 5);
    y += 10;
  };

  const field = (label: string, value: string, x: number, fieldW: number) => {
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 120, 120);
    doc.text(label, x, y);
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 20);
    doc.text(value, x, y + 5);
    return y + 11;
  };

  const twoFields = (l1: string, v1: string, l2: string, v2: string) => {
    const half = lineW / 2 - 3;
    field(l1, v1, margin, half);
    y = field(l2, v2, margin + lineW / 2, half);
  };

  const clause = (num: number, title: string, body: string) => {
    if (y > 255) { doc.addPage(); y = 18; }
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(37, 99, 235);
    doc.text(`Cláusula ${num}. ${title}`, margin, y); y += 5;
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(body, lineW);
    lines.forEach((line: string) => { doc.text(line, margin, y); y += 4.5; });
    y += 3;
  };

  // ── Objeto ──────────────────────────────────────────────────────────────────
  sectionTitle("I. Objeto del Contrato");
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40);
  doc.text("El presente contrato regula el arrendamiento del siguiente bien:", margin, y); y += 8;
  doc.setFillColor(248, 250, 252); doc.rect(margin, y, lineW, 10, "F");
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 20);
  doc.text(r.productName, margin + 4, y + 7);
  y += 16;

  // ── Partes ──────────────────────────────────────────────────────────────────
  sectionTitle("II. Partes Contratantes");
  twoFields("ARRENDADOR (Propietario)", r.ownerName, "ARRENDATARIO (Cliente)", r.clientName);
  y += 2;

  // ── Período ─────────────────────────────────────────────────────────────────
  sectionTitle("III. Período de Arrendamiento");
  twoFields("Fecha de inicio", r.startDate, "Fecha de devolución", r.endDate);
  twoFields("Duración (días)", `${r.days} día${r.days !== 1 ? "s" : ""}`, "Tarifa diaria", `$${Number(r.dailyRate).toFixed(2)} USD`);
  y += 2;

  // ── Financiero ───────────────────────────────────────────────────────────────
  sectionTitle("IV. Condiciones Financieras");
  twoFields("Subtotal de arrendamiento", `$${r.subtotal.toFixed(2)} USD`, "Comisión LinkServi (15%)", `$${r.commission.toFixed(2)} USD`);
  twoFields("Depósito de garantía", `$${r.depositAmount.toFixed(2)} USD`, "Estado del depósito", DEPOSIT_LABELS[r.depositStatus]?.label ?? r.depositStatus);

  // Total box
  doc.setFillColor(37, 99, 235); doc.rect(margin, y, lineW, 14, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 210, 255);
  doc.text("TOTAL A PAGAR POR EL ARRENDATARIO (Subtotal + Depósito)", margin + 4, y + 5);
  doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text(`$${total.toFixed(2)} USD`, margin + 4, y + 12);
  y += 20;

  // Notas
  if (r.clientNotes) {
    sectionTitle("V. Observaciones del Arrendatario");
    doc.setFontSize(8.5); doc.setFont("helvetica", "italic"); doc.setTextColor(80, 80, 80);
    doc.splitTextToSize(`"${r.clientNotes}"`, lineW).forEach((l: string) => { doc.text(l, margin, y); y += 5; });
    y += 4;
  }

  // ── Cláusulas legales ────────────────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 18; }
  sectionTitle("VI. Cláusulas Legales");
  clause(1, "Objeto", `El ARRENDADOR cede temporalmente al ARRENDATARIO el uso y goce del bien descrito en la Sección I, por el período y condiciones establecidos en este contrato, a cambio del pago pactado.`);
  clause(2, "Período y Devolución", `El arrendamiento tiene una duración de ${r.days} día${r.days !== 1 ? "s" : ""}, iniciando el ${r.startDate} y concluyendo el ${r.endDate}. El ARRENDATARIO se obliga a devolver el bien en la misma fecha acordada, salvo acuerdo escrito entre las partes.`);
  clause(3, "Pago y Comisión de Plataforma", `El monto total del arrendamiento asciende a $${r.subtotal.toFixed(2)} USD. LinkServi aplicará una comisión del 15% ($${r.commission.toFixed(2)} USD) sobre el subtotal en concepto de servicios de intermediación, custodia y soporte de la plataforma.`);
  clause(4, "Depósito de Garantía", `El ARRENDATARIO abona un depósito de garantía de $${r.depositAmount.toFixed(2)} USD. Dicho depósito será devuelto íntegramente al finalizar el contrato, previa verificación del buen estado del bien. En caso de daños, LinkServi podrá retener total o parcialmente el depósito para cubrir los costos de reparación o reposición.`);
  clause(5, "Cuidado y Uso del Bien", `El ARRENDATARIO se compromete a usar el bien objeto de este contrato únicamente para los fines acordados, con la debida diligencia y cuidado. Queda expresamente prohibida la subarrendación del bien sin autorización escrita del ARRENDADOR.`);
  clause(6, "Responsabilidad y Disputas", `En caso de incumplimiento, deterioro, pérdida o daño del bien, el ARRENDATARIO será responsable de su restitución o pago del valor de mercado. Las disputas se gestionarán a través del panel de administración de LinkServi, cuya resolución será vinculante para ambas partes.`);
  clause(7, "Jurisdicción y Legislación Aplicable", `Este contrato se rige por las leyes de la República Bolivariana de Venezuela, en particular el Código Civil vigente en materia de arrendamientos. Las partes declaran someterse a la jurisdicción de los tribunales competentes de la República, con especial consideración a las normas del estado Monagas.`);

  // ── Firmas ──────────────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 18; }
  y += 6;
  doc.setDrawColor(180, 180, 180);
  const half = lineW / 2 - 10;
  doc.line(margin, y, margin + half, y);
  doc.line(margin + lineW / 2 + 10, y, W - margin, y);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
  doc.text("Firma del Arrendador", margin, y + 5);
  doc.text(r.ownerName, margin, y + 10);
  doc.text("Firma del Arrendatario", margin + lineW / 2 + 10, y + 5);
  doc.text(r.clientName, margin + lineW / 2 + 10, y + 10);
  y += 20;

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(160, 160, 160);
    doc.text(`LinkServi · Contrato N° ${String(r.id).padStart(6, "0")} · Página ${i} de ${pageCount}`, W / 2, 292, { align: "center" });
    doc.setDrawColor(220, 220, 220); doc.line(margin, 289, W - margin, 289);
  }

  doc.save(`contrato_alquiler_linkservi_${String(r.id).padStart(6, "0")}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rental row
// ─────────────────────────────────────────────────────────────────────────────
function RentalRow({ r, onDepositChange, onStatusChange }: {
  r: Rental;
  onDepositChange: (id: number, status: string) => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const changeDeposit = async (depositStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/rentals/${r.id}/deposit`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ depositStatus }),
      });
      if (res.ok) onDepositChange(r.id, depositStatus);
    } finally { setUpdating(false); }
  };

  const changeStatus = async (status: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/rentals/${r.id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ status }),
      });
      if (res.ok) onStatusChange(r.id, status);
    } finally { setUpdatingStatus(false); }
  };

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Main row */}
      <button onClick={() => setExpanded(v => !v)} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}>
            <Package className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-white text-sm truncate">{r.productName}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {r.ownerName} → {r.clientName}
                </p>
              </div>
              {expanded ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusBadge status={r.status} map={STATUS_LABELS} />
              <StatusBadge status={r.depositStatus} map={DEPOSIT_LABELS} />
              <span className="text-[11px] text-white/30">{r.startDate} → {r.endDate}</span>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-[10px] text-white/35">Días</p>
              <p className="font-bold text-white text-sm">{r.days}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-[10px] text-white/35">Subtotal</p>
              <p className="font-bold text-white text-sm">${r.subtotal.toFixed(2)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-[10px] text-white/35">Comisión 15%</p>
              <p className="font-bold text-emerald-400 text-sm">${r.commission.toFixed(2)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-[10px] text-white/35">Depósito</p>
              <p className="font-bold text-white text-sm">${r.depositAmount.toFixed(2)}</p>
            </div>
          </div>

          {r.clientNotes && (
            <div className="px-3 py-2 rounded-xl text-xs text-white/50 italic"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              "{r.clientNotes}"
            </div>
          )}

          {/* Status control */}
          <div>
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Estado del Alquiler</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => changeStatus("active")} disabled={updatingStatus || r.status === "active"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}>
                <Play className="w-3.5 h-3.5" /> Activar
              </button>
              <button onClick={() => changeStatus("completed")} disabled={updatingStatus || r.status === "completed"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>
                <Handshake className="w-3.5 h-3.5" /> Finalizar
              </button>
              <button onClick={() => changeStatus("cancelled")} disabled={updatingStatus || r.status === "cancelled"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                <XCircle className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
          </div>

          {/* Deposit control */}
          <div>
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Control de Depósito (Escrow)</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => changeDeposit("held")} disabled={updating || r.depositStatus === "held"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                <Lock className="w-3.5 h-3.5" /> Retener
              </button>
              <button onClick={() => changeDeposit("released")} disabled={updating || r.depositStatus === "released"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}>
                <Unlock className="w-3.5 h-3.5" /> Liberar al cliente
              </button>
              <button onClick={() => changeDeposit("retained")} disabled={updating || r.depositStatus === "retained"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                <Shield className="w-3.5 h-3.5" /> Aplicar a daños
              </button>
              <button onClick={() => downloadContract(r)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ml-auto"
                style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>
                <FileText className="w-3.5 h-3.5" /> Descargar Contrato
              </button>
            </div>
          </div>

          <p className="text-[10px] text-white/20">Creado {format(new Date(r.createdAt), "d MMM yyyy HH:mm", { locale: es })}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main AdminRentalsPage
// ─────────────────────────────────────────────────────────────────────────────
export function AdminRentalsPage() {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDeposit, setFilterDeposit] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterDeposit) params.set("depositStatus", filterDeposit);
      const [r, s] = await Promise.all([
        fetch(`/api/admin/rentals?${params}`, { headers: getAuthHeader() }).then(r => r.json()),
        fetch("/api/admin/rentals/stats", { headers: getAuthHeader() }).then(r => r.json()),
      ]);
      if (Array.isArray(r)) setRentals(r);
      setStats(s);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [filterStatus, filterDeposit]);

  const handleDepositChange = (id: number, newStatus: string) => {
    setRentals(prev => prev.map(r => r.id === id ? { ...r, depositStatus: newStatus } : r));
  };

  const handleStatusChange = (id: number, newStatus: string) => {
    setRentals(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
  };

  return (
    <div className="min-h-screen" style={{ background: "#030a18" }}>
      <Sidebar />
      <main className="md:ml-64 min-h-screen">
        <div className="px-4 py-6 max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-black text-white">Gestión de Alquileres</h1>
              <p className="text-xs text-white/40 mt-0.5">Control de depósitos, contratos y comisiones ServiRent</p>
            </div>
            <button onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-2xl p-4" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <p className="text-[11px] text-emerald-400/70 font-semibold uppercase tracking-wider">Comisiones hoy</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">${stats.commissionsToday.toFixed(2)}</p>
                <p className="text-[10px] text-white/25 mt-0.5">Total: ${stats.totalCommissions.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                <p className="text-[11px] text-yellow-400/70 font-semibold uppercase tracking-wider">Depósitos en custodia</p>
                <p className="text-2xl font-black text-yellow-400 mt-1">${stats.totalDepositsHeld.toFixed(2)}</p>
                <p className="text-[10px] text-white/25 mt-0.5">USD bajo escrow</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <p className="text-[11px] text-blue-400/70 font-semibold uppercase tracking-wider">Activos</p>
                <p className="text-2xl font-black text-blue-400 mt-1">{stats.activeRentals}</p>
                <p className="text-[10px] text-white/25 mt-0.5">{stats.pendingRentals} pendientes</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                <p className="text-[11px] text-red-400/70 font-semibold uppercase tracking-wider">Disputas</p>
                <p className="text-2xl font-black text-red-400 mt-1">{stats.disputedRentals}</p>
                <p className="text-[10px] text-white/25 mt-0.5">{stats.completedRentals} finalizados</p>
              </div>
            </div>
          )}

          {/* Top products */}
          {stats && stats.topProducts.length > 0 && (
            <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" /> Objetos más alquilados
              </p>
              <div className="flex flex-wrap gap-2">
                {stats.topProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="text-xs font-black text-white/30">#{i + 1}</span>
                    <span className="text-xs font-semibold text-white/70">{p.name}</span>
                    <span className="text-[11px] font-bold text-violet-400">{p.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: filterStatus ? "#fff" : "rgba(255,255,255,0.4)" }}>
              <option value="">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="active">Activo</option>
              <option value="completed">Finalizado</option>
              <option value="disputed">Disputa</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <select value={filterDeposit} onChange={e => setFilterDeposit(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: filterDeposit ? "#fff" : "rgba(255,255,255,0.4)" }}>
              <option value="">Todos los depósitos</option>
              <option value="held">En Custodia</option>
              <option value="released">Liberado</option>
              <option value="retained">Retenido (daños)</option>
            </select>
          </div>

          {/* Rental list */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: "#06B6D4" }} />
              <p className="text-xs text-white/30">Cargando alquileres...</p>
            </div>
          ) : rentals.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 mx-auto text-white/10 mb-3" />
              <p className="text-white/50 font-semibold">Sin alquileres registrados</p>
              <p className="text-xs text-white/25 mt-1">Los alquileres aparecerán aquí cuando se registren a través de ServiRent</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-white/30 font-semibold">{rentals.length} alquiler{rentals.length !== 1 ? "es" : ""} encontrado{rentals.length !== 1 ? "s" : ""}</p>
              {rentals.map(r => (
                <RentalRow key={r.id} r={r} onDepositChange={handleDepositChange} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
