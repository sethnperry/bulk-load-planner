"use client";
// components/TourOverlay.tsx
// Renders a spotlight overlay with a pulsing ring around the target element.
// The user taps the highlighted element to advance the tour.

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TourState } from "../hooks/useTour";

type Props = {
  tour: TourState;
};

const RING_PAD = 10; // px padding around target element

export default function TourOverlay({ tour }: Props) {
  const { active, currentStep, targetRect, stepIndex, advance, skip } = tour;
  const prevRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    if (targetRect) prevRectRef.current = targetRect;
  }, [targetRect]);

  if (!active || !currentStep || typeof document === "undefined") return null;

  const rect = targetRect ?? prevRectRef.current;

  // Tooltip position
  const tipTop = rect
    ? currentStep.position === "bottom"
      ? rect.bottom + RING_PAD + 12
      : rect.top - RING_PAD - 100
    : window.innerHeight / 2 - 50;

  const ringStyle: React.CSSProperties = rect ? {
    position: "fixed",
    left: rect.left - RING_PAD,
    top: rect.top - RING_PAD,
    width: rect.width + RING_PAD * 2,
    height: rect.height + RING_PAD * 2,
    borderRadius: 18,
    border: "2px solid rgba(103,232,249,0.90)",
    boxShadow: "0 0 0 4px rgba(103,232,249,0.18), 0 0 0 8px rgba(103,232,249,0.08)",
    pointerEvents: "none",
    zIndex: 10500,
    animation: "tourPulse 1.6s ease-in-out infinite",
  } : {};

  // Cutout: make area under ring tappable, everything else dimmed
  const clipPath = rect
    ? `polygon(
        0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
        ${rect.left - RING_PAD}px ${rect.top - RING_PAD}px,
        ${rect.left - RING_PAD}px ${rect.bottom + RING_PAD}px,
        ${rect.right + RING_PAD}px ${rect.bottom + RING_PAD}px,
        ${rect.right + RING_PAD}px ${rect.top - RING_PAD}px,
        ${rect.left - RING_PAD}px ${rect.top - RING_PAD}px
      )`
    : undefined;

  return createPortal(
    <>
      <style>{`
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(103,232,249,0.18), 0 0 0 8px rgba(103,232,249,0.08); }
          50% { box-shadow: 0 0 0 8px rgba(103,232,249,0.28), 0 0 0 16px rgba(103,232,249,0.12); }
        }
      `}</style>

      {/* Dim overlay with cutout */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 10490,
          background: "rgba(0,0,0,0.60)",
          clipPath,
          pointerEvents: "none",
        }}
      />

      {/* Pulsing ring — pointer-events none so taps pass through to the element */}
      {rect && <div style={ringStyle} />}

      {/* Tooltip */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: tipTop,
          transform: "translateX(-50%)",
          width: "min(320px, calc(100vw - 36px))",
          background: "#111518",
          border: "1px solid rgba(103,232,249,0.25)",
          borderRadius: 16,
          padding: "14px 16px",
          zIndex: 10510,
          boxShadow: "0 8px 32px rgba(0,0,0,0.60)",
        }}
      >
        {/* Step counter */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(103,232,249,0.60)", marginBottom: 6, textTransform: "uppercase" }}>
          Step {stepIndex + 1}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 6 }}>
          {currentStep.title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.55 }}>
          {currentStep.message}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <button
            type="button"
            onClick={skip}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.28)", padding: 0 }}
          >
            Skip tour
          </button>
          {/* "Tap the highlighted area" hint */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#67e8f9", animation: "tourPulse 1.6s ease-in-out infinite" }} />
            <span style={{ fontSize: 11, color: "rgba(103,232,249,0.70)", fontWeight: 700 }}>Tap the highlighted area</span>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
