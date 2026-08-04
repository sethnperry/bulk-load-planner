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

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TerminalRack, RackArm, RackProductStatusRow, ProductLite } from "./types";
import { laneLabel, armLabel, computeLaneOffsets } from "./labels";

type View = "racks" | "layout" | "products" | "assign";
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

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 26, borderRadius: 999, position: "relative", cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.15)",
          background: value ? "#4ade80" : "rgba(255,255,255,0.08)",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: value ? 20 : 2, width: 20, height: 20, borderRadius: "50%",
          background: "#fff", transition: "left 120ms ease",
        }} />
      </button>
    </div>
  );
}

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
  const [newRackName, setNewRackName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!open || !terminalId) return;
    setView("racks");
    loadRacks();
  }, [open, terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRack = racks.find((r) => r.rack_id === selectedRackId) ?? null;
  const laneOffsets = useMemo(() => computeLaneOffsets(racks), [racks]);

  async function addRack() {
    const name = newRackName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { data: newRack, error: err } = await supabase
      .from("terminal_racks").insert({ terminal_id: terminalId, rack_name: name })
      .select("rack_id, lane_count, arm_count").single();
    if (err) { setSaving(false); setError(err.message); return; }

    // Seed the rack_arms grid immediately at the table's own defaults --
    // without this, a freshly created rack has zero rack_arms rows until
    // someone happens to open Edit Lane/Arm Layout and hits Save (that's
    // the only other place these rows get created/resized), so both the
    // Lane Map and Assign Arm Products render as if the rack were empty.
    // Found live-testing, not caught by typecheck.
    const seed: { rack_id: string; lane_number: number; arm_number: number }[] = [];
    for (let lane = 1; lane <= newRack.lane_count; lane++) {
      for (let arm = 1; arm <= newRack.arm_count; arm++) {
        seed.push({ rack_id: newRack.rack_id, lane_number: lane, arm_number: arm });
      }
    }
    const { error: seedErr } = await supabase.from("rack_arms").insert(seed);
    setSaving(false);
    if (seedErr) { setError(seedErr.message); return; }

    setNewRackName("");
    await loadRacks();
    onChanged();
  }

  const titleFor: Record<View, string> = {
    racks: "Edit Terminal", layout: "Lane / Arm Layout", products: "Rack Product List", assign: "Assign Arm Products",
  };

  return (
    <FullscreenModal
      open={open}
      title={titleFor[view]}
      onClose={() => { if (view === "racks") onClose(); else setView("racks"); }}
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
          onAssignArms={(id) => { setSelectedRackId(id); setView("assign"); }}
          onRenamed={loadRacks}
        />
      )}

      {view === "layout" && selectedRack && (
        <LayoutView
          rack={selectedRack}
          onSaved={async () => { await loadRacks(); onChanged(); setView("racks"); }}
        />
      )}

      {view === "products" && selectedRack && (
        <ProductsView
          rack={selectedRack}
          onChanged={onChanged}
        />
      )}

      {view === "assign" && selectedRack && (
        <AssignArmsView
          rack={selectedRack}
          laneOffset={laneOffsets[selectedRack.rack_id] ?? 0}
          onChanged={onChanged}
        />
      )}
    </FullscreenModal>
  );
}

function RacksView({
  terminalName, racks, loading, error, newRackName, setNewRackName, onAddRack, saving,
  onEditLayout, onEditProducts, onAssignArms, onRenamed,
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
  onAssignArms: (rackId: string) => void;
  onRenamed: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function saveRename(rackId: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    await supabase.from("terminal_racks").update({ rack_name: name }).eq("rack_id", rackId);
    setRenamingId(null);
    onRenamed();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Racks{terminalName ? <> at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{terminalName}</span></> : ""}. Hidden from drivers — lead/dispatch/admin only.
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
          <button
            type="button"
            onClick={() => onAssignArms(r.rack_id)}
            style={{ width: "100%", fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
          >
            Assign Arm Products
          </button>
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

function LayoutView({ rack, onSaved }: { rack: TerminalRack; onSaved: () => Promise<void> }) {
  const [laneCount, setLaneCount] = useState(rack.lane_count);
  const [laneReversed, setLaneReversed] = useState(rack.lane_reversed);
  const [armCount, setArmCount] = useState(rack.arm_count);
  const [armReversed, setArmReversed] = useState(rack.arm_reversed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);

    const { error: updErr } = await supabase.from("terminal_racks").update({
      lane_count: laneCount, lane_reversed: laneReversed,
      arm_count: armCount, arm_reversed: armReversed,
    }).eq("rack_id", rack.rack_id);
    if (updErr) { setError(updErr.message); setSaving(false); return; }

    const { data: existing, error: fetchErr } = await supabase
      .from("rack_arms").select("arm_id, lane_number, arm_number").eq("rack_id", rack.rack_id);
    if (fetchErr) { setError(fetchErr.message); setSaving(false); return; }

    const existingRows = (existing ?? []) as { arm_id: string; lane_number: number; arm_number: number }[];
    const existingKeys = new Set(existingRows.map((a) => `${a.lane_number}:${a.arm_number}`));
    const toInsert: { rack_id: string; lane_number: number; arm_number: number }[] = [];
    for (let lane = 1; lane <= laneCount; lane++) {
      for (let arm = 1; arm <= armCount; arm++) {
        if (!existingKeys.has(`${lane}:${arm}`)) toInsert.push({ rack_id: rack.rack_id, lane_number: lane, arm_number: arm });
      }
    }
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("rack_arms").insert(toInsert);
      if (insErr) { setError(insErr.message); setSaving(false); return; }
    }

    const toDeleteIds = existingRows.filter((a) => a.lane_number > laneCount || a.arm_number > armCount).map((a) => a.arm_id);
    if (toDeleteIds.length > 0) {
      const { error: delErr } = await supabase.from("rack_arms").delete().in("arm_id", toDeleteIds);
      if (delErr) { setError(delErr.message); setSaving(false); return; }
    }

    setSaving(false);
    await onSaved();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, marginBottom: 4 }}>Lanes</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
          Lane numbers continue across every rack at this terminal (e.g. South Rack 1-5, North Rack 6-10) — never restart at 1.
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>How many lanes?</span>
          <input
            type="number" min={1} max={20} value={laneCount}
            onChange={(e) => setLaneCount(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 64, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, textAlign: "center" as const }}
          />
        </div>
        <ToggleRow label="Reverse order within this rack" value={laneReversed} onChange={setLaneReversed} />
      </div>

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, marginBottom: 4 }}>Arms</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>How many arms per lane?</span>
          <input
            type="number" min={1} max={20} value={armCount}
            onChange={(e) => setArmCount(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 64, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, textAlign: "center" as const }}
          />
        </div>
        <ToggleRow label="Reverse order (e.g. 6-1 instead of 1-6)" value={armReversed} onChange={setArmReversed} />
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
        Shrinking a count removes any arms beyond the new size (and whatever product/status they held). Growing adds blank, unassigned arms — existing ones are never touched.
      </div>

      <button
        onClick={save} disabled={saving}
        style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "#111", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "Saving…" : "Save Layout"}
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

// Assigns up to MAX_PRODUCTS_PER_ARM products to each physical (lane, arm)
// position -- some arms are blenders and carry more than one product at
// once (per explicit user direction + mockup, e.g. an arm showing both
// "D2" and "DYED"). Multi-select checkboxes, not a single dropdown.
function AssignArmsView({ rack, laneOffset, onChanged }: { rack: TerminalRack; laneOffset: number; onChanged: () => void }) {
  const [arms, setArms] = useState<RackArm[]>([]);
  const [rackProducts, setRackProducts] = useState<RackProductStatusRow[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductLite>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data: armRows, error: armErr }, { data: prodRows, error: prodErr }, { data: allProducts }] = await Promise.all([
      supabase.from("rack_arms").select("*").eq("rack_id", rack.rack_id),
      supabase.from("rack_product_status").select("*").eq("rack_id", rack.rack_id).eq("active", true),
      supabase.from("products").select("product_id, product_name, display_name, description, button_code, hex_code, is_dyed"),
    ]);
    if (armErr || prodErr) { setError(armErr?.message ?? prodErr?.message ?? "Failed to load."); setLoading(false); return; }
    setArms(((armRows ?? []) as RackArm[]).sort((a, b) => a.lane_number - b.lane_number || a.arm_number - b.arm_number));
    setRackProducts((prodRows ?? []) as RackProductStatusRow[]);
    const map: Record<string, ProductLite> = {};
    for (const p of (allProducts ?? []) as ProductLite[]) map[p.product_id] = p;
    setProductsById(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, [rack.rack_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleProduct(arm: RackArm, productId: string) {
    const has = arm.product_ids.includes(productId);
    if (!has && arm.product_ids.length >= MAX_PRODUCTS_PER_ARM) return;
    const nextIds = has ? arm.product_ids.filter((p) => p !== productId) : [...arm.product_ids, productId];
    setSavingKey(arm.arm_id);
    const { error: err } = await supabase.from("rack_arms").update({ product_ids: nextIds }).eq("arm_id", arm.arm_id);
    setSavingKey(null);
    if (err) { setError(err.message); return; }
    setArms((prev) => prev.map((a) => (a.arm_id === arm.arm_id ? { ...a, product_ids: nextIds } : a)));
    onChanged();
  }

  const lanes = useMemo(() => {
    const byLane = new Map<number, RackArm[]>();
    for (const a of arms) {
      if (!byLane.has(a.lane_number)) byLane.set(a.lane_number, []);
      byLane.get(a.lane_number)!.push(a);
    }
    return Array.from(byLane.entries()).sort(([a], [b]) => a - b);
  }, [arms]);

  if (rackProducts.length === 0 && !loading) {
    return (
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" as const, padding: "24px 0" }}>
        Add products to this rack's product list first (Edit Product List), then come back here to assign them to specific arms.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Which product(s) each arm currently carries at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{rack.rack_name}</span> — up to {MAX_PRODUCTS_PER_ARM} for blender arms.
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && lanes.map(([laneNum, laneArms]) => (
        <div key={laneNum} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
            Lane {laneLabel(laneNum, rack, laneOffset)}
          </div>
          {laneArms.map((a) => {
            const atCap = a.product_ids.length >= MAX_PRODUCTS_PER_ARM;
            return (
              <div key={a.arm_id} style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Arm {armLabel(a.arm_number, rack)}</span>
                  {atCap && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Max {MAX_PRODUCTS_PER_ARM} reached</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                  {rackProducts.map((rp) => {
                    const p = productsById[rp.product_id];
                    const code = (p?.button_code ?? "").trim() || "PRD";
                    const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
                    const active = a.product_ids.includes(rp.product_id);
                    const disabled = savingKey === a.arm_id || (!active && atCap);
                    return (
                      <button
                        key={rp.product_id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleProduct(a, rp.product_id)}
                        style={{
                          fontSize: 11, fontWeight: 800, padding: "6px 10px", borderRadius: 999, cursor: disabled ? "default" : "pointer",
                          border: `1px solid ${active ? color : "rgba(255,255,255,0.15)"}`,
                          background: active ? `${color}26` : "rgba(255,255,255,0.04)",
                          color: active ? color : "rgba(255,255,255,0.5)",
                          opacity: disabled && !active ? 0.4 : 1,
                        }}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
