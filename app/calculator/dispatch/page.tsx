"use client";
// app/calculator/dispatch/page.tsx
//
// Role-specific tab shown left of Planner for dispatch-role users (and to
// super admins, who see every role tab -- see CalculatorLayoutClient.tsx).
// Same shape as the Lead tab (app/calculator/lead/page.tsx): subtabs +
// content area, deliberately not a copy of the Planner's load-planning
// shell. Unlike Lead, no specific Dashboard content has been specified yet
// (Lead's equipment-schedule chart came from a detailed user example) --
// all three subtabs are honest placeholders for now, not a guess at
// unspecified functionality. Per the Fleet Tier permission matrix, dispatch
// cares about other drivers' loads/cards and priority terminal flagging --
// natural candidates for Dashboard once specified.

import React, { useState } from "react";
import CenteredSubTabs, { type CenteredSubTab } from "../components/CenteredSubTabs";

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

export default function DispatchPage() {
  const [activeSubTab, setActiveSubTab] = useState("dashboard");

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ marginBottom: 14 }}>
        <CenteredSubTabs tabs={SUBTABS} activeId={activeSubTab} onChange={setActiveSubTab} />
      </div>

      {activeSubTab === "dashboard" && (
        <PlaceholderPanel
          title="Dashboard"
          note="Coming soon -- likely a fleet-wide loads/cards overview (who's uncarded, who's flagged for priority training)."
        />
      )}
      {activeSubTab === "tasks" && (
        <PlaceholderPanel
          title="Tasks"
          note="Coming soon -- likely priority terminal flagging actions and driver load review."
        />
      )}
      {activeSubTab === "ledger" && (
        <PlaceholderPanel
          title="Ledger"
          note="Coming soon -- content not yet specified."
        />
      )}
    </div>
  );
}
