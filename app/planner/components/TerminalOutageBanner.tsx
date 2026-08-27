"use client";
// app/planner/components/TerminalOutageBanner.tsx
//
// Two independent scrolling rows for active outage reports at whichever
// terminal is currently selected -- Out of Product on top (any driver at
// any company heading here sees it), Out of Allocation below it (only
// same-company drivers) -- per explicit follow-up ("put product on its own
// banner above and below" instead of one mixed ticker). Mounted in
// CalculatorLayoutClient.tsx's Header, between the icon row and the tab
// bar. See CLAUDE.md "Terminal outage banners" for the full design.
//
// Renders nothing when a given row has no active report -- no empty strip
// taking up space. Each row is tappable (a trailing "›" chevron, same
// affordance this app already uses everywhere else for "this row opens
// something") to open TerminalOutageDetailModal.tsx for the per-report
// expiry time and a Clear Issue option; both rows open the same shared
// detail view.
//
// The actual scroll behavior (constant speed, pause at each message's
// arrival, multi-message cycling) lives in MessageTicker.tsx, a generic
// reusable ticker -- see that file's own header comment for why it's a
// requestAnimationFrame loop rather than a CSS @keyframes animation.

import React, { useState } from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useActiveOutageBanner } from "../hooks/useTerminalOutageReports";
import TerminalOutageDetailModal from "../modals/TerminalOutageDetailModal";
import MessageTicker from "./MessageTicker";

const TICKER_COLOR = "#ff3b30";

function TickerRow({ messages, onOpen }: { messages: string[]; onOpen: () => void }) {
  if (messages.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        width: "100%", height: 22, padding: "0 14px",
        background: "transparent", border: "none", cursor: "pointer", flexShrink: 0,
      }}
    >
      <MessageTicker messages={messages} color={TICKER_COLOR} />
      <span style={{ fontSize: 16, color: TICKER_COLOR, flexShrink: 0, lineHeight: 1 }}>›</span>
    </button>
  );
}

export default function TerminalOutageBanner() {
  const shell = useCalculatorShell();
  const terminalId = shell.location.selectedTerminalId ? String(shell.location.selectedTerminalId) : null;
  const { productMessages, allocationMessages, reports, timeZone, refresh } = useActiveOutageBanner(terminalId, shell.effectiveUserId || null);
  const [detailOpen, setDetailOpen] = useState(false);

  if (productMessages.length === 0 && allocationMessages.length === 0) return null;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 2, paddingBottom: 2 }}>
        <TickerRow messages={productMessages} onOpen={() => setDetailOpen(true)} />
        <TickerRow messages={allocationMessages} onOpen={() => setDetailOpen(true)} />
      </div>

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
