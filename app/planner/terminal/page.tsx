"use client";
// app/planner/terminal/page.tsx
//
// 2026-08-31: the old Lane Map + per-arm STUD system (RackLaneGrid.tsx,
// LaneStatusModal.tsx, EditTerminalModal.tsx's Lane/Arm Layout view) was
// removed entirely, per explicit direction -- "way too involved and
// complicated for every terminal across the country." This tab is now a
// role-agnostic Insights view (the tab bar label itself changed from
// "Terminal" to "Insights", see CalculatorLayoutClient.tsx) with 4
// sub-tabs, using the same CenteredSubTabs "dial" mechanic every other
// sub-tabbed screen in this app already uses:
//   - Status:   what this whole page used to be -- rack picker, the
//               rack-level product list (API/temp), the rack-level STUD
//               button, Edit Terminal. Completely unchanged, just no
//               longer the only thing this tab does.
//   - Volume:   NEW -- a bar chart of gallons loaded per product, over a
//               selected time range (the same 7d/30d/90d/All lookback-chip
//               convention already duplicated across MyLoadsModal.tsx/
//               ScaleHistoryModal.tsx/RecordHistoryModal.tsx/
//               UnderloadingDashboardModal.tsx). See VolumeChart.tsx and
//               bucketLoads() below.
//   - Trends:   placeholder -- seasonal API/temp charts, a future pass.
//   - Recovery: placeholder -- company-scoped recovered-gallons comparison
//               across drivers, a future pass. Deliberately NOT
//               cross-company (confirmed with the user) -- that's a real,
//               separate privacy/business decision.
//
// Racks themselves are NOT removed -- rack_id still drives rack-aware
// terminal selection, the per-rack product list, and the Out of Product
// outage flag. Only the visual lane/arm grid + manual per-arm status
// update are gone; rack_arms/rack_lanes and their live data are left in
// the DB untouched, just no longer rendered.
//
// "All Terminals" (new): Volume/Trends/Recovery can show company-wide
// totals instead of one terminal's -- Status inherently needs one
// specific terminal (racks belong to a terminal), so it shows a
// placeholder while "All Terminals" is selected.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useCompanyRoster } from "../hooks/useCompanyRoster";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import CenteredSubTabs, { type CenteredSubTab } from "../components/CenteredSubTabs";
import VolumeChart, { type VolumeBucket } from "./VolumeChart";
import RackProductStatusModal from "./RackProductStatusModal";
import EditTerminalModal from "./EditTerminalModal";
import type { TerminalRack, RackProductStatusRow, ProductLite } from "./types";
import { themeFill, themeTextOnFill } from "../theme";

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "28px 18px", textAlign: "center" as const }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

const SUB_TABS: CenteredSubTab[] = [
  { id: "status", label: "Status" },
  { id: "volume", label: "Volume" },
  { id: "trends", label: "Trends" },
  { id: "recovery", label: "Recovery" },
];

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: null as number | null },
];

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 7, border: "1px solid",
    fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3, flexShrink: 0,
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
    color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
  };
}

type LoadLineRow = { product_id: string | null; actual_gallons: number | null; completed_at: string };

// Adaptive bucketing -- "like stock analysis": short ranges get daily
// bars, 90d steps up to weekly, All steps up to monthly, so the chart
// stays legible instead of one bar per day over a year+ of history.
function bucketKeyFor(dateMs: number, granularity: "day" | "week" | "month"): { key: string; label: string; sortMs: number } {
  const d = new Date(dateMs);
  if (granularity === "day") {
    const key = d.toISOString().slice(0, 10);
    return { key, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), sortMs: new Date(key + "T00:00:00").getTime() };
  }
  if (granularity === "week") {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // days back to Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return { key: monday.toISOString().slice(0, 10), label: monday.toLocaleDateString(undefined, { month: "short", day: "numeric" }), sortMs: monday.getTime() };
  }
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { key, label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), sortMs: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
}

function bucketLoads(rows: LoadLineRow[], rangeDays: number | null): VolumeBucket[] {
  const granularity: "day" | "week" | "month" = rangeDays == null ? "month" : rangeDays <= 30 ? "day" : "week";
  const map = new Map<string, { label: string; sortMs: number; products: Record<string, number> }>();
  for (const r of rows) {
    if (!r.product_id || !r.actual_gallons) continue;
    const t = new Date(r.completed_at).getTime();
    if (!Number.isFinite(t)) continue;
    const { key, label, sortMs } = bucketKeyFor(t, granularity);
    let entry = map.get(key);
    if (!entry) { entry = { label, sortMs, products: {} }; map.set(key, entry); }
    entry.products[r.product_id] = (entry.products[r.product_id] ?? 0) + Number(r.actual_gallons);
  }
  return Array.from(map.values()).sort((a, b) => a.sortMs - b.sortMs).map(({ label, products }) => ({ label, products }));
}

export default function TerminalPage() {
  const shell = useCalculatorShell();

  // Dispatch/admin context: when a driver is selected, show *their*
  // current terminal (inferred from their most recent load) instead of
  // the viewer's own location.selectedTerminalId -- unchanged from before.
  const isDispatchContext = (shell.role === "dispatch" || shell.role === "admin" || shell.isSuperAdmin) && Boolean(shell.selectedDriverId);
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

  const [subTab, setSubTab] = useState<string>("status");
  const [allTerminals, setAllTerminals] = useState(false);

  // ── Status sub-tab: racks + rack-level product list + STUD (unchanged) ──
  const [racks, setRacks] = useState<TerminalRack[]>([]);
  const [activeRackId, setActiveRackId] = useState("");
  const [rackProducts, setRackProducts] = useState<RackProductStatusRow[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [productStatusOpen, setProductStatusOpen] = useState(false);
  const [editTerminalOpen, setEditTerminalOpen] = useState(false);

  const loadRacks = useCallback(async () => {
    if (!terminalId) { setRacks([]); return; }
    setStatusLoading(true);
    setStatusError(null);
    const { data, error: err } = await supabase
      .from("terminal_racks").select("*").eq("terminal_id", terminalId).order("rack_name");
    if (err) { setStatusError(err.message); setStatusLoading(false); return; }
    const rows = (data ?? []) as TerminalRack[];
    setRacks(rows);
    setActiveRackId((prev) => (rows.find((r) => r.rack_id === prev) ? prev : rows[0]?.rack_id ?? ""));
    setStatusLoading(false);
  }, [terminalId]);

  useEffect(() => { if (subTab === "status" && !allTerminals) loadRacks(); }, [subTab, allTerminals, loadRacks]);

  const loadRackProducts = useCallback(async () => {
    if (!activeRackId) { setRackProducts([]); return; }
    const { data, error: err } = await supabase
      .from("rack_product_status").select("*").eq("rack_id", activeRackId).eq("active", true);
    if (err) { setStatusError(err.message); return; }
    setRackProducts((data ?? []) as RackProductStatusRow[]);
  }, [activeRackId]);

  useEffect(() => { loadRackProducts(); }, [loadRackProducts]);

  // Product catalog -- shared by Status (rack product list) and Volume
  // (chart legend/labels). Sourced from the shared cached catalog
  // (lib/queries/useProductsCatalog.ts) instead of this page's own
  // supabase.from("products") fetch on every mount of this tab.
  const { data: productsCatalog = [] } = useProductsCatalog();
  const productsById = useMemo<Record<string, ProductLite>>(
    () => Object.fromEntries(productsCatalog.map((p) => [p.product_id, p as ProductLite])),
    [productsCatalog]
  );

  const activeRack = racks.find((r) => r.rack_id === activeRackId) ?? null;
  const rackSubTabs: CenteredSubTab[] = racks.map((r) => ({ id: r.rack_id, label: r.rack_name }));

  // ── Volume sub-tab ──────────────────────────────────────────────────────
  const [rangeDays, setRangeDays] = useState<number | null>(30);
  const [volumeRows, setVolumeRows] = useState<LoadLineRow[]>([]);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeError, setVolumeError] = useState<string | null>(null);

  const { members: rosterMembers } = useCompanyRoster(shell.companyId);
  const memberIds = useMemo(() => rosterMembers.map((m) => m.user_id), [rosterMembers]);

  const loadVolume = useCallback(async () => {
    if (memberIds.length === 0) { setVolumeRows([]); return; }
    if (!allTerminals && !terminalId) { setVolumeRows([]); return; }
    setVolumeLoading(true);
    setVolumeError(null);
    let logQuery = supabase
      .from("load_log")
      .select("load_id, completed_at")
      .eq("status", "loaded")
      .in("user_id", memberIds);
    if (!allTerminals && terminalId) logQuery = logQuery.eq("terminal_id", terminalId);
    if (rangeDays != null) {
      const since = new Date(Date.now() - rangeDays * 86400000).toISOString();
      logQuery = logQuery.gte("completed_at", since);
    }
    const { data: logRows, error: logErr } = await logQuery;
    if (logErr) { setVolumeError(logErr.message); setVolumeLoading(false); return; }
    const loadIds = (logRows ?? []).map((r: any) => r.load_id);
    const completedAtByLoadId = new Map((logRows ?? []).map((r: any) => [r.load_id, r.completed_at]));
    if (loadIds.length === 0) { setVolumeRows([]); setVolumeLoading(false); return; }

    const { data: lineRows, error: lineErr } = await supabase
      .from("load_lines").select("load_id, product_id, actual_gallons").in("load_id", loadIds);
    if (lineErr) { setVolumeError(lineErr.message); setVolumeLoading(false); return; }

    setVolumeRows((lineRows ?? []).map((r: any) => ({
      product_id: r.product_id, actual_gallons: r.actual_gallons,
      completed_at: completedAtByLoadId.get(r.load_id) ?? new Date().toISOString(),
    })));
    setVolumeLoading(false);
  }, [memberIds, allTerminals, terminalId, rangeDays]);

  useEffect(() => { if (subTab === "volume") loadVolume(); }, [subTab, loadVolume]);

  const volumeBuckets = useMemo(() => bucketLoads(volumeRows, rangeDays), [volumeRows, rangeDays]);
  const volumeProductOrder = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of volumeRows) {
      if (!r.product_id || !r.actual_gallons) continue;
      totals.set(r.product_id, (totals.get(r.product_id) ?? 0) + Number(r.actual_gallons));
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([pid]) => pid);
  }, [volumeRows]);
  const productNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [id, p] of Object.entries(productsById)) m[id] = p.product_name ?? p.display_name ?? id;
    return m;
  }, [productsById]);

  if (!terminalId && !allTerminals) {
    return (
      <div style={{ paddingTop: 4 }}>
        <PlaceholderPanel
          title="No terminal selected"
          note={isDispatchContext ? "This driver has no recent loads to infer a terminal from." : "Pick a location and terminal in the Planner, or switch to All Terminals below."}
        />
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <button type="button" onClick={() => setAllTerminals(true)} style={chipStyle(false)}>All Terminals</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 4 }}>
      {/* ── Terminal identity + All Terminals toggle ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        {(() => {
          if (allTerminals) {
            return <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>All Terminals</span>;
          }
          const cityState = [terminal?.city, terminal?.state].filter(Boolean).join(", ");
          const label = (
            <>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{terminal?.terminal_name ?? "Terminal"}</span>
              {cityState && <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.45)" }}> {cityState}</span>}
            </>
          );
          return isDispatchContext ? (
            <div>{label}</div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (shell.location.selectedState && shell.location.selectedCity) shell.setTermOpen(true);
                else shell.setLocOpen(true);
              }}
              style={{ display: "block", textAlign: "left" as const, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              {label}
            </button>
          );
        })()}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => setAllTerminals(false)} style={chipStyle(!allTerminals)}>This Terminal</button>
          <button type="button" onClick={() => setAllTerminals(true)} style={chipStyle(allTerminals)}>All Terminals</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <CenteredSubTabs tabs={SUB_TABS} activeId={subTab} onChange={setSubTab} accentColor="#ffffff" compact showActiveDot />
      </div>

      {subTab === "status" && (
        allTerminals ? (
          <PlaceholderPanel title="Pick a specific terminal" note="Rack status is per-terminal — switch to This Terminal above to see it." />
        ) : (
          <>
            {statusError && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>{statusError}</div>}
            {statusLoading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

            {!statusLoading && racks.length === 0 && (
              <PlaceholderPanel
                title="No racks configured yet"
                note={canEditTerminal ? "Tap Edit Terminal below to add the first rack for this terminal." : "This terminal hasn't been set up yet — check back later."}
              />
            )}

            {!statusLoading && racks.length > 0 && activeRack && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <CenteredSubTabs tabs={rackSubTabs} activeId={activeRackId} onChange={setActiveRackId} accentColor="#ffffff" compact showActiveDot />
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
                        <div key={rp.product_id} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, opacity: rp.is_out ? 0.5 : 1, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <span style={{ color, fontWeight: 800, flexShrink: 0 }}>{code}</span>
                            <span style={{ color: "#fff", fontWeight: 400, fontSize: 11, textDecoration: rp.is_out ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>
                              {name}
                            </span>
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
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
                    background: themeFill(shell.theme.darkMode, shell.theme.accentColor, "#ffffff"),
                    color: themeTextOnFill(shell.theme.darkMode),
                    fontWeight: 800, cursor: "pointer", marginBottom: 10,
                  }}
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
          </>
        )
      )}

      {subTab === "volume" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {RANGES.map((r) => (
              <button key={r.label} type="button" onClick={() => setRangeDays(r.days)} style={chipStyle(rangeDays === r.days)}>{r.label}</button>
            ))}
          </div>
          {volumeError && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>{volumeError}</div>}
          {volumeLoading ? (
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>
          ) : (
            <VolumeChart buckets={volumeBuckets} productOrder={volumeProductOrder} productNameById={productNameById} />
          )}
        </div>
      )}

      {subTab === "trends" && (
        <PlaceholderPanel title="Trends — coming soon" note="Seasonal API and temperature trends for this terminal. Not built yet." />
      )}

      {subTab === "recovery" && (
        <PlaceholderPanel title="Recovery — coming soon" note="How your recovered gallons compare to other drivers at your company. Not built yet." />
      )}

      {activeRack && !allTerminals && (
        <RackProductStatusModal
          open={productStatusOpen}
          onClose={() => setProductStatusOpen(false)}
          rack={activeRack}
          terminalCity={terminal?.city ?? ""}
          terminalState={terminal?.state ?? ""}
          rackProducts={rackProducts}
          productsById={productsById}
          authUserId={shell.effectiveUserId}
          onSaved={loadRackProducts}
        />
      )}

      {terminalId && !allTerminals && (
        <EditTerminalModal
          open={editTerminalOpen}
          onClose={() => setEditTerminalOpen(false)}
          terminalId={terminalId}
          terminalName={terminal?.terminal_name}
          onChanged={() => { loadRacks(); loadRackProducts(); }}
        />
      )}
    </div>
  );
}
