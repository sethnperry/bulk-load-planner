// lib/capacity/capacity.test.ts
//
// The spec's acceptance tests (section 36), as runnable assertions.
//
// Runs on node's built-in test runner with native TypeScript type-stripping --
// no new dependency, and no DB, no auth session and no browser. That matters
// for this project specifically: live verification has repeatedly been blocked
// by not having an authenticated session available, so the parts of this system
// that CAN be proven without one should be.
//
//   npm test
//
// Relative imports (not "@/...") so node resolves them without the tsconfig
// path aliases, which the built-in runner does not read.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeAvailableCapacity, CALC_VERSION, DEFAULT_LEGAL_GROSS_LBS,
  type CapacityCompartmentInput,
} from "./computeAvailableCapacity.ts";
import { computeUtilization, aggregateUtilization,
  normalizeUtilizationRow, groupUtilizationByDriver, aggregateHeadroom,
} from "./computeUtilization.ts";

// ── fixtures ────────────────────────────────────────────────────────────────
// Real-shaped: a 3-compartment trailer, diesel-ish and gasoline-ish API values
// taken from the ranges products.api_60 actually holds in this app.

const DIESEL = { api_60: 36.5, alpha_per_f: 0.00045 };
const GAS    = { api_60: 60.4, alpha_per_f: 0.00070 };

function comp(
  n: number, cap: number, position: number,
  product: { api_60: number; alpha_per_f: number },
  tempF = 75,
  overrides: Partial<CapacityCompartmentInput> = {},
): CapacityCompartmentInput {
  return {
    comp_number: n, position, cap_gallons: cap, cap_override_gallons: null,
    product_id: `p-${product.api_60}`,
    api_60: product.api_60, alpha_per_f: product.alpha_per_f,
    observed_api: null, observed_api_temp_f: null, temp_f: tempF,
    ...overrides,
  };
}

const THREE_COMP = [comp(1, 3000, -1, DIESEL), comp(2, 2800, 0, DIESEL), comp(3, 2600, 1, DIESEL)];

function capacityFor(over: Partial<Parameters<typeof computeAvailableCapacity>[0]> = {}) {
  return computeAvailableCapacity({
    tare_lbs: 34000, target_gross_lbs: 79500, legal_gross_lbs: DEFAULT_LEGAL_GROSS_LBS,
    cg_bias: 0, compartments: THREE_COMP, ...over,
  });
}

// ── TEST A — different tare ─────────────────────────────────────────────────
test("A: identical trailers on different tractors get their own capacity", () => {
  const heavy = capacityFor({ tare_lbs: 34000 });
  const light = capacityFor({ tare_lbs: 32000 });

  assert.ok(light.available_gallons > heavy.available_gallons,
    "the lighter tractor must get more available gallons -- no static benchmark");

  // 2,000 lb of extra payload, converted at this product's own density.
  const lbsPerGal = heavy.available_payload_lbs / heavy.available_gallons;
  const expectedExtra = 2000 / lbsPerGal;
  assert.ok(Math.abs((light.available_gallons - heavy.available_gallons) - expectedExtra) < 1,
    "the gap must equal the tare difference converted at load density");
});

// ── TEST B — different product density ──────────────────────────────────────
test("B: a lighter product yields more available gallons on the same equipment", () => {
  const diesel = capacityFor();
  const gasoline = capacityFor({
    compartments: [comp(1, 3000, -1, GAS), comp(2, 2800, 0, GAS), comp(3, 2600, 1, GAS)],
  });
  assert.ok(gasoline.available_gallons > diesel.available_gallons,
    "gasoline is less dense, so the same weight ceiling allows more gallons");
});

// ── TEST C — temperature ────────────────────────────────────────────────────
test("C: a warmer load is less dense, so more gallons fit under the same ceiling", () => {
  const cold = capacityFor({ compartments: THREE_COMP.map((c) => ({ ...c, temp_f: 40 })) });
  const warm = capacityFor({ compartments: THREE_COMP.map((c) => ({ ...c, temp_f: 95 })) });
  assert.ok(warm.available_gallons > cold.available_gallons,
    "thermal expansion means warm product weighs less per gallon");
});

// ── TEST D — multi-product ──────────────────────────────────────────────────
test("D: a split load respects each compartment's own product and cap", () => {
  const split = capacityFor({
    compartments: [comp(1, 3000, -1, GAS), comp(2, 2800, 0, DIESEL), comp(3, 2600, 1, DIESEL)],
  });
  const allDiesel = capacityFor();
  const allGas = capacityFor({
    compartments: [comp(1, 3000, -1, GAS), comp(2, 2800, 0, GAS), comp(3, 2600, 1, GAS)],
  });

  assert.ok(split.available_gallons > allDiesel.available_gallons, "must beat the all-heavy case");
  assert.ok(split.available_gallons < allGas.available_gallons, "must not reach the all-light case");
  assert.ok(split.available_gallons <= split.total_volume_gallons, "never exceeds physical volume");
});

// ── TEST E — underload ──────────────────────────────────────────────────────
test("E: an underload reports the real gallons left and a utilization below 100", () => {
  const r = computeUtilization({
    available_gallons: 7820, actual_gallons: 7200, actual_gross_lbs: 74000,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  assert.equal(r.eligibility, "eligible");
  assert.equal(r.unused_gallons, 620);
  assert.ok(Math.abs(r.utilization_pct! - 92.07) < 0.01, `got ${r.utilization_pct}`);
});

// ── TEST F — near maximum ───────────────────────────────────────────────────
test("F: a near-max load reports a small remainder", () => {
  const r = computeUtilization({
    available_gallons: 7820, actual_gallons: 7760, actual_gross_lbs: 79400,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  assert.equal(r.unused_gallons, 60);
  assert.ok(Math.abs(r.utilization_pct! - 99.23) < 0.01, `got ${r.utilization_pct}`);
});

// ── TEST G — external cap ───────────────────────────────────────────────────
test("G: a quantified external cap re-baselines the denominator", () => {
  const r = computeUtilization({
    available_gallons: 7850, actual_gallons: 7480, actual_gross_lbs: 79000,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: 7500, has_unquantified_constraint: false,
  });
  assert.equal(r.eligibility, "eligible", "an external cap must not disqualify the driver");
  assert.equal(r.effective_available_gallons, 7500);
  assert.ok(Math.abs(r.utilization_pct! - 99.73) < 0.01, `got ${r.utilization_pct}`);
  assert.equal(r.unused_gallons, 20, "measured against the cap, not full capacity");
});

test("G2: an unquantified cap excludes the load instead of guessing a number", () => {
  const r = computeUtilization({
    available_gallons: 7850, actual_gallons: 7480, actual_gross_lbs: 79000,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: true,
  });
  assert.equal(r.eligibility, "excluded_constraint");
  assert.equal(r.utilization_pct, null, "no score is better than a wrong score");
});

test("G3: a cap above real capacity constrained nothing", () => {
  const r = computeUtilization({
    available_gallons: 7500, actual_gallons: 7400, actual_gross_lbs: 79000,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: 9000, has_unquantified_constraint: false,
  });
  assert.equal(r.effective_available_gallons, 7500, "a cap can only ever narrow");
});

// ── TEST H — safety violation ───────────────────────────────────────────────
test("H: exceeding the legal limit is never rewarded", () => {
  const r = computeUtilization({
    available_gallons: 7820, actual_gallons: 7900, actual_gross_lbs: 80400,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  assert.equal(r.eligibility, "excluded_safety");
  assert.equal(r.utilization_pct, null, "a violation must not produce a >100% score");
});

test("H2: an overfilled compartment is a safety exclusion too", () => {
  const r = computeUtilization({
    available_gallons: 7820, actual_gallons: 7800, actual_gross_lbs: 79000,
    legal_gross_lbs: 80000, compartment_overfilled: true,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  assert.equal(r.eligibility, "excluded_safety");
});

test("H3: a violation is excluded from aggregates, not folded in as a penalty", () => {
  const good = computeUtilization({
    available_gallons: 1000, actual_gallons: 990, actual_gross_lbs: 79000,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  const violation = computeUtilization({
    available_gallons: 1000, actual_gallons: 1100, actual_gross_lbs: 80500,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });

  const agg = aggregateUtilization([good, violation]);
  assert.equal(agg.eligible_loads, 1);
  assert.equal(agg.excluded_safety, 1);
  assert.equal(agg.actual_gallons, 990, "the violation's gallons must not inflate the total");
  assert.ok(Math.abs(agg.utilization_pct! - 99) < 0.001, "and must not raise the score");
});

// ── Above target but under legal is legitimate, not clamped ─────────────────
test("above the company target but under legal scores over 100 and stays eligible", () => {
  const r = computeUtilization({
    available_gallons: 7500, actual_gallons: 7560, actual_gross_lbs: 79800,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  assert.equal(r.eligibility, "eligible", "beating a target is not a violation");
  assert.ok(r.utilization_pct! > 100, "clamping would erase safely beating the target");
  assert.equal(r.unused_gallons, 0, "unused never goes negative");
});

// ── TEST I — historical stability ───────────────────────────────────────────
test("I: a result carries the engine version that produced it", () => {
  assert.equal(capacityFor().calc_version, CALC_VERSION);
  // The stability guarantee itself is structural: stored rows keep their own
  // calc_version and are never recomputed in place. What is asserted here is
  // that the version travels with the result, which is what makes that
  // possible -- see the plan's section 7.
});

test("I2: identical inputs always produce an identical result", () => {
  assert.deepEqual(capacityFor(), capacityFor(), "the engine must be deterministic");
});

// ── TEST J — no manager benchmark ───────────────────────────────────────────
test("J: capacity needs no benchmark configuration of any kind", () => {
  const r = capacityFor();
  assert.ok(r.available_gallons > 0,
    "a company that has configured nothing still gets a real capacity number");
});

// ── TEST K — no incentive configuration ─────────────────────────────────────
test("K: utilization works with no incentive configuration", () => {
  const r = computeUtilization({
    available_gallons: capacityFor().available_gallons, actual_gallons: 7000,
    actual_gross_lbs: 74000, legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  assert.equal(r.eligibility, "eligible");
  assert.ok(r.utilization_pct! > 0, "measurement must not depend on the incentive layer");
});

// ── Anti-gaming: the rules that make the number defensible ──────────────────
test("a driver's capOverride cannot shrink their own denominator", () => {
  const honest = capacityFor();
  const dragged = capacityFor({
    compartments: THREE_COMP.map((c) => ({ ...c, cap_override_gallons: 100 })),
  });
  assert.equal(dragged.available_gallons, honest.available_gallons,
    "capacity is measured against the configured cap, never the handle drag");
});

test("the company target is the denominator; legal only feeds fleet headroom", () => {
  const r = capacityFor({ target_gross_lbs: 79500, legal_gross_lbs: 80000 });
  assert.ok(r.capacity_at_legal_gallons > r.available_gallons,
    "the legal ceiling allows more than the company target");
  assert.ok(Math.abs(r.headroom_gallons - (r.capacity_at_legal_gallons - r.available_gallons)) < 1e-6);
  assert.equal(r.limiting_factor, "company_target",
    "a weight-limited load under a sub-legal target is limited BY that target");
});

test("headroom is floored at zero when a target meets or exceeds legal", () => {
  const r = capacityFor({ target_gross_lbs: 80000, legal_gross_lbs: 80000 });
  assert.equal(r.headroom_gallons, 0);
  assert.equal(r.limiting_factor, "legal_weight");
});

// ── Limiting factor + degenerate inputs ─────────────────────────────────────
test("a load that fills every compartment is volume-limited, with no headroom", () => {
  // Tiny tanks against a full weight allowance: volume runs out first.
  const r = capacityFor({ compartments: [comp(1, 100, 0, GAS)] });
  assert.equal(r.limiting_factor, "volume");
  assert.equal(r.available_gallons, r.total_volume_gallons);
  assert.equal(r.headroom_gallons, 0, "already full -- a higher target unlocks nothing");
});

test("no compartments, or a tare over the target, yields zero rather than a wrong number", () => {
  assert.equal(computeAvailableCapacity({
    tare_lbs: 34000, target_gross_lbs: 79500, legal_gross_lbs: 80000,
    cg_bias: 0, compartments: [],
  }).limiting_factor, "none");

  assert.equal(capacityFor({ tare_lbs: 85000 }).available_gallons, 0,
    "an over-target tare leaves no payload room at all");
});

test("incomplete data is reported as such, never as a zero score", () => {
  const r = computeUtilization({
    available_gallons: 0, actual_gallons: 7000, actual_gross_lbs: null,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  });
  assert.equal(r.eligibility, "excluded_incomplete_data");
  assert.equal(r.utilization_pct, null);
});

// ── Aggregate weighting ─────────────────────────────────────────────────────
test("period utilization is gallon-weighted, not a mean of percentages", () => {
  const big = computeUtilization({
    available_gallons: 8000, actual_gallons: 7200, actual_gross_lbs: 74000,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  }); // 90%
  const tiny = computeUtilization({
    available_gallons: 100, actual_gallons: 100, actual_gross_lbs: 40000,
    legal_gross_lbs: 80000, compartment_overfilled: false,
    external_cap_gallons: null, has_unquantified_constraint: false,
  }); // 100%

  const agg = aggregateUtilization([big, tiny]);
  const meanOfPercentages = (90 + 100) / 2;
  assert.ok(Math.abs(agg.utilization_pct! - (7300 / 8100) * 100) < 0.001);
  assert.ok(agg.utilization_pct! < meanOfPercentages,
    "one tiny perfect load must not drag the fleet number up to 95%");
});

// ── The aggregate also runs over rows read back from the database ──────────
// aggregateUtilization is deliberately shared between the pure engine's own
// results and load_utilization rows (one implementation, not two). PostgREST
// hands numeric columns back as strings often enough that the shared function
// has to tolerate them -- a bare += would silently concatenate instead of add,
// turning a fleet total into nonsense rather than throwing.
test("period aggregate handles DB-shaped rows with string numerics", () => {
  const agg = aggregateUtilization([
    { effective_available_gallons: "8000" as any, actual_gallons: "7200" as any, unused_gallons: "800" as any, eligibility: "eligible" },
    { effective_available_gallons: "100" as any, actual_gallons: "100" as any, unused_gallons: "0" as any, eligibility: "eligible" },
    { effective_available_gallons: "7850" as any, actual_gallons: "7480" as any, unused_gallons: "370" as any, eligibility: "excluded_constraint" },
  ]);

  assert.equal(agg.actual_gallons, 7300, "must add, not concatenate");
  assert.equal(agg.available_gallons, 8100);
  assert.equal(agg.eligible_loads, 2);
  assert.equal(agg.excluded_constraint, 1, "an excluded load is still counted, just not scored");
  assert.ok(Math.abs(agg.utilization_pct! - 90.12) < 0.01, `got ${agg.utilization_pct}`);
  assert.ok(agg.utilization_pct! < 95,
    "the naive mean of 90% and 100% is 95% -- gallon weighting must not flatter a tiny perfect load");
});

// A load_utilization row as PostgREST can hand it back: numeric columns are
// not guaranteed to arrive as JSON numbers. The aggregate already coerced
// defensively, but the Reports modal renders these rows DIRECTLY and calls
// .toFixed() on the percentage -- proven against a real Postgres to throw and
// take the whole modal down, not degrade. Normalising at the read boundary is
// what makes UtilizationRow's declared `number` type true for every consumer.
test("normalizeUtilizationRow makes DB-shaped numerics safe to format", () => {
  const row = normalizeUtilizationRow({
    load_id: "l1",
    driver_id: "d1",
    loaded_at: "2026-09-03T21:02:11.617345+00:00",
    available_gallons: "6340",
    effective_available_gallons: "6340",
    actual_gallons: "6300",
    unused_gallons: "40",
    utilization_pct: "99.36908517350157728700",
    eligibility: "eligible",
    exception_reason: null,
  } as any) as any;

  assert.equal(typeof row.utilization_pct, "number");
  assert.equal(row.utilization_pct.toFixed(1), "99.4", "this is the call that crashed the modal");
  assert.equal(row.actual_gallons, 6300);
  assert.equal(row.available_gallons + row.unused_gallons, 6380, "must add, not concatenate");
  assert.equal(row.eligibility, "eligible", "non-numeric fields pass through untouched");
  assert.equal(row.loaded_at, "2026-09-03T21:02:11.617345+00:00");
});

test("normalizeUtilizationRow keeps a null percentage null, never 0", () => {
  const row = normalizeUtilizationRow({
    available_gallons: "6340", effective_available_gallons: "6340",
    actual_gallons: "3200", unused_gallons: "3140",
    utilization_pct: null, eligibility: "excluded_constraint", exception_reason: "capped",
  } as any) as any;

  // 0% would read as "this driver loaded nothing"; an excluded load has no score.
  assert.equal(row.utilization_pct, null);
  assert.equal(row.actual_gallons, 3200);
});

// ── Phase 3: fleet aggregation ──────────────────────────────────────────────

const u = (driver_id: string, avail: number, actual: number, eligibility = "eligible") => ({
  driver_id,
  effective_available_gallons: avail,
  actual_gallons: actual,
  unused_gallons: Math.max(0, avail - actual),
  eligibility: eligibility as any,
});

test("P3-A: the fleet table is sorted by name, never by score", () => {
  // Zoe is the best performer and must still come last. Section 17: this is
  // deliberately not a leaderboard, reversing the old dashboard's own
  // gallons-descending ordering.
  const groups = groupUtilizationByDriver(
    [u("z", 8000, 8000), u("a", 8000, 4000), u("m", 8000, 6000)],
    { z: "Zoe Adams", a: "Aaron Diaz", m: "Mia Brooks" }
  );

  assert.deepEqual(groups.map((g) => g.display_name), ["Aaron Diaz", "Mia Brooks", "Zoe Adams"]);
  assert.equal(groups[0].summary.utilization_pct?.toFixed(1), "50.0");
  assert.equal(groups[2].summary.utilization_pct?.toFixed(1), "100.0");
});

test("P3-B: a driver's percentage is gallon-weighted, matching the fleet headline", () => {
  // One big well-loaded trip and one tiny poor one. A mean of percentages
  // would read 75%; the gallon-weighted answer is what both surfaces show.
  const groups = groupUtilizationByDriver(
    [u("a", 8000, 8000), u("a", 1000, 500)],
    { a: "Aaron Diaz" }
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].summary.utilization_pct?.toFixed(2), "94.44");
  assert.notEqual(groups[0].summary.utilization_pct?.toFixed(2), "75.00");
});

test("P3-C: excluded loads are counted per driver but never scored", () => {
  const groups = groupUtilizationByDriver(
    [u("a", 8000, 8000), u("a", 8000, 9000, "excluded_safety"), u("a", 8000, 2000, "excluded_constraint")],
    { a: "Aaron Diaz" }
  );

  const g = groups[0];
  assert.equal(g.total_loads, 3, "all three loads belong to this driver");
  assert.equal(g.summary.eligible_loads, 1);
  assert.equal(g.summary.excluded_safety, 1);
  assert.equal(g.summary.excluded_constraint, 1);
  // The overweight load would have pushed this above 100 if it were folded in.
  assert.equal(g.summary.utilization_pct?.toFixed(1), "100.0");
  assert.equal(g.summary.actual_gallons, 8000, "excluded gallons stay out of the totals");
});

test("P3-D: an unknown driver id degrades to a name, not a crash", () => {
  const groups = groupUtilizationByDriver([u("ghost", 8000, 8000)], {});
  assert.equal(groups[0].display_name, "Unknown");
});

test("P3-E: headroom is the gap from the company target up to the legal limit", () => {
  const h = aggregateHeadroom([
    { available_gallons: 8000, capacity_at_legal_gallons: 8100, limiting_factor: "company_target" },
    { available_gallons: 7500, capacity_at_legal_gallons: 7580, limiting_factor: "company_target" },
    // Volume-limited: full tanks under both ceilings, so a target raise buys nothing.
    { available_gallons: 9650, capacity_at_legal_gallons: 9650, limiting_factor: "volume" },
  ]);

  assert.equal(h.headroom_gallons, 180);
  assert.equal(h.loads, 3);
  assert.equal(h.target_limited_loads, 2, "only target-limited loads can be helped by a raise");
  assert.equal(h.capacity_at_target_gallons, 25150);
  assert.equal(h.capacity_at_legal_gallons, 25330);
});

test("P3-F: a nonsensical snapshot cannot cancel out real headroom", () => {
  // A legal ceiling below the target ceiling is impossible; clamping at the
  // row keeps one bad snapshot from silently eating another load's headroom.
  const h = aggregateHeadroom([
    { available_gallons: 8000, capacity_at_legal_gallons: 8100, limiting_factor: "company_target" },
    { available_gallons: 8000, capacity_at_legal_gallons: 7000, limiting_factor: "company_target" },
  ]);
  assert.equal(h.headroom_gallons, 100);
});

test("P3-G: no snapshots means zero headroom, not NaN", () => {
  const h = aggregateHeadroom([]);
  assert.equal(h.headroom_gallons, 0);
  assert.equal(h.loads, 0);
  assert.equal(h.target_limited_loads, 0);
});

test("P3-H: string numerics from PostgREST still add up", () => {
  const h = aggregateHeadroom([
    { available_gallons: "7940.911" as any, capacity_at_legal_gallons: "8030.5" as any, limiting_factor: "company_target" },
  ]);
  assert.equal(h.headroom_gallons.toFixed(3), "89.589");
});
