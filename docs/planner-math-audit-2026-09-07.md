# Planner Math Validation — 2026-09-07

Deterministic tests against the real `app/planner/utils/planMath.ts` and the
capacity engine (`lib/capacity/`). `npm test` → **50 tests, 0 fail** (35 existing
capacity + 15 new planner-math). No browser, no DB — pure functions.

## Safety invariant: PROVEN

> The weight-constrained plan must never exceed the allowed payload ceiling; no
> rounding or convergence step may turn a legal plan overweight.

`solveMaxGallons` binary-searches the largest gallon total whose CG-biased
allocation stays `<= allowedLbs`, and it converges from BELOW (only raises the
lower bound), so its result is always conservative. Verified across a **2000-case
randomized sweep** (1–6 compartments, densities 5.5–9 lb/gal, biases −1…2.5,
ceilings 5k–75k lb): the resulting plan's weight was `<= allowedLbs` in every
case, and the gallon result stayed within `[0, total capacity]`.

`allowedLbs = target_weight − tare` (page.tsx:965), and the company target
(default 79,500) sits under the 80,000 legal limit, so a completed plan lands
under legal by design. (Above-target-but-under-legal is intentionally allowed
per spec; the legal limit is enforced separately by `record_load_utilization`'s
safety gate, already covered by the capacity tests H/H2/H3.)

## Edge cases: all fail SAFE

- **Missing / zero / negative density** → the compartment is *excluded* from the
  plan (`page.tsx:928` `if (lbsPerGal == null || !(lbsPerGal > 0)) continue;`),
  so it can never be filled with an unknown weight. Confirmed the math does yield
  a non-positive density for an extreme-low API, so that guard is load-bearing.
- **NaN density** into `solveMaxGallons` → 0 gallons (never a bogus over-fill).
- **Negative allowedLbs / zero capacity / negative total** → 0.
- **Volume-limited load** (tanks fit under the ceiling) → returns EXACTLY full,
  not 99.99997 (the documented convergence fix holds).
- **Monotonicity**: more allowed weight never yields fewer gallons.
- `allocateWithCaps` never exceeds any compartment cap or the requested total;
  over-requesting fills to caps and stops.
- CG slider ↔ bias round-trips to identity across the range.
- `computeActualLbsForLine` and `bestLbsPerGallon` agree on identical inputs
  (plan vs. actual can't drift from the density math alone).

## Minor recommendation (not a safety bug)

`computeActualLbsForLine` (load-completion weight) has no `> 0` density guard
like the planner does. `onLoadedFromLoadingModal` already rejects non-finite API
entries, but a finite-but-absurd API (e.g. −50) would pass and yield a wrong
actual weight. This affects the *report/utilization*, not the physical load
decision (the scale is the real check), and `record_load_utilization` re-derives
server-side with its own gate. Clamping the API entry to a sane range (~0–100)
at input would harden data quality. Low priority.

## Verdict

No safety-critical defects in the planner math. The plan is conservative and the
degenerate-input paths fail safe. Tests are committed (`planMath.test.ts`) and
run in CI-able `npm test`.
