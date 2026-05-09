import { Zap } from "lucide-react";

interface ServiScoreProps {
  rating: number;
  completedJobs: number;
  isVerified?: boolean;
  size?: "sm" | "md" | "lg";
}

export function calcServiScore(rating: number, completedJobs: number, isVerified: boolean) {
  const ratingScore  = Math.min((rating / 5) * 55, 55);
  const jobsScore    = Math.min(completedJobs * 1.5, 35);
  const verifiedBonus = isVerified ? 10 : 0;
  return Math.round(ratingScore + jobsScore + verifiedBonus);
}

function getScoreColor(score: number) {
  if (score >= 80) return { text: "text-emerald-400", bg: "bg-emerald-400", ring: "ring-emerald-400/30", label: "Excelente" };
  if (score >= 60) return { text: "text-cyan-400",    bg: "bg-cyan-400",    ring: "ring-cyan-400/30",    label: "Bueno"      };
  if (score >= 40) return { text: "text-amber-400",   bg: "bg-amber-400",   ring: "ring-amber-400/30",   label: "Regular"    };
  return               { text: "text-rose-400",    bg: "bg-rose-400",    ring: "ring-rose-400/30",    label: "Nuevo"      };
}

export function ServiScore({ rating, completedJobs, isVerified = false, size = "md" }: ServiScoreProps) {
  const score = calcServiScore(rating, completedJobs, isVerified);
  const { text, bg, ring, label } = getScoreColor(score);

  if (size === "sm") {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ${ring} bg-card`}>
        <Zap className={`w-2.5 h-2.5 ${text}`} />
        <span className={`text-[10px] font-black ${text}`}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    );
  }

  if (size === "lg") {
    return (
      <div className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border ring-1 ${ring}`}>
        <div className="flex items-center gap-2">
          <Zap className={`w-5 h-5 ${text}`} />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ServiScore</span>
        </div>
        <div className="flex items-end gap-1">
          <span className={`text-5xl font-black ${text} leading-none`}>{score}</span>
          <span className="text-muted-foreground text-sm mb-1">/100</span>
        </div>
        {/* Progress bar */}
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${bg} rounded-full transition-all duration-700`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${text}`}>{label}</span>
        <div className="grid grid-cols-3 gap-3 w-full mt-1 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Calificación</p>
            <p className="text-sm font-bold text-foreground">{rating.toFixed(1)} ⭐</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Trabajos</p>
            <p className="text-sm font-bold text-foreground">{completedJobs}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Verificado</p>
            <p className="text-sm font-bold text-foreground">{isVerified ? "✅" : "❌"}</p>
          </div>
        </div>
      </div>
    );
  }

  // md (default)
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ring-1 ${ring} bg-card`}>
      <Zap className={`w-3.5 h-3.5 ${text}`} />
      <div className="flex items-center gap-1">
        <span className={`text-sm font-black ${text}`}>{score}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      <span className={`text-xs font-semibold ${text}`}>· {label}</span>
    </div>
  );
}
