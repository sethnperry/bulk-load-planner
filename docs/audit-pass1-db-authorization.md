# Pass 1 — Complete Database Authorization Audit

Method: live behavioral pen-test under real RLS, authenticating as two demo
users in two different companies via the demo-login recipe (anon key from the
prod bundle → `/api/demo/start` → `token_hash` → `/auth/v1/verify` →
access_token). Structural introspection (every SECURITY DEFINER / every RLS
table / grants) requires service-role and is handed off as SQL (below).

Actors:
- **Alpha** user `605375f1…`, admin of company A `1391e05e…`
- **Beta** user `b4de39ec…`, admin of company B `78d57039…`
- **Shared** user `db7b7930…` (Seth Perry) is a member of **both** A and B
  (a legitimate multi-company / slip-seat driver — and the key to the load
  finding below).

## PASS — verified live, no leak

Cross-company **reads** (Alpha attempting Beta's data) returned 0 rows on:
trucks, trailers, equipment_combos, dispatcher_notes, driver_schedules,
incentive_settings, payroll_reports, equipment_sensitive_data, load_log,
user_plan_slots, user_primary_trucks/trailers, my_terminals, terminal_access,
user_terminal_cards, driver_licenses/medical/twic/port_ids, vault_entries,
user_vault_pin, load_utilization, equipment_permits (via parent), profiles.

- **Vault is strictly self-only** — Alpha cannot read the *shared same-company*
  user's `vault_entries` or `user_vault_pin`, nor Beta's. (Highest-value
  check: passed.)
- Cross-company **writes/IDOR** (Alpha → Beta rows) all blocked: UPDATE
  truck/trailer/combo = 0 rows; combo-claim hijack = 0 rows; UPDATE another
  user's load = 0 rows; INSERT truck into Beta company = RLS 42501;
  `delete_truck` cross-company = "Not authorized"; Beta truck confirmed intact.
- `set_active_company(Beta)` as Alpha → rejected ("not a member").
- `get_company_member_emails` / `get_equipment_roster` / `get_driver_profile`
  cross-company → "Admin access required" / "Access denied".
- **Anon (unauthenticated) read probe** across 24 sensitive tables → 0 rows
  everywhere except `terminal_outage_reports`, which is intentionally public
  and correctly exposes only `out_of_product` (not company-scoped
  `out_of_allocation`).
- NULL-company + cross-company INSERT on `dispatcher_notes` → RLS 42501
  (confirms the 20260907050000 fix live).
- API routes: `admin/invite` gates to `role='admin'` of the target company;
  `admin/setup` gates to admin/lead of the caller's active company AND checks
  the target user is a member of it (R5); vault reset routes scope to the
  caller's own user id. Solid.

## FINDINGS

### F-A [MEDIUM] Multi-company driver: loads visible across all their companies
`load_log` and `load_lines` carry **no `company_id`**. Loads are attributed by
`user_id` only, and the admin/dispatch cross-read policy grants access to any
load whose owner shares the reader's active company. So a driver who belongs
to two companies has **every** load's detail (product, gallons, terminal)
visible to admins/dispatch of **both** companies, with no per-load boundary.

Confirmed live: Alpha (company A admin) read `db7b7930`'s `load_lines`
(4300 / 3431 gal ULSD) for a load that also shows in company B. By contrast
`load_utilization` returned `[]` for the same load — it has a real
`company_id` column and isolates correctly, which is the model the load tables
should follow.

Impact: cross-company operational-data exposure whenever a driver is in >1
company (slip-seat / re-hire — a real fleet-tier case). Not a broken policy;
a data-model gap. Fix direction: add `company_id` to `load_log` (stamped at
`begin_load` from the active company), carry it to `load_lines` or join
through it, and scope the admin cross-read policy by that column. Non-trivial
(schema + begin_load + policy + backfill). Likely acceptable for the current
single-operator state; must be addressed before multi-company fleets are live.

### F-B [HIGH for launch] `/api/demo/start` mints admin login, unauthenticated
Anyone on the internet can `GET /api/demo/start?persona=alpha` and receive a
working magic-link session as the demo company admin (this is how the audit
authenticated). Persona list is env-gated, but the endpoint itself has no
auth. Fine while demo companies hold only QA data; a data-exposure hole the
moment any demo/persona account shares a company with real data. Gate or
remove before launch (e.g. disable when NODE_ENV=production, or behind a
secret).

### F-C [LOW] Duplicate `user_companies` rows / no unique constraint
Both Alpha and Beta have **two identical** `(user_id, company_id, role)` rows.
Indicates no unique constraint on `(user_id, company_id)`. Causes duplicate
roster entries / inflated member counts and can interact badly with
membership logic. Fix: dedupe, add `unique (user_id, company_id)`.

### F-D [NEEDS STRUCTURAL CONFIRM] profiles same-company PII read scope
Alpha read the shared same-company user's `employee_number` + `region` from
`profiles` directly. Legitimate for an admin roster, but the policy shape must
be confirmed: a **plain driver** must not be able to read co-workers'
`employee_number`. Needs `pg_policies` on `profiles` (structural query below).

## STRUCTURAL INTROSPECTION — run in SQL editor (service role), paste back

Behavioral testing proves the *known* surface is isolated; these two queries
prove *completeness* (every RLS table, every SECURITY DEFINER, no anon
grants, no RLS-off table), which anon/user tokens cannot read.

### Query 1 — one JSON result, paste inline
```sql
select jsonb_pretty(jsonb_build_object(
  'rls_disabled_base_tables', (
    select coalesce(jsonb_agg(c.relname order by c.relname),'[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'rls_enabled_but_no_policy', (
    select coalesce(jsonb_agg(c.relname order by c.relname),'[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
      and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)),
  'anon_table_grants', (
    select coalesce(jsonb_agg(distinct table_name order by table_name),'[]'::jsonb)
    from information_schema.role_table_grants
    where table_schema='public' and grantee='anon'
      and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')),
  'security_definer_fns', (
    select coalesce(jsonb_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' order by p.proname),'[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef)
));
```

### Query 2 — full policy dump, use "Download CSV" (too big to paste)
```sql
select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname='public'
order by tablename, cmd, policyname;
```

From Query 1 I check: any `rls_disabled_base_tables` (a table with RLS OFF is
open to every authenticated user — the worst case), any unexpected
`anon_table_grants`, and the full `security_definer_fns` list to diff against
the functions already audited/hardened this session (only the un-reviewed ones
need their bodies pulled). From Query 2 I read every policy's `qual`/
`with_check` to confirm each RLS table is scoped and to resolve F-D.

---

## Structural findings (from live pg_policies + Query 1)

- **RLS enabled on every base table** (`rls_disabled_base_tables: []`) — no
  wide-open tables. `rls_enabled_but_no_policy` = vault_reset_tokens,
  ambient_temp_history, fuel_temp_cache, seed_products — all correctly
  deny-all-to-clients (service-role/definer only). No anon-role policies.
- **Views respect RLS** — `my_terminals_with_status/_access`,
  `v_terminal_product_catalog/_admin` return 0 to anon and only the caller's
  company data to Alpha (security_invoker). No view bypass.

### F-E [MEDIUM] decouple_events readable across all companies — FIX WRITTEN
`SELECT qual = true` (role authenticated) → any authenticated user read every
company's decouple history incl. equipment GPS/location/notes. Proven live
(Alpha and Beta saw identical rows). App never reads the table; INSERT is
self-scoped. Fixed: `20260907110000_decouple_events_scope_read.sql`
(actor-or-equipment-company-staff).

### F-D [LOW-MED] profiles co-worker read exposed HR PII to any member — FIX WRITTEN
"Company members can read co-worker profiles" allowed any member (incl. plain
driver) to read a co-worker's full row (employee_number, hire_date, division).
Every direct profiles read in the app is self or an admin/dispatch tool, so
narrowing to staff is safe. Fixed:
`20260907120000_profiles_coworker_read_staff_only.sql`.

### load_edit_history [LOW] policy checked the wrong user's role — FIX WRITTEN
Granted read based on the LOAD OWNER's role, not the caller's (intra-company
only). Fixed: `20260907130000_load_edit_history_caller_role_fix.sql`.

### F-C [LOW] duplicate user_companies rows — FIX WRITTEN
No unique(user_id,company_id); both demo users had 2 identical rows. Dedupe +
constraint: `20260907140000_user_companies_unique_membership.sql`.

### Accepted-risk (known, per CLAUDE.md): rack_arms/rack_lanes `allow_all_authenticated`
`[ALL] qual=true` — any authenticated user can write shared terminal rack
config (UI-gated only, not RLS-gated). Documented accepted risk; reflagged.

## STILL OPEN — needs the mutating SECURITY DEFINER bodies (privilege-escalation check)
These are directly callable by any authenticated user; names alone don't prove
they check the caller. Bodies requested (query below). Highest risk:
`admin_set_user_company`, `invite_user_to_company` (set membership/role);
`get_carded(…, p_user_id)`, `admin_get_carded`, `admin_remove_member`,
`admin_remove_terminal_access`, `upsert_driver_profile` (cross-user writes);
`demo_commandeer` (demo backdoor scope).

## Findings NOT auto-fixed (need product decision)
- **F-A [MED]** load_log/load_lines no company_id — multi-company driver load
  exposure. Schema + begin_load + policy rework; deferred.
- **F-B [HIGH for launch]** /api/demo/start public admin login — FIXED: now
  refuses on production (VERCEL_ENV=production) unless DEMO_START_ALLOW_PROD=
  "true"; dev/preview unchanged. (Note: this disables the live pen-test
  recipe against prod going forward — flip the escape hatch for a testing
  window if needed.)

---

## SECURITY DEFINER function review (bodies pulled from live)

All 47 SECURITY DEFINER functions reviewed. Authorization verdicts:

**SAFE (correctly gated):**
- `admin_set_user_company` — `is_super_admin()` only (the highest-risk one:
  sets arbitrary membership/role; correctly super-admin-gated).
- `get_carded(p_terminal_id, p_carded_on, p_user_id)` — the cross-user card
  variant is **service_role-only** (checks `request.jwt.claims` role).
- `invite_user_to_company`, `admin_remove_member` — require caller = admin of
  the target company; only touch that company's rows.
- `admin_get_carded` / `admin_remove_terminal_access` — caller admin check
  present (but see F-H below re: target membership).
- Self-scoped: `redeem_invite` (atomic, row-locked; grants only the invite's
  role), `provision_solo_company`, `demo_commandeer`, `get_carded` 1-/2-arg,
  `set_active_company`, `cancel_planned_load`, plus the combo/load RPCs
  hardened earlier this session.
- Predicate helpers (`is_company_admin/staff/member`, `is_member_of`,
  `is_super_admin`, `get_active_company_id`, `_caller_in_company`,
  `_combo_company`) — read-only.
- `get_display_names` / `get_display_names_full` — hardened earlier (R3).

### F-G [MEDIUM] upsert_driver_profile: arbitrary-user profile overwrite — FIX WRITTEN
Checked caller = admin of `p_company_id` but not that `p_user_id` is a member
of it. `profiles` is keyed by `user_id` alone (global), so an admin of ANY
company could overwrite ANY user's profile PII (name, employee_number,
hire_date), including users in other companies. Fixed:
`20260907150000_secdef_target_membership_checks.sql` (adds target-membership
requirement + pins search_path).

### F-H [LOW] admin_get_carded / admin_remove_terminal_access: arbitrary-user card writes — FIX WRITTEN
Same missing target-membership check → an admin could create/delete
`terminal_access` for arbitrary users. Same fix migration (also adds
`SET search_path`, which both lacked).

## PASS 1 STATUS
Structural + behavioral coverage complete. Fix migrations written (NOT yet
applied): 20260907110000, 120000, 130000, 140000, 150000. Deferred for
product decision: F-A (load company_id), F-B (demo/start gating). Everything
else — RPC authz, RLS on every table, cross-company/cross-user/IDOR/NULL/anon
— verified clean or fixed.
