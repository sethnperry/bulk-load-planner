"use client";
// app/calculator/lead/page.tsx
//
// New role-specific tab, shown to the left of Planner for lead-role users
// (see CalculatorLayoutClient.tsx's ROLE_TABS). Deliberately a fresh,
// focused layout rather than a literal copy of the Planner page's
// load-planning shell (equipment/location cards, temp dial, Load button) --
// those don't have an obvious meaning for a fleet-monitoring dashboard, and
// dragging in that machinery just to get "visual consistency" would mean
// inventing meaning for controls that don't do anything real yet. Dispatch
// and Admin tabs will likely follow this same shape: subtabs + a
// role-relevant chart/content area.
//
// Subtabs mirror the Planner's A-E preset row's "selected item centers
// itself" mechanic via the new shared CenteredSubTabs component. Only
// Dashboard has real (mock) content right now -- Tasks and Ledger are
// honest placeholders, not a guess at unspecified functionality.

import React, { useState } from "react";
import CenteredSubTabs, { type CenteredSubTab } from "../components/CenteredSubTabs";
import EquipmentScheduleChart from "./EquipmentScheduleChart";

const SUBTABS: CenteredSubTab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tasks", label: "Tasks" },
  { id: "ledger", label: "Ledger" },
];

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "28px 18px", textAlign: "center" as const }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

export default function LeadPage() {
  const [activeSubTab, setActiveSubTab] = useState("dashboard");

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ marginBottom: 14 }}>
        <CenteredSubTabs tabs={SUBTABS} activeId={activeSubTab} onChange={setActiveSubTab} />
      </div>

      {activeSubTab === "dashboard" && <EquipmentScheduleChart />}

      {activeSubTab === "tasks" && (
        <PlaceholderPanel
          title="Tasks"
          note="Coming soon -- likely fleet-wide training checklist progress and other pending items that need a lead's attention."
        />
      )}

      {activeSubTab === "ledger" && (
        <PlaceholderPanel
          title="Ledger"
          note="Coming soon -- likely an equipment activity or incentive-points log, scoped once the exact content is defined."
        />
      )}
    </div>
  );
}
