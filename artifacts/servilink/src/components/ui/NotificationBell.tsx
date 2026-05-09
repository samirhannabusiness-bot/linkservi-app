import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Bell, Check, CheckCheck, X, Trash2,
  CreditCard, Package, Wrench, Scale, BadgeCheck, Banknote,
  MessageCircle, Clock, ArrowRight, ChevronRight
} from "lucide-react";
import { getAuthHeader } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/lib/auth-context";

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  bookingId: number | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export type Category = "payment" | "order" | "booking" | "dispute" | "verification" | "withdrawal" | "chat" | "other";

export interface TypeMeta {
  category: Category;
  Icon: React.ElementType;
  bg: string;
  text: string;
  border: string;
  label: string;
}

export const TYPE_META: Record<Category, Omit<TypeMeta, "category">> = {
  payment:      { Icon: CreditCard,     bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/50", label: "Pagos" },
  withdrawal:   { Icon: Banknote,       bg: "bg-violet-500/15",  text: "text-violet-400",  border: "border-violet-500/50",  label: "Retiros" },
  order:        { Icon: Package,        bg: "bg-blue-500/15",    text: "text-blue-400",    border: "border-blue-500/50",    label: "Pedidos" },
  booking:      { Icon: Wrench,         bg: "bg-amber-500/15",   text: "text-amber-400",   border: "border-amber-500/50",   label: "Servicios" },
  dispute:      { Icon: Scale,          bg: "bg-red-500/15",     text: "text-red-400",     border: "border-red-500/50",     label: "Disputas" },
  verification: { Icon: BadgeCheck,     bg: "bg-sky-500/15",     text: "text-sky-400",     border: "border-sky-500/50",     label: "Verificación" },
  chat:         { Icon: MessageCircle,  bg: "bg-slate-500/15",   text: "text-slate-400",   border: "border-slate-500/50",   label: "Chat" },
  other:        { Icon: Bell,           bg: "bg-muted",          text: "text-muted-foreground", border: "border-border",    label: "Otros" },
};

export function getCategory(type: string): Category {
  if (type.startsWith("payment_") || type === "withdrawal_paid") return "payment";
  if (type.startsWith("withdrawal_")) return "withdrawal";
  if (
    type.startsWith("order_") ||
    type.startsWith("product_order_") ||
    type.startsWith("store_order") ||
    type === "new_product_order" ||
    type === "admin_payment_proof"
  ) return "order";
  if (type.startsWith("dispute_") || type === "booking_disputed") return "dispute";
  if (type.startsWith("verification_")) return "verification";
  if (
    type.startsWith("premium_") ||
    type === "premium_granted" ||
    type === "premium_rejected" ||
    type === "client_premium_request" ||
    type === "premium_request" ||
    type === "info"
  ) return "verification";
  if (type.startsWith("chat_") || type === "offer_received" || type === "offer_accepted") return "chat";
  if (
    type.startsWith("booking_") || type === "new_booking" || type === "service_request" ||
    type === "counter_offer" || type === "counter_offer_accepted" || type === "counter_offer_rejected" ||
    type === "urgent_claimed" || type.startsWith("urgent_")
  ) return "booking";
  return "other";
}

export function getMeta(type: string): TypeMeta {
  const category = getCategory(type);
  return { category, ...TYPE_META[category] };
}

// ─── Deep-link URL resolver (fallback when linkUrl is not set in DB) ──────────
export function getNotificationUrl(
  type: string,
  bookingId: number | null,
  role?: string,
): string | null {
  const isStore = role === "seller" || role === "cohost";
  const isAdmin = role === "admin";

  // Helpers to navigate to the specific chat room
  const workerChat = bookingId ? `/professional/chat/${bookingId}` : "/professional/bookings";
  const clientChat = bookingId ? `/client/chat/${bookingId}` : "/client/bookings";

  // ── Admin: every type has a dedicated admin route ───────────────────────────
  if (isAdmin) {
    if (type === "booking_disputed" || type.startsWith("dispute_")) return "/admin/disputes";
    if (type === "admin_payment_proof") return "/admin/product-orders";
    if (type.startsWith("booking_") || type === "new_booking" || type === "service_request") return "/admin/bookings";
    if (type.startsWith("payment_")) return "/admin/bookings";
    if (type.startsWith("withdrawal_")) return "/admin/withdrawals";
    if (type.startsWith("verification_")) return "/admin/workers";
    if (type === "client_premium_request" || type === "premium_granted" || type === "premium_rejected") return "/admin/client-premium";
    if (type === "cohost_plan_approved" || type === "cohost_plan_request") return "/admin/cohost-plans";
    if (type === "premium_request") return "/admin/workers";
    if (
      type === "new_product_order" ||
      type.startsWith("product_order_") ||
      type.startsWith("store_order") ||
      type === "order_update"
    ) return "/admin/product-orders";
    if (type === "chat_message" || type === "chat_new_message") return "/admin";
    return "/admin";
  }

  // ── Store chat ────────────────────────────────────────────────────────────────
  if (type === "chat_message") return "/mensajes";

  // ── Service chat → specific room ─────────────────────────────────────────────
  if (type === "chat_new_message") {
    if (role === "worker") return workerChat;
    if (role === "client") return clientChat;
  }

  // ── Offer events (inquiry chat) ───────────────────────────────────────────────
  if (type === "offer_received") return clientChat;
  if (type === "offer_accepted") return workerChat;

  // ── Counter-offer events ──────────────────────────────────────────────────────
  if (type === "counter_offer") {
    if (role === "client") return clientChat;
    if (role === "worker") return workerChat;
  }
  if (type === "counter_offer_accepted") return workerChat;
  if (type === "counter_offer_rejected") return workerChat;

  // ── Urgent requests ───────────────────────────────────────────────────────────
  if (type === "urgent_claimed") {
    if (role === "client") return clientChat;  // goes to the auto-created booking chat
    return "/professional/urgencias";
  }
  if (type.startsWith("urgent_")) return "/client/urgencias";

  // ── New service request (worker) → go directly to the chat ───────────────────
  if (type === "new_booking" || type === "service_request") {
    return workerChat;
  }

  // ── Booking status changes → go to chat when possible ────────────────────────
  if (type.startsWith("booking_")) {
    // Terminal states → list (no active chat)
    if (type === "booking_cancelled" || type === "booking_completed") {
      if (role === "worker") return "/professional/bookings";
      if (role === "client") return "/client/bookings";
      return null;
    }
    // Active states → specific chat room
    if (role === "worker") return workerChat;
    if (role === "client") return clientChat;
    return null;
  }

  // ── Payment events → specific chat (that's where clients pay) ────────────────
  if (type === "payment_received") {
    if (role === "worker") return "/professional/withdrawals";
    return null;
  }
  if (type.startsWith("payment_")) {
    if (isStore) return "/cohost/orders";
    if (role === "worker") return workerChat;
    if (role === "client") return clientChat;
    return null;
  }

  // ── Withdrawals ───────────────────────────────────────────────────────────────
  if (type.startsWith("withdrawal_")) return "/professional/withdrawals";

  // ── Verification (worker) ─────────────────────────────────────────────────────
  if (type.startsWith("verification_")) return "/professional/verification";

  // ── Premium (worker) ─────────────────────────────────────────────────────────
  if (type === "premium_granted" || type === "premium_request" || type === "premium_rejected") {
    return "/professional/profile";
  }

  // ── Premium (client) ─────────────────────────────────────────────────────────
  if (type === "client_premium_request") return "/client/plan";

  // ── Plan approvals ────────────────────────────────────────────────────────────
  if (type === "cohost_plan_approved") return "/cohost/plan";

  // ── Product / store orders ────────────────────────────────────────────────────
  if (
    type === "new_product_order" ||
    type.startsWith("product_order_") ||
    type.startsWith("store_order") ||
    type === "order_update"
  ) {
    if (role === "client") return "/client/product-orders";
    if (isStore) return "/cohost/orders";
    return null;
  }

  // ── Admin payment proof ───────────────────────────────────────────────────────
  if (type === "admin_payment_proof") return "/admin/bookings";

  // ── Disputes → specific chat ──────────────────────────────────────────────────
  if (type === "booking_disputed" || type.startsWith("dispute_")) {
    if (role === "worker") return workerChat;
    if (role === "client") return clientChat;
    if (isStore) return "/cohost/orders";
    return null;
  }

  return null;
}

// ─── Sound ────────────────────────────────────────────────────────────────────
function playCashRegisterSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;
    const tone = (freq: number, start: number, duration: number, peak: number, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start); osc.stop(start + duration + 0.05);
    };
    [220, 440, 660, 880].forEach((f, i) => tone(f, t + i * 0.007, 0.07, 0.18, "triangle"));
    tone(1046.5, t + 0.07, 0.55, 0.32, "sine");
    tone(1318.5, t + 0.09, 0.45, 0.22, "sine");
    tone(1568.0, t + 0.11, 0.38, 0.16, "sine");
    [2637, 2349, 3136, 2093, 2793].forEach((f, i) => tone(f, t + 0.52 + i * 0.048, 0.14, 0.07, "triangle"));
  } catch {}
}

// ─── API helpers ──────────────────────────────────────────────────────────────
export async function fetchNotifications(role?: string): Promise<Notification[]> {
  const url = role ? `/api/notifications?role=${encodeURIComponent(role)}` : "/api/notifications";
  const res = await fetch(url, { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}
export async function markRead(id: number) {
  await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: getAuthHeader() });
}
export async function markAllRead() {
  await fetch("/api/notifications/read-all", { method: "POST", headers: getAuthHeader() });
}
export async function deleteNotification(id: number) {
  await fetch(`/api/notifications/${id}`, { method: "DELETE", headers: getAuthHeader() });
}
export async function deleteReadNotifications() {
  await fetch("/api/notifications/read", { method: "DELETE", headers: getAuthHeader() });
}

// ─── Single notification item ─────────────────────────────────────────────────
export function NotifItem({
  n, onMarkRead, onDelete, onNavigate, userRole, compact = false,
}: {
  n: Notification;
  onMarkRead: (id: number) => void;
  onDelete: (id: number) => void;
  onNavigate?: (url: string) => void;
  userRole?: string;
  compact?: boolean;
}) {
  const meta = getMeta(n.type);
  const { Icon } = meta;
  const timeAgo = n.createdAt
    ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: es })
    : "";

  const targetUrl = n.linkUrl ?? getNotificationUrl(n.type, n.bookingId, userRole);
  const isClickable = !!targetUrl && !!onNavigate;

  const handleContentClick = () => {
    if (!isClickable) return;
    if (!n.isRead) onMarkRead(n.id);
    onNavigate!(targetUrl!);
  };

  return (
    <div
      className={`flex gap-3 border-b border-white/[0.06] last:border-0 transition-colors group
        ${!n.isRead ? "bg-primary/[0.05]" : isClickable ? "hover:bg-white/[0.04]" : "hover:bg-white/[0.03]"}
        border-l-2 ${!n.isRead ? meta.border : "border-transparent"}
        ${compact ? "px-4 py-3" : "px-5 py-4"}
        ${isClickable ? "cursor-pointer" : "cursor-default"}`}
      onClick={handleContentClick}
    >
      <div className={`flex-shrink-0 mt-0.5 ${compact ? "w-8 h-8" : "w-10 h-10"} rounded-xl ${meta.bg} flex items-center justify-center`}>
        <Icon className={`${compact ? "w-4 h-4" : "w-5 h-5"} ${meta.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`${compact ? "text-xs" : "text-sm"} font-semibold leading-snug break-words ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>
            {n.title}
          </p>
          <div
            className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}
          >
            {!n.isRead && (
              <button
                onClick={() => onMarkRead(n.id)}
                className="text-primary hover:text-primary/70 transition-colors"
                title="Marcar como leída"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(n.id)}
              className="text-muted-foreground hover:text-red-400 transition-colors"
              title="Eliminar notificación"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className={`${compact ? "text-[11px] line-clamp-2" : "text-xs"} text-muted-foreground mt-0.5 leading-relaxed break-words`}>
          {n.message}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`${compact ? "text-[10px]" : "text-xs"} font-medium ${meta.text}`}>{meta.label}</span>
          <span className="text-[10px] text-muted-foreground/40">·</span>
          <span className={`${compact ? "text-[10px]" : "text-xs"} text-muted-foreground/60 flex items-center gap-0.5`}>
            <Clock className="w-2.5 h-2.5" /> {timeAgo}
          </span>
          {isClickable && (
            <span className={`ml-auto flex items-center gap-0.5 ${compact ? "text-[10px]" : "text-xs"} ${meta.text} opacity-60 group-hover:opacity-100 transition-opacity`}>
              Ver <ChevronRight className="w-3 h-3" />
            </span>
          )}
          {!isClickable && !n.isRead && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
        </div>
      </div>
    </div>
  );
}

// ─── Main header bell ─────────────────────────────────────────────────────────
export function NotificationBell() {
  const { user, activeMode, hasDualRole } = useAuth();
  const [, navigate] = useLocation();

  // Derive the currently active role string for notification filtering
  const activeRole = hasDualRole
    ? (activeMode === "secondary" ? (user?.secondaryRole ?? null) : (user?.role ?? null))
    : null; // single-role users: no filter, show all
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const soundedIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);

  const unread = notifications.filter(n => !n.isRead).length;
  const hasRead = notifications.some(n => n.isRead);
  const preview = notifications.slice(0, 6);

  const load = async () => {
    const data = await fetchNotifications(activeRole ?? undefined);
    if (!initializedRef.current) {
      for (const n of data) soundedIdsRef.current.add(n.id);
      initializedRef.current = true;
      setNotifications(data);
      return;
    }
    for (const n of data) {
      if (n.type === "withdrawal_paid" && !n.isRead && !soundedIdsRef.current.has(n.id)) {
        soundedIdsRef.current.add(n.id);
        playCashRegisterSound();
        break;
      }
    }
    setNotifications(data);
  };

  useEffect(() => {
    if (!user) return;
    // Re-initialize when role changes so sound deduplication resets
    initializedRef.current = false;
    load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [user, activeRole]);

  // Close on outside click — check all three refs (button, desktop panel, mobile panel)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton = buttonRef.current?.contains(target);
      const insideDesktop = desktopPanelRef.current?.contains(target);
      const insideMobile = mobilePanelRef.current?.contains(target);
      if (!insideButton && !insideDesktop && !insideMobile) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
  };

  const handleNavigate = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  const goToAll = () => { setOpen(false); navigate("/notificaciones"); };

  return (
    <>
      {/* ── Bell button ── */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
          ${open ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-white/70 hover:bg-white/[0.10] hover:text-white"}`}
        aria-label="Notificaciones"
      >
        <Bell style={{ width: 18, height: 18 }} className={unread > 0 ? "animate-[bell_0.5s_ease-in-out]" : ""} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* ── Mobile: full-screen overlay ── */}
      {open && (
        <div ref={mobilePanelRef} className="md:hidden fixed inset-0 z-[500] flex flex-col bg-background animate-in slide-in-from-bottom duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0 pt-safe">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Notificaciones</h2>
              {unread > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[11px] font-black">{unread}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={handleMarkAll} className="text-xs text-primary flex items-center gap-1 font-semibold">
                  <CheckCheck className="w-3.5 h-3.5" /> Leer todas
                </button>
              )}
              {hasRead && (
                <button onClick={handleDeleteRead} className="text-xs text-red-400 flex items-center gap-1 font-semibold">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar leídas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <Bell className="w-10 h-10 opacity-20" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Sin notificaciones</p>
                  <p className="text-sm text-muted-foreground mt-1">Estás al día con todo</p>
                </div>
              </div>
            ) : (
              notifications.map(n => (
                <NotifItem
                  key={n.id}
                  n={n}
                  onMarkRead={handleMarkOne}
                  onDelete={handleDeleteOne}
                  onNavigate={handleNavigate}
                  userRole={activeRole ?? user?.role}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="flex-shrink-0 px-5 py-4 border-t border-white/[0.08]">
              <button
                onClick={goToAll}
                className="w-full py-3 rounded-xl btn-gradient text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                Ver todas las notificaciones <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Desktop: dropdown panel ── */}
      {open && (
        <div
          ref={desktopPanelRef}
          className="hidden md:flex flex-col fixed z-[500] top-16 right-4 w-[380px] max-h-[560px] bg-[#0d0e14] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08] flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Notificaciones</h3>
              {unread > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">{unread} sin leer</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={handleMarkAll} className="text-xs text-primary hover:text-primary/70 flex items-center gap-1 font-semibold transition-colors">
                  <CheckCheck className="w-3.5 h-3.5" /> Leer todas
                </button>
              )}
              {hasRead && (
                <button onClick={handleDeleteRead} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar leídas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {preview.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
                <div className="w-16 h-16 rounded-full bg-white/[0.05] flex items-center justify-center">
                  <Bell className="w-8 h-8 opacity-20" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Sin notificaciones</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Estás al día con todo</p>
                </div>
              </div>
            ) : (
              preview.map(n => (
                <NotifItem
                  key={n.id}
                  n={n}
                  onMarkRead={handleMarkOne}
                  onDelete={handleDeleteOne}
                  onNavigate={handleNavigate}
                  userRole={activeRole ?? user?.role}
                  compact
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-white/[0.08]">
            <button
              onClick={goToAll}
              className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              Ver todas las notificaciones <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
