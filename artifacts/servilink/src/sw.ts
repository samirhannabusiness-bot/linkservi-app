/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare let self: ServiceWorkerGlobalScope;

// Precache static assets injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Caching strategies ────────────────────────────────────────────────────────

// Storage / upload endpoints: ALWAYS hit the network — never cache.
// Caching uploads/storage requests would silently break file pickers because
// the SW can replay stale 4xx/5xx responses or short-circuit POSTs.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/storage/") ||
    url.pathname.startsWith("/api/profile/avatar"),
  new NetworkFirst({
    cacheName: "no-cache-storage",
    networkTimeoutSeconds: 30,
    plugins: [new CacheableResponsePlugin({ statuses: [] })],
  }),
  "POST"
);
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/storage/") ||
    url.pathname.startsWith("/api/profile/avatar"),
  new NetworkFirst({
    cacheName: "no-cache-storage",
    networkTimeoutSeconds: 30,
    plugins: [new CacheableResponsePlugin({ statuses: [] })],
  }),
  "PUT"
);

// API (other GETs): NetworkFirst with 8s timeout (stale cache as fallback for offline)
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api-cache-v1",
    networkTimeoutSeconds: 8,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 5 * 60 }),
    ],
  })
);

// External fonts / CDN (Leaflet, Google Fonts): CacheFirst — long TTL
registerRoute(
  ({ url }) =>
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "unpkg.com",
  new CacheFirst({
    cacheName: "external-cdn-v1",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Images: StaleWhileRevalidate — fast load with background refresh
registerRoute(
  ({ request }) => request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: "images-v1",
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// ── Push Notifications ────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
  };

  try {
    payload = event.data.json();
  } catch {
    payload = { title: "LinkServi", body: event.data.text() ?? "" };
  }

  const options: NotificationOptions & { vibrate?: number[] } = {
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/icon-72.png",
    tag: payload.tag ?? "servilink-default",
    data: { url: payload.url ?? "/" },
    vibrate: [150, 75, 150],
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// ── Notification click → navigate to deep link ────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Find an existing window for this origin
        const match = windowClients.find(
          (c) => new URL(c.url).origin === self.location.origin
        );
        if (match) {
          match.focus();
          return match.navigate(targetUrl);
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

// ── Service Worker lifecycle ──────────────────────────────────────────────────

self.addEventListener("install", () => {
  // Take control immediately — don't wait for other tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Allow the main thread to trigger an update
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
