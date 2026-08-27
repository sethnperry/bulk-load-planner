"use client";
// app/planner/components/TerminalOutageBanner.tsx
//
// Scrolling ticker for active Out of Product / Out of Allocation reports
// at whichever terminal is currently selected -- see CLAUDE.md "Terminal
// outage banners." Mounted in CalculatorLayoutClient.tsx's ShellChrome,
// between Header (nav menu + tab bar) and the scrollable tab content, so
// it's visible across every tab, not just the Planner.
//
// Renders nothing when there's no active report for the current terminal
// -- no empty strip taking up space.
//
// Scroll uses `left` (container-relative percentages), not `transform:
// translateX` -- translateX's percentage is relative to the ELEMENT's own
// width, which would make "start fully off-screen right" unreliable for a
// short message (it might not clear the container at all). `left` on an
// absolutely-positioned child is relative to the CONTAINING block's width
// instead, so 100%/-300% reliably start/end off-screen regardless of the
// message's own length. The mid-animation hold (see keyframe %s below) is
// the "scroll, pause, continue" behavior asked for.

import React from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useActiveOutageBanner } from "../hooks/useTerminalOutageReports";

export default function TerminalOutageBanner() {
  const shell = useCalculatorShell();
  const terminalId = shell.location.selectedTerminalId ? String(shell.location.selectedTerminalId) : null;
  const { message } = useActiveOutageBanner(terminalId);

  if (!message) return null;

  return (
    <div
      style={{
        position: "relative",
        height: 26,
        overflow: "hidden",
        background: "linear-gradient(180deg, rgba(239,68,68,0.22) 0%, rgba(239,68,68,0.12) 100%)",
        borderBottom: "1px solid rgba(239,68,68,0.35)",
        flexShrink: 0,
      }}
    >
      <div
        key={message}
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: "100%",
          display: "flex", alignItems: "center",
          whiteSpace: "nowrap",
          fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
          color: "#fecaca",
          animation: "outageTicker 18s linear infinite",
        }}
      >
        {message}
      </div>
      <style jsx>{`
        @keyframes outageTicker {
          0%   { left: 100%; }
          35%  { left: 8%; }
          52%  { left: 8%; }
          90%  { left: -300%; }
          100% { left: -300%; }
        }
      `}</style>
    </div>
  );
}
