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
import type { TerminalRack, RackArm, RackProductStatusRow, ProductLite } from "./types";

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
  const terminalId = shell.location.selectedTerminalId;
  const terminal = useMemo(
    () => (shell.terminals.terminalCatalog as any[])?.find((t) => String(t.terminal_id) === String(terminalId)) ?? null,
    [shell.terminals.terminalCatalog, terminalId]
  );

  const canEditTerminal = shell.role === "lead" || shell.role === "dispatch" || shell.role === "admin";

  const [racks, setRacks] = useState<TerminalRack[]>([]);
  const [activeRackId, setActiveRackId] = useState("");
  const [arms, setArms] = useState<RackArm[]>([]);
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
    if (!activeRackId) { setArms([]); setRackProducts([]); return; }
    const [{ data: armRows, error: armErr }, { data: prodRows, error: prodErr }] = await Promise.all([
      supabase.from("rack_arms").select("*").eq("rack_id", activeRackId),
      supabase.from("rack_product_status").select("*").eq("rack_id", activeRackId).eq("active", true),
    ]);
    if (armErr || prodErr) { setError(armErr?.message ?? prodErr?.message ?? "Failed to load rack detail."); return; }
    setArms((armRows ?? []) as RackArm[]);
    setRackProducts((prodRows ?? []) as RackProductStatusRow[]);
  }, [activeRackId]);

  useEffect(() => { loadRackDetail(); }, [loadRackDetail]);

  // All-products catalog, fetched once -- used to resolve names/colors for
  // arms and rack products by id.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("products")
        .select("product_id, product_name, display_name, button_code, hex_code, is_dyed");
      const map: Record<string, ProductLite> = {};
      for (const p of (data ?? []) as ProductLite[]) map[p.product_id] = p;
      setProductsById(map);
    })();
  }, []);

  const activeRack = racks.find((r) => r.rack_id === activeRackId) ?? null;
  const subTabs: CenteredSubTab[] = racks.map((r) => ({ id: r.rack_id, label: r.rack_name }));

  if (!terminalId) {
    return (
      <div style={{ paddingTop: 4 }}>
        <PlaceholderPanel title="No terminal selected" note="Pick a location and terminal in the Planner to see its rack status here." />
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
            <CenteredSubTabs tabs={subTabs} activeId={activeRackId} onChange={setActiveRackId} />
          </div>

          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{activeRack.rack_name} Lane Map</div>
            <RackLaneGrid
              rack={activeRack}
              arms={arms}
              productsById={productsById}
              onSelectLane={setSelectedLane}
            />
          </div>

          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{activeRack.rack_name} Product List</div>
            {rackProducts.length === 0 && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No products configured for this rack yet.</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              {rackProducts.map((rp) => {
                const p = productsById[rp.product_id];
                const name = p ? (p.product_name ?? p.display_name ?? "Product") : rp.product_id;
                const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.7)";
                return (
                  <div key={rp.product_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                      <span style={{ color: "#fff", fontWeight: 600 }}>{name}</span>
                      {rp.is_out && <span style={{ color: "#f87171", fontWeight: 800, fontSize: 10 }}>OUT</span>}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>
                      {rp.last_api != null ? `API ${rp.last_api}` : ""} {rp.last_temp_f != null ? `· ${rp.last_temp_f}°F` : ""}
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
          laneNumber={selectedLane}
          arms={arms}
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
