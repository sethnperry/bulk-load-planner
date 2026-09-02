"use client";
// app/planner/hooks/useNaturalHeight.ts
//
// Measures an element's own natural (unclamped, unscaled) content height --
// used by the Planner's landscape scale-to-fit block (page.tsx) to compute
// a HEIGHT-aware ceiling for its uniform transform:scale, alongside the
// existing width-based one (useElementWidth). Without this, rowScale was
// purely width-driven: on a device with generous width but only middling
// height, the block would scale up to fill the available WIDTH regardless
// of whether that made it taller than the available height, real symptoms
// confirmed live -- "we are still stretching things wide and it leaves a
// space below the CG slider" (the compartments column, forced by flex
// align-items:stretch to match a taller sibling column, left dead space
// below its own actual content once that sibling needed its own internal
// scroll).
//
// Deliberately reads the ref'd element's own getBoundingClientRect().height
// rather than the OUTER column div that wraps it -- that outer div carries
// `maxHeight`+`overflowY:auto` (the existing independent-scroll mechanism),
// so its own rendered height is already CAPPED and would report a clamped,
// not natural, value -- exactly the circularity this hook exists to avoid.
// Ref an inner wrapper with no height constraint of its own instead (see
// page.tsx's own use), so this always reflects the content's true,
// uncapped size regardless of whatever cap the outer column currently has
// (itself derived from the very rowScale this height feeds into).
//
// Same measurement-robustness pattern as useElementWidth.ts, for the same
// reasons documented there -- callback ref (survives the element being
// torn down/replaced), ResizeObserver + a window "resize" fallback +
// visualViewport listeners + a burst of settle-timers (a real device's
// hydration/layout settle can run slower than this session's own test
// environment, and a schedule that ends too early just freezes on
// whatever the layout happened to look like at that moment).
//
// SSR/first-paint-safe: height starts at 0 ("not measured yet" -- callers
// should treat 0 as a sentinel, not a real value) and only ever changes
// from real client-side measurements.

import { useCallback, useRef, useState } from "react";

const SETTLE_DELAYS_MS = [0, 50, 150, 400, 1000, 2000, 3000];

export function useNaturalHeight<T extends HTMLElement>() {
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cleanupFnsRef = useRef<(() => void)[]>([]);

  const ref = useCallback((el: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    cleanupFnsRef.current.forEach((fn) => fn());
    cleanupFnsRef.current = [];
    if (!el) return;

    const measure = () => {
      setHeight(el.getBoundingClientRect().height);
    };
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    observerRef.current = ro;

    window.addEventListener("resize", measure);
    cleanupFnsRef.current.push(() => window.removeEventListener("resize", measure));

    if (window.visualViewport) {
      const vv = window.visualViewport;
      vv.addEventListener("resize", measure);
      vv.addEventListener("scroll", measure);
      cleanupFnsRef.current.push(() => {
        vv.removeEventListener("resize", measure);
        vv.removeEventListener("scroll", measure);
      });
    }

    timersRef.current = SETTLE_DELAYS_MS.map((ms) => setTimeout(measure, ms));
  }, []);

  return { ref, height };
}
