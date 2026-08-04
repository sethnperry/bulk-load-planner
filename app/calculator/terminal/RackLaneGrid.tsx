"use client";
// app/calculator/terminal/RackLaneGrid.tsx
//
// One card per lane, each showing its own arms as stacked-product columns
// -- lanes are enumerated from the actual rack_lanes rows and each lane's
// arms from the actual rack_arms rows, not from a rack-wide count, since
// lanes can have different numbers of arms (per explicit user direction).
// Tapping a card opens that lane's Status Update modal -- open to every
// role.
//
// Layered down/out visual logic (confirmed against the actual mockup
// screenshot): an arm renders fully "down" (red circle-slash over the
// whole column) when either it's explicitly flagged down, or every
// product currently on it is out (whether flagged out on this specific
// arm, or out rack-wide via the bottom STUD button). A single out product
// on a multi-product arm that still has another valid product just gets a
// strikethrough on that one product; the arm itself stays normal.

import React from "react";
import type { RackArm, RackLane, RackProductStatusRow, ProductLite } from "./types";
import { displayLabel } from "./labels";

function NoSymbol() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#ef4444" strokeWidth="2" />
      <line x1="5" y1="19" x2="19" y2="5" stroke="#ef4444" strokeWidth="2" />
    </svg>
  );
}

export default function RackLaneGrid({
  lanes,
  arms,
  rackProductStatusById,
  productsById,
  onSelectLane,
}: {
  lanes: RackLane[];
  arms: RackArm[];
  rackProductStatusById: Record<string, RackProductStatusRow>;
  productsById: Record<string, ProductLite>;
  onSelectLane: (laneNumber: number) => void;
}) {
  const armsByLane = React.useMemo(() => {
    const m = new Map<number, RackArm[]>();
    for (const a of arms) {
      if (!m.has(a.lane_number)) m.set(a.lane_number, []);
      m.get(a.lane_number)!.push(a);
    }
    for (const list of m.values()) list.sort((a, b) => a.arm_number - b.arm_number);
    return m;
  }, [arms]);

  function isProductOut(arm: RackArm, pid: string): boolean {
    return arm.out_product_ids.includes(pid) || rackProductStatusById[pid]?.is_out === true;
  }
  function isArmDown(arm: RackArm): boolean {
    if (arm.is_down) return true;
    if (arm.product_ids.length === 0) return false;
    return arm.product_ids.every((pid) => isProductOut(arm, pid));
  }

  const sortedLanes = [...lanes].sort((a, b) => a.lane_number - b.lane_number);

  if (sortedLanes.length === 0) {
    return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No lanes configured yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {sortedLanes.map((lane) => {
        const laneArms = armsByLane.get(lane.lane_number) ?? [];
        return (
          <button
            key={lane.lane_number}
            type="button"
            onClick={() => onSelectLane(lane.lane_number)}
            style={{
              display: "flex", alignItems: "stretch", gap: 0, width: "100%",
              borderRadius: 18, border: "none", cursor: "pointer", textAlign: "left" as const,
              background: "rgba(255,255,255,0.05)", padding: 0, overflow: "hidden",
            }}
          >
            <div style={{
              flexShrink: 0, width: 36, display: "flex", alignItems: "center", justifyContent: "center",
              background: lane.is_down ? "#ef4444" : "rgba(255,255,255,0.08)",
              color: "#fff", fontSize: 15, fontWeight: 800, alignSelf: "stretch",
            }}>
              {displayLabel(lane.label, lane.lane_number)}
            </div>

            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: laneArms.length ? "space-around" : "center", padding: "10px 6px", gap: 4 }}>
              {laneArms.length === 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>No arms configured</span>}
              {laneArms.map((arm) => {
                const pids = arm.product_ids;
                const down = isArmDown(arm);
                return (
                  <div key={arm.arm_id} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 28, minHeight: 28, gap: 1 }}>
                    {pids.length === 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>—</span>}
                    {pids.map((pid) => {
                      const p = productsById[pid];
                      const code = (p?.button_code ?? "").trim() || "?";
                      const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.7)";
                      const outHere = isProductOut(arm, pid);
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
