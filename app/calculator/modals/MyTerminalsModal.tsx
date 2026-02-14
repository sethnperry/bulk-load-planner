"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type TerminalRow = any; // keep typing loose for now to avoid behavior/shape refactors

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

  cardingBusyId: string | null;

  // helper fns from page.tsx
  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;
  starBtnClass: (starred: boolean) => string;

  // membership / selection actions from page.tsx
  myTerminalIds: Set<string>;
  setMyTerminalIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTerminals: React.Dispatch<React.SetStateAction<any[]>>;

  toggleTerminalStar: (terminalId: string, currentlyStarred: boolean) => void;
  doGetCardedForTerminal: (terminalId: string) => void;

  setSelectedTerminalId: (id: string) => void;
  setTermOpen: (open: boolean) => void;

  // open catalog flow
  setCatalogExpandedId: (id: string | null) => void;
  setCatalogOpen: (open: boolean) => void;
}) {
  const {
    open,
    onClose,
    selectedState,
    selectedCity,
    termError,
    terminalsFiltered,
    selectedTerminalId,
    expandedTerminalId,
    setExpandedTerminalId,
    cardingBusyId,
    addDaysISO_,
    isPastISO_,
    formatMDYWithCountdown_,
    starBtnClass,
    myTerminalIds,
    setMyTerminalIds,
    setTerminals,
    toggleTerminalStar,
    doGetCardedForTerminal,
    setSelectedTerminalId,
    setTermOpen,
    setCatalogExpandedId,
    setCatalogOpen,
  } = props;

  return (
    <FullscreenModal open={open} title="My Terminals" onClose={onClose}>
      {!selectedState || !selectedCity ? (
        <div className="text-sm text-white/60">Select a city first.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-white/70">
            Showing terminals in{" "}
            <span className="text-white">
              {selectedCity}, {selectedState}
            </span>
          </div>

          {termError ? <div className="text-sm text-red-400">{termError}</div> : null}

          {terminalsFiltered.filter((t) => t.status !== "not_carded").length === 0 ? (
            <div className="text-sm text-white/60">No terminals saved for this city.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {terminalsFiltered
                .filter((t) => t.status !== "not_carded")
                .map((t, idx) => {
                  const active = String(t.terminal_id) === String(selectedTerminalId);

                  const expiresISO = (t as any).expires_on || (t as any).expires || (t as any).expires_at || ""; // fallback
                  const activationISO = (t as any).carded_on || (t as any).added_on || "";

                  const renewalDays =
                    Number((t as any).renewal_days ?? (t as any).renewalDays ?? (t as any).renewal ?? 90) || 90;

                  const computedExpiresISO =
                    activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
                      ? addDaysISO_(activationISO, renewalDays)
                      : "";

                  const displayISO = expiresISO || computedExpiresISO;
                  const expired = displayISO ? isPastISO_(displayISO) : false;

                  const isExpanded = expandedTerminalId === String(t.terminal_id);
                  const busy = String(cardingBusyId) === String(t.terminal_id);

                  const selectTerminal = () => {
                    setSelectedTerminalId(String(t.terminal_id));
                    setTermOpen(false);
                  };

                  return (
                    <div
                      key={t.terminal_id ? String(t.terminal_id) : `my-${idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={selectTerminal}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectTerminal();
                        }
                      }}
                      className={[
                        "rounded-2xl border transition cursor-pointer select-none px-3 py-3",
                        active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        {/* icon well (match top tiles vibe) */}
                        <div className="shrink-0 p-1">
                          <div
                            className={[
                              "h-14 w-14 rounded-xl border flex items-center justify-center text-xs",
                              active
                                ? "border-white/20 bg-black text-orange-400"
                                : "border-white/10 bg-[#2a2a2a] text-white/50",
                            ].join(" ")}
                            aria-hidden="true"
                          >
                            Img
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white truncate">
                            {t.terminal_name ?? "(unnamed terminal)"}
                          </div>

                          {displayISO ? (
                            <div className={["mt-1 text-xs tabular-nums", expired ? "text-red-400" : "text-white/50"].join(" ")}>
                              {formatMDYWithCountdown_(displayISO)}
                            </div>
                          ) : null}
                        </div>

                        {/* right controls: star + view (side-by-side) */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const tid = String(t.terminal_id);

                              toggleTerminalStar(tid, true); // TRUE = currently starred => DELETE

                              // optimistic remove from UI
                              setMyTerminalIds((prev) => {
                                const s = new Set(prev);
                                s.delete(tid);
                                return s;
                              });
                              setTerminals((prev: any) => prev.filter((x: any) => String(x.terminal_id) !== tid));
                            }}
                            className={starBtnClass(myTerminalIds.has(String(t.terminal_id)))}
                            aria-label={
                              myTerminalIds.has(String(t.terminal_id)) ? "Remove from My Terminals" : "Add to My Terminals"
                            }
                            title={
                              myTerminalIds.has(String(t.terminal_id)) ? "Remove from My Terminals" : "Add to My Terminals"
                            }
                          >
                            {myTerminalIds.has(String(t.terminal_id)) ? "★" : "☆"}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTerminalId(isExpanded ? null : String(t.terminal_id));
                            }}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                            aria-label="View terminal details"
                            title="View"
                          >
                            View
                          </button>
                        </div>
                      </div>

                      {expired ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              doGetCardedForTerminal(String(t.terminal_id));
                            }}
                            className={[
                              "w-full rounded-xl border px-3 py-2 text-sm",
                              busy
                                ? "border-red-400/10 bg-red-400/10 text-red-200/60"
                                : "border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/15",
                            ].join(" ")}
                          >
                            {busy ? "Getting carded…" : "Get carded"}
                          </button>
                        </div>
                      ) : null}

                      {isExpanded ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                          <div className="text-white/80 font-semibold">Terminal details</div>
                          <div className="mt-1">Business-card placeholder.</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setTermOpen(false);
              setCatalogExpandedId(null);
              setCatalogOpen(true);
            }}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10"
          >
            + Get carded
          </button>
        </div>
      )}
    </FullscreenModal>
  );
}
