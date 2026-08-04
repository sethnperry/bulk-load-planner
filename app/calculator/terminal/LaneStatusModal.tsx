"use client";
// app/calculator/terminal/LaneStatusModal.tsx
//
// "Lane N — Status Update" -- the per-lane STUD action, open to every role.
// Redesigned per explicit user direction (2026-08-04, working from a real
// mockup screenshot): no text fields or quick-chip freeform notes -- just
// toggle buttons for Lane Down (the whole lane), Arm Down (one arm,
// whatever products are on it), and Product Out (one specific product on
// an arm that carries more than one, e.g. a blender).

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TerminalRack, RackArm, RackLane, ProductLite } from "./types";
import { laneLabel, armLabel } from "./labels";

function ToggleChip({ label, active, color = "#ef4444", onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.15)"}`,
        background: active ? `${color}26` : "rgba(255,255,255,0.04)",
        color: active ? color : "rgba(255,255,255,0.6)",
      }}
    >
      {label}
    </button>
  );
}

export default function LaneStatusModal({
  open,
  onClose,
  rack,
  laneOffset,
  laneNumber,
  arms,
  laneIsDown,
  productsById,
  authUserId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rack: TerminalRack;
  laneOffset: number;
  laneNumber: number;
  arms: RackArm[];
  laneIsDown: boolean;
  productsById: Record<string, ProductLite>;
  authUserId: string;
  onSaved: () => void;
}) {
  const [laneDownDraft, setLaneDownDraft] = useState(laneIsDown);
  const [armDownDraft, setArmDownDraft] = useState<Record<string, boolean>>({});
  const [outDraft, setOutDraft] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const laneArms = React.useMemo(
    () => arms.filter((a) => a.lane_number === laneNumber).sort((a, b) => a.arm_number - b.arm_number),
    [arms, laneNumber]
  );

  useEffect(() => {
    if (!open) return;
    setLaneDownDraft(laneIsDown);
    const downs: Record<string, boolean> = {};
    const outs: Record<string, string[]> = {};
    for (const a of laneArms) { downs[a.arm_id] = a.is_down; outs[a.arm_id] = [...a.out_product_ids]; }
    setArmDownDraft(downs);
    setOutDraft(outs);
    setError(null);
  }, [open, laneNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleProductOut(armId: string, productId: string) {
    setOutDraft((prev) => {
      const cur = prev[armId] ?? [];
      const next = cur.includes(productId) ? cur.filter((p) => p !== productId) : [...cur, productId];
      return { ...prev, [armId]: next };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const now = new Date().toISOString();

    const { error: laneErr } = await supabase.from("rack_lanes").upsert(
      { rack_id: rack.rack_id, lane_number: laneNumber, is_down: laneDownDraft, updated_at: now, updated_by: authUserId || null },
      { onConflict: "rack_id,lane_number" }
    );
    if (laneErr) { setError(laneErr.message); setSaving(false); return; }

    for (const a of laneArms) {
      const nextDown = armDownDraft[a.arm_id] ?? a.is_down;
      const nextOut = outDraft[a.arm_id] ?? a.out_product_ids;
      const changed = nextDown !== a.is_down || JSON.stringify([...nextOut].sort()) !== JSON.stringify([...a.out_product_ids].sort());
      if (!changed) continue;
      const { error: armErr } = await supabase.from("rack_arms").update({
        is_down: nextDown, out_product_ids: nextOut, status_updated_at: now, status_updated_by: authUserId || null,
      }).eq("arm_id", a.arm_id);
      if (armErr) { setError(armErr.message); setSaving(false); return; }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <FullscreenModal
      open={open}
      title={`Lane ${laneLabel(laneNumber, rack, laneOffset)} — Status Update`}
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
      <div style={{ display: "grid", gap: 14 }}>
        {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Whole lane</span>
          <ToggleChip label="Lane Down" active={laneDownDraft} onClick={() => setLaneDownDraft((v) => !v)} />
        </div>

        {laneArms.map((a) => (
          <div key={a.arm_id} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Arm {armLabel(a.arm_number, rack)}</span>
              <ToggleChip label="Arm Down" active={armDownDraft[a.arm_id] ?? a.is_down} onClick={() => setArmDownDraft((prev) => ({ ...prev, [a.arm_id]: !(prev[a.arm_id] ?? a.is_down) }))} />
            </div>
            {a.product_ids.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Unassigned</div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {a.product_ids.map((pid) => {
                  const p = productsById[pid];
                  const name = p ? (p.product_name ?? p.display_name ?? "Product") : pid;
                  const active = (outDraft[a.arm_id] ?? a.out_product_ids).includes(pid);
                  return (
                    <ToggleChip key={pid} label={`${name} Out`} active={active} onClick={() => toggleProductOut(a.arm_id, pid)} />
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </FullscreenModal>
  );
}
