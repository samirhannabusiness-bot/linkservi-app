import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { AppLayout } from "@/components/layout/AppLayout";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  MessageSquare, Wrench, ShoppingBag, Briefcase,
  ChevronRight, Loader2, Inbox,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────────
type InboxType = "service" | "store" | "job";

interface UnifiedConversation {
  id: string;
  type: InboxType;
  title: string;
  subtitle: string;
  avatarUrl?: string | null;
  avatarInitial: string;
  lastMessage: string;
  timestamp: Date;
  unreadCount: number;
  statusLabel?: string;
  route: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function AvatarCircle({ url, initial, color }: { url?: string | null; initial: string; color: string }) {
  if (url) {
    const src = url.startsWith("http") || url.startsWith("/api/") ? url : `/api/storage${url}`;
    return <img src={src} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" alt={initial} />;
  }
  return (
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-lg"
      style={{ background: color, color: "#fff" }}>
      {initial.toUpperCase()}
    </div>
  );
}

const TYPE_CONFIG: Record<InboxType, { label: string; Icon: React.ElementType; color: string; avatarBg: string }> = {
  service: { label: "Servicio", Icon: Wrench,      color: "#22d3ee", avatarBg: "rgba(6,182,212,0.25)" },
  store:   { label: "Tienda",   Icon: ShoppingBag,  color: "#a78bfa", avatarBg: "rgba(139,92,246,0.25)" },
  job:     { label: "Empleo",   Icon: Briefcase,    color: "#fbbf24", avatarBg: "rgba(251,191,36,0.22)" },
};

const TAB_FILTERS: { key: InboxType | "all"; label: string }[] = [
  { key: "all",     label: "Todos" },
  { key: "service", label: "Servicios" },
  { key: "store",   label: "Tienda" },
  { key: "job",     label: "Empleo" },
];

// ─── Component ───────────────────────────────────────────────────────────────
export function UnifiedInboxPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<UnifiedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<InboxType | "all">("all");

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const role = user?.role;
      const isWorker = role === "worker";

      const [bookingsRes, storeRes, jobRes] = await Promise.allSettled([
        fetch(`/api/bookings?role=${isWorker ? "worker" : "client"}`, { headers }).then(r => r.ok ? r.json() : []),
        fetch("/api/store-messages/conversations", { headers }).then(r => r.ok ? r.json() : []),
        fetch("/api/jobs/conversations", { headers }).then(r => r.ok ? r.json() : []),
      ]);

      const merged: UnifiedConversation[] = [];

      // ── Service bookings ────────────────────────────────────────────────────
      const bookings: any[] = bookingsRes.status === "fulfilled" ? (Array.isArray(bookingsRes.value) ? bookingsRes.value : []) : [];
      for (const b of bookings) {
        const other = isWorker ? b.clientName : b.workerName;
        merged.push({
          id: `service_${b.id}`,
          type: "service",
          title: other ?? "Usuario",
          subtitle: b.categoryName ?? b.description ?? "Servicio",
          avatarUrl: isWorker ? b.clientAvatarUrl : b.workerAvatarUrl,
          avatarInitial: (other ?? "U").charAt(0),
          lastMessage: b.description ?? "Conversación de servicio",
          timestamp: new Date(b.updatedAt ?? b.createdAt),
          unreadCount: 0,
          statusLabel: b.status,
          route: isWorker ? `/professional/chat/${b.id}` : `/client/chat/${b.id}`,
        });
      }

      // ── Store conversations ─────────────────────────────────────────────────
      const storeConvs: any[] = storeRes.status === "fulfilled" ? (Array.isArray(storeRes.value) ? storeRes.value : []) : [];
      for (const s of storeConvs) {
        const isCoHost = s.isCoHost;
        const title = isCoHost ? (s.buyerName ?? "Comprador") : (s.storeName ?? "Tienda");
        merged.push({
          id: `store_${s.storeId}_${s.buyerId}`,
          type: "store",
          title,
          subtitle: isCoHost ? "Mensaje de cliente" : "Consulta de tienda",
          avatarUrl: isCoHost ? s.buyerAvatarUrl : s.storeLogoUrl,
          avatarInitial: title.charAt(0),
          lastMessage: s.lastMessage ?? "Nuevo mensaje",
          timestamp: new Date(s.lastAt ?? Date.now()),
          unreadCount: s.unreadCount ?? 0,
          route: `/store-chat/${s.storeId}`,
        });
      }

      // ── Job conversations ───────────────────────────────────────────────────
      const jobConvs: any[] = jobRes.status === "fulfilled" ? (Array.isArray(jobRes.value) ? jobRes.value : []) : [];
      for (const j of jobConvs) {
        const msg = j.lastMessage;
        let preview = msg?.content ?? "Sin mensajes";
        if (msg?.messageType === "audio") preview = "🎤 Nota de voz";
        else if (msg?.messageType === "image") preview = "📷 Imagen";
        else if (msg?.messageType === "document") preview = "📎 Documento";

        merged.push({
          id: `job_${j.id}`,
          type: "job",
          title: j.otherUser?.name ?? "Usuario",
          subtitle: j.role === "employer" ? "Empresa" : "Postulante",
          avatarUrl: j.otherUser?.avatarUrl,
          avatarInitial: (j.otherUser?.name ?? "U").charAt(0),
          lastMessage: preview,
          timestamp: new Date(j.lastMessageAt ?? Date.now()),
          unreadCount: j.unreadCount ?? 0,
          route: `/jobs/chat/${j.id}`,
        });
      }

      // Sort newest first
      merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setConversations(merged);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  const filtered = tab === "all" ? conversations : conversations.filter(c => c.type === tab);
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <>
      <Sidebar />
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-5 pb-10">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-white">Mensajería Central</h1>
              <p className="text-xs text-white/40 mt-0.5">
                {conversations.length} conversaciones
                {totalUnread > 0 && <span className="ml-1.5 text-cyan-400 font-bold">· {totalUnread} sin leer</span>}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
              <MessageSquare className="w-5 h-5 text-cyan-400" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {TAB_FILTERS.map(({ key, label }) => {
              const count = key === "all" ? conversations.length : conversations.filter(c => c.type === key).length;
              const active = tab === key;
              return (
                <button key={key} onClick={() => setTab(key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all"
                  style={active
                    ? { background: "linear-gradient(135deg,#06b6d4,#3b82f6)", color: "#fff" }
                    : { color: "rgba(255,255,255,0.4)" }}>
                  {label}
                  {count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black"
                      style={{ background: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)" }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <Inbox className="w-6 h-6 text-white/20" />
              </div>
              <p className="text-white/40 font-semibold text-sm">
                {tab === "all" ? "No tienes conversaciones aún" : `Sin conversaciones de ${TAB_FILTERS.find(t => t.key === tab)?.label}`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((conv) => {
                const cfg = TYPE_CONFIG[conv.type];
                const Icon = cfg.Icon;
                const hasUnread = conv.unreadCount > 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => navigate(conv.route)}
                    className="group w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all hover:scale-[1.005] active:scale-[0.99]"
                    style={hasUnread ? {
                      background: `linear-gradient(135deg, ${cfg.color}0D 0%, rgba(255,255,255,0.04) 100%)`,
                      border: `1px solid ${cfg.color}35`,
                    } : {
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <AvatarCircle url={conv.avatarUrl} initial={conv.avatarInitial} color={cfg.avatarBg} />
                      {/* Type badge */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "#0B0F19", border: `1.5px solid ${cfg.color}` }}>
                        <Icon className="w-2.5 h-2.5" style={{ color: cfg.color }} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <p className={`text-sm truncate ${hasUnread ? "font-black text-white" : "font-semibold text-white/70"}`}>
                          {conv.title}
                        </p>
                        <p className={`text-[10px] flex-shrink-0 tabular-nums ${hasUnread ? "text-white/60 font-semibold" : "text-white/30"}`}>
                          {formatDistanceToNow(conv.timestamp, { locale: es, addSuffix: false })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: `${cfg.color}18`, color: cfg.color }}>
                          {cfg.label}
                        </p>
                        {conv.statusLabel && (
                          <p className="text-[10px] text-white/30 truncate">{conv.statusLabel}</p>
                        )}
                      </div>
                      <p className={`text-xs truncate mt-1 ${hasUnread ? "text-white/75 font-medium" : "text-white/35"}`}>
                        {conv.lastMessage}
                      </p>
                    </div>

                    {/* Unread badge + arrow */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {hasUnread ? (
                        <span className="min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                          style={{ background: cfg.color }}>
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                      )}
                      <ChevronRight className={`w-4 h-4 transition-all group-hover:translate-x-0.5 ${hasUnread ? "text-white/50" : "text-white/15"}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    </>
  );
}
