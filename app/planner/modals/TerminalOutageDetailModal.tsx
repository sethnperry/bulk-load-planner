"use client";
// app/planner/modals/TerminalOutageDetailModal.tsx
//
// Opened by tapping TerminalOutageBanner.tsx's ticker -- one row per active
// Out of Product / Out of Allocation report at the current terminal, each
// with its own expiry time and (only for the report the current
// effectiveUserId actually posted) a "Clear Issue" button to remove it
// early instead of waiting for the next 6am/12pm/6pm/12am checkpoint. See
// CLAUDE.md "Terminal outage banners" for the full design.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { clearOutageReport, type ComposedOutageReport } from "../hooks/useTerminalOutageReports";

function fmtExpiry(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
}

export default function TerminalOutageDetailModal({
  open, onClose, reports, timeZone, onCleared,
}: {
  open: boolean;
  onClose: () => void;
  reports: ComposedOutageReport[];
  timeZone: string;
  onCleared: () => void;
}) {
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClear(reportId: string) {
    setClearingId(reportId);
    setError(null);
    const { error: err } = await clearOutageReport(reportId);
    setClearingId(null);
    if (err) { setError(err); return; }
    onCleared();
  }

  return (
    <FullscreenModal open={open} title="Terminal Issues" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

        {reports.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}>No active issues at this terminal.</div>
        ) : (
          reports.map((r) => (
            <div
              key={r.reportId}
              style={{
                padding: "12px 14px", borderRadius: 10,
                border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.08)",
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fecaca" }}>{r.text}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                Clears at {fmtExpiry(r.expiresAtMs, timeZone)}
              </div>
              {r.canClear && (
                <button
                  type="button"
                  onClick={() => handleClear(r.reportId)}
                  disabled={clearingId === r.reportId}
                  style={{
                    marginTop: 4, alignSelf: "flex-start",
                    padding: "8px 14px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    opacity: clearingId === r.reportId ? 0.6 : 1,
                  }}
                >
                  {clearingId === r.reportId ? "Clearing…" : "Clear Issue"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </FullscreenModal>
  );
}
