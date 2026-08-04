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

### Open questions (Fleet spec)
- Tie-break rule if a split load has two compartments with exactly equal
  gallons of different products.

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
- **Admin toggle (maybe, if feasible)**: admin can flip themselves between
  "admin mode" (Dispatch middle tab) and "lead driver mode" (Planner middle
  tab) so they can personally load equipment when needed, without going
  through the existing full-impersonation ("Set up planner for X") flow.
  Nice-to-have, not confirmed as must-ship.
- **Cards tab is contextual for admin/dispatch**: instead of their own cards
  (neither role logs their own loads/cards in the field), it reflects
  whichever driver is currently selected — same driver selected for the
  Dispatch tab. Driver/lead roles keep their own Cards tab as today.
- Vault tab: unchanged, every role keeps their own personal vault, no
  changes needed.

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

`tsc --noEmit` is clean across the whole project. **Not yet live-verified in
a browser** — three attempts to start a dev server for this session hit what
looks like an environment/sandboxing issue (the tool reported success each
time, but nothing was ever actually reachable via `curl` or browser
`navigate`, even after adding `autoPort`/`--` port-forwarding to
`.claude/launch.json`). Stopped after three attempts rather than keep
retrying a wall that didn't look code-related. Worth a real click-through
(create a rack, STUD a lane, STUD a rack product, confirm the temp-bias feed
and the driver-hidden Edit Terminal gate) next time a working preview is
available.

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
   month) — not just "add a row somewhere."

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
Still not live-browser-verified — same session dev-server environment issue
as the Terminal tab schema pass (tool reports success, nothing actually
reachable via `curl`/`navigate`; tried again this pass, same result, not
retried further).

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
(role === "admin" && adminActingAsLead)`. Picking a trainee just sets local
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
7. ~~**Presets rework.**~~ — **shipped 2026-08-06.** Scope changed from the
   original spec during a live clarifying pass with the user (see #8 below
   too — both items landed together, not sequenced, since the "equipment
   settings" destination turned out to already exist rather than needing a
   new gear-icon modal):
   - Tap a **filled** preset slot now opens an action sheet (`PresetActionSheet`,
     new `app/calculator/components/PresetActionSheet.tsx`) — "Load {summary}"
     / "Edit Preset" / "Clear Preset", with a confirm step in front of the
     two destructive ones ("Save current configuration as Preset B? This
     replaces what's currently saved there (ULSD Diesel #2).") — no more
     silent overwrite on tap. Tapping an **empty** slot still saves straight
     through (nothing to protect). `PresetDial.tsx`'s tap handler now calls
     a new `onTapFilled` callback instead of `onLoad` directly for filled
     slots; hold-to-clear/hold-to-save (a deliberate, non-accidental gesture)
     is unchanged.
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

## Pre-launch cleanup (before app store submission)
Running list of known rough edges that aren't urgent but shouldn't ship as-is.
Add to this as more turn up.

- **Orphaned "planned" `load_log` rows never get cleaned up.** Tapping LOAD on
  the planner immediately inserts a `load_log` row with `status='planned'` --
  before the driver ever reaches the Loading modal's LOADED button. If the
  load is abandoned (backgrounds the app, changes their mind, was just poking
  at the UI), that row lingers forever with no expiry/cleanup path. Confirmed
  live 2026-07-22: dozens of these already exist for a single combo going back
  to June, interspersed with real `status='loaded'` completions -- this has
  been silently accumulating for a while, not a one-off. They're low-harm
  (no `actual_total_gal`, don't feed `terminal_temp_bias` or
  `terminal_products`, and "My Loads" shows them with a bare `—` instead of a
  diff) but it's unbounded table growth and clutters load history. Needs
  either: (a) a scheduled cleanup (delete/archive `planned` rows past some
  age with no completion), or (b) app-side logic to reuse/replace a combo's
  existing `planned` row instead of inserting a new one each time LOAD is
  tapped.

- **Abandoned solo companies accumulate with no cleanup.** The solo→fleet
  join flow (`app/calculator/components/JoinFleetView.tsx`, shipped
  2026-08-06) deliberately **abandons** a user's solo company entirely when
  they redeem a fleet invite code — no equipment migration, no deletion of
  the old `companies`/`user_companies` rows, per explicit product decision
  (see "Fleet Tier — Build Spec" → solo→fleet join flow). This means every
  solo user who later joins a real fleet leaves an orphaned, never-cleaned-up
  solo `companies` row behind forever — same shape as the `load_log` issue
  above (unbounded, low-harm-per-row table growth). Worth a scheduled
  cleanup pass eventually (e.g. flag/archive solo companies with no
  `user_companies` row still pointing at them as `active_company_id`), not
  urgent enough to block anything today.

## Files safe to delete
- `supabase/migrations_old/` — superseded, confirmed not referenced.
- `node_modules/` should never be zipped/committed — regenerate via `npm install`.
- Dead `complete_load(p_load_id, p_completed_at, p_lines, p_product_updates)`
  4-arg overload (see above) — confirm once more before dropping, but client
  only calls the single-arg version.
