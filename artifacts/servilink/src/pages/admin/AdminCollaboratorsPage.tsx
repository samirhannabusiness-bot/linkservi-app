import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import {
  UserCog, Mail, Trash2, ChevronDown,
  Shield, Loader2, X, CheckCircle, AlertCircle, Users,
  BarChart3, Wallet, UserCheck, Clock, Send,
  AlertTriangle, Search, Filter, Calendar, Activity,
  ArrowRight, Eye, RefreshCw, ShieldAlert, ShieldCheck,
  ChevronRight, Lock, Unlock, List, TrendingUp, MailCheck,
  Copy, MousePointerClick, BarChart2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES = [
  {
    id: "super_admin",
    label: "Super Admin",
    description: "Acceso total a todas las secciones",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    borderRaw: "rgba(245,158,11,0.3)",
    colorRaw: "#fbbf24",
    Icon: Shield,
    impact: "Tendrá control absoluto: puede crear/eliminar colaboradores, ver métricas financieras, gestionar retiros y acceder a todas las secciones.",
  },
  {
    id: "soporte",
    label: "Soporte",
    description: "Usuarios, verificaciones, solicitudes, disputas, calificaciones",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    borderRaw: "rgba(6,182,212,0.3)",
    colorRaw: "#22d3ee",
    Icon: UserCheck,
    impact: "Podrá gestionar usuarios, revisar verificaciones KYC, resolver disputas y moderar calificaciones. Sin acceso a finanzas.",
  },
  {
    id: "finanzas",
    label: "Finanzas",
    description: "Retiros, pedidos de tienda, tiendas, planes Co-host",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    borderRaw: "rgba(16,185,129,0.3)",
    colorRaw: "#34d399",
    Icon: Wallet,
    impact: "Podrá aprobar/rechazar retiros, gestionar tiendas y ver métricas financieras. Sin acceso a gestión de usuarios ni colaboradores.",
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Analytics, email campañas, destacados, suscripciones",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    borderRaw: "rgba(168,85,247,0.3)",
    colorRaw: "#c084fc",
    Icon: BarChart3,
    impact: "Podrá ver analíticas, gestionar campañas de email y administrar perfiles destacados. Sin acceso a datos financieros ni de usuarios.",
  },
] as const;

function getRoleConfig(roleId: string) {
  return ROLES.find((r) => r.id === roleId) ?? ROLES[0];
}

// ─── Action label map ─────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  "collaborator.create":        { label: "Colaborador creado",       color: "#34d399", icon: "➕" },
  "collaborator.update":        { label: "Rol actualizado",          color: "#fbbf24", icon: "✏️" },
  "collaborator.revoke":        { label: "Acceso revocado",          color: "#f87171", icon: "🚫" },
  "collaborator.invite":        { label: "Invitación enviada",       color: "#c084fc", icon: "📧" },
  "collaborator.invite_cancel": { label: "Invitación cancelada",     color: "#9ca3af", icon: "❌" },
  "withdrawal.approved":        { label: "Retiro aprobado",          color: "#34d399", icon: "💸" },
  "withdrawal.rejected":        { label: "Retiro rechazado",         color: "#f87171", icon: "🔒" },
  "user.role_change":           { label: "Rol de usuario cambiado",  color: "#fbbf24", icon: "👤" },
};

function getActionConfig(action: string) {
  return ACTION_LABELS[action] ?? { label: action, color: "rgba(255,255,255,0.4)", icon: "📋" };
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const cfg = getRoleConfig(role);
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
      <cfg.Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Trust Score Badge ────────────────────────────────────────────────────────
function TrustScoreBadge({ score }: { score: number }) {
  const color   = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const bg      = score >= 80 ? "rgba(16,185,129,0.12)"  : score >= 50 ? "rgba(245,158,11,0.12)"  : "rgba(239,68,68,0.12)";
  const border  = score >= 80 ? "rgba(16,185,129,0.3)"   : score >= 50 ? "rgba(245,158,11,0.3)"   : "rgba(239,68,68,0.3)";
  const label   = score >= 80 ? "Confiable" : score >= 50 ? "Precaución" : "Riesgo";
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color, background: bg, border: `1px solid ${border}` }}
      title={`Score de confianza: ${score}/100`}
    >
      <TrendingUp className="w-2.5 h-2.5" />
      {score}/100 · {label}
    </span>
  );
}

// ─── Timeline Drawer ──────────────────────────────────────────────────────────
function TimelineDrawer({ collaboratorId, onClose }: { collaboratorId: number; onClose: () => void }) {
  const [data, setData]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]   = useState(0);
  const PER_PAGE = 30;

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/collaborators/${collaboratorId}/timeline?limit=${PER_PAGE}&offset=${offset}`, { headers: getAuthHeader() });
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [collaboratorId]);

  useEffect(() => { load(0); setPage(0); }, [load]);

  const handlePage = (p: number) => { setPage(p); load(p * PER_PAGE); };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="ml-auto w-full max-w-lg h-full flex flex-col" style={{ background: "#0b1628", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
              <List className="w-4 h-4" style={{ color: "#a5b4fc" }} />
            </div>
            <div>
              <p className="font-bold text-white text-sm">{data?.collaborator?.name ?? "Cargando..."}</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Timeline de acciones</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && <TrustScoreBadge score={data.trustScore ?? 100} />}
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: "rgba(255,255,255,0.5)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collaborator info */}
        {data?.collaborator && (
          <div className="px-5 py-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <RoleBadge role={data.collaborator.adminRole} />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{data.collaborator.email}</span>
            <span className="text-xs ml-auto" style={{ color: "rgba(255,255,255,0.25)" }}>
              {data.total} acciones totales
            </span>
          </div>
        )}

        {/* Logs */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
            </div>
          ) : !data?.logs?.length ? (
            <div className="text-center py-16">
              <Eye className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.1)" }} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Sin acciones registradas</p>
            </div>
          ) : data.logs.map((log: any, idx: number) => {
            const cfg = getActionConfig(log.action);
            let meta: any = null;
            try { if (log.meta) meta = JSON.parse(log.meta); } catch {}
            return (
              <div key={log.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                    style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}35` }}>
                    <span>{cfg.icon}</span>
                  </div>
                  {idx < data.logs.length - 1 && (
                    <div className="w-px flex-1 mt-1" style={{ background: "rgba(255,255,255,0.06)", minHeight: 16 }} />
                  )}
                </div>
                <div className="pb-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                    {log.targetId && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}>#{log.targetId}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                      {format(new Date(log.createdAt), "d MMM yyyy, HH:mm:ss", { locale: es })}
                    </span>
                    {log.ip && <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>IP: {log.ip}</span>}
                  </div>
                  {meta && (
                    <pre className="text-[10px] rounded-lg p-2 mt-1.5 overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.4)" }}>
                      {JSON.stringify(meta, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {data && data.total > PER_PAGE && (
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <button disabled={page === 0} onClick={() => handlePage(page - 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.6)" }}>
              ← Anterior
            </button>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              Pág. {page + 1} de {Math.ceil(data.total / PER_PAGE)}
            </span>
            <button disabled={(page + 1) * PER_PAGE >= data.total} onClick={() => handlePage(page + 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.6)" }}>
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Security Banner ──────────────────────────────────────────────────────────
function SecurityBanner({
  suspicious, massChanges, onBlockUser,
}: {
  suspicious: any[];
  massChanges: any[];
  onBlockUser: (userId: number) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || (suspicious.length === 0 && massChanges.length === 0)) return null;

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#f87171" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: "#f87171" }}>⚠️ Actividad sospechosa detectada</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(248,113,113,0.6)" }}>Puedes bloquear temporalmente el acceso de los colaboradores en cuestión.</p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-red-400/50 hover:text-red-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      {[...suspicious.map(s => ({ ...s, type: "burst" })), ...massChanges.map(m => ({ ...m, type: "mass" }))].map((item) => (
        <div key={item.userId} className="flex items-center gap-3 pl-8">
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: "rgba(248,113,113,0.9)" }}>
              {item.type === "burst"
                ? `${item.userName} — ${item.actionCount} acciones en 5 minutos`
                : `${item.userName} — ${item.actionCount} cambios de acceso en 10 minutos`}
            </p>
          </div>
          <button
            onClick={() => onBlockUser(item.userId)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:opacity-90"
            style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.4)" }}
          >
            <Lock className="w-3 h-3" /> Bloquear
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Confirm Role Change Modal ────────────────────────────────────────────────
function ConfirmRoleModal({
  collab,
  newRole,
  onConfirm,
  onCancel,
  loading,
}: {
  collab: any;
  newRole: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const oldCfg = getRoleConfig(collab.adminRole);
  const newCfg = getRoleConfig(newRole);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{ background: "rgba(15,23,42,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
            <UserCog className="w-5 h-5" style={{ color: "#fbbf24" }} />
          </div>
          <div>
            <p className="font-bold text-white">Confirmar cambio de rol</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Esta acción queda registrada en auditoría</p>
          </div>
        </div>

        {/* Who */}
        <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Colaborador</p>
          <p className="text-sm font-semibold text-white">{collab.name}</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{collab.email}</p>
        </div>

        {/* Role change arrow */}
        <div className="flex items-center gap-3">
          <div className={`flex-1 rounded-xl px-3 py-2.5 text-center ${oldCfg.bg} border ${oldCfg.border}`}>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Rol actual</p>
            <span className={`text-sm font-bold ${oldCfg.color}`}>{oldCfg.label}</span>
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
          <div className={`flex-1 rounded-xl px-3 py-2.5 text-center ${newCfg.bg} border ${newCfg.border}`}>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Nuevo rol</p>
            <span className={`text-sm font-bold ${newCfg.color}`}>{newCfg.label}</span>
          </div>
        </div>

        {/* Impact */}
        <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: `${newCfg.colorRaw}11`, border: `1px solid ${newCfg.borderRaw}` }}>
          <p className="text-xs font-bold mb-1.5" style={{ color: newCfg.colorRaw }}>
            <newCfg.Icon className="w-3 h-3 inline mr-1" />
            Impacto del nuevo rol
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{newCfg.impact}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: newCfg.colorRaw, color: "#fff" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirmar cambio
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Enhanced Revoke Modal ────────────────────────────────────────────────────
function RevokeModal({
  target,
  onConfirm,
  onCancel,
  loading,
}: {
  target: { id: number; name: string };
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [understood, setUnderstood] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-5" style={{ background: "rgba(15,23,42,0.98)", border: "1px solid rgba(239,68,68,0.3)" }}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <Trash2 className="w-5 h-5" style={{ color: "#f87171" }} />
          </div>
          <div>
            <p className="font-bold text-white">Revocar acceso de administrador</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Acción crítica — queda registrada en auditoría</p>
          </div>
        </div>

        {/* Who */}
        <div className="rounded-xl px-4 py-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-sm font-semibold text-white">{target.name}</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>perderá acceso al panel de administración inmediatamente</p>
        </div>

        {/* Impact list */}
        <div className="space-y-2">
          {[
            "Su sesión activa será invalidada al próximo intento de acceso",
            "Su cuenta volverá a ser de cliente normal (rol: cliente)",
            "Todo el historial de sus acciones quedará en el registro de auditoría",
            "Podrá ser reactivado volviendo a invitarlo con el rol que corresponda",
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#f87171" }} />
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{item}</p>
            </div>
          ))}
        </div>

        {/* Checkbox confirmation */}
        <label className="flex items-center gap-3 cursor-pointer" onClick={() => setUnderstood(u => !u)}>
          <div
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: understood ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)",
              border: `1.5px solid ${understood ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.15)"}`,
            }}
          >
            {understood && <CheckCircle className="w-3.5 h-3.5" style={{ color: "#f87171" }} />}
          </div>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            Entiendo que <strong className="text-white">{target.name}</strong> perderá acceso inmediatamente y que esta acción queda registrada.
          </p>
        </label>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!understood || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{
              background: understood ? "#ef4444" : "rgba(239,68,68,0.25)",
              color: understood ? "#fff" : "rgba(255,255,255,0.35)",
              cursor: understood ? "pointer" : "not-allowed",
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Revocar acceso
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invite Metrics Banner ────────────────────────────────────────────────────
function InviteMetricsBanner({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/collaborators/invitations/metrics", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => {});
  }, [refreshKey]);

  if (!data || data.total === 0) return null;

  const stats = [
    {
      label: "Tasa de aceptación",
      value: `${data.acceptanceRate}%`,
      sub: `${data.accepted}/${data.total} invitaciones`,
      icon: CheckCircle,
      color: "#34d399",
      bg: "rgba(16,185,129,0.08)",
      border: "rgba(16,185,129,0.2)",
    },
    {
      label: "Tiempo promedio",
      value: data.avgAcceptHours !== null ? `${data.avgAcceptHours}h` : "—",
      sub: "en aceptar",
      icon: Clock,
      color: "#fbbf24",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.2)",
    },
    {
      label: "Tasa de apertura",
      value: `${data.openRate}%`,
      sub: `${data.totalOpens} aperturas totales`,
      icon: Eye,
      color: "#a5b4fc",
      bg: "rgba(99,102,241,0.08)",
      border: "rgba(99,102,241,0.2)",
    },
    {
      label: "Tasa de clic",
      value: `${data.clickRate}%`,
      sub: `${data.totalClicks} clics totales`,
      icon: MousePointerClick,
      color: "#67e8f9",
      bg: "rgba(6,182,212,0.08)",
      border: "rgba(6,182,212,0.2)",
    },
  ];

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2">
        <BarChart2 className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
        <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
          Métricas de invitaciones — últimos 90 días
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(s => (
          <div
            key={s.label}
            className="rounded-xl p-3 flex items-start gap-2.5"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
          >
            <s.icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: s.color }} />
            <div className="min-w-0">
              <p className="text-lg font-black leading-none" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] font-semibold mt-0.5" style={{ color: s.color, opacity: 0.7 }}>{s.label}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>{s.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Email Preview Modal ──────────────────────────────────────────────────────
function EmailPreviewModal({
  email,
  role,
  onClose,
}: {
  email: string;
  role: string;
  onClose: () => void;
}) {
  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    soporte: "Soporte",
    finanzas: "Finanzas",
    marketing: "Marketing",
  };
  const roleLabel = roleLabels[role] ?? role;

  const roleColors: Record<string, string> = {
    super_admin: "#fbbf24",
    soporte: "#22d3ee",
    finanzas: "#34d399",
    marketing: "#c084fc",
  };
  const roleColor = roleColors[role] ?? "#a5b4fc";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" style={{ color: "#a5b4fc" }} />
            <span className="text-sm font-bold text-white">Vista previa del email</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: "rgba(255,255,255,0.5)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meta */}
        <div className="px-5 py-3 space-y-1.5 text-xs" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex gap-2"><span style={{ color: "rgba(255,255,255,0.35)", minWidth: 50 }}>Para:</span><span className="text-white font-medium">{email || "correo@ejemplo.com"}</span></div>
          <div className="flex gap-2"><span style={{ color: "rgba(255,255,255,0.35)", minWidth: 50 }}>Asunto:</span><span style={{ color: "rgba(255,255,255,0.7)" }}>Te invitaron a gestionar LinkServi como {roleLabel}</span></div>
        </div>

        {/* Email body preview */}
        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          {/* Sender */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)", color: "#fff" }}>L</div>
            <div>
              <p className="text-xs font-bold text-white">LinkServi</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>info@linkservi.com</p>
            </div>
          </div>

          {/* Content */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-base font-black text-white">Fuiste invitado al equipo de administración</p>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
              <strong className="text-white">El administrador</strong> te ha invitado a unirte como colaborador de{" "}
              <strong className="text-white">LinkServi</strong> con el rol de{" "}
              <strong style={{ color: roleColor }}>{roleLabel}</strong>.
            </p>

            <div className="rounded-xl p-3" style={{ background: `${roleColor}10`, border: `1px solid ${roleColor}30` }}>
              <p className="text-xs font-bold mb-1" style={{ color: roleColor }}>🛡 Tu rol: {roleLabel}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Podrás acceder al panel de administración y gestionar las secciones correspondientes a tu rol.
              </p>
            </div>

            <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <p className="text-[11px]" style={{ color: "#fcd34d" }}>
                ⏱ Este enlace expira en <strong>72 horas</strong>. Si no lo usas a tiempo, pide que te envíen una nueva invitación.
              </p>
            </div>

            <div className="flex justify-center pt-1">
              <div
                className="inline-block text-sm font-bold px-6 py-2.5 rounded-xl text-white"
                style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)" }}
              >
                Aceptar invitación →
              </div>
            </div>
          </div>

          <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.2)" }}>
            LinkServi · Venezuela · Este es un email automático, no responder.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 text-xs text-center" style={{ color: "rgba(255,255,255,0.3)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          Vista previa aproximada — el email real incluye tracking de apertura y clic
        </div>
      </div>
    </div>
  );
}

// ─── Email Invite Section ─────────────────────────────────────────────────────
function InviteSection({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail]               = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("soporte");
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState("");
  const [showPreview, setShowPreview]   = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed.includes("@")) { setError("Ingresa un correo válido"); return; }
    setSending(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/collaborators/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ email: trimmed, adminRole: selectedRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Invitación enviada a ${trimmed} — expira en 72 h`);
      setEmail("");
      onInvited();
      setTimeout(() => setSuccess(""), 6000);
    } catch (e: any) {
      setError(e.message ?? "Error al enviar invitación");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSend} className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Invitar colaborador por email</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Recibirá un enlace seguro para crear su contraseña y activar su acceso. El enlace expira en 72 horas.
      </p>

      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          placeholder="correo@ejemplo.com"
          required
          className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Role selector */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Rol a asignar:</p>
        <div className="grid grid-cols-1 gap-2">
          {ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedRole(role.id)}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                selectedRole === role.id
                  ? `${role.bg} ${role.border} ${role.color}`
                  : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
              }`}
            >
              <role.Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">{role.label}</p>
                <p className="text-xs opacity-70 mt-0.5">{role.description}</p>
              </div>
              {selectedRole === role.id && <CheckCircle className="w-4 h-4 ml-auto flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}
        >
          <Eye className="w-3.5 h-3.5" /> Vista previa
        </button>
        <button
          type="submit"
          disabled={sending}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar como {getRoleConfig(selectedRole).label}
        </button>
      </div>

      {showPreview && (
        <EmailPreviewModal
          email={email}
          role={selectedRole}
          onClose={() => setShowPreview(false)}
        />
      )}
    </form>
  );
}

// ─── Copy Link Button ─────────────────────────────────────────────────────────
function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}/admin-invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg transition-colors hover:opacity-80"
      style={{ color: copied ? "#34d399" : "rgba(255,255,255,0.35)" }}
      title={copied ? "¡Copiado!" : "Copiar enlace directo"}
    >
      {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Invitation Status Badge ──────────────────────────────────────────────────
function InvStatusBadge({ status }: { status: "pending" | "accepted" | "expired" }) {
  if (status === "accepted") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      <CheckCircle className="w-2.5 h-2.5" /> Aceptada
    </span>
  );
  if (status === "expired") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
      <X className="w-2.5 h-2.5" /> Expirada
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
      <Clock className="w-2.5 h-2.5" /> Pendiente
    </span>
  );
}

// ─── Invitations History Section ──────────────────────────────────────────────
function InvitationsHistorySection({
  refreshKey,
  onLimitChange,
}: {
  refreshKey: number;
  onLimitChange: (active: number, max: number) => void;
}) {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [maxAllowed, setMaxAllowed]   = useState(15);
  const [loading, setLoading]         = useState(true);
  const [canceling, setCanceling]     = useState<number | null>(null);
  const [resending, setResending]     = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "accepted" | "expired">("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/collaborators/invitations", { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations ?? []);
        setActiveCount(data.activeCount ?? 0);
        setMaxAllowed(data.maxAllowed ?? 15);
        onLimitChange(data.activeCount ?? 0, data.maxAllowed ?? 15);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const handleCancel = async (id: number) => {
    setCanceling(id);
    try {
      const res = await fetch(`/api/admin/collaborators/invitations/${id}`, {
        method: "DELETE", headers: getAuthHeader(),
      });
      if (res.ok) await load();
    } finally {
      setCanceling(null);
    }
  };

  const handleResend = async (id: number) => {
    setResending(id);
    try {
      const res = await fetch(`/api/admin/collaborators/invitations/${id}/resend`, {
        method: "POST", headers: getAuthHeader(),
      });
      if (res.ok) await load();
    } finally {
      setResending(null);
    }
  };

  const displayed = filterStatus === "all" ? invitations : invitations.filter(i => i.status === filterStatus);

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (invitations.length === 0) return null;

  const limitPct = maxAllowed > 0 ? Math.round((activeCount / maxAllowed) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Metrics banner */}
      <InviteMetricsBanner refreshKey={refreshKey} />

      {/* Header with limit bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
          <h2 className="text-sm font-semibold text-foreground">Historial de invitaciones</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{activeCount}/{maxAllowed} activas</span>
          <div className="w-16 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${limitPct}%`,
                background: limitPct >= 80 ? "#ef4444" : limitPct >= 60 ? "#f59e0b" : "#34d399",
              }}
            />
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(["all", "pending", "accepted", "expired"] as const).map(s => {
          const labels: Record<string, string> = { all: "Todas", pending: "Pendientes", accepted: "Aceptadas", expired: "Expiradas" };
          const cnt = s === "all" ? invitations.length : invitations.filter(i => i.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: filterStatus === s ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                color: filterStatus === s ? "#a5b4fc" : "rgba(255,255,255,0.4)",
                border: filterStatus === s ? "1px solid rgba(99,102,241,0.3)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {labels[s]}
              <span
                className="text-[10px] font-bold px-1 rounded-full"
                style={{ background: filterStatus === s ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.08)", minWidth: 16, textAlign: "center" }}
              >
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* Invitation list */}
      {displayed.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: "rgba(255,255,255,0.3)" }}>Sin invitaciones en este estado.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {displayed.map((inv, idx) => {
            const roleInfo = getRoleConfig(inv.adminRole);
            const expiresInH = inv.expiresInHours ?? 0;
            const isExpiringSoon = inv.status === "pending" && expiresInH <= 24;

            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: idx < displayed.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: inv.status === "accepted" ? "rgba(52,211,153,0.12)" : inv.status === "expired" ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${inv.status === "accepted" ? "rgba(52,211,153,0.2)" : inv.status === "expired" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  <Mail className="w-4 h-4" style={{ color: inv.status === "accepted" ? "#34d399" : inv.status === "expired" ? "#f87171" : "rgba(255,255,255,0.35)" }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white truncate">{inv.email}</p>
                    <InvStatusBadge status={inv.status} />
                    {inv.reminderSent && inv.status === "pending" && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.2)" }}>
                        📧 Recordatorio enviado
                      </span>
                    )}
                    {isExpiringSoon && !inv.reminderSent && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full animate-pulse" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                        ⚠️ Expira en {expiresInH}h
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[11px] font-semibold ${roleInfo.color}`}>{roleInfo.label}</span>
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      · {inv.status === "accepted"
                          ? `Aceptada ${format(new Date(inv.acceptedAt), "d MMM, HH:mm", { locale: es })}`
                          : `Expira ${format(new Date(inv.expiresAt), "d MMM, HH:mm", { locale: es })}`
                        }
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                      por {inv.inviterName}
                    </span>
                    {/* Tracking indicators */}
                    {(inv.emailOpenCount > 0 || inv.linkClickCount > 0) && (
                      <>
                        {inv.emailOpenCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: "#a5b4fc" }}>
                            <Eye className="w-2.5 h-2.5" /> {inv.emailOpenCount}
                          </span>
                        )}
                        {inv.linkClickCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: "#67e8f9" }}>
                            <MousePointerClick className="w-2.5 h-2.5" /> {inv.linkClickCount}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Copy link */}
                  {inv.status !== "accepted" && (
                    <CopyLinkButton token={inv.token} />
                  )}

                  {/* Resend — only for pending or expired */}
                  {inv.status !== "accepted" && (
                    <button
                      onClick={() => handleResend(inv.id)}
                      disabled={resending === inv.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                      style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}
                      title="Reenviar invitación"
                    >
                      {resending === inv.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RefreshCw className="w-3 h-3" />
                      }
                      Reenviar
                    </button>
                  )}

                  {/* Cancel — only for pending */}
                  {inv.status === "pending" && (
                    <button
                      onClick={() => handleCancel(inv.id)}
                      disabled={canceling === inv.id}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-40"
                      style={{ color: "rgba(248,113,113,0.5)" }}
                      title="Cancelar invitación"
                    >
                      {canceling === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Collaborator Card ────────────────────────────────────────────────────────
function CollaboratorCard({
  collab,
  currentUserId,
  trustScore,
  onRoleChangeRequest,
  onRevoke,
  onBlock,
  onUnblock,
  onTimeline,
}: {
  collab: any;
  currentUserId: number;
  trustScore: number;
  onRoleChangeRequest: (collab: any, newRole: string) => void;
  onRevoke: (id: number, name: string) => void;
  onBlock: (id: number, name: string) => void;
  onUnblock: (id: number, name: string) => void;
  onTimeline: (id: number) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const isMe = collab.id === currentUserId;

  return (
    <div className="rounded-xl p-4 space-y-3" style={{
      background: collab.isActive === false ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.03)",
      border: collab.isActive === false ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* Top row */}
      <div className="flex items-center gap-3">
        {collab.avatarUrl ? (
          <img src={collab.avatarUrl} alt={collab.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base flex-shrink-0">
            {collab.name?.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">{collab.name}</p>
            {isMe && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>Tú</span>}
            {collab.isActive === false && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>
                🔒 Bloqueado
              </span>
            )}
          </div>
          <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{collab.email}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
            Desde {format(new Date(collab.createdAt), "dd MMM yyyy", { locale: es })}
          </p>
        </div>
        <RoleBadge role={collab.adminRole} />
      </div>

      {/* Score + quick actions row */}
      <div className="flex items-center gap-2 flex-wrap">
        <TrustScoreBadge score={trustScore} />
        <button
          onClick={() => onTimeline(collab.id)}
          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
          style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}
        >
          <List className="w-2.5 h-2.5" /> Ver timeline
        </button>
      </div>

      {!isMe && (
        <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Change role dropdown */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}
            >
              <UserCog className="w-3.5 h-3.5" /> Cambiar rol <ChevronDown className="w-3 h-3" />
            </button>
            {showDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl shadow-2xl z-20 overflow-hidden" style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }}>
                {ROLES.filter((r) => r.id !== collab.adminRole).map((role) => (
                  <button
                    key={role.id}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors text-sm text-left ${role.color}`}
                    onClick={() => { setShowDropdown(false); onRoleChangeRequest(collab, role.id); }}
                  >
                    <role.Icon className="w-3.5 h-3.5" />
                    {role.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Block / Unblock */}
          {collab.isActive !== false ? (
            <button
              onClick={() => onBlock(collab.id, collab.name)}
              className="px-3 py-2 rounded-xl transition-colors hover:opacity-80"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}
              title="Bloquear temporalmente"
            >
              <Lock className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onUnblock(collab.id, collab.name)}
              className="px-3 py-2 rounded-xl transition-colors hover:opacity-80"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}
              title="Restaurar acceso"
            >
              <Unlock className="w-4 h-4" />
            </button>
          )}

          {/* Revoke */}
          <button
            onClick={() => onRevoke(collab.id, collab.name)}
            className="px-3 py-2 rounded-xl transition-colors hover:opacity-80"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
            title="Revocar acceso permanentemente"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Audit Log Section ────────────────────────────────────────────────────────
const ACTION_OPTIONS = [
  { value: "", label: "Todas las acciones" },
  { value: "collaborator.create",        label: "Colaborador creado" },
  { value: "collaborator.update",        label: "Rol actualizado" },
  { value: "collaborator.revoke",        label: "Acceso revocado" },
  { value: "collaborator.invite",        label: "Invitación enviada" },
  { value: "collaborator.invite_cancel", label: "Invitación cancelada" },
  { value: "withdrawal.approved",        label: "Retiro aprobado" },
  { value: "withdrawal.rejected",        label: "Retiro rechazado" },
];

function AuditLogSection({ collabs, onBlockUser }: { collabs: any[]; onBlockUser: (userId: number) => void }) {
  const [logs, setLogs]                 = useState<any[]>([]);
  const [suspicious, setSuspicious]     = useState<any[]>([]);
  const [massChanges, setMassChanges]   = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterUser, setFilterUser]     = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom]     = useState("");
  const [filterTo, setFilterTo]         = useState("");
  const [expanded, setExpanded]         = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filterAction) params.set("action", filterAction);
      if (filterFrom)   params.set("dateFrom", new Date(filterFrom).toISOString());
      if (filterTo) {
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        params.set("dateTo", to.toISOString());
      }

      const res = await fetch(`/api/admin/action-logs?${params}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setSuspicious(data.suspiciousActivity ?? []);
        setMassChanges(data.massChanges ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  // Client-side user filter
  const filtered = logs.filter(log => {
    if (!filterUser) return true;
    const q = filterUser.toLowerCase();
    return log.userName?.toLowerCase().includes(q) || log.userEmail?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Security banners */}
      <SecurityBanner suspicious={suspicious} massChanges={massChanges} onBlockUser={onBlockUser} />

      {/* Filters */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Filtros de auditoría</span>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
          >
            <RefreshCw className="w-3 h-3" /> Actualizar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* User filter */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              type="text"
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              placeholder="Buscar por usuario o email..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
            />
          </div>

          {/* Action filter */}
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
          >
            {ACTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} style={{ background: "#0f172a" }}>{opt.label}</option>
            ))}
          </select>

          {/* Date from */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", colorScheme: "dark" }}
            />
          </div>

          {/* Date to */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", colorScheme: "dark" }}
            />
          </div>
        </div>

        {/* Result count */}
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {loading ? "Cargando..." : `${filtered.length} eventos encontrados`}
          {(filterUser || filterAction || filterFrom || filterTo) && (
            <button
              onClick={() => { setFilterUser(""); setFilterAction(""); setFilterFrom(""); setFilterTo(""); }}
              className="ml-2 underline hover:no-underline"
              style={{ color: "rgba(99,102,241,0.7)" }}
            >
              Limpiar filtros
            </button>
          )}
        </p>
      </div>

      {/* Log table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-3" style={{ color: "rgba(255,255,255,0.3)" }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Cargando registros...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Eye className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.15)" }} />
          <p className="text-sm font-semibold text-white">Sin registros</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>No hay eventos que coincidan con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {filtered.map((log, idx) => {
            const cfg = getActionConfig(log.action);
            const isOpen = expanded === log.id;
            let metaParsed: any = null;
            try { if (log.meta) metaParsed = JSON.parse(log.meta); } catch {}

            return (
              <div
                key={log.id}
                style={{ borderBottom: idx < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                <button
                  className="w-full flex items-center gap-3 text-left transition-colors hover:bg-white/[0.02]"
                  style={{ padding: "12px 16px" }}
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                >
                  <span className="text-base flex-shrink-0">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                      <span className="text-xs font-medium text-white">{log.userName}</span>
                      {log.userEmail && (
                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{log.userEmail}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {format(new Date(log.createdAt), "d MMM yyyy, HH:mm:ss", { locale: es })}
                      </span>
                      {log.ip && (
                        <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>IP: {log.ip}</span>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
                    style={{ color: "rgba(255,255,255,0.25)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>

                {isOpen && metaParsed && (
                  <div className="px-12 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <pre className="text-[10px] rounded-xl p-3 mt-2 overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.5)" }}>
                      {JSON.stringify(metaParsed, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function AdminCollaboratorsPage() {
  const { user } = useAuth();
  const [collabs, setCollabs]               = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState("");
  const [refreshKey, setRefreshKey]         = useState(0);
  const [activeTab, setActiveTab]           = useState<"colaboradores" | "auditoria">("colaboradores");

  // Trust scores
  const [trustScores, setTrustScores]       = useState<Record<number, number>>({});

  // Timeline drawer
  const [timelineCollabId, setTimelineCollabId] = useState<number | null>(null);

  // Daily summary
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryMsg, setSummaryMsg]         = useState("");

  // Confirmation modals
  const [revokeTarget, setRevokeTarget]     = useState<{ id: number; name: string } | null>(null);
  const [revoking, setRevoking]             = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ collab: any; newRole: string } | null>(null);
  const [changingRole, setChangingRole]     = useState(false);

  const effectiveAdminRole = user?.adminRole ?? "super_admin";

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/collaborators", { headers: getAuthHeader() });
      if (res.ok) setCollabs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const loadTrustScores = async () => {
    try {
      const res = await fetch("/api/admin/collaborators/scores", { headers: getAuthHeader() });
      if (res.ok) setTrustScores(await res.json());
    } catch {}
  };

  const handleInvited = () => { setRefreshKey(k => k + 1); load(); };

  useEffect(() => { load(); loadTrustScores(); }, []);

  // Confirm role change
  const handleRoleChangeConfirm = async () => {
    if (!roleChangeTarget) return;
    setChangingRole(true);
    const res = await fetch(`/api/admin/collaborators/${roleChangeTarget.collab.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ adminRole: roleChangeTarget.newRole }),
    });
    if (res.ok) {
      await load();
    } else {
      const d = await res.json();
      setError(d.error ?? "Error al cambiar rol");
      setTimeout(() => setError(""), 4000);
    }
    setChangingRole(false);
    setRoleChangeTarget(null);
  };

  // Confirm revoke
  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const res = await fetch(`/api/admin/collaborators/${revokeTarget.id}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    });
    if (res.ok) await load();
    else {
      const d = await res.json();
      setError(d.error ?? "Error al revocar acceso");
      setTimeout(() => setError(""), 4000);
    }
    setRevoking(false);
    setRevokeTarget(null);
  };

  // Block / Unblock
  const handleBlock = async (id: number, name: string) => {
    if (!confirm(`¿Bloquear temporalmente a ${name}? No podrá iniciar sesión hasta que lo reactives.`)) return;
    const res = await fetch(`/api/admin/collaborators/${id}/block`, {
      method: "POST",
      headers: getAuthHeader(),
    });
    if (res.ok) {
      setCollabs(prev => prev.map(c => c.id === id ? { ...c, isActive: false } : c));
    } else {
      const d = await res.json();
      setError(d.error ?? "Error al bloquear");
      setTimeout(() => setError(""), 4000);
    }
  };

  const handleUnblock = async (id: number, name: string) => {
    if (!confirm(`¿Restaurar el acceso de ${name}?`)) return;
    const res = await fetch(`/api/admin/collaborators/${id}/unblock`, {
      method: "POST",
      headers: getAuthHeader(),
    });
    if (res.ok) {
      setCollabs(prev => prev.map(c => c.id === id ? { ...c, isActive: true } : c));
    } else {
      const d = await res.json();
      setError(d.error ?? "Error al desbloquear");
      setTimeout(() => setError(""), 4000);
    }
  };

  // Daily summary email
  const handleDailySummary = async () => {
    setSummaryLoading(true);
    setSummaryMsg("");
    try {
      const res = await fetch("/api/admin/collaborators/daily-summary/send", {
        method: "POST",
        headers: getAuthHeader(),
      });
      const d = await res.json();
      setSummaryMsg(res.ok ? "✅ Resumen enviado a pagos@linkservi.com" : (d.error ?? "Error al enviar"));
      setTimeout(() => setSummaryMsg(""), 5000);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Guard: only super_admin
  if (effectiveAdminRole !== "super_admin") {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto py-20 text-center space-y-3">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
          <p className="text-foreground font-semibold">Acceso restringido</p>
          <p className="text-sm text-muted-foreground">Solo el Super Admin puede gestionar colaboradores.</p>
        </div>
      </AppLayout>
    );
  }

  const superAdminCount = collabs.filter((c) => c.adminRole === "super_admin").length;
  const soporteCount    = collabs.filter((c) => c.adminRole === "soporte").length;
  const finanzasCount   = collabs.filter((c) => c.adminRole === "finanzas").length;
  const marketingCount  = collabs.filter((c) => c.adminRole === "marketing").length;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <UserCog className="w-6 h-6 text-amber-400" /> Colaboradores
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Control de equipo, seguridad y auditoría avanzada</p>
          </div>
          <button
            onClick={handleDailySummary}
            disabled={summaryLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 hover:opacity-80"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}
            title="Enviar resumen diario del equipo por correo"
          >
            {summaryLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <MailCheck className="w-3.5 h-3.5" />
            }
            Resumen diario
          </button>
        </div>
        {summaryMsg && (
          <div className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399" }}>
            {summaryMsg}
          </div>
        )}

        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-2xl font-black text-amber-400">{superAdminCount}</p>
              <p className="text-[11px] text-amber-400/70 mt-0.5 font-medium">Super Admin</p>
            </div>
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-center">
              <p className="text-2xl font-black text-cyan-400">{soporteCount}</p>
              <p className="text-[11px] text-cyan-400/70 mt-0.5 font-medium">Soporte</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-2xl font-black text-emerald-400">{finanzasCount}</p>
              <p className="text-[11px] text-emerald-400/70 mt-0.5 font-medium">Finanzas</p>
            </div>
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
              <p className="text-2xl font-black text-purple-400">{marketingCount}</p>
              <p className="text-[11px] text-purple-400/70 mt-0.5 font-medium">Marketing</p>
            </div>
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {([
            { key: "colaboradores", label: "Colaboradores", icon: Users },
            { key: "auditoria",     label: "Auditoría",     icon: Activity },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: activeTab === key ? "rgba(99,102,241,0.2)" : "transparent",
                color: activeTab === key ? "#a5b4fc" : "rgba(255,255,255,0.4)",
                border: activeTab === key ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {key === "auditoria" && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                  <ShieldCheck className="w-2.5 h-2.5 inline" />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* ── TAB: COLABORADORES ─────────────────────────────────────────── */}
        {activeTab === "colaboradores" && (
          <div className="space-y-5">
            {/* Permission reference */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Permisos por rol
              </p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {ROLES.map((r) => (
                  <div key={r.id} className="flex items-start gap-2">
                    <r.Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${r.color}`} />
                    <span><span className={`font-semibold ${r.color}`}>{r.label}:</span> {r.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Invite section */}
            <InviteSection onInvited={handleInvited} />

            {/* Invitations history */}
            <InvitationsHistorySection
              refreshKey={refreshKey}
              onLimitChange={() => {}}
            />

            {/* Collaborators list */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Colaboradores activos ({collabs.length})
              </h2>

              {loading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  <p className="text-sm">Cargando colaboradores...</p>
                </div>
              ) : collabs.length === 0 ? (
                <div className="py-12 text-center bg-card border border-border rounded-xl">
                  <UserCog className="w-10 h-10 text-muted-foreground opacity-40 mx-auto mb-3" />
                  <p className="font-semibold text-foreground text-sm">Sin colaboradores</p>
                  <p className="text-xs text-muted-foreground mt-1">Agrega colaboradores usando el formulario de arriba</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {collabs.map((c) => (
                    <CollaboratorCard
                      key={c.id}
                      collab={c}
                      currentUserId={user!.id}
                      trustScore={trustScores[c.id] ?? 100}
                      onRoleChangeRequest={(collab, newRole) => setRoleChangeTarget({ collab, newRole })}
                      onRevoke={(id, name) => setRevokeTarget({ id, name })}
                      onBlock={handleBlock}
                      onUnblock={handleUnblock}
                      onTimeline={(id) => setTimelineCollabId(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: AUDITORÍA ─────────────────────────────────────────────── */}
        {activeTab === "auditoria" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4" style={{ color: "#f87171" }} />
                Registro de auditoría
              </h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                Historial completo de acciones críticas del equipo. Filtrable por usuario, acción y rango de fecha.
              </p>
            </div>
            <AuditLogSection collabs={collabs} onBlockUser={(id) => handleBlock(id, collabs.find(c => c.id === id)?.name ?? "Usuario")} />
          </div>
        )}

        {/* ── ROLE CHANGE MODAL ────────────────────────────────────────────── */}
        {roleChangeTarget && (
          <ConfirmRoleModal
            collab={roleChangeTarget.collab}
            newRole={roleChangeTarget.newRole}
            onConfirm={handleRoleChangeConfirm}
            onCancel={() => setRoleChangeTarget(null)}
            loading={changingRole}
          />
        )}

        {/* ── REVOKE MODAL ─────────────────────────────────────────────────── */}
        {revokeTarget && (
          <RevokeModal
            target={revokeTarget}
            onConfirm={handleRevoke}
            onCancel={() => setRevokeTarget(null)}
            loading={revoking}
          />
        )}
      </div>

      {/* ── TIMELINE DRAWER ─────────────────────────────────────────────────── */}
      {timelineCollabId !== null && (
        <TimelineDrawer
          collaboratorId={timelineCollabId}
          onClose={() => setTimelineCollabId(null)}
        />
      )}
    </AppLayout>
  );
}
