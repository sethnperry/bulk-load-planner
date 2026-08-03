"use client";
// app/calculator/terminal/RackLaneGrid.tsx
//
// Renders a rack's lane x arm grid -- lanes as rows, arms as columns. Tapping
// a lane's label opens that lane's Status Update (STUD) modal via onSelectLane;
// this is the crowdsourced "mark an arm down" entry point, open to every role.

import React from "react";
import type { TerminalRack, RackArm, ProductLite } from "./types";
import { positionLabel } from "./labels";

export default function RackLaneGrid({
  rack,
  arms,
  productsById,
  onSelectLane,
}: {
  rack: TerminalRack;
  arms: RackArm[];
  productsById: Record<string, ProductLite>;
  onSelectLane: (laneNumber: number) => void;
}) {
  const armByPos = React.useMemo(() => {
    const m = new Map<string, RackArm>();
    for (const a of arms) m.set(`${a.lane_number}:${a.arm_number}`, a);
    return m;
  }, [arms]);

  const lanePositions = Array.from({ length: rack.lane_count }, (_, i) => i + 1);
  const armPositions = Array.from({ length: rack.arm_count }, (_, i) => i + 1);

  const cellBase: React.CSSProperties = {
    width: 44, height: 40, borderRadius: 6, flexShrink: 0,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, minWidth: "100%" }}>
        {/* Arm header row */}
        <div style={{ display: "flex", gap: 4 }}>
          <div style={{ width: 36, flexShrink: 0 }} />
          {armPositions.map((p) => (
            <div key={p} style={{ width: 44, flexShrink: 0, textAlign: "center" as const, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>
              {positionLabel(p, rack.arm_count, rack.arm_reversed, rack.arm_alpha)}
            </div>
          ))}
        </div>

        {lanePositions.map((lanePos) => (
          <div key={lanePos} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => onSelectLane(lanePos)}
              style={{
                width: 36, height: 40, flexShrink: 0, borderRadius: 6, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)",
                color: "#fff", fontSize: 12, fontWeight: 800,
              }}
            >
              {positionLabel(lanePos, rack.lane_count, rack.lane_reversed, rack.lane_alpha)}
            </button>

            {armPositions.map((armPos) => {
              const arm = armByPos.get(`${lanePos}:${armPos}`);
              const product = arm?.product_id ? productsById[arm.product_id] : null;
              const hasStatus = Boolean(arm?.status);
              const code = product ? ((product.button_code ?? "").trim() || "?") : "—";
              const color = product ? ((product.hex_code ?? "").trim() || "rgba(255,255,255,0.7)") : "rgba(255,255,255,0.25)";
              return (
                <div
                  key={armPos}
                  title={hasStatus ? (arm?.status ?? undefined) : (product?.product_name ?? undefined)}
                  style={{
                    ...cellBase,
                    borderColor: hasStatus ? "#ef4444" : "rgba(255,255,255,0.10)",
                    background: hasStatus ? "rgba(239,68,68,0.10)" : cellBase.background,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color }}>{code}</span>
                  {hasStatus && (
                    <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", marginTop: 1, letterSpacing: 0.3, textTransform: "uppercase" as const }}>
                      {(arm?.status ?? "").length > 8 ? "FLAG" : arm?.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
