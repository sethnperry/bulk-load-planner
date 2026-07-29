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

**Not started — deferred, genuinely separate deliverable:** the payroll
report (pay-period generation from `incentive_settings.pay_period_type` +
`pay_period_anchor_date`, driver/loads/gallons/points table view, CSV
export with blank "$ amount" column, edit-and-recalculate preserving the
original `density_at_load` snapshot unless the edit specifically corrects a
bad density reading, edit history tracking, "stale" flagging of
already-exported reports). The `pay_period_type`/`pay_period_anchor_date`
columns already exist on `incentive_settings` (added now to avoid a second
migration touching that table later) but nothing reads them yet.

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
