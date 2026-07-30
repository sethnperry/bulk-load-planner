"use client";
// app/calculator/lead/EquipmentScheduleChart.tsx
//
// Lead tab, Dashboard subtab: "who has the equipment and when." Illustrative
// mock data only -- there is no driver-shift-schedule table anywhere in the
// app yet (confirmed via repo search); this component exists to validate
// the chart's look/interaction before any real schema work. Once a real
// shift-schedule feature exists, replace MOCK_SHIFTS with fetched data --
// the rendering below only depends on the DriverShiftRow shape, not on
// where it comes from.

import React from "react";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
const DAYS: { key: DayKey; label: string }[] = [
  { key: "sun", label: "Sun" }, { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" }, { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
];

type ShiftKind = "day" | "night" | "off";

type DriverShiftRow = {
  driverName: string;
  shiftLabel: string; // e.g. "3a – 3p"
  days: Record<DayKey, ShiftKind>;
};

const MOCK_SHIFTS: DriverShiftRow[] = [
  {
    driverName: "Seth Perry",
    shiftLabel: "3p – 3a",
    days: { sun: "night", mon: "night", tue: "night", wed: "night", thu: "night", fri: "off", sat: "off" },
  },
  {
    driverName: "Pedro Guzman",
    shiftLabel: "3a – 3p",
    days: { sun: "off", mon: "off", tue: "day", wed: "day", thu: "day", fri: "day", sat: "day" },
  },
];

const KIND_COLOR: Record<ShiftKind, { bg: string; text: string }> = {
  day: { bg: "rgba(250,204,21,0.16)", text: "#facc15" },
  night: { bg: "rgba(96,165,250,0.16)", text: "#60a5fa" },
  off: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.28)" },
};

function Legend() {
  const items: { kind: ShiftKind; label: string }[] = [
    { kind: "day", label: "Day shift" },
    { kind: "night", label: "Night shift" },
    { kind: "off", label: "Off" },
  ];
  return (
    <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" as const }}>
      {items.map((it) => (
        <div key={it.kind} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: KIND_COLOR[it.kind].text }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function EquipmentScheduleChart({ equipmentLabel }: { equipmentLabel?: string }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "14px 14px 12px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
        {equipmentLabel ?? "Who has the equipment"}
      </div>

      <div style={{ overflowX: "auto" as const }}>
        <div style={{ minWidth: 460 }}>
          {/* Day header row */}
          <div style={{ display: "grid", gridTemplateColumns: "84px repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
            <div />
            {DAYS.map((d) => (
              <div key={d.key} style={{ textAlign: "center" as const, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>
                {d.label}
              </div>
            ))}
          </div>

          {/* Driver rows */}
          {MOCK_SHIFTS.map((row) => (
            <div key={row.driverName} style={{ display: "grid", gridTemplateColumns: "84px repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {row.driverName}
                </div>
              </div>
              {DAYS.map((d) => {
                const kind = row.days[d.key];
                const c = KIND_COLOR[kind];
                return (
                  <div
                    key={d.key}
                    style={{
                      borderRadius: 6, background: c.bg, color: c.text,
                      fontSize: 10, fontWeight: 700, textAlign: "center" as const,
                      padding: "8px 2px", lineHeight: 1.3,
                    }}
                  >
                    {kind === "off" ? "OFF" : row.shiftLabel}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Legend />
    </div>
  );
}
