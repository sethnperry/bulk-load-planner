# Pre-Audit Security Remediation — 2026-09-06

Branch: `claude/protankr-pre-audit-remediation-8l1t8w`

Live verification method: authenticated as two isolated demo companies over the
public PostgREST API (anon key + demo-login magic link → `/auth/v1/verify` →
access_token, per CLAUDE.md's own recipe). Direct Postgres (5432) is blocked
outbound; the service-role key is a placeholder in this environment, so
migrations are written and tested against a throwaway local Postgres 16 but
must be APPLIED by the operator in the Supabase SQL editor.

Personas:
- **Alpha** = user `605375f1…6393d`, admin of **Test Company Alpha**
  `1391e05e…b183` (fleet).
- **Beta** = user `b4de39ec…247a2c`, admin of **Test Company Beta**
  `78d57039…e861d6` (solo).

## SECURITY DEFINER audit (live functions)

| Function | Caller IDs | Authorization today | Verdict |
|---|---|---|---|
| `begin_load(payload)` | combo_id, terminal_id | auth + combo active only | 🔴 no company check — **PROVEN exploitable** |
| `claim_combo(p_combo_id)` | combo_id | auth + active only | 🔴 no company check — **PROVEN exploitable** |
| `slip_seat_combo(p_combo_id)` | combo_id | auth + active only | 🔴 no company check (client uses this) |
| `couple_combo(truck,trailer,…)` 5-arg | truck_id, trailer_id | resolves CALLER company, never verifies the equipment belongs to it | 🔴 no ownership check |
| `create_combo(truck,trailer,…)` | truck_id, trailer_id | auth only; inserts combo with **no company_id** | 🔴 (no client caller, but live-callable) |
| `decouple_combo(p_combo_id uuid)` | combo_id | auth only | 🔴 cross-company deactivate |
| `decouple_combo(text,12-arg)` | combo_id | auth only; also writes truck/trailer status by id | 🔴 (client uses this) |
| `couple_combo(…,p_user_id,…)` 7-arg | truck,trailer,user | `role='service_role'` gate | 🟢 |
| `claim_combo(p_combo_id,p_user_id)` 2-arg | combo,user | service-role gate | 🟢 |
| `complete_load(payload)` | load_id | **owner check** (`user_id != auth.uid()` → error); terminal_products write is by-design global crowdsourcing | 🟢 preserve |
| `delete_load(p_load_id)` | load_id | owner check | 🟢 |
| `record_load_utilization(p_load_id)` | load_id | owner check | 🟢 |
| `get_carded(p_terminal_id)` | terminal_id | self-scoped write; terminals are global reference data | 🟢 |
| `demo_commandeer()` | — | self-scoped | 🟢 |
| `provision_solo_company()` | — | self-scoped, idempotent, no-op if already a member | 🟢 |
| `is_company_staff(company_id)` | company_id | boolean membership helper | 🟢 |
| `super_admin_update_company(…)` | company_id | `is_super_admin()` check + fixed search_path | 🟢 (reference pattern) |
| `enforce_equipment_status_only_update` | trigger | `is_company_staff` / service bypass | 🟢 |
| `set_active_company(p_company_id)` (live-only) | company_id | **membership check** — rejects non-member | 🟢 PROVEN safe |

Six legacy incentive SD functions (`calculate_load_points`,
`_calculate_load_points_core`, `recalculate_load_points`,
`backfill_incentive_points`, `edit_load_line`, `flag_stale_payroll_reports`)
were dropped live by `20260906010000` — confirmed gone (PGRST202).

## Live baseline penetration test (before fixes)

Run over PostgREST as Company A against Company B ids (2026-09-06):

```
A->B trucks   SELECT ............ DENIED (RLS isolates live)
A->B trailers SELECT ............ DENIED
A->B trailer_compartments SELECT  DENIED
A->B equipment_combos SELECT ..... DENIED
A->B decouple_events SELECT ...... DENIED
A->B truck    UPDATE ............ DENIED (0 rows)
A->B truck    DELETE ............ DENIED (0 rows)
A->B user_settings UPDATE ........ DENIED (0 rows)
A   INSERT self into Company B .... DENIED (403 RLS)
A->B set_active_company .......... DENIED ("not a member")
A->B claim_combo ................. **SUCCEEDED**  ← RPC bypasses RLS (reverted)
A->B begin_load .................. **SUCCEEDED**  ← leaked B tare/target (deleted)
```

Key result: **direct table access already isolates correctly in production**;
the exploitable holes were the RLS-bypassing SECURITY DEFINER RPCs.

A second finding surfaced testing item #8: a company **admin** can UPDATE their
own `user_companies.role` to an arbitrary string. Setting a non-admin value
(e.g. `'superadmin'`) then fails `is_company_admin()`, self-locking the account
out of the very rights needed to undo it. A plain **driver cannot** change roles
at all (the UPDATE policy is `is_company_admin`-gated), so there is no
non-admin escalation path — but the arbitrary-value write is an integrity hole.

## Fixes

### Migrations added (all written + verified on a throwaway Postgres 16; NOT yet applied to live)

1. **`20260907000000_rpc_company_authorization.sql`** — adds `_caller_in_company`
   / `_combo_company` helpers (execute revoked from anon/authenticated) and
   re-defines 7 RPCs to verify the caller is a member of the owning company of
   every id they pass, raising a generic `Not authorized` (no existence oracle):
   `begin_load`, `claim_combo`, `slip_seat_combo`, `couple_combo` (5-arg),
   `create_combo`, `decouple_combo` (uuid), `decouple_combo` (12-arg). All other
   behavior preserved verbatim; the 12-arg decouple and create_combo also gain a
   pinned `search_path`.
2. **`20260907010000_rls_drop_permissive_company_reads.sql`** — drops the dormant
   `using (true)` SELECT policies on `trucks` / `trailers` /
   `trailer_compartments`, re-asserts the company-scoped `trucks_select` /
   `trailers_select`, and adds a company-scoped SELECT policy for
   `trailer_compartments` (which previously had only `using (true)`). Global
   reference tables (products, terminals, terminal_products, cities, states) are
   deliberately untouched. No-op on live (already isolated); closes the
   rebuild-from-migrations hazard.
3. **`20260907020000_user_companies_valid_role_guard.sql`** — a BEFORE INSERT OR
   UPDATE trigger rejecting any `user_companies.role` outside
   `{owner,admin,lead,dispatch,driver}`. Applies cleanly to live even with the
   pre-existing bad row (validates only rows being written); recovery to a valid
   role passes.

### RPC authorization change summary

| RPC | Old model | New model |
|---|---|---|
| `begin_load` | auth + combo active | auth + combo active + **caller ∈ combo.company** |
| `claim_combo` | auth + combo active | auth + combo active + **caller ∈ combo.company** |
| `slip_seat_combo` | auth + combo active | auth + combo active + **caller ∈ combo.company** |
| `couple_combo` (5-arg) | auth + caller's first company | auth + **truck & trailer in the SAME company + caller ∈ it**; combo stamped with that company |
| `create_combo` | auth only; **no company_id set** | auth + same-company ownership + **stamps company_id** + pinned search_path |
| `decouple_combo` (uuid) | auth only | auth + **caller ∈ combo.company** |
| `decouple_combo` (12-arg) | auth only, no search_path | auth + **caller ∈ combo.company** + pinned search_path |

### App-code changes

- **`app/join/JoinClient.tsx`** — replaced the fixed `setTimeout(1000)` auth
  race with a deterministic `waitForSession()` (reacts to `onAuthStateChange`,
  polls `getSession`, bounded 12s timeout that fails cleanly). On failure the
  user is offered **Back to login / Try again** instead of "Go to app anyway →
  /profile"; success now lands on `/planner` (company context) rather than the
  `/profile` dead end. Raw errors are logged, never shown. (Note: `/join` is not
  currently on the invite path — invites land at `/auth/confirm` — but the brief
  called it out and the fix is safe.)
- **`app/api/admin/invite/route.ts`** — a re-invite of an **existing** company
  member no longer overwrites their role (was `upsert{role}`, "re-invite may
  change role"). Membership is added only if absent; role reassignment stays in
  the admin roster dropdown. The new-user path is unchanged.

## Post-fix verification (throwaway Postgres 16, faithful stub of two isolated companies)

```
A->B claim_combo ................. DENIED (Not authorized)
A->B slip_seat_combo ............. DENIED (Not authorized)
A->B begin_load .................. DENIED (Not authorized)
A->B decouple_combo (uuid) ....... DENIED (Not authorized)
A->B decouple_combo (12-arg) ..... DENIED (Not authorized)
A->B couple_combo (B+B) .......... DENIED (Not authorized)
A->B couple_combo (A truck+B trlr) DENIED (Not authorized)
A->B create_combo ................ DENIED (Not authorized)
unauthenticated claim_combo ...... DENIED (Not authenticated)
nonexistent-uuid claim_combo ..... DENIED (Not authorized)  [same message → no oracle]
HAPPY PATH — A on its OWN equipment:
  claim / begin_load / couple / decouple ... all OK
B combo state after the attacks .. unchanged (active, unclaimed)
RLS: A sees B truck/trailer/compartment .. 0 visible after fix; B still sees own
role guard: write 'hacker' BLOCKED; recover to 'admin' OK; driver↔dispatch OK
```
Stub fidelity confirmed by loading the pre-fix `claim_combo` body and
reproducing the cross-company leak on the same stub, then re-applying the fix.

`tsc --noEmit` and `next build` both clean after the app-code changes.

## Remaining concerns (could NOT be closed in this environment)

- **The three migrations are NOT applied to live.** Direct Postgres is blocked
  and the service-role key is a placeholder here, so DDL can't run. Until the
  operator applies them in the Supabase SQL editor, the RPC holes remain live.
  Apply order: `20260907000000` → `20260907010000` → `20260907020000` (order
  among them is not strictly required; none depends on another).
- **Demo Alpha role must be restored** (see the deliverable's action item) —
  a required consequence of empirically proving item #8.
- **Live post-fix pentest** can only run after the migrations are applied;
  `docs/security-pentest-live.sh` reproduces the full matrix against production
  and should show every RPC attack DENIED afterward.
- **`app/api/admin/setup`** (impersonation) authorizes the caller as an admin of
  their own active company but its depth of checking that the *target* user
  belongs to that company was not exhaustively tested; the feature is slated for
  removal (CLAUDE.md) — review or remove.
- **`app/api/fuel-temp` POST has no auth** — it only writes global crowdsourced
  bias/ambient data (no company scope), so it is not a cross-company breach, but
  it is an unauthenticated write/OpenWeather-spend surface worth rate-limiting.
- **P1 auth consolidation** (`/auth/callback` vs `/auth/confirm` vs `/join`) and
  the `listUsers({perPage:1000})` scaling in the invite route were reviewed but
  left as documented follow-ups rather than refactored, because invite/login
  email flows cannot be exercised from this environment and an unverifiable
  change to the login path is higher-risk than a tracked TODO.
- **Driver-role empirical checks**: both demo accounts are admins, so the
  "driver cannot escalate / driver read-only" paths are verified architecturally
  (the `is_company_admin` gate) but not with a live driver login.

## Live post-fix verification (PRODUCTION, 2026-09-06)

All four migrations were applied to the live database (Supabase SQL editor) and
the demo Alpha role restored. The full cross-company attack matrix was then re-run
over PostgREST against production (two isolated demo companies), plus a happy-path
regression on own-company equipment. Actual results:

```
Cross-company RPC attacks — Alpha (Company A) against Company B equipment:
   claim_combo ...................... DENIED (Not authorized)
   slip_seat_combo .................. DENIED (Not authorized)
   begin_load ....................... DENIED (Not authorized)
   decouple_combo(uuid) ............. DENIED (Not authorized)
   decouple_combo(12-arg) ........... DENIED (Not authorized)
   couple_combo (no force) .......... DENIED (Not authorized)
   couple_combo (p_force STEAL) ..... DENIED (Not authorized)
   Beta's active combo after attacks .. active, unclaimed — untouched

Cross-user owner checks — Alpha against a Beta load:
   complete_load Alpha -> Beta load .. DENIED (unauthorized: not owner)
   delete_load   Alpha -> Beta load .. DENIED (not owned by you)
   Beta's load after attacks ......... loaded — untouched

Happy path — Alpha on its OWN equipment (created + cleaned up):
   claim_combo own .................. OK
   begin_load own ................... OK (planned row created)
   complete/… … own equipment ....... OK (283 real loaded rows in history)
   delete_load own .................. OK (row removed)
```

A post-apply issue was found and fixed **because** the test ran against live,
not the migration files: `couple_combo` first returned `PGRST203` (overload
ambiguity). Migration `20260720000000` had dropped the 5-arg base overload and
replaced it with a 6-arg `p_force` version (the one the client calls); the first
remediation pass hardened + re-created the dropped 5-arg, reintroducing the
ambiguity and leaving the live 6-arg unprotected — the 6-arg being the worse hole
(under `p_force` it forcibly deactivates and steals already-coupled equipment by
id). Corrected in `20260907030000_couple_combo_force_authorization.sql`: drop the
errant 5-arg, harden the 6-arg. Re-verified live above (both couple_combo
variants DENIED). Lesson reinforced: the migration files lag live — test the
running database.

This supersedes the "NOT applied to live" and "live post-fix pentest can only run
after the migrations are applied" caveats in the earlier sections: the migrations
are applied and the pentest has run against production with the results above.

## RLS verification — every table (live, 2026-09-06)

Systematic cross-company read test: authenticated as Company A, attempted to read
Company B's rows in every table (by company_id / user_id / parent load_id /
equipment id). Global reference tables checked for readability instead.

**Isolated ✓ (company- or user-owned, Company A sees 0 of Company B's):**
companies, equipment_combos, trucks, trailers, trailer_compartments,
equipment_regions, equipment_local_areas, incentive_settings, payroll_reports,
weight_records, equipment_permits, equipment_sensitive_data, service_records,
wash_records, load_log, load_utilization, load_capacity_snapshot,
load_constraints, load_edit_history, user_plan_slots, terminal_access,
my_terminals, user_primary_trucks, user_primary_trailers, user_terminal_cards,
driver_licenses, driver_medical_cards, driver_twic_cards, driver_port_ids,
driver_schedules, profiles, user_settings, user_vault_pin, vault_entries,
vault_reset_tokens, demo_sessions, decouple_events, company_invites.

**Global reference (readable by all authenticated — correct):**
cities, states, products, seed_products, terminals, terminal_products,
permit_types, terminal_temp_bias, fuel_temp_cache, terminal_racks, rack_arms,
rack_lanes, rack_product_status, super_admins (empty).

**Not present live:** company_subscriptions (migration written, not applied —
fails open by design), equipment_attachments / attachments (empty, live-only).

### 🔴 New finding R1 — load_lines globally readable  (FIXED, needs apply)
`load_log` isolates but its child `load_lines` did not — Company A read Company
B's compartment-level load detail (product, planned/actual gallons, temp), and
could see lines from 463 distinct loads vs its own 283. A broad policy exists on
the LIVE table that is absent from every migration file (drift in the dangerous
direction). Fix `20260907040000_load_lines_rls_isolation.sql`: a catalog-driven
DO block drops every policy on load_lines and reinstalls exactly the owner-scoped
CRUD + admin/dispatch company-member read. Verified on Postgres 16: cross-company
read → 0, own read → ok, same-company dispatch read → ok.

### 🟠 New finding R2 — NULL-company rows global on dispatcher_notes / driver_schedules  (FIXED, needs apply)
Both staff policies were `company_id is null OR is_company_staff(company_id)`.
Proven live: Company A inserted a `dispatcher_notes` row with `company_id = NULL`
and Company B read it. Any authenticated user can plant globally-visible/writable
rows, and any accidental NULL-company write becomes cross-tenant. Fix
`20260907050000_dispatcher_notes_schedules_null_company_fix.sql`: policies
tightened to strict `is_company_staff(company_id)` (a NULL insert is now rejected
by WITH CHECK) and `company_id` set NOT NULL (both tables empty). The app always
sets company_id, so legit writes are unaffected. Verified on Postgres 16: NULL
insert rejected, own-company write ok, cross-company read → 0.

## Live-only SECURITY DEFINER functions + user_companies/user_settings CRUD (2026-09-06)

set_active_company (rejects non-member — verified earlier), is_company_admin,
is_super_admin, get_active_company_id: self-scoped read helpers, no cross-company
exposure. admin_set_user_company: gated (Forbidden for non-admin). redeem_invite /
generate_invite_code: generate_invite_code takes no args (cannot target another
company or elevate role); company_invites is unreadable to a normal admin (strict
RLS), no cross-company leak. update_terminal_temp_bias: writes global crowdsourced
data only.

user_companies / user_settings cross-user writes — all DENIED:
```
UPDATE Beta member role (cross-company) ..... DENIED
DELETE Beta member membership ............... DENIED
INSERT membership into Beta company ......... DENIED
UPDATE Beta user_settings (cross-user) ...... DENIED
INSERT/DELETE Beta user_settings ............ DENIED
```

### 🟠 New finding R3 — get_display_names_full leaks profile PII cross-company
`get_display_names_full(p_user_ids uuid[])` (SECURITY DEFINER) returns any user's
full profile — display_name, hire_date, division, region, local_area,
employee_number — with NO company-membership check, bypassing the `profiles`
table's own RLS (which correctly returns 0 for the same cross-company read).
Proven live: Company A resolved Company B's user to "Demo Demopoulos", hire date,
employee #349807, etc. The function is called throughout the app (roster, loads,
credentials), so the fix must preserve its exact signature/return shape — the
live definition (`pg_get_functiondef`) is needed to harden it precisely by adding
a "shares a company with the caller, or is the caller" filter. **Not yet fixed —
awaiting the exact definition.**

### 🟠 New finding R4 — a user can delete their own user_companies membership (irrecoverable)
`user_companies` DELETE allows a user to remove their OWN membership row
(confirmed live — the demo Alpha admin deleted its Company A membership). Because
`user_companies_no_direct_insert` blocks client inserts, there is no client path
to re-add it: the user is locked out and, for a solo / sole-admin company, the
company is orphaned. Cross-user DELETE is correctly denied; only self-delete is
the issue. Recommended fix: a DELETE policy / trigger that forbids removing the
last owner/admin of a company (or removes the self-delete grant entirely if
"leave company" is not a real feature). Restore SQL for the demo account:
`docs/apply-restore-alpha-membership.sql`.

## API routes / server actions audit (2026-09-06)

No `"use server"` server actions exist. Seven API routes; service-role usage in
all but early-access:

| Route | Auth | Company/target scoping | Verdict |
|---|---|---|---|
| `/api/admin/invite` | Bearer + verifyAdmin (admin of the target company) | company from body, admin-checked; role-preservation fix already shipped | OK |
| `/api/admin/setup` | Bearer + verifyAdmin (admin/lead of own company) | **was MISSING target scoping** — see R5 below | FIXED |
| `/api/vault/request-reset` | Bearer → getUser | self-scoped (user.id) | OK |
| `/api/vault/confirm-reset` | Bearer → getUser | self-scoped | OK |
| `/api/fuel-temp` | none | writes only global crowdsourced bias/ambient (no company scope) | low-sev (unauth write/spend surface) |
| `/api/early-access` | none (public contact form) | no data access | OK |
| `/api/demo/start` | none; persona key → fixed demo email only | cannot select an arbitrary account | OK |

### 🔴 New finding R5 — /api/admin/setup: any company admin could read/write ANY company's users (FIXED, needs deploy)
`verifyAdmin` proved the caller is an admin/lead of *their own* active company,
but every op then ran through the **service-role client (bypasses RLS)** on a
caller-supplied `targetUserId` with **no check that the target belongs to the
caller's company**. Proven live: Company B's admin called
`get_card_data` with Company A's user id and received Company A's terminal
**card numbers, PINs, and private notes**. The same hole exposed set_card_data,
set/remove_primary_truck/trailer, get/set_terminal_access, get/set_my_terminals,
and claim/couple/slip_seat_combo for arbitrary cross-company users.
**Fix (app code, `app/api/admin/setup/route.ts`):** verifyAdmin now also returns
the caller's companyId, and POST rejects (403) any `targetUserId` that is not a
member of that company before dispatching any op. Legit same-company setup
(the driver picker only lists company members) is unaffected. Deploys with the
branch merge; `tsc`/`next build` clean. (This whole impersonation feature is
slated for removal per CLAUDE.md — the fix secures it until then.)

### R4 fix (decided 2026-09-07): drivers may not self-remove
Per operator decision, a driver must not be able to remove themselves from a
company. `20260907060000_user_companies_block_self_delete.sql` revokes the direct
DELETE grant on `user_companies` from authenticated/anon (and drops any DELETE
policy). All legit removal already flows through `admin_remove_member` (SECURITY
DEFINER, verified live to reject non-admin/cross-company callers with "Admin
access required"), which is unaffected by the revoke. Joining a new company is an
INSERT via `redeem_invite`, also unaffected — a re-hired driver keeps the same
account/email and is added to the new company. Verified on Postgres 16: after the
revoke a direct authenticated self-delete is "permission denied", while a
SECURITY DEFINER remove still works.
