"use client";
// app/calculator/modals/TerminalChecklistModal.tsx
//
// Fleet Tier Section 1.3, part 2: "priority terminal flagging" -- driver
// facing side. Shown (as an overlay on top of the already-revealed Planner,
// per spec) whenever a driver selects a terminal that has a configured
// checklist they haven't finished yet. Training-load progress is
// auto-tracked (read-only here, incremented server-side by
// record_terminal_checklist_load after a load completes at this terminal);
// manual steps are self-checked via toggle_terminal_checklist_item.
//
// Always closeable regardless of completion -- this is progress tracking
// and a reminder, not a hard gate on using the Planner at this terminal.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ChecklistItem = {
  id: string;
  label: string;
  item_type: "training_loads" | "manual";
  required_count: number | null;
};

type Progress = { checklist_item_id: string; progress_count: number; is_checked: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  terminalId: string | null;
  terminalName?: string | null;
};

export default function TerminalChecklistModal({ open, onClose, terminalId, terminalName }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [progressById, setProgressById] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !terminalId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: itemRows } = await supabase
        .from("terminal_checklist_items")
        .select("id, label, item_type, required_count")
        .eq("terminal_id", terminalId)
        .eq("is_active", true)
        .order("sort_order");
      if (cancelled) return;
      const rows = (itemRows ?? []) as ChecklistItem[];
      setItems(rows);

      if (rows.length > 0) {
        const { data: progRows } = await supabase
          .from("terminal_checklist_progress")
          .select("checklist_item_id, progress_count, is_checked")
          .in("checklist_item_id", rows.map((r) => r.id));
        if (cancelled) return;
        setProgressById(Object.fromEntries(((progRows ?? []) as Progress[]).map((p) => [p.checklist_item_id, p])));
      } else {
        setProgressById({});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, terminalId]);

  async function toggle(item: ChecklistItem, checked: boolean) {
    setBusyId(item.id);
    try {
      const { error } = await supabase.rpc("toggle_terminal_checklist_item", { p_item_id: item.id, p_checked: checked });
      if (!error) {
        setProgressById((prev) => ({ ...prev, [item.id]: { checklist_item_id: item.id, progress_count: prev[item.id]?.progress_count ?? 0, is_checked: checked } }));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (!open || !terminalId) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10250, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 10px" }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Getting carded here</div>
          {terminalName && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{terminalName}</div>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 8px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "20px 0" }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((item) => {
                const p = progressById[item.id];
                const isTraining = item.item_type === "training_loads";
                const count = p?.progress_count ?? 0;
                const required = item.required_count ?? 1;
                const done = isTraining ? count >= required : Boolean(p?.is_checked);
                return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: done ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.03)" }}>
                    {isTraining ? (
                      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${done ? "#4ade80" : "rgba(255,255,255,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 900, color: done ? "#4ade80" : "rgba(255,255,255,0.4)" }}>
                        {done ? "✓" : ""}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggle(item, !done)}
                        disabled={busyId === item.id}
                        style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${done ? "#4ade80" : "rgba(255,255,255,0.25)"}`, background: done ? "#4ade80" : "transparent", flexShrink: 0, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#0a0a0a" }}
                      >
                        {done ? "✓" : ""}
                      </button>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{item.label}</div>
                      {isTraining && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{count} of {required} training loads</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 18px 18px" }}>
          <button type="button" onClick={onClose} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            Continue to Planner
          </button>
        </div>
      </div>
    </div>
  );
}
