"use client";
// app/calculator/terminal/LaneStatusModal.tsx
//
// "Lane N — Status Update" -- the per-arm STUD action. Open to every role
// (crowdsourced by design for this first pass, per CLAUDE.md's Terminal Tier
// spec). Each arm gets a free-text status field (null/blank = ok) rather than
// a rigid enum -- the canned list of common values isn't fully settled yet,
// so a couple of quick-fill chips cover the known cases without locking the
// column down.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TerminalRack, RackArm, ProductLite } from "./types";
import { positionLabel } from "./labels";

const QUICK_STATUSES = ["Arm Down", "No Premium", "Slow Fill"];

export default function LaneStatusModal({
  open,
  onClose,
  rack,
  laneNumber,
  arms,
  productsById,
  authUserId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rack: TerminalRack;
  laneNumber: number;
  arms: RackArm[];
  productsById: Record<string, ProductLite>;
  authUserId: string;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const laneArms = React.useMemo(
    () => arms.filter((a) => a.lane_number === laneNumber).sort((a, b) => a.arm_number - b.arm_number),
    [arms, laneNumber]
  );

  useEffect(() => {
    if (!open) return;
    const next: Record<number, string> = {};
    for (const a of laneArms) next[a.arm_number] = a.status ?? "";
    setDrafts(next);
    setError(null);
  }, [open, laneNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    setError(null);
    const now = new Date().toISOString();
    const changed = laneArms.filter((a) => (drafts[a.arm_number] ?? "") !== (a.status ?? ""));
    for (const a of changed) {
      const value = (drafts[a.arm_number] ?? "").trim();
      const { error: err } = await supabase
        .from("rack_arms")
        .update({ status: value || null, status_updated_at: now, status_updated_by: authUserId || null })
        .eq("arm_id", a.arm_id);
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  const armLabel = (armNumber: number) => positionLabel(armNumber, rack.arm_count, rack.arm_reversed, rack.arm_alpha);
  const laneLabel = positionLabel(laneNumber, rack.lane_count, rack.lane_reversed, rack.lane_alpha);

  return (
    <FullscreenModal
      open={open}
      title={`Lane ${laneLabel} — Status Update`}
      onClose={onClose}
      footer={
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-2xl bg-[#111] px-4 py-3 font-semibold text-white border border-white/15 hover:bg-[#151515]"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Done"}
        </button>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
        {laneArms.map((a) => {
          const product = a.product_id ? productsById[a.product_id] : null;
          const value = drafts[a.arm_number] ?? "";
          return (
            <div key={a.arm_id} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Arm {armLabel(a.arm_number)}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                  {product ? (product.product_name ?? product.display_name ?? "Product") : "Unassigned"}
                </span>
              </div>
              <input
                type="text"
                value={value}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [a.arm_number]: e.target.value }))}
                placeholder="— Arm Down"
                style={{
                  width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)",
                  color: "white", fontSize: 13,
                }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {QUICK_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDrafts((prev) => ({ ...prev, [a.arm_number]: s }))}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: value === s ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.04)",
                      color: value === s ? "#f87171" : "rgba(255,255,255,0.6)", cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
                {value && (
                  <button
                    type="button"
                    onClick={() => setDrafts((prev) => ({ ...prev, [a.arm_number]: "" }))}
                    style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "transparent", color: "rgba(255,255,255,0.35)", cursor: "pointer" }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </FullscreenModal>
  );
}
