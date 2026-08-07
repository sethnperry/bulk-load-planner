"use client";
// app/planner/terminal/LaneStatusModal.tsx
//
// "Lane N — Status Update" -- the per-lane STUD action, open to every role.
// Toggle buttons only (Lane Down / Arm Down / Product Out), no text fields
// or freeform notes. One compact row per arm -- product code(s) + small
// inline toggle buttons on the same line. Lane Down lives in the header,
// to the right of the title, rather than its own row in the content.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { RackArm, ProductLite } from "./types";
import { displayLabel } from "./labels";

function SmallToggle({ label, active, color = "#ef4444", onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 10, fontWeight: 800, padding: "4px 8px", borderRadius: 999, cursor: "pointer", flexShrink: 0,
        border: `1px solid ${active ? color : "rgba(255,255,255,0.15)"}`,
        background: active ? `${color}26` : "rgba(255,255,255,0.04)",
        color: active ? color : "rgba(255,255,255,0.55)",
      }}
    >
      {label}
    </button>
  );
}

export default function LaneStatusModal({
  open,
  onClose,
  rackId,
  laneNumber,
  laneLabelText,
  arms,
  laneIsDown,
  productsById,
  authUserId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rackId: string;
  laneNumber: number;
  laneLabelText: string;
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
      { rack_id: rackId, lane_number: laneNumber, is_down: laneDownDraft, updated_at: now, updated_by: authUserId || null },
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

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    padding: "9px 2px", borderBottom: "1px solid rgba(255,255,255,0.07)",
  };

  return (
    <FullscreenModal
      open={open}
      title={`Lane ${laneLabelText} — Status Update`}
      onClose={onClose}
      headerRight={<SmallToggle label="LANE DOWN" active={laneDownDraft} onClick={() => setLaneDownDraft((v) => !v)} />}
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
      <div>
        {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>{error}</div>}

        {laneArms.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "12px 0" }}>No arms configured for this lane.</div>
        )}

        {laneArms.map((a) => (
          <div key={a.arm_id} style={rowStyle}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, overflow: "hidden" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>Arm {displayLabel(a.label, a.arm_number)}</span>
              {a.product_ids.length === 0 ? (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>—</span>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {a.product_ids.map((pid, i) => {
                    const p = productsById[pid];
                    const code = (p?.button_code ?? "").trim() || "?";
                    const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.7)";
                    return (
                      <React.Fragment key={pid}>
                        {i > 0 && <span style={{ color: "rgba(255,255,255,0.3)" }}> / </span>}
                        <span style={{ color }}>{code}</span>
                      </React.Fragment>
                    );
                  })}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <SmallToggle label="ARM" active={armDownDraft[a.arm_id] ?? a.is_down} onClick={() => setArmDownDraft((prev) => ({ ...prev, [a.arm_id]: !(prev[a.arm_id] ?? a.is_down) }))} />
              {a.product_ids.map((pid) => {
                const p = productsById[pid];
                const code = (p?.button_code ?? "").trim() || "?";
                const active = (outDraft[a.arm_id] ?? a.out_product_ids).includes(pid);
                return (
                  <SmallToggle key={pid} label={code} active={active} onClick={() => toggleProductOut(a.arm_id, pid)} />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </FullscreenModal>
  );
}
