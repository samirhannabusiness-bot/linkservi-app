import { useState, useEffect } from "react";
import { getAuthHeader } from "@/lib/api";

export interface ClientReputation {
  avgRating: number | null;
  totalRatings: number;
  tagCounts: Record<string, number>;
  completedServices: number;
  paymentRate: number | null;
}

export function useClientReputation(clientId: number | string | undefined) {
  const [data, setData] = useState<ClientReputation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/client-ratings/client/${clientId}`, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  return { data, loading };
}
