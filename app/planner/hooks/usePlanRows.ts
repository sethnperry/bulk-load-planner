"use client";

import { useMemo } from "react";

import { solveMaxGallons } from "../utils/planMath";

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

    // Binary search max gallons that keeps weight <= allowedLbs.
    // Lives in planMath as solveMaxGallons so the payload-utilization engine
    // (lib/capacity/computeAvailableCapacity.ts) uses the exact same solver
    // rather than a second copy -- behavior here is unchanged.
    const effectiveMaxGallons = solveMaxGallons(cap, activeComps, allowedLbs, cgBias, planForGallons);

    // Decide target gallons
    const requested = effectiveMaxGallons;

    const finalRows = planForGallons(requested, activeComps, cgBias);

    return { planRows: finalRows, effectiveMaxGallons };
  }, [selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive, planForGallons]);

  return plannedResult;
}
