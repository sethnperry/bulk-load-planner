"use client";
// app/calculator/cards/FlippableCard.tsx
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

  useEffect(() => {
    const fEl = frontMeasureRef.current;
    const bEl = backMeasureRef.current;
    if (!fEl || !bEl) return;
    const measure = () => {
      setFrontH(fEl.offsetHeight);
      setBackH(bEl.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(fEl);
    ro.observe(bEl);
    return () => ro.disconnect();
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

  return (
    <div style={{ position: "relative", perspective: 1400 }}>
      <div
        style={{
          position: "relative",
          height: height || undefined,
          transition: "height 360ms cubic-bezier(0.4,0.15,0.2,1)",
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
