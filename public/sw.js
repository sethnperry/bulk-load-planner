// public/sw.js
// Minimal service worker for PWA installability.
// Cache-first for static assets, network-first for API/Supabase calls.

const CACHE_NAME = "protankr-v1";

const STATIC_ASSETS = [
  "/",
  "/calculator",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install — cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API calls, cache-first for everything else
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go network-first for Supabase, API routes, and auth
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful GET responses
        if (
          event.request.method === "GET" &&
          response.status === 200 &&
          response.type !== "opaque"
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached ?? new Response("Offline", { status: 503 }));
    })
  );
});
