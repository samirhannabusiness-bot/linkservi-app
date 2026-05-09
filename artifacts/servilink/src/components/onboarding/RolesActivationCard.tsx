import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Briefcase, Car, Store, Users, CheckCircle2, ArrowRight, Loader2, X, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { WorkerActivationModal } from "@/components/ui/WorkerActivationModal";

// ─────────────────────────────────────────────────────────────────────────────
// RolesActivationCard
//
// Tarjeta única que centraliza la activación de roles secundarios dentro de la
// MISMA cuenta. El usuario se registra UNA vez; aquí puede:
//   • Profesional → modal de creación de perfil (existente)
//   • Conductor   → activación inmediata + invitación a subir documentos
//   • Tienda      → activa rol seller y lleva al builder de tiendas existente
//   • Gestor      → solo por invitación (rol informativo, sin CTA)
//
// Cada fila muestra "Activo" si el usuario ya tiene el rol, o un CTA en caso
// contrario. Las activaciones llaman a /api/profile/activate-* y luego
// invalidan la query de /me para refrescar `roles[]` en el cliente.
// ─────────────────────────────────────────────────────────────────────────────

type AnyUser = {
  role?: string;
  secondaryRole?: string | null;
  roles?: string[];
};

function hasRole(u: AnyUser | null | undefined, role: string): boolean {
  if (!u) return false;
  if (u.role === role) return true;
  if (u.secondaryRole === role) return true;
  if (Array.isArray(u.roles) && u.roles.includes(role)) return true;
  return false;
}

function isCohostLike(u: AnyUser | null | undefined): boolean {
  return hasRole(u, "cohost") || hasRole(u, "seller");
}

interface Props {
  // Opcional: ocultar las filas que ya están activas (modo dashboard).
  hideActive?: boolean;
  className?: string;
}

export function RolesActivationCard({ hideActive = false, className = "" }: Props) {
  const { user, token, setAuth } = useAuth() as any;
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [showDriverConfirm, setShowDriverConfirm] = useState(false);
  const [activating, setActivating] = useState<null | "driver" | "seller">(null);
  const [error, setError] = useState("");

  const isWorker = hasRole(user, "worker");
  const isDriver = hasRole(user, "driver");
  const isSeller = isCohostLike(user);
  const isManager = hasRole(user, "gestor");

  async function activate(endpoint: string, kind: "driver" | "seller"): Promise<any> {
    setActivating(kind);
    setError("");
    try {
      const res: any = await apiFetch(endpoint, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: "{}",
      });
      if (res?.user && token) setAuth(res.user, token);
      await qc.invalidateQueries({ queryKey: ["getMe"] });
      return res;
    } catch (err: any) {
      setError(err?.data?.error ?? "No se pudo activar. Intenta de nuevo.");
      throw err;
    } finally {
      setActivating(null);
    }
  }

  async function handleDriverActivate() {
    try {
      await activate("/api/profile/activate-driver-mode", "driver");
      setShowDriverConfirm(false);
      // Tras activar el rol, llevamos al formulario de datos del vehículo.
      // El panel /driver/transport está bloqueado hasta que el perfil exista.
      navigate("/driver/transport/setup");
    } catch {
      // error ya seteado
    }
  }

  async function handleSellerActivate() {
    try {
      await activate("/api/profile/activate-seller-mode", "seller");
      navigate("/cohost/stores");
    } catch {
      // error ya seteado
    }
  }

  // ── Filas (cada una con su lógica de visibilidad) ─────────────────────────
  type RowProps = {
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    title: string;
    subtitle: string;
    active: boolean;
    activeLabel?: string;
    cta?: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean };
    info?: string;
    testId: string;
  };

  const rows: RowProps[] = [
    {
      icon: Briefcase,
      iconBg: "bg-emerald-400/15",
      iconColor: "text-emerald-400",
      title: "Profesional",
      subtitle: "Gana dinero ofreciendo tus servicios y recibe clientes todos los días",
      active: isWorker,
      cta: { label: "Empezar ahora", onClick: () => setShowWorkerModal(true) },
      testId: "row-worker",
    },
    {
      icon: Car,
      iconBg: "bg-sky-400/15",
      iconColor: "text-sky-400",
      title: "Conductor",
      subtitle: "Gana dinero con cada viaje y trabaja a tu ritmo",
      active: isDriver,
      cta: {
        label: "Empezar ahora",
        onClick: () => setShowDriverConfirm(true),
        loading: activating === "driver",
      },
      testId: "row-driver",
    },
    {
      icon: Store,
      iconBg: "bg-amber-400/15",
      iconColor: "text-amber-400",
      title: "Tienda",
      subtitle: "Vende tus productos a miles de clientes sin complicaciones",
      active: isSeller,
      activeLabel: isSeller ? "Activo · Ir a mis tiendas" : undefined,
      cta: {
        label: "Empezar ahora",
        onClick: handleSellerActivate,
        loading: activating === "seller",
      },
      testId: "row-seller",
    },
    {
      icon: Users,
      iconBg: "bg-violet-400/15",
      iconColor: "text-violet-400",
      title: "Gestor",
      subtitle: "Gestiona negocios y gana dinero ayudando a otros a crecer",
      active: isManager,
      info: isManager ? undefined : "Solo por invitación",
      testId: "row-manager",
    },
  ];

  const visibleRows = hideActive ? rows.filter(r => !r.active || r.activeLabel) : rows;
  if (visibleRows.length === 0) return null;

  return (
    <>
      <div
        className={`p-5 bg-card border border-border rounded-xl ${className}`}
        data-testid="roles-activation-card"
      >
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Activa más roles en tu cuenta</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Una sola cuenta, múltiples roles. Activa los que necesites sin volver a registrarte.
        </p>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {visibleRows.map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.testId}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                data-testid={row.testId}
              >
                <div className={`w-10 h-10 rounded-xl ${row.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${row.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{row.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.subtitle}</p>
                </div>
                <div className="flex-shrink-0">
                  {row.active ? (
                    row.title === "Tienda" ? (
                      <button
                        type="button"
                        onClick={() => navigate("/cohost/stores")}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25 transition-colors flex items-center gap-1"
                        data-testid={`${row.testId}-active-cta`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                      </button>
                    ) : (
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-400/15 text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                      </span>
                    )
                  ) : row.cta ? (
                    <button
                      type="button"
                      onClick={row.cta.onClick}
                      disabled={row.cta.loading || row.cta.disabled}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
                      data-testid={`${row.testId}-cta`}
                    >
                      {row.cta.loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>{row.cta.label} <ArrowRight className="w-3 h-3" /></>
                      )}
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-white/[0.04] text-muted-foreground">
                      {row.info ?? ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Worker activation: reuse existing modal */}
      {showWorkerModal && (
        <WorkerActivationModal
          onClose={() => setShowWorkerModal(false)}
          onSuccess={() => {
            setShowWorkerModal(false);
            qc.invalidateQueries({ queryKey: ["getMe"] });
            navigate("/professional");
          }}
        />
      )}

      {/* Driver confirm modal: liviano, sin formulario, KYC se maneja aparte */}
      {showDriverConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => activating !== "driver" && setShowDriverConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-card rounded-3xl p-6 relative border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => activating !== "driver" && setShowDriverConfirm(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-400/15 flex items-center justify-center">
                <Car className="w-6 h-6 text-sky-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Activar modo Conductor</h3>
                <p className="text-xs text-muted-foreground">Empieza a aceptar viajes en LinkServi</p>
              </div>
            </div>
            <ul className="space-y-2 mb-5 text-sm text-muted-foreground">
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" /> Activamos tu modo conductor al instante.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" /> Para recibir viajes deberás subir licencia, cédula y RCV en Verificación.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" /> Puedes alternar entre cliente y conductor cuando quieras.</li>
            </ul>
            {error && (
              <p className="text-xs text-red-400 mb-3" data-testid="driver-activation-error">{error}</p>
            )}
            <button
              type="button"
              onClick={handleDriverActivate}
              disabled={activating === "driver"}
              className="w-full py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-400 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="driver-activation-confirm"
            >
              {activating === "driver" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Activando...</>
              ) : (
                <>Activar y empezar <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
