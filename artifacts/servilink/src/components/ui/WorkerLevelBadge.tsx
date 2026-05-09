import { Star, Shield, TrendingUp } from "lucide-react";

export type WorkerLevel = "nuevo" | "verificado" | "top";

export function getWorkerLevel(completedJobs: number, rating: number, isVerified: boolean): WorkerLevel {
  if (completedJobs >= 20 || rating >= 4.7) return "top";
  if (isVerified || completedJobs >= 5) return "verificado";
  return "nuevo";
}

const LEVELS = {
  nuevo: {
    label: "Nuevo",
    icon: Star,
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
  },
  verificado: {
    label: "Verificado",
    icon: Shield,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  top: {
    label: "Top Profesional",
    icon: TrendingUp,
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  },
};

interface WorkerLevelBadgeProps {
  completedJobs: number;
  rating: number;
  isVerified: boolean;
  size?: "sm" | "md";
}

export function WorkerLevelBadge({ completedJobs, rating, isVerified, size = "sm" }: WorkerLevelBadgeProps) {
  const level = getWorkerLevel(completedJobs, rating, isVerified);
  const conf = LEVELS[level];
  const Icon = conf.icon;
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${textSize} ${conf.className}`}>
      <Icon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {conf.label}
    </span>
  );
}
