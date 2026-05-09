import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { Star, Trash2, RefreshCw, MessageSquare, User, Package, AlertTriangle } from "lucide-react";

interface Rating {
  id: number;
  productRating: number;
  storeRating: number | null;
  comment: string | null;
  createdAt: string;
  productName: string | null;
  clientName: string | null;
  clientEmail: string | null;
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${s <= value ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/30"}`}
        />
      ))}
      <span className="text-xs font-bold text-amber-400 ml-1">{value}.0</span>
    </div>
  );
}

export function AdminRatingsPage() {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/product-ratings", { headers: getAuthHeader() });
      const data = await res.json();
      setRatings(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await fetch(`/api/admin/product-ratings/${id}`, { method: "DELETE", headers: getAuthHeader() });
      setRatings(r => r.filter(x => x.id !== id));
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = ratings.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.productName ?? "").toLowerCase().includes(q) ||
      (r.clientName ?? "").toLowerCase().includes(q) ||
      (r.clientEmail ?? "").toLowerCase().includes(q) ||
      (r.comment ?? "").toLowerCase().includes(q)
    );
  });

  const avgRating = ratings.length > 0
    ? (ratings.reduce((s, r) => s + r.productRating, 0) / ratings.length).toFixed(1)
    : "—";

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calificaciones de Productos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {ratings.length} {ratings.length === 1 ? "calificación" : "calificaciones"} · Promedio: ⭐ {avgRating}
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total calificaciones", value: ratings.length, icon: Star, color: "text-amber-400" },
            { label: "Promedio producto", value: avgRating + " ★", icon: Star, color: "text-emerald-400" },
            { label: "Con comentario", value: ratings.filter(r => r.comment).length, icon: MessageSquare, color: "text-blue-400" },
          ].map(stat => (
            <div key={stat.label} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Buscar por producto, usuario, comentario..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass rounded-2xl h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <Star className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-foreground font-semibold">
              {search ? "Sin resultados para tu búsqueda" : "No hay calificaciones aún"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="glass rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Product + User */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Package className="w-3.5 h-3.5 text-primary" />
                        <span className="font-semibold text-foreground">{r.productName ?? "Producto eliminado"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="w-3.5 h-3.5" />
                        <span>{r.clientName ?? "—"}</span>
                        {r.clientEmail && <span className="text-muted-foreground/60">({r.clientEmail})</span>}
                      </div>
                    </div>

                    {/* Ratings */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Producto</p>
                        <StarDisplay value={r.productRating} />
                      </div>
                      {r.storeRating != null && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Tienda</p>
                          <StarDisplay value={r.storeRating} />
                        </div>
                      )}
                    </div>

                    {/* Comment */}
                    {r.comment && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/50" />
                        <span className="italic">"{r.comment}"</span>
                      </div>
                    )}

                    {/* Date */}
                    <p className="text-[10px] text-muted-foreground/50">
                      {new Date(r.createdAt).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>

                  {/* Delete */}
                  <div className="flex-shrink-0">
                    {confirmDeleteId === r.id ? (
                      <div className="flex flex-col gap-2 items-end">
                        <div className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 rounded-lg px-2 py-1">
                          <AlertTriangle className="w-3 h-3" /> ¿Eliminar?
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deleting}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {deleting ? "..." : "Eliminar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        className="p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Eliminar calificación"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
