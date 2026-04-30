"use client";
// components/ServiceWorkerRegistration.tsx
// Registers the service worker on mount.
// Import this in app/layout.tsx.

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("[SW] registered:", reg.scope))
        .catch((err) => console.error("[SW] registration failed:", err));
    }
  }, []);

  return null;
}
