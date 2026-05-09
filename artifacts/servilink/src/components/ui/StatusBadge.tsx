import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; classes: string }> = {
  pending:           { label: "Pendiente",              classes: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700" },
  accepted:          { label: "Pago requerido",         classes: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700" },
  payment_pending:   { label: "Verificando pago",       classes: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:border-cyan-700" },
  payment_confirmed: { label: "Pago confirmado",        classes: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:border-teal-700" },
  in_progress:       { label: "En Progreso",            classes: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:border-purple-700" },
  finished:          { label: "Finalizado",             classes: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:border-orange-700" },
  completed:         { label: "Completado",             classes: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700" },
  cancelled:         { label: "Cancelado",              classes: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:border-red-700" },
  disputed:                 { label: "En Disputa",            classes: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:border-rose-700" },
  dispute_in_review:        { label: "Disputa en Revisión",   classes: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:border-orange-700" },
  dispute_resolved_client:  { label: "Resuelta: Cliente",     classes: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700" },
  dispute_resolved_worker:  { label: "Resuelta: Profesional",  classes: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:border-teal-700" },
  approved:                 { label: "Aprobado",              classes: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, classes: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", config.classes)}>
      {config.label}
    </span>
  );
}
