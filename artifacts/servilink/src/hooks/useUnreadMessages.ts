import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";

let cachedCount = 0;
let lastFetch = 0;
const LISTENERS = new Set<(n: number) => void>();

function notify(n: number) {
  cachedCount = n;
  LISTENERS.forEach(fn => fn(n));
}

async function fetchUnread(headers: Record<string, string>) {
  const now = Date.now();
  if (now - lastFetch < 20_000) return; // debounce: only fetch every 20s
  lastFetch = now;
  try {
    const [storeRes, jobRes] = await Promise.allSettled([
      fetch("/api/store-messages/conversations", { headers }).then(r => r.ok ? r.json() : []),
      fetch("/api/jobs/conversations", { headers }).then(r => r.ok ? r.json() : []),
    ]);
    const storeConvs: any[] = storeRes.status === "fulfilled" && Array.isArray(storeRes.value) ? storeRes.value : [];
    const jobConvs: any[]   = jobRes.status === "fulfilled" && Array.isArray(jobRes.value) ? jobRes.value : [];
    const total =
      storeConvs.reduce((s, c) => s + (c.unreadCount ?? 0), 0) +
      jobConvs.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
    notify(total);
  } catch {
    // silent
  }
}

export function useUnreadMessages(): number {
  const { user, token } = useAuth();
  const [count, setCount] = useState(cachedCount);

  useEffect(() => {
    LISTENERS.add(setCount);
    return () => { LISTENERS.delete(setCount); };
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    const headers = getAuthHeader();
    fetchUnread(headers);
    const id = setInterval(() => fetchUnread(headers), 30_000);
    return () => clearInterval(id);
  }, [token, user]);

  return count;
}

export function invalidateUnreadMessages() {
  lastFetch = 0;
}
