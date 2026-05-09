import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { MessageCircle, Store, ChevronRight, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Conversation {
  storeId: number;
  buyerId: number;
  storeName: string;
  storeLogoUrl: string | null;
  buyerName: string;
  coHostId: number;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
}

export function StoreChatListPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    apiFetch<Conversation[]>("/api/store-messages/conversations", { headers: getAuthHeader() })
      .then(data => setConvos(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const openChat = (c: Conversation) => {
    if (user?.id === c.coHostId) {
      navigate(`/store-chat/${c.storeId}/buyer/${c.buyerId}`);
    } else {
      navigate(`/store-chat/${c.storeId}`);
    }
  };

  return (
    <div className="h-screen bg-[#040c1a] overflow-hidden">
      <Sidebar />
      <main className="md:ml-64 h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)" }}>
                <MessageCircle className="w-5 h-5 text-cyan-400" />
              </div>
              <h1 className="text-xl font-bold text-white">Mensajes de Tienda</h1>
            </div>
            <p className="text-sm text-white/40 ml-12">Conversaciones con compradores y vendedores</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-white/40">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Cargando conversaciones...</span>
            </div>
          ) : convos.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <MessageCircle className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/50 font-medium">Sin conversaciones aún</p>
              <p className="text-white/25 text-sm mt-1">Cuando contactes a una tienda aparecerá aquí</p>
            </div>
          ) : (
            <div className="space-y-2">
              {convos.map(c => {
                const isCohost = user?.id === c.coHostId;
                const otherName = isCohost ? c.buyerName : c.storeName;
                const logo = c.storeLogoUrl;

                return (
                  <button
                    key={`${c.storeId}-${c.buyerId}`}
                    onClick={() => openChat(c)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all hover:bg-white/[0.06] active:scale-[0.99]"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    {/* Avatar */}
                    {logo ? (
                      <img src={logo} alt={c.storeName} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #0e7490, #7c3aed)" }}>
                        <Store className="w-6 h-6 text-white" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-white text-sm truncate">{otherName}</p>
                        {c.lastAt && (
                          <span className="text-[10px] text-white/30 flex-shrink-0">
                            {formatDistanceToNow(new Date(c.lastAt), { locale: es, addSuffix: false })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-white/40 truncate flex-1">{c.lastMessage}</p>
                        {c.unreadCount > 0 && (
                          <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500 text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      {isCohost && (
                        <p className="text-[10px] text-cyan-400/60 mt-0.5">Tienda: {c.storeName}</p>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
