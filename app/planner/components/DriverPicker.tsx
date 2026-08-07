"use client";
// app/planner/components/DriverPicker.tsx
//
// Search-and-pick a company roster member -- shared by the Dispatch tab
// (dispatcher picking who to view) and the Driver Training trainee picker.
// Built on useCompanyRoster (the third call site for that fetch shape, so
// it's a shared hook rather than a third copy).

import React, { useMemo, useState } from "react";
import { useCompanyRoster } from "../hooks/useCompanyRoster";

export default function DriverPicker({
  companyId,
  excludeUserId,
  onPick,
  emptyLabel = "No drivers found.",
}: {
  companyId: string | null;
  excludeUserId?: string;
  onPick: (userId: string, displayName: string) => void;
  emptyLabel?: string;
}) {
  const { members, loading } = useCompanyRoster(companyId, { excludeUserId });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.display_name.toLowerCase().includes(q));
  }, [members, search]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search drivers…"
        style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14 }}
      />
      {loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "16px 0" }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "16px 0" }}>{emptyLabel}</div>
      )}
      {!loading && filtered.map((m) => (
        <button
          key={m.user_id}
          type="button"
          onClick={() => onPick(m.user_id, m.display_name)}
          style={{
            width: "100%", textAlign: "left" as const, padding: "12px 14px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {m.display_name}
        </button>
      ))}
    </div>
  );
}
