import { useEffect, useRef, useState, useCallback } from "react";

const POLL_INTERVAL_MS = 8000;
const STORAGE_KEY = "sl_seen_pending_ids";

function getSeenIds(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<number>) {
  try {
    // Keep only last 500 IDs to prevent unbounded growth
    const arr = [...ids].slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTone = (freq: number, startTime: number, duration: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const t = ctx.currentTime;
    playTone(880, t, 0.25, 0.35);
    playTone(1100, t + 0.2, 0.25, 0.3);
    playTone(1320, t + 0.4, 0.4, 0.25);
  } catch {}
}

export interface AlertBooking {
  id: number;
  categoryName: string;
  clientName: string;
  address: string;
  description: string;
  clientBudget?: number | null;
  totalAmount?: number | null;
  isUrgent: boolean;
  createdAt: string;
}

export function useNewBookingAlert(isWorker: boolean) {
  const [queue, setQueue] = useState<AlertBooking[]>([]);
  const seenRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);
  const tokenRef = useRef<string | null>(null);

  // Keep token up to date
  useEffect(() => {
    tokenRef.current = localStorage.getItem("sl_token");
  });

  const fetchPending = useCallback(async () => {
    const token = tokenRef.current ?? localStorage.getItem("sl_token");
    if (!token || !isWorker) return;

    try {
      const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${baseUrl}/api/bookings?role=worker&status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: any[] = await res.json();

      const seen = seenRef.current;

      if (!initializedRef.current) {
        // First load: mark all as seen silently so we only alert for *future* ones
        for (const b of data) seen.add(b.id);
        saveSeenIds(seen);
        initializedRef.current = true;
        return;
      }

      const newOnes: AlertBooking[] = [];
      for (const b of data) {
        if (!seen.has(b.id)) {
          seen.add(b.id);
          newOnes.push({
            id: b.id,
            categoryName: b.categoryName ?? "Servicio",
            clientName: b.clientName ?? "Cliente",
            address: b.address ?? "",
            description: b.description ?? "",
            clientBudget: b.clientBudget,
            totalAmount: b.totalAmount,
            isUrgent: b.description?.startsWith("[URGENTE]") ?? false,
            createdAt: b.createdAt,
          });
        }
      }
      saveSeenIds(seen);

      if (newOnes.length > 0) {
        playAlertSound();
        setQueue((prev) => [...prev, ...newOnes]);
      }
    } catch {}
  }, [isWorker]);

  useEffect(() => {
    if (!isWorker) return;
    // Load previously seen IDs from localStorage
    seenRef.current = getSeenIds();

    // Initial fetch (to mark existing as seen)
    fetchPending();

    const interval = setInterval(fetchPending, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isWorker, fetchPending]);

  const dismissFirst = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const current = queue[0] ?? null;

  return { current, queueLength: queue.length, dismissFirst };
}
