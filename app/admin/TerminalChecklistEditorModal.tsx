"use client";
// app/admin/TerminalChecklistEditorModal.tsx
//
// Fleet Tier Section 1.3, part 2: "priority terminal flagging" -- admin-side
// checklist editor. Each terminal has its own list of carding requirements
// (at minimum "N training loads", plus any number of other manual steps).
// A terminal with zero items here has no gate at all for drivers -- see
// CLAUDE.md "Priority terminal flagging" and the queued
// terminal_checklist migration for the full design.
//
// Reachable from the existing admin TerminalModal (app/admin/page.tsx),
// gated to existing (non-new) terminals only -- items need a real
// terminal_id to attach to.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ChecklistItem = {
  id: string;
  label: string;
  item_type: "training_loads" | "manual";
  required_count: number | null;
  is_active: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  terminalId: string;
  terminalName?: string;
};

const INPUT: React.CSSProperties = {
  borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 14, padding: "9px 12px", boxSizing: "border-box" as const,
};

export default function TerminalChecklistEditorModal({ open, onClose, companyId, terminalId, terminalName }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [itemType, setItemType] = useState<"training_loads" | "manual">("training_loads");
  const [requiredCount, setRequiredCount] = useState("3");
  const [adding, setAdding] = useState(false);

  async function refetch() {
    const { data, error: err } = await supabase
      .from("terminal_checklist_items")
      .select("id, label, item_type, required_count, is_active")
      .eq("company_id", companyId)
      .eq("terminal_id", terminalId)
      .order("sort_order");
    if (err) { setError(err.message); return; }
    setItems((data ?? []) as ChecklistItem[]);
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLabel("");
    setItemType("training_loads");
    setRequiredCount("3");
    (async () => {
      setLoading(true);
      await refetch();
      setLoading(false);
    })();
  }, [open, terminalId, companyId]);

  async function addItem() {
    if (!label.trim()) { setError("Enter a step name."); return; }
    setAdding(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("terminal_checklist_items").insert({
        company_id: companyId,
        terminal_id: terminalId,
        label: label.trim(),
        item_type: itemType,
        required_count: itemType === "training_loads" ? (Number(requiredCount) || 1) : null,
        sort_order: items.length,
      });
      if (err) throw err;
      setLabel("");
      setItemType("training_loads");
      setRequiredCount("3");
      await refetch();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(id: string) {
    setError(null);
    const { error: err } = await supabase.from("terminal_checklist_items").update({ is_active: false }).eq("id", id);
    if (err) { setError(err.message); return; }
    await refetch();
  }

  if (!open) return null;

  const activeItems = items.filter((i) => i.is_active);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Training Checklist</div>
            {terminalName && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{terminalName}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 18px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, lineHeight: 1.5 }}>
            New drivers see this checklist when they select this terminal until every step is complete. Leave empty for no gate.
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
          ) : (
            <>
              {activeItems.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {activeItems.map((item) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                          {item.item_type === "training_loads" ? `${item.required_count ?? 1} training loads (auto-tracked)` : "Manual step"}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>ADD STEP</div>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Safety briefing" style={{ ...INPUT, width: "100%", marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <select value={itemType} onChange={(e) => setItemType(e.target.value as any)} style={{ ...INPUT, flex: 1 }}>
                    <option value="training_loads">Training loads</option>
                    <option value="manual">Manual step</option>
                  </select>
                  {itemType === "training_loads" && (
                    <input type="number" value={requiredCount} onChange={(e) => setRequiredCount(e.target.value)} placeholder="# loads" style={{ ...INPUT, width: 90 }} />
                  )}
                </div>
                <button type="button" onClick={addItem} disabled={adding}
                  style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 800, cursor: adding ? "default" : "pointer" }}>
                  {adding ? "Adding…" : "+ Add Step"}
                </button>
              </div>

              {error && <div style={{ marginTop: 12, fontSize: 12, color: "#ef4444" }}>{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
