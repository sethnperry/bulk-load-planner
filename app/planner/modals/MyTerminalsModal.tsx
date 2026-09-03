"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import type { Role } from "@/lib/ui/driver/role";
import RackProductStatusModal from "./RackProductStatusModal";
import EditTerminalModal from "./EditTerminalModal";
import type { TerminalRack, RackProductStatusRow } from "./rackProductTypes";

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
// for that data; this expanded panel is read-only for card data.
//
// STUD + Edit Terminal + a rack quick-pick relocated here from the
// now-deleted /planner/terminal page, per explicit direction ("take the
// whole section out of the terminal page for product status... put that in
// the location modal in the expanded view of the terminal card"). Deliberately
// LOCAL state, not wired into shell.chooseTerminal/rackPickerOpen/
// RackSelectSheet -- checking/updating a terminal's rack status here must
// never change the driver's actively selected planning terminal/rack as a
// side effect (the terminal being expanded may not even be the one currently
// selected for loading -- e.g. checking status somewhere you're not loading
// today).

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
  authUserId: string;
  myRole: Role | null;
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
    authUserId, myRole,
  } = props;

  const isoToday = () => new Date().toISOString().slice(0, 10);

  // ── Relocated rack status/edit state, scoped to whichever card is expanded ──
  const [expandedRacks, setExpandedRacks] = useState<TerminalRack[]>([]);
  const [expandedRackId, setExpandedRackId] = useState("");
  const [expandedRackProducts, setExpandedRackProducts] = useState<RackProductStatusRow[]>([]);
  const [racksLoading, setRacksLoading] = useState(false);
  const [racksError, setRacksError] = useState<string | null>(null);
  const [studOpen, setStudOpen] = useState(false);
  const [editTerminalOpen, setEditTerminalOpen] = useState(false);

  const loadExpandedRacks = React.useCallback(async (terminalId: string, opts?: { keepRackId?: string }) => {
    if (!terminalId) {
      setExpandedRacks([]);
      setExpandedRackId("");
      setRacksError(null);
      return;
    }
    setRacksLoading(true);
    setRacksError(null);
    const { data, error: err } = await supabase
      .from("terminal_racks")
      .select("*")
      .eq("terminal_id", terminalId)
      .order("rack_name", { ascending: true });
    if (err) {
      setRacksError(err.message);
      setExpandedRacks([]);
    } else {
      const rows = (data ?? []) as TerminalRack[];
      setExpandedRacks(rows);
      // Keep the previously-picked rack selected across a refetch (e.g. after
      // an Edit Terminal rename) if it still exists; otherwise fall back to
      // the first row, same as the initial pick.
      const keep = opts?.keepRackId;
      setExpandedRackId(keep && rows.some((r) => r.rack_id === keep) ? keep : (rows[0]?.rack_id ?? ""));
    }
    setRacksLoading(false);
  }, []);

  useEffect(() => {
    if (!expandedTerminalId) {
      setExpandedRacks([]);
      setExpandedRackId("");
      setExpandedRackProducts([]);
      setRacksError(null);
      return;
    }
    loadExpandedRacks(expandedTerminalId);
  }, [expandedTerminalId, loadExpandedRacks]);

  const loadExpandedRackProducts = React.useCallback(async (rackId: string) => {
    if (!rackId) { setExpandedRackProducts([]); return; }
    const { data, error: err } = await supabase
      .from("rack_product_status").select("*").eq("rack_id", rackId).eq("active", true);
    if (err) { setRacksError(err.message); return; }
    setExpandedRackProducts((data ?? []) as RackProductStatusRow[]);
  }, []);

  useEffect(() => {
    loadExpandedRackProducts(expandedRackId);
  }, [expandedRackId, loadExpandedRackProducts]);

  const { data: productsCatalog = [] } = useProductsCatalog();
  const productsById = useMemo(
    () => Object.fromEntries(productsCatalog.map((p) => [p.product_id, p])),
    [productsCatalog]
  );

  const canEditTerminal = myRole === "lead" || myRole === "dispatch" || myRole === "admin";
  const canSeeCardsFooter = myRole === "driver" || myRole === "lead" || myRole == null;

  const activeRack = expandedRacks.find((r) => r.rack_id === expandedRackId) ?? null;
  const expandedTerminalRow = terminalsFiltered.find((t: any) => String(t.terminal_id) === expandedTerminalId);

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
                        {canSeeCardsFooter && (
                          <div className="pt-1 text-[11px] text-white/25">
                            Edit card details from the Cards tab.
                          </div>
                        )}

                        {/* Rack status/edit -- relocated from the deleted
                            Terminal tab. Only meaningful once this row's own
                            rack fetch has resolved. */}
                        <div className="pt-2 mt-2 border-t border-white/10 space-y-2">
                          {racksLoading && (
                            <div className="text-xs text-white/35">Loading racks…</div>
                          )}
                          {racksError && (
                            <div className="text-xs text-red-400">{racksError}</div>
                          )}
                          {!racksLoading && expandedRacks.length === 0 && !racksError && (
                            <div className="text-xs text-white/35">
                              No racks configured yet{canEditTerminal ? " — use Edit Terminal below to add one." : "."}
                            </div>
                          )}
                          {!racksLoading && expandedRacks.length > 0 && (
                            <CustomSelect
                              value={expandedRackId}
                              onChange={setExpandedRackId}
                              options={expandedRacks.map((r) => ({ value: r.rack_id, label: r.rack_name }))}
                            />
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={!expandedRackId}
                              onClick={() => setStudOpen(true)}
                              style={{
                                flex: 1, fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6,
                                border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
                                color: "#fff", cursor: expandedRackId ? "pointer" : "not-allowed",
                                opacity: expandedRackId ? 1 : 0.4,
                              }}
                            >
                              STUD
                            </button>
                            {canEditTerminal && (
                              <button
                                type="button"
                                onClick={() => setEditTerminalOpen(true)}
                                style={{
                                  flex: 1, fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6,
                                  border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
                                  color: "#fff", cursor: "pointer",
                                }}
                              >
                                Edit Terminal
                              </button>
                            )}
                          </div>
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

      {activeRack && (
        <RackProductStatusModal
          open={studOpen}
          onClose={() => setStudOpen(false)}
          rack={activeRack}
          terminalCity={expandedTerminalRow?.city ?? ""}
          terminalState={expandedTerminalRow?.state ?? ""}
          rackProducts={expandedRackProducts}
          productsById={productsById}
          authUserId={authUserId}
          onSaved={() => loadExpandedRackProducts(expandedRackId)}
        />
      )}

      {expandedTerminalId && canEditTerminal && (
        <EditTerminalModal
          open={editTerminalOpen}
          onClose={() => setEditTerminalOpen(false)}
          terminalId={expandedTerminalId}
          terminalName={expandedTerminalRow?.terminal_name}
          onChanged={() => {
            // Re-fetch racks (a rename/add/delete may have changed the list,
            // or renewal_days changed) -- keeps the currently-picked rack
            // selected if it still exists. The rack-products effect above
            // re-fires on its own once expandedRackId resolves.
            if (expandedTerminalId) loadExpandedRacks(expandedTerminalId, { keepRackId: expandedRackId });
          }}
        />
      )}
    </FullscreenModal>
  );
}
