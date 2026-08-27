"use client";
// app/planner/components/TerminalOutageBanner.tsx
//
// Scrolling ticker for active Out of Product / Out of Allocation reports
// at whichever terminal is currently selected -- see CLAUDE.md "Terminal
// outage banners." Mounted in CalculatorLayoutClient.tsx's Header, between
// the icon row (hamburger/bell/gear) and the tab bar -- per explicit
// follow-up ("move the banner above the tabs but below the hamburger").
//
// Renders nothing when there's no active report for the current terminal
// -- no empty strip taking up space.
//
// Restyled same day per explicit feedback: no background/border chip --
// just red text directly on the header's own gradient, tappable (a
// trailing "›" chevron, same affordance this app already uses everywhere
// else for "this row opens something" -- see e.g. SettingsModal.tsx,
// EquipmentModal.tsx) to open TerminalOutageDetailModal.tsx for the
// per-report expiry time and a Clear Issue option.
//
// Scroll uses `left` (container-relative percentages), not `transform:
// translateX` -- translateX's percentage is relative to the ELEMENT's own
// width, which would make "start fully off-screen right" unreliable for a
// short message. `left` on an absolutely-positioned child is relative to
// the CONTAINING block's width instead, so 100%/-300% reliably start/end
// off-screen regardless of the message's own length. The mid-animation
// hold (see keyframe %s below) is the "scroll, pause, continue" behavior
// asked for.

import React, { useState } from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useActiveOutageBanner } from "../hooks/useTerminalOutageReports";
import TerminalOutageDetailModal from "../modals/TerminalOutageDetailModal";

export default function TerminalOutageBanner() {
  const shell = useCalculatorShell();
  const terminalId = shell.location.selectedTerminalId ? String(shell.location.selectedTerminalId) : null;
  const { message, reports, timeZone, refresh } = useActiveOutageBanner(terminalId, shell.effectiveUserId || null);
  const [detailOpen, setDetailOpen] = useState(false);

  if (!message) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", height: 24, padding: "0 14px",
          background: "transparent", border: "none", cursor: "pointer", flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, position: "relative", height: "100%", overflow: "hidden" }}>
          <div
            key={message}
            style={{
              position: "absolute",
              top: 0, bottom: 0, left: "100%",
              display: "flex", alignItems: "center",
              whiteSpace: "nowrap",
              fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
              color: "#f87171",
              animation: "outageTicker 18s linear infinite",
            }}
          >
            {message}
          </div>
        </div>
        <span style={{ fontSize: 16, color: "#f87171", flexShrink: 0, lineHeight: 1 }}>›</span>
        <style jsx>{`
          @keyframes outageTicker {
            0%   { left: 100%; }
            35%  { left: 8%; }
            52%  { left: 8%; }
            90%  { left: -300%; }
            100% { left: -300%; }
          }
        `}</style>
      </button>

      <TerminalOutageDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        reports={reports}
        timeZone={timeZone}
        onCleared={refresh}
      />
    </>
  );
}
