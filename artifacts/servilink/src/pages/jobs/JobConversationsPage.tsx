import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  MessageCircle, ChevronRight, Loader2, Building2,
  User, Check, CheckCheck,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────────
interface OtherUser { id: number; name: string; avatarUrl: string | null; }
interface LastMessage {
  id: number; messageType: string; content: string; senderId: number;
  readAt: string | null; createdAt: string;
}
interface Conversation {
  id: number; employerId: number; applicantId: number;
  lastMessageAt: string; createdAt: string;
  otherUser: OtherUser | null;
  lastMessage: LastMessage | null;
  unreadCount: number;
  role: "employer" | "applicant";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function av(name: string, url: string | null) {
  if (url) return <img src={url} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />;
  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-bold text-lg flex items-center justify-center flex-shrink-0">
      {name?.charAt(0).toUpperCase()}
    </div>
  );
}

function msgPreview(msg: LastMessage | null, myId: number) {
  if (!msg) return <span className="italic text-muted-foreground text-xs">Sin mensajes aún</span>;
  const mine = msg.senderId === myId;
  const prefix = mine ? "Tú: " : "";
  let text = "";
  if (msg.messageType === "audio") text = "🎤 Nota de voz";
  else if (msg.messageType === "image") text = "📷 Imagen";
  else if (msg.messageType === "document") text = "📎 Documento";
  else text = msg.content;
  return (
    <span className="text-xs text-muted-foreground truncate">
      {mine && (
        msg.readAt
          ? <CheckCheck className="inline w-3 h-3 text-cyan-400 mr-1" />
          : <Check className="inline w-3 h-3 text-muted-foreground mr-1" />
      )}
      {prefix}{text}
    </span>
  );
}

function timeLabel(ts: string) {
  const d = new Date(ts);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ayer";
  return format(d, "d/MM", { locale: es });
}

// ─── Main page ───────────────────────────────────────────────────────────────
export function JobConversationsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await apiFetch("/api/jobs/conversations", { headers: getAuthHeader() });
      setConvs(data ?? []);
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Error al cargar conversaciones");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  return (
    <AppLayout>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Mensajes — Empleo</h1>
                <p className="text-xs text-muted-foreground">Chat entre empresarios y postulantes</p>
              </div>
            </div>
          </div>

          <div className="max-w-2xl mx-auto p-4">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}

            {!loading && error && (
              <div className="text-center py-20">
                <p className="text-destructive text-sm">{error}</p>
                <button onClick={load} className="mt-3 text-xs text-primary hover:underline">Reintentar</button>
              </div>
            )}

            {!loading && !error && convs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                  <MessageCircle className="w-8 h-8 text-violet-500/60" />
                </div>
                <p className="text-foreground font-semibold">No tienes conversaciones</p>
                <p className="text-muted-foreground text-sm text-center max-w-xs">
                  Las conversaciones aparecerán aquí cuando un Empresario Premium inicie un chat desde la Bolsa de Empleo.
                </p>
                <button
                  onClick={() => navigate("/jobs")}
                  className="mt-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors"
                >
                  Ver Bolsa de Empleo
                </button>
              </div>
            )}

            {!loading && convs.map(conv => {
              const other = conv.otherUser;
              const name = other?.name ?? "Usuario";
              const hasUnread = conv.unreadCount > 0;

              return (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/jobs/chat/${conv.id}`)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-muted/50 active:bg-muted transition-colors mb-1 text-left"
                >
                  <div className="relative">
                    {av(name, other?.avatarUrl ?? null)}
                    {/* Role badge */}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center">
                      {conv.role === "employer"
                        ? <Building2 className="w-2.5 h-2.5 text-violet-500" />
                        : <User className="w-2.5 h-2.5 text-emerald-500" />}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                        {name}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {timeLabel(conv.lastMessage?.createdAt ?? conv.lastMessageAt)}
                        </span>
                        {hasUnread && (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
                            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {msgPreview(conv.lastMessage, user?.id ?? -1)}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {conv.role === "employer" ? "Empresario (tú)" : "Postulante (tú)"}
                    </p>
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
