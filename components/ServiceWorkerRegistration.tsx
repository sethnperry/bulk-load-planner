"use client";
// components/ServiceWorkerRegistration.tsx
// Registers the service worker on mount.
// Import this in app/layout.tsx.

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Only auto-reload when a service worker was already controlling this
    // page (i.e. an update took over mid-session or on a later visit) --
    // not on a brand-new user's very first install, which would otherwise
    // cause a surprising extra reload right after their first page load.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    if (hadController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[SW] registered:", reg.scope);
        // Check for a new version whenever the tab regains focus -- PWAs
        // often stay backgrounded for a long time between opens.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update();
        });
      })
      .catch((err) => console.error("[SW] registration failed:", err));
  }, []);

  return null;
}
