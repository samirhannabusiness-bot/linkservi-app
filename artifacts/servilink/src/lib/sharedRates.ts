// Module-level store — RateCard publishes here, sticky bar reads from here
// No context/provider needed; backend caches rates so both components share the same data

export interface SharedRate { rate: number; source: string }
export interface SharedRates {
  bcv:     SharedRate | null;
  binance: SharedRate | null;
  euro:    SharedRate | null;
}

let current: SharedRates = { bcv: null, binance: null, euro: null };
const listeners = new Set<(r: SharedRates) => void>();

export function publishRates(r: SharedRates) {
  current = r;
  listeners.forEach(fn => fn(r));
}

export function getSharedRates(): SharedRates { return current; }

export function subscribeRates(fn: (r: SharedRates) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
