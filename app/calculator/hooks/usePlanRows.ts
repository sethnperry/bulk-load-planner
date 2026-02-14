"use client";

import { useMemo } from "react";

export function usePlanRows<TPlanRow extends { planned_gallons: number; lbsPerGal: number }>(args: {
  selectedTrailerId: string | null;
  activeComps: any[];
  allowedLbs: number;
  cgBias: number;
  capacityGallonsActive: number;
  planForGallons: (gallons: number, activeComps: any[], cgBias: number) => TPlanRow[];
}) {
  const { selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive, planForGallons } = args;

  const plannedResult = useMemo(() => {
    // no plan unless we have active comps + allowed lbs
    if (!selectedTrailerId) return { planRows: [] as TPlanRow[], effectiveMaxGallons: 0 };

    if ((activeComps ?? []).length === 0) {
      return { planRows: [] as TPlanRow[], effectiveMaxGallons: 0 };
    }

    const cap = Math.max(0, capacityGallonsActive);
    if (!(cap > 0)) {
      return { planRows: [] as TPlanRow[], effectiveMaxGallons: 0 };
    }

    // Binary search max gallons that keeps weight <= allowedLbs
    let lo = 0;
    let hi = cap;

    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      const rows = planForGallons(mid, activeComps, cgBias);
      const lbs = rows.reduce((s, r) => s + r.planned_gallons * r.lbsPerGal, 0);
      if (lbs <= allowedLbs + 1e-6) lo = mid;
      else hi = mid;
    }

    const effectiveMaxGallons = lo;

    // Decide target gallons
    const requested = effectiveMaxGallons;

    const finalRows = planForGallons(requested, activeComps, cgBias);

    return { planRows: finalRows, effectiveMaxGallons };
  }, [selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive, planForGallons]);

  return plannedResult;
}
