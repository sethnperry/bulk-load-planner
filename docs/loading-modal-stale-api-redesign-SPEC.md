# Loading modal (Plan Review) — clean compartments + stale-API decision overlay
**Flagged by operator 2026-09-07 during the audit. Design item, not built yet.**

## Problem
Moving API + temperature INTO the planned-compartment row made Plan Review
confusing. Pressing LOAD should show, cleanly: each compartment, its product,
its gallons. Nothing else competing for attention.

Separately — and this is the safety part — a **stale API is currently passive**.
The app shows an orange "may be stale" note but still plans gallons off that
stale (possibly-too-light) density. A too-light density lets the plan load MORE
gallons than is actually safe. There is no driver action to handle it.

## Proposed design
1. **Primary view = clean.** Compartment rows show product + gallons only. Pull
   API/temp OUT of that row (API freshness stays as a small line, not inline
   per-compartment numbers).
2. **On a stale product, a cover overlay** (reuse the existing "unavailable
   product" overlay pattern) with a short, concrete choice — e.g.:
   > *"Diesel at this terminal hasn't been updated recently."*
   > **[ Assume heaviest & recalculate ]   [ Load current plan ]**
   - **Assume heaviest & recalculate** — re-derive that product's density at its
     HEAVIEST plausible API (lowest API = densest = heaviest), then re-run the
     existing weight solver so the planned gallons drop to a safe amount. This is
     the app's own "err cold and heavy" principle applied to staleness.
   - **Load current plan** — ignore staleness, load as planned.

## How to get the "heaviest" density (the real open question)
Physics: **lower API = denser = heavier = fewer safe gallons** (operator's
"diesel 33–38 → use 33" is correct).

The DB today has only `products.api_60` (a single reference) + `alpha_per_f`.
There is **no published min/max API range** stored, so the "use the low end of
the published range" idea needs a data source. Options, cheapest first:
- **A. Lowest API ever observed for this product at this terminal** — from load
  history (`load_lines.actual_api`) and/or `terminal_products.last_api`, min over
  time. Uses existing data, terminal-specific, self-improving. Fall back to
  `api_60` when there's no history.
- **B. A published/reference heaviest** — would need a new `api_heavy` (or
  min-API) column per product, hand-curated. More work, not terminal-specific.
- **C. Both** — take `min(observed-lowest-at-terminal, reference-heavy)`, the
  most conservative. Safest, a bit more to build.

Recommendation: **A now** (zero new schema, terminal-specific, conservative),
with B/C as a later refinement if the observed history proves too sparse.
Deliberately NOT "ask the user their benchmark on every save" — that adds
friction on the hottest path and relies on the user setting it correctly; the
auto lowest-observed value is both safer and zero-friction.

## Feasibility
Contained. Reuses: `isApiStale` (detection), the unavailable-product overlay
(cover UI), `lbsPerGallonAtTemp`/`bestLbsPerGallon` (density), `solveMaxGallons`
(re-plan under a weight ceiling — just feed the heavier lbs/gal for the stale
product and re-run). No new physics; the planner-math audit already proved the
solver is conservative and safe.

## Open decisions before building
1. Layout: confirm compartments show product + gallons only, API/temp out of the row.
2. Heaviest source: A (lowest observed at terminal) vs B/C.
3. Scope of "stale": per-product (only the stale one recalculates) — yes.
4. Timing: build before finishing the (device-dependent) remaining audit items,
   or after.
