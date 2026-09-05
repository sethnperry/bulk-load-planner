# Payload Utilization System — Implementation Plan

Replaces the "Recovered Gallons" incentive system. Written after reading the
existing calculator, load workflow, schema and every incentive consumer.
**Nothing below is implemented yet** — this is the plan requested in §38 of the
handoff.

---

## 0. What the inspection actually found

Five findings drive every decision in this plan. Three of them change the shape
of the work versus what the handoff assumed.

### 0.1 The capacity solver already exists — and already throws the answer away

`app/planner/hooks/usePlanRows.ts` binary-searches (22 iterations) for the
largest gallon total that keeps `Σ planned_gallons × lbsPerGal ≤ allowedLbs`,
respecting per-compartment caps, CG bias and per-product density. It returns
that number as `effectiveMaxGallons`.

`grep` across the whole app: **`effectiveMaxGallons` has zero consumers.** It is
computed on every render of the Planner and discarded.

That value *is* "available capacity." §3's instruction not to build a second
payload calculation is not just satisfiable — the engine needs no new math at
all for the single-terminal, single-plan case. It needs to be *persisted*.

### 0.2 `actual_gallons` is not measured — it is copied from the plan

In `useLoadWorkflow.ts` → `onLoadedFromLoadingModal()`:

```ts
nextActualByComp[comp] = { actual_gallons: gallons, ... }   // gallons = r.planned_gallons
```

The only thing a driver enters at completion is **API and temperature per
product**. Actual gallons are never captured independently. `complete_load`
therefore writes `actual_gallons == planned_gallons` for every load in the
database today.

**Consequence: utilization computed from existing data would be ~100% on
essentially every load**, and "gallons left behind" would be ~0. The measurement
engine is not blocked on capacity — it is blocked on there being no real
`actual` to compare against.

This is the single biggest gap between the handoff's vision (§13's
`RACK_TICKET`/`TMS` provenance, §35's zero-input roadmap) and today's reality.
It has to be confronted in Phase 1, not deferred.

The two things that *can* currently make actual < available are both driver
inputs, not measurements:
- `compPlan[n].capOverride` — dragging a compartment handle down. Reduces
  `activeComps[].maxGallons`, so it reduces `effectiveMaxGallons` itself.
- `loadingGallonsOverride` — the Plan Review per-compartment gallons edit.
  Reduces actual only; the plan's own max is unaffected.

### 0.3 The capacity inputs are driver-editable

| Input | Source | Who can change it |
|---|---|---|
| `tare_lbs` | `equipment_combos` | **any driver**, via `ScaleTicketModal` (autosaves on keystroke) |
| `target_weight` | `equipment_combos` | **any driver**, same modal, no role gate |
| `cap_gallons` | `trailer_compartments` | admin/dispatch/lead (gated 2026-08-06) |
| `capOverride` | client-side plan state | **any driver**, every load |
| API / temp | driver-entered at completion | **any driver** |

Two of these are settled by explicit direction (see §4) and are **not** treated
as gaming vectors: tare is driver-entered by design (the driver weighs the truck;
the scale ticket is the audit trail), and the company target is deliberately the
100% mark.

The unresolved one is that `target_weight` — now the denominator of every
utilization number — lives per-combo on `equipment_combos` and is editable by
any driver through an ungated modal. Confirmed by reading `ScaleTicketModal.tsx`:
no `myRole` prop, no role check, debounced autosave straight to
`equipment_combos`. A driver can lower their own denominator in two taps.

That is a mismatch between intent and schema, not a design flaw in the intent:
the target is described as a *company* number and a *company-wide* goal, but the
schema has it as per-equipment driver-editable state. §4 proposes the fix.

`capOverride` remains a genuine gaming vector and is handled in §4.

### 0.4 Nothing captures the capacity inputs at load time

`load_log` snapshots `tare_lbs`, `gross_limit_lbs` (= `target_weight`),
`cg_bias`, `product_temp_f`. `load_lines` snapshots planned/actual gallons/lbs,
`actual_api`, `actual_temp_f`. `planned_snapshot` (jsonb) holds per-line product
identity, planned gallons/lbs, planned API + its timestamp.

**Not captured anywhere:** per-compartment `cap_gallons`, per-compartment
`position`, whether a `capOverride` was applied and what it was, and each
product's `alpha_per_f`/`api_60`. Reconstructing capacity for a past load today
means reading `trailer_compartments` and `products` *live* — both mutable — which
directly violates §23 (historical stability) and fails TEST I.

### 0.5 An external-constraint signal already exists, but carries no quantity

`terminal_outage_reports` with `report_type = 'out_of_allocation'` is exactly
§11's "terminal capped me" event — company-scoped, already RLS'd, already
reported from the Complete screen. It records terminal + product + reporter +
timestamp. It does **not** record a gallon figure, so it can flag a load as
externally constrained but cannot supply the "measure against 7,500" number.

---

## 1. What existing incentive functionality is removed

Full removal. §25's "one system" is the goal; keeping a benchmark path alive
beside a capacity path is how both rot.

**Database (one migration, drops last):**
- `product_benchmarks` — the manager benchmark, the thing §8 exists to kill.
- `load_points` — per-compartment recovered gallons/points.
- `calculate_load_points(uuid)`, `_calculate_load_points_core(...)`,
  `recalculate_load_points(uuid, bool)`, `backfill_incentive_points(uuid, ts)`.
- `flag_stale_payroll_reports` trigger (fires on `load_points`).
- `incentive_settings.weight_cap_lbs` — superseded by the per-combo target and
  the legal limit. The table itself survives (see §2).

**App code:**
- `app/admin/IncentiveSettingsModal.tsx` — benchmark search/add, weight cap,
  backfill button, diagnostics readout. Replaced, not edited.
- `app/admin/UnderloadingDashboardModal.tsx` — replaced (§27: concept keeps,
  data source changes).
- `app/admin/PayrollReportModal.tsx` — Phase 4. Its period picker, driver-group
  filter, CSV export and roster-membership filtering are reusable shells; its
  points math is not.
- `useLoadWorkflow.ts` — the fire-and-forget `calculate_load_points` RPC call
  and `recovered_points` plumbing into `loadReport`.
- `usePlanSlots.ts` — the `load_points` sum in `fetchLastLoadFromLog()`.
- `page.tsx` — `incentiveEnabled` fetch, the `load_points` period-average query,
  the points card, and the 3-column grid that widens for it.
- `types.ts` — `LoadReport.recovered_points`.

**Kept as-is:** `app/admin/payPeriods.ts` (pure date math, no incentive concept
in it) and the `pay_period_type`/`pay_period_anchor_date` columns.

## 2. What is reused

- **`usePlanRows` / `planForGallons` / `allocateWithCaps`** — the solver. §3
  satisfied by reuse, not reimplementation.
- **`computeActualLbsForLine`, `bestLbsPerGallon`, `lbsPerGallonAtTemp`,
  `backCorrectApiTo60`** (`planMath.ts`) — all pure, all already shared between
  the live preview and submission.
- **`incentive_settings`** — survives as the config row, renamed in concept from
  "is the incentive on" to "how is the incentive layer configured." Per §9/§21
  and TEST K, **measurement must not read `enabled` at all.**
- **`load_log` / `load_lines` / `begin_load` / `complete_load`** — extended, not
  replaced.
- **`terminal_outage_reports` (`out_of_allocation`)** — the external-constraint
  *signal* (§0.5).
- **`useCompanyRoster`**, the pay-period generator, the driver-group filter and
  the CSV export shell from `PayrollReportModal`.

## 3. New database structures

Three migrations, in order. All written against the live schema per this repo's
"don't trust the migrations folder" rule — each will be spot-checked with
`information_schema.columns` / `pg_policies` before running.

**A. `load_capacity_snapshot`** (1:1 with `load_log`, immutable, §23)

Everything needed to recompute capacity without reading a mutable table:
`load_id` PK, `calc_version` int, `tare_lbs`, `target_weight_lbs`,
`legal_gross_lbs`, `cg_bias`, `compartments` jsonb (per comp: `comp_number`,
`position`, `cap_gallons` **as configured**, `cap_override_gallons` nullable,
`product_id`, `api_60`, `alpha_per_f`, `observed_api`, `observed_api_temp_f`,
`temp_f`), plus the computed outputs `available_gallons`,
`available_payload_lbs`, `capacity_at_legal_gallons` (§4a headroom) and
`limiting_factor` text.

`calc_version` is the §23 guarantee: a stored row is never recomputed by a newer
engine; a version bump writes new rows, it does not mutate old ones.

**B. `load_constraints`** (0..n per load)

`load_id`, `constraint_type` (`dispatch_cap`, `customer_cap`, `terminal_cap`,
`product_unavailable`, `equipment`, `other`), `constrained_gallons` nullable,
`source` (the §13 provenance enum), `notes`, `created_by`, `created_at`.
Nullable gallons matters: an `out_of_allocation` outage report can raise a
constraint row with no quantity, which is enough to mark the load
**non-measured** even when it can't re-baseline it.

**C. `load_utilization`** (1:1 with `load_log`, the read model)

`load_id`, `driver_id`, `company_id`, `loaded_at`, `available_gallons`,
`effective_available_gallons` (after external constraints),
`actual_gallons`, `unused_gallons`, `utilization_pct`,
`eligibility` (`eligible` | `excluded_constraint` | `excluded_safety` |
`excluded_incomplete_data`), `exception_reason`, `actual_gallons_source`
(§13 enum), `calc_version`.

RLS mirrors the existing `load_points` shape: own-row read for drivers,
company-wide read for admin + the staff read policy already added for the
underloading dashboard. **No client write policy** — written only by a
`SECURITY DEFINER` function, same precedent as `load_points`.

## 4. How available capacity is calculated from a completed load

**The trusted-ceiling rule (§30):** capacity is computed against
`trailer_compartments.cap_gallons` — the admin-gated configured cap — and
explicitly **ignores `capOverride`**. `cap_override_gallons` is still recorded in
the snapshot, for the load-level explanation ("you capped C2 at 1,800 of 2,400"),
but it never reduces the denominator. The same applies to `loadingGallonsOverride`
— it reduces actual, which is the point.

**Where the number comes from:** at `begin_load` time, the client computes a
*second* `usePlanRows` result against `activeComps` rebuilt with
`persistedCapForComp(n)` instead of `effectiveMaxGallonsForComp(n)`. Everything
else — CG bias, per-product density at the confirmed temp, positions,
`allowedLbs` — is identical. That second `effectiveMaxGallons` is
`available_gallons`. It is the same solver, same inputs, one substitution.

This is a client-side computation persisted server-side, which is the one real
tension with §30. Mitigation: the snapshot records every input, so a server-side
recompute can verify any row; and a Phase 1 validation task re-derives capacity
in SQL for a sample of loads and diffs it against the stored value.

**The company target is the 100% mark — not the legal limit.** Per explicit
direction, `available_gallons` is computed against `target_weight`, full stop.
A company that targets 79,500 lbs is measured against 79,500 lbs; the federal
80,000 is *not* the driver's denominator and never appears in a driver's score.
This reverses the `min(target, 80000)` rule the first draft of this plan
proposed.

**The legal limit becomes a second, company-wide goal (see §4a).**

**Tare stays driver-entered**, per explicit direction: the driver weighs the
truck and enters the weight, and a company that doubts a number has the weight
ticket to check it against. No role gate is added. The snapshot records the tare
used, so a disputed load can be re-derived against a corrected tare rather than
argued about.

**The target moves to company level and gets staff-gated (approved).** Because
`target_weight` is now the denominator, leaving it per-combo and ungated meant
"the company target" was neither. Shipping:
`incentive_settings.target_gross_lbs` as the company number (default 79,500),
with the existing per-combo `target_weight` kept as a staff-gated override for
equipment that genuinely can't hit the company number. The planner keeps using
whatever applies to the current combo, so `allowedLbs` and the live plan are
unaffected; only *who can change it* moves.

`ScaleTicketModal` keeps its tare field open to every driver and gates only the
target field. **Fleet tier only** — a solo company's sole member is always
`role = 'admin'` by the existing solo-provisioning design, so a solo driver
still sets their own target with no code branch needed; the same admin check
does both. This follows the equipment cap/Unit# gating precedent from
2026-08-06 (`myRole` threaded through, admin/dispatch/lead), and
`ScaleTicketModal` currently receives no `myRole` prop at all, so that is the
one piece of new plumbing.

**`capOverride` is still excluded from the denominator.** A driver dragging a
compartment handle down is exactly what this metric should catch, so it reduces
actual, never available.

**Multi-product (§5, TEST D)** needs no special handling: `allocateWithCaps`
already water-fills across heterogeneous per-compartment densities and caps.
`limiting_factor` is derived by re-running the solver once with the weight
ceiling lifted — if capacity doesn't move, the binding constraint was volume
(and the snapshot names which compartments were full); if it does, the binding
constraint was weight.

## 4a. The legal limit as a second, company-wide goal

Per explicit direction, the gap between the company target and the legal limit
is not waste and is not a driver's problem — it is **the company's own
improvement goal, and it is a network-effect metric.**

The reasoning, in the user's own framing: a company running one user can only
safely target 79,500, because the API/temp reading it plans against may be
hours old. A company with 25 users in an area can safely target 79,750, because
somebody is updating that terminal's reading constantly — you are always loading
right behind someone who just fed the app a current number. Denser usage →
fresher readings → tighter density prediction → less margin needed → a higher
target that is *still safe*.

**Headroom** is therefore a first-class fleet metric:

```
headroom_gallons = capacity_at_legal_limit − capacity_at_company_target
```

Computed per load from the same snapshot (re-run the solver with the legal
ceiling substituted for the target ceiling — one extra solve, no new inputs) and
summed per period. It answers "what would this fleet haul if it could safely
target the legal limit," which is a much better argument for adding users than
any driver score.

**This has a real statistical basis already in the database.**
`terminal_temp_bias` accumulates a genuine Welford running mean and variance of
prediction error per (terminal, hour bucket, month): `sample_count`,
`mean_error`, `m2`. That is precisely "how well do we predict this terminal, and
how confident are we in that." A target-raise recommendation does not need a new
measurement system — it needs to read a table that has been accumulating the
right data all along. (Columns are per CLAUDE.md's own architecture notes;
`terminal_temp_bias` is one of the live-only tables with no migration file, so
verify against `information_schema.columns` before building on it.)

**Phase 1 scope: measure and show headroom. Nothing else.** Specifically:

- `load_capacity_snapshot` stores `capacity_at_legal_gallons` alongside
  `available_gallons`, so headroom is queryable historically.
- The fleet view shows headroom in gallons next to unused capacity, framed as
  opportunity, never as a shortfall.
- No driver ever sees it. It is not in any driver-facing number, and a driver's
  utilization is never affected by it.

**Explicitly not built in Phase 1, and flagged rather than guessed:** an engine
that recommends (or applies) a target raise based on local user density and bias
maturity. That is a real feature with a real safety consequence — raising a
company's target gross weight moves every driver closer to an overweight ticket —
and it needs actual accuracy data behind the threshold, not a plausible-looking
formula. §10 applies with full force: the app can present evidence that a raise
is justified; it must never raise a target automatically, and the raise stays an
explicit admin action.

`LEGAL_GROSS_LBS = 80000` already exists as a constant in `page.tsx` and
`LoadReportModal`; Phase 1 reuses it rather than introducing a second one.
Per-state and permitted limits above 80,000 are a real refinement and a real
future need, but out of scope here — noted so the column is `legal_gross_lbs`
per load, not a hardcoded assumption baked into the math.

## 4b. Target vs. legal limit as the driver's denominator — decision record

Raised as a genuine open question after §4a was written. Worked through here
rather than settled by preference, because it determines what every driver sees.

**First: it is not a fork.** The snapshot already stores both
`available_gallons` (at target) and `capacity_at_legal_gallons` (§4a), so both
utilization numbers cost one extra division each. Storing both is free and
non-committal. The only real decision is **which one a driver is shown**, and
that is a display choice that can be flipped later without a migration or a
recompute.

### The case for the company target

**1. 100% has to mean something a driver can actually do.** With the target as
the denominator, 100% means "I loaded what I was told to load" — reachable,
repeatable, and true for every driver in the company. With the legal limit as
the denominator, 100% means "I loaded to 80,000," which the company has
explicitly instructed them *not* to do by setting a target below it. Rewarding a
number that company policy forbids is incoherent, and §19 already rules out
incentives that push against operational restrictions.

**2. Nobody can ever score 100%, and the shortfall is arbitrary.** Under a legal
denominator, every driver is permanently capped at `target_payload ÷
legal_payload`. Modeled on two real-shaped combos in the same company:

| | tare | vs. target | vs. legal | best possible vs. legal |
|---|---|---|---|---|
| Driver A | 34,000 | 99.56% | 98.48% | **98.91%** |
| Driver B | 32,000 | 99.58% | 98.54% | **98.96%** |

Both drivers performed essentially identically (99.56 vs 99.58 against target).
The legal denominator preserves that, but caps each at a *different* ceiling,
and the heavier tractor gets the lower one. The effect is small — 0.05
percentage points — so this is a minor argument, not a decisive one. But it
points the wrong way: §7 is explicit that equipment differences must not decide
who wins, and this bakes a small equipment handicap into the denominator.

**3. §21's "100% or nothing" problem gets worse, not better.** A legal
denominator has no natural top, so any qualification threshold becomes an
indirection — "95% of legal" is really "99.4% of target," which no driver will
reason about correctly at a rack at 4am. A target denominator gives 100% an
obvious, communicable meaning.

**4. Solo tier only works this way.** A solo driver sets their own target, so
under a target denominator the number is self-referential — "am I hitting my own
mark?" That is the right question for a self-improvement tool with no bonus
attached. Under a legal denominator a solo driver's score is a permanent
sub-100 they cannot move without exceeding their own chosen target.

### The real argument against the target — and why it is actually a feature

Raising the company target (the entire point of §4a) **mechanically lowers every
driver's utilization overnight**, through no fault of theirs. 79,500 → 79,750
drops everyone ~0.3% for doing exactly the same work. Left unexamined, that
makes drivers structurally opposed to the raise ProTankr exists to enable —
a serious perverse incentive.

But it resolves cleanly, because of what §4a's premise actually claims: the
target only rises *when denser usage has made it safely reachable*. If that
premise holds, a driver hitting 99% at 79,500 also hits ~99% at 79,750, because
the tighter prediction is precisely what allowed the raise. Scores should not
drop.

So if fleet utilization drops after a raise **and stays down**, that is not a
driver problem — it is evidence the raise outran the data. **Utilization against
the target doubles as the feedback signal on whether a target raise was
justified.** That property only exists under the target denominator; against the
legal limit, a raise looks like unambiguous improvement whether or not it was
safe.

This does need handling in the UI: the snapshot records the target each load was
measured against, so a period spanning a target change can say so rather than
showing an unexplained step down.

### The one thing the legal limit uniquely gives you

A universal denominator. Every company's target differs, so "97% of target" is
not comparable across companies — but "94% of legal" is. That is the only way to
ever produce an industry-benchmark number for §28's ROI story ("the average
ProTankr fleet runs at X% of legal"). Worth having.

That is a **fleet and marketing** metric, though, not a driver metric — which is
exactly where §4a already put the legal limit. Storing both covers it.

### Decision

- **Driver-facing utilization: against the company target.** 100% is reachable
  and means "on target."
- **Both stored per load**, so legal-based utilization and headroom are always
  queryable historically.
- **Fleet view shows both**: utilization vs. target (are our drivers
  executing?) and vs. legal (what is the total opportunity?). The gap between
  them is the §4a headroom story, and it is the number that argues for adding
  users.
- **A driver never sees the legal-based number.** Their score must not move
  because of a company-level decision they had no part in.
- Reversible: flipping the driver-facing denominator later is a display change
  over data that already exists.

## 5. How external constraints are represented

Three entry points into `load_constraints`, cheapest first:

1. **Automatic** — an `out_of_allocation` outage report by this driver, for a
   product on this load, at this terminal, still inside its clearing window,
   raises a `terminal_cap` row with `constrained_gallons = null`.
2. **One tap on the Complete screen** — `CancelLoadSheet` already has a "Report
   Terminal Issue" flow with a product picker. A "Capped below capacity" choice
   there writes the constraint with an optional gallon figure.
3. **Dispatch-set** — a cap attached to the driver from the Dispatch tab. Phase
   3 at the earliest; the table is shaped for it now.

**Effect on the measurement:** a constraint with a gallon figure sets
`effective_available_gallons` to it, and utilization is computed against that
(TEST G: 7,480 ÷ 7,500 = 99.7%). A constraint *without* a figure sets
`eligibility = 'excluded_constraint'` — the load still shows its raw numbers on
the driver's own history with the reason attached, but it is excluded from
period aggregates rather than counted as a shortfall. §11's "must not be
penalized" is satisfied by exclusion when the cap can't be quantified, not by
guessing at one.

## 6. How driver utilization is calculated

Per load: `utilization_pct = actual_gallons ÷ effective_available_gallons × 100`.

**Over 100% is legitimate and is not clamped.** With the company target as the
denominator (§4), a load that comes in above target but below the legal limit is
a real, legal, well-executed load — the recap card already colors exactly that
band green today. Clamping it to 100 would erase the difference between hitting
the target and safely beating it, which is the behavior this system is supposed
to reward. Utilization is only suspect above the *legal* ceiling, and that is a
gate, not a score (below).

Per period: **gallon-weighted, not a mean of percentages** —
`Σ actual ÷ Σ effective_available` across eligible loads only. Averaging
per-load percentages would let a string of tiny loads swamp the real number.
Both the numerator and denominator are shown alongside the percentage (§15/§16
show gallons, not just a ratio), and `Σ unused_gallons` is the headline for the
fleet view (§16: "the most important number may be 253,000 gallons left
available").

**Safety is a gate, never a term (§10).** `eligibility` is set to
`excluded_safety` when actual gross exceeds the **legal** limit (not the company
target — exceeding a target is legal and fine) or any compartment exceeds its
configured cap. Excluded loads never contribute to a period
aggregate in either direction — a violation cannot raise a score, and per §10 it
also is not folded in as a penalty. It surfaces as its own count.

**No leaderboard (§17).** No ranking query, no top/bottom list, no
driver-vs-driver view is built. The fleet table is sorted by driver name.

## 7. How historical results stay stable (§23, TEST I)

`load_capacity_snapshot` is write-once. The engine carries a `CALC_VERSION`
constant; every row records the version that produced it. A change to the solver
bumps the constant, which affects new loads only. Recomputing an old load is an
explicit, admin-triggered, audited action that writes a new row with the new
version and preserves the old — never an in-place mutation, and never automatic.

TEST I is a real test in Phase 1: complete a load, record its result, bump
`CALC_VERSION`, re-read, assert unchanged.

## 8. Minimum driver input

**Today, unavoidably: API and temperature per product** — already the only
completion input, already required by the existing weight math, so utilization
adds **zero new mandatory input**.

**The honest gap (§0.2), and the decision made:** without a separate
actual-gallons capture, `actual` always equals `plan`. **Decided: ship Phase 1
as plan-vs-capacity, labeled honestly** — `actual_gallons_source = PLANNER`. No
new driver input at all.

What this measures, correctly and defensibly:

- a compartment cap dragged down before loading (`capOverride`),
- a Plan Review per-compartment gallons reduction (`loadingGallonsOverride`),
- a company target set below the equipment's legal capability,
- capacity lost to product density and temperature on the day.

What it is blind to: any difference between what was planned and what actually
came out of the rack. There is no such signal in the system today.

**Naming is load-bearing here, and §14's mockup has to change.** The driver
screen cannot read `7,760 GAL LOADED` — that would be a claim the data does not
support. Phase 1 copy is `PLANNED` against `AVAILABLE`, and the metric is
**Plan Utilization**, not Payload Utilization. The same applies to the fleet
view: "gallons left available" is gallons the *plan* left available. Renaming to
"Payload Utilization" happens when, and only when, a real actual arrives.

The schema does not change when that day comes: `actual_gallons_source` exists
from day one, so switching a company (or the whole app) from `PLANNER` to
`DRIVER` or `RACK_TICKET` is a source swap plus a copy change, not a migration.
Loads keep their own source, so history stays interpretable across the cutover
rather than silently mixing two different meanings under one label.

**Rejected for Phase 1, recorded so it isn't relitigated blind:** re-adding a
per-compartment BOL gallons entry on the Complete screen. That is the
"Verify Against BOL" step built 2026-08-26 and deliberately removed 2026-08-27
as unnecessary; bringing it back is a real product decision about driver burden,
and it is the natural Phase 2+ upgrade path if plan-vs-capacity turns out to be
too narrow in practice.

## 9. Phase 1 contents

> **Status: built and verified (2026-09-05).** Both migrations are written but
> NOT yet applied to the live database. They were, however, actually executed
> against a throwaway PostgreSQL 16 instance with a stub of the live schema --
> so "they apply cleanly" is a fact here, not a hope. See "Phase 1 verification"
> at the end of this document for exactly what was and was not proven.


Measurement only. No incentive UI, no money, no thresholds (§31).

1. Migration A + B + C (new tables, RLS, indexes) — additive, nothing dropped.
2. `lib/capacity/computeAvailableCapacity.ts` — pure, no React, no Supabase;
   takes the snapshot inputs, returns available gallons + payload lbs +
   limiting factor. Unit-testable, and the home for `CALC_VERSION`.
3. Second `usePlanRows` call in `page.tsx` against persisted caps →
   `availableGallons`, threaded into `useLoadWorkflow`.
4. `begin_load` payload extended with the capacity snapshot; `complete_load` (or
   a new `record_load_utilization(p_load_id)` RPC, called the same
   fire-and-forget way `calculate_load_points` is today) writes
   `load_utilization`, stamped `actual_gallons_source = 'PLANNER'`.
5. Automatic `out_of_allocation` → `load_constraints` linkage.
6. Safety/eligibility gating.
7. Read helpers: per-driver period aggregate, per-company period aggregate,
   per-company headroom-to-legal (§4a).
8. Backfill decision: per §26, **do not** synthesize `available_gallons` for
   historical loads from the old benchmarks. Existing `load_points` data is
   exported to a `legacy_load_points` archive table and left out of the new
   metric entirely.
9. Validation against TEST A–K, with A/B/C/D/E/F runnable as pure unit tests on
   `computeAvailableCapacity` (no DB, no session) — which matters, because this
   session has repeatedly had no authenticated login available for live checks.

Legacy removal (§1) lands **after** Phase 1 is validated, as its own migration,
so a rollback during Phase 1 doesn't leave the app with no incentive system at
all.

---

## Decisions made

All resolved by explicit direction. Nothing is blocking Phase 1.

1. **Actual gallons** — Phase 1 ships plan-vs-capacity, labeled as such, with
   `actual_gallons_source = PLANNER` and the metric named "Plan Utilization"
   until a real actual exists (§8).
2. **Tare** — stays driver-entered and ungated. The driver weighs the truck; the
   weight ticket is the check if a company doubts a number (§4).
3. **The driver's 100% mark** — the company target, not the legal limit. Both
   are stored per load; the legal-based number is a fleet metric only, and the
   choice is reversible as a display change (§4b).
4. **The target itself** — moves to company level, staff-gated, fleet tier only;
   solo keeps setting its own via the same admin check (§4).
5. **The legal limit** — a company-wide second goal driven by user density.
   Phase 1 measures headroom; it never auto-raises a target (§4a).

Deliberately deferred, recorded so they are not rediscovered from scratch: a
target-raise recommendation engine built on `terminal_temp_bias` maturity (§4a),
per-compartment BOL gallons entry (§8), per-state and permitted legal limits
above 80,000 (§4a), and dispatch-set caps (§5).

---

## Phase 1 verification (2026-09-05)

### Proven

**24 unit tests, no DB and no session** (`npm test`, node's built-in runner with
native type-stripping -- no new dependency). Covers the spec's TEST A-K plus the
anti-gaming rules: capacity moves correctly with tare, product density,
temperature and product mix; underload/near-max arithmetic; a quantified
external cap re-baselines while an unquantified one excludes; safety violations
score nothing and are excluded from aggregates rather than penalised;
above-target-under-legal exceeds 100% and stays eligible; a driver's capOverride
cannot shrink their own denominator; headroom floors at zero.

**Both migrations actually run.** A throwaway PostgreSQL 16 was stood up with a
stub of the live schema (only the tables, columns and helper functions the
migrations touch, shaped from this repo's own migrations), and both files
applied with `ON_ERROR_STOP=1` and no errors. This is a materially stronger
check than this project usually gets before an SQL-editor paste.

**`record_load_utilization` exercised end to end** against seeded data -- a
3-compartment diesel load, 6,300 gal actual against 6,517.12 available:

| Check | Result |
|---|---|
| Utilization arithmetic | 96.67%, 217.12 gal unused -- matches the engine exactly |
| `available_payload_lbs` | 45,500 -- exactly `79,500 − 34,000 tare` |
| Idempotent | second call updates in place, one snapshot row |
| Snapshot inputs | server-derived (tare 34,000, target 79,500, real caps and API) |
| Quantified cap | denominator re-baselined to 6,400, utilization 98.44% |
| Unquantified cap | `excluded_constraint`, no score invented |
| Over legal gross | `excluded_safety` **even with a forged client capacity of 1 gal** |
| Compartment over cap | `excluded_safety` |
| Out of Allocation auto-link | attaches, excludes, does not stack on rerun |
| Report older than 12h | correctly does not attach |
| Another driver's load | `unauthorized` |
| Direct client INSERT | blocked by RLS |

`tsc --noEmit` and a full `next build` both clean.

### Found while verifying, and fixed

- **The solver could never return its own upper bound.** A bisection that only
  raises its lower bound converges from below, so a load that genuinely filled
  every compartment reported 99.99997 of 100 gal -- downstream, a phantom
  fraction of a gallon "left unused" and a utilization of 100.00002%.
  `solveMaxGallons` now returns total volume directly when the full tanks fit
  under the weight ceiling, which is the exact answer. This slightly improves
  the Planner's own volume-limited plans too.
- **A `SELECT INTO` that matches no row nulls its targets** rather than leaving
  them alone, so a deleted or missing combo would have silently nulled the
  company target and taken every downstream number with it. Now assigned via a
  scratch variable with an explicit fallback.
- **The OOA lookback's upper bound turned out to be load-bearing.** Requiring
  the report to precede the load is not tidiness: an excluded load can't drag a
  driver's average down, so without it a driver could file a report after a poor
  load to retire it from their own numbers.

### Not proven, and why

- **Nothing has run against the live database.** This container has no
  `.env.local`, so there was no authenticated session and no Supabase access at
  all this session. The stub schema was built from this repo's migrations, and
  the migrations folder is known to lag the live database -- so the columns the
  migrations reference still need the usual `information_schema.columns`
  spot-check before the SQL-editor paste.
- **No real load has been measured.** The end-to-end run used seeded rows, not
  a load completed through the app.
- **Nothing displays the number yet.** That is Phase 2, deliberately (spec
  section 31: build the measurement foundation before the UI).
- **The staff-gated target field was not exercised with a real driver-role
  login** -- the same limitation this project has documented repeatedly for
  role-matrix checks.

---

## Phase 2 (driver experience) — shipped 2026-09-05

Spec section 32: the load result, utilization, unused capacity, history,
current-period performance, and an explanation of constraints. Kept simple.

**The Planner card.** A utilization card takes the legacy points card's slot —
this-load % on the left, period average on the right, with a sub-line reading
`7,760 of 7,820 gal available planned · 60 gal left`. It **replaces** the points
card rather than sitting beside it: the spec is explicit that an old incentive
system must not run visibly alongside the new one, and two competing numbers for
the same load is exactly that. The legacy points code and data stay fully intact
underneath, so a rollback is still real; the driver just never sees both.

**Copy.** "PLANNED", never "LOADED" — actual gallons are still copied from the
plan. The wording lives in `UTILIZATION_METRIC_LABEL` / `UTILIZATION_ACTUAL_WORD`
so the rename to "Payload Utilization" is a two-constant change the day a real
measured actual exists.

**Excluded loads are explained, never blank.** A safety exclusion shows its
reason in red; an external cap shows it in the muted tone — the driver is told
what happened, and an external cap never reads as their fault (sections 11, 22).

**Reports.** A `Plan Utilization` tile next to My Loads opens a period summary
(percentage, eligible loads, available / planned / left) plus a per-load history
of date, planned-of-available, and percentage. Excluded loads appear in the list
with their reason and are surfaced as their own count — never folded into the
score in either direction. **No leaderboard**, no ranking, nothing about other
drivers. It follows the existing driver picker, so admin/dispatch see whichever
driver they've selected.

**One period, one place.** `useUtilizationPeriod(companyId)` resolves the window
for both surfaces, so the Planner and Reports cannot quote different numbers. It
uses the company's configured report period when one exists and a rolling 30 days
when it doesn't — measurement must not require configuration (TEST K), so it
never gates on `incentive_settings.enabled`.

### Found and fixed while building

**Phase 1 had shipped two copies of the period aggregate** — `aggregateUtilization`
in the pure engine and a near-identical `summarize` in the read hook. Phase 2's
whole display was about to be built on the second copy. Collapsed to one
implementation over a minimal shared row type that both the engine's results and
`load_utilization` rows satisfy. This is the exact drift class this repo has been
bitten by before (`CustomSelect`/`ServiceTypeManager`; the centering bug fixed in
one file and not its twin), caught before it could diverge rather than after.

### Verified

- **25 unit tests** (`npm test`), including a new one pinning the aggregate's
  behavior on database-shaped rows: PostgREST returns numerics as strings, and a
  bare `+=` would concatenate rather than add — turning a fleet total into
  nonsense silently rather than throwing.
- **The read hook's literal SELECT was run against a real Postgres** (throwaway
  instance, migration applied, seeded rows) — every column resolves. A select
  string is precisely what `tsc` cannot check.
- **The driver-facing numbers were computed from those same rows**: 90.12%
  gallon-weighted where a naive mean of percentages would have flattered it to
  95%, with the externally-capped load correctly excluded from the totals while
  still counted for the "1 load is not counted" line.
- `tsc --noEmit` and `next build` clean.

### Not verified

No live session again (no `.env.local` in this container), so nothing was
clicked through and the migrations still have not been applied to the live
database. The card's own layout in a real browser, and the behavior for a real
driver-role login, remain unverified — the same gap this project has documented
repeatedly.
