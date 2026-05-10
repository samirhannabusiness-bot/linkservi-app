import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useIsFetching, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { CartProvider } from "@/lib/cart-context";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { ThemeProvider } from "@/lib/theme-context";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { GlobalLoadingBar } from "@/components/ui/GlobalLoadingBar";
import { useEffect, useState, useCallback, Component, type ReactNode, type ErrorInfo, lazy, Suspense } from "react";
import { WorkerVerificationProvider } from "@/lib/worker-verification-context";
import { VerificationModal } from "@/components/VerificationModal";

// ── Global Error Boundary — prevents any render crash from blanking the screen ─
class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean; msg: string }> {
  state = { crashed: false, msg: "" };
  static getDerivedStateFromError(err: Error) {
    return { crashed: true, msg: err?.message ?? "Error desconocido" };
  }
  componentDidCatch(_err: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", _err, info);
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen bg-[#040c1a] flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl">⚠️</div>
          <h2 className="text-white font-bold text-lg">Algo salió mal</h2>
          <p className="text-white/50 text-sm max-w-xs">{this.state.msg}</p>
          <button
            onClick={() => { this.setState({ crashed: false, msg: "" }); window.location.href = "/"; }}
            className="mt-2 px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-semibold text-sm hover:bg-cyan-400 transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Page-level lazy imports (code splitting) ──────────────────────────────────
// Each group is bundled separately — only loaded when needed
const LandingPage            = lazy(() => import("@/pages/LandingPage").then(m => ({ default: m.LandingPage })));
const LoginPage              = lazy(() => import("@/pages/LoginPage").then(m => ({ default: m.LoginPage })));
const RegisterPage           = lazy(() => import("@/pages/RegisterPage").then(m => ({ default: m.RegisterPage })));
const ForgotPasswordPage     = lazy(() => import("@/pages/ForgotPasswordPage").then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage      = lazy(() => import("@/pages/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage        = lazy(() => import("@/pages/VerifyEmailPage").then(m => ({ default: m.VerifyEmailPage })));
const CompleteProfilePage    = lazy(() => import("@/pages/CompleteProfilePage").then(m => ({ default: m.CompleteProfilePage })));
const LegalPage              = lazy(() => import("@/pages/LegalPage").then(m => ({ default: m.LegalPage })));

// Client
const ClientDashboard        = lazy(() => import("@/pages/client/ClientDashboard").then(m => ({ default: m.ClientDashboard })));
const SearchPage             = lazy(() => import("@/pages/client/SearchPage").then(m => ({ default: m.SearchPage })));
const GlobalSearchResultsPage = lazy(() => import("@/pages/client/GlobalSearchResultsPage").then(m => ({ default: m.GlobalSearchResultsPage })));
const WorkerProfilePage      = lazy(() => import("@/pages/client/WorkerProfilePage").then(m => ({ default: m.WorkerProfilePage })));
const BookingPage            = lazy(() => import("@/pages/client/BookingPage").then(m => ({ default: m.BookingPage })));
const ClientBookingsPage     = lazy(() => import("@/pages/client/BookingsListPage").then(m => ({ default: m.ClientBookingsPage })));
const ClientProfilePage      = lazy(() => import("@/pages/client/ClientProfilePage").then(m => ({ default: m.ClientProfilePage })));
const PaymentHistoryPage     = lazy(() => import("@/pages/client/PaymentHistoryPage").then(m => ({ default: m.PaymentHistoryPage })));
const WalletPage             = lazy(() => import("@/pages/WalletPage"));
const ClientReferralPage     = lazy(() => import("@/pages/client/ClientReferralPage").then(m => ({ default: m.ClientReferralPage })));
const ClientPlanPage         = lazy(() => import("@/pages/client/ClientPlanPage").then(m => ({ default: m.ClientPlanPage })));
const FavoritesPage          = lazy(() => import("@/pages/client/FavoritesPage").then(m => ({ default: m.FavoritesPage })));
const ClientProductOrdersPage = lazy(() => import("@/pages/client/ClientProductOrdersPage").then(m => ({ default: m.ClientProductOrdersPage })));
const ClientCustomOrdersPage  = lazy(() => import("@/pages/client/ClientCustomOrdersPage").then(m => ({ default: m.ClientCustomOrdersPage })));
const UrgentRequestPage        = lazy(() => import("@/pages/client/UrgentRequestPage").then(m => ({ default: m.UrgentRequestPage })));
const ClientVerificationPage   = lazy(() => import("@/pages/client/ClientVerificationPage").then(m => ({ default: m.ClientVerificationPage })));

// Worker
const WorkerDashboard        = lazy(() => import("@/pages/worker/WorkerDashboard").then(m => ({ default: m.WorkerDashboard })));
const WorkerBookingsPage     = lazy(() => import("@/pages/worker/WorkerBookingsPage").then(m => ({ default: m.WorkerBookingsPage })));
const WorkerProfileEdit      = lazy(() => import("@/pages/worker/WorkerProfileEdit").then(m => ({ default: m.WorkerProfileEdit })));
const WorkerVerificationPage = lazy(() => import("@/pages/worker/WorkerVerificationPage").then(m => ({ default: m.WorkerVerificationPage })));
const WorkerWithdrawalsPage  = lazy(() => import("@/pages/worker/WorkerWithdrawalsPage").then(m => ({ default: m.WorkerWithdrawalsPage })));
const WorkerReceiptsPage     = lazy(() => import("@/pages/worker/WorkerReceiptsPage").then(m => ({ default: m.WorkerReceiptsPage })));
const WorkerAnalyticsPage    = lazy(() => import("@/pages/worker/WorkerAnalyticsPage").then(m => ({ default: m.WorkerAnalyticsPage })));
const ClientPublicProfilePage = lazy(() => import("@/pages/worker/ClientPublicProfilePage").then(m => ({ default: m.ClientPublicProfilePage })));
const WorkerServicesPricingPage = lazy(() => import("@/pages/worker/WorkerServicesPricingPage").then(m => ({ default: m.WorkerServicesPricingPage })));
const UrgentFeedPage           = lazy(() => import("@/pages/worker/UrgentFeedPage").then(m => ({ default: m.UrgentFeedPage })));
const WorkerPremiumPage        = lazy(() => import("@/pages/worker/WorkerPremiumPage").then(m => ({ default: m.WorkerPremiumPage })));

// Booking detail
const BookingDetailPage      = lazy(() => import("@/pages/BookingDetailPage").then(m => ({ default: m.BookingDetailPage })));

// Chat
const ChatPage               = lazy(() => import("@/pages/ChatPage").then(m => ({ default: m.ChatPage })));
const ConversationsPage      = lazy(() => import("@/pages/ConversationsPage").then(m => ({ default: m.ConversationsPage })));
const StoreChatPage          = lazy(() => import("@/pages/StoreChatPage").then(m => ({ default: m.StoreChatPage })));
const StoreChatListPage      = lazy(() => import("@/pages/StoreChatListPage").then(m => ({ default: m.StoreChatListPage })));

// Store / marketplace
const StorePage              = lazy(() => import("@/pages/StorePage").then(m => ({ default: m.StorePage })));
const PublicStorePage        = lazy(() => import("@/pages/PublicStorePage").then(m => ({ default: m.PublicStorePage })));
const CheckoutPage           = lazy(() => import("@/pages/client/CheckoutPage").then(m => ({ default: m.CheckoutPage })));

// Notifications
const NotificationsPage      = lazy(() => import("@/pages/NotificationsPage").then(m => ({ default: m.NotificationsPage })));

// Seller
const SellerDashboardPage    = lazy(() => import("@/pages/seller/SellerDashboardPage").then(m => ({ default: m.SellerDashboardPage })));

// Enterprise
const EnterpriseImportPage   = lazy(() => import("@/pages/enterprise/EnterpriseImportPage").then(m => ({ default: m.EnterpriseImportPage })));

// Integraciones (Sync Agent SAINT)
const IntegrationsPage       = lazy(() => import("@/pages/integrations/IntegrationsPage").then(m => ({ default: m.IntegrationsPage })));

// Co-host
const CoHostDashboard        = lazy(() => import("@/pages/cohost/CoHostDashboard").then(m => ({ default: m.CoHostDashboard })));
const CoHostProductsPage     = lazy(() => import("@/pages/cohost/CoHostProductsPage").then(m => ({ default: m.CoHostProductsPage })));
const CoHostBookingsPage     = lazy(() => import("@/pages/cohost/CoHostBookingsPage").then(m => ({ default: m.CoHostBookingsPage })));
const CoHostOrdersPage       = lazy(() => import("@/pages/cohost/CoHostOrdersPage").then(m => ({ default: m.CoHostOrdersPage })));
const CoHostStoresPage       = lazy(() => import("@/pages/cohost/CoHostStoresPage").then(m => ({ default: m.CoHostStoresPage })));
const StoreDashboardPage     = lazy(() => import("@/pages/cohost/StoreDashboardPage").then(m => ({ default: m.StoreDashboardPage })));
const CoHostPlanPage         = lazy(() => import("@/pages/cohost/CoHostPlanPage").then(m => ({ default: m.CoHostPlanPage })));
const CoHostProfilePage      = lazy(() => import("@/pages/cohost/CoHostProfilePage").then(m => ({ default: m.CoHostProfilePage })));
const EarningsPage           = lazy(() => import("@/pages/cohost/EarningsPage").then(m => ({ default: m.EarningsPage })));
const CoHostTeamPage         = lazy(() => import("@/pages/cohost/CoHostTeamPage").then(m => ({ default: m.CoHostTeamPage })));
const CoHostReferralPage     = lazy(() => import("@/pages/cohost/CoHostReferralPage").then(m => ({ default: m.CoHostReferralPage })));

// Transporte (rideshare V1)
const TransportRequestPage   = lazy(() => import("@/pages/transport/TransportRequestPage").then(m => ({ default: m.TransportRequestPage })));
const DriverTransportPage    = lazy(() => import("@/pages/transport/DriverTransportPage").then(m => ({ default: m.DriverTransportPage })));
const DriverSetupPage        = lazy(() => import("@/pages/transport/DriverSetupPage").then(m => ({ default: m.DriverSetupPage })));
const ActiveRidePage         = lazy(() => import("@/pages/transport/ActiveRidePage").then(m => ({ default: m.ActiveRidePage })));

// Manager (gestor) — multi-role mode
const ManagerDashboard       = lazy(() => import("@/pages/manager/ManagerDashboard").then(m => ({ default: m.ManagerDashboard })));
const ManagerInvitePage      = lazy(() => import("@/pages/manager/ManagerInvitePage").then(m => ({ default: m.ManagerInvitePage })));
const InviteLandingPage      = lazy(() => import("@/pages/InviteLandingPage").then(m => ({ default: m.InviteLandingPage })));
const AdminInviteLandingPage = lazy(() => import("@/pages/admin/AdminInviteLandingPage").then(m => ({ default: m.AdminInviteLandingPage })));
const UserVerificationPage   = lazy(() => import("@/pages/UserVerificationPage").then(m => ({ default: m.UserVerificationPage })));

// Admin (heavy — only loaded when admin logs in)
const AdminDashboard         = lazy(() => import("@/pages/admin/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AdminUsersPage         = lazy(() => import("@/pages/admin/AdminUsersPage").then(m => ({ default: m.AdminUsersPage })));
const AdminAgentsPage        = lazy(() => import("@/pages/admin/AdminAgentsPage").then(m => ({ default: m.AdminAgentsPage })));
const AdminWorkersPage       = lazy(() => import("@/pages/admin/AdminWorkersPage").then(m => ({ default: m.AdminWorkersPage })));
const AdminBookingsPage      = lazy(() => import("@/pages/admin/AdminBookingsPage").then(m => ({ default: m.AdminBookingsPage })));
const AdminWithdrawalsPage   = lazy(() => import("@/pages/admin/AdminWithdrawalsPage").then(m => ({ default: m.AdminWithdrawalsPage })));
const AdminWalletDepositsPage = lazy(() => import("@/pages/admin/AdminWalletDepositsPage").then(m => ({ default: m.AdminWalletDepositsPage })));
const AdminDisputesPage      = lazy(() => import("@/pages/admin/AdminDisputesPage").then(m => ({ default: m.AdminDisputesPage })));
const AdminProductOrdersPage = lazy(() => import("@/pages/admin/AdminProductOrdersPage").then(m => ({ default: m.AdminProductOrdersPage })));
const AdminStoresPage        = lazy(() => import("@/pages/admin/AdminStoresPage").then(m => ({ default: m.AdminStoresPage })));
const AdminRatingsPage       = lazy(() => import("@/pages/admin/AdminRatingsPage").then(m => ({ default: m.AdminRatingsPage })));
const AdminCohostPlansPage   = lazy(() => import("@/pages/admin/AdminCohostPlansPage").then(m => ({ default: m.AdminCohostPlansPage })));
const AdminCollaboratorsPage  = lazy(() => import("@/pages/admin/AdminCollaboratorsPage").then(m => ({ default: m.AdminCollaboratorsPage })));
const AdminClientPremiumPage  = lazy(() => import("@/pages/admin/AdminClientPremiumPage").then(m => ({ default: m.AdminClientPremiumPage })));
const AdminCustomOrdersPage      = lazy(() => import("@/pages/admin/AdminCustomOrdersPage").then(m => ({ default: m.AdminCustomOrdersPage })));
const AdminVerificationsPage     = lazy(() => import("@/pages/admin/AdminVerificationsPage").then(m => ({ default: m.AdminVerificationsPage })));
const AdminAnalyticsPage         = lazy(() => import("@/pages/admin/AdminAnalyticsPage").then(m => ({ default: m.AdminAnalyticsPage })));
const AdminCoHostTeamsPage       = lazy(() => import("@/pages/admin/AdminCoHostTeamsPage").then(m => ({ default: m.AdminCoHostTeamsPage })));
const AdminRentalsPage           = lazy(() => import("@/pages/admin/AdminRentalsPage").then(m => ({ default: m.AdminRentalsPage })));
const AdminWarrantiesPage        = lazy(() => import("@/pages/admin/AdminWarrantiesPage").then(m => ({ default: m.AdminWarrantiesPage })));
const AdminProductPremiumPage    = lazy(() => import("@/pages/admin/AdminProductPremiumPage").then(m => ({ default: m.AdminProductPremiumPage })));
const GanarDineroPage                 = lazy(() => import("@/pages/GanarDineroPage"));
const ClasificadosPage                = lazy(() => import("@/pages/ClasificadosPage").then(m => ({ default: m.ClasificadosPage })));
const JobsPage                        = lazy(() => import("@/pages/jobs/JobsPage").then(m => ({ default: m.JobsPage })));
const JobChatPage                     = lazy(() => import("@/pages/jobs/JobChatPage").then(m => ({ default: m.JobChatPage })));
const JobConversationsPage            = lazy(() => import("@/pages/jobs/JobConversationsPage").then(m => ({ default: m.JobConversationsPage })));
const PublicJobProfilePage            = lazy(() => import("@/pages/jobs/PublicJobProfilePage").then(m => ({ default: m.PublicJobProfilePage })));
const AdminJobSubscriptionsPage       = lazy(() => import("@/pages/admin/AdminJobSubscriptionsPage").then(m => ({ default: m.AdminJobSubscriptionsPage })));

// SEO + Blog
const CategoryCityPage                = lazy(() => import("@/pages/seo/CategoryCityPage").then(m => ({ default: m.CategoryCityPage })));
const PublicWorkerPage                = lazy(() => import("@/pages/seo/PublicWorkerPage").then(m => ({ default: m.PublicWorkerPage })));
const BlogIndexPage                   = lazy(() => import("@/pages/blog/BlogIndexPage").then(m => ({ default: m.BlogIndexPage })));
const BlogArticlePage                 = lazy(() => import("@/pages/blog/BlogArticlePage").then(m => ({ default: m.BlogArticlePage })));
const AdminBlogPage                   = lazy(() => import("@/pages/admin/AdminBlogPage").then(m => ({ default: m.AdminBlogPage })));
const UnifiedInboxPage                = lazy(() => import("@/pages/UnifiedInboxPage").then(m => ({ default: m.UnifiedInboxPage })));
const DeliveryTrackingPage            = lazy(() => import("@/pages/DeliveryTrackingPage").then(m => ({ default: m.DeliveryTrackingPage })));
const DriverDeliveryPage              = lazy(() => import("@/pages/DriverDeliveryPage").then(m => ({ default: m.DriverDeliveryPage })));

// ── PWA — still eagerly loaded (tiny) ────────────────────────────────────────
import { PWAInstallPrompt } from "@/components/ui/PWAInstallPrompt";
import { GlobalBackButton } from "@/components/ui/GlobalBackButton";

// ── Shared page-load spinner ──────────────────────────────────────────────────
function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 min — reduce redundant refetches
      gcTime: 10 * 60_000,     // keep cache for 10 min
      retry: 1,
      refetchOnWindowFocus: false, // avoid jarring refetches when switching tabs
    },
    mutations: {
      retry: 0,
    },
  },
});

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

// ── /worker/* → /professional/* permanent redirect (Fase 5 migración) ─────────
// SPA-side replace navigation: instant, no flash, no extra history entry.
// Preserves search params + hash so deep links keep working. Emits a console
// warning so we can monitor lingering legacy traffic before fully removing
// the alias in a future release.
function WorkerLegacyRedirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const fromPath = window.location.pathname + search + hash;
    const dest = `${to}${search}${hash}`;

    // Phase 1 telemetry: persistent server-side tracking, replaces console.warn.
    // Fire-and-forget; never blocks navigation. SessionStorage dedup prevents
    // double-counting if React re-mounts in the same tab visit.
    try {
      const sessionKey = `legacy_worker_logged:${fromPath}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "1");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const token = localStorage.getItem("authToken");
        if (token) headers.Authorization = `Bearer ${token}`;
        fetch("/api/logs/legacy-worker-redirect", {
          method: "POST",
          headers,
          body: JSON.stringify({ fromPath, toPath: dest }),
          keepalive: true,
        }).catch(() => { /* ignore — never block redirect on tracking failure */ });
      }
    } catch { /* sessionStorage may be unavailable in private mode */ }

    navigate(dest, { replace: true });
  }, []);
  return null;
}

function AuthGuard({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, token, isLoading, activeMode } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      const publicPaths = [
        "/", "/login", "/register", "/forgot-password", "/reset-password",
        "/terms", "/privacy", "/cookies", "/refunds", "/unirme", "/jobs",
        "/search", "/workers", "/store", "/stores", "/ganar-dinero",
        "/buscar", "/clasificados",
      ];
      const isPublic = publicPaths.some(
        p => location === p || location.startsWith(p + "?") || location.startsWith(p + "/"),
      )
        // Transporte: solo la pantalla de solicitud es pública; /transport/ride/* exige cuenta.
        || location === "/transport"
        || location.startsWith("/transport?");
      if (!isPublic) {
        navigate("/login?redirect=" + encodeURIComponent(location));
      }
      return;
    }
    if (!isLoading && user) {
      const userRolesAll = [
        ...(Array.isArray((user as any).roles) ? (user as any).roles : []),
        user.role,
        user.secondaryRole,
      ].filter(Boolean) as string[];
      // Foto de perfil ya NO es bloqueante. La invitación a subirla aparece
      // como banner suave dentro del dashboard. Esto evita que un usuario
      // recién registrado quede atrapado en /profile/setup sin descubrir
      // los botones de activación de roles.
      void userRolesAll;
      const userRoles = [
        ...(Array.isArray((user as any).roles) ? (user as any).roles : []),
        user.role,
        user.secondaryRole,
      ].filter(Boolean) as string[];
      const hasAccess = roles.some(r => userRoles.includes(r));
      if (!hasAccess) {
        const isSecondaryMode = activeMode === "secondary" && !!user.secondaryRole;
        const secondaryDest = user.secondaryRole === "worker" ? "/professional" : "/client";
        const primaryDest = user.role === "admin" ? "/admin"
          : user.role === "worker" ? "/professional"
          : user.role === "cohost" ? "/cohost"
          : user.role === "seller" ? "/seller"
          : "/client";
        navigate(isSecondaryMode ? secondaryDest : primaryDest);
      }
    }
  }, [user, token, isLoading, navigate, location, activeMode]);

  if (isLoading || (!user && !!token)) {
    return <PageSpinner />;
  }

  // Invitados: algunas rutas muestran UI pública y piden login solo al accionar (p. ej. solicitar viaje).
  if (!user) {
    const guestTransportHome =
      location === "/transport" || location.startsWith("/transport?");
    if (guestTransportHome) return <>{children}</>;
    return null;
  }

  return <>{children}</>;
}

// ── KYC Wall — shown to workers who haven't been verified yet ─────────────────
const WHATSAPP_SUPPORT = "https://wa.me/584126978870?text=Hola%20Equipo%20de%20Soporte%20LinkServi%2C%20vengo%20de%20la%20aplicaci%C3%B3n%20y%20necesito%20asistencia%20con%20un%20servicio.%20Mi%20nombre%20es%3A%20";

function KYCWall({ status, rejectionNote, role }: { status: string; rejectionNote?: string; role?: string }) {
  const [, navigate] = useLocation();
  const isRejected = status === "rejected";
  const isPending  = status === "pending";
  const verifyPath = role === "worker" ? "/professional/verification" : "/verification";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative"
      style={{ background: "#040c1a" }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full opacity-20"
          style={{ background: isRejected ? "radial-gradient(circle, rgba(239,68,68,0.6) 0%, transparent 70%)" : "radial-gradient(circle, rgba(6,182,212,0.5) 0%, transparent 70%)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center gap-6 text-center">

        {/* Icon */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
          style={isRejected
            ? { background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.4)", boxShadow: "0 0 30px rgba(239,68,68,0.2)" }
            : { background: "rgba(6,182,212,0.10)", border: "1.5px solid rgba(6,182,212,0.35)", boxShadow: "0 0 30px rgba(6,182,212,0.15)" }}
        >
          {isRejected ? "⚠️" : isPending ? "🔍" : "🛡️"}
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white leading-tight">
            {isRejected
              ? "Verificación rechazada"
              : isPending
              ? "Cuenta en revisión"
              : "Verifica tu identidad"}
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            {isRejected
              ? "Un administrador revisó tus documentos y encontró un problema. Puedes corregirlo y reenviarlos."
              : isPending
              ? "¡Documentos recibidos! Un administrador de LinkServi está revisando tu identidad para garantizar la seguridad de la comunidad."
              : "Para generar ingresos en LinkServi debes verificar tu identidad. Es rápido y solo se hace una vez."}
          </p>
        </div>

        {/* Rejection reason card */}
        {isRejected && rejectionNote && (
          <div
            className="w-full px-4 py-3 rounded-2xl text-left"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Motivo del rechazo</p>
            <p className="text-sm text-red-300/80 leading-relaxed">"{rejectionNote}"</p>
          </div>
        )}

        {/* Pending timer card */}
        {isPending && (
          <div
            className="w-full px-4 py-4 rounded-2xl text-left space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {[
              { icon: "✅", text: "Documentos recibidos y en cola de revisión" },
              { icon: "⏱️", text: "Tiempo estimado: menos de 24 horas" },
              { icon: "🔔", text: "Recibirás una notificación cuando sea aprobado" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <span className="text-base leading-none mt-0.5">{icon}</span>
                <span className="text-sm text-white/50">{text}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTA buttons */}
        <div className="w-full space-y-3">
          {/* Show upload button for ANY non-approved state — pending with admin note means revoked */}
          {status !== "approved" && (
            <button
              onClick={() => navigate(verifyPath)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all"
              style={{
                background: "linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)",
                color: "white",
                boxShadow: "0 0 20px rgba(6,182,212,0.35)",
              }}
            >
              {isRejected
                ? "🔄 Corregir y reenviar documentos"
                : isPending && rejectionNote
                ? "📄 Cargar documentos de nuevo"
                : isPending
                ? "📄 Actualizar mis documentos"
                : "🛡️ Verificar mi identidad ahora"}
            </button>
          )}

          <a
            href={WHATSAPP_SUPPORT}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-semibold text-sm transition-all"
            style={{
              background: "rgba(37,211,102,0.10)",
              border: "1px solid rgba(37,211,102,0.3)",
              color: "#25D366",
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Soporte por WhatsApp
          </a>
        </div>

        <p className="text-xs text-white/20 max-w-xs leading-relaxed">
          LinkServi verifica la identidad de todos sus profesionales para proteger a los clientes y a la comunidad.
        </p>
      </div>
    </div>
  );
}

// ── WorkerKYCGuard — provides verification status via context (no hard block) ──
// Workers can always access their dashboard; gated actions use the interceptor.
const KYC_BYPASS_PATHS = ["/professional/verification", "/notificaciones"];

function WorkerKYCGuard({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [location] = useLocation();

  const isBypassed = KYC_BYPASS_PATHS.some(
    p => location === p || location.startsWith(p + "/") || location.startsWith(p + "?")
  );

  const { data: workerData, isLoading } = useQuery({
    // Include token in queryKey so the query re-runs when auth state changes
    // (e.g., right after login when token transitions from JWT → "__cookie__").
    queryKey: ["worker-kyc-status", user?.id, !!token],
    queryFn: async () => {
      // NEVER read from localStorage — sl_token is NOT stored there after Phase 1.
      // Cookie-based sessions: cookie is sent automatically (credentials: "include").
      // Fresh JWT sessions (right after login): send the in-memory Bearer token.
      const headers: Record<string, string> = {};
      if (token && token !== "__cookie__") {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/workers/me", {
        credentials: "include",
        headers,
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!token && user?.role === "worker" && !isBypassed,
    staleTime: 0,
    refetchInterval: 5_000,
    retry: 1,
  });

  if (isBypassed) return <>{children}</>;
  if (isLoading) return <PageSpinner />;

  const status: string = workerData?.verificationStatus ?? "not_submitted";
  const isVerified = status === "approved";

  return (
    <WorkerVerificationProvider value={{ status, notes: workerData?.verificationNotes ?? "", isVerified }}>
      {children}
    </WorkerVerificationProvider>
  );
}

// Helper: wraps a worker route with both auth + KYC check
function WorkerRoute({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard roles={["worker"]}>
      <WorkerKYCGuard>{children}</WorkerKYCGuard>
    </AuthGuard>
  );
}

// ── UniversalKYCGuard — blocks sellers and cohosts who haven't verified yet ──
// Uses the unified /api/me/verification/status endpoint (no role-specific queries)
const UNIVERSAL_KYC_BYPASS = ["/verification", "/notificaciones", "/unirme"];

function UniversalKYCGuard({ children, role: roleProp }: { children: React.ReactNode; role?: string }) {
  const { user, token } = useAuth();
  const role = roleProp ?? user?.role ?? "seller";
  const [location] = useLocation();

  const isBypassed = UNIVERSAL_KYC_BYPASS.some(
    p => location === p || location.startsWith(p + "/") || location.startsWith(p + "?")
  );

  // Gestores (business managers) operate on behalf of an already-KYC-verified
  // owner; they do not sell anything personally, so they bypass the KYC wall.
  const userRoles = [
    user?.role,
    (user as any)?.secondaryRole,
    ...((user as any)?.roles ?? []),
  ].filter(Boolean) as string[];
  const isGestor = userRoles.includes("gestor");

  const { data: kycData, isLoading } = useQuery({
    // Include token in queryKey so the query re-runs when auth state changes.
    queryKey: ["universal-kyc-status", user?.id, !!token],
    queryFn: async () => {
      // NEVER read from localStorage — sl_token is NOT stored there after Phase 1.
      // Cookie-based sessions: cookie is sent automatically (credentials: "include").
      // Fresh JWT sessions (right after login): send the in-memory Bearer token.
      const headers: Record<string, string> = {};
      if (token && token !== "__cookie__") {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/me/verification/status", {
        credentials: "include",
        headers,
      });
      if (!res.ok) return { status: "not_submitted" };
      return res.json();
    },
    enabled: !!token && !isBypassed,
    staleTime: 0,
    refetchInterval: 5_000,
    retry: 1,
  });

  if (isBypassed || isGestor) return <>{children}</>;
  if (isLoading) return <PageSpinner />;

  const status: string = kycData?.status ?? "not_submitted";
  if (status !== "approved") {
    return <KYCWall status={status} role={role} />;
  }

  return <>{children}</>;
}

// Helpers: wrap role-specific routes with auth + universal KYC check
function SellerRoute({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard roles={["seller"]}>
      <UniversalKYCGuard role="seller">{children}</UniversalKYCGuard>
    </AuthGuard>
  );
}

function CoHostRoute({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard roles={["cohost"]}>
      <UniversalKYCGuard role="cohost">{children}</UniversalKYCGuard>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/profile/setup" component={CompleteProfilePage} />
        <Route path="/terms">{() => <LegalPage tab="terms" />}</Route>
        <Route path="/privacy">{() => <LegalPage tab="privacy" />}</Route>
        <Route path="/cookies">{() => <LegalPage tab="cookies" />}</Route>
        <Route path="/refunds">{() => <LegalPage tab="refunds" />}</Route>

        {/* Public invite landing — Co-Host */}
        <Route path="/unirme/:code">
          {(params) => <InviteLandingPage code={params.code} />}
        </Route>

        {/* Admin collaborator invite landing */}
        <Route path="/admin-invite/:token">
          {(params) => <AdminInviteLandingPage token={params.token} />}
        </Route>

        {/* Manager (gestor) invite landing — público, sin AuthGuard */}
        <Route path="/manager-invite/:token">
          {() => <ManagerInvitePage />}
        </Route>
        {/* Manager dashboard — requiere sesión (cualquier rol con gestor en roles[]) */}
        <Route path="/manager">
          {() => <AuthGuard roles={["gestor"]}><ManagerDashboard /></AuthGuard>}
        </Route>

        {/* Ganar dinero — pantalla intermedia pública */}
        <Route path="/ganar-dinero">
          {() => <GanarDineroPage />}
        </Route>

        {/* Public browse routes — sin login, login wall solo en acciones */}
        <Route path="/buscar">
          {() => <GlobalSearchResultsPage />}
        </Route>

        <Route path="/clasificados">
          {() => <ClasificadosPage />}
        </Route>

        <Route path="/search">
          {() => <SearchPage />}
        </Route>
        <Route path="/workers/:workerId">
          {() => <WorkerProfilePage />}
        </Route>

        {/* Client routes */}
        <Route path="/client">
          {() => <AuthGuard roles={["client"]}><ClientDashboard /></AuthGuard>}
        </Route>
        <Route path="/client/search">
          {() => <AuthGuard roles={["client"]}><SearchPage /></AuthGuard>}
        </Route>
        <Route path="/client/worker/:workerId">
          {() => <AuthGuard roles={["client"]}><WorkerProfilePage /></AuthGuard>}
        </Route>
        <Route path="/client/book/:workerId">
          {() => <AuthGuard roles={["client"]}><BookingPage /></AuthGuard>}
        </Route>
        <Route path="/client/bookings">
          {() => <AuthGuard roles={["client"]}><ClientBookingsPage /></AuthGuard>}
        </Route>
        <Route path="/client/booking/:bookingId">
          {() => <AuthGuard roles={["client"]}><BookingDetailPage /></AuthGuard>}
        </Route>
        <Route path="/client/profile">
          {() => <AuthGuard roles={["client"]}><ClientProfilePage /></AuthGuard>}
        </Route>
        <Route path="/client/payments">
          {() => <AuthGuard roles={["client"]}><PaymentHistoryPage /></AuthGuard>}
        </Route>
        <Route path="/billetera">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "gestor", "driver", "admin"]}><WalletPage /></AuthGuard>}
        </Route>
        <Route path="/client/referral">
          {() => <AuthGuard roles={["client"]}><ClientReferralPage /></AuthGuard>}
        </Route>
        <Route path="/client/plan">
          {() => <AuthGuard roles={["client"]}><ClientPlanPage /></AuthGuard>}
        </Route>
        <Route path="/client/chat/:bookingId">
          {() => <AuthGuard roles={["client"]}><ChatPage /></AuthGuard>}
        </Route>
        <Route path="/client/conversations">
          {() => <RedirectTo to="/mensajes" />}
        </Route>
        <Route path="/client/favorites">
          {() => <AuthGuard roles={["client"]}><FavoritesPage /></AuthGuard>}
        </Route>
        <Route path="/client/product-orders">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "admin"]}><ClientProductOrdersPage /></AuthGuard>}
        </Route>
        <Route path="/checkout">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "admin"]}><CheckoutPage /></AuthGuard>}
        </Route>
        <Route path="/my-custom-orders">
          {() => <AuthGuard roles={["client"]}><ClientCustomOrdersPage /></AuthGuard>}
        </Route>
        <Route path="/client/urgencias">
          {() => <AuthGuard roles={["client"]}><UrgentRequestPage /></AuthGuard>}
        </Route>
        <Route path="/client/verification">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller"]}><ClientVerificationPage /></AuthGuard>}
        </Route>

        {/* ── Transporte (rideshare V1) ────────────────────────────── */}
        <Route path="/transport">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "gestor", "admin", "driver"]}><TransportRequestPage /></AuthGuard>}
        </Route>
        <Route path="/transport/ride/:id">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "gestor", "admin", "driver"]}><ActiveRidePage /></AuthGuard>}
        </Route>
        <Route path="/driver/transport/setup">
          {() => <AuthGuard roles={["driver", "worker", "client", "admin"]}><DriverSetupPage /></AuthGuard>}
        </Route>
        <Route path="/driver/transport">
          {() => <AuthGuard roles={["driver", "worker", "client", "admin"]}><DriverTransportPage /></AuthGuard>}
        </Route>

        {/* Universal KYC verification page — accessible to sellers and cohosts before KYC approval */}
        <Route path="/verification">
          {() => <AuthGuard roles={["seller", "cohost"]}><UserVerificationPage /></AuthGuard>}
        </Route>

        {/* ── /professional/* — canonical routes for professionals ──────────
            Internal navigation uses these paths exclusively. Legacy /worker
            and /worker/* aliases below redirect here for backward compatibility
            (emails, push notifications, saved bookmarks). */}
        <Route path="/professional/verification">
          {() => <AuthGuard roles={["worker"]}><WorkerVerificationPage /></AuthGuard>}
        </Route>
        <Route path="/professional">
          {() => <WorkerRoute><WorkerDashboard /></WorkerRoute>}
        </Route>
        <Route path="/professional/bookings">
          {() => <WorkerRoute><WorkerBookingsPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/booking/:bookingId">
          {() => <WorkerRoute><BookingDetailPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/profile">
          {() => <WorkerRoute><WorkerProfileEdit /></WorkerRoute>}
        </Route>
        <Route path="/professional/withdrawals">
          {() => <WorkerRoute><WorkerWithdrawalsPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/comprobantes">
          {() => <WorkerRoute><WorkerReceiptsPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/client/:clientId">
          {() => <WorkerRoute><ClientPublicProfilePage /></WorkerRoute>}
        </Route>
        <Route path="/professional/chat/:bookingId">
          {() => <WorkerRoute><ChatPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/conversations">
          {() => <RedirectTo to="/mensajes" />}
        </Route>
        <Route path="/professional/analytics">
          {() => <WorkerRoute><WorkerAnalyticsPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/urgencias">
          {() => <WorkerRoute><UrgentFeedPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/services">
          {() => <WorkerRoute><WorkerServicesPricingPage /></WorkerRoute>}
        </Route>
        <Route path="/professional/premium">
          {() => <WorkerRoute><WorkerPremiumPage /></WorkerRoute>}
        </Route>

        {/* ── /worker → /professional permanent redirect (Fase 5 migración) ───
            SPA-side replace navigation. Preserves search params + hash. Logs
            to console for monitoring legacy traffic. /worker is robots.txt
            disallowed so SEO is unaffected. */}
        <Route path="/worker">
          {() => <WorkerLegacyRedirect to="/professional" />}
        </Route>
        <Route path="/worker/*">
          {(params: Record<string, string | undefined>) => (
            <WorkerLegacyRedirect to={`/professional/${params["*"] ?? ""}`} />
          )}
        </Route>

        {/* Notifications — all logged-in users */}
        <Route path="/notificaciones">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "admin"]}><NotificationsPage /></AuthGuard>}
        </Route>

        {/* Store / marketplace — público; login wall en acciones */}
        <Route path="/store">
          {() => <StorePage />}
        </Route>
        <Route path="/stores/:storeId">
          {() => <PublicStorePage />}
        </Route>

        {/* Seller */}
        <Route path="/seller">
          {() => <SellerRoute><SellerDashboardPage /></SellerRoute>}
        </Route>

        {/* Co-host */}
        <Route path="/cohost">
          {() => <CoHostRoute><CoHostDashboard /></CoHostRoute>}
        </Route>
        <Route path="/cohost/team">
          {() => <CoHostRoute><CoHostTeamPage /></CoHostRoute>}
        </Route>
        <Route path="/cohost/workers">
          {() => <CoHostRoute><CoHostDashboard /></CoHostRoute>}
        </Route>
        <Route path="/cohost/bookings">
          {() => <CoHostRoute><CoHostBookingsPage /></CoHostRoute>}
        </Route>
        {/* Mixed cohost+seller routes — both roles must pass KYC */}
        <Route path="/cohost/plan">
          {() => <AuthGuard roles={["cohost", "seller", "gestor"]}><UniversalKYCGuard><CoHostPlanPage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/cohost/earnings">
          {() => <AuthGuard roles={["cohost", "seller"]}><UniversalKYCGuard><EarningsPage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/cohost/products">
          {() => <AuthGuard roles={["cohost", "seller"]}><UniversalKYCGuard><CoHostProductsPage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/cohost/orders">
          {() => <AuthGuard roles={["cohost", "seller", "gestor"]}><UniversalKYCGuard><CoHostOrdersPage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/cohost/stores">
          {() => <AuthGuard roles={["cohost", "seller", "worker", "gestor"]}><UniversalKYCGuard><CoHostStoresPage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/cohost/stores/:storeId">
          {() => <AuthGuard roles={["cohost", "seller", "worker", "gestor"]}><UniversalKYCGuard><StoreDashboardPage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/cohost/profile">
          {() => <AuthGuard roles={["cohost", "seller"]}><UniversalKYCGuard><CoHostProfilePage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/enterprise/import">
          {() => <AuthGuard roles={["cohost", "seller", "admin"]}><UniversalKYCGuard><EnterpriseImportPage /></UniversalKYCGuard></AuthGuard>}
        </Route>
        <Route path="/integrations">
          {() => <AuthGuard roles={["cohost", "seller", "admin", "gestor"]}><IntegrationsPage /></AuthGuard>}
        </Route>
        <Route path="/cohost/referral">
          {() => <AuthGuard roles={["cohost", "seller"]}><CoHostReferralPage /></AuthGuard>}
        </Route>

        {/* Store chat */}
        <Route path="/store-chat">
          {() => <RedirectTo to="/mensajes" />}
        </Route>
        <Route path="/store-chat/:storeId">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller"]}><StoreChatPage /></AuthGuard>}
        </Route>
        <Route path="/store-chat/:storeId/buyer/:buyerId">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller"]}><StoreChatPage /></AuthGuard>}
        </Route>

        {/* Admin */}
        <Route path="/admin">
          {() => <AuthGuard roles={["admin"]}><AdminDashboard /></AuthGuard>}
        </Route>
        <Route path="/admin/users">
          {() => <AuthGuard roles={["admin"]}><AdminUsersPage /></AuthGuard>}
        </Route>
        <Route path="/admin/integrations/agents">
          {() => <AuthGuard roles={["admin"]}><AdminAgentsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/workers">
          {() => <AuthGuard roles={["admin"]}><AdminWorkersPage /></AuthGuard>}
        </Route>
        <Route path="/admin/bookings">
          {() => <AuthGuard roles={["admin"]}><AdminBookingsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/withdrawals">
          {() => <AuthGuard roles={["admin"]}><AdminWithdrawalsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/wallet-deposits">
          {() => <AuthGuard roles={["admin"]}><AdminWalletDepositsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/disputes">
          {() => <AuthGuard roles={["admin"]}><AdminDisputesPage /></AuthGuard>}
        </Route>
        <Route path="/admin/product-orders">
          {() => <AuthGuard roles={["admin"]}><AdminProductOrdersPage /></AuthGuard>}
        </Route>
        <Route path="/admin/stores">
          {() => <AuthGuard roles={["admin"]}><AdminStoresPage /></AuthGuard>}
        </Route>
        <Route path="/admin/ratings">
          {() => <AuthGuard roles={["admin"]}><AdminRatingsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/cohost-plans">
          {() => <AuthGuard roles={["admin"]}><AdminCohostPlansPage /></AuthGuard>}
        </Route>
        <Route path="/admin/client-premium">
          {() => <AuthGuard roles={["admin"]}><AdminClientPremiumPage /></AuthGuard>}
        </Route>
        <Route path="/admin/collaborators">
          {() => <AuthGuard roles={["admin"]}><AdminCollaboratorsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/custom-orders">
          {() => <AuthGuard roles={["admin"]}><AdminCustomOrdersPage /></AuthGuard>}
        </Route>
        <Route path="/admin/verificaciones">
          {() => <AuthGuard roles={["admin"]}><AdminVerificationsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/analytics">
          {() => <AuthGuard roles={["admin"]}><AdminAnalyticsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/cohost-teams">
          {() => <AuthGuard roles={["admin"]}><AdminCoHostTeamsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/rentals">
          {() => <AuthGuard roles={["admin"]}><AdminRentalsPage /></AuthGuard>}
        </Route>
        <Route path="/admin/warranties">
          {() => <AuthGuard roles={["admin"]}><AdminWarrantiesPage /></AuthGuard>}
        </Route>
        <Route path="/admin/product-premium">
          {() => <AuthGuard roles={["admin"]}><AdminProductPremiumPage /></AuthGuard>}
        </Route>

        <Route path="/admin/jobs/subscriptions">
          {() => <AuthGuard roles={["admin"]}><AdminJobSubscriptionsPage /></AuthGuard>}
        </Route>

        {/* Bolsa de empleo — público */}
        <Route path="/jobs">
          {() => <JobsPage />}
        </Route>
        {/* Perfil público SEO de candidato */}
        <Route path="/jobs/perfil/:slug">
          {() => <PublicJobProfilePage />}
        </Route>

        {/* Búsqueda de profesionales — público; login wall al intentar contratar */}
        <Route path="/workers">
          {() => <SearchPage />}
        </Route>
        <Route path="/jobs/conversations">
          {() => <RedirectTo to="/mensajes" />}
        </Route>
        <Route path="/jobs/chat/:id">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "admin"]}><JobChatPage /></AuthGuard>}
        </Route>
        <Route path="/mensajes">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller"]}><UnifiedInboxPage /></AuthGuard>}
        </Route>

        {/* ─── Delivery On Demand ─────────────────────────────────── */}
        <Route path="/delivery/:id">
          {() => <AuthGuard roles={["client", "worker", "cohost", "seller", "admin"]}><DeliveryTrackingPage /></AuthGuard>}
        </Route>
        <Route path="/driver/delivery">
          {() => <AuthGuard roles={["driver", "admin"]}><DriverDeliveryPage /></AuthGuard>}
        </Route>

        {/* ─── SEO: páginas dinámicas por categoría/ciudad ───────────── */}
        <Route path="/servicios/:trade/:city">
          {() => <CategoryCityPage />}
        </Route>
        <Route path="/servicios/:trade">
          {() => <CategoryCityPage />}
        </Route>

        {/* ─── Perfil público SEO ─────────────────────────────────────── */}
        <Route path="/p/:slug">
          {() => <PublicWorkerPage />}
        </Route>

        {/* ─── Blog público ───────────────────────────────────────────── */}
        <Route path="/blog">
          {() => <BlogIndexPage />}
        </Route>
        <Route path="/blog/:slug">
          {() => <BlogArticlePage />}
        </Route>

        {/* ─── Admin Blog ─────────────────────────────────────────────── */}
        <Route path="/admin/blog">
          {() => <AuthGuard roles={["admin"]}><AdminBlogPage /></AuthGuard>}
        </Route>

        <Route>{() => <LandingPage />}</Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      if (sessionStorage.getItem("sl_splash_done")) return false;
      sessionStorage.setItem("sl_splash_done", "1");
      return true;
    } catch {
      return false;
    }
  });

  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalLoadingBar />
      <ThemeProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthProvider>
                <CartProvider>
                  <SidebarProvider>
                    <Router />
                    <GlobalBackButton />
                    <PWAInstallPrompt />
                    <VerificationModal />
                  </SidebarProvider>
                </CartProvider>
              </AuthProvider>
            </WouterRouter>
            <Toaster />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
      {showSplash && <SplashScreen onComplete={handleSplashDone} />}
    </QueryClientProvider>
  );
}

export default App;
