// public/sw.js
// Minimal service worker for PWA installability.
// Network-first for navigations (HTML) so every deploy takes effect on the
// next load, cache-first for content-hashed build assets, network-first for
// API/Supabase/auth.

const CACHE_NAME = "protankr-v2"; // bump this to force-invalidate stale caches on the next deploy

const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install — cache static assets that rarely change
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches (including any stale protankr-v* version)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

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

  // Navigations (full page loads) — network-first so every visit gets the
  // latest deploy's HTML and chunk references. A cache-first HTML shell is
  // what caused old JS to keep being served indefinitely after new deploys;
  // this only falls back to cache when actually offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached ?? new Response("Offline", { status: 503 }))
        )
    );
    return;
  }

  // Content-hashed build assets never change for a given URL, so cache-first
  // is safe and fast.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (event.request.method === "GET" && response.status === 200 && response.type !== "opaque") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (icons, manifest, misc images) — cache-first with
  // network fallback.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (event.request.method === "GET" && response.status === 200 && response.type !== "opaque") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
