import { Shield, CheckCircle, Star, Briefcase } from "lucide-react";

interface TrustScoreProps {
  isVerified: boolean;
  completedJobs: number;
  rating: number;
  reviewCount: number;
}

export function TrustScore({ isVerified, completedJobs, rating, reviewCount }: TrustScoreProps) {
  const completionRate = completedJobs > 0 ? Math.min(100, Math.round((completedJobs / (completedJobs + 1)) * 100)) : 0;
  const trustScore = Math.round(
    (isVerified ? 30 : 0) +
    Math.min(40, completedJobs * 2) +
    Math.min(30, rating * 6)
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 bg-card border border-border rounded-xl text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          <Briefcase className="w-3.5 h-3.5 text-primary" />
          <span className="text-lg font-bold text-foreground">{completedJobs}</span>
        </div>
        <p className="text-xs text-muted-foreground">Trabajos</p>
      </div>
      <div className="p-3 bg-card border border-border rounded-xl text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="text-lg font-bold text-foreground">{rating?.toFixed(1)}</span>
        </div>
        <p className="text-xs text-muted-foreground">{reviewCount} reseñas</p>
      </div>
      <div className="p-3 bg-card border border-border rounded-xl text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-lg font-bold text-foreground">{completionRate}%</span>
        </div>
        <p className="text-xs text-muted-foreground">Cumplimiento</p>
      </div>
      <div className="p-3 bg-card border border-border rounded-xl text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          <Shield className={`w-3.5 h-3.5 ${isVerified ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-lg font-bold text-foreground">{trustScore}</span>
        </div>
        <p className="text-xs text-muted-foreground">Trust Score</p>
      </div>
    </div>
  );
}
