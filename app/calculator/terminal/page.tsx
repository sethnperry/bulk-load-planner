"use client";
// app/calculator/terminal/page.tsx
//
// New Terminal tab -- available to every role (see CalculatorLayoutClient.tsx),
// but structural editing (Edit Terminal) is hidden entirely from drivers.
// Shows the current terminal's racks as sub-tabs, each rendering a lane x arm
// grid (RackLaneGrid). STUD actions (LaneStatusModal / RackProductStatusModal)
// are open to every role by design -- this is a crowdsourced status board for
// v1, deliberately not wired into the Planner (see CLAUDE.md).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import CenteredSubTabs, { type CenteredSubTab } from "../components/CenteredSubTabs";
import RackLaneGrid from "./RackLaneGrid";
import LaneStatusModal from "./LaneStatusModal";
import RackProductStatusModal from "./RackProductStatusModal";
import EditTerminalModal from "./EditTerminalModal";
import type { TerminalRack, RackArm, RackLane, RackProductStatusRow, ProductLite } from "./types";
import { computeLaneOffsets } from "./labels";

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "28px 18px", textAlign: "center" as const }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

export default function TerminalPage() {
  const shell = useCalculatorShell();

  // Dispatch/admin context: when a driver is selected, show *their* current
  // terminal (inferred from their most recent load) instead of the
  // viewer's own location.selectedTerminalId -- there's no live GPS/check-in
  // signal to know where a driver physically is, so "most recent load's
  // terminal" is the best available proxy.
  const isDispatchContext = (shell.role === "dispatch" || (shell.role === "admin" && !shell.adminActingAsLead)) && Boolean(shell.selectedDriverId);
  const [driverTerminalId, setDriverTerminalId] = useState<string | null>(null);

  useEffect(() => {
    if (!isDispatchContext) { setDriverTerminalId(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("load_log").select("terminal_id").eq("user_id", shell.selectedDriverId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!cancelled) setDriverTerminalId((data as any)?.terminal_id ?? null);
    })();
    return () => { cancelled = true; };
  }, [isDispatchContext, shell.selectedDriverId]);

  const terminalId = isDispatchContext ? driverTerminalId : shell.location.selectedTerminalId;
  const terminal = useMemo(
    () => (shell.terminals.terminalCatalog as any[])?.find((t) => String(t.terminal_id) === String(terminalId)) ?? null,
    [shell.terminals.terminalCatalog, terminalId]
  );

  const canEditTerminal = shell.role === "lead" || shell.role === "dispatch" || shell.role === "admin";

  const [racks, setRacks] = useState<TerminalRack[]>([]);
  const [activeRackId, setActiveRackId] = useState("");
  const [arms, setArms] = useState<RackArm[]>([]);
  const [lanes, setLanes] = useState<RackLane[]>([]);
  const [rackProducts, setRackProducts] = useState<RackProductStatusRow[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductLite>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [productStatusOpen, setProductStatusOpen] = useState(false);
  const [editTerminalOpen, setEditTerminalOpen] = useState(false);

  const loadRacks = useCallback(async () => {
    if (!terminalId) { setRacks([]); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("terminal_racks").select("*").eq("terminal_id", terminalId).order("rack_name");
    if (err) { setError(err.message); setLoading(false); return; }
    const rows = (data ?? []) as TerminalRack[];
    setRacks(rows);
    setActiveRackId((prev) => (rows.find((r) => r.rack_id === prev) ? prev : rows[0]?.rack_id ?? ""));
    setLoading(false);
  }, [terminalId]);

  useEffect(() => { loadRacks(); }, [loadRacks]);

  const loadRackDetail = useCallback(async () => {
    if (!activeRackId) { setArms([]); setLanes([]); setRackProducts([]); return; }
    const [{ data: armRows, error: armErr }, { data: laneRows, error: laneErr }, { data: prodRows, error: prodErr }] = await Promise.all([
      supabase.from("rack_arms").select("*").eq("rack_id", activeRackId),
      supabase.from("rack_lanes").select("*").eq("rack_id", activeRackId),
      supabase.from("rack_product_status").select("*").eq("rack_id", activeRackId).eq("active", true),
    ]);
    if (armErr || laneErr || prodErr) { setError(armErr?.message ?? laneErr?.message ?? prodErr?.message ?? "Failed to load rack detail."); return; }
    setArms((armRows ?? []) as RackArm[]);
    setLanes((laneRows ?? []) as RackLane[]);
    setRackProducts((prodRows ?? []) as RackProductStatusRow[]);
  }, [activeRackId]);

  useEffect(() => { loadRackDetail(); }, [loadRackDetail]);

  // All-products catalog, fetched once -- used to resolve names/colors for
  // arms and rack products by id.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("products")
        .select("product_id, product_name, display_name, description, button_code, hex_code, is_dyed");
      const map: Record<string, ProductLite> = {};
      for (const p of (data ?? []) as ProductLite[]) map[p.product_id] = p;
      setProductsById(map);
    })();
  }, []);

  const activeRack = racks.find((r) => r.rack_id === activeRackId) ?? null;
  const subTabs: CenteredSubTab[] = racks.map((r) => ({ id: r.rack_id, label: r.rack_name }));
  const laneOffsets = useMemo(() => computeLaneOffsets(racks), [racks]);
  const rackProductStatusById = useMemo(() => {
    const m: Record<string, RackProductStatusRow> = {};
    for (const rp of rackProducts) m[rp.product_id] = rp;
    return m;
  }, [rackProducts]);

  if (!terminalId) {
    return (
      <div style={{ paddingTop: 4 }}>
        <PlaceholderPanel
          title="No terminal selected"
          note={isDispatchContext ? "This driver has no recent loads to infer a terminal from." : "Pick a location and terminal in the Planner to see its rack status here."}
        />
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 4 }}>
      {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && racks.length === 0 && (
        <PlaceholderPanel
          title="No racks configured yet"
          note={canEditTerminal ? "Tap Edit Terminal below to add the first rack for this terminal." : "This terminal hasn't been set up yet — check back later."}
        />
      )}

      {!loading && racks.length > 0 && activeRack && (
        <>
          <div style={{ marginBottom: 14 }}>
            <CenteredSubTabs tabs={subTabs} activeId={activeRackId} onChange={setActiveRackId} accentColor="#ffffff" />
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 10 }}>{activeRack.rack_name} Lane Map</div>
            <RackLaneGrid
              rack={activeRack}
              laneOffset={laneOffsets[activeRack.rack_id] ?? 0}
              arms={arms}
              lanes={lanes}
              rackProductStatusById={rackProductStatusById}
              productsById={productsById}
              onSelectLane={setSelectedLane}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 10 }}>{activeRack.rack_name} Product List</div>
            {rackProducts.length === 0 && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No products configured for this rack yet.</div>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              {rackProducts.map((rp) => {
                const p = productsById[rp.product_id];
                const name = p ? (p.product_name ?? p.display_name ?? "Product") : rp.product_id;
                const code = (p?.button_code ?? "").trim();
                const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.7)";
                return (
                  <div key={rp.product_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, gap: 12, opacity: rp.is_out ? 0.5 : 1 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ color, fontWeight: 800 }}>{code}</span>
                      <span style={{ color: "#fff", fontWeight: 600, textDecoration: rp.is_out ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {name}
                      </span>
                      {p?.description && (
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, whiteSpace: "nowrap" as const }}>({p.description})</span>
                      )}
                    </span>
                    <span style={{ display: "flex", gap: 16, flexShrink: 0, color: "rgba(255,255,255,0.4)" }}>
                      <span style={{ minWidth: 52, textAlign: "right" as const }}>{rp.last_api != null ? `API ${rp.last_api}` : "API —"}</span>
                      <span style={{ minWidth: 52, textAlign: "right" as const }}>{rp.last_temp_f != null ? `${rp.last_temp_f}°F` : "—°F"}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setProductStatusOpen(true)}
            style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "#fff", color: "#111", fontWeight: 800, cursor: "pointer", marginBottom: 10 }}
          >
            STUD
          </button>
        </>
      )}

      {canEditTerminal && (
        <button
          type="button"
          onClick={() => setEditTerminalOpen(true)}
          style={{ width: "100%", padding: "10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          Edit Terminal
        </button>
      )}

      {activeRack && selectedLane != null && (
        <LaneStatusModal
          open={selectedLane != null}
          onClose={() => setSelectedLane(null)}
          rack={activeRack}
          laneOffset={laneOffsets[activeRack.rack_id] ?? 0}
          laneNumber={selectedLane}
          arms={arms}
          laneIsDown={lanes.find((l) => l.lane_number === selectedLane)?.is_down ?? false}
          productsById={productsById}
          authUserId={shell.effectiveUserId}
          onSaved={loadRackDetail}
        />
      )}

      {activeRack && (
        <RackProductStatusModal
          open={productStatusOpen}
          onClose={() => setProductStatusOpen(false)}
          rack={activeRack}
          terminalCity={terminal?.city ?? ""}
          terminalState={terminal?.state ?? ""}
          rackProducts={rackProducts}
          productsById={productsById}
          authUserId={shell.effectiveUserId}
          onSaved={loadRackDetail}
        />
      )}

      <EditTerminalModal
        open={editTerminalOpen}
        onClose={() => setEditTerminalOpen(false)}
        terminalId={terminalId}
        terminalName={terminal?.terminal_name}
        onChanged={() => { loadRacks(); loadRackDetail(); }}
      />
    </div>
  );
}
