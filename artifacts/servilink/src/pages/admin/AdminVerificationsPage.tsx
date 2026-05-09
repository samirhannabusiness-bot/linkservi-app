import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, CheckCircle, XCircle, Clock, AlertCircle, Users, ChevronDown, Eye,
  FileText, Camera, Phone, User, Building2, Wrench, ShoppingBag, RotateCcw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const API = "/api";

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  client:  { label: "Cliente",     icon: User,      color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  worker:  { label: "Profesional",  icon: Wrench,    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  cohost:  { label: "Co-anfitrión",icon: Building2, color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
  seller:  { label: "Vendedor",    icon: ShoppingBag, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  not_submitted: { label: "Sin enviar",  icon: Clock,       color: "text-muted-foreground", bg: "bg-muted" },
  pending:       { label: "Pendiente",   icon: Clock,       color: "text-amber-500",         bg: "bg-amber-500/10" },
  approved:      { label: "Aprobado",    icon: CheckCircle, color: "text-emerald-500",        bg: "bg-emerald-500/10" },
  rejected:      { label: "Rechazado",   icon: XCircle,     color: "text-red-500",            bg: "bg-red-500/10" },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <RotateCcw className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Quitar Verificación</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{userName}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Se eliminarán los documentos subidos y el estado volverá a <span className="font-semibold text-amber-500">Pendiente</span>. El usuario deberá subir su cédula y selfie nuevamente.
        </p>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Motivo (opcional — el usuario lo verá)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ej: La foto del documento quedó borrosa. Por favor sube una imagen más nítida."
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(notes)}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
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
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
      <div
        className="relative rounded-xl overflow-hidden bg-muted border border-border cursor-pointer group"
        style={{ aspectRatio: "4/3", maxHeight: 140 }}
        onClick={() => setOpen(true)}
      >
        <img src={url} alt={label} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <Eye className="w-6 h-6 text-white" />
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <img src={url} alt={label} className="max-w-full max-h-full rounded-xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function RejectModal({ onConfirm, onCancel }: { onConfirm: (notes: string) => void; onCancel: () => void }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <h3 className="font-bold text-foreground">Rechazar verificación</h3>
        <p className="text-sm text-muted-foreground">Indica el motivo del rechazo. El usuario lo verá en su app.</p>
        <textarea
          autoFocus
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ej: La foto del documento no se ve con claridad. Por favor sube una imagen nítida."
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
        />
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => { if (notes.trim()) onConfirm(notes.trim()); }}
            disabled={!notes.trim()}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-40"
          >
            Rechazar
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
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {v.userAvatarUrl ? (
              <img src={v.userAvatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-foreground text-sm">{v.userName ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{v.userEmail}</p>
              {v.userPhone && <p className="text-xs text-muted-foreground">{v.userPhone}</p>}
              {(v.userState || v.userCity) && (
                <p className="text-xs text-muted-foreground">{[v.userCity, v.userState].filter(Boolean).join(", ")}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {/* Role badge */}
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${roleConf.bg} ${roleConf.color}`}>
              <RoleIcon className="w-3 h-3" /> {roleConf.label}
            </span>
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
        </div>

        {/* Document info */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            {v.documentType === "cedula" ? "Cédula" : v.documentType === "pasaporte" ? "Pasaporte" : v.documentType ?? "—"}
            {v.documentNumber ? ` · ${v.documentNumber}` : ""}
          </span>
        </div>
        {v.emergencyContact && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{v.emergencyContact} — {v.emergencyPhone}</span>
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-xs text-primary font-medium hover:opacity-80 transition-opacity"
        >
          <Eye className="w-3.5 h-3.5" />
          {expanded ? "Ocultar documentos" : "Ver documentos"}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Photos — expanded */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {v.documentImageUrl && <DocImage url={v.documentImageUrl} label="Documento" />}
            {v.selfieImageUrl && <DocImage url={v.selfieImageUrl} label="Selfie" />}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-4 space-y-2">
        {v.status === "pending" && (
          <div className="flex gap-2">
            <button
              onClick={onReject}
              className="flex-1 py-2.5 rounded-xl border border-red-500/30 text-red-500 text-sm font-semibold hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-4 h-4" /> Rechazar
            </button>
            <button
              onClick={onApprove}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" /> Aprobar
            </button>
          </div>
        )}
        {v.status === "approved" && (
          <button
            onClick={onApprove}
            disabled
            className="w-full py-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-sm font-semibold flex items-center justify-center gap-1.5 opacity-50 cursor-default"
          >
            <CheckCircle className="w-4 h-4" /> Verificado
          </button>
        )}
        {v.status === "rejected" && (
          <button
            onClick={onApprove}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle className="w-4 h-4" /> Aprobar igualmente
          </button>
        )}
        {/* Quitar Verificación — available for approved/pending/rejected */}
        {v.status !== "not_submitted" && (
          <button
            onClick={onReset}
            className="w-full py-2.5 rounded-xl border border-orange-500/30 text-orange-500 text-sm font-semibold hover:bg-orange-500/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" /> Quitar Verificación
          </button>
        )}
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

  const { mutate: doReset, isPending: isResetting } = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      resetVerification(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-verifications"] });
      setResetTarget(null);
    },
  });

  const pending = (verifications as any[]).filter((v: any) => v.status === "pending");

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Cola de Verificaciones</h1>
            <p className="text-xs text-muted-foreground">Identidades de los 4 roles — gestión unificada</p>
          </div>
          {pending.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold">
              <Clock className="w-3.5 h-3.5" /> {pending.length} pendiente{pending.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {/* Status filter */}
          {["pending", "approved", "rejected", "all"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              {s === "pending" ? "Pendientes" : s === "approved" ? "Aprobados" : s === "rejected" ? "Rechazados" : "Todos"}
            </button>
          ))}
          <div className="w-px bg-border mx-1" />
          {/* Role filter */}
          {["", "client", "worker", "cohost", "seller"].map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                roleFilter === r
                  ? "bg-primary/10 text-primary border-primary/40"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              {r === "" ? "Todos los roles" : ROLE_CONFIG[r]?.label ?? r}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : verifications.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">
              {statusFilter === "pending" ? "No hay verificaciones pendientes." : "No hay registros con estos filtros."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
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
