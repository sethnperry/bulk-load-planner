"use client";
// app/calculator/terminal/EditTerminalModal.tsx
//
// Structural configuration for a terminal's racks -- separate from the STUD
// status actions (LaneStatusModal/RackProductStatusModal). Hidden entirely
// from drivers by the parent page (canEditTerminal check before rendering
// the entry button); lead/dispatch/admin only. RLS itself is wide open
// (matches the terminals/terminal_products precedent -- see the migration's
// own comment), so this is a UI-only gate, same risk profile as equipment
// CRUD carried before its 2026-08-07 permission-split migration.
//
// Four internal views rather than four stacked modals -- simpler than
// juggling overlapping FullscreenModal instances for what's really just
// content-swapping within one sheet.
//
// 2026-08-05 rework (per a real mockup + written spec): "Assign Arm
// Products" is no longer its own top-level rack button/view -- product
// assignment moved inline into the Lane/Arm Layout flow itself (expand a
// lane card -> "Lane N -- Arm / Products"). Lane/arm layout editing also
// gained bulk tools (add/remove lane count, alphabetical/numerical
// relabel, reverse order) on top of the existing per-row manual rename --
// see LayoutView's own header comment for the full reasoning.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TerminalRack, RackLane, RackArm, RackProductStatusRow, ProductLite } from "./types";
import { displayLabel } from "./labels";

type View = "racks" | "layout" | "products" | "laneArms";
const MAX_PRODUCTS_PER_ARM = 3;

const GROUPS: { label: string; test: (name: string) => boolean }[] = [
  { label: "Diesel", test: (n) => /diesel|heating oil|marine gas oil|hvo|\bkerosene\b/i.test(n) },
  { label: "Biodiesel Blends", test: (n) => /biodiesel/i.test(n) },
  { label: "Gasoline", test: (n) => /unleaded|recreation fuel/i.test(n) },
  { label: "Ethanol & Flex Fuel", test: (n) => /ethanol|flex fuel|e\d{2}\b/i.test(n) },
  { label: "Aviation & Jet", test: (n) => /aviation|jet fuel|jp-\d/i.test(n) },
  { label: "Blendstocks & Components", test: (n) => /blendstock|alkylate|reformate|isomerate|naphtha|natural gasoline|butane|additive/i.test(n) },
];
function groupFor(name: string): string {
  for (const g of GROUPS) if (g.test(name)) return g.label;
  return "Other / Off-Spec";
}

// 0-indexed -> A, B, ... Z, AA, AB... (won't realistically be needed past
// single letters for lane/arm counts, but doesn't break if it is).
function letterFor(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Shared by LayoutView's lane-level bulk controls and LaneArmProductsView's
// arm-level Reverse Order control -- same icon-box look for both, per
// explicit consistency direction.
const iconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16, fontWeight: 800,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

export default function EditTerminalModal({
  open,
  onClose,
  terminalId,
  terminalName,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  terminalId: string;
  terminalName?: string;
  onChanged: () => void;
}) {
  const [view, setView] = useState<View>("racks");
  const [racks, setRacks] = useState<TerminalRack[]>([]);
  const [selectedRackId, setSelectedRackId] = useState<string>("");
  const [selectedLaneNumber, setSelectedLaneNumber] = useState<number | null>(null);
  const [selectedLaneLabel, setSelectedLaneLabel] = useState<string>("");
  const [newRackName, setNewRackName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Renewal period lives on `terminals` itself (not per-rack) -- it already
  // feeds useExpirations.ts/cardStateFor-style expiry math everywhere a
  // terminal card shows up (Planner, Fleet Cards, Dispatch tab, etc, all via
  // terminals.renewal_days, default 90). It was previously only editable in
  // the old /admin terminal editor; this is the same column, surfaced here
  // too since fleet staff manage terminals from the Terminal tab now.
  const [renewalDays, setRenewalDays] = useState<number | null>(null);

  async function loadRacks() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("terminal_racks")
      .select("*")
      .eq("terminal_id", terminalId)
      .order("rack_name");
    if (err) setError(err.message);
    else setRacks((data ?? []) as TerminalRack[]);
    setLoading(false);
  }

  async function loadTerminalInfo() {
    const { data } = await supabase
      .from("terminals")
      .select("renewal_days")
      .eq("terminal_id", terminalId)
      .maybeSingle();
    setRenewalDays((data as { renewal_days: number | null } | null)?.renewal_days ?? 90);
  }

  async function saveRenewalDays(days: number) {
    setError(null);
    const { error: err } = await supabase.from("terminals").update({ renewal_days: days }).eq("terminal_id", terminalId);
    if (err) { setError(err.message); return; }
    setRenewalDays(days);
    onChanged();
  }

  useEffect(() => {
    if (!open || !terminalId) return;
    setView("racks");
    loadRacks();
    loadTerminalInfo();
  }, [open, terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRack = racks.find((r) => r.rack_id === selectedRackId) ?? null;

  async function addRack() {
    const name = newRackName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("terminal_racks").insert({ terminal_id: terminalId, rack_name: name });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setNewRackName("");
    await loadRacks();
    onChanged();
  }

  // Cascades manually -- rack_lanes/rack_arms/rack_product_status all
  // reference rack_id as a plain column, not a DB-level FK with ON DELETE
  // CASCADE, so an unassisted delete of the terminal_racks row would leave
  // orphaned rows behind. Found while testing -- there was no way to
  // delete a rack at all before this (only rename/reconfigure it), a real
  // gap once test racks started accumulating.
  async function deleteRack(rackId: string) {
    setSaving(true);
    setError(null);
    await supabase.from("rack_arms").delete().eq("rack_id", rackId);
    await supabase.from("rack_lanes").delete().eq("rack_id", rackId);
    await supabase.from("rack_product_status").delete().eq("rack_id", rackId);
    const { error: err } = await supabase.from("terminal_racks").delete().eq("rack_id", rackId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await loadRacks();
    onChanged();
  }

  const title = view === "laneArms"
    ? `Lane ${selectedLaneLabel} — Arm / Products`
    : ({ racks: "Edit Terminal", layout: "Lane / Arm Layout", products: "Rack Product List" } as Record<string, string>)[view];

  return (
    <FullscreenModal
      open={open}
      title={title}
      onClose={() => {
        if (view === "racks") onClose();
        else if (view === "laneArms") setView("layout");
        else setView("racks");
      }}
      footer={view === "racks" ? undefined : null}
    >
      {view === "racks" && (
        <RacksView
          terminalName={terminalName}
          racks={racks}
          loading={loading}
          error={error}
          newRackName={newRackName}
          setNewRackName={setNewRackName}
          onAddRack={addRack}
          saving={saving}
          onEditLayout={(id) => { setSelectedRackId(id); setView("layout"); }}
          onEditProducts={(id) => { setSelectedRackId(id); setView("products"); }}
          onRenamed={loadRacks}
          onDeleteRack={deleteRack}
          renewalDays={renewalDays}
          onSaveRenewalDays={saveRenewalDays}
        />
      )}

      {view === "layout" && selectedRack && (
        <LayoutView
          rack={selectedRack}
          onChanged={onChanged}
          onExpandLane={(laneNumber, laneLabel) => {
            setSelectedLaneNumber(laneNumber);
            setSelectedLaneLabel(laneLabel);
            setView("laneArms");
          }}
        />
      )}

      {view === "products" && selectedRack && (
        <ProductsView
          rack={selectedRack}
          onChanged={onChanged}
        />
      )}

      {view === "laneArms" && selectedRack && selectedLaneNumber != null && (
        <LaneArmProductsView
          rack={selectedRack}
          laneNumber={selectedLaneNumber}
          onChanged={onChanged}
        />
      )}
    </FullscreenModal>
  );
}

function RacksView({
  terminalName, racks, loading, error, newRackName, setNewRackName, onAddRack, saving,
  onEditLayout, onEditProducts, onRenamed, onDeleteRack,
  renewalDays, onSaveRenewalDays,
}: {
  terminalName?: string;
  racks: TerminalRack[];
  loading: boolean;
  error: string | null;
  newRackName: string;
  setNewRackName: (v: string) => void;
  onAddRack: () => void;
  saving: boolean;
  onEditLayout: (rackId: string) => void;
  onEditProducts: (rackId: string) => void;
  onRenamed: () => void;
  onDeleteRack: (rackId: string) => void;
  renewalDays: number | null;
  onSaveRenewalDays: (days: number) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renewalDraft, setRenewalDraft] = useState(String(renewalDays ?? 90));
  useEffect(() => { setRenewalDraft(String(renewalDays ?? 90)); }, [renewalDays]);

  async function saveRename(rackId: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    await supabase.from("terminal_racks").update({ rack_name: name }).eq("rack_id", rackId);
    setRenamingId(null);
    onRenamed();
  }

  function commitRenewalDays() {
    const n = parseInt(renewalDraft, 10);
    if (Number.isFinite(n) && n > 0) onSaveRenewalDays(n);
    else setRenewalDraft(String(renewalDays ?? 90));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Racks{terminalName ? <> at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{terminalName}</span></> : ""}. Hidden from drivers — lead/dispatch/admin only.
      </div>

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Access Renewal Period</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Days after a driver's last visit before their card here needs renewal — drives the expiration warnings for every driver's card at this terminal.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <input
            type="text" inputMode="numeric" value={renewalDraft}
            onChange={(e) => setRenewalDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitRenewalDays}
            style={{
              width: 52, padding: "6px 4px", borderRadius: 6, textAlign: "center" as const,
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff",
              fontSize: 14, fontWeight: 800, boxSizing: "border-box" as const,
            }}
          />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>days</span>
        </div>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && racks.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>No racks yet — add the first one below.</div>
      )}

      {racks.map((r) => (
        <div key={r.rack_id} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "grid", gap: 8 }}>
          {renamingId === r.rack_id ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
              />
              <button onClick={() => saveRename(r.rack_id)} style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>Save</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{r.rack_name}</span>
              <button
                type="button"
                onClick={() => { setRenamingId(r.rack_id); setRenameValue(r.rack_name); }}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}
              >
                Rename
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => onEditProducts(r.rack_id)}
              style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
            >
              Edit Product List
            </button>
            <button
              type="button"
              onClick={() => onEditLayout(r.rack_id)}
              style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
            >
              Edit Lane/Arm Layout
            </button>
          </div>

          {confirmDeleteId === r.rack_id ? (
            <div style={{ borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", padding: 10, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Delete <strong>{r.rack_name}</strong>? This removes its lanes, arms, and product list — cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button" onClick={() => { onDeleteRack(r.rack_id); setConfirmDeleteId(null); }}
                  style={{ flex: 1, fontSize: 12, fontWeight: 800, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.18)", color: "#f87171", cursor: "pointer" }}
                >
                  Yes, delete
                </button>
                <button
                  type="button" onClick={() => setConfirmDeleteId(null)}
                  style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(r.rack_id)}
              style={{ width: "100%", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: "none", background: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer" }}
            >
              Delete Rack
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <input
          type="text" value={newRackName} onChange={(e) => setNewRackName(e.target.value)}
          placeholder="New rack name (e.g. North Rack)"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
        />
        <button
          type="button" onClick={onAddRack} disabled={saving || !newRackName.trim()}
          style={{ fontSize: 13, fontWeight: 700, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", opacity: saving || !newRackName.trim() ? 0.5 : 1 }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// ── Lane/Arm Layout ─────────────────────────────────────────────────────────
//
// 2026-08-05 rework, per a real mockup + written spec. Every lane/arm still
// carries a real, freely-editable text label (unchanged since the 2026-08-04
// explicit-labels migration) -- what's new here is a set of BULK actions on
// top of that, so an admin doesn't have to retype every lane/arm by hand to
// match how a facility's signage actually runs:
//   - Add/remove lanes from the end (+/- at the top, replacing the old
//     bottom "+ Add Lane" button -- removal now targets the highest
//     lane_number, there's no per-row delete anymore, matching the mockup).
//   - Alphabetical/Numerical: relabels EVERY lane right now to a fresh
//     sequential letter or number series, in current top-to-bottom
//     (lane_number ascending) order. The button always shows the OPPOSITE
//     of the detected current mode ("ABC"/Alphabetical when numeric or
//     custom-labeled, "123"/Numerical once already exactly alphabetized) --
//     it describes what tapping it will DO, not the current state.
//   - Reverse Order: reverses whatever label sequence currently exists
//     across the lanes, top-to-bottom. Deliberately generic (just swaps
//     label CONTENT across the same physical rows, never reassigns
//     lane_number itself) so it's well-defined for numeric, alphabetic, or
//     custom text alike, and product/arm assignments never move.
//   - Per-lane: a live arm-count field (type a number, arms are added/
//     removed from the end to match) and a per-lane reverse-arm-order
//     toggle -- same generic reverse, scoped to that lane's own arms.
//     Real-world reasoning from the user: a driver can load the wrong
//     compartment if the arm order here doesn't match which way the
//     physical arms actually run at the terminal.
//   - Expanding a lane card (chevron) now opens product assignment inline
//     (LaneArmProductsView below) -- "Assign Arm Products" is no longer a
//     separate top-level rack button.
function LayoutView({
  rack, onChanged, onExpandLane,
}: {
  rack: TerminalRack;
  onChanged: () => void;
  onExpandLane: (laneNumber: number, laneLabel: string) => void;
}) {
  const [lanes, setLanes] = useState<RackLane[]>([]);
  const [arms, setArms] = useState<RackArm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data: laneRows, error: laneErr }, { data: armRows, error: armErr }] = await Promise.all([
      supabase.from("rack_lanes").select("*").eq("rack_id", rack.rack_id),
      supabase.from("rack_arms").select("*").eq("rack_id", rack.rack_id),
    ]);
    if (laneErr || armErr) { setError(laneErr?.message ?? armErr?.message ?? "Failed to load."); setLoading(false); return; }
    setLanes(((laneRows ?? []) as RackLane[]).sort((a, b) => a.lane_number - b.lane_number));
    setArms((armRows ?? []) as RackArm[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [rack.rack_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedLanes = useMemo(() => [...lanes].sort((a, b) => a.lane_number - b.lane_number), [lanes]);

  const isAlphabetized = useMemo(() => {
    if (sortedLanes.length === 0) return false;
    return sortedLanes.every((l, i) => displayLabel(l.label, l.lane_number) === letterFor(i));
  }, [sortedLanes]);

  async function addLaneAtEnd() {
    setBusy(true);
    setError(null);
    const nextNum = lanes.length ? Math.max(...lanes.map((l) => l.lane_number)) + 1 : 1;
    const { error: err } = await supabase.from("rack_lanes").insert({
      rack_id: rack.rack_id, lane_number: nextNum, label: String(lanes.length + 1), is_down: false,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    await load();
    onChanged();
  }

  async function removeLaneByNumber(laneNumber: number) {
    setBusy(true);
    setError(null);
    await supabase.from("rack_arms").delete().eq("rack_id", rack.rack_id).eq("lane_number", laneNumber);
    const { error: err } = await supabase.from("rack_lanes").delete().eq("rack_id", rack.rack_id).eq("lane_number", laneNumber);
    setBusy(false);
    if (err) { setError(err.message); return; }
    await load();
    onChanged();
  }

  async function removeLastLane() {
    if (sortedLanes.length === 0) return;
    await removeLaneByNumber(sortedLanes[sortedLanes.length - 1].lane_number);
  }

  async function toggleLaneLabelMode() {
    if (sortedLanes.length === 0) return;
    setBusy(true);
    setError(null);
    const results = await Promise.all(sortedLanes.map((l, i) => {
      const label = isAlphabetized ? String(i + 1) : letterFor(i);
      return supabase.from("rack_lanes").update({ label }).eq("rack_id", rack.rack_id).eq("lane_number", l.lane_number);
    }));
    setBusy(false);
    const err = results.find((r) => r.error)?.error;
    if (err) { setError(err.message); return; }
    await load();
    onChanged();
  }

  async function reverseLaneOrder() {
    if (sortedLanes.length < 2) return;
    setBusy(true);
    setError(null);
    const labels = sortedLanes.map((l) => displayLabel(l.label, l.lane_number));
    const reversed = [...labels].reverse();
    const results = await Promise.all(sortedLanes.map((l, i) =>
      supabase.from("rack_lanes").update({ label: reversed[i] }).eq("rack_id", rack.rack_id).eq("lane_number", l.lane_number)
    ));
    setBusy(false);
    const err = results.find((r) => r.error)?.error;
    if (err) { setError(err.message); return; }
    await load();
    onChanged();
  }

  async function setArmCount(laneNumber: number, newCount: number) {
    const laneArms = arms.filter((a) => a.lane_number === laneNumber).sort((a, b) => a.arm_number - b.arm_number);
    if (newCount === laneArms.length) return;
    setBusy(true);
    setError(null);
    if (newCount > laneArms.length) {
      const toAdd = [];
      for (let i = laneArms.length; i < newCount; i++) {
        toAdd.push({ rack_id: rack.rack_id, lane_number: laneNumber, arm_number: i + 1, label: String(i + 1) });
      }
      const { error: err } = await supabase.from("rack_arms").insert(toAdd);
      setBusy(false);
      if (err) { setError(err.message); return; }
    } else {
      const toRemove = laneArms.slice(newCount);
      const { error: err } = await supabase.from("rack_arms").delete().in("arm_id", toRemove.map((a) => a.arm_id));
      setBusy(false);
      if (err) { setError(err.message); return; }
    }
    await load();
    onChanged();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={removeLastLane} disabled={busy || lanes.length === 0} style={{ ...iconBtnStyle, opacity: busy || lanes.length === 0 ? 0.4 : 1 }} aria-label="Remove last lane">−</button>
            <button type="button" onClick={addLaneAtEnd} disabled={busy} style={{ ...iconBtnStyle, opacity: busy ? 0.4 : 1 }} aria-label="Add lane">+</button>
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Add or Remove Lanes</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button" onClick={toggleLaneLabelMode} disabled={busy || lanes.length === 0}
            style={{ ...iconBtnStyle, width: 48, fontSize: 12, opacity: busy || lanes.length === 0 ? 0.4 : 1 }}
          >
            {isAlphabetized ? "123" : "ABC"}
          </button>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{isAlphabetized ? "Numerical" : "Alphabetical"}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button" onClick={reverseLaneOrder} disabled={busy || lanes.length < 2}
            style={{ ...iconBtnStyle, opacity: busy || lanes.length < 2 ? 0.4 : 1 }} aria-label="Reverse lane order"
          >
            ⇅
          </button>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Reverse Order</span>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
        Expand cards to select products for each lane.
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {!loading && sortedLanes.map((lane) => {
          const laneArms = arms.filter((a) => a.lane_number === lane.lane_number).sort((a, b) => a.arm_number - b.arm_number);
          return (
            <LaneRow
              key={lane.lane_number}
              lane={lane}
              laneArms={laneArms}
              busy={busy}
              onSetArmCount={(n) => setArmCount(lane.lane_number, n)}
              onExpand={() => onExpandLane(lane.lane_number, displayLabel(lane.label, lane.lane_number))}
            />
          );
        })}
        {!loading && lanes.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>No lanes yet — tap + above to add one.</div>
        )}
      </div>
    </div>
  );
}

function LaneRow({
  lane, laneArms, busy, onSetArmCount, onExpand,
}: {
  lane: RackLane;
  laneArms: RackArm[];
  busy: boolean;
  onSetArmCount: (n: number) => void;
  onExpand: () => void;
}) {
  const [countDraft, setCountDraft] = useState(String(laneArms.length));
  useEffect(() => { setCountDraft(String(laneArms.length)); }, [laneArms.length]);

  function commitCount() {
    const n = parseInt(countDraft, 10);
    if (Number.isFinite(n) && n >= 0 && n !== laneArms.length) onSetArmCount(n);
    else setCountDraft(String(laneArms.length));
  }

  return (
    <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", minWidth: 20, textAlign: "center" as const, flexShrink: 0 }}>
        {displayLabel(lane.label, lane.lane_number)}
      </span>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>Arms</span>
      <input
        type="text" inputMode="numeric" value={countDraft}
        onChange={(e) => setCountDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commitCount}
        disabled={busy}
        style={{
          width: 40, padding: "6px 4px", borderRadius: 6, textAlign: "center" as const,
          border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff",
          fontSize: 14, fontWeight: 800, boxSizing: "border-box" as const,
        }}
      />
      <button
        type="button" onClick={onExpand}
        style={{ fontSize: 20, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", padding: "0 2px", marginLeft: "auto" }}
        aria-label="Expand lane"
      >
        ›
      </button>
    </div>
  );
}

function ProductsView({ rack, onChanged }: { rack: TerminalRack; onChanged: () => void }) {
  const [allProducts, setAllProducts] = useState<ProductLite[]>([]);
  const [activeMap, setActiveMap] = useState<Record<string, boolean | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [{ data: products, error: pErr }, { data: rp, error: rpErr }] = await Promise.all([
        supabase.from("products").select("product_id, product_name, display_name, button_code, hex_code, is_dyed").order("product_name"),
        supabase.from("rack_product_status").select("product_id, active").eq("rack_id", rack.rack_id),
      ]);
      if (cancelled) return;
      if (pErr || rpErr) {
        setError(pErr?.message ?? rpErr?.message ?? "Failed to load products.");
        setLoading(false);
        return;
      }
      const map: Record<string, boolean | undefined> = {};
      for (const row of (rp ?? []) as any[]) map[row.product_id] = row.active !== false;
      setAllProducts((products ?? []) as ProductLite[]);
      setActiveMap(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [rack.rack_id]);

  async function toggle(productId: string) {
    const isActive = activeMap[productId] === true;
    const nextActive = !isActive;
    setSavingId(productId);
    const rowExists = activeMap[productId] !== undefined;
    const { error: err } = rowExists
      ? await supabase.from("rack_product_status").update({ active: nextActive }).eq("rack_id", rack.rack_id).eq("product_id", productId)
      : await supabase.from("rack_product_status").insert({ rack_id: rack.rack_id, product_id: productId, active: nextActive, is_out: false });
    setSavingId(null);
    if (err) { setError(err.message); return; }
    setActiveMap((prev) => ({ ...prev, [productId]: nextActive }));
    onChanged();
  }

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allProducts.filter((p) => [p.product_name, p.display_name, p.button_code].some((v) => (v ?? "").toLowerCase().includes(q)))
      : allProducts;
    const byGroup: Record<string, ProductLite[]> = {};
    for (const p of filtered) {
      const g = groupFor(p.product_name ?? "");
      (byGroup[g] ??= []).push(p);
    }
    const order = [...GROUPS.map((g) => g.label), "Other / Off-Spec"];
    return order.filter((g) => byGroup[g]?.length).map((g) => ({ label: g, products: byGroup[g] }));
  }, [allProducts, search]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Products carried at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{rack.rack_name}</span>. Tap to add or remove.
      </div>

      <input
        type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products…"
        style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
      />

      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && grouped.map(({ label, products }) => (
        <div key={label} style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.6, marginTop: 4 }}>{label}</div>
          {products.map((p) => {
            const isActive = activeMap[p.product_id] === true;
            const btnCode = ((p.button_code ?? "").trim() || "PRD").toUpperCase();
            const btnColor = (p.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
            const name = (p.product_name ?? p.display_name ?? "").trim() || "Product";
            const saving = savingId === p.product_id;
            return (
              <button
                key={p.product_id} type="button" disabled={saving} onClick={() => toggle(p.product_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)",
                  cursor: "pointer", width: "100%", boxSizing: "border-box" as const, opacity: saving ? 0.5 : 1,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: btnColor, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: "left" as const, fontWeight: 700, fontSize: 14, color: "white" }}>{name} <span style={{ fontSize: 11, color: btnColor }}>{btnCode}</span></span>
                <span style={{ fontSize: 12, fontWeight: 800, color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.30)" }}>
                  {isActive ? "✓ Active" : "+ Add"}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Lane N — Arm / Products (replaces the old standalone "Assign Arm
// Products" rack-wide view -- now scoped to one lane at a time, reached by
// expanding that lane's card in LayoutView) ─────────────────────────────────
//
// "+" opens a picker modal scoped to this rack's own active product list
// (not the full catalog), styled like the catalog (grouped, colored dot,
// code) per explicit spec. "−" removes the RIGHTMOST assigned product
// first, then the next, clearing one at a time from the right -- matches
// "clear the arm one at a time" from the right, per explicit user spec.
function LaneArmProductsView({ rack, laneNumber, onChanged }: { rack: TerminalRack; laneNumber: number; onChanged: () => void }) {
  const [arms, setArms] = useState<RackArm[]>([]);
  const [rackProducts, setRackProducts] = useState<RackProductStatusRow[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductLite>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingArmId, setSavingArmId] = useState<string | null>(null);
  const [pickerArmId, setPickerArmId] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data: armRows, error: armErr }, { data: prodRows, error: prodErr }, { data: allProducts }] = await Promise.all([
      supabase.from("rack_arms").select("*").eq("rack_id", rack.rack_id).eq("lane_number", laneNumber),
      supabase.from("rack_product_status").select("*").eq("rack_id", rack.rack_id).eq("active", true),
      supabase.from("products").select("product_id, product_name, display_name, description, button_code, hex_code, is_dyed"),
    ]);
    if (armErr || prodErr) { setError(armErr?.message ?? prodErr?.message ?? "Failed to load."); setLoading(false); return; }
    setArms(((armRows ?? []) as RackArm[]).sort((a, b) => a.arm_number - b.arm_number));
    setRackProducts((prodRows ?? []) as RackProductStatusRow[]);
    const map: Record<string, ProductLite> = {};
    for (const p of (allProducts ?? []) as ProductLite[]) map[p.product_id] = p;
    setProductsById(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, [rack.rack_id, laneNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addProduct(armId: string, productId: string) {
    const arm = arms.find((a) => a.arm_id === armId);
    if (!arm) return;
    if (arm.product_ids.includes(productId) || arm.product_ids.length >= MAX_PRODUCTS_PER_ARM) return;
    const nextIds = [...arm.product_ids, productId];
    setSavingArmId(armId);
    const { error: err } = await supabase.from("rack_arms").update({ product_ids: nextIds }).eq("arm_id", armId);
    setSavingArmId(null);
    if (err) { setError(err.message); return; }
    setArms((prev) => prev.map((a) => (a.arm_id === armId ? { ...a, product_ids: nextIds } : a)));
    onChanged();
    setPickerArmId(null);
  }

  async function removeLastProduct(armId: string) {
    const arm = arms.find((a) => a.arm_id === armId);
    if (!arm || arm.product_ids.length === 0) return;
    const nextIds = arm.product_ids.slice(0, -1);
    setSavingArmId(armId);
    const { error: err } = await supabase.from("rack_arms").update({ product_ids: nextIds }).eq("arm_id", armId);
    setSavingArmId(null);
    if (err) { setError(err.message); return; }
    setArms((prev) => prev.map((a) => (a.arm_id === armId ? { ...a, product_ids: nextIds } : a)));
    onChanged();
  }

  // Moved here from the lane-card list (2026-08-05 follow-up) -- reversing
  // arm order was invisible on the card itself (nothing there shows arm
  // order at all), so tapping it looked like it did nothing. Here, the arm
  // rows visibly re-label top-to-bottom, so the effect is actually
  // observable. Same generic "reverse whatever label sequence currently
  // exists" behavior as the lane-level Reverse Order, scoped to just this
  // lane's arms (this view is already lane-scoped, so `arms` here IS "this
  // lane's arms" -- no filtering needed).
  async function reverseArmOrder() {
    const sorted = [...arms].sort((a, b) => a.arm_number - b.arm_number);
    if (sorted.length < 2) return;
    setReversing(true);
    setError(null);
    const labels = sorted.map((a) => displayLabel(a.label, a.arm_number));
    const reversed = [...labels].reverse();
    const results = await Promise.all(sorted.map((a, i) =>
      supabase.from("rack_arms").update({ label: reversed[i] }).eq("arm_id", a.arm_id)
    ));
    setReversing(false);
    const err = results.find((r) => r.error)?.error;
    if (err) { setError(err.message); return; }
    await load();
    onChanged();
  }

  const pickerArm = arms.find((a) => a.arm_id === pickerArmId) ?? null;

  if (rackProducts.length === 0 && !loading) {
    return (
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" as const, padding: "24px 0" }}>
        Add products to this rack's product list first (Edit Product List), then come back here to assign them to arms.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button" onClick={reverseArmOrder} disabled={reversing || arms.length < 2}
          style={{ ...iconBtnStyle, opacity: reversing || arms.length < 2 ? 0.4 : 1 }} aria-label="Reverse arm order"
        >
          ⇅
        </button>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Reverse Order</span>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && arms.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>No arms configured for this lane yet.</div>
      )}

      {!loading && arms.map((a) => {
        const atCap = a.product_ids.length >= MAX_PRODUCTS_PER_ARM;
        const saving = savingArmId === a.arm_id;
        return (
          <div key={a.arm_id} style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: "10px 12px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>Arm {displayLabel(a.label, a.arm_number)} —</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, flex: 1 }}>
              {a.product_ids.map((pid) => {
                const p = productsById[pid];
                const code = (p?.button_code ?? "").trim() || "PRD";
                const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
                return (
                  <span key={pid} style={{ fontSize: 12, fontWeight: 800, padding: "4px 9px", borderRadius: 999, border: `1px solid ${color}`, background: `${color}26`, color }}>
                    {code}
                  </span>
                );
              })}
            </div>
            <button
              type="button" disabled={saving || atCap} onClick={() => setPickerArmId(a.arm_id)}
              style={{ fontSize: 16, fontWeight: 800, color: "#4ade80", background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6, width: 30, height: 30, flexShrink: 0, cursor: atCap ? "default" : "pointer", opacity: atCap ? 0.35 : 1 }}
              aria-label="Add product"
            >
              +
            </button>
            <button
              type="button" disabled={saving || a.product_ids.length === 0} onClick={() => removeLastProduct(a.arm_id)}
              style={{ fontSize: 16, fontWeight: 800, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 6, width: 30, height: 30, flexShrink: 0, cursor: a.product_ids.length === 0 ? "default" : "pointer", opacity: a.product_ids.length === 0 ? 0.35 : 1 }}
              aria-label="Remove rightmost product"
            >
              −
            </button>
          </div>
        );
      })}

      {pickerArm && (
        <ArmProductPickerModal
          open={!!pickerArm}
          rackProducts={rackProducts}
          productsById={productsById}
          excludeIds={pickerArm.product_ids}
          onPick={(productId) => addProduct(pickerArm.arm_id, productId)}
          onClose={() => setPickerArmId(null)}
        />
      )}
    </div>
  );
}

// Product picker for one arm -- scoped to this rack's own active product
// list (not the full catalog), grouped/styled the same way ProductsView
// renders the full catalog, per explicit spec ("display exactly like the
// full catalog does just limited to what is actually available").
function ArmProductPickerModal({
  open, rackProducts, productsById, excludeIds, onPick, onClose,
}: {
  open: boolean;
  rackProducts: RackProductStatusRow[];
  productsById: Record<string, ProductLite>;
  excludeIds: string[];
  onPick: (productId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const available = rackProducts
      .filter((rp) => !excludeIds.includes(rp.product_id))
      .map((rp) => productsById[rp.product_id])
      .filter((p): p is ProductLite => !!p)
      .filter((p) => !q || [p.product_name, p.display_name, p.button_code].some((v) => (v ?? "").toLowerCase().includes(q)));
    const byGroup: Record<string, ProductLite[]> = {};
    for (const p of available) {
      const g = groupFor(p.product_name ?? "");
      (byGroup[g] ??= []).push(p);
    }
    const order = [...GROUPS.map((g) => g.label), "Other / Off-Spec"];
    return order.filter((g) => byGroup[g]?.length).map((g) => ({ label: g, products: byGroup[g] }));
  }, [rackProducts, productsById, excludeIds, search]);

  return (
    <FullscreenModal open={open} title="Add Product to Arm" onClose={onClose} footer={null}>
      <div style={{ display: "grid", gap: 12 }}>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
        />

        {grouped.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "24px 0" }}>
            No more products available to add.
          </div>
        )}

        {grouped.map(({ label, products }) => (
          <div key={label} style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.6, marginTop: 4 }}>{label}</div>
            {products.map((p) => {
              const btnCode = ((p.button_code ?? "").trim() || "PRD").toUpperCase();
              const btnColor = (p.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
              const name = (p.product_name ?? p.display_name ?? "").trim() || "Product";
              return (
                <button
                  key={p.product_id} type="button" onClick={() => onPick(p.product_id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)",
                    cursor: "pointer", width: "100%", boxSizing: "border-box" as const,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: btnColor, flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" as const, fontWeight: 700, fontSize: 14, color: "white" }}>{name} <span style={{ fontSize: 11, color: btnColor }}>{btnCode}</span></span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </FullscreenModal>
  );
}
