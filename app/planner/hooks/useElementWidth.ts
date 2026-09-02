"use client";
// app/planner/hooks/useElementWidth.ts
//
// Measures an element's own live rendered width AND how much vertical
// space is left below it in the viewport -- used by the Planner's
// landscape scale-to-fit block (page.tsx) to know how much real width is
// actually available (for the width-driven uniform scale), and how much
// real height is left below the row (for each column's own independent
// scroll region), rather than approximating either from a guessed
// constant. That approximation approach already bit this project once
// (the landscape row's own maxWidth:1100 cap went unaccounted-for in an
// earlier pass, see CLAUDE.md's landscape-refinement history) --
// measuring the real DOM box directly can't drift out of sync with
// whatever CSS actually constrains it.
//
// availableHeight is deliberately NOT "this element's own clientHeight"
// (which would just report however tall its content naturally is,
// unbounded and useless for sizing a scroll region) -- it's
// `window.innerHeight - element's own top`, i.e. "how much of the
// viewport is left below wherever this row actually starts," which
// stays meaningful without requiring the whole page to be restructured
// into a height-bounded flex chain just to make one measurement
// possible.
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
// FitHeading.tsx already uses successfully in this codebase), on
// visualViewport's own "resize"/"scroll" events (see below), and on a
// burst of settle-timers after mount, extended further (up to 3s) than
// the original 1s window -- a real device's hydration/layout settle can
// plausibly run slower than this session's own test environment, and a
// timer schedule that ends too early just freezes on whatever the layout
// happened to look like at that moment, same failure shape as the
// ResizeObserver gap above.
//
// Reported width is capped at window.visualViewport's own width when
// available, never just the measured element's clientWidth alone --
// found live, on a real Android phone in landscape: the OS's own
// on-screen navigation bar rotates to a vertical strip on one edge of
// the screen in landscape, and can overlap web content the page's own
// box-model layout has no way to know about (the DOM's clientWidth
// reflects the CSS layout viewport, which doesn't necessarily shrink for
// this the way it does for an on-screen keyboard). visualViewport is
// specifically the API for "how much is actually visible right now,"
// which is what this hook is really trying to answer -- clientWidth
// alone can report more room than genuinely exists on-screen. The same
// reasoning applies to availableHeight -- visualViewport.height, when
// available, wins over window.innerHeight.
//
// SSR/first-paint-safe: width/availableHeight start at 0 ("not measured
// yet" -- callers should treat 0 as a sentinel, not a real value) and
// only ever change from real client-side measurements.

import { useCallback, useRef, useState } from "react";

const SETTLE_DELAYS_MS = [0, 50, 150, 400, 1000, 2000, 3000];

export function useElementWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const [availableHeight, setAvailableHeight] = useState(0);
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
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      setWidth(vv ? Math.min(el.clientWidth, vv.width) : el.clientWidth);
      const viewportH = vv ? vv.height : window.innerHeight;
      const top = el.getBoundingClientRect().top;
      setAvailableHeight(Math.max(0, viewportH - top));
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

  return { ref, width, availableHeight };
}
