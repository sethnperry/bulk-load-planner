"use client";
// app/planner/hooks/useElementWidth.ts
//
// Measures an element's own live rendered width -- used by the Planner's
// landscape scale-to-fit block (page.tsx) to know how much real width is
// actually available, rather than approximating it from window.innerWidth
// minus a guessed set of paddings. That approximation approach already
// bit this project once (the landscape row's own maxWidth:1100 cap went
// unaccounted-for in an earlier pass, see CLAUDE.md's landscape-
// refinement history) -- measuring the real DOM box directly can't drift
// out of sync with whatever CSS actually constrains it.
//
// Callback ref, not a plain useRef + one-time useEffect -- a plain ref's
// setup effect (empty dependency array) only ever runs once per mount,
// so if the element the ref points to gets torn down and replaced by a
// different DOM node later, the one-time effect never notices and never
// re-attaches. A callback ref fires on every attach/detach, so a fresh
// observer is always wired to whatever the CURRENT real node is.
//
// ResizeObserver alone isn't enough here, confirmed live: this hook's
// element genuinely resizes shortly after mount (page.tsx's own
// isLandscape/isWide hooks resolve asynchronously after their SSR-safe
// portrait default, and that resolution changes this element's parent's
// maxWidth/padding, which is a real, DOM-visible size change) -- but in
// at least one real test environment the ResizeObserver's callback fired
// exactly once, for the initial size, and never again for that
// subsequent change (debug-logged and confirmed: one "sync" entry, zero
// "ro" entries, ever). Rather than trust ResizeObserver alone, this also
// re-measures on a window "resize" listener (the same fallback
// FitHeading.tsx already uses successfully in this codebase) and on a
// short burst of settle-timers after mount (0/50/150/400/1000ms) to
// catch a late layout correction regardless of what caused it or
// whether ResizeObserver noticed.
//
// SSR/first-paint-safe: width starts at 0 ("not measured yet" -- callers
// should treat 0 as a sentinel, not a real width) and only ever changes
// from real client-side measurements.

import { useCallback, useRef, useState } from "react";

const SETTLE_DELAYS_MS = [0, 50, 150, 400, 1000];

export function useElementWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const resizeListenerRef = useRef<(() => void) | null>(null);

  const ref = useCallback((el: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (resizeListenerRef.current) {
      window.removeEventListener("resize", resizeListenerRef.current);
      resizeListenerRef.current = null;
    }
    if (!el) return;

    const measure = () => setWidth(el.clientWidth);
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    observerRef.current = ro;

    window.addEventListener("resize", measure);
    resizeListenerRef.current = measure;

    timersRef.current = SETTLE_DELAYS_MS.map((ms) => setTimeout(measure, ms));
  }, []);

  return { ref, width };
}
