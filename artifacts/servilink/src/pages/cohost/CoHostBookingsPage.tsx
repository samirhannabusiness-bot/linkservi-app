import { useState } from "react";
import { Calendar, CheckCircle, XCircle, Clock } from "lucide-react";
import { useCohostBookings, useBookingAction } from "@/hooks/cohost";
import { SkeletonCard, QueryError } from "@/components/ui/Skeleton";

const statusLabel: Record<string, string> = {
  pending: "Pendiente", accepted: "Aceptado", in_progress: "En progreso",
  completed: "Completado", cancelled: "Cancelado", payment_confirmed: "Pago confirmado",
  finished: "Finalizado",
};
const statusColor: Record<string, string> = {
  pending: "bg-amber-400/20 text-amber-400",
  accepted: "bg-blue-400/20 text-blue-400",
  in_progress: "bg-violet-400/20 text-violet-400",
  completed: "bg-emerald-400/20 text-emerald-400",
  cancelled: "bg-red-400/20 text-red-400",
  payment_confirmed: "bg-cyan-400/20 text-cyan-400",
  finished: "bg-teal-400/20 text-teal-400",
};

export function CoHostBookingsPage() {
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "completed">("all");

  const { data: bookings = [], isLoading, isError, refetch } = useCohostBookings();
  const bookingAction = useBookingAction();

  const handleAction = (id: number, action: "accept" | "reject") => {
    bookingAction.mutate({ id, action });
  };

  const filtered = (bookings as any[]).filter((b: any) => {
    if (filter === "pending") return b.status === "pending";
    if (filter === "active") return ["accepted", "in_progress", "payment_confirmed"].includes(b.status);
    if (filter === "completed") return ["completed", "cancelled"].includes(b.status);
    return true;
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Solicitudes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todas las solicitudes de los profesionales que gestionas
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "active", "completed"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? "btn-gradient text-white" : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            {{ all: "Todas", pending: "Pendientes", active: "Activas", completed: "Completadas" }[f]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : isError ? (
        <QueryError
          message="No se pudieron cargar las solicitudes"
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-foreground font-medium">No hay solicitudes en esta categoría</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b: any) => (
            <div key={b.id} className="glass rounded-2xl p-4 transition-opacity duration-200"
              style={{ opacity: bookingAction.isPending && bookingAction.variables?.id === b.id ? 0.6 : 1 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[b.status] ?? "bg-muted/50 text-muted-foreground"}`}>
                      {statusLabel[b.status] ?? b.status}
                    </span>
                    <span className="text-sm font-semibold text-foreground">${b.totalAmount?.toFixed(2) ?? "0.00"}</span>
                    <span className="text-xs text-muted-foreground">#{b.id}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Profesional: <span className="text-foreground">{b.workerName}</span>
                  </div>
                  {b.scheduledAt && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(b.scheduledAt).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Recibido: {new Date(b.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>

                {b.status === "pending" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAction(b.id, "accept")}
                      disabled={bookingAction.isPending}
                      className="flex items-center gap-1 text-xs bg-emerald-400/20 text-emerald-400 px-3 py-1.5 rounded-lg hover:bg-emerald-400/30 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Aceptar
                    </button>
                    <button
                      onClick={() => handleAction(b.id, "reject")}
                      disabled={bookingAction.isPending}
                      className="flex items-center gap-1 text-xs bg-red-400/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-400/30 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Rechazar
                    </button>
                  </div>
                )}

                {/* Optimistic feedback for non-pending states */}
                {(b.status === "accepted" || b.status === "cancelled") && bookingAction.variables?.id === b.id && (
                  <span className={`text-xs font-medium flex-shrink-0 ${b.status === "accepted" ? "text-emerald-400" : "text-red-400"}`}>
                    {b.status === "accepted" ? "✓ Aceptado" : "✗ Rechazado"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
