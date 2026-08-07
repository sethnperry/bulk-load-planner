"use client";
// app/planner/terminal/RackLaneGrid.tsx
//
// One card per lane, each showing its own arms as stacked-product columns
// -- lanes are enumerated from the actual rack_lanes rows and each lane's
// arms from the actual rack_arms rows, not from a rack-wide count, since
// lanes can have different numbers of arms (per explicit user direction).
// Tapping a card opens that lane's Status Update modal -- open to every
// role.
//
// Arm 1 always renders on the RIGHT, the highest-numbered arm on the LEFT
// (2026-08-06, per explicit user direction, replacing an earlier
// manual-relabel "reverse order" tool that turned out not to be what was
// actually needed -- the real ask was purely visual: match how these are
// physically laid out at a real rack, not renumber anything). Arm data
// itself is untouched -- arm_number stays a plain, permanent 1..N physical
// identity; only the render order is reversed.
//
// Layered down/out visual logic (confirmed against the actual mockup
// screenshot): an arm renders fully "down" (a red horizontal line struck
// through the whole product stack, 2026-08-06 -- see below) when either
// it's explicitly flagged down, or every product currently on it is out
// (whether flagged out on this specific arm, or out rack-wide via the
// bottom STUD button). A single out product on a multi-product arm that
// still has another valid product just gets a strikethrough on that one
// product; the arm itself stays normal.
//
// 2026-08-06: lane-down changed from a solid red left cell to just the
// lane number/letter text turning red, and arm-down changed from a red
// circle-slash icon to a single red horizontal line through the whole
// arm's product stack -- both per explicit user direction, matching a
// flatter/less-alarming visual language than the original mockup's icon.

import React from "react";
import type { RackArm, RackLane, RackProductStatusRow, ProductLite } from "./types";
import { displayLabel } from "./labels";

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
    // Descending -- arm 1 renders last (rightmost), highest arm_number
    // renders first (leftmost). See file header comment.
    for (const list of m.values()) list.sort((a, b) => b.arm_number - a.arm_number);
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
              background: "rgba(255,255,255,0.08)",
              color: lane.is_down ? "#ef4444" : "#fff", fontSize: 15, fontWeight: 800, alignSelf: "stretch",
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
                      <div style={{ position: "absolute", left: -4, right: -4, top: "50%", height: 2, background: "#ef4444", transform: "translateY(-1px)" }} />
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
