"use client";

import React, { useState } from "react";
import SourcingModal from "./SourcingModal";

// ── Terminal avatar helpers ───────────────────────────────────────────────────
const AVATAR_COLORS: [string, string][] = [
  ["#1a3a5c", "#4a9eda"], ["#1a3a2a", "#4aad6a"], ["#3a1a2a", "#da4a7a"],
  ["#2a2a1a", "#c4a030"], ["#2a1a3a", "#7a4ada"], ["#1a3a3a", "#4acadc"],
  ["#3a2a1a", "#da7a30"], ["#2a1a1a", "#da5050"],
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length][1];
}

function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type TerminalRow = any;
type CardData = { cardNumber: string; privateNote: string; };

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
  setCardDataForTerminal_: (terminalId: string, data: CardData) => void;
  myTerminalIds: Set<string>;
  setMyTerminalIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTerminals: React.Dispatch<React.SetStateAction<any[]>>;
  setSelectedTerminalId: (id: string) => void;
  setTermOpen: (open: boolean) => void;
  authUserId: string;
}) {
  const {
    open, onClose,
    selectedState, selectedCity, termError,
    terminalsFiltered, selectedTerminalId,
    expandedTerminalId, setExpandedTerminalId,
    addDaysISO_, isPastISO_, formatMDYWithCountdown_,
    accessDateByTerminalId, setAccessDateForTerminal_,
    cardDataByTerminalId, setCardDataForTerminal_,
    myTerminalIds, setMyTerminalIds, setTerminals,
    setSelectedTerminalId, setTermOpen,
    authUserId,
  } = props;

  const [draftCards, setDraftCards] = useState<Record<string, CardData>>({});
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);
  const [sourcingTerminal, setSourcingTerminal] = useState<{ id: string; name: string } | null>(null);

  const isoToday = () => new Date().toISOString().slice(0, 10);

  const getDraft = (tid: string): CardData => {
    if (draftCards[tid]) return draftCards[tid];
    const saved = cardDataByTerminalId[tid];
    return { cardNumber: saved?.cardNumber ?? "", privateNote: saved?.privateNote ?? "" };
  };
  const updateDraft = (tid: string, patch: Partial<CardData>) =>
    setDraftCards(prev => ({ ...prev, [tid]: { ...getDraft(tid), ...patch } }));
  const flushDraft = (tid: string) => {
    if (draftCards[tid]) {
      setCardDataForTerminal_(tid, draftCards[tid]);
      setDraftCards(prev => { const n = { ...prev }; delete n[tid]; return n; });
    }
  };

  const handleExpand = (tid: string) => {
    if (expandedTerminalId && expandedTerminalId !== tid) flushDraft(expandedTerminalId);
    setExpandedTerminalId(tid);
    setConfirmDeactivate(null);
  };
  const handleCollapse = (tid: string) => {
    flushDraft(tid);
    setExpandedTerminalId(null);
    setConfirmDeactivate(null);
  };
  const handleSelect = (tid: string) => {
    flushDraft(tid);
    if (!myTerminalIds.has(tid)) setMyTerminalIds(prev => new Set([...prev, tid]));
    if (!accessDateByTerminalId[tid]) setAccessDateForTerminal_(tid, isoToday());
    setSelectedTerminalId(tid);
    setTermOpen(false);
  };

  const handleDeactivateConfirmed = (tid: string) => {
    setAccessDateForTerminal_(tid, "");
    setConfirmDeactivate(null);
    setExpandedTerminalId(null);
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
    <>
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
                  const isConfirming = confirmDeactivate === tid;

                  return (
                    <div
                      key={tid ?? `term-${idx}`}
                      className={[
                        "rounded-xl border transition-all overflow-hidden",
                        active ? "border-white/30 bg-white/5" : "border-white/10",
                      ].join(" ")}
                    >
                      {/* Header */}
                      <div
                        role="button" tabIndex={0}
                        onClick={() => isExpanded ? handleCollapse(tid) : handleExpand(tid)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); isExpanded ? handleCollapse(tid) : handleExpand(tid); } }}
                        className="flex items-center cursor-pointer select-none hover:bg-white/5"
                      >
                        <div style={{
                          flexShrink: 0, width: 28, textAlign: "center" as const,
                          paddingLeft: 12, fontSize: 11, fontWeight: 800,
                          color: t.terminal_name
                            ? avatarColor(String(t.terminal_name))
                            : "rgba(255,255,255,0.20)",
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
                        <div className="pr-3 text-white/35 text-xs select-none">
                          {isExpanded ? "▲" : "▼"}
                        </div>
                      </div>

                      {/* Expanded panel */}
                      {isExpanded && (
                        <div className="border-t border-white/10 px-3 pt-3 pb-3 space-y-3" onClick={(e) => e.stopPropagation()}>

                          {/* Last Visit + Card Number */}
                          <div className="flex gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-white/40 mb-1 font-medium">Last Visit</div>
                              <div className="flex gap-1">
                                <input
                                  type="date"
                                  value={lastVisitISO}
                                  onChange={(e) => setAccessDateForTerminal_(tid, e.target.value)}
                                  className="flex-1 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                                />
                                <button type="button"
                                  onClick={() => setAccessDateForTerminal_(tid, isoToday())}
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 whitespace-nowrap">
                                  Today
                                </button>
                              </div>
                              {expiresISO && (
                                <div className={["mt-1 text-xs tabular-nums", expired ? "text-red-400" : "text-white/35"].join(" ")}>
                                  Expires {formatMDYWithCountdown_(expiresISO)}
                                </div>
                              )}
                            </div>
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

                          {/* Sourcing button — above Private Note */}
                          <button
                            type="button"
                            onClick={() => setSourcingTerminal({ id: tid, name: String(t.terminal_name ?? tid) })}
                            style={{
                              width: "100%",
                              padding: "10px 0",
                              borderRadius: 10,
                              border: "1px solid rgba(74,222,128,0.25)",
                              background: "rgba(74,222,128,0.07)",
                              color: "rgba(74,222,128,0.85)",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: "pointer",
                              letterSpacing: 0.3,
                            }}
                          >
                            Sourcing
                          </button>

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

                          {/* Select / Deactivate */}
                          {!isConfirming ? (
                            <div className="flex gap-2">
                              <button type="button" onClick={() => handleSelect(tid)}
                                style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#ffffff", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2 }}>
                                Select
                              </button>
                              {lastVisitISO && (
                                <button type="button"
                                  onClick={() => setConfirmDeactivate(tid)}
                                  style={{ padding: "13px 16px", borderRadius: 14, border: "1px solid rgba(239,68,68,0.20)", background: "rgba(239,68,68,0.06)", color: "rgba(239,68,68,0.70)", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                                  Deactivate
                                </button>
                              )}
                            </div>
                          ) : (
                            <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.80)", marginBottom: 10 }}>
                                Remove last visit date and mark as not carded?
                              </div>
                              <div className="flex gap-2">
                                <button type="button"
                                  onClick={() => handleDeactivateConfirmed(tid)}
                                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.15)", color: "rgba(239,68,68,0.90)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                  Yes, deactivate
                                </button>
                                <button type="button"
                                  onClick={() => setConfirmDeactivate(null)}
                                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.60)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
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

      {/* Sourcing modal — layered on top */}
      {sourcingTerminal && (
        <SourcingModal
          open={!!sourcingTerminal}
          onClose={() => setSourcingTerminal(null)}
          terminalId={sourcingTerminal.id}
          terminalName={sourcingTerminal.name}
          authUserId={authUserId}
        />
      )}
    </>
  );
}
