import { User as UserIcon, BadgeCheck, Briefcase, Car, type LucideIcon } from "lucide-react";
import type { AppMode } from "@/lib/auth-context";

export type ModeMeta = {
  label: string;
  icon: LucideIcon;
  accent: string;
  textOnAccent: string;
  gradient: string;
  ring: string;
  glow: string;
  description: string;
  home: string;
};

export const MODE_META: Record<AppMode, ModeMeta> = {
  client: {
    label: "Cliente",
    icon: UserIcon,
    accent: "#38bdf8",
    textOnAccent: "#0f172a",
    gradient: "from-cyan-400 to-sky-500",
    ring: "rgba(56,189,248,0.35)",
    glow: "rgba(56,189,248,0.18)",
    description: "Busca y contrata servicios",
    home: "/client",
  },
  worker: {
    label: "Profesional",
    icon: BadgeCheck,
    accent: "#34d399",
    textOnAccent: "#052e1f",
    gradient: "from-emerald-400 to-teal-500",
    ring: "rgba(52,211,153,0.35)",
    glow: "rgba(52,211,153,0.18)",
    description: "Ofrece tus servicios y recibe ingresos",
    home: "/professional",
  },
  manager: {
    label: "Gestor",
    icon: Briefcase,
    accent: "#fbbf24",
    textOnAccent: "#3b1f00",
    gradient: "from-amber-400 to-orange-500",
    ring: "rgba(251,191,36,0.4)",
    glow: "rgba(251,191,36,0.18)",
    description: "Gestiona negocios y genera ingresos desde este panel",
    home: "/manager",
  },
  driver: {
    label: "Conductor",
    icon: Car,
    accent: "#a855f7",
    textOnAccent: "#1f0938",
    gradient: "from-violet-400 to-purple-600",
    ring: "rgba(168,85,247,0.4)",
    glow: "rgba(168,85,247,0.2)",
    description: "Recibe viajes en tiempo real y genera ingresos en la calle",
    home: "/driver/transport",
  },
};

export function getModeMeta(mode: AppMode): ModeMeta {
  return MODE_META[mode] ?? MODE_META.client;
}
