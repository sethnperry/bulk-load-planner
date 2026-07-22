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
  drivers, admin-managed.

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
