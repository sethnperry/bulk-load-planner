"use client";
// app/planner/hooks/useOrientation.ts
//
// Detects "screen is wider than it is tall, with enough room for a real
// two-column layout" -- the signal the Planner page uses to rearrange
// itself in landscape (see app/planner/page.tsx and
// app/planner/sections/PlannerControls.tsx).
//
// SSR-safe by the same pattern this codebase already established for
// useNow() (app/planner's clock hook) and useTheme.ts: darkMode/isLandscape
// both start at their neutral/default value on the server AND the client's
// very first render (nothing to mismatch), and only resolve to the real
// value inside a client-only useEffect. This project has hit real
// hydration-mismatch bugs twice before from reading a browser-only API
// synchronously in a lazy useState initializer -- not repeating that here.
//
// matchMedia (not a resize listener) is used specifically so a real device
// rotation fires the "change" event even when the raw pixel dimensions end
// up close to what they were -- width/height literally swap on rotation,
// which orientation media features are built to detect directly.

import { useEffect, useState } from "react";

export function useIsLandscape(minWidth = 640): boolean {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(orientation: landscape) and (min-width: ${minWidth}px)`);
    const update = () => setIsLandscape(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [minWidth]);

  return isLandscape;
}
