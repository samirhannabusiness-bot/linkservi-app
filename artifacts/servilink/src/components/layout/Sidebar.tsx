import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getModeMeta } from "@/lib/mode-meta";
import { LogoutButton } from "@/components/ui/LogoutDialog";
import {
  Home, Search, Calendar, User,
  BarChart3, Users, Shield, BookOpen, Zap, Menu, X, TrendingUp, Gift,
  ArrowDownToLine, Wallet, AlertOctagon, ShoppingBag, Briefcase, Package,
  Store, Star, Crown, UserCog, MessageCircle, DollarSign, ListOrdered, UserPlus, Truck, BadgeCheck, Car,
  ChevronDown, PanelLeftClose, PanelLeftOpen, Plug,
} from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { WorkerActivationModal } from "@/components/ui/WorkerActivationModal";
import { useSidebarCompact } from "@/contexts/SidebarContext";

// ── Custom tooltip for compact sidebar icons ──────────────────────────────────
function CompactTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), 80);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  return (
    <div className="relative w-full" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className="absolute left-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap pointer-events-none z-[60]"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            marginLeft: "10px",
            background: "rgba(10,18,35,0.96)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            animation: "sidebarTooltip 0.12s ease-out both",
          }}
          role="tooltip"
        >
          {label}
          {/* Arrow */}
          <div
            className="absolute right-full"
            style={{
              top: "50%",
              transform: "translateY(-50%)",
              borderTop: "5px solid transparent",
              borderBottom: "5px solid transparent",
              borderRight: "5px solid rgba(10,18,35,0.96)",
            }}
          />
        </div>
      )}
    </div>
  );
}

const clientLinks = [
  { href: "/client",            label: "Inicio",             icon: Home },
  { href: "/client/search",     label: "Buscar servicios",   icon: Search },
  { href: "/client/bookings",   label: "Mis Solicitudes",    icon: Calendar },
  { href: "/mensajes",          label: "Mensajería",         icon: MessageCircle },
  { href: "/client/payments",   label: "Pagos",              icon: TrendingUp },
  { href: "/store",             label: "ServiMarket",        icon: ShoppingBag },
  { href: "/client/product-orders", label: "Mis Compras",   icon: Package },
  { href: "/transport",         label: "Transporte",         icon: Car },
  { href: "/client/profile",    label: "Mi Perfil",          icon: User },
];

const managerLinks = [
  { href: "/manager",        label: "Panel Gestor", icon: BarChart3 },
  { href: "/mensajes",       label: "Mensajería",   icon: MessageCircle },
  { href: "/cohost/plan",    label: "Mi Plan",      icon: Crown },
  { href: "/client/profile", label: "Mi Perfil",    icon: User },
];

const cohostLinks = [
  { href: "/cohost", label: "Tu Red", icon: BarChart3 },
  { href: "/cohost/team", label: "Invitar profesionales", icon: UserPlus },
  { href: "/cohost/workers", label: "Administrar equipo", icon: Users },
  { href: "/cohost/bookings", label: "Solicitudes", icon: Calendar },
  { href: "/mensajes", label: "Mensajería", icon: MessageCircle },
  { href: "/cohost/stores", label: "Mis Tiendas", icon: Store },
  { href: "/cohost/products", label: "Mis Productos", icon: ShoppingBag },
  { href: "/cohost/orders", label: "Pedidos Tienda", icon: Package },
  { href: "/integrations", label: "Integraciones", icon: Plug },
  { href: "/cohost/earnings", label: "Gana comisiones", icon: DollarSign },
  { href: "/cohost/referral", label: "Invitar Vendedores ⭐", icon: Gift },
  { href: "/client/product-orders", label: "Mis Compras", icon: Package },
  { href: "/store", label: "ServiMarket", icon: ShoppingBag },
  { href: "/jobs", label: "Bolsa de Empleo", icon: Briefcase },
  { href: "/cohost/profile", label: "Mi Perfil", icon: User },
];

const sellerLinks = [
  { href: "/seller", label: "Panel Vendedor", icon: BarChart3 },
  { href: "/mensajes", label: "Mensajería", icon: MessageCircle },
  { href: "/cohost/stores", label: "Mis Tiendas", icon: Store },
  { href: "/cohost/products", label: "Mis Productos", icon: ShoppingBag },
  { href: "/cohost/orders", label: "Pedidos Tienda", icon: Package },
  { href: "/integrations", label: "Integraciones", icon: Plug },
  { href: "/cohost/earnings", label: "Ganancias", icon: DollarSign },
  { href: "/cohost/plan", label: "Mi Plan", icon: Crown },
  { href: "/cohost/referral", label: "Invitar Vendedores ⭐", icon: Gift },
  { href: "/client/product-orders", label: "Mis Compras", icon: Package },
  { href: "/store", label: "ServiMarket", icon: ShoppingBag },
  { href: "/jobs", label: "Bolsa de Empleo", icon: Briefcase },
  { href: "/cohost/profile", label: "Mi Perfil", icon: User },
];

// ── Profesional: SOLO servicios e ingresos. Las opciones de consumo (ServiMarket,
//    Mis Compras, Transporte) viven en el modo Cliente — el usuario las alcanza
//    cambiando de modo en el header. No mezclar.
const workerLinks = [
  { href: "/professional", label: "Panel", icon: BarChart3 },
  { href: "/professional/bookings", label: "Trabajos", icon: Calendar },
  { href: "/mensajes", label: "Mensajería", icon: MessageCircle },
  { href: "/professional/profile", label: "Mi Servicio", icon: Briefcase },
  { href: "/professional/urgencias", label: "Urgencias 🚨", icon: Zap },
  { href: "/professional/analytics", label: "Estadísticas", icon: TrendingUp },
  { href: "/professional/comprobantes", label: "Comprobantes", icon: BookOpen },
  { href: "/professional/withdrawals", label: "Mis Retiros", icon: ArrowDownToLine },
  { href: "/professional/verification", label: "Verificación", icon: Shield },
  { href: "/jobs?tab=mine", label: "Mi Hoja de Vida", icon: Briefcase },
];

const workerSections = [
  {
    label: "Principal",
    links: [
      { href: "/professional", label: "Panel", icon: BarChart3, tooltip: "Resumen de tu actividad" },
      { href: "/professional/bookings", label: "Trabajos", icon: Calendar, tooltip: "Aquí llegan tus oportunidades de trabajo" },
      { href: "/mensajes", label: "Mensajería", icon: MessageCircle, tooltip: "Responde rápido y gana más clientes" },
    ],
  },
  {
    label: "Tu Negocio",
    links: [
      { href: "/professional/profile", label: "Mi perfil de servicio", icon: Briefcase, tooltip: "Configura lo que ofreces a los clientes" },
      { href: "/professional/analytics", label: "Mi rendimiento", icon: TrendingUp, tooltip: "Revisa tu actividad y resultados" },
      { href: "/professional/urgencias", label: "Trabajos urgentes", icon: Zap, tooltip: "Solicitudes rápidas disponibles" },
    ],
  },
  {
    label: "Dinero",
    links: [
      { href: "/professional/withdrawals", label: "Retirar dinero", icon: ArrowDownToLine, tooltip: "Cobra lo que ya ganaste" },
      { href: "/professional/comprobantes", label: "Pagos recibidos", icon: BookOpen, tooltip: "Historial de ingresos" },
    ],
  },
  {
    label: "Crecimiento",
    links: [
      { href: "/professional/premium", label: "Ir a Premium", icon: Crown, tooltip: "Destaca tu perfil y recibe más contactos" },
      { href: "/jobs?tab=mine", label: "Mi perfil profesional", icon: Briefcase, tooltip: "Así te ven y eligen los clientes" },
      { href: "/professional/verification", label: "Verificar cuenta", icon: Shield, tooltip: "Aumenta la confianza en tu perfil" },
    ],
  },
  // ── Sin sección "Extras" con opciones de consumo: Tienda y Mis Compras viven
  //    en el modo Cliente. Separación total entre modos.
];

type AdminLink = { href: string; label: string; icon: React.ElementType; roles: string[] | null; urgent?: "kyc" | "withdrawals" | "disputes" };
type AdminSection = { label: string; links: AdminLink[] };

const allAdminSections: AdminSection[] = [
  {
    label: "CORE",
    links: [
      { href: "/admin",           label: "Dashboard", icon: BarChart3,  roles: null },
      { href: "/admin/analytics", label: "Analytics", icon: TrendingUp, roles: ["super_admin", "marketing", "soporte", "finanzas"] },
    ],
  },
  {
    label: "OPERACIONES",
    links: [
      { href: "/admin/bookings",       label: "Solicitudes",    icon: BookOpen,    roles: ["super_admin", "soporte"] },
      { href: "/admin/product-orders", label: "Pedidos Tienda", icon: ShoppingBag, roles: ["super_admin", "finanzas"] },
      { href: "/admin/rentals",        label: "Alquileres",     icon: Package,     roles: ["super_admin", "finanzas", "soporte"] },
      { href: "/driver/delivery",      label: "Delivery Panel", icon: Truck,       roles: ["super_admin"] },
    ],
  },
  {
    label: "USUARIOS",
    links: [
      { href: "/admin/users",          label: "Usuarios",        icon: Users,     roles: ["super_admin", "soporte"] },
      { href: "/admin/workers",        label: "Profesionales",    icon: Briefcase, roles: ["super_admin", "soporte"] },
      { href: "/admin/cohost-teams",   label: "Equipos Co-Host", icon: UserPlus,  roles: ["super_admin", "soporte"] },
      { href: "/admin/verificaciones", label: "Cola KYC",        icon: Shield,    roles: ["super_admin", "soporte"], urgent: "kyc" },
    ],
  },
  {
    label: "FINANZAS",
    links: [
      { href: "/admin/withdrawals", label: "Retiros",   icon: Wallet,       roles: ["super_admin", "finanzas"], urgent: "withdrawals" },
      { href: "/admin/warranties",  label: "Garantías", icon: Shield,       roles: ["super_admin", "soporte"] },
      { href: "/admin/disputes",    label: "Disputas",  icon: AlertOctagon, roles: ["super_admin", "soporte"],  urgent: "disputes" },
    ],
  },
  {
    label: "MARKETPLACE",
    links: [
      { href: "/admin/stores",          label: "Tiendas",           icon: Store,    roles: ["super_admin", "finanzas"] },
      { href: "/admin/product-premium", label: "Destacados Tienda", icon: Crown,    roles: ["super_admin", "marketing"] },
      { href: "/admin/client-premium",  label: "Premium Clientes",  icon: Crown,    roles: ["super_admin", "finanzas"] },
      { href: "/admin/premium-requests", label: "Solicitudes Premium", icon: Crown, roles: ["super_admin", "marketing"] },
    ],
  },
  {
    label: "CRECIMIENTO",
    links: [
      { href: "/admin/cohost-plans",       label: "Planes Co-host",      icon: Crown,     roles: ["super_admin", "finanzas"] },
      { href: "/admin/jobs/subscriptions", label: "Suscripciones Empleo", icon: Briefcase, roles: ["super_admin", "marketing", "finanzas"] },
      { href: "/admin/email-campaigns",    label: "Email Campañas",       icon: Star,      roles: ["super_admin", "marketing"] },
    ],
  },
  {
    label: "SISTEMA",
    links: [
      { href: "/admin/ratings",       label: "Calificaciones", icon: Star,    roles: ["super_admin", "soporte"] },
      { href: "/admin/collaborators", label: "Equipo Admin",   icon: UserCog, roles: ["super_admin"] },
      { href: "/admin/action-logs",   label: "Auditoría",      icon: Shield,  roles: ["super_admin"] },
    ],
  },
];

// flat list kept for primaryLinks compatibility (admin role)
const allAdminLinks = allAdminSections.flatMap(s => s.links);

const ADMIN_ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  soporte:     "Soporte",
  finanzas:    "Finanzas",
  marketing:   "Marketing",
};

const ROLE_LABELS: Record<string, string> = {
  worker: "Profesional",
  seller: "Vendedor",
  cohost: "Host",
  admin:  "Admin",
  client: "Cliente",
};

// ── Hook: admin urgency badge counts ──────────────────────────────────────────
function useAdminUrgency(enabled: boolean) {
  const [counts, setCounts] = useState({ kyc: 0, withdrawals: 0, disputes: 0 });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem("sl_token");
        if (!token) return;
        const r = await fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (!cancelled) setCounts({
          kyc:         d.pendingVerifications ?? 0,
          withdrawals: d.pendingWithdrawals   ?? 0,
          disputes:    d.openDisputes         ?? 0,
        });
      } catch { /* silent */ }
    };
    load();
  }, [enabled]);
  return counts;
}

// ── Hook: collapsible admin sections (state persisted in localStorage) ─────────
const ADMIN_COLLAPSED_KEY = "sl_admin_sidebar_collapsed";

function useAdminCollapsed() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(ADMIN_COLLAPSED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const toggleSection = useCallback((label: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(ADMIN_COLLAPSED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Force-open a section (for auto-expand on alert) — does NOT write to localStorage
  // so the user's manual preference is still respected on next reload.
  const expandSection = useCallback((label: string) => {
    setCollapsed(prev => {
      if (!prev[label]) return prev; // already open — no-op
      return { ...prev, [label]: false };
    });
  }, []);

  // Returns `true` when the section should be open/expanded
  return { collapsed, toggleSection, expandSection };
}

// ── Subtle UI click sound via Web Audio API ───────────────────────────────────
function playClickSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 780;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => { ctx.close(); };
  } catch { /* AudioContext blocked or unavailable — silent fallback */ }
}

// ── Hook: differentiated booking counts for a worker ─────────────────────────
function useWorkerPendingCount(enabled: boolean) {
  const [counts, setCounts] = useState({ pending: 0, inProgress: 0, hasAny: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem("sl_token");
        if (!token) return;
        const r = await fetch("/api/bookings?role=worker", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok || cancelled) return;
        const list: { status: string }[] = await r.json();
        const pending    = list.filter(b => b.status === "pending").length;
        const inProgress = list.filter(b =>
          b.status === "accepted" || b.status === "payment_pending"
        ).length;
        if (!cancelled) setCounts({ pending, inProgress, hasAny: list.length > 0 });
      } catch { /* silent */ }
    };
    load();
    return () => { cancelled = true; };
  }, [enabled]);
  return counts;
}

export function Sidebar() {
  const { user, token, setAuth, activeMode, setActiveMode, hasDualRole, appMode, isManager, isWorker, isDriver } = useAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unread = useUnreadMessages();
  const { compact, toggleCompact } = useSidebarCompact();

  // Effective compact: true only when compact AND not temporarily hover-expanded
  const effectiveCompact = compact && !hoverExpanded;

  const handleSidebarMouseEnter = () => {
    if (!compact) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverExpanded(true), 80);
  };

  const handleSidebarMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverExpanded(false);
  };

  const effectiveAdminRole = user?.role === "admin" ? (user.adminRole ?? "super_admin") : null;
  const adminLinks = allAdminLinks.filter(({ roles }) =>
    roles === null || (effectiveAdminRole && roles.includes(effectiveAdminRole))
  );
  const filteredAdminSections = allAdminSections.map(sec => ({
    ...sec,
    links: sec.links.filter(({ roles }) =>
      roles === null || (effectiveAdminRole && roles.includes(effectiveAdminRole))
    ),
  })).filter(sec => sec.links.length > 0);

  const isSecondaryMode = activeMode === "secondary" && hasDualRole;
  const isManagerNav = appMode === "manager" && isManager;
  const isDriverNav = appMode === "driver" && isDriver;

  // ── Effective mode for the visual indicator ────────────────────────────────
  // When showing manager / driver nav we always render that mode. Otherwise we
  // map the currently-active role (primary/secondary) to a mode the indicator
  // knows about: client / worker. Other internal roles (admin, cohost, seller)
  // fall back to the role label rendered by the user card and skip the indicator.
  const effectiveModeForIndicator: "client" | "worker" | "manager" | "driver" | null = (() => {
    if (isManagerNav) return "manager";
    if (isDriverNav) return "driver";
    const activeRole = isSecondaryMode
      ? user?.secondaryRole
      : user?.role;
    if (activeRole === "client") return "client";
    if (activeRole === "worker") return "worker";
    return null;
  })();
  const showModeIndicator = effectiveModeForIndicator !== null && (isWorker || isManager || isDriver);

  const primaryHome = user?.role === "admin" ? "/admin"
    : user?.role === "worker" ? "/professional"
    : user?.role === "cohost" ? "/cohost"
    : user?.role === "seller" ? "/seller"
    : "/client";

  const secondaryHome = user?.secondaryRole === "worker" ? "/professional"
    : user?.secondaryRole === "client" ? "/client"
    : user?.role === "client" ? "/professional"
    : "/client";

  const primaryLinks = (() => {
    if (user?.role === "admin") return adminLinks;
    if (user?.role === "cohost") return cohostLinks;
    if (user?.role === "seller") return sellerLinks;
    if (user?.role === "worker") return workerLinks;
    return clientLinks;
  })();

  const secondaryLinks = (() => {
    if (user?.secondaryRole === "worker") return workerLinks;
    if (user?.secondaryRole === "client") return clientLinks;
    return primaryLinks;
  })();

  const links = isManagerNav ? managerLinks : (isSecondaryMode ? secondaryLinks : primaryLinks);
  const isWorkerNav = links === workerLinks;
  const isAdminNav  = user?.role === "admin" && !isSecondaryMode && !isManagerNav;
  const { pending: pendingJobs, inProgress: inProgressJobs, hasAny: hasEverHadJobs } = useWorkerPendingCount(isWorkerNav);
  const totalActive = pendingJobs + inProgressJobs;
  const urgency = useAdminUrgency(isAdminNav);
  const { collapsed: adminCollapsed, toggleSection, expandSection } = useAdminCollapsed();

  // ── Auto-expand sections when a new critical alert arrives ───────────────────
  // Uses a ref to compare previous vs. current urgency without adding to deps.
  const prevUrgencyRef = React.useRef({ kyc: 0, withdrawals: 0, disputes: 0 });
  const isFirstRenderRef = React.useRef(true);

  React.useEffect(() => {
    if (!isAdminNav) return;
    // Skip the very first render — we don't want to override manual collapse state
    // on page load, only when a new alert genuinely arrives.
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevUrgencyRef.current = { ...urgency };
      return;
    }

    const prev = prevUrgencyRef.current;
    const urgentKeys: (keyof typeof urgency)[] = ["kyc", "withdrawals", "disputes"];

    urgentKeys.forEach(key => {
      const increased = urgency[key] > prev[key];
      if (!increased) return;
      // Find the section(s) that contain a link with this urgency key
      filteredAdminSections.forEach(section => {
        const hasKey = section.links.some(l => l.urgent === key);
        if (hasKey) expandSection(section.label);
      });
    });

    prevUrgencyRef.current = { ...urgency };
  }, [urgency, isAdminNav, filteredAdminSections, expandSection]);

  // ── Micro-interaction: hover + click states for section header buttons ───────
  const [hoveredSection, setHoveredSection] = React.useState<string | null>(null);
  const [pressedSection, setPressedSection] = React.useState<string | null>(null);

  // ── Micro-interaction: hover state for admin nav links ────────────────────────
  const [hoveredLink, setHoveredLink] = React.useState<string | null>(null);

  // Dynamic priority: sections with urgent items bubble up (CORE always first)
  const sortedAdminSections = useMemo(() => {
    const core    = filteredAdminSections.filter(s => s.label === "CORE");
    const urgent  = filteredAdminSections.filter(s =>
      s.label !== "CORE" && s.links.some(l => l.urgent && urgency[l.urgent] > 0)
    );
    const normal  = filteredAdminSections.filter(s =>
      s.label !== "CORE" && !s.links.some(l => l.urgent && urgency[l.urgent] > 0)
    );
    return [...core, ...urgent, ...normal];
  }, [filteredAdminSections, urgency]);

  const primaryRoleLabel = (() => {
    if (user?.role === "admin") return ADMIN_ROLE_LABELS[effectiveAdminRole ?? "super_admin"] ?? "Admin";
    return ROLE_LABELS[user?.role ?? "client"] ?? "Cliente";
  })();

  // Secondary label: use activated role or show what they'd get
  const secondaryRoleLabel = hasDualRole
    ? (ROLE_LABELS[user?.secondaryRole ?? ""] ?? "Cliente")
    : user?.role === "client" ? "Profesional" : "Cliente";

  const roleColor = (() => {
    const activeRole = isSecondaryMode ? (user?.secondaryRole ?? (user?.role === "client" ? "worker" : "client")) : user?.role;
    if (activeRole === "admin") return "from-amber-400 to-orange-500";
    if (activeRole === "cohost") return "from-violet-400 to-purple-500";
    if (activeRole === "seller") return "from-emerald-400 to-green-500";
    if (activeRole === "worker") return "from-emerald-400 to-teal-500";
    return "from-cyan-400 to-blue-500";
  })();

  const activeLabelBadge = isSecondaryMode ? secondaryRoleLabel : primaryRoleLabel;

  function handleWorkerActivated() {
    if (!token || !user) return;
    setShowWorkerModal(false);
    setAuth({ ...user, secondaryRole: "worker" }, token);
    setActiveMode("secondary");
    navigate("/professional");
  }

  // ── Guest fallback — no user session ──────────────────────────────────────
  if (!user && !token) {
    return (
      <>
        {/* Mobile hamburger */}
        <button
          className="fixed top-4 left-4 z-50 md:hidden w-10 h-10 flex items-center justify-center rounded-2xl glass border border-white/10"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Menú"
        >
          <span className="sr-only">Menú</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            {mobileOpen ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>}
          </svg>
        </button>
        {mobileOpen && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 md:hidden" onClick={() => setMobileOpen(false)} />}
        {[
          "fixed inset-y-0 left-0 z-40 w-64 glass-sidebar hidden md:flex flex-col",
          `fixed inset-y-0 left-0 z-40 w-64 glass-sidebar flex flex-col md:hidden transition-transform duration-300 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`,
        ].map((cls, i) => (
          <aside key={i} className={cls}>
            <nav className="flex flex-col h-full">
              <div className="flex items-center px-6 py-5 border-b border-white/[0.06]">
                <img src="/logo.png" alt="LinkServi" className="h-8 w-auto object-contain" />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
                <p className="text-sm text-white/40 text-center">Inicia sesión para acceder a todas las funciones</p>
                <a href="/login" className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl btn-gradient text-white text-sm font-bold">
                  Iniciar sesión
                </a>
                <a href="/register" className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold text-white/70 hover:text-white transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Crear cuenta gratis
                </a>
              </div>
            </nav>
          </aside>
        ))}
      </>
    );
  }

  const nav = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center px-6 py-5 border-b border-white/[0.06]">
        <img src="/logo.png" alt="LinkServi" className="h-8 w-auto object-contain" />
      </div>

      {/* User card */}
      <div className="px-4 pt-4 pb-2">
        <div className="glass rounded-2xl p-3 flex items-center gap-3">
          <div className="relative flex-shrink-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover shadow-lg ring-2 ring-white/10"
              />
            ) : (
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${roleColor} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-sidebar" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
              {user?.clientPlan === "premium" && user?.clientPremiumUntil && new Date(user.clientPremiumUntil) > new Date() && (
                <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold text-amber-900 bg-gradient-to-r from-amber-300 to-yellow-400">
                  <Crown className="w-2.5 h-2.5" />
                  PRO
                </span>
              )}
            </div>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium text-white bg-gradient-to-r ${roleColor} opacity-90`}>
              {activeLabelBadge}
            </span>
          </div>
        </div>

        {/* Activate Profesional CTA — only for plain clients (no worker role yet) */}
        {user?.role === "client" && !user?.secondaryRole && (
          <button
            onClick={() => setShowWorkerModal(true)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded-xl font-medium text-white/60 hover:text-white transition-all duration-200 glass"
          >
            <BadgeCheck className="w-3 h-3" />
            Activar modo Profesional
          </button>
        )}

        {/* Dual-role pill switcher — only when the header ModeSwitch is hidden.
            ModeSwitch shows for isWorker || isManager; cohost/seller with a
            client secondary role get this fallback so they can still toggle. */}
        {hasDualRole && !isWorker && !isManager && user?.role !== "admin" && (
          <div className="mt-2 flex gap-1.5 p-1 glass rounded-xl">
            <button
              onClick={() => { setActiveMode("primary"); navigate(primaryHome); setMobileOpen(false); }}
              className={cn(
                "flex-1 text-xs py-1.5 px-2 rounded-lg font-medium transition-all duration-200",
                !isSecondaryMode
                  ? "btn-gradient text-white shadow"
                  : "text-white/40 hover:text-white/70"
              )}
            >
              {primaryRoleLabel}
            </button>
            <button
              onClick={() => { setActiveMode("secondary"); navigate(secondaryHome); setMobileOpen(false); }}
              className={cn(
                "flex-1 text-xs py-1.5 px-2 rounded-lg font-medium transition-all duration-200",
                isSecondaryMode
                  ? "btn-gradient text-white shadow"
                  : "text-white/40 hover:text-white/70"
              )}
            >
              {secondaryRoleLabel}
            </button>
          </div>
        )}
      </div>

      {/* Indicador de modo activo eliminado: el ModeSwitch del header ya muestra
          cuál es el modo activo. Mantenerlo aquí causaba duplicación visual. */}

      {/* Nav links — fade suave al cambiar de modo */}
      <div className="flex-1 px-4 py-2 overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${effectiveModeForIndicator ?? "default"}-${isAdminNav ? "admin" : isWorkerNav ? "worker" : "flat"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
        {isAdminNav ? (
          <div className="py-1">
            {sortedAdminSections.map((section, sIdx) => {
              const open = !adminCollapsed[section.label];
              const sectionHasUrgency = section.links.some(l => l.urgent && urgency[l.urgent] > 0);
              const sectionIsActive = section.links.some(l => location === l.href);
              const totalBadge = section.links.reduce((sum, l) => sum + (l.urgent ? urgency[l.urgent] : 0), 0);

              const isHovered = hoveredSection === section.label;
              const isPressed = pressedSection === section.label;

              return (
                <div key={section.label} className={sIdx > 0 ? "mt-1" : ""}>
                  {/* ── Section header — clickable ── */}
                  <button
                    onClick={() => {
                      toggleSection(section.label);
                      playClickSound();
                      setPressedSection(section.label);
                      setTimeout(() => setPressedSection(p => p === section.label ? null : p), 180);
                    }}
                    onMouseEnter={() => setHoveredSection(section.label)}
                    onMouseLeave={() => setHoveredSection(null)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg"
                    style={{
                      background: isHovered
                        ? sectionIsActive
                          ? "rgba(6,182,212,0.10)"
                          : sectionHasUrgency
                            ? "rgba(251,191,36,0.07)"
                            : "rgba(255,255,255,0.04)"
                        : sectionIsActive
                          ? "rgba(6,182,212,0.06)"
                          : "transparent",
                      transform: isPressed ? "scale(1.012)" : "scale(1)",
                      transition: "background 0.15s ease-in-out, transform 0.12s cubic-bezier(0.34,1.56,0.64,1)",
                    }}
                  >
                    <span
                      className="flex-1 text-[9px] font-bold uppercase tracking-widest text-left"
                      style={{
                        color: sectionHasUrgency
                          ? isHovered ? "rgba(251,191,36,0.95)" : "rgba(251,191,36,0.7)"
                          : sectionIsActive
                            ? isHovered ? "rgba(6,182,212,0.95)" : "rgba(6,182,212,0.7)"
                            : isHovered ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)",
                        transition: "color 0.15s ease-in-out",
                      }}
                    >
                      {section.label}
                    </span>

                    {/* Total urgency badge on collapsed section */}
                    {!open && totalBadge > 0 && (
                      <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
                      >
                        {totalBadge > 9 ? "9+" : totalBadge}
                      </span>
                    )}

                    <ChevronDown
                      className="w-3 h-3 flex-shrink-0"
                      style={{
                        color: isHovered ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)",
                        transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.2s ease-in-out, color 0.15s ease-in-out",
                      }}
                    />
                  </button>

                  {/* ── Content — conditionally rendered so aria tree stays clean ── */}
                  {open && (
                    <div className="space-y-0.5 pb-1" style={{ animation: "adminSecOpen 0.18s ease-out both" }}>
                      {section.links.map(({ href, label, icon: Icon, urgent }) => {
                        const active = location === href;
                        const badgeCount = urgent ? urgency[urgent] : 0;
                        const isRed  = (urgent === "kyc" || urgent === "disputes") && badgeCount > 0;
                        const isBlue = urgent === "withdrawals" && badgeCount > 0;
                        const badgeStyle: React.CSSProperties = isRed
                          ? { background: "rgba(239,68,68,0.18)", color: "#f87171", border: "1px solid rgba(239,68,68,0.35)" }
                          : isBlue
                            ? { background: "rgba(59,130,246,0.18)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }
                            : {};

                        const isLinkHovered = hoveredLink === href;

                        return (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setMobileOpen(false)}
                            onMouseEnter={() => setHoveredLink(href)}
                            onMouseLeave={() => setHoveredLink(null)}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium"
                            style={active ? {
                              background: "rgba(6,182,212,0.1)",
                              color: "#e0f7ff",
                              boxShadow: "inset 2px 0 0 rgba(6,182,212,0.75)",
                              transition: "background 0.15s ease-in-out, box-shadow 0.15s ease-in-out",
                            } : {
                              color: isLinkHovered ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.48)",
                              background: isLinkHovered
                                ? (isRed
                                    ? "rgba(239,68,68,0.06)"
                                    : isBlue
                                      ? "rgba(59,130,246,0.06)"
                                      : "rgba(255,255,255,0.04)")
                                : "transparent",
                              transition: "color 0.15s ease-in-out, background 0.15s ease-in-out",
                            }}
                          >
                            <Icon
                              className="w-3.5 h-3.5 flex-shrink-0"
                              style={{
                                color: active ? "#67e8f9" : isLinkHovered ? "rgba(255,255,255,0.75)" : undefined,
                                transform: isLinkHovered && !active ? "scale(1.12)" : "scale(1)",
                                transition: "transform 0.15s ease-in-out, color 0.15s ease-in-out",
                              }}
                            />
                            <span className="flex-1 truncate" style={{ color: active ? "#e0f7ff" : undefined }}>
                              {label}
                            </span>
                            {badgeCount > 0 && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0" style={badgeStyle}>
                                {badgeCount > 9 ? "9+" : badgeCount}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : isWorkerNav ? (
          workerSections.map((section, sIdx) => (
            <div key={section.label}>
              {sIdx > 0 && (
                <div className="mx-3 my-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
              )}
              <p className="text-[9px] font-bold uppercase tracking-widest px-3 pt-2 pb-1"
                style={{ color: "rgba(255,255,255,0.2)" }}>
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.links.map(({ href, label, icon: Icon, tooltip }) => {
                  const active = location === href;
                  const isPrimary = href === "/professional/bookings";
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={
                        isPrimary && !hasEverHadJobs
                          ? "Aquí aparecerán tus primeros trabajos"
                          : tooltip
                      }
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                        isPrimary && "active:scale-95",
                        active
                          ? "btn-gradient text-white shadow-lg"
                          : isPrimary
                            ? "text-emerald-300 hover:text-white"
                            : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                      )}
                      style={!active && isPrimary ? {
                        background: "rgba(52,211,153,0.08)",
                        border: "1px solid rgba(52,211,153,0.18)",
                        boxShadow: "0 0 12px rgba(52,211,153,0.08)",
                      } : undefined}
                    >
                      <span className="relative flex-shrink-0">
                        <Icon className={cn("w-4 h-4 transition-transform duration-200", !active && "group-hover:scale-110")} />
                        {href === "/mensajes" && unread > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center text-[8px] font-black text-white"
                            style={{ background: "#ef4444", lineHeight: 1 }}>
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </span>
                      <span className="flex-1">{label}</span>
                      {isPrimary && pendingJobs > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 animate-pulse"
                          style={{ background: "rgba(239,68,68,0.18)", color: "#f87171", border: "1px solid rgba(239,68,68,0.35)", whiteSpace: "nowrap" }}>
                          {pendingJobs === 1 ? "1 nuevo" : `${pendingJobs > 9 ? "9+" : pendingJobs} nuevos`}
                        </span>
                      )}
                      {isPrimary && pendingJobs === 0 && inProgressJobs > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: "rgba(52,211,153,0.18)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)", whiteSpace: "nowrap" }}>
                          {inProgressJobs === 1 ? "1 activo" : `${inProgressJobs > 9 ? "9+" : inProgressJobs} activos`}
                        </span>
                      )}
                      {isPrimary && totalActive === 0 && !active && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: "rgba(52,211,153,0.1)", color: "rgba(52,211,153,0.5)", border: "1px solid rgba(52,211,153,0.15)" }}>
                          Ir
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="space-y-0.5 py-2">
            {links.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                    active
                      ? "btn-gradient text-white shadow-lg"
                      : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                  )}
                >
                  <span className="relative flex-shrink-0">
                    <Icon className={cn("w-4 h-4 transition-transform duration-200", !active && "group-hover:scale-110")} />
                    {href === "/mensajes" && unread > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center text-[8px] font-black text-white"
                        style={{ background: "#ef4444", lineHeight: 1 }}>
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </span>
                  {label}
                </Link>
              );
            })}
          </div>
        )}
        </motion.div>
        </AnimatePresence>
      </div>

      {/* aliados@ contact chip — visible only for prestador roles */}
      {(user?.role === "worker" || user?.role === "seller" || user?.role === "cohost" || isSecondaryMode) && (
        <div className="px-4 pb-2">
          <a
            href="mailto:aliados@linkservi.com"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-white/35 hover:text-white/70 transition-colors border border-white/[0.05] hover:border-white/[0.12]"
          >
            <span className="text-base leading-none">🤝</span>
            <span className="min-w-0">
              <span className="block font-semibold text-white/45">Alianzas y comercios</span>
              <span className="block text-white/25 truncate">aliados@linkservi.com</span>
            </span>
          </a>
        </div>
      )}

      {/* Bottom actions */}
      <div className="px-4 pb-6 pt-2 space-y-0.5 border-t border-white/[0.04] mt-2">
        <button
          onClick={toggleCompact}
          aria-label="Colapsar sidebar"
          className="hidden md:flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
          style={{ transition: "color 0.22s ease-in-out, background 0.22s ease-in-out" }}
        >
          <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs">Colapsar</span>
        </button>
        <LogoutButton onClose={() => setMobileOpen(false)} />
      </div>
    </nav>
  );

  // ── Flat link list for compact mode (icon-only icons with tooltips) ──────────
  const compactLinks = useMemo(() => {
    if (isAdminNav) return sortedAdminSections.flatMap(s => s.links);
    if (isWorkerNav) return workerSections.flatMap(s => s.links);
    return links;
  }, [isAdminNav, isWorkerNav, sortedAdminSections, links]);

  // ── Compact desktop sidebar — icon-only with native tooltips ─────────────────
  const desktopCompactNav = (
    <nav className="flex flex-col h-full">
      {/* Logo — icon only, centered */}
      <div className="flex items-center justify-center py-5 border-b border-white/[0.06]">
        <img src="/logo.png" alt="LinkServi" className="h-7 w-auto object-contain" />
      </div>

      {/* Avatar only */}
      <div className="flex items-center justify-center pt-3 pb-1">
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={user?.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-white/10" />
        ) : (
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${roleColor} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
            {user?.name?.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Nav links — icon only, centered */}
      <div className="flex-1 px-2 py-1 overflow-y-auto scrollbar-hide">
        <div className="space-y-0.5">
          {compactLinks.map(({ href, label, icon: Icon }) => {
            const active = location === href || location.startsWith(href + "?");
            return (
              <CompactTooltip key={href} label={label}>
                <Link
                  href={href}
                  aria-label={label}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center justify-center w-full py-2.5 rounded-xl group relative",
                    active
                      ? "btn-gradient text-white shadow-lg"
                      : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                  )}
                  style={{ transition: "background 0.22s ease-in-out, color 0.22s ease-in-out" }}
                >
                  <span className="relative">
                    <Icon
                      className="w-4 h-4"
                      style={{ transition: "transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)" }}
                    />
                    {href === "/mensajes" && unread > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-red-500" />
                    )}
                  </span>
                </Link>
              </CompactTooltip>
            );
          })}
        </div>
      </div>

      {/* Footer — expand toggle + logout */}
      <div className="px-2 pb-4 pt-2 border-t border-white/[0.04] space-y-1">
        <CompactTooltip label="Expandir sidebar">
          <button
            onClick={toggleCompact}
            aria-label="Expandir sidebar"
            className="flex items-center justify-center w-full py-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.05]"
            style={{ transition: "color 0.22s ease-in-out, background 0.22s ease-in-out" }}
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </CompactTooltip>
      </div>
    </nav>
  );

  return (
    <>
      {showWorkerModal && (
        <WorkerActivationModal
          onSuccess={handleWorkerActivated}
          onClose={() => setShowWorkerModal(false)}
        />
      )}

      <button
        className="fixed top-4 left-4 z-50 md:hidden w-10 h-10 glass rounded-xl flex items-center justify-center text-white shadow-lg transition-all duration-200 hover:bg-white/10"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menú"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className="fixed inset-y-0 left-0 z-40 glass-sidebar hidden md:flex flex-col overflow-hidden"
        style={{
          width: effectiveCompact ? 60 : 256,
          transition: "width 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          willChange: "width",
        }}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {effectiveCompact ? desktopCompactNav : nav}
      </aside>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 glass-sidebar flex flex-col md:hidden transition-transform duration-300 ease-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {nav}
      </aside>
    </>
  );
}
