"use client";
// app/admin/UnderloadingDashboardModal.tsx
//
// Fleet-wide underloading dashboard (Fleet Tier Build Spec): "aggregate
// gallons left on the table across all trucks/drivers -- the number that
// justifies the subscription to a fleet owner."
//
// Deliberately reuses the Incentive System's already-computed
// load_points.recovered_gallons rather than a new calculation -- confirmed
// with the user this is the intended metric (not an independent
// legal-max-vs-actual calc). This means the dashboard only shows real
// numbers once a company has turned on Incentives and set at least one
// product benchmark; otherwise it shows an explicit "not enabled" state
// rather than a misleading zero.
//
// Audience is admin+lead+dispatch (confirmed with the user), wider than
// Incentives/Payroll's admin-only gating -- matches the "fleet-wide
// visibility" precedent already used for Fleet Cards/Credentials. This
// needed a new additive load_points SELECT policy
// (20260809000000_load_points_staff_read.sql) since the existing
// load_points_admin_read policy is admin-only.
//
// Deliberately simpler than PayrollReportModal.tsx: no CSV export, no
// per-load edit/recalculate, no per-load drill-down -- this is the
// fleet-level pitch/health-check view, not a payroll audit tool (that's
// what Payroll Report is for). Date range is a simple lookback-days chip
// row (same pattern already duplicated in MyLoadsModal.tsx/
// ScaleHistoryModal.tsx/RecordHistoryModal.tsx), not the pay-period
// picker, since this shouldn't require pay-period settings to be
// configured to show a number.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type LoadPointRow = {
  load_id: string;
  driver_id: string;
  recovered_gallons: number;
};

type DriverSummary = {
  driver_id: string;
  display_name: string;
  loadIds: Set<string>;
  totalGallons: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

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

export default function UnderloadingDashboardModal({ open, onClose, companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incentivesEnabled, setIncentivesEnabled] = useState<boolean | null>(null);
  const [rangeDays, setRangeDays] = useState<number | null>(30);
  const [points, setPoints] = useState<LoadPointRow[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  // Whether the company has Incentives enabled -- if not, benchmark
  // gallons were never set and load_points will always be empty, so the
  // UI should say why rather than show a bare "no data" table.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("incentive_settings")
        .select("enabled")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!cancelled) setIncentivesEnabled(Boolean(data?.enabled));
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let query = supabase
        .from("load_points")
        .select("load_id, driver_id, recovered_gallons")
        .eq("company_id", companyId);
      if (rangeDays != null) {
        const cutoff = new Date(Date.now() - rangeDays * 86400000).toISOString();
        query = query.gte("created_at", cutoff);
      }
      const { data, error: err } = await query;
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }

      const rows = (data ?? []) as LoadPointRow[];
      setPoints(rows);

      const driverIds = Array.from(new Set(rows.map((r) => r.driver_id)));
      if (driverIds.length > 0) {
        const { data: nameRows } = await supabase.rpc("get_display_names_full", { p_user_ids: driverIds });
        if (!cancelled) {
          setNameById(Object.fromEntries(((nameRows ?? []) as any[]).map((p) => [p.user_id, p.display_name ?? "Unknown"])));
        }
      } else {
        setNameById({});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, companyId, rangeDays]);

  const driverSummaries = useMemo<DriverSummary[]>(() => {
    const byDriver: Record<string, DriverSummary> = {};
    for (const r of points) {
      const s = (byDriver[r.driver_id] ??= {
        driver_id: r.driver_id,
        display_name: nameById[r.driver_id] ?? "Unknown",
        loadIds: new Set(),
        totalGallons: 0,
      });
      s.loadIds.add(r.load_id);
      s.totalGallons += Number(r.recovered_gallons) || 0;
    }
    return Object.values(byDriver).sort((a, b) => b.totalGallons - a.totalGallons);
  }, [points, nameById]);

  const totalGallons = useMemo(() => points.reduce((s, r) => s + (Number(r.recovered_gallons) || 0), 0), [points]);
  const totalLoads = useMemo(() => new Set(points.map((r) => r.load_id)).size, [points]);
  const avgPerLoad = totalLoads > 0 ? totalGallons / totalLoads : 0;

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Fleet Underloading</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        {incentivesEnabled === false ? (
          <div style={{ padding: "24px 18px", textAlign: "center" as const }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              Incentives isn't enabled for this company yet, so there's no recovered-gallons data to show.
              Turn it on and set a benchmark for at least one product in <strong>Incentives</strong> to start tracking
              gallons left on the table fleet-wide.
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
              {RANGES.map((r) => (
                <button key={r.label} type="button" onClick={() => setRangeDays(r.days)} style={chipStyle(rangeDays === r.days)}>
                  {r.label}
                </button>
              ))}
            </div>

            <div style={{ padding: "18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 18, flexWrap: "wrap" as const }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Gallons recovered</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#4ade80" }}>{totalGallons.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Loads</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>{totalLoads.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Avg / load</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>{avgPerLoad.toFixed(1)}</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px" }}>
              {loading ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
              ) : driverSummaries.length === 0 ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>No recovered gallons in this range.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {driverSummaries.map((d) => {
                    const avg = d.loadIds.size > 0 ? d.totalGallons / d.loadIds.size : 0;
                    return (
                      <div key={d.driver_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{d.display_name}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{d.loadIds.size} loads</div>
                        </div>
                        <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80" }}>{d.totalGallons.toFixed(1)} gal</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>avg {avg.toFixed(1)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {error && <div style={{ marginTop: 12, fontSize: 12, color: "#ef4444" }}>{error}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
