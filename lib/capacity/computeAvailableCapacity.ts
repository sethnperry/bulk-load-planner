// lib/capacity/computeAvailableCapacity.ts
//
// Phase 1 of the payload-utilization system (see docs/incentive-redesign-plan.md).
//
// Pure -- no React, no Supabase, no clock. Every input is passed in, so this is
// directly unit-testable and can be re-run against a stored snapshot months
// later to reproduce a historical result exactly (spec section 23 / TEST I).
//
// This module does NOT contain a second payload calculation. It calls the same
// solveMaxGallons/planForGallons the Planner itself uses (planMath.ts) -- the
// spec is explicit that there must be one engine, and the Planner's own binary
// search was already computing available capacity and discarding it (it
// returned effectiveMaxGallons, which had zero consumers app-wide).
//
// Two rules from the plan are enforced here rather than at the call site,
// because they are the whole point of the redesign and must not be bypassable:
//
//  1. Capacity is measured against the compartment's CONFIGURED cap
//     (trailer_compartments.cap_gallons, admin/dispatch/lead-gated), never the
//     driver's per-load capOverride handle drag. A driver reducing their own
//     ceiling is exactly what this metric exists to catch, so it must not be
//     able to reduce the denominator. cap_override_gallons is still carried
//     through for the load-level explanation, and is ignored by the math.
//
//  2. The DRIVER's 100% mark is the company target, not the legal limit
//     (docs/incentive-redesign-plan.md section 4b). Capacity at the legal limit
//     is computed too, but only ever feeds the fleet-level headroom metric --
//     it is never a driver's denominator.

// Relative, not the "@/..." alias used elsewhere in this repo: node's built-in
// test runner resolves imports itself and does not read tsconfig path aliases,
// and keeping this module runnable without a bundler is the whole reason its
// acceptance tests need no DB, no auth session and no browser.
import { bestLbsPerGallon, planForGallons, solveMaxGallons } from "../../app/planner/utils/planMath.ts";

/**
 * Bumped whenever a change to this module would produce a different number for
 * the same inputs. Stored on every result row; a bump affects new loads only.
 * Historical rows are never recomputed in place -- see the plan's section 7.
 */
export const CALC_VERSION = 1;

/** Federal interstate gross limit. Per-state and permitted limits above this
 *  are a real future need -- which is why every load stores its own
 *  legal_gross_lbs rather than this being baked into the math. */
export const DEFAULT_LEGAL_GROSS_LBS = 80000;

export type LimitingFactor =
  | "volume"          // every compartment filled before weight ran out
  | "company_target"  // weight-limited, and the company target is below legal
  | "legal_weight"    // weight-limited at the legal ceiling itself
  | "none";           // nothing to compute (no compartments / no room)

export type CapacityCompartmentInput = {
  comp_number: number;
  /** Sign-flipped position, matching how ActiveComp already stores it
   *  (DB +position = REAR, flipped to FRONT before reaching the solver). */
  position: number;
  /** The configured ceiling. THIS is the trusted number -- see rule 1 above. */
  cap_gallons: number;
  /** Recorded for explanation only. Deliberately not used in any math here. */
  cap_override_gallons: number | null;
  product_id: string;
  api_60: number;
  alpha_per_f: number;
  /** Driver-observed API at observed_api_temp_f, when the terminal had one. */
  observed_api: number | null;
  observed_api_temp_f: number | null;
  /** The temperature this compartment's product was planned at. */
  temp_f: number;
};

export type CapacityInput = {
  tare_lbs: number;
  target_gross_lbs: number;
  legal_gross_lbs: number;
  cg_bias: number;
  compartments: CapacityCompartmentInput[];
};

export type CapacityResult = {
  calc_version: number;
  /** The driver's denominator: max gallons within the COMPANY TARGET. */
  available_gallons: number;
  available_payload_lbs: number;
  /** Fleet-only: max gallons within the LEGAL limit. Never a driver's number. */
  capacity_at_legal_gallons: number;
  /** Fleet-only: what a safely-raised target would unlock. Floored at 0. */
  headroom_gallons: number;
  limiting_factor: LimitingFactor;
  /** Sum of configured caps -- the physical volume ceiling. */
  total_volume_gallons: number;
};

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Build the solver's compartment list from snapshot inputs.
 *
 * Density is re-derived from the stored API/temp inputs via bestLbsPerGallon --
 * the same function the Planner uses -- rather than storing a precomputed
 * lbs/gal. Storing inputs and deriving keeps a stored snapshot auditable: you
 * can see WHY a load's capacity was what it was, not just what number came out.
 */
function toSolverComps(comps: CapacityCompartmentInput[]) {
  const out: Array<{
    compNumber: number; maxGallons: number; position: number;
    lbsPerGal: number; productId: string;
  }> = [];

  for (const c of comps) {
    // Rule 1: the configured cap, never the override.
    const maxGallons = Math.max(0, Math.floor(Number(c.cap_gallons ?? 0)));
    if (!(maxGallons > 0)) continue;
    if (!c.product_id) continue;
    if (!Number.isFinite(c.api_60) || !Number.isFinite(c.alpha_per_f)) continue;

    const lbsPerGal = bestLbsPerGallon(
      Number(c.api_60),
      Number(c.alpha_per_f),
      Number(c.temp_f),
      c.observed_api,
      c.observed_api_temp_f,
    );
    if (!isFinitePositive(lbsPerGal)) continue;

    out.push({
      compNumber: Number(c.comp_number),
      maxGallons,
      position: Number.isFinite(c.position) ? Number(c.position) : 0,
      lbsPerGal,
      productId: String(c.product_id),
    });
  }

  // Same ordering the Planner's own activeComps applies before solving.
  out.sort((a, b) => a.position - b.position);
  return out;
}

const EMPTY_RESULT: CapacityResult = {
  calc_version: CALC_VERSION,
  available_gallons: 0,
  available_payload_lbs: 0,
  capacity_at_legal_gallons: 0,
  headroom_gallons: 0,
  limiting_factor: "none",
  total_volume_gallons: 0,
};

/**
 * How much could this load have carried, given exactly these conditions?
 *
 * Solves twice against the same compartments and densities -- once under the
 * company target, once under the legal limit. Multi-product loads need no
 * special handling: allocateWithCaps already water-fills across compartments
 * with different products, densities and caps, so a split load is just the
 * general case (spec section 5 / TEST D).
 */
export function computeAvailableCapacity(input: CapacityInput): CapacityResult {
  const comps = toSolverComps(input.compartments ?? []);
  if (comps.length === 0) return EMPTY_RESULT;

  const totalVolume = comps.reduce((s, c) => s + c.maxGallons, 0);
  if (!(totalVolume > 0)) return EMPTY_RESULT;

  const tare = Number(input.tare_lbs) || 0;
  const bias = Number(input.cg_bias) || 0;

  const targetPayloadLbs = Math.max(0, Number(input.target_gross_lbs) - tare);
  const legalPayloadLbs = Math.max(0, Number(input.legal_gross_lbs) - tare);

  const availableGallons = solveMaxGallons(totalVolume, comps, targetPayloadLbs, bias);
  const legalGallons = solveMaxGallons(totalVolume, comps, legalPayloadLbs, bias);

  // Volume-limited means the solver ran out of compartment before it ran out of
  // weight -- it placed (essentially) every gallon the tanks can hold. The
  // tolerance matches the solver's own convergence, not an arbitrary fudge.
  const volumeLimited = availableGallons >= totalVolume - 1e-3;

  let limitingFactor: LimitingFactor;
  if (volumeLimited) limitingFactor = "volume";
  else if (Number(input.target_gross_lbs) < Number(input.legal_gross_lbs)) limitingFactor = "company_target";
  else limitingFactor = "legal_weight";

  // Payload weight actually placed at the target ceiling. Recomputed from the
  // solved gallons rather than assumed equal to targetPayloadLbs, because a
  // volume-limited load stops short of the weight ceiling entirely.
  const availablePayloadLbs = weightForGallons(availableGallons, comps, bias);

  return {
    calc_version: CALC_VERSION,
    available_gallons: availableGallons,
    available_payload_lbs: availablePayloadLbs,
    capacity_at_legal_gallons: legalGallons,
    // Floored at 0: a company may set a target at or above the legal limit,
    // in which case there is no headroom to capture, not negative headroom.
    headroom_gallons: Math.max(0, legalGallons - availableGallons),
    limiting_factor: limitingFactor,
    total_volume_gallons: totalVolume,
  };
}

/** Weight of a given gallon total once distributed by the same CG-biased
 *  allocation the solver used. Exported for the snapshot writer. */
export function weightForGallons(
  gallons: number,
  comps: Array<{ compNumber: number; maxGallons: number; position: number; lbsPerGal: number; productId: string }>,
  bias: number,
): number {
  if (!(gallons > 0) || comps.length === 0) return 0;
  const rows = planForGallons(gallons, comps, bias);
  return rows.reduce((s, r) => s + r.planned_gallons * r.lbsPerGal, 0);
}
