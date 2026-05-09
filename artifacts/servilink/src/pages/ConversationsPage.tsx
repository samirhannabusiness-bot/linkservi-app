import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MessageSquare, Search, ChevronRight, Clock, Zap, Trash2, X, AlertTriangle } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

function initials(name?: string) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function relativeTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Ayer";
  return format(date, "d MMM", { locale: es });
}

function avatarColor(name?: string) {
  const colors = [
    "from-blue-500 to-blue-700",
    "from-emerald-500 to-emerald-700",
    "from-violet-500 to-violet-700",
    "from-rose-500 to-rose-700",
    "from-amber-500 to-amber-700",
    "from-cyan-500 to-cyan-700",
    "from-indigo-500 to-indigo-700",
    "from-teal-500 to-teal-700",
  ];
  if (!name) return colors[0];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function getHiddenKey(userId: number, role: string) {
  return `hidden_chats_${role}_${userId}`;
}

interface ConversationsPageProps {
  role: "client" | "worker";
}

export function ConversationsPage({ role }: ConversationsPageProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Load hidden IDs from localStorage
  useEffect(() => {
    if (!user?.id) return;
    const key = getHiddenKey(user.id, role);
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
      setHiddenIds(new Set(stored));
    } catch {
      setHiddenIds(new Set());
    }
  }, [user?.id, role]);

  useEffect(() => {
    const url = role === "worker"
      ? "/api/bookings?role=worker"
      : "/api/bookings";

    apiFetch(url, { headers: getAuthHeader() })
      .then((data: any[]) => {
        const sorted = [...data].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setBookings(sorted);
      })
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [role]);

  const hideChat = useCallback((bookingId: number) => {
    if (!user?.id) return;
    const key = getHiddenKey(user.id, role);
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.add(bookingId);
      localStorage.setItem(key, JSON.stringify([...next]));
      return next;
    });
    setConfirmDeleteId(null);
  }, [user?.id, role]);

  const filtered = bookings.filter(b => {
    if (hiddenIds.has(b.id)) return false;
    const q = search.toLowerCase();
    const other = role === "worker" ? b.clientName : b.workerName;
    return (
      !q ||
      other?.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q) ||
      String(b.id).includes(q)
    );
  });

  function openChat(bookingId: number) {
    navigate(`/${role}/chat/${bookingId}`);
  }

  const confirmBooking = bookings.find(b => b.id === confirmDeleteId);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-foreground">Conversaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role === "worker"
              ? "Tus chats con clientes"
              : "Tus chats con profesionales"
            }
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, descripción o #ID..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border animate-pulse">
                <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {search ? "Sin resultados" : "Aún no tienes conversaciones"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search
                  ? "Intenta con otro término de búsqueda."
                  : role === "client"
                    ? "Solicita un servicio para comenzar a chatear."
                    : "Cuando recibas una solicitud, aparecerá aquí."
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(booking => {
              const otherName = role === "worker" ? booking.clientName : booking.workerName;
              const isInquiry = booking.bookingType === "inquiry";
              const isCancelled = booking.status === "cancelled";

              return (
                <div key={booking.id} className="relative group/row">
                  <button
                    onClick={() => openChat(booking.id)}
                    className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all text-left group pr-12
                      ${isCancelled
                        ? "border-border bg-card opacity-60 hover:opacity-80"
                        : "border-border bg-card hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
                      }`}
                  >
                    {/* Avatar */}
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarColor(otherName)} flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm`}>
                      {initials(otherName)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">{otherName}</p>
                          {isInquiry && (
                            <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              <Zap className="w-2.5 h-2.5" />
                              Cotización
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{relativeTime(booking.createdAt)}</span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        #{booking.id} · {booking.description ?? "Sin descripción"}
                      </p>

                      <div className="mt-1.5">
                        <StatusBadge status={booking.status} />
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 group-hover:text-primary transition-colors" />
                  </button>

                  {/* Delete button — shown on hover */}
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(booking.id); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center
                      text-muted-foreground/0 group-hover/row:text-muted-foreground
                      bg-transparent group-hover/row:bg-muted/60
                      hover:!text-red-400 hover:!bg-red-500/10
                      transition-all duration-150 opacity-0 group-hover/row:opacity-100"
                    title="Eliminar conversación"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDeleteId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground text-sm">Eliminar conversación</h2>
                  <p className="text-xs text-muted-foreground">#{confirmDeleteId}</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-1">
              ¿Quieres eliminar el chat con{" "}
              <span className="font-medium text-foreground">
                {role === "worker" ? confirmBooking?.clientName : confirmBooking?.workerName}
              </span>
              ?
            </p>
            <p className="text-xs text-muted-foreground/70 mb-5">
              Solo desaparecerá de tu lista. El historial de mensajes no se borra.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => hideChat(confirmDeleteId)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
