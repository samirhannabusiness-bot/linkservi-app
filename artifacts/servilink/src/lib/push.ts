import { getAuthHeader } from "./api";

let vapidKeyCache: string | null = null;

async function getVapidPublicKey(): Promise<string> {
  if (vapidKeyCache) return vapidKeyCache;
  const res = await fetch("/api/push/vapid-key");
  const data = await res.json();
  vapidKeyCache = data.publicKey as string;
  return vapidKeyCache;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer.slice(0) as ArrayBuffer;
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const vapidKey = await getVapidPublicKey();

    // Reuse existing subscription if still valid
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const sub = subscription.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
    });

    return res.ok;
  } catch (err) {
    console.warn("[Push] Subscribe failed:", err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/unsubscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn("[Push] Unsubscribe failed:", err);
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission === "granted") {
    return subscribeToPush();
  }
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    return subscribeToPush();
  }
  return false;
}

// Called after login — silently subscribe if permission already granted
export async function autoSubscribeIfPermitted(): Promise<void> {
  try {
    if (!isPushSupported()) return;
    if (Notification.permission !== "granted") return;
    const token = localStorage.getItem("sl_token");
    if (!token) return;
    await subscribeToPush();
  } catch {}
}
