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
// load_log row, never reverts that. "Update Card, No Load" leaves that
// re-card in place deliberately; "Back to Planner" (per explicit follow-up)
// genuinely undoes it -- deletes the load AND restores the terminal's
// access date to whatever it was before this LOAD tap (see
// handleBackToPlannerNoUpdate in page.tsx).
//
// Because "Back to Planner" now does real, consequential writes (not just
// closing this sheet), backdrop-tap is wired to onDismiss -- a genuine
// no-op that just returns to the Loading modal -- instead of reusing
// onBackToPlanner. A stray tap outside the sheet shouldn't carry the same
// weight as the labeled button.
//
// Restyled 2026-08-27 -- per explicit feedback ("the theme of this window
// is generic and not exactly matching our app theme"): the flat
// translucent-white row buttons (a plain "system dialog" look, shared
// verbatim with PresetActionSheet.tsx before this pass) are replaced with
// the graphite-gradient card treatment already established everywhere
// else in the app (Cards tab, Reports tiles, Admin header tiles -- see
// cardTheme.ts's CARD_BG/CARD_BORDER/CARD_SHADOW). "Log the Load" -- the
// primary, most-common action here -- also picks up the same accent-
// color/dark-mode theme fill the Load and STUD buttons already use
// (themeFill/themeTextOnFill), so a driver's chosen accent color shows up
// here too, not just on the Planner's own controls.

import React from "react";
import { GRAPHITE, GRAPHITE_DARKER, themeFill, themeTextOnFill } from "../theme";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

type Props = {
  open: boolean;
  onDismiss: () => void;
  onBackToPlanner: () => void;
  onLogTheLoad: () => void;
  onUpdateCardOnly: () => void;
  darkMode: boolean;
  accentColor: string | null;
};

const secondaryRowStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 10,
  border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
  color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700,
  cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
};
const cancelStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 10, border: "none",
  background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

export default function CancelLoadSheet({ open, onDismiss, onBackToPlanner, onLogTheLoad, onUpdateCardOnly, darkMode, accentColor }: Props) {
  if (!open) return null;

  const primaryRowStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: 10,
    border: CARD_BORDER, boxShadow: CARD_SHADOW,
    background: themeFill(darkMode, accentColor, "#fff"),
    color: themeTextOnFill(darkMode),
    fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
  };

  return (
    <div
      onClick={onDismiss}
      style={{ position: "fixed", inset: 0, zIndex: 10400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
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
          What do you want to do?
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Logging or updating your card keeps today's terminal access. Going back to the planner undoes it.
        </div>
        <button type="button" style={primaryRowStyle} onClick={onLogTheLoad}>Log the Load</button>
        <button type="button" style={secondaryRowStyle} onClick={onUpdateCardOnly}>Update Card, No Load</button>
        <button type="button" style={cancelStyle} onClick={onBackToPlanner}>Back to Planner</button>
      </div>
    </div>
  );
}
