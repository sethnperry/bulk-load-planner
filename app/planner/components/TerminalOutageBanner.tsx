"use client";
// app/planner/components/TerminalOutageBanner.tsx
//
// One thin row for active outage reports at whichever terminal is
// currently selected -- Out of Product on the left half (any driver at
// any company heading here sees it), Out of Allocation on the right half
// (only same-company drivers). Both halves share a single row (per
// explicit follow-up putting them "back on the same row" so the whole
// banner is one 22px strip, no stacked second row eating extra height --
// it sits right between the icon/hamburger row and the tab bar with
// nothing else in between). Mounted in CalculatorLayoutClient.tsx's
// Header. See CLAUDE.md "Terminal outage banners" for the full design.
//
// Renders nothing when there's no active report at all. Whichever half
// has no reports simply isn't rendered, so a single active report type
// takes the full row rather than leaving a blank half. Multiple
// simultaneous reports for the same half are joined into one continuous
// hyphen-separated string ("Out of Premium 93 - Out of Regular 87") and
// scrolled as a single message, not cycled one at a time.
//
// Each half is tappable (a trailing "›" chevron) to open
// TerminalOutageDetailModal.tsx for the per-report expiry time and a
// Clear Now option; both halves open the same shared detail view.
//
// The actual scroll behavior (constant speed, pause at each message's
// arrival) lives in MessageTicker.tsx -- see that file's own header
// comment for why it's a requestAnimationFrame loop rather than a CSS
// @keyframes animation.

import React, { useState } from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useActiveOutageBanner } from "../hooks/useTerminalOutageReports";
import TerminalOutageDetailModal from "../modals/TerminalOutageDetailModal";
import MessageTicker from "./MessageTicker";

const TICKER_COLOR = "#ff3b30";

function TickerHalf({ messages, onOpen }: { messages: string[]; onOpen: () => void }) {
  if (messages.length === 0) return null;
  const joined = messages.join(" - ");
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        flex: 1, minWidth: 0, height: 22, padding: "0 10px",
        background: "transparent", border: "none", cursor: "pointer",
      }}
    >
      <MessageTicker messages={[joined]} color={TICKER_COLOR} />
      <span style={{ fontSize: 14, color: TICKER_COLOR, flexShrink: 0, lineHeight: 1 }}>›</span>
    </button>
  );
}

export default function TerminalOutageBanner() {
  const shell = useCalculatorShell();
  const terminalId = shell.location.selectedTerminalId ? String(shell.location.selectedTerminalId) : null;
  const { productMessages, allocationMessages, reports, timeZone, refresh } = useActiveOutageBanner(terminalId, shell.effectiveUserId || null);
  const [detailOpen, setDetailOpen] = useState(false);

  const hasProduct = productMessages.length > 0;
  const hasAllocation = allocationMessages.length > 0;
  if (!hasProduct && !hasAllocation) return null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", width: "100%", height: 22 }}>
        <TickerHalf messages={productMessages} onOpen={() => setDetailOpen(true)} />
        {hasProduct && hasAllocation && (
          <div style={{ width: 1, alignSelf: "stretch", margin: "4px 0", background: "rgba(255,255,255,0.14)", flexShrink: 0 }} />
        )}
        <TickerHalf messages={allocationMessages} onOpen={() => setDetailOpen(true)} />
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
