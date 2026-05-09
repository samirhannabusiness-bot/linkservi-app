import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface RateEntry {
  rate: number;
  fetchedAt: Date;
  source: string;
}

// ── Per-source caches ─────────────────────────────────────────────────────────

const TTL_SLOW = 10 * 60 * 1000;  // BCV USD + EUR — 10 min
const TTL_FAST = 30 * 1000;        // Binance P2P — 30 s (real-time market)

let cacheBcv: RateEntry | null = null;
let cacheEur: RateEntry | null = null;
let cacheBnb: RateEntry | null = null;

function isValid(c: RateEntry | null, ttl: number): boolean {
  return c !== null && Date.now() - c.fetchedAt.getTime() < ttl;
}

// ── DolarApi helper ───────────────────────────────────────────────────────────

async function dolarApi(slug: "oficial" | "paralelo"): Promise<number> {
  const res = await fetch(`https://ve.dolarapi.com/v1/dolares/${slug}`, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ve.dolarapi.com/${slug} → ${res.status}`);
  const data = await res.json() as { promedio?: number; venta?: number };
  const rate = data.promedio ?? data.venta;
  if (!rate || typeof rate !== "number") throw new Error(`bad shape from dolarapi/${slug}`);
  return rate;
}

// ── BCV USD — Tasa oficial BCV ────────────────────────────────────────────────

async function refreshBcv(): Promise<RateEntry> {
  try {
    const rate = await dolarApi("oficial");
    cacheBcv = { rate, fetchedAt: new Date(), source: "BCV / ve.dolarapi.com" };
    logger.info({ rate, source: cacheBcv.source }, "BCV USD refreshed");
    return cacheBcv;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "BCV primary failed — trying open.er-api fallback");
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`open.er-api.com → ${res.status}`);
    const data = await res.json() as { rates?: Record<string, number> };
    const rate = data.rates?.["VES"];
    if (!rate) throw new Error("VES missing");
    cacheBcv = { rate, fetchedAt: new Date(), source: "open.er-api.com" };
    logger.info({ rate, source: cacheBcv.source }, "BCV USD refreshed via fallback");
    return cacheBcv;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "BCV fallback failed");
  }
  if (cacheBcv) { logger.warn("Serving stale BCV cache"); return cacheBcv; }
  throw new Error("Could not fetch BCV rate");
}

// ── Binance P2P — Precio real USDT/VES del mercado P2P de Binance ─────────────

async function fetchBinanceP2P(): Promise<number> {
  const body = JSON.stringify({
    fiat: "VES", page: 1, rows: 20, tradeType: "BUY", asset: "USDT",
    countries: [], proMerchantAds: false, shieldMerchantAds: false,
    filterType: "all", periods: [], additionalKycVerifyFilter: 0,
    publisherType: null, payTypes: [], classifies: ["mass", "profession"],
  });
  const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Binance P2P → HTTP ${res.status}`);
  const data = await res.json() as { data?: Array<{ adv?: { price?: string } }> };
  const prices = (data.data ?? [])
    .map(d => parseFloat(d.adv?.price ?? ""))
    .filter(p => !isNaN(p) && p > 0);
  if (prices.length === 0) throw new Error("Binance P2P: no listings returned");
  // Median of 20 listings — matches the mid-market rate users see on Binance P2P
  // Listings are sorted ascending (cheapest first); median hits listing #10,
  // which reflects the typical visible price, not an outlier floor.
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return +median.toFixed(2);
}

async function refreshBinance(): Promise<RateEntry> {
  // Primary: real Binance P2P data (direct from Binance)
  try {
    const rate = await fetchBinanceP2P();
    cacheBnb = { rate, fetchedAt: new Date(), source: "Binance P2P" };
    logger.info({ rate, source: cacheBnb.source }, "Binance P2P refreshed");
    return cacheBnb;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "Binance P2P failed — trying ve.dolarapi fallback");
  }
  // Fallback: ve.dolarapi paralelo (aggregated market)
  try {
    const rate = await dolarApi("paralelo");
    cacheBnb = { rate, fetchedAt: new Date(), source: "Paralelo / ve.dolarapi.com" };
    logger.info({ rate, source: cacheBnb.source }, "Binance fallback (dolarapi) refreshed");
    return cacheBnb;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "Binance dolarapi fallback failed");
  }
  if (cacheBnb) { logger.warn("Serving stale Binance cache"); return cacheBnb; }
  // Last resort: BCV + ~3% typical P2P spread
  if (cacheBcv) {
    const estimated = +(cacheBcv.rate * 1.03).toFixed(2);
    cacheBnb = { rate: estimated, fetchedAt: new Date(), source: "estimado (BCV+3%)" };
    logger.warn({ rate: estimated }, "Using estimated Binance rate from BCV");
    return cacheBnb;
  }
  throw new Error("Could not fetch Binance rate");
}

// ── EUR BCV — Euro a Bolívares vía BCV ───────────────────────────────────────

async function refreshEur(): Promise<RateEntry> {
  // Compute VES per EUR: get EUR/VES directly from open.er-api.com (EUR as base)
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`open.er-api/EUR → ${res.status}`);
    const data = await res.json() as { rates?: Record<string, number> };
    const rate = data.rates?.["VES"];
    if (!rate) throw new Error("VES missing from EUR base");
    cacheEur = { rate, fetchedAt: new Date(), source: "BCV EUR / open.er-api.com" };
    logger.info({ rate, source: cacheEur.source }, "EUR BCV refreshed");
    return cacheEur;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "EUR primary failed — deriving from BCV + USD/EUR cross");
  }
  // Fallback: derive from BCV rate + USD/EUR ratio
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`open.er-api/USD → ${res.status}`);
    const data = await res.json() as { rates?: Record<string, number> };
    const eurPerUsd = data.rates?.["EUR"];
    const vesPerUsd = data.rates?.["VES"];
    if (!eurPerUsd || !vesPerUsd) throw new Error("rates missing");
    // VES/EUR = VES/USD ÷ EUR/USD
    const rate = +(vesPerUsd / eurPerUsd).toFixed(4);
    cacheEur = { rate, fetchedAt: new Date(), source: "BCV EUR calculado" };
    logger.info({ rate, source: cacheEur.source }, "EUR BCV refreshed via cross-rate fallback");
    return cacheEur;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "EUR fallback failed");
  }
  if (cacheEur) { logger.warn("Serving stale EUR cache"); return cacheEur; }
  // Last resort: BCV * ~1.08 (EUR typically ~8% more expensive than USD vs VES)
  if (cacheBcv) {
    const estimated = +(cacheBcv.rate * 1.08).toFixed(2);
    cacheEur = { rate: estimated, fetchedAt: new Date(), source: "estimado (BCV×1.08)" };
    return cacheEur;
  }
  throw new Error("Could not fetch EUR rate");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

function ratePayload(entry: RateEntry, ttl: number) {
  return {
    rate: entry.rate,
    fetchedAt: entry.fetchedAt.toISOString(),
    source: entry.source,
    minutesAgo: minutesAgo(entry.fetchedAt),
    nextRefreshIn: Math.max(0, Math.floor((ttl - (Date.now() - entry.fetchedAt.getTime())) / 1000)),
  };
}

// ── Legacy route (backward compat) ────────────────────────────────────────────

router.get("/bcv-rate", async (_req, res): Promise<void> => {
  try {
    const data = isValid(cacheBcv, TTL_SLOW) ? cacheBcv! : await refreshBcv();
    res.json(ratePayload(data, TTL_SLOW));
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to get BCV rate");
    res.status(503).json({ error: "No se pudo obtener la tasa BCV en este momento" });
  }
});

// ── New combined endpoint ─────────────────────────────────────────────────────

router.get("/rates", async (_req, res): Promise<void> => {
  try {
    const [bcv, binance, eur] = await Promise.allSettled([
      isValid(cacheBcv, TTL_SLOW) ? Promise.resolve(cacheBcv!) : refreshBcv(),
      isValid(cacheBnb, TTL_FAST) ? Promise.resolve(cacheBnb!) : refreshBinance(),
      isValid(cacheEur, TTL_SLOW) ? Promise.resolve(cacheEur!) : refreshEur(),
    ]);

    res.json({
      bcv: bcv.status === "fulfilled"
        ? ratePayload(bcv.value, TTL_SLOW)
        : { error: "no disponible" },
      binance: binance.status === "fulfilled"
        ? ratePayload(binance.value, TTL_FAST)
        : { error: "no disponible" },
      euro: eur.status === "fulfilled"
        ? ratePayload(eur.value, TTL_SLOW)
        : { error: "no disponible" },
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to get combined rates");
    res.status(503).json({ error: "No se pudo obtener las tasas" });
  }
});

// ── Pre-warm all caches on startup (sequential to avoid race in fallbacks) ────

async function prewarm() {
  try { await refreshBcv(); } catch (e: any) { logger.warn({ err: e?.message }, "BCV prewarm failed"); }
  try { await refreshBinance(); } catch (e: any) { logger.warn({ err: e?.message }, "Binance prewarm failed"); }
  try { await refreshEur(); } catch (e: any) { logger.warn({ err: e?.message }, "EUR prewarm failed"); }
}

prewarm();

export default router;
