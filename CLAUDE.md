# ProTankr — Project Context

Next.js/TypeScript/Supabase PWA for bulk liquid transport drivers, being converted
to a native app (iOS + Android via Capacitor) with a subscription model
(RevenueCat for IAP), sold in both app stores.

Dark #111111 theme, inline React styles. Prefer complete replacement files over
diffs when editing — VS Code edits sometimes don't write to disk, causing git to
miss changes, so always confirm a change actually landed rather than assuming it did.

## Product direction

Splitting into two tiers:
- **Basic (solo, tier 1):** individual driver tracks their own equipment/spares,
  no sharing.
- **Fleet (add-on, tier 2):** multi-driver sharing, status visibility across
  drivers, admin-managed. Full build spec below (§ Fleet Tier — Build Spec).

## Fleet Tier — Build Spec (recorded 2026-07-29, not yet scoped into sprint work)

Full spec pasted by user 2026-07-29. Nothing below is built yet — this is the
reference doc for when Fleet tier work actually starts. Cross-check against
"Architecture reality" above before touching schema, as always.

### Equipment sharing
- Service/wash/scale history, inspections, attachments travel with the
  **equipment**, not the driver — visible to all drivers + lead drivers
  (with attribution), so slip-seat drivers see prior condition notes. Leads
  oversee.
- Sensitive equipment data (purchase price, lease terms, insurance claims)
  needs an **admin-only field**, separate from the shared log.

#### Shipped 2026-07-31

Turned out most of "visible to all drivers/leads" was **already true** before
this pass — `service_records`/`wash_records`/`weight_records` RLS has always
been plain company-wide (`company_id = get_active_company_id()`, no role
check at all, matches how `trucks`/`trailers` themselves already work per
"Key existing infrastructure" above), so any company member could already
read any equipment's logs. The only actual gap was **attribution**: all
three tables already had a `created_by` column populated on every insert
(confirmed via `SoloEquipmentModal.tsx`/`WeightRecordModal.tsx`'s own insert
calls), but `RecordHistoryModal.tsx`/`ScaleHistoryModal.tsx` never selected
or displayed it. Fixed by adding `created_by` to each modal's select +
resolving it via the existing `get_display_names_full` RPC (same one
`app/admin/page.tsx` already uses) — shows as "Logged by {name}" under each
expanded row.

`equipment_attachments` (Binder/DocHub permit documents) uploader attribution
was **attempted, then reverted** this same pass — its insert call sites in
`DocHub.tsx`/`BinderModal.tsx` never captured an uploader at all, so I wrote
`uploaded_by` into both selects/inserts plus a tooltip, but a direct
PostgREST check (`select id,uploaded_by from equipment_attachments`) came
back `42703 column does not exist` — this table has no migration file at all
(confirmed via repo search, another migrations-lag instance) and its live
shape doesn't have this column yet. Since that would have 400'd every doc
list/upload silently (neither hook checks the Supabase response's `error`),
**all of it was reverted back to the pre-pass state** rather than shipping
broken reads/writes on a working feature overnight. `DocHub.tsx`'s
`AttachmentRecord` type has a comment marking exactly what to re-add (both
selects, both inserts, the `BinderModal.tsx` tooltip) once the migration
below has actually run — don't rebuild from scratch, the code already
existed and was verified compiling, just re-apply the same diff.

Sensitive equipment data is new (not a revert): `equipment_sensitive_data`
table (same migration file below), `truck_id`/`trailer_id` XOR pattern
matching `service_records`, RLS **strictly `role = 'admin'`** (not
admin+lead, unlike everything else equipment-related — this is the one
piece of equipment data the spec calls out as not belonging in the shared
log). UI is a collapsed "Sensitive Info (admin only)" section inside
`TruckModal`/`TrailerModal` (`lib/ui/driver/EquipmentDetails.tsx`, new
`SensitiveInfoSection` component), gated on a newly-threaded `myRole` prop,
visible only for `myRole === "admin"` and only for existing (non-new)
equipment. Also confirmed via direct PostgREST query not to exist live yet
(`404 PGRST205`) — but unlike attachments, this is a **brand-new,
collapsed-by-default section with no prior working behavior to regress**,
and its save path does check/surface the Supabase error via `Banner`, so an
admin who opens it before the migration runs gets an honest error message,
not silent data loss. Left shipped as-is.

**Migration applied 2026-07-31** (user ran it in the Supabase SQL editor):
`supabase/migrations/20260731000000_equipment_sharing_attribution.sql`
(adds `equipment_attachments.uploaded_by` + creates `equipment_sensitive_data`).
The attachment-attribution diff (`DocHub.tsx`/`BinderModal.tsx`) was re-applied
the same day and live-verified — the Docs modal's `uploaded_by` select renders
with no error. `equipment_sensitive_data` also live-verified end-to-end: the
admin-only "Sensitive Info" section on a truck accepts a Purchase Price save
and reads it back correctly after reopening the modal.

**Explicitly NOT done, flagged for later**:
- **Inspections** — confirmed via repo-wide search that this doesn't exist
  as a feature *at all* (no table, no UI, only an unrelated string match).
  Unlike service/wash/scale, this needs to be designed from scratch, not
  just shared — a real net-new feature, deliberately out of scope for this
  "share what already exists" pass.
- Edit/delete permission gating on equipment logs. `RecordHistoryModal.tsx`'s
  own header comment already flags this as an unresolved fleet-tier
  follow-up ("driver has full read/write/delete control here... gating this
  to admin-only is a fleet-tier follow-up, not implemented yet") — the
  matrix only specifies who can *view* logs, not the edit/delete
  granularity, and that's a real product decision (can any driver edit/
  delete *any other* driver's service record?), not something to guess.
  Left exactly as-is.
- `weight_records` also has no migration file (same lag pattern), but its
  `created_by` column was confirmed live via a direct PostgREST query
  (200, not 42703) before relying on it — unlike `equipment_attachments`,
  this one checked out.

### Fleet-wide underloading dashboard

**Shipped 2026-08-09.** Scope decisions made (asked, not guessed) before
building, since the original spec was a single line:
- **Metric**: reuses the already-computed Incentive System
  `load_points.recovered_gallons` directly — not an independent
  legal-max-vs-actual calculation. Cheap (pure aggregation UI, no new
  calc engine) but means this dashboard only shows real numbers for
  companies that have turned Incentives on and set at least one product
  benchmark; otherwise it shows an explicit "not enabled" message rather
  than a misleading zero.
- **Audience**: admin + lead + dispatch — wider than Incentives/Payroll's
  admin-only gating, matching the "fleet-wide cross-driver visibility"
  precedent already used for Fleet Cards/Credentials. This needed a new
  additive `load_points` SELECT policy
  (`supabase/migrations/20260809000000_load_points_staff_read.sql`,
  applied) since the existing `load_points_admin_read` policy (from the
  original Incentive System migration) is admin-only, confirmed via
  reading that migration directly — lead/dispatch would otherwise get
  zero rows under RLS.
- **Placement**: new "Underloading" button in `app/admin/page.tsx`'s
  header, same row/pattern as Fleet Cards/Credentials/Incentives/Payroll.

`app/admin/UnderloadingDashboardModal.tsx` (new) — deliberately simpler
than `PayrollReportModal.tsx`: no CSV export, no per-load edit/
recalculate, no per-load drill-down (that's what Payroll Report is for;
this is the fleet-level pitch/health-check view, not a payroll audit
tool). Date range is a simple lookback-days chip row (7d/30d/90d/All —
the same pattern already duplicated in `MyLoadsModal.tsx`/
`ScaleHistoryModal.tsx`/`RecordHistoryModal.tsx`, no shared component
existed to import) rather than the Payroll Report's pay-period picker,
since this shouldn't require pay-period settings to be configured just
to show a number. Headline stats (total recovered gallons, loads, avg/
load) above a per-driver leaderboard table (sorted by gallons desc, not
alphabetical like Payroll's driver list — a leaderboard framing fits "the
number that justifies the subscription" better than an alphabetical
roster).

**Live-verified 2026-08-09**: typecheck clean. Button renders correctly
in `/admin`. Opened the modal against the same demo company's real
Incentive System test data from earlier this session (edited/recalculated
multiple times that same pass) — headline shows 1,800.0 recovered
gallons / 1 load / avg 1800.0, per-driver row matches ("Test Testerson,
1 loads, 1800.0 gal"). Confirms the new `load_points_staff_read` RLS
policy change didn't need a role switch to verify reads (this session's
signed-in user is already company admin, which already had read access
before this policy — the *incremental* lead/dispatch grant itself
wasn't separately re-verified with a non-admin role, same category of
gap as this session's other role-matrix checks that could only be
proven architecturally sound, not empirically, without a second live
non-admin account). No console errors. Date-range chips (7d/30d/90d/All)
all functional — didn't change the figures for this dataset since the
test load falls within all four ranges.

**Not built** (out of scope for this pass, no spec existed beyond the
one-line description): no trend-over-time chart, no per-terminal or
per-product breakdown, no export. If the dashboard needs more than a
snapshot + leaderboard later, that's a separate scoping conversation.

### Terminal card / credential management (fleet-wide)
- Fleet-wide view of who's carded where, filterable by terminal (so dispatch
  doesn't send an uncarded driver).
- ~~**Priority terminal flagging**~~ — **removed 2026-08-05, see below.**

#### Shipped 2026-08-01 (fleet card visibility only)

`app/admin/FleetCardsModal.tsx` (new) — "Fleet Cards" button in the admin
page header, visible to `admin`+`dispatch` (mirrors the Loads button's
gating). Pick a terminal (search over `terminals`), see every company
driver's card status there — name + computed expiry state (via the same
`cardStateFor` used by the Cards tab), color-adjusted for a dark background
(`cardTheme.ts`'s `EXP_COLOR` assumes the light pearl card-wallet
background; reusing it here directly would have made "valid" render as
near-black-on-near-black — caught before it shipped, see `DARK_EXP_COLOR`
in that file). Deliberately status-only — doesn't read/show
`card_number`/`pin` (those stay in `user_terminal_cards`, untouched).

Migration applied 2026-07-31: `supabase/migrations/20260801000000_fleet_terminal_card_visibility.sql`
adds one new, purely additive SELECT policy on `terminal_access` for
admin+dispatch across the company — doesn't drop/replace whatever policy
already exists there (unknown exact shape, no DB access to check). Live-
verified post-apply: terminal search + per-terminal driver card list both
render real data with no errors. Still only verified for the *same-user*
case (the one test company available has a single member, so cross-driver
visibility itself is architecturally sound but not empirically confirmed
the way the dispatch role's load-visibility swap was) — worth a real check
with a second driver in the company.

#### Removed 2026-08-05

Priority terminal flagging was designed (2026-08-01) and built (2026-08-03)
as a customizable per-terminal training checklist — `terminal_checklist_items`/
`terminal_checklist_progress` tables, `toggle_terminal_checklist_item`/
`record_terminal_checklist_load` RPCs, `TerminalChecklistEditorModal.tsx`
(admin), `TerminalChecklistModal.tsx` (driver-facing overlay on terminal
select), and a `FleetCardsModal.tsx` progress readout. All of it removed
per user direction during the fleet-tier spec reconciliation pass — terminal
card management moved to simple active/inactive/expiring status sorting
(already how Cards tab / `FleetCardsModal` work) rather than a
star/flag-based workflow, making the whole checklist concept vestigial
before it ever reached the live database (the migration was still queued,
never applied). Confirmed via repo-wide search that no references remain.
If a driver-training/carding-progress feature is wanted again later, don't
resurrect this design uncritically — it was never validated against real
usage.

### Onboarding
- Replace/rework the existing guided tour with short video clips. **Blocked
  on content** — needs actual video assets supplied/recorded before this
  can be scoped or built; not started.
- ~~Fleet training mode: new drivers inherit the fleet's terminal
  history/presets instead of starting cold.~~ — **resolved 2026-08-09, no
  build needed.** Confirmed with the user: terminals were never
  company-specific to begin with — the star/"frequent" mechanism is
  purely a personal convenience for a driver to avoid searching the full
  city/terminal catalog, and every driver already has access to the
  complete terminal catalog regardless of company or tenure. There's
  nothing for a new fleet driver to be missing that "inheriting" would
  fix — the existing architecture already covers this.

### Cross-company reading network
- No new UI — temp/API readings already update silently across companies;
  keep it invisible/passive, not a per-driver alert. (This is the existing
  network-effect feature described at the top of this doc, not something new.)

### Incentive system ("Recovered Gallons")

**Concept**: drivers earn points for loading closer to true legal capacity
instead of conservatively. Points cap at the legal weight limit — overloading
has no upside, only risk. Normalizes fairness between long-haul (fewer
loads/day) and short-haul (more loads/day) drivers.

**Setup**: off by default, company admin toggles on in company profile.
Company sets a benchmark **gallons** figure per product, company-wide (not
per equipment class — assumes all equipment handles up to the legal limit).
Manual entry only in v1, no benchmark versioning/history. Benchmark gallons
convert to a reference weight via a **standard industry density table per
product** (not company historical average — avoids chicken-and-egg data
problem). Company-specific density override is a possible later addition,
not v1.

**Single-product calc**:
1. Convert benchmark gallons → weight using *today's* actual API/temp-derived
   lbs/gal (not the static reference density — this is the point of tying it
   to the existing temp/API system).
2. Actual weight = actual gallons × today's lbs/gal.
3. Recovered weight = actual weight − benchmark weight (at today's density).
4. Recovered gallons = recovered weight ÷ today's lbs/gal.
5. Cap: stops accruing at 80,000 lbs GVW (configurable per company).
6. Floor: negative recovered gallons → 0, never negative points.

**Split-load calc (finalized)** — per compartment:
1. Compartment's % share of total load gallons.
2. That product's benchmark gallons → weight at today's density.
3. Prorated benchmark weight = that % of the benchmark weight.
4. Prorated actual weight = that % of total actual load weight (all comps
   summed).
5. Recovered weight = prorated actual − prorated benchmark.
6. Convert to gallons via that product's today's lbs/gal.
7. **Floor each compartment at 0 individually** — never net one compartment's
   shortfall against another's surplus.
8. Sum all compartments' recovered gallons = load total.

Worked example is in the original spec message if the math needs re-deriving
later (regular 8,500gal/diesel 7,600gal benchmarks → ~470 total points on a
1,200gal regular / 7,000gal diesel load).

**Data model** (not yet migrated):
- `product_benchmarks`: `company_id, product_id, benchmark_gallons, reference_density, updated_at`
- `incentive_settings`: `company_id, enabled bool, weight_cap_lbs default 80000 editable`
- `load_points`: `load_id, driver_id, company_id, product_id, compartment_index, benchmark_gallons_used, actual_gallons, density_at_load (snapshot -- store, never recompute later), recovered_gallons, recovered_points, created_at`

**UI behavior**: points calculate silently after submit (not live per-keystroke
— avoids turning loading into a real-time optimization game, which cuts
against the safety-first design intent). Simple "You earned X points on this
load" confirmation after submit.

**Payroll / payout**:
- Points→dollars conversion is entirely company-side, at whatever rate they
  pick. App has no payout calculator.
- Payroll report: pay periods are **company-defined** (settings: period type
  — weekly/biweekly/semi-monthly/monthly — + anchor day); admin picks from a
  dropdown of generated periods, not manual date entry.
- Table: driver, loads in period, total recovered gallons, total points, avg
  per load — expandable to per-load detail. Employee/payroll ID pulls from
  existing driver profile field.
- CSV export: driver name/ID, period, total points, blank "$ amount" column
  for admin's own rate.
- **Edit & recalculate**: loads editable after the fact (typo fixes, wrong
  compartment, etc). Recalc uses the *original* `density_at_load` snapshot
  unless the edit specifically corrects a bad density reading. Track edit
  history (who, old→new, timestamp) on the load. If points change after a
  report was already exported, flag that report **"stale"** (not invalid) —
  don't block or auto-regenerate.
- Overload disputes not handled by the app — the weight cap is the entire
  mitigation; company policy governs from there.

**Status (2026-08-02): core calc engine done, payroll report deferred.**
Built and queued (migration `20260802000000_incentive_system.sql`, not yet
applied — no live DB write access this session):
- `incentive_settings`, `product_benchmarks`, `load_points` tables + RLS
  (company-read, admin-write on settings/benchmarks; load_points has no
  direct client write at all — only `calculate_load_points` touches it).
- `calculate_load_points(p_load_id)` RPC — implements the finalized
  split-load formula verbatim (a single-compartment load is just the n=1
  case, no separate code path). Called fire-and-forget/non-fatal from
  `useLoadWorkflow.ts` right after `complete_load` succeeds, same pattern as
  `update_terminal_temp_bias`. No-ops silently if the company hasn't
  enabled incentives.
- `products.api_60` + `alpha_per_f` (already existing columns) turned out to
  **be** the "standard industry density table per product" the spec called
  for — no new density table was needed. `product_benchmarks.reference_density`
  is a snapshot of that computed at benchmark-set time, but is
  **informational only** (shown to the admin for context); the live calc
  always uses that load's actual observed density, never this snapshot.
  This also resolves the open question below about a company-specific
  density override — since the static reference isn't used in the math,
  there's nothing to override.
- `IncentiveSettingsModal.tsx` (admin-only, entry point next to Fleet Cards
  in `app/admin/page.tsx`): enable toggle, weight cap input, search-and-add
  per-product benchmark gallons (not a picker over the full granular
  catalog — most companies only ever benchmark a handful of products).
- Driver-facing confirmation: "You earned X points on this load" line in
  the planner's Load Summary card (`app/calculator/page.tsx`), populated
  from `LoadReport.recovered_points` — null/hidden whenever incentives
  aren't enabled for the company.

**Status (2026-08-04): payroll report shipped — Incentive System now
fully complete.** Migrations `20260802000000_incentive_system.sql` and
`20260804000000_payroll_report.sql` both applied 2026-07-31 (in that
order — the second requires the first since it adds a trigger on
`load_points` and reuses `calculate_load_points`):
- `payroll_reports` table — purely a "this period was exported" marker, not
  a stored report. The report itself (table + CSV) is always computed live
  from `load_points` for whatever period is selected. Admin-only RLS.
- `load_edit_history` table — one row per `edit_load_line()` call, logging
  who/when/old→new for whatever fields changed. Admin-read only (via the
  load's company), no direct client write.
- `flag_stale_payroll_reports` trigger (AFTER UPDATE on `load_points`) —
  whenever points get recalculated, any already-exported
  `payroll_reports` row whose period covers that load's date flips
  `is_stale = true`. Generic and automatic — doesn't care what caused the
  recalc.
- `recalculate_load_points(p_load_id, p_preserve_density)` — admin-gated
  (checked inside the function, not left to RLS, since this affects pay).
  `p_preserve_density = true` (default): re-prorates using each
  compartment's *existing* `density_at_load` snapshot and the edited
  `actual_gallons` — density itself never moves, per spec ("uses the
  original density_at_load snapshot unless the edit specifically corrects
  a bad density reading"). `p_preserve_density = false`: the edit did
  correct a bad density reading, so this just calls the existing
  `calculate_load_points` again for a full from-scratch recompute (it
  already derives density fresh from current `load_lines`).
- `edit_load_line(p_load_id, p_comp_number, p_actual_gallons, p_actual_lbs,
  p_density_correction)` — admin-only, updates `load_lines`, logs to
  `load_edit_history`, then calls `recalculate_load_points` with the
  correct preserve/correct flag.
- `app/admin/payPeriods.ts` (new, pure date math, no DB calls) —
  `generatePayPeriods()` generates weekly/biweekly/semi-monthly/monthly
  period boundaries from `pay_period_type` + `pay_period_anchor_date`, so
  the admin picks from a dropdown rather than typing dates manually, per
  spec. Semi-monthly's split day is clamped to 1–15 (the "A" half is
  always exactly 15 days; the "B" half absorbs whatever's left in the
  actual calendar month) — matches the standard 1–15/16-EOM convention
  when anchor day = 1, generalizes reasonably for other split days.
  Manually verified against several anchor/period-type combinations
  (including a semi-monthly year-boundary rollover) before wiring into the
  UI.
- `IncentiveSettingsModal.tsx` extended with pay period type + anchor date
  fields (the columns already existed on `incentive_settings` from the
  original migration; this is the first UI that actually writes them).
- `PayrollReportModal.tsx` (new, admin-only, entry point next to
  Incentives in `app/admin/page.tsx`): period dropdown, driver table
  (name, employee ID from the existing `profiles.employee_number` field,
  loads count, total recovered gallons, total points, avg per load),
  expandable to per-load and then per-compartment detail, inline
  edit-and-recalculate (gallons/lbs inputs + a "this corrects a bad
  density/API reading" checkbox controlling the preserve-vs-recompute
  path), CSV export (driver name/ID, period, total points, blank "$
  amount" column) which also inserts the `payroll_reports` marker row and
  clears any stale flag shown for that period.

**Full live verification pass, 2026-07-31** (all 5 queued migrations had
been applied via the Supabase SQL editor by this point; this is the
end-to-end check against real data, not just typecheck):
- Enabled incentives + saved two live product benchmarks (B100, ULSD) via
  `IncentiveSettingsModal.tsx` — save succeeded, no error, values persisted
  on reopen.
- Completed a real load with no matching benchmark: `calculate_load_points`
  ran with no error and no points banner (correct no-op, not a crash).
  Completed a second real load against the new ULSD benchmark: "You earned
  1785.4 points on this load" banner appeared with the exact expected math
  (actual gallons − benchmark gallons).
- `PayrollReportModal.tsx` picked up the real load correctly (1785.4 pts,
  1 load, matching avg), expandable to per-load and per-compartment detail.
- Edit-and-recalculate live-verified twice (`edit_load_line` →
  `recalculate_load_points` with `p_preserve_density = true`): each gallons
  edit correctly shifted total points by the expected delta.
- `flag_stale_payroll_reports` trigger live-verified: exported CSV once,
  then edited a load line again — the "this period was exported before,
  but points have changed since" banner correctly appeared on next open.
- Fleet Cards (`terminal_access` admin+dispatch policy) live-verified:
  terminal search + per-driver card status list both render real data, no
  errors.
- Equipment sharing attribution (`equipment_attachments.uploaded_by`) and
  the new `equipment_sensitive_data` table both live-verified: the Docs
  modal renders with no `42703`/`PGRST205` errors, and a Purchase Price
  saved via the admin-only Sensitive Info section read back correctly
  after reopening the modal.
- Net result: all 5 migrations (`20260730000000_dispatch_role_load_visibility`,
  `20260731000000_equipment_sharing_attribution`,
  `20260801000000_fleet_terminal_card_visibility`,
  `20260802000000_incentive_system`, `20260804000000_payroll_report`) are
  confirmed working end-to-end against live data, not just applied cleanly.
  Test artifacts left in the demo company from this pass (enabled
  incentives, B100/ULSD benchmarks, one edited load, a test Purchase Price
  value) were left in place rather than cleaned up, since this is the
  persistent demo/QA company, not customer data.

### Roles & permissions

**Pricing**: Base tier $100/mo = 1 admin seat + 4 seats of any non-admin
role. Additional non-admin seats $25/mo each. Additional admin seats priced
standalone, higher than $25/seat (e.g. $40-50 range) and **not** bundled with
4 more generic seats — avoids penalizing large multi-region companies needing
multiple admins but not more driver/dispatch seats. Role reassignment is a
simple dropdown on the admin page (promote driver → lead driver → dispatch).

**Permission matrix**:

| Area | Driver | Lead Driver | Dispatch | Admin |
|---|---|---|---|---|
| Own loads/planner | ✓ | ✓ | — | ✓ |
| Other drivers' loads | — | — | ✓ | ✓ |
| Own cards | ✓ | ✓ | — | ✓ |
| Other drivers' cards | — | — | ✓ | ✓ |
| Flag priority terminal cards | — | — | ✓ | ✓ |
| All company equipment (view/edit) | ✓ | ✓ | — | ✓ |
| Equipment logs incl. attribution | ✓ | ✓ | — | ✓ |
| Incentive benchmark settings | — | — | — | ✓ |
| Payroll report | — | — | — | ✓ |
| Own password vault | ✓ | ✓ | ✓ | ✓ |
| Others' password vaults | — | — | — | — |
| Role assignment | — | — | — | ✓ |

Key principle: **equipment is shared fleet property** (all drivers/leads see
it), **loads and cards are personal data** (only the individual + dispatch +
admin see them), **password vault is personal to every role including
admin** (nobody sees another user's vault, ever — no exceptions for role).

Note this permission matrix does NOT match the "Key existing infrastructure"
section's currently-hardcoded `role === "admin" || role === "lead"` checks
scattered across the app (see call-site list above) — those only distinguish
admin/lead from everyone else today; dispatch as a distinct role with its
own cross-driver-but-not-equipment-edit visibility is new and will need
those call sites (and RLS) actually reworked, not just a new role string
added to the enum.

#### Dispatch role — shipped 2026-07-30 (mechanics only, no billing)

Scoped down from the full spec above to just the role mechanics, per an
explicit decision to defer seat-based billing enforcement to a separate
Stripe/RevenueCat pass. Live-DB verification (4 queries the user ran)
confirmed `user_companies.role` is plain unconstrained `text` (default
`'driver'`) — adding `'dispatch'` needed zero column migration, just app-code
+ two RLS policy updates.

**New**: `lib/ui/driver/role.ts` — the first-ever shared `Role` type
(`"driver" | "lead" | "admin" | "dispatch"`) + `ROLE_LABELS` + `isRole()`
guard. Previously `role` was bare `string` (or `as any`-cast) everywhere,
which is exactly how the two invite-role dropdowns had already drifted out
of sync with each other (`app/admin/page.tsx`'s had driver/lead/admin;
`lib/ui/driver/EquipmentDetails.tsx`'s separate, second `InviteModal` had
only driver/admin, missing `lead`) — both now consistently offer all four.
`/api/admin/invite/route.ts` also gained real validation via `isRole()`
(previously accepted literally any string for `role`, no allow-list at all).

**Who gets what, concretely**: dispatch can now enter `/admin` and see the
Users/roster list (read-only — `MemberCard`'s existing `hideRoleDropdown`/
`hideRemove` props suppress the role-reassignment dropdown and Remove button
for non-admin viewers) and the per-member **"Loads"** button (opens the
existing, already-built `AdminLoadsModal` — read-only, reuses
`useLoadHistory(targetUserId)` unchanged). Dispatch does **not** get: the
Equipment/Terminals sections (now explicitly gated to
`admin || lead`, since they previously had NO section-level gate at all and
would have silently opened to anyone who passed the page-level entry check
once dispatch was added there), the "Set up planner →" full-impersonation
button, the invite button, or role reassignment. All of those stay
admin-only (or admin/lead-only for equipment), unchanged.

**Migration applied 2026-07-31**: `supabase/migrations/20260730000000_dispatch_role_load_visibility.sql`
swaps the `load_log`/`load_lines` "admins can read company member loads"
policies from `role IN ('admin','lead')` to `role IN ('admin','dispatch')` —
this is what actually makes the new "Loads" button return data for a
dispatch user; the app-code gate alone isn't sufficient. Also worth
noting: this is a real behavior change, not additive — leads lose the
cross-driver load visibility they currently have, since the matrix scopes
that to Dispatch + Admin only. Both policies existed live already but were
never in a migration file until this one (confirmed via a live query
2026-07-29 — see "Architecture reality" for why that's unsurprising here).

**Explicitly NOT done, flagged for whenever each area is actually built**:
- ~~Fleet-wide terminal card / credential visibility for dispatch~~ —
  **shipped 2026-08-06.** Scope decision made (asked, not guessed): dispatch
  gets **read-only** view of license/medical/TWIC expiry status, not the
  admin-only tables' full `ALL`/CRUD access — matches "view who's carded
  where," not "edit any driver's record."

  Live `pg_policies` query (2026-08-06) confirmed the actual shape before
  writing anything: `driver_licenses`/`driver_medical_cards`/
  `driver_port_ids`/`driver_twic_cards` each have an admin-only `ALL` policy
  plus a self-row-only SELECT — so dispatch (and even admin, for other
  drivers) genuinely couldn't see anyone else's row before this. `attachments`
  turned out to **already** have a company-wide SELECT policy (no role
  restriction at all) — confirmed via the same query — so it needed no
  change; only the four credential tables had the gap.

  `supabase/migrations/20260806000000_dispatch_credential_visibility.sql`
  (applied) adds one new additive SELECT policy per credential table
  (`dl_admin_dispatch_read`, `dmc_admin_dispatch_read`,
  `dpid_admin_dispatch_read`, `dtc_admin_dispatch_read`), admin+dispatch,
  company-scoped — mirrors `terminal_access_admin_dispatch_read`'s own
  shape from the terminal-card migration. Existing `xx_admin` (ALL) and
  `xx_own` (SELECT) policies untouched; permissive policies OR together, so
  this only extends read reach, never reduces access. Live-confirmed via
  `pg_policies` post-apply: all four exist with the intended `qual`.

  New UI: `app/admin/FleetCredentialsModal.tsx` (new) + a "Credentials"
  button in `app/admin/page.tsx`'s header, gated `admin || dispatch` exactly
  like Fleet Cards — same fetch pattern (`user_companies` + this session's
  new `is_company_staff` roster-visibility fix + `get_display_names_full`),
  status-only display (expiry + computed color state via `cardStateFor`/a
  local `DARK_EXP_COLOR` override, same as `FleetCardsModal.tsx`'s own dark-
  background palette fix) — no underlying license/card field data (number,
  class, examiner) shown, matching the read-only decision. Deliberately
  excludes `driver_port_ids` — that table is the freeform, multi-row
  "Badges" list (Cards tab), a different shape from singular license/
  medical/TWIC; the existing single-driver `CredentialsReportModal.tsx` (the
  only prior "Credentials" UI in the app) already scopes out port IDs for
  the same reason, so this isn't a new omission.

  Live-verified against the same two-member company from the roster-
  visibility fix: both "Seth Perry" and "Test Testerson" render in the new
  modal, each correctly showing "Not on file" for License/Medical/TWIC
  (accurate — this demo company has never had credential data entered, same
  empty state the self-view Credentials report already shows). No console
  errors.
- ~~The "priority terminal flagging" feature — brand new table/UI, not built.~~
  Since superseded: it *was* built later this session, then removed entirely
  per explicit user direction — see "Removed 2026-08-05" further down. Not
  coming back in this form; terminal card management uses simple status
  sorting instead. This bullet is stale, kept only so the history reads
  coherently.
- ~~**Security flag, not yet verified**~~ — **resolved 2026-08-05.** Live
  `pg_policies` query confirmed `user_companies_update_admin_or_super`
  (UPDATE) has both `qual` and `with_check` set to `is_company_admin(company_id)`
  — so `MemberCard.tsx`'s bare client-side `changeRole()` `.update()` really
  is safe: RLS silently blocks the write (0 rows affected) for anyone who
  isn't a company admin (or super admin, per `is_company_admin()`'s own
  `is_super_admin()` short-circuit). `admin_set_user_company` is still
  confirmed dead code, unrelated to this enforcement path.

  **But confirming this surfaced a real, separate, more serious bug**: the
  live SELECT policy on the same table (`user_companies_select_own_or_super`)
  is `is_super_admin() OR user_id = auth.uid()` — **no admin/lead/dispatch
  carve-out at all**. Three client call sites did a raw
  `.select(...).eq("company_id", cid)` assuming they'd get the whole
  company's rows back: `app/admin/page.tsx` (member roster), `FleetCardsModal.tsx`
  (per-terminal driver list), `app/calculator/lead/DriverAssignmentModal.tsx`
  (driver picker). For any non-super-admin, all three silently collapsed to
  "just my own row" the moment a company had more than one member — which
  is exactly why every one of those features carried an "only verified
  same-user, worth checking with a second driver" caveat all session. The
  single-member demo company never exposed it because `user_id = auth.uid()`
  alone already returned the complete (1-row) result set.

  Fixed via `supabase/migrations/20260805000000_user_companies_staff_roster_visibility.sql`
  (applied): a new `is_company_staff(p_company_id)` function, mirroring
  `is_company_admin()`'s own `SECURITY DEFINER` + `is_super_admin()`
  short-circuit shape but checking `role in ('owner','admin','lead','dispatch')`
  instead of admin-only, plus a purely additive SELECT policy using it —
  the existing self-row policy is untouched, this just OR's in a second
  permissive policy. Deliberately excludes plain drivers (they keep exactly
  the self-row access they already had).

  **Live-verified against a genuine second company member** (the demo
  account gained a real second user, `Test Testerson`, mid-session — the
  first time this session multi-member visibility could be tested for
  real, not just architecturally reasoned about): `/admin` roster now shows
  "USERS (2)" with both members' names/emails/Loads buttons rendering
  correctly, and Fleet Cards' Chevron/Fort Lauderdale lookup shows both
  drivers' real, distinct card expiry dates. No console errors either
  place. `DriverAssignmentModal.tsx` (Lead tab) wasn't re-tested live this
  pass but shares the identical query shape, so the same fix applies.
- ~~A likely pre-existing bug, found in passing, not fixed~~ — **fixed
  2026-08-05.** `app/calculator/reports/page.tsx`'s `useLoadHistory(authUserId)`
  call (line 85) was the one fetch on that page not using `effectiveUserId`
  like everything else there — swapped to `useLoadHistory(effectiveUserId)`,
  removed the now-unused `authUserId` destructure. Confirmed via `tsc
  --noEmit` and a live reload of `/calculator/reports` (My Loads still shows
  "2" for the current non-impersonated user, as expected — impersonation
  itself wasn't re-tested this pass, but the fetch now matches every other
  query on the page).

  **Second, unrelated bug found while trying to verify the above**:
  `/calculator/reports` was unconditionally redirecting back to `/calculator`
  on every load, both via direct navigation and via the nav-menu link.
  Root cause: `CalculatorLayoutClient.tsx`'s `activeTabFor()` deliberately
  returns `"none"` for the Reports route (so no tab bar entry falsely shows
  as active — Reports is a nav-menu destination, not a tab-bar peer), but
  the tab bar's scroll-snap handler (`onScroll`, ~line 99) didn't know about
  that sentinel: it always compares "closest tab to viewport center" against
  `active`, and since `"none"` can never equal a real tab id, the handler
  treated Reports as if the user had scrolled the tab strip and immediately
  `router.push()`'d to whichever tab happened to be centered (`planner`).
  This fired on mount because the scroll-snap container's initial layout
  settle is itself a scroll event. Fixed with a one-line early return
  (`if (active === "none") return;`) at the top of `onScroll` — the tab bar
  now simply never auto-navigates while on a non-tab route. Live-verified:
  `/calculator/reports` now loads and stays put, full content renders
  (My Loads, Scale/Service/Wash History, Expiring Items, Terminal Cards,
  Credentials), no console errors. This bug predates this session's changes
  entirely (unrelated to the `authUserId` fix above) and would have affected
  the Reports hub from the day it shipped — the fact that it was never
  caught suggests Reports hadn't been click-tested end-to-end since.

### ~~Role-based tabs (new UI direction, 2026-07-30, not in the original Fleet Tier spec)~~ — superseded 2026-08-03

Entirely superseded by the Terminal Tier spec below (see "## Terminal Tier —
Build Spec"). Per explicit user direction during a 2026-08-03 mockup
walkthrough ("we pumped the brakes... this was scope creep"), the dedicated
Lead/Dispatch/Admin tabs shipped here — including `EquipmentScheduleChart.tsx`
and `DriverAssignmentModal.tsx` — are being **shelved entirely**, not moved
into the nav menu or preserved elsewhere. Left below as a historical record
only; don't build on top of any of it.

Every role gets Planner/Cards/Vault for themselves; each non-driver role
additionally gets exactly one extra tab to the **left** of Planner —
Lead/Dispatch/Admin. Each role tab is its own fresh, focused page (subtabs +
a role-relevant chart/content area) — explicitly **not** a literal copy of
the Planner page's load-planning shell (equipment/location cards, temp
dial, Load button); those don't have an obvious meaning for a
fleet-monitoring dashboard and would mean inventing behavior for controls
that don't do anything real. Confirmed with user 2026-07-30 before
building.

**Shipped so far — Lead tab only** (Dispatch/Admin follow the same shape
later, not started):
- `role`/`companyId` hoisted into `CalculatorShellContext.tsx` (same
  query shape as `NavMenu.tsx`'s own role fetch, but scoped to
  `effectiveUserId` so admin impersonation reflects the impersonated
  user's role — matches every other piece of shared shell state).
  `NavMenu.tsx` itself was left alone (own independent fetch) since it's
  also rendered outside the shell provider (e.g. `/admin`).
- `CalculatorLayoutClient.tsx`'s tab bar is now role-aware: `ROLE_TABS`
  maps `role -> {id,label,href}`, prepended to the always-present
  Planner/Cards/Vault base tabs. A driver (or unresolved role) sees no
  extra tab. Only `lead -> "Lead" (/calculator/lead)` is wired so far.
- `app/calculator/components/CenteredSubTabs.tsx` (new, generic) —
  extracts the "selected item scrolls to center" scroll-snap mechanic that
  the tab bar and `PresetDial.tsx` (the Planner's A-E preset row) each
  already implemented independently; this was the third copy, so it's now
  shared. Reusable for Dispatch/Admin subtabs later.
- `app/calculator/lead/page.tsx` — Dashboard / Tasks / Ledger subtabs via
  `CenteredSubTabs`. Only Dashboard has real content; Tasks and Ledger are
  honest "coming soon" placeholders, not a guess at unspecified
  functionality (only Dashboard was actually specified).
- `app/calculator/lead/EquipmentScheduleChart.tsx` — "who has the
  equipment and when." **Illustrative mock data only** — confirmed with
  user before building that no driver-shift-schedule table exists anywhere
  in the app; a real schedule feature is a separate, later piece once this
  chart's shape is validated. Went through three iterations same-day
  (2026-07-30), converging on the current shape:
  1. First cut: a weekly roster grid (driver rows × day-of-week columns).
  2. Redesigned into a 24-hour timeline per a user reference image
     (12am-noon-12am number line) — real clock axis, one row per driver,
     per-day on/off state, a legend.
  3. Fixed-50/50-axis pass, per explicit follow-up feedback: day shift
     always fills the left half, night shift always the right half,
     regardless of actual duration. Hour tick labels underneath are
     *derived from each shift's own start/end hours* rather than a static
     midnight-anchored axis — with this data (3a-3p / 3p-3a) that puts "3"
     at both far edges instead of "12". No per-driver name/shift-hour
     labels on the bar and no legend — the header boxes and bar colors
     already say what's what. The per-day-of-week on/off concept from
     iteration 2 was dropped here (not requested for this shape).
  4. **Current shape**: title line uses a real flex gap between "Truck ·
     25184" and "Trailer · 3151" (still hardcoded — no real equipment
     binding on this page yet) instead of literal spaces in one string,
     which HTML collapses to a single space — a real gap needs actual
     layout, not whitespace characters. The bar's two halves now have the
     same small gap as the header boxes (previously seamless). Below the
     card, outside it, a vertical list of the full week (full day names,
     not abbreviated) reappears — the per-day-of-week on/off concept from
     iteration 2 is back, but rendered differently: a line spans from each
     day name to the card's left edge when Pedro works that day, another
     spans to the right edge when Seth works it, nothing on a day either
     is off. Two follow-up tweaks landed on this: (a) the lines are a
     neutral `rgba(255,255,255,0.08)` — same color as the chart card's own
     border — rather than the day/night yellow/blue, since side + presence
     already say who works that day and the color was reserved for the
     header boxes/bar; (b) the day-name grid column is a **fixed width**
     (`DAY_LIST_LABEL_WIDTH = 86`, sized to fit "Wednesday" without
     wrapping) instead of `auto`, so every row's line length is identical
     — with `auto` each line's length varied with that day's own name
     width (e.g. "Sunday" vs "Wednesday"), which read as visually
     staggered/misaligned. The current day's name is still colored to
     whichever shift currently holds the equipment (yellow before 3pm,
     blue from 3pm on) instead of the default gray — driven by the same
     `useNow()` clock, comparing the live hour against
     `DAY_SHIFT.startHour`/`endHour`.
  5. **Equipment button + driver assignment**, per explicit follow-up: the
     Lead Dashboard now has a real Equipment button — not a fresh
     Lead-specific control, but the *exact same* Equipment sheet the
     Planner uses (`shell.equipOpen`/`setEquipOpen`, already mounted once
     in `CalculatorLayoutClient`'s `ShellChrome` and shared via
     `CalculatorShellContext` — the same instance Cards/Vault already
     reuse). `app/calculator/lead/page.tsx` replicates the Planner's own
     `equipmentDetails` fetch (truck/trailer name + make, keyed off
     `shell.equipment.selectedCombo`) and button styling verbatim. Only the
     *result* of picking equipment differs from Planner: instead of
     revealing compartment/load-planning UI, it reveals
     `EquipmentScheduleChart` with a real `equipmentLabel` (or a "No
     equipment selected" placeholder when `hasEquipment` is false) instead
     of the old hardcoded "Truck · 25184 / Trailer · 3151". A second new
     button, "Driver Assignment," opens `DriverAssignmentModal.tsx` (new)
     — day/night driver name pickers sourced from the real company roster
     (`user_companies` + `get_display_names_full`, same pattern as
     `FleetCardsModal.tsx`). `EquipmentScheduleChart` gained
     `dayDriverName`/`nightDriverName` props (falling back to the mock
     "Pedro Guzman"/"Seth Perry" defaults) so an assignment immediately
     updates the bar and the day-list's today-highlight. **No backing
     table for the assignment itself** — same "mock data first" call
     already made for the rest of this chart; the picked names live in
     `LeadPage`'s own React state and are lost on reload. Shift
     times/colors/workday patterns are still the pre-existing mock data;
     only the *names* are now real/assignable. Buttons were initially
     placed above the chart; moved below it per explicit follow-up to
     match the Planner's own layout order (compartment display on top,
     info cards/buttons underneath).
  - **Hydration-mismatch fix** (still applies): the live clock calculation
    (`useNow()`) must never call `new Date()` directly in a `useState`
    initializer or in the render body — the server-rendered snapshot and
    the client's first hydration pass land at different instants, which
    Next.js flags as a hydration error and force-remounts the tree. Fixed
    by starting state at `null` (identical server/first-client render)
    and only resolving the real clock in a client-only `useEffect` after
    mount. Any future "current time"-style widget in this codebase should
    follow the same pattern.
  - **Dev-server stale-content trap, cost significant time this session —
    root cause found and fixed at the source.** Iterating on this file,
    the dev server kept appearing to serve an old version no matter how
    many times the page reloaded — even surviving a full `.next` wipe +
    process restart + brand-new browser tab, with a stuck Next.js parse-
    error overlay quoting old file content. Diagnosis, in order: (1) `tsc
    --noEmit` passed clean the whole time — the source was never actually
    broken; (2) direct disk `grep` of the compiled `.next/dev/static`
    chunk showed the correct new content; (3) `curl` of that exact chunk
    URL also returned the correct content byte-for-byte — proving the
    Next.js dev server itself was always correct; (4) only the *browser
    tab's own* `fetch()` of that same URL returned stale bytes. Actual
    cause: `components/ServiceWorkerRegistration.tsx` registers
    `public/sw.js` (cache-first for build assets) unconditionally on
    every mount, in every environment — so each reload during dev
    re-registers the SW and re-caches whatever bundle happened to be
    current *at that reload*, meaning a single clear-and-check wasn't
    durable against the *next* reload silently re-poisoning it again.
    **Fixed at the source**: `ServiceWorkerRegistration.tsx` now skips
    registration entirely when `process.env.NODE_ENV !== "production"` —
    the standard guard for exactly this class of PWA dev-mode pain. Verified
    post-fix: `navigator.serviceWorker.getRegistrations()` returns empty
    after a reload in dev. This should prevent the whole class of "my
    change isn't taking effect" confusion from recurring on this project —
    if it ever does again, suspect something other than the SW now.

**Verification note:** live-verified the Lead page's own content (subtabs
centering + swapping, chart rendering) via direct navigation to
`/calculator/lead`, and confirmed no regression to the existing
Planner/Cards/Vault tab bar. Did **not** verify the tab actually appearing
in the tab bar for a real lead-role user end-to-end — the only test
company available is single-member (admin-only), and reassigning that
sole admin's own role to `lead` to test would risk losing the ability to
reassign it back (role dropdown is admin-only-visible) with no easy live-DB
undo. Worth a real check once a second (non-admin) test member exists.

#### Shipped 2026-07-30: Dispatch + Admin tabs, super-admin sees all

- `app/calculator/dispatch/page.tsx` and `app/calculator/admin/page.tsx` —
  same shell as Lead (`CenteredSubTabs`, Dashboard/Tasks/Ledger). Neither
  had specific Dashboard content requested the way Lead's equipment
  schedule was, so **all three subtabs on both are honest placeholders**
  naming likely future content (dispatch: fleet-wide loads/cards overview;
  admin: a lighter company-status glance, explicitly not a replacement for
  the full `/admin` console) rather than guessed-at functionality.
  `/calculator/admin` is deliberately a distinct route from the existing
  top-level `/admin` page — same tab-shell pattern as Lead/Dispatch, not
  the full management console.
- `CalculatorShellContext.tsx` gained `isSuperAdmin` (via the same
  `is_super_admin()` RPC `NavMenu.tsx` already calls, but keyed on
  `authUserId` not `effectiveUserId` — super-admin status is about the
  real signed-in account, not whoever they're impersonating).
- `CalculatorLayoutClient.tsx`'s `ROLE_TABS` is now an ordered list
  (Lead, Dispatch, Admin — also the left-to-right order super admins see
  all three in). `tabsFor(role, isSuperAdmin)`: a super admin sees **all
  three** role tabs regardless of their own company role, specifically so
  one account can verify/QA every role tab without reassigning roles.
  `activeTabFor` generalized from "find the one extra tab" to "find
  whichever role tab's href prefix-matches the current path," since there
  can now be more than one.
- **Verification gap, same shape as Lead's:** the demo test account isn't
  in the `super_admins` table and there's no live DB write access this
  session to add it temporarily, so the actual "super admin sees all six
  tabs" render couldn't be exercised end-to-end. Mitigated two ways
  instead: (1) direct navigation to `/calculator/dispatch` and
  `/calculator/admin` confirms both pages render correctly standalone; (2)
  `tabsFor`/`activeTabFor` were run standalone in Node against every
  role × `isSuperAdmin` combination (driver/lead/dispatch/admin, both
  `isSuperAdmin` states) — all produced the correct tab set and correct
  active-tab detection. Worth a real click-through once a genuine
  super-admin test session is available.

### Website / landing page rework
- `protankr.com` currently redirects straight into the calculator tool —
  needs a real marketing site.
- **Rename "calculator" → "Planner"** throughout (route + UI copy). Planner
  redirects unauthenticated users to `/login`.
- New site structure: `/` marketing landing, `/planner` (renamed calculator,
  auth-gated), `/pricing` (solo + fleet pricing from above), `/about`,
  `/login`, `/signup`.
- Styling: keep the existing dark `#111111` app theme (continuity between
  marketing site and product, not a separate palette). Industrial/utilitarian
  visual language (sharp edges, gauge/data-driven visuals using real app
  metrics) over generic SaaS-template look. Hero copy leads with the actual
  problem (off-spec fuel → conservative loading → lost gallons), not vague
  taglines.

#### Shipped 2026-08-07: `/calculator` → `/planner` rename + auth gate

Scoped to the route and copy only, per explicit user direction picking
this as the starting slice of the website rework (marketing landing page
and the other new routes are separate, not-yet-started pieces). UI copy
already said "Planner" everywhere (tab bar, NavMenu's "Back to Planner",
admin's "Set up planner →") -- a repo-wide grep for user-facing
`"Calculator"` text turned up nothing, so this pass was purely the URL
path. Internal identifiers (`CalculatorShellContext`, `CalculatorLayoutClient`,
`useCalculatorShell`, the shelved `app/planner/admin/page.tsx`'s
`CalculatorAdminPage`) were deliberately left unrenamed -- "route + UI
copy" reads as explicitly scoping out internal file/symbol names, and
renaming those too would touch dozens of files for zero user-visible
benefit.

`git mv app/calculator app/planner` (had to stop the dev server first --
`git mv` failed with a Windows file-lock "Permission denied" while
Turbopack's watcher held the directory open). Then every `"/calculator...”`
string literal (~16 files: tab hrefs in `CalculatorLayoutClient.tsx`/
`CardsSubTabs.tsx`, every `router.push`/`router.replace`/
`window.location.href` redirect target, `NavMenu.tsx`'s active-tab path
checks, `lib/authz.ts`/`lib/setupSession.ts`) and every `@/app/calculator/...`
import alias (6 files outside the moved directory, e.g.
`lib/ui/driver/EquipmentDetails.tsx`'s import of the new
`ServiceTypeManager.tsx`) → `/planner` / `@/app/planner/...`. One
functional miss from the first sed pass: `app/learn/page.tsx`'s guided-
tour link used a template literal (`` `/calculator?tour=${t.id}` ``), which
a plain `"/calculator` string-literal grep doesn't match -- caught on a
follow-up full-text sweep before it could ship broken. Also swept every
moved file's own stale `// app/calculator/...` header-comment path (~30
files, cosmetic only, no functional risk) for accuracy.

**Auth gate -- real architecture finding, not just a route swap.** First
attempt added `await getSessionUserOrRedirect()` (the existing
cookie-based `lib/authz.ts` helper, also used by `requireSuperAdmin`/
`requireMembershipOrJoin`) directly in `app/planner/layout.tsx` as a
server component. Live-tested and it redirected an **already-authenticated**
session straight to `/login` -- traced to `lib/supabase/client.ts`: the
browser Supabase client uses plain `createClient` from `@supabase/supabase-js`
with `storage: window.localStorage`, not `@supabase/ssr`'s cookie-syncing
`createBrowserClient`. Sessions never get written to a cookie at all, so
`next/headers`'s `cookies()` (what `createSupabaseServer()` reads) can
never see a session regardless of whether the browser is logged in --
confirmed `requireSuperAdmin`/`requireMembershipOrJoin`/
`getSessionUserOrRedirect` were **called from literally nowhere in the app
before this pass** (this repo's own prior note flagged `requireMembershipOrJoin`
as "dead code... don't assume that stays true if someone wires it in
later" -- wiring it in is exactly what surfaced this). `/admin` and every
other auth-gated screen in this app enforces auth client-side (its own
`supabase.auth.getUser()` check), which is why they all work fine despite
this gap.

Reverted the server-side gate; the real fix lives in
`CalculatorShellContext.tsx`'s existing mount-time `supabase.auth.getUser()`
effect -- if no user comes back, `router.replace("/login")`. Matches how
the rest of the app already does this, no architecture change. **Properly
fixing this** (migrating `lib/supabase/client.ts` to `createBrowserClient`
so server-side gates work everywhere) is a real, worthwhile follow-up --
`requireSuperAdmin`/`requireMembershipOrJoin` are both silently inert
right now -- but it's a foundational change touching the one Supabase
client every authenticated call in the app goes through, well outside a
route-rename's scope. Flagged here, not fixed.

**Live-verified**: unauthenticated `/planner` → `/login` (via the new
client-side gate); authenticated bare `/` → `/planner` → real Planner
content; all five tabs (Terminal/Dispatch/Planner/Cards/Vault) resolve
under `/planner/*` with real data (Terminal's rack map, Dispatch's driver
picker, Cards' city-grouped terminal list, Vault); NavMenu's Reports link
→ `/planner/reports` renders the full Reports hub; `/admin`'s "Set up
planner for X" (Kyle Tatro) → lands on `/planner` with the "Setting up
planner for Kyle Tatro" banner and his own (empty) equipment state, not
the admin's; "← Return to Admin" clears the setup session
(`sessionStorage` confirmed empty after) and hard-navigates back to
`/admin`. `tsc --noEmit` clean throughout; no new console errors beyond
routine dev-server HMR websocket noise from the mid-task server restart.

#### Shipped 2026-08-13: `/pricing` and `/get-the-app` (placeholder pricing + early-access form)

Next slice of the marketing site, per explicit direction: a real (if
price-less) `/pricing` page, and `/get-the-app` repurposed from "just
links to the app" into a "Request Early Access" contact form -- the same
URL is meant to become the real subscription-enrollment page later, so it
was built at that permanent path rather than a throwaway `/early-access`
one.

`app/marketing/SiteHeader.tsx` (new) -- the landing page's original header
(logo, About/Pricing/"Get the App") was inline JSX+CSS inside
`app/page.tsx`; extracted into a shared component so the nav can't drift
across the three pages that now need it, and so the two nav changes below
land everywhere at once. Two real changes from the original: a new
**Login** link (plain text, next to the CTA pill) and the **Get the App**
CTA now points to `/get-the-app` instead of `/planner` -- previously
"Get the App" *was* the only way to reach `/login` from the landing page
(via `/planner`'s own client-side redirect-when-signed-out), so once its
destination became the early-access form instead, an explicit Login link
was the direct fix for existing users losing their way in.

**Real bug hit and fixed while building `SiteHeader`**: its first version
used a normal scoped `<style jsx>` block (matching how every other page in
this app writes component CSS) and rendered completely unstyled live --
logo stacked above wordmark instead of inline, "Get the App" showing black
text with no pill background. Confirmed via `getComputedStyle` and reading
the actual `<style>` tag content: the scoped CSS was correctly generated
(rules like `.brand.jsx-<hash>{...}`), but the DOM elements only ever
carried their plain `className` (`"brand"`), never the matching
`jsx-<hash>` class needed for the rule to apply at all -- so every rule
silently matched nothing. Root cause not chased further (plausibly a
Turbopack/styled-jsx scoping gap), but the fix was straightforward once
diagnosed: switched to `<style jsx global>` with specific, collision-safe
class names (`.site-header .nav-cta`, etc.) -- the exact pattern
`app/page.tsx`'s own original inline header already used successfully,
which is presumably why this bug was never hit before now.

`app/pricing/page.tsx` (new) -- two tiers, **Solo** and **Fleet**, sourced
directly from "Product direction" and "Roles & permissions" → Pricing
above (not invented): Solo for an individual owner-operator, Fleet
described with its real shape (1 admin + 4 team seats included,
additional team/admin seats priced separately) but with every dollar
figure replaced by a literal **TBD** rather than a guessed number, per
explicit direction -- pricing itself isn't finalized yet, only the tier
structure is. Both tiers' CTA goes to `/get-the-app`.

`app/get-the-app/page.tsx` (new) -- Name/Email (required) + Company/Fleet
size/Message (optional) → posts to `app/api/early-access/route.ts` (new),
which sends a plain notification email via the same Resend setup
`app/api/admin/invite/route.ts` already uses (`RESEND_API_KEY`/
`INVITE_FROM_EMAIL`, confirmed live via `vercel env ls` to already exist
in Production, not configured in this session's local `.env.local` or in
Preview) -- to `sethnperry@gmail.com`, with `reply_to` set to the
submitter's own address so a reply goes straight to them. No DB write, no
auth -- this is a public contact form, not an app feature, so there's
nothing to persist beyond the email itself. A "Log in" note above the form
covers existing users who land here by habit.

**Live-verified**: header renders correctly (logo inline, nav links
correct, CTA pill styled) on both desktop and mobile widths, on all three
pages (`/`, `/pricing`, `/get-the-app`), with the active nav item dimmed
correctly per page. Pricing page's two cards, feature lists, and TBD
pricing render as designed. Get-the-app form: submitted with a real name/
email locally and confirmed the expected, graceful failure path -- server
log showed `RESEND_API_KEY not set` (correct, since that key only exists
in Production) and the form surfaced a clean "Something went wrong" error
rather than crashing. **Since resolved**: after deploying, submitted a
real request against production and got the "Request received"
confirmation — the actual Resend send path is now confirmed working
end-to-end, not just architecturally sound. `tsc --noEmit` clean
throughout.

**Copy fix, same day**: the Solo card's "Cross-company temperature
network" line was factually wrong on two counts, caught by the user, not
guessed at — confirmed against the live schema before touching anything
(`terminal_products`/`terminal_temp_bias` both keyed by `terminal_id`
only, no `company_id` at all, matching "Cross-company reading network"
above): it's **API gravity readings** that get crowdsourced (temperature
is predicted, with manual override — a separate mechanism), and the
pooling is **global** across every company, not scoped to one. Reworded
to "Crowdsourced API data, shared industry-wide". Also dropped "&
payroll reporting" from the Fleet card's incentive-tracking line per
explicit direction — the app tracks incentive points, it doesn't run
payroll, and the original wording overstated that.

#### Shipped 2026-08-13: `/about` — card grid + per-topic deep dives, content shared with the in-app Learn page

Per explicit direction: reuse the in-app `/learn` page's existing
technical content rather than writing new copy from scratch, since editing
it twice (once for the app, once for marketing) is exactly the kind of
drift this project has hit before with duplicated logic (see
`CustomSelect.tsx`'s and `ServiceTypeManager.tsx`'s own header comments on
the same lesson). Each of `/learn`'s four content-heavy accordions
(equipment setup, temperature prediction, weight plan, over/under) is now
sourced from one place and rendered two different ways.

`lib/content/learnTopics.tsx` (new) — the single source of truth. Each
topic carries the exact detailed body content `/learn`'s accordions
already had (ported verbatim, not rewritten) *plus* new marketing-only
fields (`shortName`, `tagline`, `marketing`) that only the About pages
use. The detail content is deliberately **theme-agnostic**: emphasis uses
a bare `<Em>` (`<strong className="lt-em">`) instead of a hardcoded color,
because the exact same JSX now has to render legibly on both the in-app
Learn page's dark background and the marketing site's light one — each
consumer defines its own `.lt-em` color rather than the shared content
picking one. "Guided tours" (the tour-launcher block) stayed inline in
`app/learn/page.tsx`, not moved into the shared module — it's an app
mechanic, not a marketable "why this matters" story, so it isn't an About
topic.

`app/learn/page.tsx` — its `Section`/`Divider`/`Accordion` components are
unchanged; only the CONTENT source changed, mapping over
`LEARN_TOPICS[].blocks` instead of the content being hand-written inline.
Live-verified pixel-for-pixel against the pre-refactor version (same 5
accordion titles, same body text, same emphasis rendering) — this was a
refactor, not a content change, and had to look identical.

`app/about/page.tsx` (new) — card grid, one card per topic: emoji,
`shortName`, `tagline`, the full `marketing` pitch (a real paragraph, not
a one-liner, per explicit direction), and a "Learn more →" link to
`app/about/[slug]/page.tsx` (new, dynamic route) — which shows the same
marketing intro up top, then renders the topic's `blocks` in full on a
dedicated page instead of a collapsed accordion, ending in a "Request
Early Access" CTA back to `/get-the-app`. 404s cleanly for an unknown
slug via `notFound()`.

**Real bug, same root cause as `SiteHeader`'s earlier one, hit and fixed
proactively this time**: nothing new to diagnose — already knew from that
earlier incident that scoped `<style jsx>` silently fails to attach its
`jsx-<hash>` class to elements in this dev setup, so both new About pages
were written with `<style jsx global>` and specific class names
(`.topic-card`, `.lt-section`, etc.) from the start, not scoped mode.

**Live-verified**: `/about` renders all 4 topic cards with real marketing
copy; `/about/temperature-prediction` renders the full detail (all 7
sections + the amber callout box + CTA) correctly on a light background,
including `<Em>` emphasis in dark text; `/learn` re-checked afterward and
still renders identically to before the refactor, including the same
callout box on a dark background. Checked on both desktop and mobile
widths. Invalid slug (`/about/not-a-real-topic`) 404s cleanly. No console
errors anywhere. `tsc --noEmit` clean throughout.

#### Shipped 2026-08-13: homepage closing CTA + shared site footer

Per explicit direction, after flagging it as the landing page's biggest
gap: the homepage previously just ended after the feature grid, with no
closing CTA and no footer at all -- `/pricing`, `/about`, and
`/get-the-app` all existed by this point but nothing on the homepage
itself funneled a visitor toward them beyond the header nav.

`app/marketing/SiteFooter.tsx` (new) -- same reasoning as `SiteHeader.tsx`,
a shared component so a future footer edit lands everywhere at once, not
three copies. Deliberately minimal (brand + tagline, a single nav row,
copyright) -- this is a pre-launch site with no blog/careers/social
accounts to link to yet, so a sparse footer here is honest, not
under-built. Uses `<style jsx global>` from the start, per the scoping bug
already found in `SiteHeader`.

`app/page.tsx` gained a `.closing` section between the feature grid and
the new footer: "Stop Guessing. Start Loading." + a line about the
early-access rollout, a primary CTA to `/get-the-app` and a secondary
link to `/pricing` -- both real routes this session already shipped, not
placeholders.

**Verification note**: this session's screenshot tool got stuck returning
a stale cached frame for this page specifically, across multiple fresh
tabs, viewport sizes, and scroll methods (JS `scrollTo`, `scrollIntoView`,
mouse-wheel `scroll` actions) -- confirmed independently via
`getBoundingClientRect`/`getComputedStyle`/`scrollY`/`scrollWidth`
JS checks that the actual live page has zero horizontal overflow, the
closing section and footer are correctly positioned in-flow, and the
mobile media query's smaller heading size is genuinely applied -- but a
real pixel screenshot to visually confirm final layout was never
obtained this session. Worth a real look next session before considering
this fully closed.

### Open questions (Fleet spec)
- Tie-break rule if a split load has two compartments with exactly equal
  gallons of different products.

## Billing & Subscriptions — Build Spec (sketched 2026-08-14, no payment processor wired up yet)

Recorded from a design conversation, not yet integrated with Stripe or
RevenueCat -- what's below is the app-side scaffold that a real payment
integration will write into and read from, built now so the seat-usage
UX exists and is testable before billing itself is live.

**Decided architecture**: checkout happens on whatever processor is
appropriate for the surface (Stripe Checkout for web/PWA signup, since
`/get-the-app` is meant to become the real enrollment page -- RevenueCat
once the native iOS/Android apps exist, since Apple/Google both require
their own in-app-purchase system for subscriptions bought inside a native
app, not a third-party processor like Stripe). Neither is wired up yet --
no Stripe/RevenueCat keys exist in this project's env vars as of this
pass. **Activation is webhook-driven, never client-redirect-driven** --
the payment success redirect page only shows a "setting up" state; the
thing that actually flips a company to active is a server-to-server
webhook from the processor, signature-verified, landing in a not-yet-built
`/api/stripe/webhook` route.

**Trials**: Stripe supports `trial_period_days` natively at the
subscription level -- card collected up front, not charged until the
trial ends, `status` is `trialing` the whole time. The app's own
activation check should treat `trialing` the same as `active` (has
access), so no separate trial-tracking logic is needed on this side.

**Discount codes**: Stripe's built-in Coupons/Promotion Codes, no custom
code needed -- its hosted Checkout page has a promo-code field already.

**Seat model (shipped this pass, schema + UI only)**: two independent
paid-capacity pools, matching the pricing already decided above --
`paid_admin_seats` (base plan includes 1) and `paid_other_seats` (base
plan includes 4), tracked in a new `company_subscriptions` table
(migration `20260814000000_company_subscriptions.sql`, **written but not
applied** -- no direct DB write access this session, same as other
schema work this pass; needs to be run in the Supabase SQL editor before
any of this activates). Actual seat *usage* is deliberately never stored
-- it's computed live from `user_companies` role counts each time, so it
can't drift from reality the way a cached counter could. RLS: any staff
member (admin/lead/dispatch) can read their own company's row via
`is_company_staff()`; no insert/update/delete policy at all, since the
only writer is meant to be a service-role webhook handler, same
no-direct-client-write shape as `load_points`.

`lib/billing/useCompanySubscription.ts` (new) -- `useCompanySubscription(companyId)`
hook + two pure functions (`computeSeatCapacity`, `wouldExceedCapacity`)
kept outside the hook so they're trivially reusable/testable. Deliberately
**fails open**: any error reading the table (migration not applied yet,
RLS denial, no row for this company) resolves to `hasSubscription: false`,
which every consumer treats as "render nothing, gate nothing." This is
what makes it safe to ship into production today, before the migration
is even applied -- confirmed live: `/admin` for the real, non-billed demo
company renders identically to before (no seat pill, no invite warning),
with the only visible trace being a single expected 404 in the console
for the not-yet-existing table (matches this project's own established
"confirmed via direct PostgREST query not to exist live yet" pattern for
other pre-migration tables).

`app/admin/page.tsx` -- two UI pieces wired to the hook, both invisible
whenever `hasSubscription` is false (i.e. always, today):
- A small pill next to "Users (N)" showing "{used} of {paid} seats",
  turning amber when either pool is full.
- `InviteModal` shows an inline amber warning + relabels its submit
  button to "Add Seat & Invite" when the selected role would push usage
  over paid capacity. **This is informational only** -- there's no real
  billing integration to actually add a seat or block anything yet, so
  the invite always proceeds regardless. It exists so the UX pattern is
  built and reviewable now, ready to gate for real the moment a genuine
  processor integration exists.

**Explicitly not built this pass**: the Stripe/RevenueCat integration
itself (checkout session creation, `/api/stripe/webhook`, a
`webhook_events` dedup table Stripe's own docs recommend for safe retry
handling), the bulk "set seats to N" billing-settings control for a
company onboarding many drivers at once (vs. the incremental per-invite
warning built here), and the actual product decision of whether going
over capacity **hard-blocks** the invite or **auto-scales** the Stripe
subscription quantity with proration -- flagged as a real open question,
not guessed at.

## Terminal Tier — Build Spec (recorded 2026-08-03, not yet scoped into sprint work)

Mockups walked through screen-by-screen with the user 2026-08-03 (Dispatch/
Lead/Driver role screens, built in Inkscape). Nothing below is built yet.
This directly supersedes the "Role-based tabs" work above — see that
section's strikethrough note. Cross-check against "Architecture reality"
below before touching schema, as always.

### Tab structure
- Base tab set for **every** role: Terminal | [contextual middle tab] | Cards
  | Vault. No dedicated Lead/Dispatch/Admin tab anymore — that whole concept
  is shelved (see "Role-based tabs" above).
- Middle tab is contextual: Planner for driver/lead roles; **Dispatch** for
  dispatch and admin roles by default.
- ~~**Admin toggle (maybe, if feasible)**: admin can flip themselves between
  "admin mode" (Dispatch middle tab) and "lead driver mode" (Planner middle
  tab)...~~ — **superseded 2026-08-04, see "Tab bar fix" below.** Built as a
  toggle first (`adminActingAsLead`), then explicitly replaced per user
  direction: admin/super-admin get **both** Dispatch and Planner as
  permanent, separate tabs (not a toggle) — "dispatchers never get in a
  truck" but admins routinely need both views without a mode switch.
- **Cards tab is contextual for admin/dispatch**: instead of their own cards
  (neither role logs their own loads/cards in the field), it reflects
  whichever driver is currently selected — same driver selected for the
  Dispatch tab. Driver/lead roles keep their own Cards tab as today.
- Vault tab: unchanged, every role keeps their own personal vault, no
  changes needed.

### Tab bar fix — Planner access for admin/super-admin (shipped 2026-08-04)

Bug reported live: "the app loads to the dispatch tab but shows the
planner. if I change tabs and go back to dispatch it shows the actual
dispatch tab." **Root cause**: the original toggle-based design had
Dispatch and Planner sharing one tab id (`"planner"`, swapped between the
two hrefs based on `adminActingAsLead`) — for bare `/calculator`,
`activeTabFor` returned `"planner"`, which highlighted whichever tab
currently held that shared id (Dispatch, by default for admin), while the
actually-rendered route (`/calculator` itself) was the real Planner page.
Highlight and content disagreed by construction, not a rendering bug.

**Fix, per explicit user direction** ("add a planner tab for super admins
and admin roles... admins should have the planner used by lead drivers, no
need for jump in as Lead, dispatchers never get in a truck"):
- `CalculatorLayoutClient.tsx`: every tab now has a permanently unique id
  (`terminal`/`dispatch`/`planner`/`cards`/`vault`). `tabsFor(role,
  isSuperAdmin)`: dispatch → Terminal/Dispatch/Cards/Vault (no Planner,
  ever); admin or super-admin → Terminal/Dispatch/Planner/Cards/Vault
  (both, permanent, not a toggle); everyone else → Terminal/Planner/Cards/
  Vault. `activeTabFor` now does a straight pathname-prefix match per tab
  instead of the old "find the one extra tab" logic — the shared-id class
  of bug can't recur since ids are unique.
- `adminActingAsLead` removed entirely from `CalculatorShellContext.tsx`
  (state + setter) — no toggle state left to desync.
- `app/calculator/page.tsx` (Planner): removed the "Acting as Lead Driver /
  ← Back to Dispatch" banner. Added a **one-time landing redirect** — a
  module-level `hasCheckedDefaultLanding` flag (must be module-level, not
  component state: this page genuinely unmounts/remounts on every route
  nav, so component state can't survive a round-trip to another tab and
  back) gates a `useEffect` that sends dispatch/admin/super-admin users
  from bare `/calculator` to `/calculator/dispatch` on first landing only —
  so those roles still land on Dispatch by default, but visiting Planner
  afterward (via the new permanent tab) is never bounced back.
  `canDriverTrain` simplified to `role === "lead" || role === "admin" ||
  isSuperAdmin` (was gated on the now-removed toggle).
- `app/calculator/dispatch/page.tsx`: removed both the "Jump in as Lead
  Driver →" (no driver selected) and "Act as Lead Driver" (driver selected)
  buttons entirely, along with the now-unused `role`/`canActAsLead`
  variables — per "no need to have a jump in as Lead on dispatch tab."
- `isDispatchContext` in `app/calculator/terminal/page.tsx` and
  `app/calculator/cards/page.tsx` simplified from `(role === "dispatch" ||
  (role === "admin" && !adminActingAsLead)) && selectedDriverId` to
  `(role === "dispatch" || role === "admin" || isSuperAdmin) &&
  selectedDriverId` — the contextual (viewing-a-selected-driver) behavior
  for these two tabs no longer depends on a mode that doesn't exist anymore.

**Live-verified 2026-08-04**: `tsc --noEmit` clean. Fresh load of
`/calculator` as the real admin account correctly redirects to
`/calculator/dispatch` (driver picker, no Jump-in-as-Lead button). Tab bar
renders Terminal/Dispatch/Planner/Cards/Vault as five distinct tabs.
Clicking Planner navigates to real Planner content (equipment/terminal
cards, presets, LOAD button, Driver Training) with the Planner tab itself
correctly highlighted — the exact mismatch that was reported is gone.
Clicking back to Dispatch still works and still shows only "‹ Change
Driver" with no act-as-lead button anywhere. (Some stale "export doesn't
exist" build errors surfaced in the console during this check from a
now-superseded version of `labels.ts` — confirmed via `grep` that no
current file imports anything but `displayLabel`; this is the known
`read_console_messages`-buffers-forever behavior, not a live regression.)

### Default-landing redirect removed for admin; real full-app impersonation added (2026-08-04, later same day)

User reported the Planner tab still didn't stick for admin — tapping it
"twitches back" to Dispatch, even with a driver selected. **Root cause**:
the one-time landing redirect above (`hasCheckedDefaultLanding`) also fired
for admin/super-admin, not just dispatch. The module-level flag is supposed
to make it fire only once per session, but if this page's own JS chunk gets
re-evaluated after navigating away and back (plausible on mobile under
memory pressure, though not confirmed as the exact mechanism here), the
flag resets and the "one-time" redirect silently refires on what the admin
experiences as a deliberate Planner visit.

**Fix, per explicit user direction**: "the only role that should default to
the dispatch tab on open is the dispatch role. all other roles should open
to the planner. the Admin roles just get a backstrip button in the
dispatch. Tap that allows them to use the whole app as if they are the
person selected."

- `app/calculator/page.tsx`: the redirect condition narrowed from
  `role === "dispatch" || role === "admin" || isSuperAdmin` to just
  `role === "dispatch"`. This doesn't fix the theoretical re-evaluation risk
  in the abstract, but it does mean the only role that can hit it
  (dispatch) has no Planner tab to be bounced away from in the first place
  — the bug class has no visible symptom for any role that can actually
  reach it now.
- `app/calculator/dispatch/page.tsx`: new "Use app as {driver} →" button
  (admin/super-admin only — `canUseAppAs = role === "admin" ||
  isSuperAdmin`; dispatchers never get in a truck), shown once a driver is
  selected and their identity has loaded. This is a different, bigger
  capability than the same-day Cards-tab parity work above — that was a
  *contextual* view (dispatch/admin looking at a driver's cards/notes while
  staying themselves); this is *real* full-app impersonation, reusing the
  existing `setupSession` mechanism (`lib/setupSession.ts`, the same one
  `/admin`'s "Set up planner for X" button already used) so the admin
  becomes that driver everywhere — Planner, Terminal, Cards, actually
  loading a truck, all of it — not just a Cards-tab-scoped partial view.
  `SetupSession` gained an optional `returnTo` field (defaults to `/admin`
  when omitted, preserving the original `/admin`-entry behavior unchanged)
  so the Planner's existing "← Return to Admin" banner can correctly read
  "← Return to Dispatch" and go back to where this admin actually started,
  not a page they never visited.

**A real bug found and fixed twice in a row while verifying this** (same
root cause, hit on both the entry and exit path): `startSetupSession()`/
`clearSetupSession()` only touch `sessionStorage` — `CalculatorShellContext`'s
`setupSession` React state is read from `sessionStorage` exactly once, in a
mount-only `useEffect`. The original `/admin` → "Set up planner for X" flow
never hit this because `/admin` sits *outside* the `/calculator` layout, so
`router.push("/calculator")` always mounts `CalculatorShellProvider` fresh.
But the new Dispatch-tab entry point starts and ends *inside* the same
`/calculator` layout — a plain `router.push` doesn't remount the provider,
so a freshly-written (or freshly-cleared) session silently never took
effect. Live-verified broken exactly as described (clicking "Use app as
Kyle Tatro" left the Planner showing the *admin's own* equipment; clicking
"← Return to Dispatch" afterward left the "Setting up planner for" banner
still showing) before switching both the entry click and the exit click to
`window.location.href = ...` (hard navigation, forcing the provider to
remount and re-read `sessionStorage` either way) — same fix
`JoinFleetView.tsx` already uses for this identical class of problem.

**Live-verified end-to-end, 2026-08-04**: fresh load of bare `/calculator`
now lands directly on Planner (no redirect at all) for the admin account.
Selected Kyle Tatro on Dispatch, confirmed the "Use app as Kyle Tatro →"
strip renders, clicked Planner while Kyle was selected — content stayed on
Planner with no bounce back (the originally reported bug, now gone; waited
several seconds to rule out a delayed re-fire). Clicked "Use app as Kyle
Tatro →": banner now correctly reads "SETTING UP PLANNER FOR / Kyle Tatro",
content switched to Kyle's own (empty) equipment state — not the admin's —
confirming the session genuinely took effect this time. Clicked "← Return
to Dispatch": URL moved to `/calculator/dispatch`, `sessionStorage` cleared,
driver picker shown (admin's own identity, not stuck impersonating).
Reloaded Planner directly afterward — admin's own real equipment
(Truck·25184/Global South) rendered correctly, confirming no lingering
impersonation state. `tsc --noEmit` clean throughout.

### Equipment selection broken under full-app impersonation (fixed same day)

User's very next real-world use of the new "Use app as {driver}" feature
hit two problems: presets appearing lost under their own identity, and
being completely unable to select equipment while impersonating.

**Presets**: checked live via direct Postgres query before assuming
anything was actually wrong — `user_plan_slots` for the admin's own
`authUserId`, all five preset slots (`__universal__` scope), all had real,
non-empty `compPlan` data with recent `updated_at` timestamps. Server-side
data was never lost. This points to a local device cache/sync display
issue (same general fragility as the earlier-documented preset-loss
incident this session, root-caused then to local-cache-vs-server
staleness) rather than a new regression from today's changes — not
independently root-caused further this pass; flagged, not fixed, since the
underlying data is confirmed safe and a hard refresh should resolve the
display.

**Equipment selection — real bug, found and fixed.** Root cause: this
company (the persistent demo/QA company used all session) is flagged
`companies.is_solo = true` despite having multiple real members — an
already-documented quirk (`is_solo` reflects how a company was *created*,
not its current member count; see the solo→fleet join flow notes above).
`EquipmentModal.tsx` routes any `is_solo` company into `SoloEquipmentModal.tsx`
instead of its own fleet UI — and `SoloEquipmentModal.tsx` had **zero
setupSession-awareness**: it didn't even accept the prop, and called
`couple_combo` directly via the browser's own live session regardless of
who was being impersonated. Confirmed live via `pg_get_functiondef`:
`couple_combo` only ever had a single overload, hardcoded to `auth.uid()`
throughout — unlike `claim_combo`, which already had a service-role
`(p_combo_id, p_user_id)` overload for exactly this class of problem, added
back when the original Dispatch-tab work was built. So tapping a truck/
trailer while impersonating Kyle actually claimed the combo under the
*admin's own* account — `useEquipment.ts`'s setup-mode `selectedComboId`
derivation (only shows combos `claimed_by` the target user) then
immediately reverted the selection back to empty, which is what read as
"won't let me select equipment."

Fixed by adding a matching service-role overload,
`couple_combo(p_truck_id, p_trailer_id, p_user_id, ...)` — a verbatim copy
of the existing function with every `auth.uid()` replaced by `p_user_id`,
migration `20260815020000_couple_combo_service_role.sql` (applied) — plus
the same plumbing pattern `claim_combo` already established: a new
`couple_combo` case in `/api/admin/setup/route.ts`, a `coupleCombo()`
helper in `lib/adminSetupClient.ts`, and `SoloEquipmentModal.tsx` gained a
`setupSession` prop (now actually threaded through from
`EquipmentModal.tsx`, which already received it but never passed it down —
also part of the bug) with `resolvePair()` branching to the service-role
proxy when impersonating. `confirmRemove` (delete_truck/delete_trailer)
was checked and left alone — those RPCs already enforce admin-only via the
*real* `auth.uid()` internally, which is correctly the actual admin during
impersonation, and the action is company-wide equipment deletion, not
user-specific, so no setupSession branch was needed there.

**Live-verified end-to-end**: impersonated Kyle Tatro (zero prior
equipment), opened Select Equipment, tapped a truck+trailer never paired
before — got the same "New Pairing, enter tare weight" prompt a real
driver would see (proving the call reached the real RPC rather than
silently failing), entered a tare weight, and the Planner correctly showed
"Truck · 22049 / Trailer · 3151" with a real compartment grid. Confirmed
via direct Postgres query that `equipment_combos.claimed_by` was genuinely
Kyle's user ID, not the admin's. This test's pairing force-decoupled the
admin's own real truck/trailer (25184/3151) as a side effect of the
existing `p_force: true` behavior (a real driver re-selecting their own
equipment mid-session is the normal case this flag exists for) — restored
immediately after by returning to the admin's own identity and
re-selecting 25184/3151 through the same picker, which correctly found
the prior tare-weight history and re-coupled with no new prompt. Confirmed
clean afterward via direct query: admin's original combo active again,
Kyle's test combo left with no active claim. `tsc --noEmit` clean
throughout.

### Dispatch tab (new)
Per-driver dashboard, reachable by selecting a driver (exact selection
UI/modal not designed yet — flagged as open design work below, not blocking
the rest of this spec). Shows for the selected driver:
- Identity/context: name, store, region, shift schedule (day-of-week + time
  range, e.g. "3p-3a"). **Store/region are believed to already exist
  somewhere on profiles** (unconfirmed — verify live before building),
  **shift schedule is net-new**, needs a new table/columns.
- Terminal card list across all terminals, each with computed expiry state —
  reuses the same `cardStateFor`-style logic as Fleet Cards/Credentials, not
  new logic. "Not Carded" is just this app's existing "inactive" card state
  relabeled to match field terminology — no new state needed, but verify the
  existing enum/state naming live before assuming the mapping is 1:1.
- Equipment summary (truck/trailer + make) and equipment registration
  expiry — reuses existing equipment data.
- A freeform dispatcher notes box, per driver. **New table** — visible and
  editable by dispatch, lead, *and* admin (not dispatch-only).
- Switching to the Terminal tab while a driver is selected opens directly
  into that driver's current terminal (as a modal) rather than a bare
  terminal picker — exact trigger/UX not fully speced, treat as a detail to
  nail down during implementation.

### Terminal tab (new — biggest net-new piece of this spec)

**Schema shipped 2026-08-10.** Migration
`supabase/migrations/20260810000000_terminal_racks_lanes_arms.sql` — applied
directly to the live DB this session (had direct Postgres write access via
the `pg` npm package, not just read — first time this project's had that
rather than routing through the Supabase SQL editor) and confirmed live via
a follow-up query: all three tables, the `allow_all_authenticated` RLS
policy on each, and the three `updated_at` triggers all present.
`terminal_racks` (rack naming + lane/arm layout config — count, reverse-
order, numeric/alphabetic per rack), `rack_arms` (one row per physical
lane × arm position, holding a `product_id` + free-text `status`), and
`rack_product_status` (rack-level product-out flag + last API/temp
reading). RLS on all three follows the `terminals`/`terminal_products`
precedent exactly (confirmed live via `pg_policies` before writing this,
alongside confirming `terminals` has no `company_id` at all — it's a
shared cross-company catalog, so no company-scoped role-check function
could apply here anyway): wide open to any authenticated user, with
"Edit Terminal" being hidden from drivers enforced in the UI only, same
risk profile equipment CRUD carried before its 2026-08-07 permission-split
migration. `rack_arms.status` is deliberately a loose nullable `text`
column, not an enum — the canned status list (e.g. "Arm Down," "No
Premium") isn't fully enumerated yet.

Also confirmed before writing this: `terminal_products.is_out_of_stock`
already exists but has never actually been set `true` by any code path
(grepped every reference — it's read/displayed and defaulted `false` on
insert only) and is terminal-wide, not rack-scoped, so it can't represent
"out at South Rack only" without changing its primary key. Left untouched
rather than repurposed — `rack_product_status` is a clean new table, not
a rack-scoped extension of the old column.

**Deliberately decoupled from the Planner** — confirmed with the user:
since the Planner doesn't ask the driver which rack they're loading at,
any in-Planner warning based on rack-level outages would be a guess (the
product could be fine at a different rack of the same terminal) and risks
training drivers to distrust the flag. No `rack_id`/`terminal_id`
awareness is being added to the load flow for this pass — the Terminal
tab is a standalone status board, checked manually, not reasoned about by
the planner. Revisit only once there's real usage data on how often
outages happen and how reliable the crowdsourced flags turn out to be.

**App code shipped 2026-08-11** (`app/calculator/terminal/`), committed and
pushed (`111fa80`): new universal Terminal tab (`page.tsx`) showing rack
sub-tabs + a lane/arm grid (`RackLaneGrid.tsx`) + the rack's product list;
`LaneStatusModal.tsx` (per-arm STUD, open to every role) and
`RackProductStatusModal.tsx` (rack-level STUD, feeds
`update_terminal_temp_bias` via `/api/fuel-temp`'s predicted temp, same
error computation `useLoadWorkflow.ts` already does); `EditTerminalModal.tsx`
(lead/dispatch/admin only, hidden from drivers — rack create/rename, product
list curation mirroring `ManageTerminalProductsModal.tsx`'s pattern against
`rack_product_status` instead of `terminal_products`, and lane/arm layout
config). `CalculatorLayoutClient.tsx`'s tab bar now has Terminal as a
universal tab; the shelved Lead/Dispatch/Admin role tabs and their
`ROLE_TABS`/`ROLE_TAB_ORDER` machinery were removed in the same pass (the
routes/components under `app/calculator/lead|dispatch|admin/` were left in
place, just no longer reachable from the tab bar — not deleted outright).

Lane/arm display labels (reversed order, numeric vs. alphabetic) are purely
presentational (`labels.ts`) — `rack_arms.lane_number`/`arm_number` are
always a stable 1-based physical position, never remapped; only the printed
label changes. This also makes resizing a rack's lane/arm count trivial
(`EditTerminalModal.tsx`'s layout save): insert blank rows for new tail
positions, delete rows beyond the new count, never touch existing ones.

`tsc --noEmit` is clean across the whole project.

**Fully live-verified 2026-08-04**, in a real logged-in session (this
session's own dev-server sandboxing issue never got resolved, but
`preview_start` with a plain `url` — pointing straight at the *other*
already-running chat's `localhost:3000` — worked once the user actually
logged in there). This surfaced three real bugs no amount of typechecking
would have caught, all fixed the same pass:

1. **A newly created rack never got its `rack_arms` grid seeded** — only
   happened when someone opened Edit Lane/Arm Layout and hit Save, so a
   fresh rack's Lane Map and product-assignment UI both silently rendered
   as if the rack had no arms at all. Fixed: `addRack()` now seeds the
   grid immediately at the table's own defaults.
2. **No UI existed to assign a product to a specific arm at all** — the
   rack's product list (`ProductsView`) and its layout config
   (`LayoutView`) never actually connected to individual `rack_arms` rows,
   so the Lane Map always rendered every cell blank regardless of setup.
   New `AssignArmsView` (reachable via a new "Assign Arm Products" button
   per rack) — this was a real gap in the original build, not a deferred
   scope decision.
3. **Tab bar navigation silently no-op'd** when toggling admin
   act-as-lead while sitting on `/calculator/dispatch` — see the "Roles &
   permissions" section below for the fix (it's really a tab-bar bug, not
   Terminal-tab-specific, but was caught testing this flow).

With those fixed, end-to-end confirmed working against real data: create
rack → seed grid → add product to rack's list → assign it to a specific
arm → Lane Map reflects it live → STUD a lane (Arm Down flag renders on
the grid) → STUD a rack product with API/temp → **confirmed a real
`terminal_temp_bias` row updated 5 seconds later** (not just that the
write succeeded, that the downstream RPC actually fired) → Edit Terminal
correctly hidden from context where it shouldn't show, present where it
should. Driver-role gating itself (hidden entirely, not just disabled)
is still only architecturally verified, not tested with a real
driver-role login — same category of gap this project has flagged
elsewhere for role-matrix checks.

Available to **all roles**, but with different capabilities:

- **Structure**: a terminal has one or more named **Racks** (e.g. "North
  Rack," "South Rack" — customizable names, some real-world racks are
  lettered instead). Each rack has **Lanes** (numbered in the mockup, but
  needs the same count/order customization as arms below) and each lane has
  **Arms** (count varies per facility, sometimes in reverse order, e.g. 6-1
  instead of 1-6). Each arm holds a product code (matches the existing
  granular product catalog) and a status.
- **Rack-level Product List**: shows every product available at that rack
  with live API/temp readings.

**STUD (= "status update") actions** — two distinct granularities, both
crowdsourced for this first pass (open to any role, including drivers — no
permission gate on *reading or submitting* a status update):
1. **Lane-level**: tapping a lane opens a "Lane N — Status Update" modal,
   one row per arm in that lane, each settable to a status like "Arm Down"
   or a specific out-of-stock note (e.g. "No Premium"). Use case: one
   specific arm is down/restricted, rest of the lane is fine.
2. **Rack-level**: the "STUD" button at the bottom of the rack screen opens
   a "Product Status Update" modal — pick a product, mark it e.g. "Product
   Out," enter API + temp. Use case: a product is out across the *entire*
   rack, not just one arm. **The API/temp entered here needs to feed the
   existing fuel-temp-bias system** (`terminal_temp_bias` /
   `update_terminal_temp_bias`) — same underlying data, new write path.
   Needs its own design pass to fit the existing bucketing (hour-of-day/
   month) — not just "add a row somewhere." **Resolved 2026-08-08, see
   "Rack-level STUD now writes through to terminal_products" below** — the
   temp-bias feed itself was already wired at launch; what was still
   missing was `terminal_products` itself.

#### Rack-level STUD now writes through to terminal_products (2026-08-08)

Found live, not reported as a bug report — while capturing real app
screenshots for the marketing landing page (see "Website / landing page
rework" below), the Terminal tab's own rack-level Product List kept
showing blank `API —` / `—°F` placeholders for a real, actively-used
terminal (Marathon, Tampa) even though the Planner's temp prediction for
that same terminal was clearly working (real predicted temp, real
`terminal_temp_bias` buckets). User's own diagnosis, confirmed live before
touching anything: **`rack_product_status`** (the table the rack Product
List actually reads) and **`terminal_products`** (the older, per-terminal
table the Planner's prediction pipeline and `useLoadWorkflow.ts` actually
read/write) are two separate tables that were never connected — the rack
feature launched with its own fresh table rather than reading or writing
the one already in use. Confirmed via direct query: of 28 total
`rack_product_status` rows across the whole live DB, 27 were null; North
Rack and South Rack at Marathon both had **zero** real readings on either
rack, even though `terminal_products` had real, recent data for the same
terminal (D2 36.8 API / 89.5°F, updated 2026-07-24, etc.) — so nothing was
"lost," the new table had just never been fed from the old one.

User's ask, and the actual fix: rack-level STUD submissions should be a
second way of updating the *same* shared "last known" value the Planner
already uses — global across every company, same as `terminals` itself —
not a parallel, rack-siloed side table. `RackProductStatusModal.tsx`'s
`save()` now does a `terminal_products` update-then-insert-if-missing
(same pattern `useLoadWorkflow.ts` already uses after a real load
completes: `last_api`, `last_temp_f`, `last_api_updated_at`,
`last_loaded_at`, `last_updated_by_load_id: null` since there's no load,
`updated_at`), including the same canonical-product pooling a dyed-diesel
STUD update needs (a variant pools onto its canonical product's
`terminal_products` row instead of forking its own) — `ProductLite` gained
`canonical_product_id`, sourced from the `products` table the same way
`ActiveComp` already does in `app/planner/types.ts`. Deliberately gated on
*both* API and temp being supplied together (same gate the existing
temp-bias call already used) so a partial STUD entry can never blank out a
previously-good value in the other column. `rack_product_status` itself is
untouched — still the thing the rack UI reads for display, just no longer
the only thing a STUD submission writes to.

**Live-verified 2026-08-08**: submitted a real STUD entry (51.2 API /
78.3°F) for ULSD Diesel #2 on Marathon's North Rack, then queried both
tables directly — `rack_product_status` and `terminal_products` both show
the new values under the same timestamp cluster, and the Terminal tab's
Product List immediately reflected it (previously blank `API —` row now
reads `API 51.2` / `78.3°F`). `tsc --noEmit` clean.

**Not done, flagged not guessed**: no backfill migration was run to seed
existing empty `rack_product_status` rows from `terminal_products`'
already-real values — the write-through fix means new STUD submissions
self-heal this going forward, but the ~26 remaining null rows across other
terminals stay null until either a real STUD submission or a real load
happens there. A one-time backfill was discussed but not run pending a
decision on scope (one terminal vs. every terminal in the live DB).

Crowdsourcing model is explicitly a v1/experiment — "we'll see how
crowdsourcing terminal statuses go." Long-term intent is terminal operators
eventually get write access with everyone else moved to view-only for
structural edits, but that's explicitly not this pass. Don't build any
operator-specific role for this yet.

**Edit Terminal** (structural configuration — separate from the STUD status
actions above):
- Name/create racks for the whole facility.
- Per rack: edit the active product list (this is effectively the
  previously-deferred punch-list item #9's admin-curated terminal product
  list — **treat item 9's old spec as absorbed into this**, don't build it
  separately), and edit lane/arm layout.
- Layout customization, same shape for both lanes and arms: a count input,
  a reverse-order toggle (icon: rounded-rectangle arrow, paired with a
  toggle switch), and a numeric-vs-alphabetic toggle ("123" vs "ABC"
  labeling — some racks/lanes are lettered, not numbered).
- **Permission**: hidden entirely from drivers (not just disabled). Lead,
  dispatch, and admin can all edit.

**Shipped 2026-08-04** (Dispatch tab, Cards/Terminal contextual behavior,
admin act-as-lead toggle, Driver Training). Built in one continuous pass per
explicit user direction ("keep rolling... I don't want to stop you to fix
anything you will naturally fix in the process") — punch-list review deferred
to the user rather than pausing per-feature. `tsc --noEmit` clean throughout.

**Fully live-verified 2026-08-04**, same real logged-in session as the
Terminal tab pass above. Found and fixed **one real bug**: toggling admin
act-as-lead while sitting on `/calculator/dispatch` relabels the middle tab
"Planner" without changing the URL — the tab bar's click handler compared
`t.id !== active`, and both the Planner and Dispatch tab variants
deliberately share `id: "planner"` (to keep active-tab detection simple
across the swap), so a click was silently treated as "already here, just
re-center" instead of navigating. Fixed by comparing the actual `pathname`
against `t.href` instead. End-to-end confirmed working with real company
roster data (6 real drivers, not demo placeholders): driver picker → real
identity/region/division render → schedule toggle persists
(`driver_schedules` row confirmed via direct query) → notes save on blur
(`dispatcher_notes` confirmed) → Cards tab correctly goes read-only
contextual **only when using real in-app tab navigation** (a full
`navigate()`-style page reload — not something a real user ever does by
tapping tabs — resets `CalculatorShellContext`'s in-memory
`selectedDriverId`, which looked like a bug during testing but isn't one)
→ Terminal tab correctly infers the selected driver's own most-recent-load
terminal (visibly different rack setup than the tester's own location) →
act-as-lead toggle + the tab-bar fix above → Driver Training picker
(correctly excludes self) → picking a trainee and tapping LOAD wrote a
real `load_log` row with `trainee_id` correctly set to the trainee, `user_id`
correctly staying the lead → canceling the test load cleanly deleted the
row (confirms the existing "planned row" cleanup path, not a new gap).
Test artifacts (a note, a schedule toggle) were cleaned up after verifying;
the test load was canceled, not completed, so no fake payroll/incentive
data was created. The Terminal tab's "North Rack" test setup at Global
South was deliberately left in place as a working example, not cleaned up.

**Not verified**: the trainee-side "Training with X" banner (needs a
second real driver-role login, not available this session — same
limitation this project already documents for other role-matrix checks)
and driver-role gating of Edit Terminal (architecturally sound, not
empirically tested with a real driver account).

### Terminal tab visual redesign (2026-08-04)

User provided a real mockup screenshot and a written punch list after the
first Terminal tab pass; this is a from-scratch redesign of the Lane Map
and its two STUD modals to match it, plus real schema changes it required
— migration `20260813000000_rack_arms_blenders_and_lane_status.sql`
(applied). `tsc --noEmit` clean; live-verified end-to-end in the same real
session (blender assignment, product-out toggle, and the circle-slash
"fully down" rendering all confirmed against actual DB state and a
screenshot, not just that the UI didn't crash).

- **Continuous lane numbering across racks** (`labels.ts`): a terminal's
  second rack no longer restarts at lane 1 — e.g. South Rack 1-5, North
  Rack continues at 6-10. Deliberately **derived, not stored**:
  `computeLaneOffsets(racks)` orders racks by `created_at` and sums
  `lane_count` running totals, so it can never drift out of sync with the
  racks list the way a stored offset column could if a rack's lane count
  changed later. `TerminalRack.created_at` added to the type (the column
  already existed in the original migration, just wasn't selected before).
- **No more letter option, for either lanes or arms.** The original build
  had `lane_alpha`/`arm_alpha` toggles; both removed from the UI (per
  explicit "we don't need a letter option for arms," extended to lanes too
  since a global continuous numbering scheme and per-rack lettering don't
  compose sensibly). The `lane_alpha`/`arm_alpha` **columns are still in
  the DB**, just unused going forward — not worth a migration to drop them.
- **Blender arms — up to 3 products on one arm.** `rack_arms.product_id`
  (single) → `product_ids uuid[]` (existing single assignments preserved
  via `array[product_id] where product_id is not null` during the
  migration, not discarded). `AssignArmsView` in `EditTerminalModal.tsx`
  changed from a `<select>` to multi-select toggle chips capped at
  `MAX_PRODUCTS_PER_ARM = 3`.
- **Structured Lane Down / Arm Down / Product Out, replacing the old
  free-text `rack_arms.status`.** Per explicit direction ("no need for a
  text field or clear button or slow fill button" — toggle buttons only):
  - New `rack_lanes` table (`rack_id, lane_number, is_down`) — lane-level
    down state didn't exist as a concept before this pass at all.
  - `rack_arms.is_down` (whole arm) + `rack_arms.out_product_ids` (which
    of *this arm's own* products are flagged out) replace the dropped
    `status` column.
  - `LaneStatusModal.tsx` rebuilt: a "Lane Down" toggle at the top, then
    per arm an "Arm Down" toggle plus one "{Product} Out" toggle per
    product currently on that arm.
- **Layered down/out rendering logic** (`RackLaneGrid.tsx`,
  reverse-engineered from the actual mockup screenshot, not just the
  written punch list — the image showed two visually distinct treatments
  that the text alone didn't fully specify): an arm renders **fully
  down** (a red circle-slash "no" icon over the whole column) when either
  `arm.is_down` is true, or *every* product currently on that arm is out
  for any reason — flagged out on this specific arm
  (`out_product_ids`), or out **rack-wide** via the bottom STUD button
  (`rack_product_status.is_out` for that product) — the two signals are
  read together, not stored redundantly. If an arm has multiple products
  and at least one is still available, only the individually-out
  product(s) get a plain strikethrough; the arm itself stays normal. This
  is why the mockup shows a lone product (Transmix, alone on its arm)
  circle-slashed while a two-product arm with one product out just shows
  a strikethrough on that one code — confirmed this reasoning against the
  screenshot pixel-by-pixel before writing the rendering logic, then
  reproduced the same visual live by marking one product out on a
  two-product arm (strikethrough, arm still normal) and then the second
  (arm flips to full circle-slash).
- **Product List polish**: added `products.description` to the row
  (matches the mockup's "(pipeline interface mixture)"-style annotations),
  wider gap between the API and temp columns, explicit "API —" / "—°F"
  placeholders instead of blank space when a product has no reading yet
  (per "always show" — the columns no longer shift depending on data
  presence), and the whole row dims + strikes through when
  `rack_product_status.is_out` is true (previously just an "OUT" badge).
- **`RackProductStatusModal.tsx` (rack-level STUD)**: API/temp fields now
  prefill from that product's own last reading when selected, instead of
  starting blank. Done button moved out of the sticky footer into normal
  content flow (`footer={null}`), per "move the done button up so it
  stays just under everything."
- **Sub-tab active color**: `CenteredSubTabs` now gets `accentColor="#ffffff"`
  on the Terminal tab's rack picker (was defaulting to the component's own
  cyan) — "sub tab should be white not blue."

**Not done this pass, flagged not guessed**: the mockup's header
("Marathon / 425 South 20th Street, Tampa, FL") wasn't touched — that's
the app's shared header chrome across every tab, not Terminal-tab-specific
content, and no street-address field exists anywhere in the schema
(`terminals` only has city/state/lat/lon). Read the punch list's itemized
asks as scoped to the tab's own content area (lane map + product list),
not a request to add fabricated address data or restructure shared chrome.

### Lane Status modal tightening + explicit lane/arm labels (2026-08-04, same day continued)

Two more rounds of feedback against a real screenshot, same session:

**Lane Status modal tightening**: `FullscreenModal` gained an optional
`headerRight` slot (purely additive — `min-w-[64px] flex justify-end`
replacing the old fixed empty spacer, so every other modal using this
shared component is unaffected). `LaneStatusModal.tsx`'s "Lane Down"
toggle moved there, out of a redundant content row that just repeated the
title. Per-arm rows collapsed further: the arm-level toggle relabeled
from "DOWN" to "ARM" so it reads as "which thing are you toggling" in
parallel with the product-code toggles next to it (`[ARM] [D2] [DYED]`),
rather than describing state redundantly against the row's own "Arm N"
label.

**Explicit lane/arm labels, replacing the count+reversed scheme entirely**
— migration `20260814000000_explicit_lane_arm_labels.sql` (applied). Root
cause: the original count+reversed model assumed every lane in a rack had
the same number of arms, which is false at real facilities. Rather than
bolt on a per-lane override, replaced the whole computed-labeling approach
with **explicit, directly-editable text** on `rack_lanes.label` /
`rack_arms.label`:
- `rack_lanes` was previously sparse (a row only existed once a lane's
  down-status had been touched); it's now the source of truth for which
  lanes exist at all, backfilled from every lane referenced by an existing
  `rack_arms` row.
- `terminal_racks.lane_count`/`lane_reversed`/`arm_count`/`arm_reversed`
  (and the already-unused `lane_alpha`/`arm_alpha`) are now **fully
  unused** — left in the DB rather than dropped, same call as the alpha
  columns before them. `TerminalRack`'s TypeScript type no longer carries
  them at all.
- `labels.ts` collapsed from `computeLaneOffsets`/`laneLabel`/`armLabel`
  down to one `displayLabel(label, fallback)` helper — the continuous-
  across-racks computation this replaced is gone entirely, not hidden
  behind a flag; full manual control made it unnecessary (an admin can
  retype a continuous number in seconds if they want one).
- `EditTerminalModal.tsx`'s Layout view rebuilt from a "set counts, hit
  Save" form into a **live-editing grid**: `+ Add Lane` / `+ Arm` per lane
  / `×` to remove either, and a `LabelInput` (tap-to-select-all, save on
  blur — same mobile-friendly "replace don't edit" pattern the STUD modal
  fields got earlier the same day) on every lane and arm. No separate
  save step — every action persists immediately, matching how
  `AssignArmsView`/`ProductsView` already worked.
- `RackLaneGrid.tsx` now enumerates lanes/arms from the actual
  `rack_lanes`/`rack_arms` rows rather than a rack-wide count, so lanes
  legitimately render with different arm counts side by side.

Live-verified end to end: added a 7th arm to one lane while removing one
from another (5 vs. 7 arms on adjacent lanes, both rendering correctly on
the live grid), renamed a lane's label to "A1" via tap-to-select-all, and
confirmed it immediately propagated to the Lane Map header badge, the
Lane Status modal's title, and the Assign Arm Products view — all three
read the same live DB value now, nothing cached or recomputed
separately. `tsc --noEmit` clean throughout both rounds.

**Two more gaps found and fixed during this same live-testing pass**
(2026-08-04, continued — not requested, found by exercising the feature
end to end rather than stopping once the requested items worked):
- **No way to delete a whole rack** — `RacksView` only ever had
  rename/reconfigure actions; a test rack created by mistake had no path
  to remove it. Added a "Delete Rack" action with an inline confirm step
  (matching the app's existing confirm-in-place pattern, e.g. Cards tab's
  deactivate/remove). `rack_lanes`/`rack_arms`/`rack_product_status` all
  reference `rack_id` as a plain column, not a DB-level FK with `ON DELETE
  CASCADE`, so the delete cascades manually in app code (children first,
  then the rack) — verified live via direct query afterward that zero
  orphaned `rack_arms`/`rack_lanes` rows were left behind.
- **The rack-wide "Product Out" STUD button's cascade to the Lane Map
  grid had only been reasoned through, not actually exercised** (earlier
  verification confirmed the DB write and the `terminal_temp_bias` feed,
  but not that the grid's "effectively down" logic correctly reads
  `rack_product_status.is_out` live). Marked "93" out rack-wide on a real
  multi-lane, multi-product rack (South Rack) and confirmed: every arm
  whose *only* product was 93 flipped to the full circle-slash, every
  arm carrying 93 *alongside* another still-available product (D2 or 87)
  correctly showed just a strikethrough on 93 with the arm otherwise
  normal, and the Product List row grayed out — all from the one toggle,
  no per-arm action needed.

- **Tab bar**: `CalculatorLayoutClient.tsx`'s middle tab is now genuinely
  contextual — `tabsFor(role, adminActingAsLead)` swaps in Dispatch (href
  `/calculator/dispatch`, same `id: "planner"` so active-tab detection stays
  simple) for dispatch role and admin role (unless acting-as-lead).
- **`shell.selectedDriverId`/`shell.adminActingAsLead`** (new, in
  `CalculatorShellContext.tsx`) — shared so Dispatch/Cards/Terminal agree on
  the same driver across tab switches without re-picking, and so the admin
  toggle is a single source of truth the tab bar, Planner, and Dispatch page
  all read.
- **`app/calculator/dispatch/page.tsx`** — fully replaced the old
  Dashboard/Tasks/Ledger placeholder (that content is gone now, not kept
  alongside). `DriverPicker.tsx` (new, shared component) to pick a driver,
  then: identity header (name, "Store {division}" — **`division` is a
  best-effort label for the mockup's "Store 495," not a confirmed match**,
  worth confirming the actual intended field if it matters; region/local_area
  already existed on `profiles`), an inline weekly-schedule editor (day
  toggles + shift time range, `driver_schedules`, new table), a terminal
  card list (status-only, reusing `terminal_access`/`user_terminal_cards`
  reads), an equipment + registration-expiry summary
  (`user_primary_trucks`/`user_primary_trailers` → `trucks`/`trailers`), and
  a notes box (`dispatcher_notes`, new table, staff-only per the spec — no
  self-read policy, so **a plain lead has no UI entry point to this page at
  all today** even though `dispatcher_notes`'s RLS already permits lead
  read/write; the Dispatch *tab* itself is only reachable by dispatch/admin
  roles via the tab bar. Flagged, not solved — a real gap if leads are
  expected to actually use these notes day to day.)
- **Cards tab, contextual** (`cards/page.tsx` + new `DriverCardsReadOnly.tsx`):
  when dispatch/admin has a driver selected, shows that driver's card
  status — **deliberately read-only**, not the "same controls as the driver"
  full parity originally described. Confirmed live before building that
  `user_terminal_cards` had *zero* admin/dispatch RLS access at all (only
  `owner_*` policies) — granting cross-user *write* access to another
  driver's card numbers/PINs is a real permission expansion, so this pass
  only added a read policy (`user_terminal_cards_admin_dispatch_read`,
  mirroring `terminal_access_admin_dispatch_read`'s exact shape) and built a
  status-only view, matching the precedent already set by
  `FleetCardsModal.tsx`/`FleetCredentialsModal.tsx` for this exact class of
  feature. Full write parity would need a deliberate follow-up decision, not
  something to assume.
- **Terminal tab, contextual**: when arriving with a driver selected
  (dispatch/admin context), the terminal shown is inferred from that
  driver's most recent `load_log` row rather than the viewer's own
  `location.selectedTerminalId` — there's no GPS/check-in signal to know
  where a driver physically is, so "most recent load's terminal" is the best
  available proxy, not a precise "where are they right now" signal.
- **`load_log.trainee_id`** (new column) + `load_log_select_trainee` RLS
  policy (narrowly scoped to `trainee_id = auth.uid()`, doesn't touch the
  existing own/admin-dispatch-read policies) — migration
  `20260812000000_dispatch_tab_and_driver_training.sql` (applied).

### Access Renewal Period field on Edit Terminal (shipped 2026-08-04)

User asked for a place to set the terminal card renewal/expiration period,
to feed the expiration notification system, on the Terminal tab. Turned out
**no new schema was needed** — `terminals.renewal_days` (int, default 90)
already exists live and already feeds every expiry computation in the app
(`useExpirations.ts`, `useTerminals.ts`, `ExpirationModal.tsx`,
`MyTerminalsModal.tsx`, `TerminalCatalogModal.tsx`, `FleetCardsModal.tsx`,
`DriverCardsReadOnly.tsx`, `dispatch/page.tsx` — all read `terminal.renewal_days
?? 90`), and was already editable in the old `/admin` console's own
`TerminalModal` (`app/admin/page.tsx`'s "Renewal Days" field). The gap was
narrower than the request implied: the *new* Terminal Tier's own
`EditTerminalModal.tsx` (the rack/lane/arm editor fleet staff actually use
now) had no field for it at all.

Added directly to `RacksView` (the top-level "Edit Terminal" screen) in
`EditTerminalModal.tsx`, above the rack list — per explicit user direction
("put it in the Edit Terminal modal because it applies to the entire
terminal," not per-rack. `EditTerminalModal` fetches/saves `terminals.renewal_days`
alongside its existing `terminal_racks` load (`loadTerminalInfo`/
`saveRenewalDays`, save-on-blur, same tap-to-select-all-adjacent numeric
input pattern already used elsewhere in this file), defaulting the input to
90 when the column is somehow null.

**Live-verified 2026-08-04** end-to-end against the real Global South
terminal — not just that the UI didn't error, that the write actually lands:
read initial value (90) via the app, edited to 45 through the real input
(tap-to-select-all + blur-to-save), confirmed via a direct service-role
Postgres REST query that `terminals.renewal_days` was actually 45 live (not
just reflected client-side), closed and reopened the modal to confirm a
fresh DB fetch also shows 45 (not a stale local echo), then reset back to 90
the same way and re-confirmed live. One real bug caught mid-verification
and self-corrected: an initial synthetic-event test dispatched a raw `blur`
event, which doesn't reach React's `onBlur` (React listens for the
bubbling `focusout` event, not `blur`, which doesn't bubble) — the input
visually updated (via the `input` event, which does bubble and does drive
`onChange`) but the save handler never fired, at first looking like a
false negative on the DB check. Switched to calling the real `.blur()` DOM
method (which the browser itself turns into a proper `focusout`), and the
write round-tripped correctly. No test data left behind — the terminal is
back at its real value (90) post-verification.

### Edit Terminal rework: bulk lane/arm tools + inline product assignment (shipped 2026-08-05)

Per a real mockup + written spec: "Assign Arm Products" is no longer a
separate top-level rack button — product assignment moved inline into the
Lane/Arm Layout flow (expand a lane card → "Lane N — Arm / Products"), and
Lane/Arm Layout itself gained bulk relabel/reorder tools on top of the
existing per-row manual rename from the 2026-08-04 explicit-labels rework
(that rework's own `rack_lanes.label`/`rack_arms.label` columns are
unchanged — this is new UI on the same schema, no migration needed).

**Design calls made, not directly in the spec text (documented here since
they weren't asked, just reasoned through against the mockup)**:
- Both "Alphabetical/Numerical" and "Reverse Order" are **bulk one-shot
  actions**, not persisted view modes — tapping them immediately rewrites
  every lane's (or, for arm-reverse, one lane's arms') `label` text in the
  DB, in current top-to-bottom (`lane_number`/`arm_number` ascending) order.
  Nothing about *which physical row holds which arms/products* ever moves —
  only the label text visible on that row changes. This is why reversing
  or relabeling never disturbs product assignments.
- "Reverse Order" is deliberately **generic**: it takes whatever label
  sequence currently exists (numeric, alphabetic, or custom text) and
  reverses that array across the same rows, rather than only working for a
  clean sequential series. Same operation for lanes (rack-wide) and arms
  (scoped to one lane, via the per-lane reverse icon).
- The "ABC"/"123" toggle's displayed state is **inferred from current
  data** (does the top-to-bottom label sequence already exactly match
  A,B,C...?) rather than tracked as separate persisted state — simpler,
  and self-corrects if labels are edited by hand in between. A reversed
  alphabetic sequence (E,D,C,B,A) won't match this ascending check, so the
  button reverts to offering "ABC" again rather than "123" — a known,
  accepted simplification, not a bug.
- Per-lane arm **count** is now a direct numeric field (type a number,
  arms are added/removed from the end to match) instead of individual
  "+ Arm"/"× arm" controls — replacing the old inline arm-chip row
  entirely. There is no more per-arm manual rename UI in this screen (the
  old small `LabelInput` per arm chip) — matching the mockup, which shows
  arm labels as plain text in the expanded product view, not an editable
  box. Existing custom arm labels still display via `displayLabel` and are
  still reachable indirectly through count-change + reverse. ~~A lane's
  own label chip did keep its manual rename input (`LabelInput`)~~ —
  **reversed same day**: explicit follow-up feedback, "the only in cell
  editing is for the number of arms" — the lane chip looked editable
  (boxed, tap-to-select-all styling) when it shouldn't have implied that;
  removed `LabelInput` and per-lane `renameLane` entirely, now a plain
  `<span>` like arm labels already were. Lane text is now only ever set by
  the bulk Alphabetical/Numerical/Reverse tools above, never hand-typed
  per row — consistent with there being no per-arm rename either.
- There is **no more per-lane delete button** — matching the mockup's lane
  row (no visible delete icon) — removal is now only via the top-level "−"
  (removes the highest `lane_number`, i.e. the last one), symmetric with
  "+" adding a new one at the end.
- The arm-product picker modal (opened by "+" on an arm) excludes only
  that **same arm's own** already-assigned products, not products used
  elsewhere in the lane — a product can legitimately sit on more than one
  arm at once (matches the existing "up to 3 products per arm" blender
  model; nothing in the spec said one-arm-exclusive).

**Live-verified end-to-end** against the real "Global South" terminal's
North Rack (careful to resolve the correct rack first — there are two
racks named "North Rack" across different terminals in this DB, Marathon/
Tampa and Global South/Fort Lauderdale; picked the wrong one on a first,
unfiltered query and caught it before drawing any conclusions from it):
tapped "ABC" — all 6 lanes relabeled A–F in order, arm counts stayed
attached to their original rows; tapped "Reverse Order" — labels flipped
end-for-end (F,E,D,C,B,A) with per-row arm counts unchanged, confirming
label content moved, not the underlying rows; edited one lane's arm-count
field from 7 to 3 — the 4 highest-numbered arm rows were deleted, kept
arm1/arm2's existing state; expanded that lane — "Lane F — Arm / Products"
rendered with 3 arm rows; tapped "+" on an empty arm — picker modal opened
scoped to only this rack's 2 active products (D2, DYED), grouped under
"DIESEL" exactly like the full catalog's own grouping; added D2 to it;
tapped "−" on the other arm (which had [D2, DYED]) — removed DYED (the
rightmost) first, leaving just D2, matching the "clear from the right"
spec exactly. Confirmed all of the above directly via Postgres query
against the correct rack_id, then manually restored every value back to
its real pre-test state (lane labels back to 1–6, arm count back to 7,
product assignments back to their original arm1=[D2,DYED]/arm2=[] shape)
since this is the persistent demo/QA rack other work in this session
already depends on, not throwaway data. `tsc --noEmit` clean throughout;
no console errors on a fresh (non-buffered) tab.

~~**Follow-up same day**: the per-lane "Reverse arm order" icon...~~ —
**superseded 2026-08-06, see below.** Moving the relabel tool into "Lane
N — Arm / Products" (so the effect was at least visible) turned out to
still not be what was actually needed — per explicit follow-up, the real
problem was never the arm *labels* at all.

### Arm order fixed at the display layer instead of via relabeling (2026-08-06)

Root feedback: "the reverse arm order isn't quite what I was hoping for...
in the main terminal card where we tap to STUD, the visual representation
of where arm 1 is matters. arm 1 is always on the right and the last arm
is always on the left." The whole relabel-based "reverse arm order" tool
(both its original per-lane-card location and its just-shipped relocation
into "Lane N — Arm / Products") was the wrong fix for the actual problem —
the Lane Map card was always rendering arm 1 leftmost, and no amount of
relabeling changes which physical column a product renders in.

**Fixed for real** in `RackLaneGrid.tsx` (the actual Lane Map card, "the
main terminal card where we tap to STUD") — `armsByLane`'s per-lane sort
flipped from ascending to **descending** `arm_number`, so arm 1 always
renders last (rightmost) and the highest-numbered arm always renders first
(leftmost), matching how real racks are physically laid out. `arm_number`/
`label` are untouched — this is a pure render-order change, nothing in the
data model moved. The "reverse arm order" relabel tool (button, state,
handler) was removed entirely from `LaneArmProductsView` — arm labels stay
a plain, permanent `1..N` sequence with no reverse tool needed for them at
all, since the actual ask was always about display, not data.

**Live-verified**: set Global South North Rack's lane 1 to D2-only on arm 1
and DYED-only on arm 7 (6 empty arms between), confirmed via the DOM that
render order is now DYED, then 5 blanks, then D2 — DYED (arm 7, highest)
on the left, D2 (arm 1) on the right, exactly as described — and via a
screenshot for a full visual check. Restored the demo rack back to its
real arm1=[D2,DYED]/arm7=[] shape afterward and confirmed the same card
still renders correctly (both products now rightmost, since arm 1 holds
both). `tsc --noEmit` clean; no console errors.

### Product List row: dropped parenthetical description, fixed a real overflow bug (2026-08-06)

Per explicit feedback: drop the `products.description` parenthetical
("(Ultra Low Sulfur Diesel #2)") from `app/calculator/terminal/page.tsx`'s
rack Product List row entirely; make the product name itself thinner --
same size/weight the parenthetical text used to have (`fontWeight: 400`,
`fontSize: 11`, still white) -- and guarantee API/temp never gets pushed
off-screen by a long name, with the name truncating instead if space runs
short.

**A real, separate overflow bug found and fixed while implementing
this** (not just the parenthetical's fault): even after removing the
parenthetical and giving the name `overflow: hidden` / `textOverflow:
ellipsis` / `minWidth: 0`, a synthetic long-name test still overflowed the
row past the viewport (confirmed via `getBoundingClientRect()` before
assuming the fix worked — row measured 573px wide inside a 404px viewport).
Root cause: each product row `<div>` is a grid item (its parent uses
`display: "grid"`), and grid items default to `min-width: auto`, which
sizes them to their content's max-content width regardless of any
`overflow: hidden` set *inside* them — the inner truncation styles were
correct but powerless because the outer grid item itself refused to
shrink below the long text's natural width. Fixed by adding `minWidth: 0`
to the row `<div>` itself (the actual grid item), not just its children --
the classic min-width:auto-on-grid/flex-items gotcha. Re-tested the same
synthetic long name afterward: row now measures 380px (within the 404px
viewport), name visibly truncates with an ellipsis, "API 50.6 / 75.6°F"
stays fully visible and right-aligned. `tsc --noEmit` clean; no console
errors; reverted the synthetic long-name DOM edit (an in-page-only test,
never touched real data) by simply reloading.

### Dispatch tab follow-up: real color bug fixed, explicit unit labels (2026-08-07, later same day)

Two real bugs reported after live use, both traced to the same root cause:
"the equipment section... showing registration expired 7 days ago, this is
incorrect... we also don't know which equipment it is for" and "the
terminal expirations are not showing proper colors."

**Investigated before assuming anything was wrong** (this repo's own
"verify live" rule): confirmed via a direct query that truck 25184's
`reg_expiration_date` genuinely is `2026-07-31` in the database (matches
what `/admin`'s own Edit Truck form shows), confirmed the claimed-combo
lookup was picking the right (only) combo `claimed_by` that driver, and
confirmed via `get_display_names_full` that combo's owner really is Seth
Perry -- so "-7 days" was arithmetically and data-wise correct; the
Equipment date itself was never wrong.

**The real bug**: this page's original color logic reused `cardTheme.ts`'s
shared `cardStateFor`, which fades anything expired more than 7 days ago
from "expired" (red) into a separate "inactive" state (gray) -- a
deliberate design in that shared function ("expired 7+ days mutes the
whole card," per its own comment), built for the Cards tab's own UX. But
the explicit ask here only ever put a day-limit on "expiring" ("expiring
in the next 7 days") -- "expired cards should show date in red" has no
day-limit at all. Under the shared function, ExxonMobil (-46 days) and
TransMontaign (-236 days) were both silently rendering gray instead of
red, exactly matching "not showing proper colors." Worse, this same
mismatch meant `collectExpiringPermits()`'s filter (which only ever
matched `cardStateFor`'s "expiring"/"expired" states, never "inactive")
would have silently dropped any permit more than 7 days overdue from the
Equipment list entirely, once the underlying date crossed that threshold.

Fixed with a local, page-only `expStateFor` (3 states: `expired` = any
`days < 0` with no cutoff, `expiring` = 0-7 days out, `valid`/`not_set`
otherwise) and a matching `DARK_EXP_COLOR` map, used everywhere on this
page instead of the shared `cardStateFor` -- deliberately NOT changed in
`cardTheme.ts` itself, since that function's 7-day decay is real, existing
behavior the Cards tab/`FleetCardsModal`/`FleetCredentialsModal` all still
rely on and weren't asked to change.

**Explicit unit labels**: `collectExpiringPermits()` now takes a
`unitLabel` ("Truck 25184" / "Trailer 3151", falling back to the bare
"Truck"/"Trailer" word if the unit somehow has no name) and bakes it
directly into each item's label ("Truck 25184 — Registration") instead of
the bare permit name alone -- directly answers "we don't know which
equipment it is for."

**Live-verified**: read every expiration line's actual computed CSS
`color` via `getComputedStyle` (not just screenshot judgment) before and
after the fix -- ExxonMobil/TransMontaign flipped from
`rgba(255,255,255,0.35)` (gray) to `rgb(239,68,68)` (red); the Equipment
line now reads "Truck 25184 — Registration" and stayed correctly red
(`-7` days was already `< 0` either way, so this item's color was never
actually wrong -- only its missing unit label was). Confirmed again after
a hard reload. `tsc --noEmit` clean. Two stale console errors
(`SimpleServiceModal is not defined`, `cardStateFor is not defined`)
surfaced mid-pass and were ruled out the same way prior stale-HMR errors
in this doc were: `tsc` clean, a `grep` confirming no live reference
remains, and the actual page rendering and computing correct values
immediately after, both before and after a hard reload.

### Dispatch tab follow-up #2: Equipment now reads equipment_permits, not the old columns (2026-08-07, same day)

User report: "still showing registration expired in dispatch but good in
the equipment modal." This **corrects** a conclusion from the
immediately-preceding note above -- that note's live check confirmed the
old `trucks.reg_expiration_date` column really was `2026-07-31` and called
the Equipment date "never wrong," but that was only checking internal
consistency (does the display match its own data source), not whether that
data source was still the right one to read.

A follow-up query against `equipment_permits` (the dynamic system the
Binder screen actually manages, joined to `permit_types`) found truck
25184's real, current "Registration" row at **2027-07-31** -- a full year
past the old column's stale `2026-07-31`. Someone renewed this permit
through the Binder at some point, which only ever writes to
`equipment_permits`; nothing writes that back to the old `trucks` column,
so the two silently diverged and Dispatch (reading the old column, per the
original design decision earlier this same day) kept showing an
expired date that had actually been fixed a year ago.

This directly reverses that earlier decision's own reasoning. The original
choice worried `equipment_permits` might be the stale one (per that
migration's own documented risk); live data showed the opposite is true in
practice for this real company -- the OLD columns are what's actually
abandoned, because the Binder (the tool people actually use to renew
permits) was migrated to the new system and the admin's plain date-input
form was not. `app/calculator/dispatch/page.tsx`'s Equipment section now
queries `equipment_permits` (`.eq("truck_id", ...)` / `.eq("trailer_id",
...)`, joined to `permit_types(name)`) instead of the hardcoded
`TRUCK_PERMIT_FIELDS`/`TRAILER_PERMIT_FIELDS` column lists, which are
removed entirely. This also means Dispatch now agrees with
`useExpirations.ts` (the header bell badge), which already read
`equipment_permits` -- previously the two could disagree about the same
truck's same permit.

**Live-verified**: truck 25184's Equipment section now shows "Nothing
expiring soon" (correctly reflecting the real 2027-07-31 date) instead of
the stale "Truck 25184 — Registration, 07-31-2026 (-7 days)" in red.
Kyle Tatro's empty-equipment case re-checked and still renders cleanly (no
crash from the new `equipment_permits` queries when `truckId`/`trailerId`
are both null). `tsc --noEmit` clean; no new console errors beyond the
same already-documented stale-HMR ones.

### Dispatch tab rework: city-grouped cards, Badges + Credentials sections, Equipment moved up (2026-08-07)

Per explicit request against `app/calculator/dispatch/page.tsx`:

- **Terminal Cards grouped by city** -- `cardsByCity` (`useMemo`) buckets
  `filteredCards` by `city` (falling back to a "No City" bucket, sorted
  last so real cities always lead), rendered as a city subheading per
  group. Search still filters across name/city/state first, city grouping
  happens on whatever survives the filter.
- **Same color scheme everywhere on this page** -- already had a
  dark-background `DARK_EXP_COLOR` override of `cardTheme.ts`'s
  `cardStateFor` (expiring within 7 days = amber, expired = red, expired
  7+ days = gray/"inactive", no date = gray/"not_set"); this pass reuses
  the exact same `cardStateFor`/`DARK_EXP_COLOR` pair for every new
  expiration line added (Badges, Credentials, and the new per-permit
  Equipment lines) via one shared `ExpirationLine` component, instead of
  each section growing its own copy.
- **New Badges section** (`driver_port_ids` -- port_name/category/
  expiration_date), directly under Terminal Cards. **New Credentials
  section** (License/Medical/TWIC -- `driver_licenses`/
  `driver_medical_cards`/`driver_twic_cards`, `expiration_date` only)
  directly under that. Both reuse the exact same admin+dispatch RLS
  `FleetCredentialsModal.tsx` already relies on
  (`supabase/migrations/20260806000000_dispatch_credential_visibility.sql`)
  -- no new migration needed, this is a second consumer of an existing
  grant, not a new one.
- **Equipment moved above Terminal Cards**, and switched its equipment
  source from "primary" (`user_primary_trucks`/`user_primary_trailers`) to
  whatever the driver has **actually claimed right now**
  (`equipment_combos` where `claimed_by = selectedDriverId`, most recent
  `claimed_at`) -- "primary" is a separate fallback-default concept (same
  one `useEquipment.ts`'s own header comment distinguishes), not "what
  they're driving today"; reading it here would show stale/wrong equipment
  for a driver who slip-seated into something else since it was set. This
  is the same signal `useEquipment.ts` itself derives setup-mode selection
  from (`combos.find(c => c.claimed_by === effectiveUserId)`), just read
  from the dispatcher's side instead of the driver's own device.
- **Equipment now lists every expiring/expired permit item**, not just
  truck registration -- `TRUCK_PERMIT_FIELDS`/`TRAILER_PERMIT_FIELDS`
  (module-level label configs mirroring `EquipmentDetails.tsx`'s
  `PermitEditRow`/`TankEditRow` call sites exactly: Registration, Annual
  Inspection, IFTA, PHMSA, Alliance, Fleet Insurance, HazMat License, Inner
  Bridge for trucks; Trailer Registration, Annual Inspection, and all
  seven Tank inspections for trailers), `collectExpiringPermits()` filters
  each unit's full field set down to only `cardStateFor` "expiring"/
  "expired" entries, sorted soonest-first.

  **Deliberately reads the OLD hardcoded `trucks`/`trailers` expiration
  columns, not the newer `equipment_permits` table** -- checked both live
  before choosing: a direct query confirmed `equipment_permits` rows exist
  for truck 25184 and their dates matched the old columns' values, *but*
  `supabase/migrations/20260723000000_permit_types_binder.sql`'s own
  header comment states the fleet-tier admin screen
  (`EquipmentDetails.tsx`'s `TruckModal`/`TrailerModal` -- confirmed via
  code read this session to be the actual, only edit path both solo and
  fleet companies use) "keeps reading/writing the OLD columns" and flags
  `equipment_permits` going silently stale as an accepted, known risk if a
  company only ever uses that form. Rather than build Dispatch's Equipment
  section on a table that migration's own author already flagged as able
  to silently drift from what admins actually edit, this reads the exact
  same columns `EquipmentDetails.tsx` writes -- guaranteed to agree with
  what dispatch/admin see and change in the Equipment modal, no
  independent-staleness risk.

**Live-verified** against the real Gemini Motor Transport company: Seth
Perry (real equipment/cards) shows Equipment above Terminal Cards
("Truck · 25184 / Trailer · 3151", one expired item -- "Registration
07-31-2026 (-7 days)" in red, correctly at the exact -7-day expired/
inactive boundary), Terminal Cards grouped into "FORT LAUDERDALE" (7
terminals) and "TAMPA" (7 terminals) subheadings, Badges showing two real
port badges, Credentials showing real License/Medical/TWIC dates -- colors
screenshot-confirmed (red for the expired item, gray for entries expired
7+ days like ExxonMobil/TransMontaign, plain white for valid/not-yet-
within-7-days entries like Global West's 10-days-out card). A second
driver with zero data on file (Kyle Tatro) confirmed every section's empty
state renders cleanly ("No equipment currently selected," "No terminal
cards on file," "No badges on file," "Not on file" ×3 for credentials) --
no crashes, no leaked data from the previous driver. `tsc --noEmit` clean;
no new console errors (same pre-existing stale dev-server errors already
documented elsewhere in this file, confirmed unrelated).

### Service type/interval editing shared across solo and fleet tiers (2026-08-07)

User feedback, in order: "in the equipment modal I can't find where we set
service intervals" (answered live -- it's the "−" edit affordance on each
option in the Type dropdown inside the Service modal, only reachable from
`SoloEquipmentModal.tsx`'s Service button, since that's where the whole
feature was originally built), then, on their own real company ("Gemini" --
confirmed via a direct `companies` query, `is_solo = true`): "can we make it
the same for all? I think everyone should be able to edit," plus a second,
independent ask: the equipment picker's report-section "next service due"
line should show the soonest due of ANY logged type, not just whichever
type happened to be logged most recently.

**Root cause of the "make it the same for all" gap**: `ServiceTypeEditorModal`/
`ServiceTypeSelect`/`SimpleServiceModal` (create a service type, set its
interval, log a service against it) only ever existed inline inside
`SoloEquipmentModal.tsx`. Confirmed via a repo-wide grep of every
`service_types`/`service_records` write: literally the only insert/update
path in the whole app. The fleet-tier equipment editor
(`lib/ui/driver/EquipmentDetails.tsx`'s `TruckModal`/`TrailerModal`, used by
both `/admin`'s Equipment section and non-solo companies' Planner "Select
Equipment" sheet) had no service UI at all -- `RecordHistoryModal.tsx`
(Reports hub's "Service History") only ever reads/edits existing rows, never
creates one. So a fleet (non-solo) company had zero way to log a first
service or configure an interval, regardless of role.

**Fix**: extracted `ServiceType`, `ServiceTypeEditorModal`, `ServiceTypeSelect`,
`SimpleServiceModal`, and a `fetchServiceTypes()` helper into a new shared
file, `app/calculator/modals/ServiceTypeManager.tsx` -- same reasoning
`lib/ui/CustomSelect.tsx`'s own header comment already gives for why this
kind of thing gets pulled out instead of copy-pasted per-tier ("duplicating
this per-file is how the bug crept back in once already"). `SoloEquipmentModal.tsx`
now imports from there instead of defining its own copies (one real bug
caught in the extraction: `ServiceTypeSelect`'s dropdown button had been
using the plain `inputStyle`, not the chevron-icon `selectStyle` variant the
original used -- fixed before it shipped, not after).

Added a new `ServiceSection` component directly in `EquipmentDetails.tsx`,
wired into both `TruckModal` and `TrailerModal` (`!isNew` only -- needs a
real unit id) as a "Log Service / Manage Service Types" button opening the
same `SimpleServiceModal`. **Deliberately not gated by `canEditRestricted`**
(the admin/dispatch/lead-only gate every other restricted field on this
modal uses) -- per explicit user direction ("everyone should be able to
edit"), matching the solo flow's own precedent, which was never role-gated
either.

**Report-section "next due" fix** (`SoloEquipmentModal.tsx`'s
`computeUnitServiceDue`): previously picked whichever service type had the
most recently LOGGED record for that unit (by date, then `created_at` to
break same-day ties) and showed that type's own due state -- which could
surface a type due months away while a different type logged earlier was
actually due imminently. Rewritten to compute a due candidate for every
type with at least one record (`duration` → real due date; `miles`/`hours`
→ absolute due reading) and pick the soonest **within its own kind** --
comparing raw due-mileage or due-hours across types for the SAME unit is
still valid without live odometer/engine-hour telemetry (this app doesn't
track either), since it's the one monotonically increasing counter for that
unit ticking toward each threshold; a due DATE and a due READING aren't the
same unit of "soon" though, so when both exist for a unit, `duration` wins
as the more universally actionable of the two. Types with no computable due
(`interval_kind: "none"`, or a `miles`/`hours` type missing its reading)
only get shown as a last-resort fallback (most-recently-logged, same as the
old behavior), and only when nothing else on that unit has a real due
candidate at all.

**Live-verified against the real "Gemini Motor Transport" company** (not a
demo/test company -- confirmed `is_solo = true` via direct query, which is
why the Planner's "Select Equipment" still routes through `SoloEquipmentModal`
for it today):
- Fleet path: `/admin` → Equipment → Edit truck 25184 → "Log Service /
  Manage Service Types" now present and working -- opened the Type dropdown
  (existing "Dry"/"Wet" types with their edit affordances + "+ New type"
  rendered correctly), opened "Edit Service Type" for "Dry" (Miles / 65000 /
  Truck only), closed without changes.
- Solo path regression check: same truck (25184) via the Planner's Select
  Equipment sheet -- Service modal still opens and behaves identically to
  before the extraction.
- Next-due fix: truck 25184 has both a Dry record (due at 291,086 mi) and a
  Wet record (due at 326,442 mi, and the one more recently logged). Report
  line now reads "Truck · Dry / Due at 291,086 mi" -- the lower (sooner) of
  the two -- where it previously read "Truck · Wet / Due at 326,442 mi"
  purely because Wet was logged more recently. Confirmed both before and
  after a hard reload (not just a warm client nav).

`tsc --noEmit` clean throughout. One console error surfaced mid-pass and
persisted across a hard page reload -- `ReferenceError: SimpleServiceModal
is not defined` -- initially concerning since it survived a reload, but
ruled out as a real regression: `tsc --noEmit` stayed clean the whole time,
a direct `grep` confirmed no stale reference exists in any source file, and
the exact flow the error name implies would break (opening the Service
modal) was exercised successfully multiple times, in both the solo and
fleet paths, both before and after the reload, with the modal rendering its
full form every time -- consistent with this project's own documented
Turbopack/dev-server HMR staleness category (see "Dev-server stale-content
trap" earlier in this doc), not a genuine break. Worth a real dev-server
restart to fully clear if it resurfaces.

### Tab order swap + tab-switching "glitch" fix (2026-08-06)

Two small follow-ups, per explicit request:

- **Tab order**: Terminal and Dispatch swapped places in
  `CalculatorLayoutClient.tsx`'s `tabsFor()` so Terminal sits directly next
  to Planner (order is now Dispatch, Terminal, Planner, Cards, Vault for
  admin/super-admin; Dispatch, Terminal, Cards, Vault for dispatch role,
  which has no Planner tab regardless). Driver/lead order (Terminal,
  Planner, Cards, Vault -- no Dispatch tab at all) is unaffected.
- **"Dark mode flashes white then corrects" on tab switch** -- user's own
  diagnosis was exactly right, and pointed at two real, separate bugs, both
  in `CalculatorLayoutClient.tsx`/`hooks/useTheme.ts`, not something
  imagined:
  1. `useTheme.ts`'s `darkMode`/`accentColor` used to start at hardcoded
     defaults (`false`/`null`) and only get corrected once `authUserId`
     resolved (async, from `supabase.auth.getUser()`) and its effect ran --
     a textbook flash-of-default. Fixed by also mirroring the last-applied
     theme under a new userId-independent `protankr_theme_v1:__device__`
     key, read synchronously in the initial `useState` (lazy initializer) --
     same-device return visits now start correct immediately, no async
     wait. The per-user-keyed effect still runs afterward and corrects it
     if a genuinely different account's saved theme differs; nothing about
     the existing per-user persistence changed.
  2. Header's `<meta name="theme-color">` sync effect had a cleanup
     function that reset the tag to `"#ffffff"` -- React fires an effect's
     cleanup before *every* re-run of that effect (i.e. on every
     darkMode/accentColor change), not only on true unmount, so this was
     silently doing "flash white, then set the real color" on every single
     theme-relevant re-render, which is a strict superset of every tab
     switch. There was nothing to actually clean up: Next's own per-route
     metadata already reapplies whatever static `viewport.themeColor` a
     *different* layout declares once the user genuinely navigates away
     from `/calculator` (handled declaratively, not by this component) --
     removed the reset-in-cleanup entirely.
  Also added, defensively: a `transition: "background 200ms ease"` on the
  header's own gradient div (so any future legitimate theme change fades
  instead of snapping), and `router.prefetch()` for every tab's href in
  `TabBar` on mount, so `router.push` on tap is served from the already-
  fetched RSC payload instead of a fresh network round trip -- addresses
  the "speed the transition" half of the request, separate from the
  flash-of-white fix.

**Live-verified**: installed a `MutationObserver` on the real
`<meta name="theme-color">` tag with dark mode + a custom accent enabled,
then clicked through every tab (Terminal → Cards → Vault → Dispatch →
Planner) -- zero mutations recorded (stayed at the correct `#2a2a2c`
graphite value the entire time; previously, before this fix, this exact
sequence would have fired a white-then-graphite pair on every single
click via the cleanup bug above). Confirmed via a fresh hard reload too
(cold load, not just a warm client nav) that the meta tag is correct
(`#2a2a2c`) immediately, no flash window at all. `tsc --noEmit` clean.

### Terminal tab: clickable location header, compact sub-tabs, flatter down/out styling (2026-08-06)

Four small follow-ups against the main Terminal tab (`app/calculator/terminal/page.tsx`,
`RackLaneGrid.tsx`), per explicit request:

- **Clickable terminal/city header, shared with the Planner.** Rather than
  building a second copy of the Location/Terminal picker for this tab (risking
  the same "two independently-drifting copies" class of bug this project has
  hit before -- see `CustomSelect.tsx`'s own header comment), `LocationModal`/
  `MyTerminalsModal` were hoisted out of `page.tsx` (Planner) into `ShellChrome`
  (`CalculatorLayoutClient.tsx`), the same place `EquipmentModal`/
  `ExpirationModal` already live as single shared instances. Everything those
  two modals needed that wasn't already shared (`locOpen`/`statePickerOpen`/
  `expandedTerminalId` open-state, city-star favorites +
  `stateOptions`/`selectedStateLabel`/`selectedStateName`/`cities`/
  `topCities`/`allCities`) moved into `CalculatorShellContext.tsx` too --
  `shell.location` was already the one shared `useLocation()` instance, so
  this was "finish the hoist," not a new architecture. The Terminal tab's new
  header (`{terminal name in white} {city, state in gray}`, just under the
  rack sub-tabs) is a plain button calling `shell.setTermOpen(true)` (or
  `shell.setLocOpen(true)` if no location is set yet, mirroring the Planner's
  own step logic) -- tapping it opens the literal same `MyTerminalsModal`
  instance the Planner's own "Select Terminal" card opens, so picking a
  different terminal from either tab updates both immediately (no separate
  sync mechanism needed, since both read/write the one `shell.location`).
  Non-interactive (plain text, no button) when viewing a driver's
  auto-inferred terminal in dispatch/admin context -- tapping it there would
  silently change the *viewer's* own location, not the driver's, which isn't
  what "same modal" should mean in that context. `TerminalCatalogModal`
  (confirmed dead code -- never opened anywhere in the current Planner flow,
  `catalogOpen` is set to `true` nowhere) was left exactly where it was,
  Planner-only, not worth resurrecting into the shared move.
- **Compact sub-tabs + active-rack dot.** `CenteredSubTabs.tsx` gained two
  opt-in props, `compact` and `showActiveDot` (both default `false`, so the
  Lead/Dispatch/Admin shelved-route consumers render unchanged) -- smaller
  flex-basis/font-size, plus a small dot rendered under the active tab's
  label instead of relying on color/weight alone. Terminal tab's rack picker
  passes both.
- **Lane-down: text color, not a solid fill.** `RackLaneGrid.tsx`'s lane
  number/letter cell no longer fills its whole background red when
  `lane.is_down` -- the cell background stays the normal
  `rgba(255,255,255,0.08)`, only the label text itself turns red.
- **Arm-down: a red horizontal line, not a circle-slash icon.** The old
  `NoSymbol` SVG (a red circle with a diagonal slash, one per fully-down arm)
  is gone. A fully-down arm (`isArmDown()` -- explicitly flagged, or every
  product on it out) now renders a single red horizontal line straight
  through its whole product stack instead. Untouched: a single out product
  on an otherwise-fine multi-product arm still just gets its own
  strikethrough in its own color, arm stays normal -- that per-product logic
  never changed.

**Live-verified** against the real Global South terminal: header renders
"Global South" (white) / "Fort Lauderdale, FL" (gray) under the rack
sub-tabs; tapping it opens the same My Terminals list the Planner's own
location card opens (confirmed by opening it from both tabs). Sub-tabs
render smaller with a white dot under North Rack. Toggled a real arm's
"ARM" (down) flag via the Lane Status modal and confirmed live: the red
horizontal line renders across that arm's full D2/DYED stack (screenshot-
confirmed), reverted immediately after. Lane 6's own down-state (pre-
existing test data) confirmed the number "6" renders in red text on the
unchanged gray cell background, not a red fill. `tsc --noEmit` clean
throughout the refactor. One batch of "defined multiple times" console
errors surfaced mid-pass in the dev tab -- confirmed via a fresh hard
reload (page rendered correctly, no `nextjs-portal` error dialog present
afterward) and a direct `grep` of the file (no duplicate declarations
exist on disk) that this was the dev server's own documented hot-reload
staleness, not a real regression.

### Continue Numbering From (cross-rack lane continuation) + terminal/rack tag (2026-08-06)

Two small additions to `LayoutView` (Lane/Arm Layout), per explicit
follow-up against a screenshot with the empty space next to the
Alphabetical/Reverse Order controls circled:

- **"{terminal} — {rack}" tag** above the Add/Remove Lanes control (e.g.
  "Global South — North Rack") so it's unambiguous which rack is being
  edited — `terminalName` is threaded down from `EditTerminalModal` (which
  already had it as a top-level prop, just never passed it further).
- **"Continue numbering from" dropdown**, listing every *other* rack at
  this same terminal (`siblingRacks`, computed in `EditTerminalModal` as
  `racks.filter(r => r.rack_id !== selectedRack.rack_id)` and passed down)
  — picking one immediately relabels every lane on *this* rack to a fresh
  numeric sequence continuing from the selected rack's current lane count
  (e.g. South Rack has 5 lanes → North Rack picking "South Rack" relabels
  its own lanes 6, 7, 8...). This replaces the old, fully-removed
  `computeLaneOffsets` auto-continuation from the 2026-08-04 explicit-labels
  rework (which silently chained every rack by creation order) with an
  **explicit, one-shot bulk action** — per the user's own reasoning, "some
  terminals may have three or more racks in different areas," so a blind
  auto-chain isn't always correct; the admin has to say which rack (if
  any) precedes this one. Same category as the existing Alphabetical/
  Reverse Order tools: not a persisted relationship (so it can't silently
  drift if the preceding rack's count changes later), offset is read fresh
  via a `count`-only query against `rack_lanes` at the moment it's applied,
  and the dropdown resets to "— None —" after firing rather than "sticking"
  on the picked rack. The whole control (and its column in the layout
  grid) only renders when the terminal actually has more than one rack.

**Live-verified**: opened North Rack's Lane/Arm Layout at the real "Global
South" terminal — tag correctly read "Global South — North Rack" and the
dropdown correctly listed only "South Rack" (its one sibling, not itself).
Confirmed South Rack's real lane count (5) via direct query first, then
selected it from the dropdown — North Rack's 6 lanes correctly relabeled
6,7,8,9,10,11 (verified via Postgres, not just the UI), dropdown reset to
"— None —" afterward, no console errors. Restored North Rack's labels
back to 1–6 immediately after (this session's own test artifact, not real
data) — left South Rack and North Rack's arm/product assignments
untouched throughout, including one arm's product state that turned out
to already differ from what an earlier pass in this same session had
left it at — traced that to the user's own hands-on testing between
turns, not anything of mine to "fix" back. `tsc --noEmit` clean.

**Follow-up fixes, 2026-08-06** — five more issues from a live screenshot of
the shipped dropdown:
- **White-on-white dropdown** — the native `<select>` was still subject to
  the same "open option list is rendered natively by the OS/browser and
  ignores dark theming" issue this codebase already has a shared fix for
  (`lib/ui/CustomSelect.tsx`, built during the earlier Terminal-tab pass
  specifically for this). Swapped the native `<select>` for `CustomSelect`
  — no new component needed, just wasn't used here originally.
- **Selection not sticking** — root cause: the dropdown's value was backed
  by an ephemeral `useState` that got reset to `""` after every
  `applyContinueFrom` call, so a correct relabel always visually "reset to
  None" even though the DB write succeeded. Replaced with a derived
  `matchingSiblingId` (`useMemo`, same "infer from live data" pattern
  `isAlphabetized` already uses elsewhere in this file) — fetches each
  sibling's own current lane count via a new `siblingInfo` effect, then
  checks whether this rack's current lowest label equals `siblingCount +
  1`. Self-correcting: reflects reality every render, can't drift out of
  sync with a manual edit the way stored "last picked" state could.
  Live-verified: North Rack (currently continuing from South Rack, labels
  6–11) reopened this control and the dropdown showed "South Rack"
  pre-selected, not reset to blank.
- **Circular reference prevention** — new `selectableSiblings` (`useMemo`)
  excludes any sibling whose own current lowest label already equals THIS
  rack's lane count + 1 (i.e. already continues from this rack) — picking
  it back would create a direct two-rack cycle. The whole "Continue from"
  control (not just the option) is hidden entirely when zero siblings
  remain selectable — live-verified: South Rack's own Lane/Arm Layout
  (whose only sibling, North Rack, already continues from it) now shows no
  "Continue from" control at all.
- **Label + responsive wrap** — "Continue numbering from" shortened to
  "Continue from" (fits one line). The controls row changed from a
  `1fr auto` CSS grid (which pushed the dropdown off-screen on narrow
  viewports since grid item widths don't reflow) to `display:flex,
  flexWrap:"wrap"`, with `minWidth:0` on the left button column (the same
  flex/grid `min-width:auto` overflow gotcha documented earlier this
  session for the Product List row, applied here preemptively) — on a
  narrow screen the dropdown now wraps to its own line below the lane
  controls instead of being clipped off the right edge. Live-verified at
  403px mobile width: dropdown renders fully on its own line, not clipped.

All five live-verified together in one pass against the real Global South
terminal (North/South Rack), `tsc --noEmit` clean, no new console errors
(one stale 400 present in the console buffer was confirmed unrelated —
present before this pass, consistent with this project's documented
"console never resets for the tab's lifetime" behavior).

**Lane cards now tap-anywhere-to-expand, 2026-08-06** — per explicit
follow-up: "make each card tap-able to open from anywhere in the card
(except the arm count cell of course)... Right now you have to tap the
tiny arrow." `LaneRow`'s outer container gained `role="button"`,
`tabIndex={0}`, and `onClick={onExpand}` (+ Enter/Space `onKeyDown` for
keyboard/a11y parity); the arm-count `<input>` gained
`onClick={(e) => e.stopPropagation()}` so tapping/focusing it to edit the
count no longer bubbles up and triggers the expand; the trailing chevron
lost its own `onClick`/button semantics (now a plain decorative `<span
aria-hidden>`) since the click naturally bubbles to the card's own
handler — kept as a visual affordance only, not a second click target.
Live-verified: clicking anywhere on a lane card's body (label, "Arms"
text, chevron, blank space) opens straight into "Lane N — Arm / Products";
clicking directly into the arm-count textbox only focuses/selects it
(confirmed via `document.activeElement`) without navigating away from the
Lane/Arm Layout list. `tsc --noEmit` clean.

### Cards tab: full look-and-edit parity for dispatch/admin (shipped 2026-08-04)

Per explicit user direction: "all the cards should look identical for every
role. the only difference is whose cards they belong to. that gets
determined on the dispatch tab by the driver selected." This directly
supersedes the original 2026-08-04 Dispatch-tab Cards decision
(`DriverCardsReadOnly.tsx`, a separate simplified status-only list) — that
component is now deleted. Scope confirmed explicitly before building (asked,
not guessed, given the sensitivity of the permission expansion): **all
three** Cards sub-tabs (Terminals, Badges, Credentials) get full edit
parity, not just Terminals, and dispatch/admin get real write access (not
just an identical-looking read-only view) — reversing the earlier
`FleetCredentialsModal` "status-only, not full record access" scope-down
for this specific in-context-editing flow (`FleetCredentialsModal.tsx`
itself is untouched, still status-only — this is a different, new editing
surface).

**Migrations applied** (live pg_policies queried before writing either, per
this repo's own rule):
- `20260815000000_dispatch_cards_write_parity.sql` — `my_terminals` had
  *zero* admin/dispatch access at all before this (confirmed live); added
  full SELECT/INSERT/UPDATE/DELETE. `terminal_access`/`user_terminal_cards`
  already had the admin/dispatch READ policy from the original Dispatch-tab
  migration; added the missing INSERT/UPDATE/DELETE. All ten new policies
  mirror the existing read policies' exact `EXISTS`-via-`user_companies`
  shape, scoped to admin+dispatch only (not lead — lead never reaches this
  contextual view, the Dispatch tab itself is admin/dispatch-only).
- `20260815010000_dispatch_credential_write_parity.sql` — a genuine
  surprise found while verifying live state first: `driver_licenses`/
  `driver_medical_cards`/`driver_twic_cards`/`driver_port_ids` **already**
  each had an admin-only `ALL` policy (`dl_admin` etc.) that isn't scoped to
  the row's own `user_id` at all — just checks the *querying* user is a
  company admin for that row's `company_id` — so any company admin already
  had full CRUD on every driver's credential record before this pass; only
  **dispatch** write was the actual gap. Added one purely-additive
  `xx_dispatch_write` policy per table, mirroring `xx_admin`'s exact shape
  for `role = 'dispatch'`.

  **Noted in passing, deliberately NOT fixed (pre-existing, out of scope)**:
  `xx_own` on all four credential tables is SELECT-only — there is no
  own-row INSERT/UPDATE/DELETE policy at all, meaning a non-admin driver's
  own Credentials-tab save should fail under RLS today unless they happen
  to be their solo company's sole admin (solo companies are always
  `role = 'admin'`). Flagged, not chased further this pass — same category
  of "found while verifying something else" gap this project has surfaced
  several times before.

**App code**:
- `app/calculator/cards/page.tsx` (Terminals): `isDispatchContext` now
  drives a second `useTerminals(driverId, ...)` hook instance (safe to
  always call per rules-of-hooks; a no-op whenever `driverId` is empty) plus
  a new local `useDriverCardData(userId)` hook mirroring
  `CalculatorShellContext.tsx`'s own `cardDataByTerminalId`/
  `setCardDataForTerminal_` shape but parametrized by an arbitrary target
  user instead of `effectiveUserId` — a second independent copy is correct
  here (not the desync risk hook-hoisting exists to avoid elsewhere),
  since the whole point is that dispatch/admin and the viewed driver never
  share this state. `TerminalCard`'s `onSelect` prop is now optional (hidden
  in dispatch context — "Select" sets the *viewer's own* current-terminal
  state and navigates to the Planner, which has no meaning when looking at
  someone else's cards), and a new `walletLabel` prop feeds the
  Deactivate/Remove confirm copy ("Remove this card from Kyle Tatro's
  wallet?" instead of "your wallet"). `DriverCardsReadOnly.tsx` deleted.
- `app/calculator/cards/badges/page.tsx` / `credentials/page.tsx`: simpler
  than Terminals since these tables already had explicit
  `.eq("user_id", ...)` filters — swapped `effectiveUserId` for a
  `targetUserId = isDispatchContext ? shell.selectedDriverId :
  effectiveUserId` throughout, and insert calls now use `shell.companyId`
  (already resolved for the viewer) instead of a separate per-page
  `user_settings` lookup. Both gained the same "Viewing {driverName}'s
  badges/credentials" header note as Terminals.

**A real, separate bug found and fixed while live-verifying this** (not
present before this pass — introduced by the new RLS, caught immediately
by testing rather than shipped): `useTerminals.ts`'s `loadMyTerminals()`
queried `my_terminals_with_status` with **no `.eq("user_id", ...)` filter
at all** — it had always silently relied on RLS alone to mean "only my own
rows," which was true back when `my_terminals`/`terminal_access` only had
owner-scoped SELECT policies. The moment admin/dispatch got read access to
*other* users' rows too, this unfiltered query started returning every
company member's starred terminals flattened into one array with no
`user_id` to distinguish them — for a driver (Kyle Tatro) with zero rows of
their own, this meant the viewing admin's *own* terminals rendered instead,
mislabeled under "Viewing Kyle Tatro's terminal cards," with the same
terminal_id appearing once per company member who'd starred it (surfaced
immediately as a very visible "Encountered two children with the same key"
React error, not a silent data leak). Root cause confirmed by direct
Postgres query (Kyle: 0 rows in both `my_terminals` and `terminal_access`)
before touching any code. Fixed with one line
(`.eq("user_id", effectiveUserId)`) — correct and necessary for both the
own-view and driver-scoped-view call sites, since the query was never
actually scoped by the application layer at all, only ever by RLS.

**Live-verified end-to-end, 2026-08-04**, against a real second company
member (Kyle Tatro, zero pre-existing terminal data — a clean case to prove
scoping, not muddied by pre-existing rows): selected Kyle on the Dispatch
tab, opened Cards → Terminals (showed the correct empty state after the fix,
not leaked data), added a real Chevron card with a card number via the
identical `TerminalCard` UI the driver would use, confirmed via a direct
Postgres query that the write landed on **Kyle's** `my_terminals`/
`terminal_access`/`user_terminal_cards` rows (not the admin's own), then
removed it through the same UI (confirm copy correctly read "Remove this
card from Kyle Tatro's wallet?") and confirmed the unstar landed correctly
while `terminal_access`/`user_terminal_cards` were preserved per the
confirm copy's own promise ("stays saved if you add it back later") — then
manually cleaned up those two leftover rows directly, since Kyle is a real
driver account, not throwaway demo data. Badges and Credentials sub-tabs
both confirmed rendering the correct "Viewing Kyle Tatro's
badges/credentials" empty states with no leaked data (these two were never
at risk of the `useTerminals.ts` class of bug — they already had explicit
`user_id` filters). Re-loaded the driver's own (non-dispatch) Cards view
afterward as a regression check — renders normally, "Select" button
present (correctly shown only for the own-view case), no duplicate-key
errors on this fresh load. `tsc --noEmit` clean throughout.

### Driver Training (Lead/Admin-in-lead-mode feature)
- A "Driver Training" button on the Planner (lead/admin-acting-as-lead
  only) opens a driver-selection modal (exact modal design not yet done —
  open task) to pick a trainee.
- **Single-load model, decided 2026-08-03**: rather than reconciling two
  separate load records (or figuring out "whose plan wins" when both people
  are physically in the same truck), there's still only **one** real load —
  one plan, one equipment combo, submitted once, created under the
  **lead's** account (same as any load the lead would normally submit). A
  new `trainee_id` reference is added to the load, separate from the
  creator, purely so the load can be attributed to the trainee for
  reporting.
  - **Incentive points go to the lead** (the load's actual owner/creator) —
    this falls out naturally from the existing points-go-to-creator logic,
    no special-casing needed.
  - **Trainee's "loads completed toward carding" count** is just a query
    filtering on `trainee_id = me` — read-only, reporting only; the trainee
    never has their own competing `load_log` row for this same physical
    event.
- **"Loading with [name]" banner**: shown on the lead's planner today (post-
  trainee-selection). Decided: mirror the same banner on the trainee's own
  planner too ("Training with [lead name]"), scoped as **part of the same
  open experiment** below rather than solved separately — i.e., don't build
  dedicated synced state just for this label; whatever mechanism ends up
  handling the core "two devices, one physical load" problem should drive
  this banner too.
- **Explicitly unresolved, deliberately deferred to a real-world try-it-and-
  see**: if both the lead and the trainee have their own Planner open on
  their own phones during a training session, what actually happens? Does
  the trainee's device need to be a read-only mirror of the lead's in-
  progress plan, or does each device just independently plan and only the
  lead's submission counts (with the trainee's parallel session being pure
  UI, never actually written)? Not designed — explicit user call to try the
  simplest version first (lead's device is the only one that actually
  submits) and see what breaks in practice before building anything more
  elaborate.
- **Reports**: purely reporting-side, dialed in last, no new UI action
  beyond what's above.
  - Lead: report of training loads they've given, listing which trainees
    and when.
  - Driver: a report letting them view/track their own in-progress carding
    status per terminal (their own training loads + which terminals they're
    actively getting carded at) — a self-service tracking tool for the
    driver, not a new driver-facing "give training" action.
  - Both live in the existing Reports/NAV hub (`/calculator/reports`) as new
    report types, not a new destination. **Not built this pass** — spec
    itself says "dialed in last," left for a future pass.

**Shipped 2026-08-04**: `load_log.trainee_id` + narrow trainee-read RLS
policy (see Dispatch tab section above). `DriverTrainingModal.tsx` (new,
wraps the shared `DriverPicker.tsx`) opens from a "Driver Training" text
button on the Planner, visible for `canDriverTrain = role === "lead" ||
role === "admin" || isSuperAdmin` (updated same day — see "Tab bar fix"
above; originally gated on the now-removed `adminActingAsLead` toggle, now
admin/super-admin always have lead-level Driver Training capability on
their permanent Planner tab, no mode switch needed). Picking a trainee just
sets local
`traineeId`/`traineeName` state on the Planner page — no write happens until
the lead actually begins a load. `useLoadWorkflow.ts`'s `beginLoadToSupabase`
takes a new `trainingTraineeId` prop and, right after `setActiveLoadId`,
fires a plain (non-blocking, non-fatal) `UPDATE load_log SET trainee_id =
...` on the row it just created — no RPC change needed, `load_log_update_own`
already covers it. "Loading with {trainee}" renders next to the Driver
Training button once picked, matching the mockup's placement (below RELOAD,
above the gal/lbs summary).

**Trainee-side "Training with {lead}" banner**: built as the "try the
simplest version first" cut per the open question below — every driver's
own Planner (not just leads) polls (30s interval, not a live subscription)
`select user_id from load_log where trainee_id = effectiveUserId and status
= 'planned'` and, if found, resolves the lead's name via
`get_display_names_full` and shows the banner. This is *a* answer to the
"two devices, one physical load" question, not *the* answer — it only
proves whether a trainee tag exists, says nothing about keeping two
in-progress plans in sync, and was deliberately left that simple.

### Explicitly shelved
- The entire 2026-07-30 "Role-based tabs" Lead/Dispatch/Admin dedicated-tab
  work — `EquipmentScheduleChart.tsx`, `DriverAssignmentModal.tsx`, the
  Dashboard/Tasks/Ledger placeholder subtabs on all three role tabs. Not
  moved into the nav menu, not preserved anywhere — a deliberate scope
  pullback per explicit user direction ("we pumped the brakes... this was
  scope creep"). If any of that functionality (e.g., equipment schedule
  visibility, driver assignment) turns out to be wanted later, that's a
  fresh scoping conversation, not a resurrection of this code as-is.

### Open questions (Terminal Tier spec)
- The "two devices, one physical load" concurrency question for Driver
  Training — still genuinely unresolved (see the trainee-side banner note
  above); the polling banner only proves a trainee tag exists, doesn't
  solve concurrent planning on two devices.
- ~~Exact driver-selection UI...~~ — **resolved 2026-08-04.**
  `DriverPicker.tsx` (search + list, shared by the Dispatch tab and Driver
  Training) is the answer — simple by design, no fancier UX was specified.
- ~~Live verification needed... region/local-area...~~ — **resolved
  2026-08-04.** Confirmed live: `profiles.region` and `profiles.local_area`
  both already exist (also `division`, `employee_number`, `hire_date` —
  `get_display_names_full` already returns all of them). No `store` field
  exists anywhere; the Dispatch tab's "Store {division}" label is a
  best-effort guess at what the mockup's "Store 495" maps to, **not
  confirmed** — worth double-checking if it matters. The existing "inactive"
  terminal-access state was **not** separately re-verified this pass (the
  Dispatch tab's card list derives "Not Carded" from the absence of a
  `terminal_access`/`user_terminal_cards` row entirely, not from reading an
  explicit inactive flag — functionally equivalent for display purposes,
  but the underlying enum question from the original spec is still
  technically open).

## Architecture reality (learned the hard way — READ THIS FIRST)

The local `supabase/migrations/` folder is **not** a reliable source of truth. It
has historically lagged badly behind the live database — real schema work
(tables, RLS, functions) has happened directly in the Supabase SQL editor without
always being captured back into a checked-in migration. Concretely: `user_settings`,
`super_admins`, `terminal_temp_bias`, `company_invites`, `pending_invites`,
`driver_licenses`, `attachments`, `equipment_attachments`, `truck_other_permits`,
and ~20 functions (including the entire invite-code system) all exist live but
were absent from the migrations folder as of the last full audit (July 2026).
Verified live 2026-07-17: `medical_cards`, `port_ids`, and `twic_cards` do
**not** exist — only `driver_licenses` does. A prior version of this doc listed
all four together; don't assume the other three exist without checking again.

**Before designing or writing any schema change, verify against the live
database — don't trust the migrations folder alone.** Ask the user to run
queries against `information_schema.columns`, `pg_policies`, `pg_proc` /
`pg_get_functiondef`, and `terminal_temp_bias` (or check with Supabase MCP/CLI if
available) rather than assuming the repo's migration file is current.

**Server-side auth checks — fixed 2026-08-13.** `lib/supabase/client.ts`
previously persisted sessions to `window.localStorage` only, via plain
`createClient` from `@supabase/supabase-js` — not `@supabase/ssr`'s
cookie-syncing `createBrowserClient` — so `lib/authz.ts`'s server-side
helpers (`getSessionUserOrRedirect`, `requireSuperAdmin`,
`requireMembershipOrJoin`) could never see a real session regardless of
whether the browser was actually logged in (confirmed live 2026-08-07, see
"Website / landing page rework" → "Shipped 2026-08-07" below). This is now
fixed: `lib/supabase/client.ts`'s singleton is `createBrowserClient`, and
`lib/supabase/browser.ts` (a second, previously-independent
`createClient()` instance used by `JoinClient.tsx`/`ActiveCompanySelect.tsx`
— would otherwise have split-brained against the new cookie-backed
singleton) now just re-exports the same singleton instead of creating its
own.

Three things had to be handled together for this to actually work, not
just compile:
- **Existing localStorage sessions don't carry over automatically** —
  `createBrowserClient` reads/writes cookies, not the old
  `sb-<ref>-auth-token` localStorage key, so shipping this as a bare swap
  would have silently logged out every currently-signed-in user (dev and
  production) on their next load. `lib/supabase/client.ts` now runs a
  one-time client-side migration on load: if a legacy localStorage session
  exists and no cookie session does, it's lifted in via
  `supabase.auth.setSession()` and the old key is cleared. Live-verified:
  confirmed the legacy key disappears and a real `sb-<ref>-auth-token`
  *cookie* appears after one page load with a pre-existing localStorage
  session.
- **`createBrowserClient` hardcodes `flowType: "pkce"`**, not overridable
  via options — this changes what `/login`'s `signInWithOtp()` magic link
  actually sends back: a `?code=` query param instead of a `#access_token=`
  hash fragment. `app/auth/callback/CallbackClient.tsx` already had `code`-
  handling code (redirecting to `/auth/confirm?code=...`), but
  `/auth/confirm` only ever read `token_hash`, never `code` — so that
  branch was dead/broken before this pass too, just never exercised since
  the client wasn't PKCE before. Fixed by calling
  `supabase.auth.exchangeCodeForSession(code)` directly in
  `CallbackClient.tsx` instead of redirecting. The *other* login flow
  (`/auth/confirm`'s own `token_hash`/`verifyOtp()` path, used by admin
  invites) doesn't depend on `flowType` at all and was unaffected — live-
  verified end-to-end via a real `admin/generate_link` magic-link token
  (session established, `/admin` and `/planner` both loaded real company
  data afterward).
- **`app/planner/layout.tsx` now actually has the server-side gate** this
  section used to warn against adding — `getSessionUserOrRedirect()` runs
  before `CalculatorLayoutClient` renders. Live-verified both directions:
  an authenticated session gets real Planner content directly (no
  `/login` flash); a session with cookies + localStorage fully cleared
  gets server-redirected to `/login` before any client JS runs.
  `CalculatorShellContext.tsx`'s own client-side
  `supabase.auth.getUser()` check is unchanged and still runs too (catches
  a session that expires mid-visit) — this is a first line of defense, not
  a replacement.

`requireSuperAdmin`/`requireMembershipOrJoin` are still not wired into any
route — only `getSessionUserOrRedirect` (via the Planner gate above) has a
real caller today. They're no longer *dead* code (the session they'd read
is real now), just not yet adopted anywhere else.

**Real-world fallout, fixed same day**: the very first genuine re-login
after this shipped hit a "link expired" error on a legitimate, unused
magic link. Root cause: `createBrowserClient` hardcodes `flowType: "pkce"`
(confirmed via the SDK source, not overridable through its public options),
and `/login`'s `signInWithOtp()` was running on that same shared client —
so the emailed link carried `?code=...`, which only completes
(`exchangeCodeForSession`) if the *same browser* that requested the link
still has the `code_verifier` cookie. Opening the link from a different
device, a different browser, or a mail app's in-app browser breaks that,
and reads as a generic "expired/already used" error even though the link
itself is fine — a well-known PKCE-and-email tradeoff, not a bug in the
exchange logic itself.

Fixed in `app/login/page.tsx`: `signInWithOtp` now runs on a dedicated,
throwaway `createClient` instance configured `flowType: "implicit",
persistSession: false` instead of the shared singleton — this client only
ever fires that one request, never reads/holds a session. The resulting
magic link now carries session tokens directly in the URL fragment
(`#access_token=...`) instead of a `?code=`, which needs no stored secret
to complete on the clicking end. `CallbackClient.tsx` needed no changes:
its existing `else` branch (`getSession()`, for whenever no `?code=` is
present) already handles this, and `_initialize()`'s hash-vs-code
detection (confirmed via the `@supabase/auth-js` source) is independent of
the *client's own* configured `flowType` — it reads whatever's actually in
the URL. Live-verified: submitted the login form fresh and inspected the
real outgoing `/auth/v1/otp` request body — `code_challenge` and
`code_challenge_method` are both `null`, confirming the implicit client is
genuinely in effect, not just configured.

### Stale-column audit — 2026-08-13

After the `buffer_lbs` bug (a dead `equipment_combos` column reference that
silently 400'd `EquipmentModal.tsx`'s entire fallback-hydration query, not
just its own dead "Buffer" display line — fixed same day), ran a full
repo-wide audit for the same failure class: every `.from(table).select(...)`
and every `.insert/.update/.upsert({...})` call, cross-checked against the
live schema (fetched via PostgREST's own OpenAPI introspection at
`/rest/v1/`, not the migrations folder — consistent with "Architecture
reality" above). The checker is relation-aware (recurses into embedded
`alias:table(cols)` joins rather than flagging the join itself as a bad
column) and skips anything containing a spread (`...obj`) rather than
guess. Validated against synthetic known-bad cases before trusting a clean
result. **Zero further findings** — `buffer_lbs` was the only stale
reference in the codebase, both passes (350 `.from()` calls / 201 read
queries, plus every write call) came back clean otherwise.

## Key existing infrastructure (already built, don't rebuild)

- `user_companies (user_id, company_id, role, created_at)` — join table, RLS
  blocks direct client inserts (`user_companies_no_direct_insert`); membership
  changes go through `SECURITY DEFINER` functions only.
- `companies (company_id, company_name, created_at, is_solo, owner_user_id)` —
  the last two columns added by the solo-tier migration (see below).
- `user_settings (user_id, active_company_id, updated_at)` — resolves which
  company's data a user sees. `get_active_company_id()` falls back to the
  user's oldest `user_companies` membership if `active_company_id` is unset.
- Full invite-code system already exists and works: `company_invites` table
  (code, expires_at, max_uses, uses_count, is_active, role),
  `generate_invite_code()`, `redeem_invite(p_code)`. **Not yet wired to any
  client UI** — `/join` (`JoinClient.tsx`) and `redeem_invite` are unused by any
  current call site. This is the natural foundation for the deferred
  solo→fleet join-via-code flow — build the UI against what's already there,
  don't design a new backend for it.
- `trucks` / `trailers` — already have `vin_number` (nullable text). RLS grants
  full INSERT/UPDATE/DELETE to any member of the row's `company_id` via
  `active_company_id` — **not role-gated at the RLS level**. Role gating for
  equipment happens only in `app/admin/page.tsx` UI (`role === 'admin' || 'lead'`
  gates entry to that page), not in `/api/admin/setup` (that route handles
  primary-equipment assignment, terminal cards/access, combo claims — not core
  equipment CRUD).
- `is_company_admin()` (DB function) already treats `'owner'` and `'admin'` as
  equivalent — but this is **not used** by app-code role checks, which all
  hardcode `role === "admin" || role === "lead"` inline. Confirmed spots as of
  this audit: `app/admin/page.tsx:1065`, `app/api/admin/setup/route.ts:59`,
  `app/api/admin/invite/route.ts:38`, `app/calculator/modals/SourcingModal.tsx:61`,
  `lib/ui/NavMenu.tsx:30,148,171`. **Decision made:** solo users get
  `role = 'admin'` (not a new `'owner'` role) specifically to avoid having to
  audit/update all of these. `companies.is_solo` is what distinguishes a solo
  company from a real fleet — role alone was never the right signal for that.
- Two separate signup/confirm paths: `/auth/callback` (organic magic-link
  self-signup from `/login`) and `/auth/confirm` (admin-invite emails and other
  OTP types). Invited users already get their `user_companies` row created
  server-side by `invite_user_to_company` *before* they click the email link —
  so provisioning logic only needs to be a no-op-if-already-a-member check, safe
  to call unconditionally from both paths.
- `effectiveUserId = setupSession?.targetUserId ?? authUserId` — existing pattern
  used throughout for admin impersonation. Not yet re-verified against the
  solo-tier changes; worth a pass if impersonation bugs show up for solo users.

## Fuel temp prediction system (architecture)

- `lib/fuelTempPredictor.ts` — physics-based prediction (first-order lag + solar
  gain), corrected by a per-terminal/hour-bucket/month bias.
- Bias is a genuine Welford's-algorithm running mean/variance, stored in
  `terminal_temp_bias (terminal_id, hour_of_day, month_of_year, sample_count,
  mean_error, m2, updated_at)`, updated via the `update_terminal_temp_bias(...)`
  RPC (SECURITY DEFINER, correctly implemented — confirmed working with live
  data showing real accumulation).
- Write path: `app/calculator/hooks/useLoadWorkflow.ts`, after `complete_load`.
- Read path: `app/api/fuel-temp/route.ts`.
- **"Confidence" (high/medium/low) is purely weather-based** (cloud cover +
  wind, via `confidenceFromCloudAndWind`) — it has no relationship to
  `sample_count` / bias maturity. This is intentional (confirmed with user) —
  don't conflate the two concepts again.
- `complete_load` has two overloads in the schema: the 4-arg one
  (`p_load_id, p_completed_at, p_lines, p_product_updates`) is **dead code** —
  writes to `products.last_api` globally (wrong table for the per-terminal
  design), never called by the client (`lib/supabase/load.ts` only calls the
  single-arg `payload jsonb` version). Safe to drop.

## Punch list status

### ✅ Done — deployed or ready to deploy
1. **Confidence color bug** — `ProductTempModal.tsx`: predicted temp number now
   colors by `confidence`, not by `isAccepted`/applied-state. Single shared
   `CONFIDENCE_COLOR` map with the dot/label so they can't disagree again.
2. **Bias correction gate removed** — `lib/fuelTempPredictor.ts`: correction
   used to be hard-zero below 3 samples (`biasSamples >= 3`), now ramps
   continuously from sample 1 (`Math.tanh(biasSamples / 4)`).
3. **Bias bucketing widened** — was exact UTC hour (0-23), fragmenting samples
   too thinly; now a 3-hour window (`Math.floor(hour / 3) * 3`), changed on
   both the write side (`useLoadWorkflow.ts`) and read side (`fuel-temp/route.ts`).
   Migration `20260716000000_consolidate_terminal_temp_bias_buckets.sql`
   folds pre-existing exact-hour data into the new buckets via correct
   parallel-variance combine (not discarded).
4. **Solo-company provisioning** — migration
   `20260717000000_solo_company_provisioning.sql` adds `companies.is_solo` /
   `companies.owner_user_id` (unique, nullable — enforces 1 solo company/user)
   and `provision_solo_company()` (idempotent SECURITY DEFINER function, role
   `'admin'`, auto-generated hidden company name). Hooked into both
   `CallbackClient.tsx` and `app/auth/confirm/page.tsx`, right before each
   redirect into the app.

**Verify before considering this fully closed:** a genuinely new signup lands in
the calculator with an empty, writable equipment list, no `/join` redirect, no
errors. (`requireMembershipOrJoin()` in `lib/authz.ts` is defined but currently
called from nowhere in the app — confirmed dead code, not a redirect risk today,
but don't assume that stays true if someone wires it in later.)

### 🔜 Not started — full detail needs to be re-established with the user
5. **VIN keying / future dedup** — `vin_number` already exists on trucks &
   trailers (nullable text). Normalization (uppercase/trim) and indexing not
   yet done. Merge/reconciliation logic explicitly deferred.
6. ~~**Expiration modal — group by city.** Currently a flat list with the
   selected city sorted to top, not visually grouped.~~ — **stale, checked
   2026-08-06, no longer applicable.** Read the current code
   (`modals/ExpirationModal.tsx`'s Terminal Cards section,
   `useTerminalFilters.ts`'s `catalogTerminalsInCity`, and the Reports hub's
   `buildTerminalCardsReport.ts`) before touching anything, and all three
   already scope to a single city — `catalogTerminalsInCity` filters by
   `selectedCity`/`selectedState`, and `buildTerminalCardsReportBody`'s own
   header comment says "for a single city." Live-confirmed in the Browser
   pane: the Expirations modal already renders one clearly-labeled section
   ("TERMINAL CARDS — In Fort Lauderdale, FL") with every listed terminal
   actually in that city — no flat cross-city list exists to group. This
   note describes an architecture that predates the Cards-tab city-grouping
   rework (`app/calculator/cards/page.tsx`, item #68 in the punch list
   above) and was never updated after that shipped. Left as a struck-through
   record rather than deleted, so a future pass doesn't waste time
   rediscovering the same thing.
7. ~~**Presets rework.**~~ — **shipped 2026-08-06, tap behavior reversed
   2026-08-04 (following session).** Scope changed from the original spec
   during a live clarifying pass with the user (see #8 below too — both
   items landed together, not sequenced, since the "equipment settings"
   destination turned out to already exist rather than needing a new
   gear-icon modal):
   - ~~Tap a **filled** preset slot now opens an action sheet...~~ —
     **reversed.** After using it in real full-app-impersonation testing,
     explicit feedback: "this window still pops up when we change presets,
     can we get rid of it?" A plain tap on a filled slot now **loads it
     immediately** again (`PresetDial.tsx`'s `onLoad` prop, calling
     `planSlots.loadFromSlot` directly, same as before this rework
     originally shipped) — no confirmation popup for the common
     "switch between presets" gesture. `PresetActionSheet.tsx` (Load/Edit/
     Clear) is **not removed** — it moved to **long-press** on a filled
     slot instead (`onOpenActions` prop), so Edit/Clear are still reachable,
     just out of the way of a plain tap. Tapping an **empty** slot is
     unchanged, still saves straight through (nothing to protect either
     way). Long-press on an empty slot still saves too (unchanged).
   - Presets (slots 1-5, the driver-facing A-E letters) are now **terminal-
     independent** — `usePlanSlots.ts`'s `planStoreKey` gives them a
     user-only key (no terminal component) instead of the old per-terminal
     one; server-side, `serverFetchSlots`/`serverUpsertSlot`/`serverDeleteSlot`
     write/read a constant `UNIVERSAL_SCOPE` sentinel for `terminal_id`/
     `combo_id` on those slots instead of the real ones. **No DB migration
     needed** — `user_plan_slots.terminal_id`/`combo_id` are `NOT NULL text`
     and part of the unique key, so a fixed non-null sentinel dedupes
     correctly (unlike an actual `NULL`, which Postgres never treats as
     equal to itself for uniqueness) — confirmed via the migration file
     directly before assuming this was safe. Slot 0 (the autosave/last-load
     draft, not a driver-facing "preset") is untouched, still keyed to the
     real terminal/combo exactly as before.
   - Presets now store **only the product selection per compartment** —
     `buildSnapshot` gained a `stripFillLevel` option (used for slots 1-5,
     not slot 0) that drops `capOverride` from each compartment before
     saving. `cgSlider` is dropped from every snapshot, all slots included
     — treated exactly like `tempF`'s existing "never restored" precedent
     (`PlanSnapshot.cgSlider` is now optional, kept only so old stored
     snapshots don't fail the type). Per explicit user clarification: the
     driver still adjusts headspace (the drag handle) and CG live per load
     exactly as today, unconstrained by any role — presets/CG were never
     meant to be role-gated, only the **cap itself** is (see #8).
   - **New, not in the original spec** — cross-terminal product-availability
     check: loading a preset that references a product not sold at the
     *current* terminal no longer silently mis-renders. A live derived value
     (`unavailableComps` in `page.tsx`, comparing `compPlan` against
     `terminalProducts`) drives three things: (a) `PlannerControls.tsx`
     gives an affected compartment's bar a red diagonal-stripe fill + "N/A"
     code instead of the generic teal fallback; (b) `CompartmentModal.tsx`
     shows a "⚠ Product Not Available at this terminal — choose a
     replacement below" banner when opened for such a comp, and `page.tsx`
     auto-opens it for the first unresolved comp right after a preset load
     (advancing to the next one once that specific comp is actually fixed,
     not just dismissed — a dismiss stops the auto-advance rather than
     re-trapping the driver); (c) the LOAD button's `onClick` (not its
     `disabled` attribute — deliberately, so tapping it while blocked still
     produces feedback instead of just doing nothing) shows "Cannot Load,
     all planned products are not available at {terminal}" and refuses to
     call `beginLoadToSupabase`. Live-verified end-to-end including the
     partial-mismatch case (one comp resolved, one still unavailable) —
     worth knowing if all comps are unavailable, the *pre-existing*
     `planRows.length === 0` gate (a comp with no resolvable density data
     was already excluded from weight calc) disables the button first via
     the HTML `disabled` attribute, so the new message only fires in mixed
     scenarios; that's fine, the load genuinely can't proceed either way.

   **Real data-loss bug found and fixed 2026-08-04**, while live-testing
   this session's other work in a real logged-in session for the first
   time (everything above had only ever been typechecked/guest-tested).
   The account's actual presets came back wrong: Preset A showed "Load
   Empty" and Presets D/E showed as completely unset. Root cause: the
   terminal-independent migration above was never fully carried out for
   this account — a `terminal_id = '__universal__'` row existed for slot 1
   but with an accidentally-empty `compPlan` (likely a leftover test save
   from whoever built the rework), and slots 4/5 had no universal-scope row
   at all, only old per-terminal rows going back months. Fixed via a
   one-off direct DB backfill (not a migration file — this was account
   data repair, not a schema change) restoring each slot's most recent
   real per-terminal `compPlan`. **This bug is specific to whichever
   accounts were mid-migration when the rework shipped** — not something
   that would recur for a fresh preset save, and not audited across every
   account, just this one during live testing.

   **CG reversed back into presets, 2026-08-04, per explicit user
   direction** — "the CG needs to save with the product selection... when
   the driver taps a preset it should snap to the last CG that was saved
   with that specific preset." This directly reverses the bullet above
   ("`cgSlider` is dropped from every snapshot... presets/CG were never
   meant to be role-gated") — that original call is superseded, not
   historical color anymore. `PlanSnapshot.cgSlider` is now written on
   every save (`buildSnapshot`) and restored on load, but **only for named
   presets (slots 1-5)**, not slot 0's autosave/last-load draft, which
   keeps its original "CG is live, never restored" behavior — `applySnapshot`
   takes a new `{ restoreCg? }` option, `loadFromSlot` passes `restoreCg:
   slot !== 0`, every other `applySnapshot` call site (last-load-from-log,
   slot-0-on-terminal-change) is untouched. **A second real bug caught
   while wiring this up**: the server-pull effect's local-cache
   normalization step built its own plain object and silently dropped
   `cgSlider` even when the server payload had it — so a correct DB row
   would still silently fail to restore CG once cached locally. Fixed by
   including `cgSlider` in that normalization. Live-verified end-to-end in
   the real session: tapping Preset A now shows "PRESET A / Load ULSD
   Diesel #2," and the CG slider visibly snaps to 0.64 (the value actually
   saved with that preset) on load — confirmed via both the DOM input value
   and the underlying `localStorage`/DB state, not just the UI rendering.
8. ~~**Equipment settings (new UI).**~~ — **shipped 2026-08-06, but not as a
   new gear-icon modal.** Confirmed with the user before building: the gear
   icon in the header is the user's own profile settings, unrelated: cap/
   volume/unit-number editing belongs in the **existing** equipment modal
   (`lib/ui/driver/EquipmentDetails.tsx`'s `TruckModal`/`TrailerModal`,
   already shared by both `/admin`'s full console and the Planner's
   fleet-mode `EquipmentModal.tsx`), not a new destination.
   - `CompartmentEditor` gained a second column, "Cap — overflow prevention"
     (`cap_gallons`), alongside the existing "Total Volume" (`max_gallons`,
     informational only) — previously this field didn't exist in the
     equipment modal at all.
   - **A real, separate bug found and fixed while wiring this up**:
     `TrailerModal.save()` deletes and reinserts every `trailer_compartments`
     row on every save, but the reinsert only ever wrote `comp_number`/
     `max_gallons`/`position` — `cap_gallons` was never included, so it
     silently reverted to `null` (falling back to `max_gallons`) on *every*
     trailer edit, not just ones that touched compartments. This predates
     this session's changes entirely and wasn't something anyone could have
     noticed from the UI (BinderModal.tsx's own separate cap editor, see
     below, was the only place a value ever showed up again — it does a
     direct `.update()`, not delete+reinsert, so it self-healed the exact
     symptom that would have made this bug visible). Fixed by writing
     `cap_gallons: c.cap_gallons ?? null` on the reinsert. Live-verified:
     edited a trailer's identity fields with cap 4300/1250/3800 already set,
     saved, reopened — all three caps intact.
   - **Role-gated to admin/dispatch/lead**, per explicit user instruction —
     "we don't want them going over the comp cap," with the driver still
     free to use headspace/CG live per load, just never past whatever cap a
     higher role set. `myRole` is threaded from `CalculatorShellContext`'s
     existing `shell.role` through `EquipmentModal.tsx` → its internal
     `EquipmentDetailsModal` → `AdminTruckModal`/`AdminTrailerModal` (this
     path never received it before — only `/admin`'s own page already
     threaded it, for the pre-existing admin-only `SensitiveInfoSection`).
     Gating covers cap/volume *and* Unit # (also named explicitly by the
     user) for **existing** equipment only — a brand-new truck/trailer
     still needs a name to be created at all, and creation itself isn't
     role-gated at the RLS level (a separate, already-documented gap, out of
     scope here) — so `canEditRestricted = isNew || myRole === "admin" ||
     "dispatch" || "lead"`. Validated server-round-trip live: a cap value
     exceeding the compartment's total volume is rejected with "Cap can't
     exceed a compartment's total volume," matching the explicit ask that
     "higher roles also can't set a cap higher than the total volume."
   - **BinderModal.tsx's own separate, ungated cap editor was removed**
     (`CompartmentRowItem` in `app/calculator/modals/BinderModal.tsx`) —
     consolidated into the one role-gated location above rather than
     leaving two editable, un-synced copies (one of which had no gate at
     all). Now read-only there, still showing the current value for anyone
     reviewing the Binder.
   - `SoloEquipmentModal.tsx` (the lightweight solo-tier equipment picker)
     was deliberately left untouched — confirmed via code read that it has
     no "edit existing equipment" flow at all (tap = select for pairing,
     long-press = remove, "+" = add new only), so there's nothing there to
     gate; solo companies are always `role = 'admin'` anyway per the
     existing architecture, so this was never reachable for them regardless.
9. **Terminal product setup — admin-curated, not driver-selected.**
   **Role gate shipped 2026-08-06**; the rest of this item is still
   unbuilt (deliberately, per explicit user scoping — see below).

   `ManageTerminalProductsModal.tsx` (reachable from any compartment's
   product picker via "Manage products at this terminal") toggles a
   terminal's active product list — an action that affects **every driver**
   who loads at that terminal, company-wide. It had **no role gate at all**
   before this fix — confirmed via code read, not assumption. Fixed by
   threading `myRole` from `page.tsx`'s existing `shell.role` through
   `CompartmentModal.tsx` (new `myRole` prop) into a `canManageProducts =
   myRole === "admin" || "dispatch" || "lead"` check that hides both the
   "Manage products at this terminal" entry-point button and the modal
   itself for anyone else — matches the equipment-cap gating pattern from
   earlier this session. UI-level gate only, consistent with this
   session's established precedent (equipment CRUD itself is also not
   RLS-gated, a separately-flagged, deferred gap — see "Open questions"
   below) — no `terminal_products` RLS change made here.

   **Explicitly deferred, scoped down from this pass on purpose** (asked,
   not guessed): the base-list curation UI, the driver-facing "terminal not
   yet configured" fallback + request action, a queryable `terminal_requests`
   table, and an admin bulk reset/reselect flow are all still exactly as
   unbuilt as before. Mid-Grade/Plus gasoline was confirmed to get its own
   slot in the eventual base list (not deferred as exotic) — recorded here
   for whenever that UI actually gets built, not implemented yet.
   - Master product list stays fully **granular** — this is a hard constraint,
     not a preference. Product selection feeds the API/temp correction
     calculation directly (confirmed with user); merging e.g. B5 and Diesel
     into one UI entry would silently corrupt the pooled bias data the whole
     app exists to produce. Rack-injected variance (dye, lubricity, cold-flow,
     cetane, corrosion inhibitors) is safe to treat as the same product
     identity; volumetric blends (bio % for diesel, ethanol % for gasoline)
     are NOT — those are real API/density-relevant differences and must stay
     distinct.
   - Candidate bare-necessity base list (non-exotic): Diesel (ULSD, any
     dye/additive), Biodiesel Blend (B20), Regular Unleaded (E10 baseline),
     Mid-Grade/Plus (rack-blended from Regular+Premium, borderline — confirm
     whether it earns its own slot), Premium Unleaded. B99/B100 and other
     exotics deliberately deferred, not deleted — full granular list still
     needed underneath.
   - Repurpose the existing admin product-setup screen as the user's own
     terminal-onboarding tool (self-curated by the user via phone calls to
     terminals — not crowd-sourced, not driver-selected).
   - New driver-facing flow: terminal not yet configured → show
     "not yet configured" notice + full fallback product list (never block
     usage) + "request this terminal be added" action. Once configured, the
     fallback list disappears for everyone at that terminal.
   - Admin side needs a fast reset/reselect flow (not manual deselect one by
     one) since this becomes the primary onboarding workflow, prioritized by
     driver demand.
   - Terminal requests need to be a queryable/sortable table
     (`terminal_requests`-style), not just a notification stream, so demand
     can actually drive prioritization.
   - Presets breaking gracefully when a product is removed from a terminal
     (driver just resets the preset — acceptable, but shouldn't crash/silently
     fail).

## Open questions / decisions still needed
- ~~Mid-Grade gasoline: own slot in the base list, or deferred as exotic?~~ —
  **resolved 2026-08-06: own slot.** Recorded in item 9 above for whenever
  the base-list curation UI actually gets built (not implemented yet).
- ~~Solo→fleet join flow~~ — **resolved + shipped 2026-08-06.** Scope
  collapsed significantly from the original framing: joining a fleet via
  invite code **abandons** the solo company entirely (no equipment
  migration/merge) rather than reconciling it, per explicit product
  decision — company selection is via invite *code*, not name, so the
  "which Gemini Trucking" disambiguation concern that prompted this
  question doesn't actually apply (the code encodes `company_id` directly,
  no matching step exists). This means the VIN-matching/reconciliation/
  admin-review-screen machinery originally envisioned is now **unnecessary
  and not built** — there's nothing to reconcile.

  `app/calculator/components/JoinFleetView.tsx` (new) — invite-code entry
  form, wired into `SettingsModal.tsx`'s Account section as a new "Join a
  Fleet" row, shown only when the user's current active company has
  `is_solo = true` (fetched fresh on modal open, not cached). Calls
  `redeem_invite(p_code)` then, critically, **also** calls
  `set_active_company(p_company_id)` — confirmed via live
  `pg_get_functiondef` that `redeem_invite` only sets `active_company_id`
  when it was previously **null** (`coalesce(existing, new)`), so a solo
  user (who already has one) would join the fleet's `user_companies` table
  but silently keep looking at their old solo company without this
  explicit follow-up call. On success, hard-navigates to `/calculator`
  (`window.location.href`) rather than trying to hot-swap
  `CalculatorShellContext`'s state, so every piece of shell state
  (role/companyId/equipment) refetches clean against the newly active
  company.

  Old solo company + its equipment are left completely untouched (not
  deleted, not flagged) — same "abandon, don't reconcile" decision. This
  means solo companies pile up unbounded over time as users leave them
  behind; tracked in "Pre-launch cleanup" below, not urgent enough to
  block this.

  **Live-verified 2026-08-06** (partial — see gap below): typecheck clean.
  The `isSolo` gate itself works exactly as coded — confirmed via a
  temporary debug log against the real Supabase call (removed after
  confirming, not left in the shipped file) that the shared demo/QA
  company (`1391e05e-...`) genuinely has `is_solo = true` live, which is
  why "Join a Fleet" rendered for it. This was a surprising result at
  first — this is the same company with 2 real members, Fleet Cards,
  Incentives, and Payroll Report all live-verified earlier this session —
  but it's a real, pre-existing data artifact, not a bug in this gate:
  there's no path today that flips `is_solo` to `false`, and this
  company's second member (`Test Testerson`) was added directly to
  `user_companies` mid-session for RLS testing, never through any
  "convert solo to fleet" flow. So a company can be `is_solo = true` and
  still have multiple real members and full fleet features enabled — the
  flag only ever reflects *how a company was created*, not its current
  member count. Worth knowing if `is_solo` is ever used elsewhere as a
  proxy for "single-member company" — it isn't one.

  With that confirmed, opened the actual `JoinFleetView` UI live (copy
  renders correctly) and submitted a bogus code (`ZZZZ9999`) — got back
  "Invite not found" rendered in the error banner, proving the full round
  trip end-to-end: real Supabase auth session, real `redeem_invite` RPC
  call, real Postgres exception, correctly caught and displayed by the
  component's `catch` block.

  **Not exercised**: an actual successful redeem (`set_active_company`
  follow-up + real fleet membership). Doing that against this session's
  only available test company would have meant redeeming a real invite
  code and switching the shared demo/QA account's `active_company_id` away
  from the persistent company this entire session's test data (Fleet
  Cards, Incentives, Payroll Report artifacts) lives in — a disruption to
  the established QA environment, not worth the risk for what's otherwise
  a single, well-understood `coalesce`-driven code path already confirmed
  correct via direct `pg_get_functiondef` reads earlier. The negative case
  (row hidden when `is_solo = false`) is the untested `else` branch of the
  exact same boolean gate just proven live — not separately verified, but
  low-risk by symmetry. If a disposable solo company + a second disposable
  fleet company with a real invite code are ever available, worth a real
  end-to-end redeem to close this out fully.
- ~~Post-join permission split~~ — **shipped 2026-08-07.** Mechanism decided
  (asked, not guessed): column-level RLS restriction via trigger, not the
  `equipment_activity` append-only log table originally floated — the
  simpler option, since `trucks`/`trailers`' existing `status_code`/
  `status_location`/`status_lat`/`status_lon`/`status_notes`/
  `status_updated_at` columns already serve as "current status," no new
  table needed.

  **Verified live before writing anything** (this repo's own "don't trust
  the migrations folder" rule, twice over here):
  - `pg_policies` query confirmed `trucks_insert_active_company`/
    `trailers_insert_active_company` (INSERT) and
    `trucks_delete_active_company`/`trailers_delete_active_company`
    (DELETE) exist live with **no role check at all** — just
    `company_id = get_active_company_id()`, exactly matching what
    "Key existing infrastructure" already said. `trucks_update_active_company`/
    `trailers_update_active_company` (UPDATE) is the same shape.
  - `pg_get_functiondef` on `delete_truck`/`delete_trailer` (also
    live-only, no migration file) showed they're `SECURITY DEFINER` RPCs
    that **already** enforce `role = 'admin'` internally — this is the
    real, already-working enforcement path (`EquipmentDetails.tsx` only
    ever calls these RPCs, never a raw `.delete()`). The bare table
    DELETE policy being wide-open was still a real gap for anyone
    bypassing the RPC via the client SDK directly, though.
  - No RPC exists for INSERT at all — `TruckModal`/`TrailerModal`'s
    `save()` call `.from("trucks"/"trailers").insert(...)` directly. This
    was the one genuinely ungated write path.

  `supabase/migrations/20260807000000_equipment_driver_permission_split.sql`
  (queued, not yet applied):
  - INSERT: tightened to `is_company_staff(company_id)` (admin/lead/
    dispatch), matching the precedent already set for equipment cap/Unit#
    editing (2026-08-06) — not a new/different role set.
  - DELETE: tightened to `is_company_admin(company_id)` (admin **only**),
    deliberately narrower than INSERT — matches `delete_truck`/
    `delete_trailer`'s own existing role check exactly, so the RLS
    backstop can't be looser than the app's already-shipped behavior.
  - UPDATE: RLS itself is untouched (still company-scoped only). A new
    `enforce_equipment_status_only_update()` `BEFORE UPDATE` trigger on
    both tables does the actual column-level split — Postgres RLS
    policies can't compare OLD vs NEW columns in a bare USING/WITH CHECK
    expression, only a trigger can see both rows. Allow-lists the ~6
    confirmed-live status columns (`to_jsonb(old) - allowed` vs
    `to_jsonb(new) - allowed`) rather than deny-listing "core spec"
    columns — deliberately, since this repo's own "Architecture reality"
    section already documents `trucks`/`trailers` having several live
    columns (`vin_number`, `make`, `model`, `year`, every
    `reg_*`/`inspection_*`/`ifta_*`/`phmsa_*`/`alliance_*`/
    `fleet_ins_*`/`hazmat_lic_*`/`inner_bridge_*`/`tank_*`/
    `trailer_reg_*`/`trailer_inspection_*` pair, `notes`) never confirmed
    complete or present in any migration file — an allow-list of the
    known-safe status columns can't be broken by an unconfirmed column
    turning out to exist (or not), a deny-list could.
  - Staff (admin/lead/dispatch) bypass the trigger entirely via the same
    `is_company_staff()` check, so their saves are unaffected.

  **UI changes** (`lib/ui/driver/EquipmentDetails.tsx`), needed alongside
  the migration — without them, a driver editing any of the many fields
  the modal already let them touch (VIN, plate, make/model/year, every
  permit date/notes field, general notes, Active toggle) would now hit
  the new trigger's exception as a raw, unhandled-feeling Supabase error
  on Save, since the modal's existing `canEditRestricted` gate (added
  2026-08-06) only ever covered Unit #/cap/compartments, leaving
  everything else wide open to any role:
  - `PermitEditRow`/`TankEditRow` gained an `editable` prop (default
    `true`, mirroring `CompartmentEditor`'s existing pattern) — disables
    every date/notes input and hides the add/remove controls when false.
  - `TruckModal`/`TrailerModal`: VIN/plate/make/model/year, every permit
    row, the inspection-shop/issue-date "extra" inputs, tank rows, and
    the general Notes field are now all gated on the existing
    `canEditRestricted` flag exactly like Unit#/cap already were — not a
    new flag, just extending the one that existed.
  - Delete button gated to a new, narrower `canDelete = myRole ===
    "admin"` (not the broader `canEditRestricted`) to match the RLS/RPC
    admin-only rule exactly, rather than the admin/lead/dispatch set used
    everywhere else in this modal.
  - Deactivate/Reactivate button gated to `canEditRestricted` — `active`
    isn't in the trigger's status-column allow-list, so a driver toggling
    it would also trip the new restriction.
  - The Save button itself is now hidden (not just disabled) for
    `!canEditRestricted` — with every field already read-only there's
    nothing left for a driver to submit, and hiding it avoids a
    click-that-does-nothing.
  - **The "+ Add Truck/Trailer" (`isNew`) entry point needed no change.**
    Confirmed via code read that it's only reachable from two places:
    `/admin/page.tsx`'s Equipment section (already gated
    `myRole === "admin" || myRole === "lead"` at the section level,
    predating this pass) and `SoloEquipmentModal.tsx`'s add-new flow
    (only ever used by solo companies, whose sole member is always
    `role = 'admin'` by the existing solo-provisioning design). No path
    exists for a plain driver to reach `isNew` mode today, so
    `canEditRestricted`'s existing `isNew || …` bypass stays correct
    as-is — it was already effectively unreachable-by-drivers before this
    change and still is now.

  **Both migrations applied 2026-08-07/08, partial live verification —
  see gap noted below.** Typecheck clean throughout.

  **Real bug found and fixed during this pass**: the trigger's
  `is_company_staff(new.company_id)` check resolves against `auth.uid()`,
  which is `NULL` for any write made through a service-role Postgres
  connection — exactly how `app/api/admin/setup/route.ts`'s
  `serviceSupabase` client operates (already gated by its own
  `verifyAdmin()` check at the API layer, so this is a fully-trusted
  path). With `auth.uid()` null, `is_company_staff()` returned false, so
  the trigger would have incorrectly blocked any *future* service-role
  update to `trucks`/`trailers` touching a non-status column, regardless
  of who was really behind it — caught only because verifying an
  unrelated coupling flow happened to route through this same API and
  exposed it. Fixed via
  `supabase/migrations/20260808000000_equipment_status_trigger_service_role_fix.sql`
  (applied): the trigger now returns early (bypasses entirely) when
  `auth.uid() is null`, treating a null caller as an already-authorized
  system/service context rather than an unprivileged driver. Confirmed
  today's actual `claim_combo`/`set_primary_truck`/etc. operations (the
  ones that surfaced this) don't even touch `trucks`/`trailers` directly
  (only `equipment_combos`, `user_primary_trucks`, `user_primary_trailers`)
  — so this specific bug wasn't actually firing in that flow, but the
  fix is real and necessary for any future service-role write that does
  touch these tables' non-status columns.

  **Live-verified**: admin save path — opened an existing truck
  (`25512-A`) via `/admin`'s Equipment section, changed Make to a test
  value, saved with no error, reopened and confirmed the new value
  persisted, then reverted it. Confirms the trigger's `is_company_staff()`
  bypass works correctly for a real authenticated admin session and the
  new INSERT/DELETE policies don't collaterally break normal admin
  writes.

  **Not verified — a real gap, not silently skipped**: the actual
  driver-role restriction (UI read-only rendering *and* the trigger
  rejecting a non-status change) was not exercised end-to-end with a
  genuinely authenticated driver session. Attempted via the existing
  "Set up planner for X" admin-impersonation feature (temporarily
  reassigning a real company member to `driver`, then impersonating
  them) — but this is a display-only overlay: `shell.role` correctly
  reflects the impersonated user's role for client-side rendering
  (so the read-only UI gating *would* render correctly), but any actual
  `supabase.from(...).update(...)` call still authenticates as the real
  signed-in admin's own JWT, never truly assuming the target's identity
  — so this demo environment cannot exercise the trigger's rejection
  path at all; only a genuine driver-role login could. Both real accounts
  in the shared demo/QA company are admins, and creating a genuine
  third, disposable driver-role test account was judged not worth the
  session's remaining scope. Worth a real check if a driver-role login
  ever becomes available. (Role was cleanly reassigned back to admin
  after this attempt, confirmed via a fresh `/admin` load — no lasting
  side effect.)

  **Also confirmed, incidentally**: attempting this test surfaced a
  separate, pre-existing, unrelated bug — coupling equipment for an
  impersonated user via "Browse fleet & couple equipment" creates the
  `equipment_combos` row correctly (company combo count went 1 → 3
  across two attempts) but the claim doesn't surface as "my equipment" in
  that impersonated Planner session. Confirmed this is unrelated to
  today's migration (the coupling RPC only touches `equipment_combos`,
  never `trucks`/`trailers`) — flagged here rather than chased further,
  since it's outside this pass's scope.

## 2026-08-17 glitch/feature batch (Planner + Admin + Reports)

User compiled a list of glitches and feature requests from a real day of
using the app: refresh/stale-state bugs, an incentive-system UX pass, an
admin page layout redesign, and a Reports page overhaul. Planned via a full
Plan Mode pass (3 research agents + 1 design agent, cross-checked directly
against the real files before writing anything) — approved plan preserved
at the time in `wild-discovering-plum.md`. Nine items, done in dependency
order (isolated bug fixes first, then the interacting planner-flow fixes,
then layout, then the two bigger feature builds last). `tsc --noEmit`
clean after every item.

**1. Load button stuck on "Load started"** — `useLoadWorkflow.ts`'s
`activeLoadId` was set at load-begin but only ever cleared inside
`cancelActiveLoad`, never in the successful-completion path
(`onLoadedFromLoadingModal`). Added `setActiveLoadId(null)` right after
`setLoadingOpen(false)` in that success path — the button now correctly
falls back to RELOAD/LOAD immediately after a real completed load instead
of sticking until a full page reload.

**2. Removed the 🎉 emoji** from the driver-facing "you earned X points on
this load" confirmation line (`app/planner/page.tsx`) — text/styling/
conditional otherwise unchanged; item 7 below adds a separate persistent
card alongside it.

**3. Credentials card dark-on-dark color bug** — `app/planner/reports/page.tsx`'s
`credSummary` was using `cardTheme.ts`'s `EXP_COLOR`, a palette designed
for a light "pearl card-wallet" background (that file's own doc comment
says so) — `valid`/`not_set` were both near-black, effectively invisible
on this page's dark graphite surface. Fixed with the same `DARK_EXP_COLOR`
override pattern already used in `FleetCardsModal.tsx`/
`FleetCredentialsModal.tsx`/`dispatch/page.tsx` for the identical class of
bug.

**4. Preset dial restoring the wrong letter on refresh** — real root cause,
distinct from the earlier preset-corruption bug fixed the same week
(see the `usePlanSlots.ts` timestamp-comparison fix elsewhere in this
history): `PresetDial.tsx` fires `onActiveChange` on *every* dial change,
including pure scroll-centering, not just an explicit tap-to-load — and
`page.tsx` wired that same value straight into `load_log.plan_slot` at
load-begin and `loadReport.plan_slot` at completion. So a driver merely
scroll-previewing a different letter before tapping LOAD could tag the
completed load with the wrong slot, even though the submitted plan
content was correct — on the next refresh, the dial then highlighted the
wrong letter. Fixed by separating "cosmetic dial position"
(`activeSlotLetter`, still drives the Save-plan button, unchanged) from
"the preset a real load action actually applied" (new `lastLoadedSlot`
state, set only inside `PresetDial`'s/`PresetActionSheet`'s `onLoad`
callbacks, never inside `onActiveChange`) — `useLoadWorkflow`'s
`activeSlotLetter` argument now receives `lastLoadedSlot`, and the
restore-on-refresh resync effect's guard changed from the fragile
`activeSlotLetter === 1` to `lastLoadedSlot == null`.

**5. Fuel temp could go stale while the app sat open** — two real bugs in
`page.tsx` plus one gap in `useFuelTempPrediction.ts`:
- The "mark as user-adjusted" effect only checked whether
  `predAppliedForRef.current` was non-empty, which was already true right
  after any auto-apply — so the auto-apply's own `setTempF` call
  immediately, incorrectly flagged itself as a manual edit on the very
  next render, permanently blocking any later re-application of a fresher
  prediction. Fixed by comparing the new `tempF` against
  `predictedFuelTempF` itself before flagging it as user-adjusted.
- The auto-apply effect's guard (`predAppliedForRef.current === key`)
  never re-fired once applied for a given city/state, even if a later
  fetch returned a genuinely different number. Changed to check the
  *value* (`Math.abs(tempF - predictedFuelTempF) < 0.1`), not just the key.
- No polling existed at all — `useFuelTempPrediction.ts` only re-ran on
  location changes. Added a 10-minute `setInterval` inside the existing
  fetch effect that resets the dedup refs and re-runs, so a driver who
  leaves the app open all day gets a fresh temp automatically instead of
  loading on a stale morning reading. Not addressed: a LOAD tapped in the
  brief window between mount and the first prediction resolving could
  still use the stale localStorage-hydrated value — accepted, not a hard
  gate, since the ask was "keep it fresh automatically," not "block
  loading during a fetch."

**6. Admin header redesign** — `app/admin/page.tsx`'s action buttons were a
mobile-only horizontal-scroll pill strip that ran off the right edge on
narrow screens; `NavMenu` was a trailing sibling instead of sitting next
to the company name. Replaced with a universal (not mobile-only) 3-column
CSS grid (`.admin-header-tile`, `aspect-ratio: 1`, square large tap
targets) and moved `NavMenu` inline with the company name on the header's
left side.

**7. Incentive system: renamed away from "payroll," new averaging-period
setting + Planner card.** Per explicit direction: "don't relate anything
to pay anywhere... just periods," while keeping the existing feature
fully functional (rename copy only, same precedent as the `/calculator`→
`/planner` rename — internal files/symbols/DB columns unchanged):
- `app/admin/page.tsx`: button label `Payroll` → `Period Report`.
- `app/admin/PayrollReportModal.tsx`: modal title → `Period Report`, CSV
  filename `payroll_...csv` → `period_report_...csv`. Component/file name,
  state vars (`payPeriodType`/`payPeriodAnchorDate`), and the
  `pay_period_type`/`pay_period_anchor_date` DB columns are all
  deliberately unchanged.
- `app/admin/IncentiveSettingsModal.tsx`: `PAY PERIOD` → `REPORT PERIOD`,
  `ANCHOR DATE` → `PERIOD ANCHOR DATE`, helper text updated to say
  "Period Report."
- **Planner running-average card, keyed off the SAME report period** —
  first built same-day as a fully independent, anchor-less
  "averaging period" concept (new `incentive_settings.averaging_period_type`
  column + a separate calendar-aligned date-math module), then explicitly
  simplified via same-day follow-up ("if we are keeping the report period
  and anchor date thing we can just match the averaging period for the
  planner card to that same period") — reversed before the migration was
  ever applied, so no schema change was needed in the end.
  `app/planner/utils/incentiveAveragingPeriod.ts` and its unapplied
  migration were both deleted; the Planner card instead reuses
  `app/admin/payPeriods.ts`'s existing `generatePayPeriods()` (already
  driving the Period Report) — `generatePayPeriods(payPeriodType,
  payPeriodAnchorDate, 1)[0].start` gives the period containing today for
  all four period types, no new date math needed. `IncentiveSettingsModal.tsx`
  no longer has a second period dropdown at all; its existing Report
  Period/Anchor Date fields now drive both the Period Report AND the
  Planner card, and its helper text was updated to say so.
- New card on the Planner (`app/planner/page.tsx`), directly after the
  existing Load Summary card, visible only when
  `incentive_settings.enabled`: left side shows this load's points
  (`loadReport.recovered_points`), right side shows the running average
  for the current report period (queries `load_points` filtered by
  driver/company/period start, grouped by `load_id` and averaged — same
  pattern `PayrollReportModal.tsx` already uses for its own totals).

**8. Product catalog picker reused for benchmark entry** —
`IncentiveSettingsModal.tsx`'s old benchmark search was a bare `<input>`
with client-side filtering, nothing shown until you typed ("kinda hard to
use," per the user). `ManageTerminalProductsModal.tsx` gained an optional
`mode: "rack" | "pick"` prop (defaults `"rack"`, existing rack-curation
behavior untouched) — in `"pick"` mode it skips the `rack_product_status`
fetch entirely (no rack context needed) and tapping a product calls
`onPick(product)` instead of toggling `active`, with the existing
"✓ Active"/"+ Add" styling reused via a `pickedProductIds` set. Modal
stays open across multiple picks (most companies only benchmark a
handful of products) with a Done button to close.
`IncentiveSettingsModal.tsx` now opens this in pick mode via a
"+ Add a benchmark product" button; since the shared modal's
`CatalogProduct` type deliberately doesn't carry `api_60`/`alpha_per_f`
(incentive-only columns, kept out of the shared modal on purpose), its
`onPick` handler re-looks-up the full row from the already-fetched
`productById` map before calling the existing `addProduct()`.

**9. Reports page overhaul** (`app/planner/reports/page.tsx`):
- **Role-aware Loads + driver picker.** `canViewOthers = role === "admin"
  || role === "dispatch"` — matches the existing "other drivers' loads"
  permission-matrix precedent exactly (dispatch+admin, not lead). New
  `viewedUserId` state (defaults to `effectiveUserId`, resets whenever it
  changes) drives `useLoadHistory`; a new switcher pill above the Loads
  section (reuses the existing `DriverPicker.tsx` component, wrapped in a
  `FullscreenModal` here since it's normally rendered inline on the
  Dispatch tab) lets admin/dispatch pick any company member, including
  themselves. Section/tile title reads "My Loads" whenever
  `viewedUserId === effectiveUserId`, else "Loads."
- **Compliance moved up**, now directly after Loads (was last). Its
  Credentials fetch (profile/license/medical/twic) is now scoped to
  `viewedUserId` instead of `effectiveUserId`, so an admin viewing another
  driver's loads sees that same driver's credentials. Terminal Cards
  needed no change — already company-wide, no per-user scoping.
- **New equipment selector**, admin/dispatch/lead only
  (`canPickEquipment` — deliberately a *wider* set than
  `canViewOthers`, and a narrower read-only carve-out from the general
  equipment-edit permission matrix, per explicit user instruction for
  this specific feature). New `app/planner/components/EquipmentComboPicker.tsx`
  — no existing lightweight "pick any combo" component existed
  (`EquipmentModal`/`SoloEquipmentModal`/admin's `CoupleModal` are all
  coupled to claim/couple RPCs); this is a pure read-only picker over the
  already-fetched `equipment.combos` array, no RPCs. A privileged role's
  pick (`reportComboId`) overrides which combo Scale/Service/Wash History
  reports on; everyone else keeps seeing their own Planner-selected
  equipment, unchanged.
- **Differentiated sub-labels**, replacing one shared generic
  "equipment label" string across all three history tiles: Scale History
  now shows tare weight (`Tare {tare_lbs} lbs`, straight off the resolved
  combo); Service History shows next service due, computed via
  `SoloEquipmentModal.tsx`'s existing `computeUnitServiceDue` (now
  exported, along with its `UnitServiceDue`/`ServiceRecordLite` types,
  rather than reimplemented — same due-computation the driver's own
  equipment modal report line already uses); Wash History shows the most
  recent `wash_records.washed_at` for the combo's truck (or trailer, if
  the combo has no truck).

**Not live-verified this pass** — same category of gap this project has
flagged repeatedly for role-matrix work: no real dispatch/lead-role login
was available to exercise the Reports page's driver/equipment pickers
end-to-end. No new migration is needed for item 7 after the same-day
simplification above, so the Planner's running-average card is verifiable
against the existing demo/QA company like everything else in this batch.

## Pre-launch cleanup (before app store submission)
Running list of known rough edges that aren't urgent but shouldn't ship as-is.
Add to this as more turn up.

- ~~**Orphaned "planned" `load_log` rows never get cleaned up.**~~ —
  **prevention shipped 2026-08-13**, backlog cleanup written but not yet
  applied. Option (b) from the original writeup: `useLoadWorkflow.ts`'s
  `beginLoadToSupabase` now deletes any existing `status='planned'` row for
  the same `combo_id`+`user_id` (via the same `deleteLoad`/`delete_load`
  RPC the explicit Cancel path already used) *before* calling `begin_load`,
  so a combo can never accumulate more than one abandoned planned row going
  forward, regardless of why the previous attempt was abandoned (background/
  close, not just an explicit Cancel tap). Live-verified: inserted a
  synthetic stale planned row for a real combo directly in the DB, tapped
  LOAD in the app, confirmed via a direct query that the synthetic row was
  gone and exactly one new planned row existed. Live count check the same
  day found only 3 real backlog rows total (not "dozens" — the DB has
  apparently been reseeded/reset since the original July note), all
  identically timestamped (a seed-data artifact, not real accumulated
  abandonment). `supabase/migrations/20260817000000_cleanup_orphaned_planned_loads.sql`
  (written, cascade-delete-safe per `load_lines_load_id_fkey ... ON DELETE
  CASCADE`, **not yet applied** — a bulk production DELETE, even of 3
  known-blank rows, needs the user's own go-ahead, not something to run
  unilaterally) clears anything still `planned` after 24 hours.

- ~~**Abandoned solo companies accumulate with no cleanup.**~~ — **checked
  2026-08-13, currently a non-issue.** Live query (every `companies` row
  with `is_solo = true`, cross-referenced against every
  `user_settings.active_company_id`) found only 3 solo companies total in
  the live DB, and **zero** currently abandoned — every one still has at
  least one user actively pointing at it. The underlying gap described
  below is still real and unfixed (the solo→fleet join flow still doesn't
  clean up the old company), but building a flagging/archive mechanism for
  a problem with zero live instances would be pure speculative
  infrastructure — re-run this same check periodically as the user base
  grows, and only build cleanup once there's an actual backlog to clean.
  Original description, still accurate as an explanation of the gap: the
  solo→fleet join flow (`app/planner/components/JoinFleetView.tsx`, shipped
  2026-08-06) deliberately **abandons** a user's solo company entirely when
  they redeem a fleet invite code — no equipment migration, no deletion of
  the old `companies`/`user_companies` rows, per explicit product decision
  (see "Fleet Tier — Build Spec" → solo→fleet join flow).

## Files safe to delete
- `supabase/migrations_old/` — superseded, confirmed not referenced.
- `node_modules/` should never be zipped/committed — regenerate via `npm install`.
- Dead `complete_load(p_load_id, p_completed_at, p_lines, p_product_updates)`
  4-arg overload (see above) — confirm once more before dropping, but client
  only calls the single-arg version.
