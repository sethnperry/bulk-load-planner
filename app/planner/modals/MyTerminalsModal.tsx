"use client";

import React, { useState } from "react";

// ── Terminal avatar helpers ───────────────────────────────────────────────────
// No fill, thin white stroke -- placeholder until real per-operator logos
// (tracked as a someday idea, not this pass). Was a per-terminal color-hash
// fill; that didn't fit the monochrome theme.

function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type TerminalRow = any;
type CardData = { cardNumber: string; privateNote: string; pin: string; };

// This modal is the Planner's terminal picker -- tap a row to select it for
// the current plan. Card editing (number/PIN/private note/last visit/
// sourcing/deactivate/remove) now lives on the back of each card in the
// Cards tab (app/planner/cards/page.tsx), which is the source of truth
// for that data; this expanded panel is read-only.

export default function MyTerminalsModal(props: {
  open: boolean;
  onClose: () => void;
  selectedState: string;
  selectedCity: string;
  termError: string | null;
  terminalsFiltered: TerminalRow[];
  selectedTerminalId: string;
  expandedTerminalId: string | null;
  setExpandedTerminalId: (id: string | null) => void;
  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;
  accessDateByTerminalId: Record<string, string | undefined>;
  setAccessDateForTerminal_: (terminalId: string, isoDate: string) => void;
  cardDataByTerminalId: Record<string, CardData | undefined>;
  myTerminalIds: Set<string>;
  setMyTerminalIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTerminalId: (id: string) => void;
  setTermOpen: (open: boolean) => void;
  onChangeLocation?: () => void;
}) {
  const {
    open, onClose,
    selectedState, selectedCity, termError,
    terminalsFiltered, selectedTerminalId,
    expandedTerminalId, setExpandedTerminalId,
    addDaysISO_, isPastISO_, formatMDYWithCountdown_,
    accessDateByTerminalId, setAccessDateForTerminal_,
    cardDataByTerminalId,
    myTerminalIds, setMyTerminalIds,
    setSelectedTerminalId, setTermOpen,
    onChangeLocation,
  } = props;

  const isoToday = () => new Date().toISOString().slice(0, 10);

  const handleSelect = (tid: string) => {
    if (!myTerminalIds.has(tid)) setMyTerminalIds(prev => new Set([...prev, tid]));
    if (!accessDateByTerminalId[tid]) setAccessDateForTerminal_(tid, isoToday());
    setSelectedTerminalId(tid);
    setTermOpen(false);
  };

  const sorted = [...terminalsFiltered].sort((a, b) => {
    const aD = accessDateByTerminalId[String(a.terminal_id)] ?? "";
    const bD = accessDateByTerminalId[String(b.terminal_id)] ?? "";
    if (aD && bD) return bD.localeCompare(aD);
    if (aD) return -1;
    if (bD) return 1;
    return (a.terminal_name ?? "").localeCompare(b.terminal_name ?? "");
  });

  return (
    <FullscreenModal open={open} title="My Terminals" onClose={onClose}>
      {!selectedState || !selectedCity ? (
        <div className="text-sm text-white/60">Select a city first.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-white/70 flex items-center justify-between gap-2">
            <span>
              Showing terminals in{" "}
              <span className="text-white">{selectedCity}, {selectedState}</span>
            </span>
            {onChangeLocation && (
              <button
                type="button"
                onClick={onChangeLocation}
                className="shrink-0 text-xs font-semibold text-white/45 hover:text-white/70"
              >
                Change
              </button>
            )}
          </div>

          {termError && <div className="text-sm text-red-400">{termError}</div>}

          {sorted.length === 0 ? (
            <div className="text-sm text-white/60">No terminals found for this city.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {sorted.map((t, idx) => {
                const tid = String(t.terminal_id);
                const active = tid === String(selectedTerminalId);
                const isExpanded = expandedTerminalId === tid;
                const lastVisitISO = accessDateByTerminalId[tid] ?? "";
                const renewalDays = Number(t.renewal_days ?? t.renewalDays ?? t.renewal ?? 90) || 90;
                const expiresISO = lastVisitISO ? addDaysISO_(lastVisitISO, renewalDays) : "";
                const expired = expiresISO ? isPastISO_(expiresISO) : false;
                const card = cardDataByTerminalId[tid];

                return (
                  <div
                    key={tid ?? `term-${idx}`}
                    className={[
                      "rounded-md border transition-all overflow-hidden",
                      active ? "border-white/30 bg-white/5" : "border-white/10",
                    ].join(" ")}
                  >
                    {/* Header -- main body selects this terminal directly;
                        only the chevron zone on the right expands/collapses
                        the read-only details panel below. */}
                    <div className="flex items-center hover:bg-white/5">
                      <div
                        role="button" tabIndex={0}
                        onClick={() => handleSelect(tid)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(tid); } }}
                        className="flex items-center flex-1 min-w-0 cursor-pointer select-none"
                      >
                        <div style={{
                          flexShrink: 0, width: 26, height: 26, marginLeft: 12,
                          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 800,
                          color: t.terminal_name ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.20)",
                        }}>
                          {t.terminal_name ? avatarInitials(String(t.terminal_name)) : "—"}
                        </div>
                        <div className="min-w-0 flex-1 px-3 py-2">
                          <div className="text-sm font-semibold text-white truncate">
                            {t.terminal_name ?? "(unnamed terminal)"}
                          </div>
                          {expiresISO ? (
                            <div className={["mt-1 text-xs tabular-nums", expired ? "text-red-400" : "text-white/50"].join(" ")}>
                              {expired ? "Expired · " : ""}{formatMDYWithCountdown_(expiresISO)}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-white/25">No visit recorded</div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedTerminalId(isExpanded ? null : tid)}
                        aria-label={isExpanded ? "Collapse terminal details" : "Expand terminal details"}
                        aria-expanded={isExpanded}
                        className="flex-shrink-0 self-stretch px-3 flex items-center text-white/35 text-xs select-none hover:text-white/70 hover:bg-white/5"
                        style={{ background: "none", border: "none", cursor: "pointer" }}
                      >
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    </div>

                    {/* Expanded panel -- read-only copy; edit on the Cards tab */}
                    {isExpanded && (
                      <div className="border-t border-white/10 px-3 pt-3 pb-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40 font-medium">Expiration</span>
                          <span className={["tabular-nums font-semibold", expired ? "text-red-400" : "text-white/70"].join(" ")}>
                            {expiresISO ? formatMDYWithCountdown_(expiresISO) : "Not carded"}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40 font-medium">Card Number</span>
                          <span className="text-white/70 font-semibold tabular-nums">{card?.cardNumber || "—"}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40 font-medium">PIN</span>
                          <span className="text-white/70 font-semibold tabular-nums">{card?.pin || "—"}</span>
                        </div>
                        <div className="pt-1 text-[11px] text-white/25">
                          Edit card details from the Cards tab.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </FullscreenModal>
  );
}
