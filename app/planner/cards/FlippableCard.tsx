"use client";
// app/planner/cards/FlippableCard.tsx
//
// Generic card-flip shell: tap the front to rotate to a taller back face
// (edit form), tap a close control on the back to rotate back. No existing
// flip/3D-transform pattern exists elsewhere in this codebase -- built from
// scratch for this feature.
//
// Front and back are naturally different heights (the back hosts a full
// form), so both faces are rendered a second time, off-screen and
// invisible, purely so a ResizeObserver can read their natural height --
// the visible faces are absolutely positioned (required for the 3D flip)
// and can't report their own height directly.

import React, { useEffect, useRef, useState } from "react";

export default function FlippableCard({
  flipped,
  onFlipToBack,
  front,
  back,
}: {
  flipped: boolean;
  onFlipToBack: () => void;
  front: React.ReactNode;
  back: React.ReactNode;
}) {
  const frontMeasureRef = useRef<HTMLDivElement>(null);
  const backMeasureRef = useRef<HTMLDivElement>(null);
  const frontFaceRef = useRef<HTMLDivElement>(null);
  const backFaceRef = useRef<HTMLDivElement>(null);
  const [frontH, setFrontH] = useState(0);
  const [backH, setBackH] = useState(0);
  // Whether we've applied a real (non-zero) measured height at least once.
  // The very first measurement on mount should snap into place instantly,
  // not animate -- some cards mount while the page is still busy (many
  // cards laying out at once, terminal/card data still loading), and if
  // that busy period interrupts the CSS height transition partway, the
  // card is left visibly stuck at a shorter height until something else
  // (e.g. tapping it) forces a clean remeasurement. Confirmed live: exactly
  // this symptom, only on some cards, always fixed by one flip-and-back.
  const settledRef = useRef(false);

  useEffect(() => {
    const fEl = frontMeasureRef.current;
    const bEl = backMeasureRef.current;
    if (!fEl || !bEl) return;
    const measure = () => {
      setFrontH(fEl.offsetHeight);
      setBackH(bEl.offsetHeight);
    };
    measure();
    // Defensive second pass: catches layout that hadn't fully settled yet
    // at the moment of the synchronous measure() above (e.g. a web font
    // still swapping in), which the ResizeObserver won't always catch if
    // the resulting size change happens between its own observation ticks.
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(fEl);
    ro.observe(bEl);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [front, back]);

  // Chromium sometimes fails to paint text nodes the first time a face is
  // revealed inside this rotateY/backface-visibility container (confirmed
  // live: value/computed color were correct, only the glyphs never
  // painted) -- toggling display forces a real repaint, not just a reflow
  // (reading offsetHeight alone wasn't enough to fix it).
  useEffect(() => {
    const el = flipped ? backFaceRef.current : frontFaceRef.current;
    if (!el) return;
    const prevDisplay = el.style.display;
    el.style.display = "none";
    void el.offsetHeight;
    el.style.display = prevDisplay;
  }, [flipped]);

  const height = flipped ? backH : frontH;
  // First real measurement applies instantly (no transition to interrupt);
  // every height change after that (an actual flip, or content changing
  // size) animates normally.
  const isFirstSettle = !settledRef.current && height > 0;
  if (isFirstSettle) settledRef.current = true;

  return (
    <div style={{ position: "relative", perspective: 1400 }}>
      <div
        style={{
          position: "relative",
          height: height || undefined,
          transition: isFirstSettle ? "none" : "height 360ms cubic-bezier(0.4,0.15,0.2,1)",
        }}
      >
        <div
          style={{
            position: "absolute", inset: 0,
            transformStyle: "preserve-3d",
            transition: "transform 500ms cubic-bezier(0.4,0.15,0.2,1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          <div
            ref={frontFaceRef}
            onClick={!flipped ? onFlipToBack : undefined}
            style={{
              position: "absolute", inset: 0,
              backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
              cursor: !flipped ? "pointer" : "default",
            }}
          >
            {front}
          </div>
          <div
            ref={backFaceRef}
            style={{
              position: "absolute", inset: 0,
              backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            {back}
          </div>
        </div>
      </div>

      {/* Offscreen measurers -- same width as the real card, never painted. */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", visibility: "hidden", pointerEvents: "none", zIndex: -1 }} aria-hidden="true">
        <div ref={frontMeasureRef}>{front}</div>
        <div ref={backMeasureRef}>{back}</div>
      </div>
    </div>
  );
}
