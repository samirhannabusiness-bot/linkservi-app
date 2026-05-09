import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase, Store as StoreIcon, ShoppingBag, MessageCircle, Package,
  Percent, ChevronRight, Loader2, AlertCircle, Wrench,
  TrendingUp, DollarSign, Coins, PartyPopper, Sparkles, Info,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { useSeo } from "@/lib/seo-helpers";
import { RoleWelcomeModal } from "@/components/onboarding/RoleWelcomeModal";

interface ManagedBusiness {
  managerId: number;
  storeId: number;
  storeName: string;
  storeLogoUrl: string | null;
  ownerName: string;
  permissions: { canChat: boolean; canManageOrders: boolean; canManageProducts: boolean; canManageServices: boolean };
  commissionPercentage: number;
  createdAt: string;
}

interface PerBusinessMetric {
  storeId: number;
  storeName: string;
  commissionPercentage: number;
  since: string;
  salesCount: number;
  revenueUsd: number;
  commissionUsd: number;
  firstSaleAt: string | null;
}

interface ManagerSummary {
  businessesCount: number;
  totalSalesCount: number;
  totalRevenueUsd: number;
  totalCommissionUsd: number;
  perBusiness: PerBusinessMetric[];
  firstSale: { storeName: string; commissionUsd: number; date: string } | null;
  showFirstSaleCelebration: boolean;
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "16px",
};

const fmtUsd = (n: number) =>
  n.toLocaleString("es-VE", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ManagerDashboard() {
  useSeo({ title: "Modo Gestor — LinkServi", noIndex: true });
  const { user, isManager, setAppMode } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const qc = useQueryClient();

  // Force the appMode to "manager" so the ModeSwitch reflects state when the
  // user lands here directly (e.g. via the email link after accepting).
  useEffect(() => {
    if (isManager) setAppMode("manager");
  }, [isManager, setAppMode]);

  const { data, isLoading, error } = useQuery<ManagedBusiness[]>({
    queryKey: ["my-managed-businesses"],
    queryFn: async () => {
      const r = await fetch("/api/managers/me/businesses", { headers: getAuthHeader() });
      if (!r.ok) throw new Error("No se pudieron cargar tus negocios");
      return r.json();
    },
    enabled: !!user,
  });

  const { data: summary } = useQuery<ManagerSummary>({
    queryKey: ["my-manager-summary"],
    queryFn: async () => {
      const r = await fetch("/api/managers/me/summary", { headers: getAuthHeader() });
      if (!r.ok) throw new Error("No se pudieron cargar las métricas");
      return r.json();
    },
    enabled: !!user,
    refetchInterval: 60_000, // every minute is plenty
  });

  // Auto-select first business
  useEffect(() => {
    if (!selectedStoreId && data && data.length > 0) {
      setSelectedStoreId(data[0].storeId);
    }
  }, [data, selectedStoreId]);

  const ackFirstSale = useMutation({
    mutationFn: async () => {
      await fetch("/api/managers/me/first-sale/acknowledge", {
        method: "POST",
        headers: getAuthHeader(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-manager-summary"] });
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div style={cardStyle} className="max-w-sm text-center">
          <p className="text-foreground mb-3">Inicia sesión para ver tus negocios.</p>
          <button
            onClick={() => setLocation("/login")}
            style={{
              background: "#38bdf8", color: "#0f172a", padding: "10px 20px",
              borderRadius: 12, fontWeight: 700, border: "none", cursor: "pointer",
            }}
          >Ir a iniciar sesión</button>
        </div>
      </div>
    );
  }

  const selected = data?.find(b => b.storeId === selectedStoreId);
  const selectedMetric = summary?.perBusiness.find(b => b.storeId === selectedStoreId);

  return (
    <div className="min-h-screen pb-24" style={{ background: "#040c1a" }}>
      <RoleWelcomeModal
        storageKey="sl_seen_manager_intro"
        title="Bienvenido al Modo Gestor"
        subtitle="Gestiona negocios y gana comisiones"
        bullets={[
          "Administra las tiendas que el dueño te haya asignado.",
          "Atiende chats con clientes, gestiona órdenes y productos.",
          "Cobras una comisión sobre las ventas que generen los negocios que gestionas.",
          "Tu desempeño se ve reflejado en tu panel y en notificaciones de cada venta.",
        ]}
        ctaLabel="Empezar a gestionar"
      />
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: "rgba(56,189,248,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Briefcase style={{ width: 22, height: 22, color: "#38bdf8" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground">Modo Gestor</h1>
            <p className="text-xs text-muted-foreground">
              Gestiona negocios y genera ingresos
            </p>
          </div>
          {/* ModeSwitch ya se renderiza globalmente en AppLayout (header). */}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: "#38bdf8" }} />
          </div>
        )}

        {error && (
          <div style={{ ...cardStyle, borderColor: "rgba(239,68,68,0.3)" }} className="flex items-center gap-2">
            <AlertCircle style={{ width: 18, height: 18, color: "#fca5a5" }} />
            <span className="text-sm" style={{ color: "#fecaca" }}>{(error as Error).message}</span>
          </div>
        )}

        {/* First-sale celebration banner — appears once, persists ack */}
        {summary?.showFirstSaleCelebration && summary.firstSale && (
          <FirstSaleBanner
            storeName={summary.firstSale.storeName}
            commissionUsd={summary.firstSale.commissionUsd}
            onAck={() => ackFirstSale.mutate()}
            isPending={ackFirstSale.isPending}
            data-testid="first-sale-banner"
          />
        )}

        {/* Metrics — only render when we have ≥1 business */}
        {data && data.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Mis métricas
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                icon={StoreIcon}
                label="Negocios"
                value={summary ? String(summary.businessesCount) : "—"}
                tone="cyan"
                testId="metric-businesses"
              />
              <MetricCard
                icon={ShoppingBag}
                label="Ventas"
                value={summary ? String(summary.totalSalesCount) : "—"}
                tone="violet"
                testId="metric-sales"
              />
              <MetricCard
                icon={TrendingUp}
                label="Generado al comercio"
                value={summary ? fmtUsd(summary.totalRevenueUsd) : "—"}
                tone="cyan"
                testId="metric-revenue"
              />
              <MetricCard
                icon={Coins}
                label="Comisión estimada"
                value={summary ? fmtUsd(summary.totalCommissionUsd) : "—"}
                tone="emerald"
                testId="metric-commission"
                infoTitle="LinkServi calcula esta comisión como referencia basada en las ventas generadas, pero no procesa pagos directos al gestor."
              />
            </div>
            <div
              className="px-1"
              data-testid="commission-disclaimer"
              style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(56,189,248,0.06)",
                border: "1px solid rgba(56,189,248,0.18)",
              }}
            >
              <Info style={{ width: 14, height: 14, marginTop: 2, color: "#7dd3fc", flexShrink: 0 }} />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Este monto es <strong className="text-foreground">informativo</strong>. El pago al gestor
                es acordado directamente con el cliente. Solo se cuentan ventas confirmadas desde que
                comenzaste a gestionar cada negocio.
              </p>
            </div>
          </div>
        )}

        {data && data.length === 0 && (
          <div style={{ ...cardStyle, textAlign: "center", padding: "40px 20px" }} data-testid="manager-empty">
            <Briefcase style={{ width: 40, height: 40, margin: "0 auto 12px", color: "#475569" }} />
            <h3 className="text-base font-semibold text-foreground mb-1">Aún no gestionas ningún negocio</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Cuando alguien te invite como gestor, sus negocios aparecerán aquí automáticamente.
            </p>
            <button
              onClick={() => { setAppMode("client"); setLocation("/"); }}
              style={{
                background: "rgba(255,255,255,0.06)", color: "#cbd5e1",
                padding: "10px 18px", borderRadius: 12, fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
              }}
            >Volver al modo cliente</button>
          </div>
        )}

        {/* Business selector */}
        {data && data.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Selecciona un negocio
            </h3>
            {data.map(b => {
              const m = summary?.perBusiness.find(p => p.storeId === b.storeId);
              return (
                <button
                  key={b.storeId}
                  onClick={() => setSelectedStoreId(b.storeId)}
                  style={{
                    ...cardStyle,
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor: selectedStoreId === b.storeId ? "#38bdf8" : "rgba(255,255,255,0.08)",
                    background: selectedStoreId === b.storeId ? "rgba(56,189,248,0.08)" : cardStyle.background,
                  }}
                  data-testid={`select-business-${b.storeId}`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={b.storeLogoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(b.storeName)}`}
                      alt=""
                      style={{ width: 44, height: 44, borderRadius: 12, background: "#1e293b" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{b.storeName}</div>
                      <div className="text-xs text-muted-foreground truncate">Dueño: {b.ownerName}</div>
                      <div className="flex flex-wrap gap-3 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#6ee7b7" }}>
                          <Percent style={{ width: 11, height: 11 }} /> {b.commissionPercentage.toFixed(2)}%
                        </span>
                        {m && m.salesCount > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground">
                              {m.salesCount} venta{m.salesCount === 1 ? "" : "s"}
                            </span>
                            <span className="text-xs" style={{ color: "#6ee7b7" }}>
                              {fmtUsd(m.commissionUsd)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight style={{
                      width: 18, height: 18,
                      color: selectedStoreId === b.storeId ? "#38bdf8" : "#475569",
                    }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected business actions */}
        {selected && (
          <div className="space-y-3">
            {selectedMetric && selectedMetric.salesCount > 0 && (
              <div style={{
                ...cardStyle,
                background: "rgba(16,185,129,0.06)",
                borderColor: "rgba(16,185,129,0.2)",
              }} data-testid="selected-business-metrics">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign style={{ width: 16, height: 16, color: "#6ee7b7" }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6ee7b7" }}>
                    Tu aporte a {selected.storeName}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-foreground">{selectedMetric.salesCount}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Ventas</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground">{fmtUsd(selectedMetric.revenueUsd)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Generado</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" style={{ color: "#6ee7b7" }}>{fmtUsd(selectedMetric.commissionUsd)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Comisión estimada</div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground italic mt-2 text-center">
                  Cifra informativa · El pago se acuerda con el cliente.
                </p>
              </div>
            )}

            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Acciones disponibles
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <ActionCard
                icon={ShoppingBag}
                label="Pedidos"
                desc="Aceptar y enviar"
                href={`/cohost/stores/${selected.storeId}?tab=orders`}
                enabled={selected.permissions.canManageOrders}
                disabledHint="Sin permiso"
                testId="action-orders"
              />
              <ActionCard
                icon={MessageCircle}
                label="Chat"
                desc="Próximamente"
                href={`/store-chat/${selected.storeId}`}
                enabled={false}
                disabledHint="Próximamente"
                testId="action-chat"
              />
              <ActionCard
                icon={Package}
                label="Productos"
                desc="Editar catálogo"
                href={`/cohost/stores/${selected.storeId}?tab=products`}
                enabled={selected.permissions.canManageProducts}
                disabledHint="Sin permiso"
                testId="action-products"
              />
              <ActionCard
                icon={Wrench}
                label="Servicios"
                desc="Próximamente"
                href={`/cohost/stores/${selected.storeId}?tab=services`}
                enabled={false}
                disabledHint="Próximamente"
                testId="action-services"
              />
            </div>

            <div style={cardStyle}>
              <div className="flex items-center gap-2">
                <StoreIcon style={{ width: 16, height: 16, color: "#94a3b8" }} />
                <span className="text-xs text-muted-foreground">Atajo</span>
              </div>
              <Link href={`/cohost/stores/${selected.storeId}`}>
                <a className="block mt-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                  Abrir panel completo del negocio →
                </a>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, label, value, tone, testId, infoTitle,
}: {
  icon: typeof Briefcase; label: string; value: string;
  tone: "cyan" | "emerald" | "violet"; testId: string;
  infoTitle?: string;
}) {
  const palette: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    cyan:    { bg: "rgba(56,189,248,0.10)",  fg: "#7dd3fc", border: "rgba(56,189,248,0.18)"  },
    emerald: { bg: "rgba(16,185,129,0.10)",  fg: "#6ee7b7", border: "rgba(16,185,129,0.18)"  },
    violet:  { bg: "rgba(168,85,247,0.10)",  fg: "#c4b5fd", border: "rgba(168,85,247,0.18)"  },
  };
  const c = palette[tone];
  return (
    <div
      style={{ ...cardStyle, padding: 14, borderColor: c.border, background: c.bg }}
      data-testid={testId}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <Icon style={{ width: 18, height: 18, color: c.fg }} />
        {infoTitle && (
          <span
            title={infoTitle}
            aria-label={infoTitle}
            data-testid={`${testId}-info`}
            style={{ display: "inline-flex", color: "#94a3b8", cursor: "help" }}
          >
            <Info style={{ width: 13, height: 13 }} />
          </span>
        )}
      </div>
      <div className="text-lg font-bold text-foreground leading-tight truncate">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ── First-sale celebration banner ────────────────────────────────────────────

function FirstSaleBanner({
  storeName, commissionUsd, onAck, isPending,
}: {
  storeName: string;
  commissionUsd: number;
  onAck: () => void;
  isPending: boolean;
} & { "data-testid"?: string }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(56,189,248,0.12))",
        border: "1px solid rgba(16,185,129,0.4)",
        borderRadius: 18,
        padding: 18,
        position: "relative",
        overflow: "hidden",
      }}
      data-testid="first-sale-banner"
    >
      <Sparkles
        style={{
          position: "absolute", top: -8, right: -8, width: 80, height: 80,
          color: "rgba(16,185,129,0.18)", transform: "rotate(15deg)",
        }}
      />
      <div className="flex items-start gap-3 relative">
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          background: "rgba(16,185,129,0.25)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <PartyPopper style={{ width: 22, height: 22, color: "#34d399" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-foreground">¡Tu primera venta como gestor!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-semibold text-foreground">{storeName}</span> registró su primera venta
            desde que la gestionas. Ya estás generando ingresos reales.
          </p>
          {commissionUsd > 0 && (
            <p className="text-sm mt-2" style={{ color: "#6ee7b7" }}>
              Comisión acumulada hasta ahora: <span className="font-bold">{fmtUsd(commissionUsd)}</span>
            </p>
          )}
          <button
            type="button"
            onClick={onAck}
            disabled={isPending}
            style={{
              marginTop: 12,
              background: "rgba(16,185,129,0.25)",
              color: "#a7f3d0",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: isPending ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
              opacity: isPending ? 0.6 : 1,
            }}
            data-testid="first-sale-ack-btn"
          >
            {isPending && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
            ¡Genial, entendido!
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Action card ──────────────────────────────────────────────────────────────

function ActionCard({
  icon: Icon, label, desc, href, enabled, disabledHint, testId,
}: {
  icon: typeof Briefcase; label: string; desc: string;
  href: string; enabled: boolean; disabledHint: string; testId: string;
}) {
  if (!enabled) {
    return (
      <div
        style={{
          ...cardStyle,
          opacity: 0.45, cursor: "not-allowed",
        }}
        data-testid={`${testId}-disabled`}
      >
        <Icon style={{ width: 20, height: 20, color: "#64748b", marginBottom: 8 }} />
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{disabledHint}</div>
      </div>
    );
  }
  return (
    <Link href={href}>
      <a style={cardStyle} className="block hover:bg-white/[0.06] transition-colors" data-testid={testId}>
        <Icon style={{ width: 20, height: 20, color: "#38bdf8", marginBottom: 8 }} />
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </a>
    </Link>
  );
}
