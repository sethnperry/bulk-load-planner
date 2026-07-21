"use client";
// app/calculator/vault/page.tsx
//
// Phase 7 of the "ProTankr mobile app design" handoff: static placeholder
// UI only, per the design's own framing ("Placeholder — needs real
// secure-storage backing") -- there is no vault table/backend anywhere in
// the app today, by design (confirmed with user). Show/Hide is local
// component state; nothing here is persisted or fetched.

import React, { useState } from "react";

type VaultEntry = {
  id: string;
  label: string;
  username: string;
  value: string;
};

const PLACEHOLDER_ENTRIES: VaultEntry[] = [
  { id: "eld", label: "ELD Login", username: "j.driver", value: "Tr4ck1ngP@ss" },
  { id: "fuel-card", label: "Fuel Card Portal", username: "jdriver22049", value: "F1eetC@rd90" },
  { id: "company-email", label: "Company Email", username: "j.driver@fleet.com", value: "M@ilAcc3ss" },
];

function mask(value: string): string {
  return "•".repeat(Math.max(6, Math.min(14, value.length)));
}

export default function VaultPage() {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PLACEHOLDER_ENTRIES.map((entry) => {
          const isRevealed = !!revealed[entry.id];
          return (
            <div key={entry.id} style={{
              borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)", padding: 14,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {entry.label}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {entry.username}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginTop: 6, fontFamily: "monospace", letterSpacing: 0.5 }}>
                  {isRevealed ? entry.value : mask(entry.value)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevealed((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10, padding: "7px 12px", cursor: "pointer",
                }}
              >
                {isRevealed ? "Hide" : "Show"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", textAlign: "center" as const, lineHeight: 1.4, marginTop: 16 }}>
        Vault is a preview — secure storage isn't connected yet.
      </div>
    </div>
  );
}
