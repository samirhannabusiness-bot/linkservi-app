import { useState, useEffect, useRef } from "react";

export interface BcvRate {
  rate: number;
  fetchedAt: string;
  source: string;
  nextRefreshIn: number;
}

interface UseBcvRateResult {
  data: BcvRate | null;
  loading: boolean;
  error: string | null;
  /** Convert a USD amount to Bs string, e.g. formatBs(50) → "Bs. 23.821,00" */
  formatBs: (usd: number) => string;
}

const CLIENT_CACHE_MS = 5 * 60 * 1000; // re-fetch after 5 min client-side
let _clientCache: { data: BcvRate; at: number } | null = null;

function formatBs(rate: number, usd: number): string {
  const bs = usd * rate;
  return "Bs. " + bs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function useBcvRate(): UseBcvRateResult {
  const [data, setData] = useState<BcvRate | null>(_clientCache?.data ?? null);
  const [loading, setLoading] = useState(!_clientCache);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const cacheStale = !_clientCache || Date.now() - _clientCache.at > CLIENT_CACHE_MS;
    if (!cacheStale) { setData(_clientCache!.data); setLoading(false); return; }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    setLoading(true);

    fetch("/api/bcv-rate")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BcvRate>;
      })
      .then((d) => {
        if (cancelled) return;
        _clientCache = { data: d, at: Date.now() };
        setData(d);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No se pudo cargar la tasa BCV");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return {
    data,
    loading,
    error,
    formatBs: (usd: number) => data ? formatBs(data.rate, usd) : "—",
  };
}
