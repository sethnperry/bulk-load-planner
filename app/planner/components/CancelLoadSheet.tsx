"use client";
// app/planner/components/CancelLoadSheet.tsx
//
// Shown when the driver closes the Loading modal instead of tapping
// LOADED. Per user report: backing out felt like a dead end with no
// acknowledgment of what actually happens -- and it does happen: tapping
// LOAD already re-cards the terminal (begin_load's own side effect, see
// useLoadWorkflow.ts's cancelActiveLoad comment) before the Loading modal
// ever opens, and canceling only removes the load_log row, never reverts
// that. So a driver who visits a terminal just to keep their card current,
// without actually loading, was already getting exactly that outcome --
// just silently, with no confirmation telling them so. This sheet makes it
// explicit instead of just closing on a bare tap.

import React from "react";

type Props = {
  open: boolean;
  onKeepLoading: () => void;
  onConfirmCancel: () => void;
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

export default function CancelLoadSheet({ open, onKeepLoading, onConfirmCancel }: Props) {
  if (!open) return null;

  return (
    <div
      onClick={onKeepLoading}
      style={{ position: "fixed", inset: 0, zIndex: 10400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, background: "#111518", borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,0.1)", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
          Not loading here?
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Your terminal access is already refreshed for today. Choose whether to keep loading or leave without logging a load.
        </div>
        <button type="button" style={rowStyle} onClick={onKeepLoading}>Keep Loading</button>
        <button type="button" style={rowStyle} onClick={onConfirmCancel}>Don't Log a Load</button>
        <button type="button" style={cancelStyle} onClick={onKeepLoading}>Back</button>
      </div>
    </div>
  );
}
