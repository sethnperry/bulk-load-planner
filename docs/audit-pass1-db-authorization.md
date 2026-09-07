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
