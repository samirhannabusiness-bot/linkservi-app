import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { ChevronLeft, MapPin, Calendar, Briefcase, Star, MessageSquare, ShieldCheck, ShieldAlert, Award } from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { es } from "date-fns/locale";
import { mediaSrc } from "@/lib/media-url";

const TAG_LABELS: Record<string, string> = {
  puntual: "Puntual",
  respetuoso: "Respetuoso",
  pago_a_tiempo: "Pagó a tiempo",
  comunicativo: "Comunicativo",
  amable: "Amable",
};

interface ClientReputation {
  avgRating: number | null;
  totalRatings: number;
  tagCounts: Record<string, number>;
  completedServices: number;
  paymentRate: number | null;
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${s <= rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export function ClientPublicProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reputation, setReputation] = useState<ClientReputation | null>(null);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/users/${clientId}/profile`, { headers: getAuthHeader() }).then((r) => {
        if (!r.ok) throw new Error("No encontrado");
        return r.json();
      }),
      fetch(`/api/client-ratings/client/${clientId}`, { headers: getAuthHeader() }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([prof, rep]) => {
        setProfile(prof);
        if (rep) setReputation(rep);
      })
      .catch(() => setError("No se pudo cargar el perfil del cliente."))
      .finally(() => setLoading(false));
  }, [clientId]);

  const avgRating =
    profile?.reviews?.length > 0
      ? profile.reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / profile.reviews.length
      : null;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-5 pb-8">
        {/* Back */}
        <button
          onClick={() => navigate("/professional")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver al dashboard
        </button>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
        )}

        {profile && !loading && (
          <>
            {/* Profile header card */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center gap-4 text-center">
              <div className="relative">
                {profile.avatarUrl ? (
                  <img
                    src={mediaSrc(profile.avatarUrl)}
                    alt={profile.name}
                    className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/20"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                    <span className="text-3xl font-bold text-primary">{profile.name?.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>

              <div>
                <h1 className="text-xl font-bold text-foreground">{profile.name}</h1>
                {(profile.city || profile.state) && (
                  <div className="flex items-center justify-center gap-1 mt-1 text-muted-foreground text-sm">
                    <MapPin className="w-3.5 h-3.5" />
                    {[profile.city, profile.state].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="w-full grid grid-cols-3 divide-x divide-border border border-border rounded-xl overflow-hidden bg-background">
                <div className="py-3 px-2 text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Briefcase className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-lg font-bold text-foreground">{profile.bookingCount}</p>
                  <p className="text-xs text-muted-foreground">Solicitudes</p>
                </div>
                <div className="py-3 px-2 text-center">
                  <div className="flex items-center justify-center mb-1">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-lg font-bold text-foreground">{profile.reviews?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Reseñas dadas</p>
                </div>
                <div className="py-3 px-2 text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {profile.memberSince ? format(new Date(profile.memberSince), "MMM yyyy", { locale: es }) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Miembro desde</p>
                </div>
              </div>

              {avgRating !== null && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <StarRow rating={Math.round(avgRating)} />
                  <span className="font-medium text-foreground">{avgRating.toFixed(1)}</span>
                  <span>promedio en reseñas</span>
                </div>
              )}
            </div>

            {/* Client reputation from workers */}
            {reputation && (
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  Reputación como cliente
                </h2>

                {reputation.totalRatings === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún no tiene calificaciones de profesionales.</p>
                ) : (
                  <>
                    {/* Summary row */}
                    <div className="flex items-center gap-3">
                      {reputation.avgRating !== null && reputation.avgRating >= 4 ? (
                        <ShieldCheck className="w-8 h-8 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <ShieldAlert className="w-8 h-8 text-amber-500 flex-shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-4 h-4 ${
                                  reputation.avgRating !== null && s <= Math.round(reputation.avgRating)
                                    ? "text-amber-400 fill-amber-400"
                                    : "text-muted-foreground/25"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="font-bold text-foreground text-lg">
                            {reputation.avgRating?.toFixed(1)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({reputation.totalRatings} {reputation.totalRatings === 1 ? "evaluación" : "evaluaciones"})
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Calificado por profesionales de LinkServi
                        </p>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-center">
                        <p className="text-xl font-bold text-foreground">{reputation.completedServices}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {reputation.completedServices === 1 ? "Servicio completado" : "Servicios completados"}
                        </p>
                      </div>
                      {reputation.paymentRate !== null && (
                        <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-center">
                          <p className={`text-xl font-bold ${reputation.paymentRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {reputation.paymentRate}%
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">Tasa de pago</p>
                        </div>
                      )}
                    </div>

                    {/* Tags */}
                    {Object.keys(reputation.tagCounts).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lo que dicen los profesionales</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(reputation.tagCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([key, cnt]) => (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-primary/8 text-primary border border-primary/20 font-medium"
                              >
                                {TAG_LABELS[key] ?? key}
                                <span className="text-primary/60 text-xs">×{cnt}</span>
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Reviews given */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Reseñas que ha dejado
              </h2>

              {profile.reviews?.length === 0 ? (
                <div className="text-center py-10 bg-card border border-border rounded-xl">
                  <MessageSquare className="w-9 h-9 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Aún no ha dejado reseñas.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.reviews?.map((r: any) => {
                    const dateStr = r.createdAt
                      ? formatDistanceToNowStrict(new Date(r.createdAt), { locale: es, addSuffix: true })
                      : "";
                    return (
                      <div key={r.id} className="p-4 bg-card border border-border rounded-xl space-y-2">
                        {/* Worker info */}
                        <div className="flex items-center gap-2">
                          {r.workerAvatarUrl ? (
                            <img
                              src={mediaSrc(r.workerAvatarUrl)}
                              alt={r.workerName}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-primary">{r.workerName?.charAt(0)}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">A {r.workerName}</p>
                            <p className="text-xs text-muted-foreground">{dateStr}</p>
                          </div>
                          <StarRow rating={r.rating} />
                        </div>
                        {r.comment ? (
                          <p className="text-sm text-muted-foreground leading-relaxed">"{r.comment}"</p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 italic">Sin comentario</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
