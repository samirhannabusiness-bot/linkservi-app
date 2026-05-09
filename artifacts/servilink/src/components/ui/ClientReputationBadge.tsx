import { Star, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { useClientReputation } from "@/hooks/useClientReputation";

const TAG_LABELS: Record<string, string> = {
  puntual: "Puntual",
  respetuoso: "Respetuoso",
  pago_a_tiempo: "Pagó a tiempo",
  comunicativo: "Comunicativo",
  amable: "Amable",
};

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3 h-3 ${
            s <= Math.round(rating)
              ? "text-amber-400 fill-amber-400"
              : "text-muted-foreground/25 fill-none"
          }`}
        />
      ))}
    </div>
  );
}

export function ClientReputationBadge({ clientId }: { clientId: number }) {
  const { data: rep, loading } = useClientReputation(clientId);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Cargando perfil...</span>
      </div>
    );
  }

  if (!rep) return null;

  const hasData = rep.totalRatings > 0;
  const topTags = Object.entries(rep.tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="mt-3 p-3 rounded-xl bg-muted/40 border border-border/60 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {hasData && rep.avgRating !== null && rep.avgRating >= 4 ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          ) : hasData ? (
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          ) : null}
          <span className="text-xs font-semibold text-foreground">
            {hasData ? "Cliente confiable" : "Cliente nuevo"}
          </span>
        </div>

        {hasData && rep.avgRating !== null ? (
          <div className="flex items-center gap-1.5">
            <StarDisplay rating={rep.avgRating} />
            <span className="text-xs font-bold text-foreground">{rep.avgRating.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">({rep.totalRatings})</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Sin calificaciones aún</span>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{rep.completedServices}</span>{" "}
          {rep.completedServices === 1 ? "servicio completado" : "servicios completados"}
        </span>
        {rep.paymentRate !== null && rep.completedServices > 0 && (
          <>
            <span className="text-border">·</span>
            <span>
              <span
                className={`font-semibold ${
                  rep.paymentRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {rep.paymentRate}%
              </span>{" "}
              pagos correctos
            </span>
          </>
        )}
      </div>

      {/* Top tags */}
      {topTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topTags.map(([key, cnt]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/20 font-medium"
            >
              {TAG_LABELS[key] ?? key}
              {cnt > 1 && <span className="text-primary/60">×{cnt}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
