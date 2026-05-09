import { useState, useEffect } from "react";
import { getAuthHeader } from "@/lib/api";

export interface PremiumPreview {
  plan: string;
  monthlyVolumeUsd: number;
  currentRate: number;
  premiumRate: number;
  potentialSavings: number;
  lostEarnings: number;
  planCostUsd: number;
  salesNeededToBreakEven: number;
  remainingSalesNeeded: number;
  alreadyPremium: boolean;
  isSeller: boolean;
  currentFeePaid?: number;
  premiumFeePaid?: number;
}

export function usePremiumPreview() {
  const [data, setData] = useState<PremiumPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/premium-preview", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
