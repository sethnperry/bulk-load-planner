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
