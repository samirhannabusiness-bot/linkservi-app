export function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("sl_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getRequestOptions() {
  return { request: { headers: getAuthHeader() } };
}

async function bookingAction(bookingId: number, action: string, body?: Record<string, unknown>) {
  const res = await fetch(`/api/bookings/${bookingId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Error al ejecutar ${action}`);
  return res.json();
}

export const startBooking = (id: number) => bookingAction(id, "start");
export const finishBooking = (id: number) => bookingAction(id, "finish");
export const completeBookingWithPayment = (id: number, paymentMethod: string, paymentNote?: string) =>
  bookingAction(id, "complete", { paymentMethod, paymentNote });
export const disputeBooking = (id: number, reason: string) =>
  bookingAction(id, "dispute", { reason });
export const submitPaymentProof = (
  id: number,
  proofUrl: string,
  method: string,
  paymentAmount?: number,
  paymentReference?: string,
  bcvRateUsed?: number,
  bcvAmountBs?: number,
) =>
  bookingAction(id, "submit-proof", { proofUrl, method, paymentAmount, paymentReference, bcvRateUsed, bcvAmountBs });
export const confirmPayment = (id: number) =>
  bookingAction(id, "confirm-payment", {});
export const rejectPayment = (id: number, reason: string) =>
  bookingAction(id, "reject-payment", { reason });

// Códigos de gating progresivo emitidos por el backend en respuestas 403.
// Cuando llegan, disparamos un CustomEvent global ("sl:verification-required")
// que un listener en App.tsx convierte en toast con CTA "Verificar ahora".
export type VerificationCode = "EMAIL_NOT_VERIFIED" | "PROFILE_INCOMPLETE";
export interface VerificationAction { label: string; href: string }
export interface VerificationErrorPayload {
  code: VerificationCode;
  message: string;
  action?: VerificationAction;
}

// Helper público para call sites que usan `fetch()` directamente (C2PModal,
// WorkerWithdrawalsPage, etc.). Recibe la Response y opcionalmente el body
// ya parseado. Si es un 403 con code de verificación, dispara el mismo evento
// global que apiFetch. Devuelve true si emitió (útil para que el caller decida
// no mostrar su propio mensaje de error).
export function notifyIfVerificationRequired(res: Response, body: any): boolean {
  if (res.status !== 403 || !body?.code) return false;
  if (body.code !== "EMAIL_NOT_VERIFIED" && body.code !== "PROFILE_INCOMPLETE") return false;
  try {
    window.dispatchEvent(new CustomEvent<VerificationErrorPayload>("sl:verification-required", {
      detail: { code: body.code, message: body.error ?? "Acción bloqueada", action: body.action },
    }));
  } catch { /* SSR */ }
  return true;
}

// Generic fetch helper — merges auth header automatically, throws on HTTP errors
// Devuelve null si el body está vacío (ej. 204 No Content); por eso el tipo
// retornado es T | null, dejando al consumidor manejar el caso vacío.
export async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  const headers: Record<string, string> = {
    ...(options?.body ? { "Content-Type": "application/json" } : {}),
    ...(options?.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let body: any = null;
    try { body = await res.json(); msg = body?.error ?? msg; } catch {}
    // Verificación progresiva: si es 403 con code conocido, emitimos evento
    // global para que la UI muestre el toast/CTA. Igualmente lanzamos el
    // Error para que el consumidor pueda hacer su propio manejo.
    if (res.status === 403 && body?.code && (body.code === "EMAIL_NOT_VERIFIED" || body.code === "PROFILE_INCOMPLETE")) {
      try {
        window.dispatchEvent(new CustomEvent<VerificationErrorPayload>("sl:verification-required", {
          detail: { code: body.code, message: msg, action: body.action },
        }));
      } catch { /* SSR / window inexistente */ }
    }
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

// ── Analytics event tracking — fire-and-forget, never blocks UI ───────────────
const SESSION_ID = (() => {
  const k = "sl_sid";
  let s = sessionStorage.getItem(k);
  if (!s) { s = Math.random().toString(36).slice(2); sessionStorage.setItem(k, s); }
  return s;
})();

export function track(event: string, meta?: Record<string, unknown>): void {
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ event, meta, sessionId: SESSION_ID }),
    }).catch(() => {});
  } catch {}
}

// GPS location saving
export async function saveUserLocation(latitude: number, longitude: number): Promise<void> {
  const res = await fetch("/api/profile/location", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ latitude, longitude }),
  });
  if (!res.ok) throw new Error("Failed to save location");
}

export async function saveWorkerLocation(lat: number, lng: number): Promise<void> {
  const res = await fetch("/api/workers/me/location", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) throw new Error("Failed to save worker location");
}
