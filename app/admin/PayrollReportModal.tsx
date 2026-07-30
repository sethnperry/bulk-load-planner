"use client";
// app/admin/PayrollReportModal.tsx
//
// Fleet Tier Section 2 (Incentive system): the deferred "Payroll / payout"
// piece. Pay-period-scoped driver/loads/gallons/points table, CSV export,
// and per-load edit-and-recalculate. See CLAUDE.md "Incentive system" for
// the full spec.
//
// The report itself is never stored -- always computed live from
// load_points for the selected period. payroll_reports rows only exist to
// track "this period was exported" so the stale-flag trigger
// (flag_stale_payroll_reports, in the queued migration) has something to
// flag when an edit changes points after the fact.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { generatePayPeriods, type PayPeriod, type PayPeriodType } from "./payPeriods";

type LoadPointRow = {
  load_id: string;
  comp_number: number;
  driver_id: string;
  product_id: string;
  actual_gallons: number;
  recovered_gallons: number;
  recovered_points: number;
  created_at: string;
};

type LoadLineRow = {
  comp_number: number;
  product_id: string | null;
  actual_gallons: number | null;
  actual_lbs: number | null;
};

type DriverSummary = {
  driver_id: string;
  display_name: string;
  employee_number: string | null;
  loadIds: Set<string>;
  totalGallons: number;
  totalPoints: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

const INPUT: React.CSSProperties = {
  borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 13, padding: "8px 10px", boxSizing: "border-box" as const,
};

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function PayrollReportModal({ open, onClose, companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [periodType, setPeriodType] = useState<PayPeriodType | null>(null);
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);
  const [isStale, setIsStale] = useState(false);

  const [points, setPoints] = useState<LoadPointRow[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [employeeNumberById, setEmployeeNumberById] = useState<Record<string, string | null>>({});
  const [productLabelById, setProductLabelById] = useState<Record<string, string>>({});

  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [lineEdits, setLineEdits] = useState<Record<number, { actual_gallons: string; actual_lbs: string; densityCorrection: boolean }>>({});
  const [loadLines, setLoadLines] = useState<LoadLineRow[]>([]);
  const [savingComp, setSavingComp] = useState<number | null>(null);

  // ── Load pay-period settings + generate periods ───────────────────────────
  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("incentive_settings")
        .select("pay_period_type, pay_period_anchor_date")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cancelled) return;
      const pt = (data?.pay_period_type ?? "biweekly") as PayPeriodType;
      const anchor = data?.pay_period_anchor_date ?? new Date().toISOString().slice(0, 10);
      setPeriodType(pt);
      setAnchorDate(anchor);
      const gen = generatePayPeriods(pt, anchor, 12);
      setPeriods(gen);
      setSelectedPeriod(gen[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  // ── Load report data for the selected period ──────────────────────────────
  useEffect(() => {
    if (!open || !selectedPeriod) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setExpandedDriverId(null);
      setExpandedLoadId(null);

      const { data: pointRows, error: ptsErr } = await supabase
        .from("load_points")
        .select("load_id, comp_number, driver_id, product_id, actual_gallons, recovered_gallons, recovered_points, created_at")
        .eq("company_id", companyId)
        .gte("created_at", `${selectedPeriod.start}T00:00:00`)
        .lte("created_at", `${selectedPeriod.end}T23:59:59`);
      if (cancelled) return;
      if (ptsErr) { setError(ptsErr.message); setLoading(false); return; }

      const rows = (pointRows ?? []) as LoadPointRow[];
      setPoints(rows);

      const driverIds = Array.from(new Set(rows.map((r) => r.driver_id)));
      const productIds = Array.from(new Set(rows.map((r) => r.product_id)));

      const [{ data: nameRows }, { data: profileRows }, { data: productRows }, { data: reportRows }] = await Promise.all([
        driverIds.length > 0 ? supabase.rpc("get_display_names_full", { p_user_ids: driverIds }) : Promise.resolve({ data: [] as any[] }),
        driverIds.length > 0 ? supabase.from("profiles").select("user_id, employee_number").in("user_id", driverIds) : Promise.resolve({ data: [] as any[] }),
        productIds.length > 0 ? supabase.from("products").select("product_id, product_name, display_name").in("product_id", productIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from("payroll_reports").select("is_stale").eq("company_id", companyId).eq("period_start", selectedPeriod.start).eq("period_end", selectedPeriod.end).order("generated_at", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;

      setNameById(Object.fromEntries(((nameRows ?? []) as any[]).map((p) => [p.user_id, p.display_name ?? "Unknown"])));
      setEmployeeNumberById(Object.fromEntries(((profileRows ?? []) as any[]).map((p) => [p.user_id, p.employee_number ?? null])));
      setProductLabelById(Object.fromEntries(((productRows ?? []) as any[]).map((p) => [p.product_id, p.display_name ?? p.product_name ?? p.product_id])));
      setIsStale(Boolean((reportRows ?? [])[0]?.is_stale));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, selectedPeriod, companyId]);

  const driverSummaries = useMemo<DriverSummary[]>(() => {
    const byDriver: Record<string, DriverSummary> = {};
    for (const r of points) {
      const s = (byDriver[r.driver_id] ??= {
        driver_id: r.driver_id,
        display_name: nameById[r.driver_id] ?? "Unknown",
        employee_number: employeeNumberById[r.driver_id] ?? null,
        loadIds: new Set(),
        totalGallons: 0,
        totalPoints: 0,
      });
      s.loadIds.add(r.load_id);
      s.totalGallons += Number(r.recovered_gallons) || 0;
      s.totalPoints += Number(r.recovered_points) || 0;
    }
    return Object.values(byDriver).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [points, nameById, employeeNumberById]);

  const loadsForDriver = useMemo(() => {
    if (!expandedDriverId) return [];
    const byLoad: Record<string, LoadPointRow[]> = {};
    for (const r of points) {
      if (r.driver_id !== expandedDriverId) continue;
      (byLoad[r.load_id] ??= []).push(r);
    }
    return Object.entries(byLoad).map(([loadId, lines]) => ({
      loadId,
      date: lines[0]?.created_at ?? "",
      totalPoints: lines.reduce((s, l) => s + (Number(l.recovered_points) || 0), 0),
    })).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [points, expandedDriverId]);

  async function expandLoad(loadId: string) {
    if (expandedLoadId === loadId) { setExpandedLoadId(null); return; }
    setExpandedLoadId(loadId);
    const { data } = await supabase.from("load_lines").select("comp_number, product_id, actual_gallons, actual_lbs").eq("load_id", loadId);
    const rows = (data ?? []) as LoadLineRow[];
    setLoadLines(rows);
    const edits: Record<number, { actual_gallons: string; actual_lbs: string; densityCorrection: boolean }> = {};
    for (const r of rows) {
      edits[r.comp_number] = {
        actual_gallons: r.actual_gallons != null ? String(r.actual_gallons) : "",
        actual_lbs: r.actual_lbs != null ? String(r.actual_lbs) : "",
        densityCorrection: false,
      };
    }
    setLineEdits(edits);
  }

  async function saveLine(compNumber: number) {
    const edit = lineEdits[compNumber];
    if (!edit) return;
    const gallons = Number(edit.actual_gallons);
    const lbs = Number(edit.actual_lbs);
    if (!Number.isFinite(gallons) || !Number.isFinite(lbs)) { setError("Enter valid numbers for gallons and lbs."); return; }
    setSavingComp(compNumber);
    setError(null);
    try {
      const { error: err } = await supabase.rpc("edit_load_line", {
        p_load_id: expandedLoadId,
        p_comp_number: compNumber,
        p_actual_gallons: gallons,
        p_actual_lbs: lbs,
        p_density_correction: edit.densityCorrection,
      });
      if (err) throw err;
      // Refetch period data so the table reflects the recalculated points.
      if (selectedPeriod) {
        const { data: pointRows } = await supabase
          .from("load_points")
          .select("load_id, comp_number, driver_id, product_id, actual_gallons, recovered_gallons, recovered_points, created_at")
          .eq("company_id", companyId)
          .gte("created_at", `${selectedPeriod.start}T00:00:00`)
          .lte("created_at", `${selectedPeriod.end}T23:59:59`);
        setPoints((pointRows ?? []) as LoadPointRow[]);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSavingComp(null);
    }
  }

  async function handleExportCsv() {
    if (!selectedPeriod) return;
    const header = ["Driver", "Employee ID", "Period", "Total Points", "$ Amount"];
    const lines = [header.map(csvEscape).join(",")];
    for (const d of driverSummaries) {
      lines.push([
        d.display_name,
        d.employee_number ?? "",
        selectedPeriod.label,
        d.totalPoints.toFixed(1),
        "",
      ].map((v) => csvEscape(String(v))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_${selectedPeriod.start}_to_${selectedPeriod.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    await supabase.from("payroll_reports").insert({
      company_id: companyId,
      period_start: selectedPeriod.start,
      period_end: selectedPeriod.end,
      generated_by: (await supabase.auth.getUser()).data.user?.id,
    });
    setIsStale(false);
  }

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Payroll Report</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
          <select
            value={selectedPeriod ? `${selectedPeriod.start}|${selectedPeriod.end}` : ""}
            onChange={(e) => {
              const [start, end] = e.target.value.split("|");
              setSelectedPeriod(periods.find((p) => p.start === start && p.end === end) ?? null);
            }}
            style={{ ...INPUT, flex: 1 }}
          >
            {periods.map((p) => (
              <option key={`${p.start}|${p.end}`} value={`${p.start}|${p.end}`}>{p.label}</option>
            ))}
          </select>
          <button type="button" onClick={handleExportCsv} disabled={loading || driverSummaries.length === 0}
            style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}>
            Export CSV
          </button>
        </div>

        {isStale && (
          <div style={{ padding: "8px 18px", background: "rgba(251,146,60,0.12)", color: "#fb923c", fontSize: 12, fontWeight: 700 }}>
            ⚠ This period was exported before, but points have changed since (an edit was recalculated). Re-export if needed.
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
          ) : driverSummaries.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>No loads with points in this period.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {driverSummaries.map((d) => {
                const isExpanded = expandedDriverId === d.driver_id;
                const avg = d.loadIds.size > 0 ? d.totalPoints / d.loadIds.size : 0;
                return (
                  <div key={d.driver_id} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
                    <div role="button" tabIndex={0} onClick={() => setExpandedDriverId(isExpanded ? null : d.driver_id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{d.display_name}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                          {d.employee_number ? `ID ${d.employee_number} · ` : ""}{d.loadIds.size} loads
                        </div>
                      </div>
                      <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80" }}>{d.totalPoints.toFixed(1)} pts</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{d.totalGallons.toFixed(1)} gal · avg {avg.toFixed(1)}</div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 12px 12px" }}>
                        {loadsForDriver.map((l) => (
                          <div key={l.loadId} style={{ marginBottom: 6 }}>
                            <div role="button" tabIndex={0} onClick={() => expandLoad(l.loadId)}
                              style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", cursor: "pointer", fontSize: 12 }}>
                              <span style={{ color: "rgba(255,255,255,0.6)" }}>{new Date(l.date).toLocaleDateString()}</span>
                              <span style={{ color: "#4ade80", fontWeight: 700 }}>{l.totalPoints.toFixed(1)} pts</span>
                            </div>
                            {expandedLoadId === l.loadId && (
                              <div style={{ padding: "8px 8px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
                                {loadLines.map((line) => {
                                  const edit = lineEdits[line.comp_number];
                                  if (!edit) return null;
                                  return (
                                    <div key={line.comp_number} style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)", padding: "8px 10px" }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                                        C{line.comp_number} {productLabelById[line.product_id ?? ""] ?? ""}
                                      </div>
                                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                        <input value={edit.actual_gallons} onChange={(e) => setLineEdits((prev) => ({ ...prev, [line.comp_number]: { ...prev[line.comp_number], actual_gallons: e.target.value } }))} placeholder="gallons" style={{ ...INPUT, flex: 1 }} />
                                        <input value={edit.actual_lbs} onChange={(e) => setLineEdits((prev) => ({ ...prev, [line.comp_number]: { ...prev[line.comp_number], actual_lbs: e.target.value } }))} placeholder="lbs" style={{ ...INPUT, flex: 1 }} />
                                      </div>
                                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                                        <input type="checkbox" checked={edit.densityCorrection} onChange={(e) => setLineEdits((prev) => ({ ...prev, [line.comp_number]: { ...prev[line.comp_number], densityCorrection: e.target.checked } }))} />
                                        This corrects a bad density/API reading
                                      </label>
                                      <button type="button" onClick={() => saveLine(line.comp_number)} disabled={savingComp === line.comp_number}
                                        style={{ width: "100%", padding: "7px 0", borderRadius: 6, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.1)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                        {savingComp === line.comp_number ? "Saving…" : "Save & Recalculate"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && <div style={{ marginTop: 12, fontSize: 12, color: "#ef4444" }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
