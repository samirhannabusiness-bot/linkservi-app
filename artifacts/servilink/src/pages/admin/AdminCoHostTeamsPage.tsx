import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import {
  Users, ShieldCheck, ShieldAlert, Shield, ChevronDown, ChevronUp,
  User, Star, MapPin, CheckCircle2, Clock, XCircle, Loader2,
} from "lucide-react";

interface WorkerEntry {
  id: number;
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  isVerified: boolean;
  verificationStatus: string;
  state: string | null;
  city: string | null;
  completedJobs: number;
  rating: number;
}

interface CohostInfo {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  kycStatus: string;
}

interface TeamGroup {
  cohost: CohostInfo | null;
  workers: WorkerEntry[];
}

const KYC_LABEL: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  approved:      { label: "KYC Aprobado",    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  pending:       { label: "KYC Pendiente",   color: "text-amber-400 bg-amber-500/10 border-amber-500/20",     icon: Clock },
  rejected:      { label: "KYC Rechazado",   color: "text-red-400 bg-red-500/10 border-red-500/20",           icon: XCircle },
  not_submitted: { label: "Sin KYC",         color: "text-slate-400 bg-white/5 border-white/10",              icon: ShieldAlert },
};

const VER_LABEL: Record<string, { label: string; color: string }> = {
  approved: { label: "Verificado",  color: "text-emerald-400 bg-emerald-500/10" },
  pending:  { label: "Pendiente",   color: "text-amber-400 bg-amber-500/10" },
  rejected: { label: "Rechazado",   color: "text-red-400 bg-red-500/10" },
};

function Avatar({ src, name, size = 8 }: { src?: string | null; name?: string | null; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full object-cover`;
  if (src) return <img src={src} alt={name ?? ""} className={cls} />;
  return (
    <div className={`w-${size} h-${size} rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-white/10 flex items-center justify-center`}>
      <span className="text-xs font-bold text-cyan-300">{(name ?? "?")[0].toUpperCase()}</span>
    </div>
  );
}

function TeamCard({ group }: { group: TeamGroup }) {
  const [expanded, setExpanded] = useState(true);
  const { cohost, workers } = group;
  const kyc = KYC_LABEL[cohost?.kycStatus ?? "not_submitted"] ?? KYC_LABEL.not_submitted;
  const KycIcon = kyc.icon;

  const verifiedCount = workers.filter(w => w.isVerified).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Cohost header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-white/2 transition-colors text-left"
      >
        {cohost ? (
          <>
            <Avatar src={cohost.avatar} name={cohost.name} size={9} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-foreground text-sm">{cohost.name}</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${kyc.color}`}>
                  <KycIcon className="w-3 h-3" /> {kyc.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{cohost.email}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-muted-foreground text-sm italic">Sin Co-Host asignado</p>
              <p className="text-xs text-muted-foreground/60">Profesionales independientes</p>
            </div>
          </>
        )}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{workers.length} profesional{workers.length !== 1 ? "es" : ""}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            {verifiedCount} verificado{verifiedCount !== 1 ? "s" : ""}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Workers list */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border/50">
          {workers.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground italic">Este Co-Host no tiene profesionales aún.</p>
          ) : workers.map(w => {
            const ver = VER_LABEL[w.verificationStatus] ?? VER_LABEL.pending;
            return (
              <div key={w.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/1 transition-colors">
                {/* indent */}
                <div className="w-4 shrink-0" />
                <Avatar src={w.avatar} name={w.name} size={7} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{w.name ?? "Sin nombre"}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ver.color}`}>{ver.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{w.email}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                  {w.rating > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Star className="w-3 h-3" /> {w.rating.toFixed(1)}
                    </span>
                  )}
                  {(w.state || w.city) && (
                    <span className="flex items-center gap-1 hidden sm:flex">
                      <MapPin className="w-3 h-3" /> {[w.city, w.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span className="hidden md:block">{w.completedJobs} servicios</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminCoHostTeamsPage() {
  const [filter, setFilter] = useState<"all" | "verified" | "no_cohost">("all");

  const { data: teams = [], isLoading } = useQuery<TeamGroup[]>({
    queryKey: ["admin", "cohost-teams"],
    queryFn: async () => {
      const res = await fetch("/api/admin/cohost-teams", { headers: getAuthHeader() });
      if (!res.ok) throw new Error("Error al cargar equipos");
      return res.json();
    },
  });

  const filtered = teams.filter(g => {
    if (filter === "verified") return g.cohost && g.cohost.kycStatus === "approved";
    if (filter === "no_cohost") return !g.cohost;
    return true;
  });

  const totalWorkers = teams.reduce((s, g) => s + g.workers.length, 0);
  const totalVerified = teams.reduce((s, g) => s + g.workers.filter(w => w.isVerified).length, 0);
  const cohostCount = teams.filter(g => g.cohost).length;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <p className="text-xs font-semibold tracking-widest text-cyan-400 uppercase mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-foreground">Equipos Co-Host</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Estructura de equipos: quién es el Co-Host responsable de cada profesional verificado
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Co-Hosts activos", value: cohostCount, icon: Shield, color: "text-cyan-400" },
            { label: "Profesionales total", value: totalWorkers, icon: Users, color: "text-blue-400" },
            { label: "Verificados", value: totalVerified, icon: ShieldCheck, color: "text-emerald-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color} shrink-0`} />
              <div>
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {(["all", "verified", "no_cohost"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                filter === f
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                  : "bg-white/3 text-muted-foreground border-white/8 hover:bg-white/6"
              }`}
            >
              {f === "all" ? "Todos" : f === "verified" ? "KYC Aprobado" : "Sin Co-Host"}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">No hay datos para mostrar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((group, i) => (
              <TeamCard key={group.cohost?.id ?? `none-${i}`} group={group} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
