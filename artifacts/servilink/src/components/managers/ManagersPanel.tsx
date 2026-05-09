import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, UserPlus, Mail, Clock, X, AlertTriangle, Loader2, Trash2, CheckCircle, Percent,
  TrendingUp, Coins,
} from "lucide-react";
import { getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

// ── Per-manager metrics (loaded once per panel) ──────────────────────────────
interface ManagerMetric {
  managerId: number;
  userId: number;
  userName: string;
  commissionPercentage: number;
  since: string;
  salesCount: number;
  revenueUsd: number;
  commissionUsd: number;
}

const fmtUsd = (n: number) =>
  n.toLocaleString("es-VE", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Shared inline styles (match dashboard look) ──────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "16px",
};
const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  padding: "10px 12px",
  fontSize: "14px",
  color: "var(--foreground)",
  outline: "none",
  width: "100%",
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  background: "#38bdf8", color: "#0f172a", border: "none",
  borderRadius: "12px", padding: "10px 18px", fontSize: 14, fontWeight: 700,
  cursor: "pointer",
};
const dangerBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  background: "rgba(239,68,68,0.12)", color: "#fca5a5",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: "10px", padding: "8px 14px", fontSize: 13, fontWeight: 600,
  cursor: "pointer",
};

// ── API types (loosely-typed; backend is the source of truth) ────────────────
interface Manager {
  id: number; userId: number;
  userName: string; userEmail: string; userAvatarUrl: string | null;
  permissions: { canChat: boolean; canManageOrders: boolean; canManageProducts: boolean; canManageServices: boolean };
  commissionPercentage: number;
  status: "active" | "removed";
  createdAt: string;
  removedAt?: string | null;
  removedReason?: string | null;
}
interface PendingInvite {
  id: number; email: string;
  permissions: Manager["permissions"];
  commissionPercentage: number;
  expiresAt: string;
  createdAt: string;
}
interface ListResp { managers: Manager[]; pendingInvites: PendingInvite[] }

const PERM_LABELS: { key: keyof Manager["permissions"]; label: string; hint: string }[] = [
  { key: "canChat",            label: "Chatear con clientes", hint: "Atender mensajes y responder consultas" },
  { key: "canManageOrders",    label: "Gestionar pedidos",     hint: "Aceptar, marcar enviado, completar" },
  { key: "canManageProducts",  label: "Editar productos",      hint: "Crear, editar y desactivar" },
  { key: "canManageServices",  label: "Editar servicios",      hint: "Catálogo de servicios del negocio" },
];

// ── Main panel ───────────────────────────────────────────────────────────────
export function ManagersPanel({ storeId, storeName }: { storeId: number; storeName: string }) {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen]       = useState(false);
  const [terminateMgr, setTerminateMgr]   = useState<Manager | null>(null);

  const queryKey = ["store-managers", storeId];
  const { data, isLoading, error } = useQuery<ListResp>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/managers/store/${storeId}`, { headers: getAuthHeader() });
      if (!r.ok) throw new Error("No se pudieron cargar los gestores");
      return r.json();
    },
  });

  // Metrics per active manager — separate query so it can refresh independently
  const { data: metrics } = useQuery<ManagerMetric[]>({
    queryKey: ["store-managers-metrics", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/managers/store/${storeId}/metrics`, { headers: getAuthHeader() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 60_000,
  });
  const metricByMgr = new Map<number, ManagerMetric>();
  (metrics ?? []).forEach(m => metricByMgr.set(m.managerId, m));

  const refresh = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["store-managers-metrics", storeId] });
  };

  return (
    <div className="space-y-4" data-testid="managers-panel">
      <div style={cardStyle}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(56,189,248,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Users style={{ width: 20, height: 20, color: "#38bdf8" }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Gestores del negocio</h3>
              <p className="text-xs text-muted-foreground truncate">
                Personas que te ayudan a operar {storeName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            style={primaryBtn}
            data-testid="open-invite-manager"
          >
            <UserPlus style={{ width: 16, height: 16 }} />
            Invitar
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={cardStyle} className="text-sm text-muted-foreground">Cargando…</div>
      )}
      {error && (
        <div style={{ ...cardStyle, borderColor: "rgba(239,68,68,0.3)", color: "#fca5a5" }}>
          {(error as Error).message}
        </div>
      )}

      {data && data.managers.length === 0 && data.pendingInvites.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px" }} data-testid="managers-empty">
          <Users style={{ width: 32, height: 32, margin: "0 auto 8px", color: "#475569" }} />
          <p className="text-sm text-foreground font-medium mb-1">Aún no tienes gestores</p>
          <p className="text-xs text-muted-foreground">
            Invita a alguien de confianza para que te ayude a atender pedidos y clientes.
          </p>
        </div>
      )}

      {/* Active managers */}
      {data && data.managers.filter(m => m.status === "active").map(m => {
        const mm = metricByMgr.get(m.id);
        return (
          <div key={m.id} style={cardStyle} data-testid={`manager-row-${m.id}`}>
            <div className="flex items-start gap-3">
              <img
                src={m.userAvatarUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.userName)}`}
                alt=""
                style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: "#1e293b" }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{m.userName}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    background: "rgba(16,185,129,0.15)", color: "#6ee7b7",
                  }}>Activo</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{m.userEmail}</div>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#6ee7b7" }}>
                    <Percent style={{ width: 12, height: 12 }} /> {m.commissionPercentage.toFixed(2)}% comisión
                  </span>
                  <span className="text-xs text-muted-foreground">
                    desde {new Date(m.createdAt).toLocaleDateString("es-VE")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PERM_LABELS.filter(p => m.permissions[p.key]).map(p => (
                    <span key={p.key} style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999,
                      background: "rgba(56,189,248,0.1)", color: "#7dd3fc",
                      border: "1px solid rgba(56,189,248,0.2)",
                    }}>{p.label}</span>
                  ))}
                </div>

                {/* Metrics row — only render when this manager has activity */}
                {mm && mm.salesCount > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "rgba(16,185,129,0.06)",
                      border: "1px solid rgba(16,185,129,0.18)",
                    }}
                    data-testid={`manager-metrics-${m.id}`}
                  >
                    <div className="flex flex-wrap gap-3 items-center">
                      <span className="inline-flex items-center gap-1 text-xs text-foreground">
                        <CheckCircle style={{ width: 12, height: 12, color: "#6ee7b7" }} />
                        <strong>{mm.salesCount}</strong> venta{mm.salesCount === 1 ? "" : "s"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-foreground">
                        <TrendingUp style={{ width: 12, height: 12, color: "#7dd3fc" }} />
                        Generó <strong>{fmtUsd(mm.revenueUsd)}</strong>
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: "#fbbf24" }}
                        title="LinkServi calcula esta comisión como referencia basada en las ventas generadas, pero no procesa pagos directos al gestor."
                      >
                        <Coins style={{ width: 12, height: 12 }} />
                        Comisión estimada del gestor: <strong>{fmtUsd(mm.commissionUsd)}</strong>
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic mt-1.5">
                      El pago se acuerda directamente con el gestor.
                    </p>
                  </div>
                )}
                {mm && mm.salesCount === 0 && (
                  <div className="text-[11px] text-muted-foreground mt-2 italic" data-testid={`manager-metrics-empty-${m.id}`}>
                    Aún no ha generado ventas.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTerminateMgr(m)}
                style={dangerBtn}
                data-testid={`terminate-manager-${m.id}`}
                title="Finalizar relación"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
                <span className="hidden sm:inline">Finalizar</span>
              </button>
            </div>
          </div>
        );
      })}

      {/* Pending invites */}
      {data && data.pendingInvites.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Invitaciones pendientes
          </h4>
          {data.pendingInvites.map(inv => (
            <div key={inv.id} style={{
              ...cardStyle,
              background: "rgba(245,158,11,0.05)",
              borderColor: "rgba(245,158,11,0.2)",
            }} data-testid={`pending-invite-${inv.id}`}>
              <div className="flex items-start gap-3">
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "rgba(245,158,11,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Mail style={{ width: 18, height: 18, color: "#fbbf24" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{inv.email}</div>
                  <div className="flex items-center gap-3 flex-wrap mt-1">
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#fbbf24" }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      Expira {new Date(inv.expiresAt).toLocaleString("es-VE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-xs" style={{ color: "#6ee7b7" }}>
                      <Percent className="inline-block" style={{ width: 12, height: 12 }} /> {inv.commissionPercentage.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Removed managers (history, collapsed-style) */}
      {data && data.managers.filter(m => m.status === "removed").length > 0 && (
        <details>
          <summary className="text-xs text-muted-foreground cursor-pointer px-1 py-2">
            Historial de gestores anteriores ({data.managers.filter(m => m.status === "removed").length})
          </summary>
          <div className="space-y-2 mt-2">
            {data.managers.filter(m => m.status === "removed").map(m => (
              <div key={m.id} style={{ ...cardStyle, opacity: 0.7 }}>
                <div className="flex items-center gap-3">
                  <img
                    src={m.userAvatarUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.userName)}`}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "#1e293b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{m.userName}</div>
                    <div className="text-xs text-muted-foreground">
                      Finalizado {m.removedAt ? new Date(m.removedAt).toLocaleDateString("es-VE") : ""}
                    </div>
                    {m.removedReason && (
                      <div className="text-xs mt-1 italic" style={{ color: "#fca5a5" }}>
                        "{m.removedReason}"
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Modals */}
      {inviteOpen && (
        <InviteManagerModal
          storeId={storeId}
          onClose={() => setInviteOpen(false)}
          onSuccess={() => { setInviteOpen(false); refresh(); }}
        />
      )}
      {terminateMgr && (
        <TerminateManagerModal
          manager={terminateMgr}
          onClose={() => setTerminateMgr(null)}
          onSuccess={() => { setTerminateMgr(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Invite modal ─────────────────────────────────────────────────────────────
function InviteManagerModal({
  storeId, onClose, onSuccess,
}: { storeId: number; onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail]                 = useState("");
  const [commission, setCommission]       = useState("1.5");
  const [perms, setPerms]                 = useState({
    canChat: true, canManageOrders: true, canManageProducts: true, canManageServices: true,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const cmm = parseFloat(commission);
      if (!Number.isFinite(cmm) || cmm < 1.5 || cmm > 50) {
        throw new Error("La comisión debe estar entre 1.5% y 50%");
      }
      const r = await fetch(`/api/managers/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          storeId,
          email: email.trim().toLowerCase(),
          commissionPercentage: cmm,
          permissions: perms,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Error enviando invitación");
      return j;
    },
    onSuccess: () => {
      toast({ title: "Invitación enviada ✨", description: "Le llegará un correo con el enlace para aceptar." });
      onSuccess();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <ModalShell title="Invitar gestor" onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-4">
        Envíale a esa persona un correo para que se una como gestor del negocio. Si no tiene
        cuenta, podrá crearla en el mismo paso.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Correo del gestor</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="alguien@correo.com"
            style={inputStyle}
            data-testid="invite-email-input"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            Comisión por venta (%)
          </label>
          <input
            type="number"
            min={1.5}
            max={50}
            step={0.1}
            value={commission}
            onChange={e => setCommission(e.target.value)}
            style={inputStyle}
            data-testid="invite-commission-input"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Mínimo 1.5%. Esto es lo que el gestor cobra de cada venta del negocio.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-2">Permisos</label>
          <div className="space-y-2">
            {PERM_LABELS.map(p => (
              <label key={p.key} className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={perms[p.key]}
                  onChange={e => setPerms(prev => ({ ...prev, [p.key]: e.target.checked }))}
                  style={{ marginTop: 2 }}
                  data-testid={`perm-${p.key}`}
                />
                <span className="flex-1">
                  <span className="block text-sm text-foreground">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10, padding: "10px 12px", color: "#fca5a5", fontSize: 13,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            style={{ ...primaryBtn, background: "rgba(255,255,255,0.06)", color: "#cbd5e1" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { setError(null); mutation.mutate(); }}
            disabled={mutation.isPending || !email.trim()}
            style={{ ...primaryBtn, opacity: mutation.isPending || !email.trim() ? 0.5 : 1 }}
            data-testid="send-invite-btn"
          >
            {mutation.isPending && <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />}
            Enviar invitación
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Terminate modal (mandatory reason 20–500 chars) ──────────────────────────
function TerminateManagerModal({
  manager, onClose, onSuccess,
}: { manager: Manager; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError]   = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/managers/${manager.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Error al finalizar");
      return j;
    },
    onSuccess: () => {
      toast({ title: "Relación finalizada", description: "El gestor ya no tiene acceso al negocio." });
      onSuccess();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remaining = 500 - reason.length;
  const tooShort = reason.trim().length < 20;

  return (
    <ModalShell title="Finalizar relación con gestor" onClose={onClose}>
      <div style={{
        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", gap: 10,
      }}>
        <AlertTriangle style={{ width: 18, height: 18, color: "#fca5a5", flexShrink: 0, marginTop: 2 }} />
        <div className="text-sm" style={{ color: "#fecaca" }}>
          <strong>{manager.userName}</strong> perderá acceso al negocio inmediatamente.
          Esta acción queda registrada y no se puede deshacer.
        </div>
      </div>

      <label className="block text-xs font-semibold text-muted-foreground mb-1">
        Motivo (obligatorio, mín. 20 caracteres)
      </label>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value.slice(0, 500))}
        rows={4}
        placeholder="Explica brevemente por qué finalizas la relación..."
        style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
        data-testid="terminate-reason-input"
      />
      <div className="text-[11px] text-muted-foreground text-right mt-1">
        {remaining} caracteres disponibles
      </div>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 10, padding: "10px 12px", color: "#fca5a5", fontSize: 13,
          marginTop: 12,
        }}>{error}</div>
      )}

      <div className="flex gap-2 pt-4">
        <button type="button" onClick={onClose}
          style={{ ...primaryBtn, background: "rgba(255,255,255,0.06)", color: "#cbd5e1" }}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => { setError(null); mutation.mutate(); }}
          disabled={tooShort || mutation.isPending}
          style={{
            ...dangerBtn,
            background: "rgba(239,68,68,0.18)",
            opacity: tooShort || mutation.isPending ? 0.5 : 1,
            padding: "10px 18px",
            fontSize: 14,
          }}
          data-testid="confirm-terminate-btn"
        >
          {mutation.isPending && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
          Finalizar relación
        </button>
      </div>
    </ModalShell>
  );
}

// ── Reusable bottom-sheet / modal shell ──────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0f172a", borderTop: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "20px 20px 0 0", padding: 20,
          width: "100%", maxWidth: 480, maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}
            data-testid="modal-close">
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Tiny success badge used by parent — exported to avoid lint warnings on import diff
export const _IconCheck = CheckCircle;
