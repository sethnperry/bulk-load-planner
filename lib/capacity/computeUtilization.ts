// lib/capacity/computeUtilization.ts
//
// Turns a capacity result plus what was actually loaded into the per-load
// utilization row. Pure -- same reasoning as computeAvailableCapacity.ts.
//
// Two rules from the spec are structural here, not styling choices:
//
//  * Safety is a GATE, never a term (spec section 10). A load that exceeds a
//    hard constraint is excluded from aggregates entirely -- it cannot raise a
//    score, and it is not folded back in as a penalty either. It surfaces as
//    its own count.
//
//  * A driver is never penalised for capacity an external party took away
//    (spec section 11). A cap with a known figure re-baselines the
//    denominator; a cap we know about but cannot quantify excludes the load
//    rather than guessing at a number.

export type UtilizationEligibility =
  | "eligible"
  | "excluded_constraint"      // externally capped, amount unknown
  | "excluded_safety"          // over legal gross, or a compartment overfilled
  | "excluded_incomplete_data"; // capacity or actual could not be established

/** Where actual_gallons came from. Phase 1 always writes PLANNER; the enum
 *  exists from day one so moving a company to real measured gallons later is a
 *  source swap, not a migration, and history stays interpretable across the
 *  cutover instead of silently mixing two meanings under one label. */
export type ActualGallonsSource =
  | "PLANNER" | "DRIVER" | "RACK_TICKET" | "TMS" | "DISPATCH" | "API" | "OCR" | "IMPORT";

export type UtilizationInput = {
  /** Max gallons within the company target -- the driver's denominator. */
  available_gallons: number;
  actual_gallons: number;
  /** Actual gross weight, for the safety gate. Null = unknown, not a pass. */
  actual_gross_lbs: number | null;
  legal_gross_lbs: number;
  /** True if any compartment's actual exceeded its configured cap. */
  compartment_overfilled: boolean;
  /** Lowest quantified external cap in gallons, if any (spec section 11). */
  external_cap_gallons: number | null;
  /** An external cap is known to apply but its size isn't (e.g. an Out of
   *  Allocation outage report, which records that a terminal capped this
   *  product but carries no gallon figure). */
  has_unquantified_constraint: boolean;
};

export type UtilizationResult = {
  available_gallons: number;
  effective_available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  utilization_pct: number | null;
  eligibility: UtilizationEligibility;
  exception_reason: string | null;
};

export function computeUtilization(input: UtilizationInput): UtilizationResult {
  const available = Number(input.available_gallons);
  const actual = Number(input.actual_gallons);

  const base = {
    available_gallons: Number.isFinite(available) ? available : 0,
    actual_gallons: Number.isFinite(actual) ? actual : 0,
  };

  if (!Number.isFinite(available) || available <= 0 || !Number.isFinite(actual) || actual < 0) {
    return {
      ...base,
      effective_available_gallons: base.available_gallons,
      unused_gallons: 0,
      utilization_pct: null,
      eligibility: "excluded_incomplete_data",
      exception_reason: "Available capacity or actual gallons could not be established for this load.",
    };
  }

  // ── Safety gate, checked before anything else so a violation can never be
  // scored under any denominator (spec section 10). Keys off the LEGAL limit,
  // not the company target -- loading above a target but under the legal
  // ceiling is a legal, well-executed load, not a violation.
  const overLegal =
    input.actual_gross_lbs != null &&
    Number.isFinite(input.actual_gross_lbs) &&
    Number(input.actual_gross_lbs) > Number(input.legal_gross_lbs);

  if (overLegal || input.compartment_overfilled) {
    return {
      ...base,
      effective_available_gallons: available,
      unused_gallons: Math.max(0, available - actual),
      utilization_pct: null,
      eligibility: "excluded_safety",
      exception_reason: overLegal
        ? `Actual gross weight exceeded the legal limit of ${Math.round(Number(input.legal_gross_lbs)).toLocaleString()} lbs.`
        : "A compartment was loaded beyond its configured cap.",
    };
  }

  // ── External constraints. A quantified cap re-baselines the denominator so
  // the driver is measured against what they were actually allowed to load.
  const cap = input.external_cap_gallons;
  const hasQuantifiedCap = cap != null && Number.isFinite(cap) && cap > 0;

  // Only narrows -- a "cap" above real capacity constrained nothing.
  const effectiveAvailable = hasQuantifiedCap ? Math.min(available, Number(cap)) : available;

  if (!hasQuantifiedCap && input.has_unquantified_constraint) {
    return {
      ...base,
      effective_available_gallons: effectiveAvailable,
      unused_gallons: Math.max(0, effectiveAvailable - actual),
      utilization_pct: null,
      eligibility: "excluded_constraint",
      exception_reason: "This load was capped by an external constraint of unknown size, so it is excluded rather than measured against full capacity.",
    };
  }

  // ── Utilization. Deliberately NOT clamped at 100: with the company target as
  // the denominator, above-target-but-under-legal is a real, legal, well-loaded
  // trip, and clamping would erase the difference between hitting the target
  // and safely beating it -- the exact behavior this metric should reward.
  const utilization = (actual / effectiveAvailable) * 100;

  return {
    ...base,
    effective_available_gallons: effectiveAvailable,
    unused_gallons: Math.max(0, effectiveAvailable - actual),
    utilization_pct: utilization,
    eligibility: "eligible",
    exception_reason: hasQuantifiedCap
      ? `Measured against an external cap of ${Math.round(Number(cap)).toLocaleString()} gal rather than full capacity.`
      : null,
  };
}

/**
 * Period aggregate. Gallon-weighted, not a mean of per-load percentages -- an
 * average of percentages lets a string of tiny loads swamp the real number.
 * Only eligible loads contribute; excluded ones are counted, never scored.
 */
export function aggregateUtilization(rows: UtilizationResult[]) {
  let availableSum = 0, actualSum = 0, unusedSum = 0;
  let eligible = 0, excludedSafety = 0, excludedConstraint = 0, excludedIncomplete = 0;

  for (const r of rows) {
    switch (r.eligibility) {
      case "eligible":
        eligible++;
        availableSum += r.effective_available_gallons;
        actualSum += r.actual_gallons;
        unusedSum += r.unused_gallons;
        break;
      case "excluded_safety": excludedSafety++; break;
      case "excluded_constraint": excludedConstraint++; break;
      case "excluded_incomplete_data": excludedIncomplete++; break;
    }
  }

  return {
    eligible_loads: eligible,
    excluded_safety: excludedSafety,
    excluded_constraint: excludedConstraint,
    excluded_incomplete_data: excludedIncomplete,
    available_gallons: availableSum,
    actual_gallons: actualSum,
    unused_gallons: unusedSum,
    utilization_pct: availableSum > 0 ? (actualSum / availableSum) * 100 : null,
  };
}
