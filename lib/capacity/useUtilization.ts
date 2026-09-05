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

import { useQuery } from "@tanstack/react-query";

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

export type UtilizationSummary = {
  eligible_loads: number;
  excluded_safety: number;
  excluded_constraint: number;
  excluded_incomplete_data: number;
  available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  /** Gallon-weighted, not a mean of per-load percentages -- an average of
   *  percentages lets a string of tiny loads swamp the real number. */
  utilization_pct: number | null;
};

const SELECT =
  "load_id, driver_id, loaded_at, available_gallons, effective_available_gallons, " +
  "actual_gallons, unused_gallons, utilization_pct, eligibility, exception_reason";

export function summarize(rows: UtilizationRow[]): UtilizationSummary {
  let availableSum = 0, actualSum = 0, unusedSum = 0;
  let eligible = 0, safety = 0, constraint = 0, incomplete = 0;

  for (const r of rows) {
    switch (r.eligibility) {
      case "eligible":
        eligible++;
        availableSum += Number(r.effective_available_gallons ?? 0);
        actualSum += Number(r.actual_gallons ?? 0);
        unusedSum += Number(r.unused_gallons ?? 0);
        break;
      case "excluded_safety": safety++; break;
      case "excluded_constraint": constraint++; break;
      case "excluded_incomplete_data": incomplete++; break;
    }
  }

  return {
    eligible_loads: eligible,
    excluded_safety: safety,
    excluded_constraint: constraint,
    excluded_incomplete_data: incomplete,
    available_gallons: availableSum,
    actual_gallons: actualSum,
    unused_gallons: unusedSum,
    utilization_pct: availableSum > 0 ? (actualSum / availableSum) * 100 : null,
  };
}

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
