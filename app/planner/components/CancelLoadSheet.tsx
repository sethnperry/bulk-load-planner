"use client";
// app/planner/components/CancelLoadSheet.tsx
//
// Rework (2026-08-13), per explicit user direction: the Loading modal used
// to have two separate exit paths -- a small "Close" text button in the
// header that silently canceled with no confirmation at all, and a big
// LOADED button that submitted directly. Collapsed into one deliberate
// exit point instead: the header Close button is gone (see
// FullscreenModal's hideCloseButton), the bottom button is now labeled
// "Complete" (or whatever loadedLabel page.tsx passes), and EVERY way of
// leaving the modal -- that button, backdrop click, or Escape, all routed
// through the same onClose prop -- opens this sheet instead of doing
// anything directly.
//
// Three choices, not two: tapping LOAD already re-cards the terminal as a
// side effect of begin_load (see useLoadWorkflow.ts's cancelActiveLoad
// comment) before this modal ever opens, and canceling only removes the
// load_log row, never reverts that -- so "log the load" and "leave without
// logging" were never actually mutually exclusive with "the card gets
// refreshed." Making that a real, separate, always-available choice is the
// whole point of this sheet.

import React from "react";

type Props = {
  open: boolean;
  onBackToPlanner: () => void;
  onLogTheLoad: () => void;
  onUpdateCardOnly: () => void;
};

const rowStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700,
  cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
};
const cancelStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 10, border: "none",
  background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

export default function CancelLoadSheet({ open, onBackToPlanner, onLogTheLoad, onUpdateCardOnly }: Props) {
  if (!open) return null;

  return (
    <div
      onClick={onBackToPlanner}
      style={{ position: "fixed", inset: 0, zIndex: 10400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, background: "#111518", borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,0.1)", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
          What do you want to do?
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Your terminal access is refreshed for today either way.
        </div>
        <button type="button" style={rowStyle} onClick={onLogTheLoad}>Log the Load</button>
        <button type="button" style={rowStyle} onClick={onUpdateCardOnly}>Update Card, No Load</button>
        <button type="button" style={cancelStyle} onClick={onBackToPlanner}>Back to Planner</button>
      </div>
    </div>
  );
}
