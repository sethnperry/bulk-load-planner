"use client";
// app/planner/components/RecallDifferentEquipmentSheet.tsx
//
// Shown when "Recall Last Load" finds a completed load at the currently
// selected terminal, but under DIFFERENT equipment than what's currently
// selected -- per explicit follow-up: "if I switch to a different
// terminal, I want to recall the last load at that terminal. What
// happens if that load was loaded using different equipment? we could
// show a warning with an option to proceed and switch the equipment or
// cancel and back out."
//
// "Switch" claims the other combo directly (same claim_combo RPC
// EquipmentModal.tsx's own handleClaim already uses -- reused, not
// reimplemented) and then re-runs the recall against it -- see page.tsx's
// handler and usePlanSlots.ts's findLastLoadAtTerminalDifferentEquipment/
// recallLastLoad(opts.comboId) for the rest of the flow.

import React from "react";
import { GRAPHITE, GRAPHITE_DARKER, themeFill, themeTextOnFill } from "../theme";
import { CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

export default function RecallDifferentEquipmentSheet({
  open, truckLabel, trailerLabel, busy, error, onConfirm, onCancel, darkMode, accentColor,
}: {
  open: boolean;
  truckLabel: string;
  trailerLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  darkMode: boolean;
  accentColor: string | null;
}) {
  if (!open) return null;

  return (
    <div
      onClick={busy ? undefined : onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 10500, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: `linear-gradient(180deg, ${GRAPHITE} 0%, ${GRAPHITE_DARKER} 100%)`,
          borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,0.1)",
          padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
          Different equipment
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.4 }}>
          Your last load at this terminal used {truckLabel} / {trailerLabel}, not your current equipment. Switch to it to recall that load?
        </div>

        {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{error}</div>}

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 10, marginBottom: 8,
            border: CARD_BORDER, boxShadow: CARD_SHADOW,
            background: themeFill(darkMode, accentColor, "#fff"),
            color: themeTextOnFill(darkMode),
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Switching…" : `Switch to ${truckLabel} & Recall`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 10, border: "none",
            background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
