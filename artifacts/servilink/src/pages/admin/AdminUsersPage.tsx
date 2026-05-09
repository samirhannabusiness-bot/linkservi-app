import { useState, useEffect } from "react";
import { useAdminListUsers, useAdminUpdateUser } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getRequestOptions, getAuthHeader, apiFetch } from "@/lib/api";
import { Search, UserCheck, UserX, Users, Trash2, AlertTriangle, X, ShieldOff, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  worker: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  client: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  cohost: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  worker: "Profesional",
  client: "Cliente",
  cohost: "Co-host",
};

interface UserTarget {
  id: number;
  name: string;
  email: string;
  role: string;
}

// alias kept for backwards compat
type DeleteTarget = UserTarget;

export function AdminUsersPage() {
  const opts = getRequestOptions();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const { data: users = [], refetch } = useAdminListUsers(
    { ...(roleFilter ? { role: roleFilter } : {}), ...(search ? { search } : {}) },
    opts as any
  );
  const { mutate: updateUser } = useAdminUpdateUser({
    ...opts,
    mutation: { onSuccess: () => refetch() },
  } as any);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Verified user IDs (loaded from verifications endpoint) ─────────────────
  const [verifiedUserIds, setVerifiedUserIds] = useState<Set<number>>(new Set());

  const fetchVerifiedUsers = async () => {
    try {
      const res = await fetch("/api/admin/verifications?status=approved", {
        headers: getAuthHeader(),
      });
      if (!res.ok) return;
      const data: { userId: number }[] = await res.json();
      setVerifiedUserIds(new Set(data.map((v) => v.userId)));
    } catch { /* silent */ }
  };

  // Load on mount
  useEffect(() => { fetchVerifiedUsers(); }, []);

  // ── Reset verification ─────────────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<UserTarget | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetVerificationConfirm = async () => {
    if (!resetTarget) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) { setResetError(data?.error ?? "Error al anular la verificación"); return; }
      // Optimistically remove from verified set immediately
      setVerifiedUserIds((prev) => { const next = new Set(prev); next.delete(resetTarget.id); return next; });
      setResetTarget(null);
      setDeleteSuccess(data?.message ?? "Verificación anulada. El usuario deberá subir sus documentos de nuevo.");
      setTimeout(() => setDeleteSuccess(null), 5000);
      refetch();
      fetchVerifiedUsers();
    } catch {
      setResetError("Error de conexión");
    } finally {
      setResetting(false);
    }
  };

  const userList = users as any[];
  const activeCount = userList.filter(u => u.isActive).length;
  const suspendedCount = userList.filter(u => !u.isActive).length;

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const data = await apiFetch<{ message: string }>(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      setDeleteTarget(null);
      setDeleteSuccess(data?.message ?? "Usuario eliminado correctamente");
      setTimeout(() => setDeleteSuccess(null), 4000);
      refetch();
    } catch (err: any) {
      setDeleteError(err.message ?? "Error inesperado");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {userList.length} usuario{userList.length !== 1 ? "s" : ""} encontrado{userList.length !== 1 ? "s" : ""}
            {suspendedCount > 0 && (
              <span className="ml-2 text-red-500 font-medium">· {suspendedCount} bloqueado{suspendedCount > 1 ? "s" : ""}</span>
            )}
          </p>
        </div>

        {/* ── Success toast ─────────────────────────────────────────────── */}
        {deleteSuccess && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
            <UserX className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{deleteSuccess}</span>
            <button onClick={() => setDeleteSuccess(null)}><X className="w-4 h-4 opacity-60 hover:opacity-100" /></button>
          </div>
        )}

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Todos los roles</option>
            <option value="client">Clientes</option>
            <option value="worker">Profesionales</option>
            <option value="cohost">Co-hosts</option>
            <option value="admin">Admins</option>
          </select>
        </div>

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {userList.length === 0 ? (
          <div className="py-16 text-center bg-card border border-border rounded-xl">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground">Sin resultados</p>
            <p className="text-sm text-muted-foreground mt-1">No se encontraron usuarios con ese criterio.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuario</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Registro</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {userList.map((u: any) => (
                    <tr key={u.id} className={`transition-colors ${!u.isActive ? "bg-red-50/30 dark:bg-red-900/5" : "hover:bg-muted/30"}`}>

                      {/* User info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt={u.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                              {u.name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{u.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold w-fit ${u.isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}>
                            {u.isActive ? "Activo" : "Bloqueado"}
                          </span>
                          {verifiedUserIds.has(u.id) && (
                            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold w-fit bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              <ShieldCheck className="w-2.5 h-2.5" /> Verificado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date - hidden on mobile */}
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {u.createdAt ? format(new Date(u.createdAt), "dd/MM/yyyy") : ""}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {u.role !== "admin" && (
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {/* Block / Activate */}
                            <button
                              onClick={() => updateUser({ userId: u.id, data: { isActive: !u.isActive } })}
                              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${u.isActive
                                ? "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                : "border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                              }`}
                            >
                              {u.isActive
                                ? <><UserX className="w-3 h-3" /> Bloquear</>
                                : <><UserCheck className="w-3 h-3" /> Activar</>
                              }
                            </button>

                            {/* Reset Verification — only show when user is verified */}
                            {verifiedUserIds.has(u.id) && (
                              <button
                                onClick={() => setResetTarget({ id: u.id, name: u.name, email: u.email, role: u.role })}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 transition-colors font-medium"
                                title="Quitar verificación — obliga al usuario a subir documentos de nuevo"
                              >
                                <ShieldOff className="w-3 h-3" /> Quitar Verif.
                              </button>
                            )}

                            {/* Delete */}
                            <button
                              onClick={() => setDeleteTarget({ id: u.id, name: u.name, email: u.email, role: u.role })}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/15 transition-colors font-medium"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-3 h-3" /> Eliminar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Reset Verification confirmation modal ────────────────────── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl"
            style={{ background: "var(--card)", border: "1px solid rgba(245,158,11,0.35)" }}
          >
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <ShieldOff className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-lg">Quitar Verificación</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Esta acción obliga al usuario a verificarse de nuevo</p>
              </div>
              <button
                onClick={() => { setResetTarget(null); setResetError(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User info */}
            <div className="rounded-xl p-4 bg-white/[0.04] border border-white/[0.08] space-y-1">
              <p className="text-sm font-semibold text-foreground">{resetTarget.name}</p>
              <p className="text-xs text-muted-foreground">{resetTarget.email}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[resetTarget.role] ?? "bg-gray-100 text-gray-700"}`}>
                {ROLE_LABELS[resetTarget.role] ?? resetTarget.role}
              </span>
            </div>

            {/* What will happen */}
            <div className="rounded-xl p-4 bg-amber-500/8 border border-amber-500/25 space-y-2">
              <p className="text-sm text-amber-400 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> ¿Qué ocurrirá?
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldOff className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  Se marcará como <strong className="text-foreground">no verificado</strong> y el estado pasará a <strong className="text-foreground">pendiente</strong>
                </li>
                <li className="flex items-start gap-2">
                  <X className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  Se borrarán las fotos de documentos y selfie guardadas
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  La próxima vez que inicie sesión, le aparecerá el muro de verificación para subir sus documentos de nuevo
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  El usuario recibirá una notificación explicando el motivo
                </li>
              </ul>
            </div>

            {/* Error */}
            {resetError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                {resetError}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { setResetTarget(null); setResetError(null); }}
                disabled={resetting}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetVerificationConfirm}
                disabled={resetting}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {resetting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Procesando...
                  </span>
                ) : (
                  <><ShieldOff className="w-4 h-4" /> Sí, anular verificación</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl"
            style={{ background: "var(--card)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-lg">Eliminar usuario</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Esta acción no se puede deshacer</p>
              </div>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User info */}
            <div className="rounded-xl p-4 bg-white/[0.04] border border-white/[0.08] space-y-1">
              <p className="text-sm font-semibold text-foreground">{deleteTarget.name}</p>
              <p className="text-xs text-muted-foreground">{deleteTarget.email}</p>
            </div>

            {/* Warning */}
            <div className="rounded-xl p-4 bg-amber-500/8 border border-amber-500/25 space-y-1.5">
              <p className="text-sm text-amber-400 font-semibold">¿Qué ocurrirá?</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> El usuario será eliminado del sistema</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Sus datos personales serán borrados</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> Puede volver a registrarse con el mismo email en el futuro</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> No es un bloqueo permanente de email</li>
              </ul>
            </div>

            {/* Error */}
            {deleteError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                {deleteError}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deleting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Eliminando...
                  </span>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Sí, eliminar usuario</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
