import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useFavorites } from "@/hooks/useFavorites";
import { Heart, Star, MapPin, ArrowLeft, RotateCcw, Loader2 } from "lucide-react";
import { WorkerLevelBadge } from "@/components/ui/WorkerLevelBadge";
import { FavoriteButton } from "@/components/ui/FavoriteButton";
import { mediaSrc } from "@/lib/media-url";

export function FavoritesPage() {
  const [, navigate] = useLocation();
  const { favorites, loading, error, refetch: load } = useFavorites();

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/client")}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Heart className="w-6 h-6 text-red-500 fill-red-500" /> Mis favoritos
            </h1>
            <p className="text-sm text-muted-foreground">Profesionales que guardaste</p>
          </div>
        </div>

        {loading && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Cargando favoritos...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && favorites.length === 0 && (
          <div className="py-20 text-center bg-card border border-border rounded-2xl">
            <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground">Aún no tienes favoritos</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Guarda profesionales tocando el ❤️ en su perfil
            </p>
            <button
              onClick={() => navigate("/client/search")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Explorar profesionales
            </button>
          </div>
        )}

        {!loading && favorites.length > 0 && (
          <div className="space-y-3">
            {favorites.map((w) => (
              <div
                key={w.id}
                className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {w.avatarUrl ? (
                      <img
                        src={mediaSrc(w.avatarUrl)}
                        alt={w.name}
                        className="w-14 h-14 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <span className="text-xl font-bold text-primary">{w.name[0]}</span>
                      </div>
                    )}
                    {w.isAvailable && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-background" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-bold text-foreground truncate">{w.name}</p>
                      {w.isVerified && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">✓ Verificado</span>}
                    </div>
                    {w.categoryName && (
                      <p className="text-xs text-muted-foreground mb-1">{w.categoryName}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {(w.rating ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          {w.rating?.toFixed(1)} ({w.reviewCount ?? 0})
                        </span>
                      )}
                      {(w.state || w.city) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[w.city, w.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {w.servicePrice && (
                        <span className="font-semibold text-foreground">${w.servicePrice}/hr</span>
                      )}
                    </div>
                    {w.completedJobs != null && w.completedJobs > 0 && (
                      <div className="mt-1">
                        <WorkerLevelBadge completedJobs={w.completedJobs} rating={w.rating ?? 0} isVerified={w.isVerified ?? false} />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <FavoriteButton
                      workerId={w.id}
                      initialFavorited={true}
                      size="sm"
                      onToggle={(fav) => {
                        if (!fav) setFavorites(prev => prev.filter(f => f.id !== w.id));
                      }}
                    />
                    <button
                      onClick={() => navigate(`/client/worker/${w.id}`)}
                      className="text-xs px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                    >
                      Ver perfil
                    </button>
                  </div>
                </div>

                {/* Rebook button */}
                <div className="mt-3 pt-3 border-t border-border">
                  <button
                    onClick={() => navigate(`/client/book/${w.id}`)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Contratar de nuevo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
