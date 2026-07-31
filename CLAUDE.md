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

**Migration queued, not yet applied**: `supabase/migrations/20260731000000_equipment_sharing_attribution.sql`
(adds `equipment_attachments.uploaded_by` + creates `equipment_sensitive_data`).
Run in the Supabase SQL editor, then re-apply the attachment-attribution diff
described above.

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
- Aggregate "gallons left on the table" across all trucks/drivers — the
  number that justifies the subscription to a fleet owner.

### Terminal card / credential management (fleet-wide)
- Fleet-wide view of who's carded where, filterable by terminal (so dispatch
  doesn't send an uncarded driver).
- **Priority terminal flagging**: dispatch flags a specific terminal for a
  *specific* driver (not all drivers) to prompt them to get carded there.
  Surfaces in that driver's location button and/or Cards tab. Cards tab needs
  a new "flagged" filter. Progress bar shows both driver and dispatcher how
  many more training loads are needed until the flagged card goes active.

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

Migration (queued, not applied): `supabase/migrations/20260801000000_fleet_terminal_card_visibility.sql`
adds one new, purely additive SELECT policy on `terminal_access` for
admin+dispatch across the company — doesn't drop/replace whatever policy
already exists there (unknown exact shape, no DB access to check). Only
verified end-to-end for the *same-user* case (the one test company
available has a single member, so cross-driver visibility itself is
architecturally sound but not empirically confirmed the way the dispatch
role's load-visibility swap was) — worth a real check with a second driver
in the company after the migration runs.

**Priority terminal flagging — design confirmed with user 2026-08-01, not
yet built (queued behind the Incentive System).** Bigger than a simple
"N training loads" counter — it's a **customizable per-terminal checklist**
with progress tracking, not a fixed rule:

- **Per-terminal, admin-configurable checklist** — each terminal has its own
  list of carding requirements, set on the terminal setup/admin page
  (existing "Terminals" section in `app/admin/page.tsx`, or the terminal
  product setup screen — same company-scoped-list pattern already
  established by `service_types`/`permit_types`, reuse that shape rather
  than inventing a new one). At minimum one item is "N training loads"
  (the number itself is per-terminal, since terminals vary — e.g. 3 vs 5),
  but the list can also hold arbitrary other steps ("anything else that may
  be on the list to get carded" — safety briefing, paperwork, etc, not
  load-count-based).
- **Driver-facing flow**: when a driver selects a terminal in the Planner
  that isn't active yet (flagged/in-training for them), a window opens
  showing that terminal's checklist before the Planner is revealed. The
  driver checks off which step they're on. Some items likely auto-track
  (the "training loads" counter increments from actual completed loads at
  that terminal once flagged), others are probably manually checked
  (non-load steps) — exact auto-vs-manual split per item type still needs
  nailing down at build time, but the checklist-with-mixed-item-types shape
  itself is confirmed.
- **Load tagging**: when the driver actually loads at a flagged/in-training
  terminal, that load gets a DB note identifying it as a training load (or
  whichever checklist step it corresponds to) — likely a nullable column
  on `load_log` linking back to the checklist item, so a training load is
  still a completely normal load, just annotated.
- **Manager/dispatch visibility**: progress against the checklist (not just
  a boolean "flagged or not") should be visible to admin/dispatch — natural
  extension of `FleetCardsModal.tsx` (already shows per-driver per-terminal
  status; this would add a progress readout, e.g. "2 of 5 training loads,
  1 of 2 other steps").

Still open at build time: exact schema (a `terminal_checklist_items`
company+terminal-scoped table + a per-driver progress table, mirroring the
`service_types`/`service_records` split already used for service history);
whether "goes active" needs an explicit admin/dispatch confirm step or
auto-clears once every item is checked; whether it surfaces via the
location button, Cards tab, or both (user said "and/or" originally, hasn't
been pinned down further).

#### Shipped 2026-08-03

Migration (queued, not applied): `supabase/migrations/20260803000000_terminal_checklist.sql`
adds `terminal_checklist_items` (company+terminal scoped, RLS mirrors the
existing service_types/equipment pattern exactly -- full CRUD open to any
active-company member, not role-gated at the RLS level; role gating for
who can *edit* it is admin/lead-only in the UI, same convention as
trucks/trailers), `terminal_checklist_progress` (per-driver, no direct
client write at all -- only the two RPCs below touch it), and a nullable
`load_log.training_checklist_item_id` tag column.

Design decisions made (the three "still open" questions above, resolved):
- **Auto-clears once every item is checked** -- no separate admin/dispatch
  confirm step. Simpler, and matches the driver flow as described (the
  checklist modal is a progress tracker, not an approval queue).
- **Decoupled from `terminal_access` carding** -- this checklist is its own
  independent gate, not a schema change to the existing card-visibility
  system shipped in the "Terminal card / credential management" section
  above. A terminal with zero configured checklist items has no gate at
  all, so existing companies not using this feature see zero behavior
  change.
- **Surfaces via both** the location button (driver-facing, the primary
  flow) and Fleet Cards (manager-facing progress readout) -- built both,
  not just one.

Built:
- `toggle_terminal_checklist_item(p_item_id, p_checked)` RPC -- driver
  checks/unchecks a manual step; rejects `training_loads`-type items (those
  only ever move via real loads).
- `record_terminal_checklist_load(p_load_id)` RPC -- called fire-and-forget
  non-fatal from `useLoadWorkflow.ts` right after `complete_load` (same
  pattern as `calculate_load_points`, added right alongside it). Finds the
  first incomplete `training_loads` item for that terminal+driver, if any,
  increments its progress, and tags the load via
  `load_log.training_checklist_item_id`. No-ops silently otherwise.
- `TerminalChecklistEditorModal.tsx` (new, admin) -- reachable via a
  "Training Checklist" button inside the existing terminal edit modal
  (`app/admin/page.tsx`'s `TerminalModal`, gated to existing/non-new
  terminals only, same convention as the sensitive-equipment-data section).
  Add/soft-delete steps, either `training_loads` (with a required count) or
  `manual`.
- `TerminalChecklistModal.tsx` (new, driver-facing) -- `app/calculator/page.tsx`
  watches `location.selectedTerminalId`; whenever it changes, checks for an
  incomplete checklist and if found, opens this modal as an **overlay on
  top of the already-revealed Planner** (not a hard gate -- always
  closeable, matches the user's "check off which step... before closing the
  window revealing the planner" description literally, since the Planner
  underneath was already showing). Manual items are checked via
  `toggle_terminal_checklist_item`; training-load items show live
  auto-tracked progress, read-only.
- `FleetCardsModal.tsx` extended with a per-driver progress line ("2 of 5
  training loads, 1 of 2 other steps") whenever the picked terminal has
  checklist items configured -- the natural manager/dispatch visibility
  extension the spec called for.

### Onboarding
- Replace/rework the existing guided tour with short video clips.
- Fleet training mode: new drivers inherit the fleet's terminal
  history/presets instead of starting cold.

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
fully complete.** Built and queued (migration
`20260804000000_payroll_report.sql`, not yet applied — requires
`20260802000000_incentive_system.sql` to be applied first since it adds a
trigger on `load_points` and reuses `calculate_load_points`):
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

**Migration queued, not yet applied**: `supabase/migrations/20260730000000_dispatch_role_load_visibility.sql`
swaps the `load_log`/`load_lines` "admins can read company member loads"
policies from `role IN ('admin','lead')` to `role IN ('admin','dispatch')` —
this is what actually makes the new "Loads" button return data for a
dispatch user; the app-code gate alone isn't sufficient. **Run this in the
Supabase SQL editor before testing dispatch's Loads view.** Also worth
noting: this is a real behavior change, not additive — leads lose the
cross-driver load visibility they currently have, since the matrix scopes
that to Dispatch + Admin only. Both policies existed live already but were
never in a migration file until this one (confirmed via a live query
2026-07-29 — see "Architecture reality" for why that's unsurprising here).

**Explicitly NOT done, flagged for whenever each area is actually built**:
- Fleet-wide terminal card / credential visibility for dispatch (the real
  subject of the spec's Section 1.3) — the `driver_licenses`/
  `driver_medical_cards`/`driver_port_ids`/`driver_twic_cards`/`attachments`
  RLS policies (all currently `role = 'admin'` only, confirmed live) were
  deliberately left untouched. Extending them to dispatch needs a real
  product decision first: those policies are full `ALL` (CRUD), and giving
  dispatch the same would let dispatch edit/delete another driver's license
  record, which is more than "view who's carded where" implies — don't
  extend blindly, ask.
- The "priority terminal flagging" feature — brand new table/UI, not built.
- **Security flag, not yet verified**: the actual role-reassignment code
  path (`lib/ui/driver/MemberCard.tsx`'s `changeRole()`) is a bare client-side
  `.update()` on `user_companies` with no in-component role check — its only
  protection is whatever RLS exists on `user_companies` UPDATE, which is
  **unconfirmed** (a keyword search for "role" in `pg_policies.qual` would
  miss a function-based check like `is_company_admin()`). Also: the
  `admin_set_user_company` RPC that exists live is dead code, never called
  from anywhere in app-code — don't assume it's the enforcement path.
  Worth a live-DB check before this ships further.
- A likely pre-existing bug, found in passing, not fixed: `reports/page.tsx`'s
  `useLoadHistory(authUserId)` call probably should be
  `useLoadHistory(effectiveUserId)` — as written, an admin using "Set up
  planner for [driver]" impersonation sees *their own* load history in
  Reports → My Loads, not the impersonated driver's, while every other
  fetch on that same page correctly uses `effectiveUserId`.

### Role-based tabs (new UI direction, 2026-07-30, not in the original Fleet Tier spec)

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
6. **Expiration modal — group by city.** Currently a flat list with the
   selected city sorted to top, not visually grouped. Needs: per-city sections
   with a visually stronger header, same treatment carried into the shared
   report output.
7. **Presets rework.**
   - Tap a preset → action sheet ("Load Diesel" / "Edit Preset"), with a
     confirm step ("Save current configuration as Preset B?") before any
     overwrite — no more silent overwrite on tap.
   - Presets store **only the product selection per compartment** — universal
     across terminals (not per-terminal), per-user always (including future
     Fleet tier — never shared/company-level).
   - Headspace + CG slider move **out** of presets entirely.
8. **Equipment settings (new UI).** Gear icon next to each equipment listing →
   opens compartment capacity (trailer settings) + headspace + CG slider
   (moved here from presets, see #7). This is equipment-table-scoped data,
   intersects directly with the solo/fleet equipment schema — sequence with
   any further equipment schema work, not standalone.
9. **Terminal product setup — admin-curated, not driver-selected.**
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
- Mid-Grade gasoline: own slot in the base list, or deferred as exotic?
- Solo→fleet join flow: build the UI against the existing `redeem_invite`
  system (see above) — but the **equipment reconciliation** part (VIN-matched
  duplicate detection, "this will replace your equipment, continue?" warning,
  admin review screen) is genuinely new and unbuilt.
- Post-join permission split (drivers can update status/inspections but not
  core specs/add/delete) — likely an `equipment_activity` append-only log
  table, core `trucks`/`trailers` staying admin-locked. Not started; note that
  RLS currently does NOT enforce this distinction at all (any active-company
  member can already INSERT/UPDATE/DELETE trucks/trailers directly) — this is
  a real gap to close when this ships, not just a UI nicety.

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

## Files safe to delete
- `supabase/migrations_old/` — superseded, confirmed not referenced.
- `node_modules/` should never be zipped/committed — regenerate via `npm install`.
- Dead `complete_load(p_load_id, p_completed_at, p_lines, p_product_updates)`
  4-arg overload (see above) — confirm once more before dropping, but client
  only calls the single-arg version.
