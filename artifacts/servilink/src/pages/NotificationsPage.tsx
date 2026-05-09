import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { useSeo } from "@/lib/seo-helpers";
import {
  Bell, CheckCheck, Loader2, Trash2,
  CreditCard, Package, Wrench, Scale, BadgeCheck, Banknote, MessageCircle,
  Eye, EyeOff,
} from "lucide-react";
import {
  fetchNotifications, markAllRead, markRead, deleteNotification, deleteReadNotifications,
  getCategory, TYPE_META, NotifItem,
  type Notification, type Category,
} from "@/components/ui/NotificationBell";

const FILTER_TABS: Array<{ id: Category | "all"; label: string; Icon: React.ElementType }> = [
  { id: "all",          label: "Todas",        Icon: Bell },
  { id: "payment",      label: "Pagos",        Icon: CreditCard },
  { id: "order",        label: "Pedidos",      Icon: Package },
  { id: "booking",      label: "Servicios",    Icon: Wrench },
  { id: "dispute",      label: "Disputas",     Icon: Scale },
  { id: "verification", label: "Verificación", Icon: BadgeCheck },
  { id: "withdrawal",   label: "Retiros",      Icon: Banknote },
  { id: "chat",         label: "Chat",         Icon: MessageCircle },
];

type ReadFilter = "all" | "unread";

export function NotificationsPage() {
  useSeo({ title: "Notificaciones — LinkServi", noIndex: true });
  const { user, activeMode, hasDualRole } = useAuth();
  const [, navigate] = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Category | "all">("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");

  const activeRole = hasDualRole
    ? (activeMode === "secondary" ? (user?.secondaryRole ?? undefined) : (user?.role ?? undefined))
    : undefined;

  const load = async () => {
    const data = await fetchNotifications(activeRole);
    setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, activeRole]);

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleMarkOne = async (id: number) => {
    await markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleDeleteOne = async (id: number) => {
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleDeleteRead = async () => {
    await deleteReadNotifications();
    setNotifications(prev => prev.filter(n => !n.isRead));
    if (readFilter === "all") setReadFilter("unread");
  };

  const unread = notifications.filter(n => !n.isRead).length;
  const hasRead = notifications.some(n => n.isRead);

  const unreadByCategory = notifications.reduce<Record<string, number>>((acc, n) => {
    if (n.isRead) return acc;
    const cat = getCategory(n.type);
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  // Apply read filter first, then category filter
  const readFiltered = readFilter === "unread"
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const visibleTabs = FILTER_TABS.filter(tab =>
    tab.id === "all" || readFiltered.some(n => getCategory(n.type) === tab.id)
  );

  const filtered = activeFilter === "all"
    ? readFiltered
    : readFiltered.filter(n => getCategory(n.type) === activeFilter);

  const emptyMessage = () => {
    if (readFilter === "unread") {
      return {
        title: activeFilter === "all" ? "Sin notificaciones nuevas" : "Sin notificaciones nuevas aquí",
        sub: activeFilter === "all" ? "Estás completamente al día" : "No hay sin leer en esta categoría",
      };
    }
    if (activeFilter === "all") {
      return { title: "Sin notificaciones", sub: "Estás completamente al día" };
    }
    const meta = TYPE_META[activeFilter as Category];
    return {
      title: `Sin notificaciones de ${meta.label.toLowerCase()}`,
      sub: "No hay actividad en esta categoría",
    };
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
              <Bell className="w-6 h-6 text-primary" /> Notificaciones
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {unread > 0 ? `${unread} sin leer` : "Todo al día"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
              >
                <CheckCheck className="w-4 h-4" /> Leer todas
              </button>
            )}
            {hasRead && (
              <button
                onClick={handleDeleteRead}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm font-semibold hover:bg-red-400/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Eliminar leídas
              </button>
            )}
          </div>
        </div>

        {/* ── Read / Unread toggle ── */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setReadFilter("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              readFilter === "all"
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="w-4 h-4" />
            Vistas
          </button>
          <button
            onClick={() => setReadFilter("unread")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              readFilter === "unread"
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-foreground"
            }`}
          >
            <EyeOff className="w-4 h-4" />
            No vistas
            {unread > 0 && (
              <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black ${
                readFilter === "unread" ? "bg-red-500/30 text-red-300" : "bg-red-500 text-white"
              }`}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        </div>

        {/* Category filter tabs */}
        {visibleTabs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
            {visibleTabs.map(tab => {
              const isActive = activeFilter === tab.id;
              const count = tab.id === "all" ? unread : (unreadByCategory[tab.id] ?? 0);
              const meta = tab.id !== "all" ? TYPE_META[tab.id as Category] : null;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                    isActive
                      ? meta
                        ? `${meta.bg} ${meta.text} border-current/30`
                        : "bg-primary/15 text-primary border-primary/30"
                      : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {count > 0 && readFilter !== "unread" && (
                    <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black ${isActive ? "bg-current/20" : "bg-red-500 text-white"}`}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Result count */}
        {!loading && (
          <p className="text-xs text-muted-foreground mb-3">
            <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
            {readFilter === "unread" ? "sin leer" : `notificación${filtered.length !== 1 ? "es" : ""}`}
          </p>
        )}

        {/* List */}
        <div className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Cargando notificaciones...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center px-6">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                readFilter === "unread" ? "bg-emerald-500/10" : "bg-white/[0.05]"
              }`}>
                {readFilter === "unread"
                  ? <CheckCheck className="w-10 h-10 text-emerald-400 opacity-60" />
                  : <Bell className="w-10 h-10 opacity-20" />
                }
              </div>
              <div>
                <p className="font-bold text-foreground text-base">{emptyMessage().title}</p>
                <p className="text-sm text-muted-foreground mt-1">{emptyMessage().sub}</p>
              </div>
              {activeFilter !== "all" && (
                <button
                  onClick={() => setActiveFilter("all")}
                  className="text-sm text-primary hover:underline font-semibold"
                >
                  Ver todas las categorías
                </button>
              )}
            </div>
          ) : (
            filtered.map(n => (
              <NotifItem
                key={n.id}
                n={n}
                onMarkRead={handleMarkOne}
                onDelete={handleDeleteOne}
                onNavigate={(url) => navigate(url)}
                userRole={activeRole ?? user?.role}
              />
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
