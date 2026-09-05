// lib/capacity/useUtilization.ts
//
// Phase 1 read helpers. Query only -- no writes, no display decisions.
//
// Deliberately NOT a leaderboard (spec section 17). There is no ranking, no
// top/bottom list and no driver-vs-driver comparison here, and the fleet
// helper returns rows keyed by driver for a table sorted by name, not by
// score. The question this is meant to answer is "am I using the capacity that
// was actually available to me," not "am I beating Bob."

"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { aggregateUtilization } from "./computeUtilization";
import { supabase } from "@/lib/supabase/client";

export type UtilizationRow = {
  load_id: string;
  driver_id: string;
  loaded_at: string | null;
  available_gallons: number;
  effective_available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  utilization_pct: number | null;
  eligibility: "eligible" | "excluded_constraint" | "excluded_safety" | "excluded_incomplete_data";
  exception_reason: string | null;
};

// The period aggregate lives in computeUtilization.ts (pure, unit-tested) and
// is re-exported here so callers have one import for the read side. There is
// deliberately no second implementation -- an earlier draft had one here, and
// two copies of the same gallon-weighted math is exactly how this project has
// drifted before.
export { aggregateUtilization as summarize } from "./computeUtilization";
export type { UtilizationSummary } from "./computeUtilization";

const SELECT =
  "load_id, driver_id, loaded_at, available_gallons, effective_available_gallons, " +
  "actual_gallons, unused_gallons, utilization_pct, eligibility, exception_reason";

async function fetchRows(filter: { driverId?: string; companyId?: string; since: string; until?: string }) {
  let q = supabase.from("load_utilization").select(SELECT).gte("loaded_at", filter.since);
  if (filter.until) q = q.lte("loaded_at", filter.until);
  if (filter.driverId) q = q.eq("driver_id", filter.driverId);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);

  const { data, error } = await q.order("loaded_at", { ascending: false });
  // Surfaced, not swallowed: a silent empty result here would read as "this
  // driver hauled nothing," which is a much worse lie than an error.
  if (error) throw error;
  // Cast through unknown: these tables are new in this pass, so the generated
  // Supabase types don't know them yet and infer an error shape for the select.
  return (data ?? []) as unknown as UtilizationRow[];
}

/** One driver's own loads over a period. */
export function useDriverUtilization(driverId: string | null, since: string | null, until?: string) {
  return useQuery({
    queryKey: ["utilization", "driver", driverId, since, until ?? null],
    enabled: Boolean(driverId && since),
    queryFn: () => fetchRows({ driverId: driverId!, since: since!, until }),
    staleTime: 60_000,
  });
}

/** Every load in a company over a period. Staff-only by RLS, not by this hook. */
export function useCompanyUtilization(companyId: string | null, since: string | null, until?: string) {
  return useQuery({
    queryKey: ["utilization", "company", companyId, since, until ?? null],
    enabled: Boolean(companyId && since),
    queryFn: () => fetchRows({ companyId: companyId!, since: since!, until }),
    staleTime: 60_000,
  });
}

/**
 * Fleet headroom: what a safely-raised company target would unlock (see the
 * plan's section 4a). Reads the capacity snapshots rather than load_utilization,
 * because headroom is a property of what the equipment could have carried, not
 * of how well the driver did.
 *
 * Never shown to a driver -- their score must not move because of a
 * company-level decision they had no part in.
 */
export function useCompanyHeadroom(companyId: string | null, since: string | null) {
  return useQuery({
    queryKey: ["utilization", "headroom", companyId, since],
    enabled: Boolean(companyId && since),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("load_utilization")
        .select("load_id, load_capacity_snapshot(available_gallons, capacity_at_legal_gallons, limiting_factor)")
        .eq("company_id", companyId!)
        .gte("loaded_at", since!);
      if (error) throw error;

      let headroom = 0, atTarget = 0, atLegal = 0, targetLimited = 0;
      for (const row of (data ?? []) as any[]) {
        const snap = Array.isArray(row.load_capacity_snapshot)
          ? row.load_capacity_snapshot[0]
          : row.load_capacity_snapshot;
        if (!snap) continue;
        const t = Number(snap.available_gallons ?? 0);
        const l = Number(snap.capacity_at_legal_gallons ?? 0);
        atTarget += t;
        atLegal += l;
        headroom += Math.max(0, l - t);
        if (snap.limiting_factor === "company_target") targetLimited++;
      }
      return {
        capacity_at_target_gallons: atTarget,
        capacity_at_legal_gallons: atLegal,
        headroom_gallons: headroom,
        target_limited_loads: targetLimited,
      };
    },
  });
}

// Stable empty reference -- a bare `?? []` default would hand every render a
// NEW array, and this app has already been bitten once by exactly that
// (useProductsCatalog's infinite render loop, perf pass #3). Anything derived
// from this via useMemo stays stable while a query is still loading.
const EMPTY_ROWS: UtilizationRow[] = [];

/**
 * One driver's own period performance -- the summary behind the Planner card
 * and the Reports section. Rows come back newest-first for the history list.
 *
 * Deliberately takes `since` rather than reading the company's report-period
 * settings itself: measurement must work for a company that has configured
 * nothing at all (spec TEST K), so the caller decides whether that's a real
 * configured period or a plain rolling window.
 */
export function useDriverPeriodUtilization(driverId: string | null, since: string | null) {
  const query = useDriverUtilization(driverId, since);
  const rows = query.data ?? EMPTY_ROWS;
  const summary = useMemo(() => aggregateUtilization(rows), [rows]);
  return { rows, summary, isLoading: query.isLoading, error: query.error };
}
