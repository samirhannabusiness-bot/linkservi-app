import { useState, useEffect } from "react";
import { getAuthHeader } from "@/lib/api";

export interface AnalyticsData {
  totalEarnings: number;
  completedJobs: number;
  avgRating: number;
  reviewCount: number;
  acceptanceRate: number | null;
  byStatus: Record<string, number>;
  weeklyEarnings: { week: string; earnings: number; jobs: number }[];
  monthlyEarnings: { month: string; earnings: number; jobs: number }[];
  recentReviews: { rating: number; date: string }[];
}

export function useWorkerAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workers/me/analytics", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("No se pudo cargar las analíticas"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
