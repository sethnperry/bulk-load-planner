"use client";

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type TerminalRow = any;

type CardData = {
  cardNumber: string;
  privateNote: string;
};

export default function MyTerminalsModal(props: {
  open: boolean;
  onClose: () => void;

  selectedState: string;
  selectedCity: string;

  termError: string | null;

  // ALL terminals in city — sorted here by last visit
  terminalsFiltered: TerminalRow[];
  selectedTerminalId: string;

  expandedTerminalId: string | null;
  setExpandedTerminalId: (id: string | null) => void;

  // date helpers
  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;

  // last visit dates — same pattern as accessDateByTerminalId in catalog
  accessDateByTerminalId: Record<string, string | undefined>;
  setAccessDateForTerminal_: (terminalId: string, isoDate: string) => void;

  // private card data — card number + note, keyed by terminal_id
  cardDataByTerminalId: Record<string, CardData | undefined>;
  setCardDataForTerminal_: (terminalId: string, data: CardData) => void;

  // membership
  myTerminalIds: Set<string>;
  setMyTerminalIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTerminals: React.Dispatch<React.SetStateAction<any[]>>;

  setSelectedTerminalId: (id: string) => void;
  setTermOpen: (open: boolean) => void;
}) {
  const {
    open, onClose,
    selectedState, selectedCity,
    termError,
    terminalsFiltered, selectedTerminalId,
    expandedTerminalId, setExpandedTerminalId,
    addDaysISO_, isPastISO_, formatMDYWithCountdown_,
    accessDateByTerminalId, setAccessDateForTerminal_,
    cardDataByTerminalId, setCardDataForTerminal_,
    myTerminalIds, setMyTerminalIds,
    setSelectedTerminalId, setTermOpen,
  } = props;

  // Draft edits — flushed to persistent storage on Select or collapse
  const [draftCards, setDraftCards] = useState<Record<string, CardData>>({});

  const isoToday = () => new Date().toISOString().slice(0, 10);

  const getDraft = (tid: string): CardData => {
    if (draftCards[tid]) return draftCards[tid];
    const saved = cardDataByTerminalId[tid];
    return { cardNumber: saved?.cardNumber ?? "", privateNote: saved?.privateNote ?? "" };
  };

  const updateDraft = (tid: string, patch: Partial<CardData>) => {
    setDraftCards(prev => ({ ...prev, [tid]: { ...getDraft(tid), ...patch } }));
  };

  const flushDraft = (tid: string) => {
    if (draftCards[tid]) {
      setCardDataForTerminal_(tid, draftCards[tid]);
      setDraftCards(prev => { const n = { ...prev }; delete n[tid]; return n; });
    }
  };

  const handleExpand = (tid: string) => {
    if (expandedTerminalId && expandedTerminalId !== tid) flushDraft(expandedTerminalId);
    setExpandedTerminalId(tid);
  };

  const handleCollapse = (tid: string) => {
    flushDraft(tid);
    setExpandedTerminalId(null);
  };

  const handleSelect = (tid: string) => {
    flushDraft(tid);
    if (!myTerminalIds.has(tid)) setMyTerminalIds(prev => new Set([...prev, tid]));
    if (!accessDateByTerminalId[tid]) setAccessDateForTerminal_(tid, isoToday());
    setSelectedTerminalId(tid);
    setTermOpen(false);
  };

  // Sort: has last visit → most recent first; no visit → alphabetical at bottom
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
          <div className="text-sm text-white/70">
            Showing terminals in{" "}
            <span className="text-white">{selectedCity}, {selectedState}</span>
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
                const draft = getDraft(tid);

                return (
                  <div
                    key={tid ?? `term-${idx}`}
                    className={[
                      "rounded-xl border transition-all overflow-hidden",
                      active ? "border-white/30 bg-white/5" : "border-white/10",
                    ].join(" ")}
                  >
                    {/* ── Header row — tap to expand/collapse ── */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => isExpanded ? handleCollapse(tid) : handleExpand(tid)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          isExpanded ? handleCollapse(tid) : handleExpand(tid);
                        }
                      }}
                      className="flex items-center cursor-pointer select-none hover:bg-white/5"
                    >
                      {/* Logo placeholder */}
                      <div
                        className={[
                          "shrink-0 h-16 w-14 flex items-center justify-center text-xs font-semibold",
                          active ? "bg-black text-amber-400" : "bg-[#1e1e1e] text-white/40",
                        ].join(" ")}
                        style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}
                        aria-hidden="true"
                      >
                        Img
                      </div>

                      {/* Name + expiry */}
                      <div className="min-w-0 flex-1 px-3 py-2">
                        <div className="text-sm font-semibold text-white truncate">
                          {t.terminal_name ?? "(unnamed terminal)"}
                        </div>
                        {expiresISO ? (
                          <div className={[
                            "mt-1 text-xs tabular-nums",
                            expired ? "text-red-400" : "text-white/50",
                          ].join(" ")}>
                            {expired ? "Expired · " : ""}{formatMDYWithCountdown_(expiresISO)}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-white/25">No visit recorded</div>
                        )}
                      </div>

                      {/* Chevron */}
                      <div className="pr-3 text-white/35 text-xs select-none">
                        {isExpanded ? "▲" : "▼"}
                      </div>
                    </div>

                    {/* ── Expanded panel ── */}
                    {isExpanded && (
                      <div
                        className="border-t border-white/10 px-3 pt-3 pb-3 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Last Visit + Card Number side by side */}
                        <div className="flex gap-2">

                          {/* Last Visit */}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/40 mb-1 font-medium">Last Visit</div>
                            <div className="flex gap-1">
                              <input
                                type="date"
                                value={lastVisitISO}
                                onChange={(e) => setAccessDateForTerminal_(tid, e.target.value)}
                                className="flex-1 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                              />
                              <button
                                type="button"
                                onClick={() => setAccessDateForTerminal_(tid, isoToday())}
                                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 whitespace-nowrap"
                              >
                                Today
                              </button>
                            </div>
                            {expiresISO && (
                              <div className={[
                                "mt-1 text-xs tabular-nums",
                                expired ? "text-red-400" : "text-white/35",
                              ].join(" ")}>
                                Expires {formatMDYWithCountdown_(expiresISO)}
                              </div>
                            )}
                          </div>

                          {/* Card Number */}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/40 mb-1 font-medium">Card Number</div>
                            <input
                              type="text"
                              value={draft.cardNumber}
                              onChange={(e) => updateDraft(tid, { cardNumber: e.target.value })}
                              placeholder="Enter card #"
                              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20"
                            />
                          </div>
                        </div>

                        {/* Private Note */}
                        <div>
                          <div className="text-xs text-white/40 mb-1 font-medium">Private Note</div>
                          <textarea
                            value={draft.privateNote}
                            onChange={(e) => updateDraft(tid, { privateNote: e.target.value })}
                            placeholder="Gate codes, contacts, reminders…"
                            rows={2}
                            className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20 resize-none"
                          />
                        </div>

                        {/* Select button — styled like Done */}
                        <button
                          type="button"
                          onClick={() => handleSelect(tid)}
                          style={{
                            width: "100%",
                            padding: "13px 0",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "rgba(255,255,255,0.08)",
                            color: "#ffffff",
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: "pointer",
                            letterSpacing: 0.2,
                          }}
                        >
                          Select
                        </button>
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
