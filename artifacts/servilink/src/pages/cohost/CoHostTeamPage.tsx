import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Link2, Copy, Check, Clock, AlertTriangle, ShieldCheck,
  UserCheck, Loader2, RefreshCw, CheckCircle2, XCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Invite {
  id: number;
  code: string;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  usedByWorkerId: number | null;
  workerName: string | null;
  isUsed: boolean;
  isExpired: boolean;
}

function InviteStatusBadge({ invite }: { invite: Invite }) {
  if (invite.isUsed) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
      <CheckCircle2 className="w-3 h-3" /> Usado
    </span>
  );
  if (invite.isExpired) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 text-xs font-medium">
      <XCircle className="w-3 h-3" /> Expirado
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-xs font-medium">
      <Clock className="w-3 h-3" /> Activo
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground hover:text-foreground transition-all"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

export function CoHostTeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [kycError, setKycError] = useState("");

  const { data: workers = [], isLoading: workersLoading } = useQuery({
    queryKey: ["cohost", "workers"],
    queryFn: () => apiFetch("/api/cohost/workers", { headers: getAuthHeader() }),
  });

  const { data: invites = [], isLoading: invitesLoading } = useQuery<Invite[]>({
    queryKey: ["cohost", "invites"],
    queryFn: () => apiFetch("/api/cohost/invite/list", { headers: getAuthHeader() }),
  });

  const generateMut = useMutation({
    mutationFn: () => apiFetch("/api/cohost/invite/generate", {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
    }),
    onSuccess: () => {
      setKycError("");
      qc.invalidateQueries({ queryKey: ["cohost", "invites"] });
    },
    onError: async (err: any) => {
      const msg = err?.message ?? "Error al generar invitación";
      setKycError(msg);
    },
  });

  const activeInvites = invites.filter(i => !i.isUsed && !i.isExpired);
  const usedInvites = invites.filter(i => i.isUsed);

  const getInviteLink = (code: string) => {
    const base = window.location.origin;
    return `${base}/unirme/${code}`;
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest text-cyan-400 uppercase mb-1">Co-Host</p>
            <h1 className="text-2xl font-bold text-foreground">Mi Equipo</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestiona invitaciones y visualiza a tu equipo de profesionales</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            {workersLoading ? "…" : workers.length} profesionales
          </div>
        </div>

        {/* KYC Gate Banner */}
        <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/20 p-4 flex gap-3 items-start">
          <ShieldCheck className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Verificación requerida para invitar</p>
            <p className="text-xs text-muted-foreground">
              Solo puedes generar códigos de invitación si tu cuenta está verificada (KYC aprobado).
              El profesional que use tu link deberá completar su propia verificación KYC individualmente.
            </p>
          </div>
        </div>

        {/* Error banner from backend */}
        {kycError && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex gap-3 items-center">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{kycError}</p>
          </div>
        )}

        {/* Generate invite */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-foreground">Generar nuevo link de invitación</h2>
            </div>
            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black text-sm font-semibold transition-all"
            >
              {generateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Generar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            El link generado expira en <span className="text-foreground font-medium">7 días</span> y solo puede usarse una vez.
            Compártelo directamente con el profesional que deseas añadir a tu equipo.
          </p>

          {/* Active invites */}
          {invitesLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeInvites.length > 0 ? (
            <div className="space-y-2">
              {activeInvites.map(inv => (
                <div key={inv.id} className="rounded-xl bg-white/3 border border-white/8 p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <InviteStatusBadge invite={inv} />
                      <span className="font-mono text-sm text-foreground tracking-widest">{inv.code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CopyButton text={getInviteLink(inv.code)} />
                    </div>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground break-all bg-black/20 rounded-lg px-3 py-2 select-all">
                    {getInviteLink(inv.code)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Expira {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true, locale: es })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No tienes links activos. Genera uno para invitar a un profesional.</p>
          )}
        </div>

        {/* Team members */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">Profesionales en tu equipo</h2>
          </div>
          {workersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Aún no tienes profesionales en tu equipo</p>
              <p className="text-xs text-muted-foreground/70">Genera un link de invitación y compártelo</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {workers.map((w: any) => (
                <div key={w.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/2 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-white/10 flex items-center justify-center shrink-0">
                    {w.avatarUrl ? (
                      <img src={w.avatarUrl} alt={w.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-cyan-300">{(w.name ?? "?")[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{w.name ?? "Sin nombre"}</p>
                    <p className="text-xs text-muted-foreground truncate">{w.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {w.isVerified ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" /> KYC
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" /> Pendiente KYC
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Used invites history */}
        {usedInvites.length > 0 && (
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Historial de invitaciones</h2>
            </div>
            <div className="divide-y divide-border">
              {usedInvites.map(inv => (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">{inv.code}</p>
                    <p className="text-sm text-foreground">{inv.workerName ?? `Profesional #${inv.usedByWorkerId}`}</p>
                  </div>
                  <div className="text-right">
                    <InviteStatusBadge invite={inv} />
                    {inv.usedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(inv.usedAt), "d MMM yyyy", { locale: es })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
