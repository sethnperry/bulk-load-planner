"use client";
// app/calculator/terminal/RackLaneGrid.tsx
//
// One card per lane (per the user's mockup), each showing its arms as
// stacked-product columns. Tapping a card opens that lane's Status Update
// modal -- this is the crowdsourced "mark something down" entry point,
// open to every role.
//
// Layered down/out visual logic (confirmed against the actual mockup
// screenshot): an arm renders fully "down" (red circle-slash over the
// whole column) when either it's explicitly flagged down, or every
// product currently on it is out (whether flagged out on this specific
// arm, or out rack-wide via the bottom STUD button) -- there's nothing
// usable there regardless of cause. A single out product on a multi-
// product arm that still has another valid product just gets a
// strikethrough on that one product; the arm itself stays normal.

import React from "react";
import type { TerminalRack, RackArm, RackLane, RackProductStatusRow, ProductLite } from "./types";
import { laneLabel, armLabel } from "./labels";

function NoSymbol() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#ef4444" strokeWidth="2" />
      <line x1="5" y1="19" x2="19" y2="5" stroke="#ef4444" strokeWidth="2" />
    </svg>
  );
}

export default function RackLaneGrid({
  rack,
  laneOffset,
  arms,
  lanes,
  rackProductStatusById,
  productsById,
  onSelectLane,
}: {
  rack: TerminalRack;
  laneOffset: number;
  arms: RackArm[];
  lanes: RackLane[];
  rackProductStatusById: Record<string, RackProductStatusRow>;
  productsById: Record<string, ProductLite>;
  onSelectLane: (localLaneNumber: number) => void;
}) {
  const armByPos = React.useMemo(() => {
    const m = new Map<string, RackArm>();
    for (const a of arms) m.set(`${a.lane_number}:${a.arm_number}`, a);
    return m;
  }, [arms]);
  const laneDownByNumber = React.useMemo(() => {
    const m = new Map<number, boolean>();
    for (const l of lanes) m.set(l.lane_number, l.is_down);
    return m;
  }, [lanes]);

  function isProductOut(arm: RackArm, pid: string): boolean {
    return arm.out_product_ids.includes(pid) || rackProductStatusById[pid]?.is_out === true;
  }
  function isArmDown(arm: RackArm): boolean {
    if (arm.is_down) return true;
    if (arm.product_ids.length === 0) return false;
    return arm.product_ids.every((pid) => isProductOut(arm, pid));
  }

  const lanePositions = Array.from({ length: rack.lane_count }, (_, i) => i + 1);
  const armPositions = Array.from({ length: rack.arm_count }, (_, i) => i + 1);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {lanePositions.map((lanePos) => {
        const laneDown = laneDownByNumber.get(lanePos) ?? false;
        return (
          <button
            key={lanePos}
            type="button"
            onClick={() => onSelectLane(lanePos)}
            style={{
              display: "flex", alignItems: "stretch", gap: 0, width: "100%",
              borderRadius: 18, border: "none", cursor: "pointer", textAlign: "left" as const,
              background: "rgba(255,255,255,0.05)", padding: 0, overflow: "hidden",
            }}
          >
            <div style={{
              flexShrink: 0, width: 36, display: "flex", alignItems: "center", justifyContent: "center",
              background: laneDown ? "#ef4444" : "rgba(255,255,255,0.08)",
              color: "#fff", fontSize: 15, fontWeight: 800, alignSelf: "stretch",
            }}>
              {laneLabel(lanePos, rack, laneOffset)}
            </div>

            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "10px 6px", gap: 4 }}>
              {armPositions.map((armPos) => {
                const arm = armByPos.get(`${lanePos}:${armPos}`);
                const pids = arm?.product_ids ?? [];
                const down = arm ? isArmDown(arm) : false;
                return (
                  <div key={armPos} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 28, minHeight: 28, gap: 1 }}>
                    {pids.length === 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>—</span>}
                    {pids.map((pid) => {
                      const p = productsById[pid];
                      const code = (p?.button_code ?? "").trim() || "?";
                      const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.7)";
                      const outHere = arm ? isProductOut(arm, pid) : false;
                      return (
                        <span
                          key={pid}
                          style={{
                            fontSize: 13, fontWeight: 800, color,
                            textDecoration: !down && outHere ? "line-through" : "none",
                            opacity: !down && outHere ? 0.6 : 1,
                          }}
                        >
                          {code}
                        </span>
                      );
                    })}
                    {down && pids.length > 0 && (
                      <div style={{ position: "absolute", inset: -4 }}><NoSymbol /></div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ flexShrink: 0, width: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: 16 }}>
              ›
            </div>
          </button>
        );
      })}
    </div>
  );
}
