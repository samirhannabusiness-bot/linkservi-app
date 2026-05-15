import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, CheckCircle, XCircle, Clock, Eye,
  FileText, Phone, User, Building2, Wrench, ShoppingBag, RotateCcw, ChevronDown
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const API = "/api";

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  client:  { label: "Cliente",      icon: User,         color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  worker:  { label: "Profesional",  icon: Wrench,       color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  cohost:  { label: "Co-anfitrión", icon: Building2,    color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
  seller:  { label: "Vendedor",     icon: ShoppingBag,  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

async function fetchVerifications(status: string, role: string) {
  const params = new URLSearchParams({ status });
  if (role) params.set("role", role);
  const res = await fetch(`${API}/admin/verifications?${params}`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error("Error al cargar verificaciones");
  return res.json();
}

async function reviewVerification(id: number, approved: boolean, notes?: string) {
  const res = await fetch(`${API}/admin/verifications/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ approved, notes }),
  });
  if (!res.ok) throw new Error("Error al procesar verificación");
  return res.json();
}

async function resetVerification(id: number, notes?: string) {
  const res = await fetch(`${API}/admin/verifications/${id}/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ notes: notes ?? "" }),
  });
  if (!res.ok) throw new Error("Error al reiniciar verificación");
  return res.json();
}

function ResetConfirmModal({ userName, onConfirm, onCancel }: {
  userName: string;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <RotateCcw className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Quitar Verificación</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{userName}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Se eliminarán los documentos subidos y el estado volverá a <span className="font-semibold text-amber-500">Pendiente</span>. El usuario deberá subir su documento nuevamente.
        </p>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Motivo (opcional — el usuario lo verá)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ej: La foto quedó borrosa..."
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none transition-all"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(notes)}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
          >
            <span className="flex items-center justify-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Reiniciar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DocImage({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold ml-1">{label}</p>
      <div
        className="relative rounded-xl overflow-hidden bg-muted border border-border cursor-pointer group shadow-sm"
        style={{ aspectRatio: "4/3", maxHeight: 140 }}
        onClick={() => setOpen(true)}
      >
        <img src={url} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
          <Eye className="w-6 h-6 text-white" />
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300" onClick={() => setOpen(false)}>
          <img src={url} alt={label} className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()} />
          <button className="absolute top-6 right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}

function RejectModal({ onConfirm, onCancel }: { onConfirm: (notes: string) => void; onCancel: () => void }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <h3 className="font-bold text-foreground text-lg">Rechazar verificación</h3>
        <p className="text-sm text-muted-foreground">Indica el motivo del rechazo. El usuario lo verá en su app.</p>
        <textarea
          autoFocus
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ej: El documento está vencido o no coincide con los datos..."
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none transition-all"
        />
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            Cancelar
          </button>
          <button
            onClick={() => { if (notes.trim()) onConfirm(notes.trim()); }}
            disabled={!notes.trim()}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-all disabled:opacity-40 shadow-lg shadow-red-500/20"
          >
            Confirmar Rechazo
          </button>
        </div>
      </div>
    </div>
  );
}

function VerificationCard({ v, onApprove, onReject, onReset }: { v: any; onApprove: () => void; onReject: () => void; onReset: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const roleConf = ROLE_CONFIG[v.role] ?? ROLE_CONFIG.client;
  const RoleIcon = roleConf.icon;
  const timeAgo = formatDistanceToNow(new Date(v.createdAt), { addSuffix: true, locale: es });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {v.userAvatarUrl ? (
              <img src={v.userAvatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-border" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 border border-border">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-foreground text-sm tracking-tight">{v.userName ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground truncate leading-relaxed">{v.userEmail}</p>
              {v.userPhone && <p className="text-[11px] text-muted-foreground">{v.userPhone}</p>}
              {(v.userState || v.userCity) && (
                <p className="text-[11px] text-primary/80 font-medium">{[v.userCity, v.userState].filter(Boolean).join(", ")}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${roleConf.bg} ${roleConf.color}`}>
              <RoleIcon className="w-3 h-3" /> {roleConf.label}
            </span>
            <p className="text-[10px] text-muted-foreground font-medium">{timeAgo}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg border border-border/50">
            <FileText className="w-3.5 h-3.5 flex-shrink-0 text-primary/60" />
            <span className="truncate">
              {v.documentType === "cedula" ? "Cédula" : v.documentType === "pasaporte" ? "Pasaporte" : v.documentType ?? "—"}
              {v.documentNumber ? ` · ${v.documentNumber}` : ""}
            </span>
          </div>
          {v.emergencyPhone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg border border-border/50">
              <Phone className="w-3.5 h-3.5 flex-shrink-0 text-primary/60" />
              <span className="truncate">{v.emergencyPhone} {v.emergencyContact ? `(${v.emergencyContact})` : ''}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 flex items-center gap-1.5 text-[11px] text-primary font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
        >
          <Eye className="w-3.5 h-3.5" />
          {expanded ? "Ocultar documentos" : "Revisar documentos"}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-2 gap-3 pt-2">
            {v.documentImageUrl && <DocImage url={v.documentImageUrl} label="Identificación" />}
            {v.selfieImageUrl && <DocImage url={v.selfieImageUrl} label="Selfie / Rostro" />}
          </div>
        </div>
      )}

      <div className="px-4 pb-4 pt-1 space-y-2">
        {v.status === "pending" && (
          <div className="flex gap-2">
            <button
              onClick={onReject}
              className="flex-1 py-2.5 rounded-xl border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-4 h-4" /> Rechazar
            </button>
            <button
              onClick={onApprove}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20"
            >
              <CheckCircle className="w-4 h-4" /> Aprobar
            </button>
          </div>
        )}
        
        <div className="flex flex-col gap-2">
          {v.status === "approved" && (
            <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold flex items-center justify-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Verificado Correctamente
            </div>
          )}
          
          {v.status === "rejected" && (
            <button
              onClick={onApprove}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" /> Aprobar igualmente
            </button>
          )}

          {v.status !== "not_submitted" && (
            <button
              onClick={onReset}
              className="w-full py-2 rounded-xl border border-orange-500/20 text-orange-500/80 text-[10px] font-bold uppercase tracking-wider hover:bg-orange-500/5 transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" /> Reiniciar Proceso
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminVerificationsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [roleFilter, setRoleFilter] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{ id: number } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: number; userName: string } | null>(null);

  const { data: verifications = [], isLoading } = useQuery({
    queryKey: ["admin-verifications", statusFilter, roleFilter],
    queryFn: () => fetchVerifications(statusFilter, roleFilter),
    refetchInterval: 30_000,
  });

  const { mutate: doReview } = useMutation({
    mutationFn: ({ id, approved, notes }: { id: number; approved: boolean; notes?: string }) =>
      reviewVerification(id, approved, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-verifications"] });
      setRejectTarget(null);
    },
  });

  const { mutate: doReset } = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      resetVerification(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-verifications"] });
      setResetTarget(null);
    },
  });

  const pendingCount = (verifications as any[]).filter((v: any) => v.status === "pending").length;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 pb-20 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">Verificaciones</h1>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest">Panel de Control de Identidad</p>
            </div>
          </div>
          {pendingCount > 0 && (
            <div className="sm:ml-auto">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-black shadow-sm">
                <Clock className="w-3.5 h-3.5 animate-pulse" /> {pendingCount} POR REVISAR
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="space-y-3 bg-muted/30 p-3 rounded-2xl border border-border/50">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {["pending", "approved", "rejected", "all"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30"
                }`}
              >
                {s === "pending" ? "Pendientes" : s === "approved" ? "Aprobados" : s === "rejected" ? "Rechazados" : "Todos"}
              </button>
            ))}
          </div>
          
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {["", "client", "worker", "cohost", "seller"].map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                  roleFilter === r
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background/50 text-muted-foreground border-border/60 hover:bg-background"
                }`}
              >
                {r === "" ? "Cualquier Rol" : ROLE_CONFIG[r]?.label ?? r}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl bg-muted/50 animate-pulse border border-border/50" />)}
          </div>
        ) : verifications.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border/60">
            <Shield className="w-16 h-16 text-muted-foreground/10 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground/50">Bandeja Vacía</h3>
            <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
              No hay solicitudes que coincidan con estos filtros en este momento.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {(verifications as any[]).map((v: any) => (
              <VerificationCard
                key={v.id}
                v={v}
                onApprove={() => doReview({ id: v.id, approved: true })}
                onReject={() => setRejectTarget({ id: v.id })}
                onReset={() => setResetTarget({ id: v.id, userName: v.userName ?? `#${v.userId}` })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          onConfirm={(notes) => doReview({ id: rejectTarget.id, approved: false, notes })}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {/* Reset modal */}
      {resetTarget && (
        <ResetConfirmModal
          userName={resetTarget.userName}
          onConfirm={(notes) => doReset({ id: resetTarget.id, notes })}
          onCancel={() => setResetTarget(null)}
        />
      )}
    </AppLayout>
  );
}
