"use client";
// components/TourOverlay.tsx

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TourState } from "../hooks/useTour";

type Props = { tour: TourState };

const RING_PAD = 10;

export default function TourOverlay({ tour }: Props) {
  const { active, currentStep, targetRect, stepIndex, advance, skip } = tour;
  const prevRectRef = useRef<DOMRect | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Un-collapse when step changes
  useEffect(() => { setCollapsed(false); }, [stepIndex]);

  // Scroll target into view when step changes
  useEffect(() => {
    if (!currentStep || currentStep.position === "center") return;
    const el = document.getElementById(currentStep.targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentStep?.targetId]);

  useEffect(() => {
    if (targetRect) prevRectRef.current = targetRect;
  }, [targetRect]);

  if (!active || !currentStep || typeof document === "undefined") return null;

  // Collapsed tab
  if (collapsed) {
    return createPortal(
      <>
        <style>{`@keyframes tourPulse {
          0%,100%{box-shadow:0 0 0 4px rgba(103,232,249,0.18),0 0 0 8px rgba(103,232,249,0.08);}
          50%{box-shadow:0 0 0 8px rgba(103,232,249,0.28),0 0 0 16px rgba(103,232,249,0.12);}
        }`}</style>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={{
            position: "fixed", bottom: 24, right: 18, zIndex: 10510,
            background: "#111518", border: "1px solid rgba(103,232,249,0.40)",
            borderRadius: 20, padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 7,
            cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.50)",
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#67e8f9", animation: "tourPulse 1.6s ease-in-out infinite" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#67e8f9" }}>{currentStep.title}</span>
        </button>
      </>,
      document.body
    );
  }

  const isCenter = currentStep.position === "center";
  const rect = isCenter ? null : (targetRect ?? prevRectRef.current);

  // Tooltip vertical position
  let tipTop: number | string;
  if (isCenter) {
    tipTop = "50%";
  } else if (rect) {
    if (currentStep.position === "bottom") {
      tipTop = rect.bottom + RING_PAD + 12;
    } else {
      // top — place above, ensure it doesn't go off screen
      tipTop = Math.max(8, rect.top - RING_PAD - 140);
    }
  } else {
    tipTop = "40%";
  }

  const tipTransform = isCenter ? "translate(-50%, -50%)" : "translateX(-50%)";

  const ringStyle: React.CSSProperties = rect ? {
    position: "fixed",
    left: rect.left - RING_PAD,
    top: rect.top - RING_PAD,
    width: rect.width + RING_PAD * 2,
    height: rect.height + RING_PAD * 2,
    borderRadius: 18,
    border: "2px solid rgba(103,232,249,0.90)",
    boxShadow: "0 0 0 4px rgba(103,232,249,0.18)",
    pointerEvents: "none",
    zIndex: 10500,
    animation: "tourPulse 1.6s ease-in-out infinite",
  } : {};

  const clipPath = rect
    ? `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,
        ${rect.left - RING_PAD}px ${rect.top - RING_PAD}px,
        ${rect.left - RING_PAD}px ${rect.bottom + RING_PAD}px,
        ${rect.right + RING_PAD}px ${rect.bottom + RING_PAD}px,
        ${rect.right + RING_PAD}px ${rect.top - RING_PAD}px,
        ${rect.left - RING_PAD}px ${rect.top - RING_PAD}px)`
    : undefined;

  const collapseLabel = currentStep.collapseLabel ?? "OK, I'll do it";
  const nextLabel = currentStep.nextLabel;

  return createPortal(
    <>
      <style>{`@keyframes tourPulse {
        0%,100%{box-shadow:0 0 0 4px rgba(103,232,249,0.18),0 0 0 8px rgba(103,232,249,0.08);}
        50%{box-shadow:0 0 0 8px rgba(103,232,249,0.28),0 0 0 16px rgba(103,232,249,0.12);}
      }`}</style>

      {/* Dim overlay — never blocks taps */}
      {!isCenter && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10490,
          background: "rgba(0,0,0,0.52)",
          clipPath,
          pointerEvents: "none",
        }} />
      )}

      {/* Pulsing ring */}
      {!isCenter && rect && <div style={ringStyle} />}

      {/* Tooltip */}
      <div style={{
        position: "fixed",
        left: "50%",
        top: tipTop,
        transform: tipTransform,
        width: "min(320px, calc(100vw - 36px))",
        background: "#111518",
        border: "1px solid rgba(103,232,249,0.25)",
        borderRadius: 16,
        padding: "14px 16px",
        zIndex: 10510,
        boxShadow: "0 8px 32px rgba(0,0,0,0.60)",
        pointerEvents: "auto",
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(103,232,249,0.60)", marginBottom: 6, textTransform: "uppercase" as const }}>
          {currentStep.title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.6 }}>
          {currentStep.message}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 8 }}>
          <button type="button" onClick={skip}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.25)", padding: 0, flexShrink: 0 }}>
            Skip tour
          </button>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {/* nextLabel button — moves to next step outright */}
            {isCenter && nextLabel && (
              <button type="button" onClick={advance}
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.70)" }}>
                {nextLabel}
              </button>
            )}

            {/* collapseLabel button — for center steps, collapses to tab */}
            {isCenter ? (
              <button type="button" onClick={() => setCollapsed(true)}
                style={{ background: "rgba(103,232,249,0.12)", border: "1px solid rgba(103,232,249,0.30)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#67e8f9" }}>
                {collapseLabel}
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#67e8f9", animation: "tourPulse 1.6s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, color: "rgba(103,232,249,0.70)", fontWeight: 700 }}>Tap the highlighted area</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
