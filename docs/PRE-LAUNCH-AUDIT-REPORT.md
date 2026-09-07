# ProTankr — Pre-Launch Security & Correctness Audit
**Date:** 2026-09-06 → 07  ·  **Branch:** `claude/protankr-pre-audit-remediation-8l1t8w`  ·  `main` untouched

## How this was verified
Direct Postgres (5432) is blocked from this environment and the service-role key
is a placeholder here, so testing used two isolated production demo companies
authenticated over the public PostgREST API (anon key → demo magic-link →
`/auth/v1/verify` → access token). SQL fixes were verified on a throwaway local
Postgres 16 with faithful stubs; pure logic via `npm test`. Migrations are handed
over for the operator to apply in the Supabase SQL editor (no DDL access here).

**Personas:** Alpha = admin of *Test Company Alpha*; Beta = admin of *Test
Company Beta* — two genuinely isolated single-member tenants.

---

## Findings — master list

| ID | Sev | Area | Issue | Status |
|----|-----|------|-------|--------|
| S1 | 🔴 | RPC | `begin_load` / `claim_combo` / `slip_seat_combo` / `couple_combo` (5+6-arg) / `create_combo` / `decouple_combo` (both) bypassed RLS with no company-ownership check — proven: Company A claimed/loaded against Company B equipment | **Fixed + applied + live-verified** |
| R1 | 🔴 | RLS | `load_lines` globally readable — any company read every other company's compartment-level load detail (463 loads vs its own 283) | **Fixed; needs apply** |
| R5 | 🔴 | API | `/api/admin/setup` — any company admin read/wrote ANY company's users incl. terminal **card numbers/PINs** (proven live B→A) | **Fixed (code); needs deploy** |
| R2 | 🟠 | RLS | `dispatcher_notes` / `driver_schedules` NULL-company rows global (insertable by anyone, readable cross-tenant) | **Fixed; needs apply** |
| R3 | 🟠 | RPC | `get_display_names_full` returns any user's profile PII (name, hire date, employee #, division) cross-company, bypassing `profiles` RLS | **Awaiting function def to fix** |
| R4 | 🟠 | RLS | A user can DELETE their own `user_companies` membership → self-lockout / orphaned company (no client re-add) | **Documented; fix recommended** |
| A1 | 🟠 | Authz | Company admin can set their own `user_companies.role` to an arbitrary string, self-locking out of admin | **Fixed (role guard trigger); applied** |
| F1 | 🟠 | Load flow | A completed load could be deleted by "Back to Planner" after a lost completion response | **Fixed + deployed logic + live-verified guard** |
| F3 | 🟢 | Load flow | Abandoned "planned" rows showed as blank entries in My Loads | **Fixed (history filter)** |
| F2/F4/F5/F6 | 🟢 | Load flow | two-tab combo wipe, double-tap race, duplicate-completion temp-bias double count, no resume-on-refresh | Documented, accepted for pre-launch |

**Sound / no defect (verified):** company + user table isolation across 35+
tables; `set_active_company` rejects non-members; all cross-user
`user_companies`/`user_settings` writes denied; `complete_load`/`delete_load`/
`record_load_utilization`/`get_carded`/`demo_commandeer` owner-scoped; global
reference tables correctly shared; service worker never caches user data;
**planner weight math is conservative and cannot be driven overweight** (2000-case
invariant sweep, 15 tests).

---

## What's already applied to production (confirmed live)
- **S1** — all 4 RPC-authorization + couple_combo-fixup migrations applied; full
  cross-company attack matrix re-run live → **every attack DENIED**, happy path OK.
- **A1** — role-value guard trigger applied; demo Alpha role restored.

## What the operator still needs to do
1. **Run `docs/apply-when-home.sql`** (also pasted in chat) — applies **R1**
   (load_lines), **R2** (dispatcher_notes/schedules), and restores the demo Alpha
   membership deleted during **R4** testing.
2. **Paste** `select pg_get_functiondef('public.get_display_names_full(uuid[])'::regprocedure);`
   back so **R3** can be hardened precisely (heavily-used function; fix must match
   its exact return shape).
3. **Deploy the branch** — **R5** (`/api/admin/setup` target-company scoping) and
   **F1/F3** are app code that take effect on deploy.
4. **Decide on R4** — recommended: a policy/trigger forbidding removal of the last
   owner/admin of a company (or drop the self-delete grant if "leave company"
   isn't a feature).

---

## Audit coverage vs. the plan

| # | Area | Status |
|---|------|--------|
| 1 | Every SECURITY DEFINER RPC | ✅ complete (migration-defined + live-only, incl. the invite system) |
| 2 | All RLS policies | ✅ complete (35+ tables live-tested; 2 leaks fixed) |
| 3 | `set_active_company` | ✅ verified safe (rejects non-members) |
| 4 | `user_companies` / `user_settings` | ✅ verified (cross-user writes denied; A1 + R4 found) |
| 5 | API routes / server actions | ✅ complete (7 routes; R5 found+fixed) |
| 6 | Planner math / data integrity | ✅ complete — no safety defects, invariant proven |
| 7 | Mobile / PWA / offline | ◑ code-level done (SW/session sound); device-behavioral tests remain |
| 8 | Authentication / invites | ◑ invite route fixed; auth architecture documented; magic-link template change still pending (see Pre-launch cleanup in CLAUDE.md) |
| 9 | Driver UX / accessibility / error states | ☐ needs a real device/browser session |
| 10 | This report | ✅ |

## Remaining (needs a real device / browser session)
- Installed-PWA session persistence, rotate, multi-tab, expired-session flows.
- Full load-lifecycle click-through (double-tap, refresh-mid-load, kill-PWA).
- Driver-role empirical checks (both demo accounts are admins — role gating is
  verified architecturally, not with a live driver login).
- Accessibility: contrast, focus order, screen-reader labels, touch-target sizes
  (per direction, targets must not shrink).
- The email/magic-link template change (Supabase dashboard) from CLAUDE.md's
  pre-launch cleanup.

## Detailed evidence
Per-area detail and raw test output: `docs/security-remediation-2026-09-06.md`,
`docs/load-lifecycle-audit-2026-09-06.md`, `docs/planner-math-audit-2026-09-07.md`.
Apply files: `docs/apply-when-home.sql` (outstanding), `docs/apply-rls-batch2.sql`,
`docs/apply-restore-alpha-membership.sql`. Reusable live pentest:
`docs/security-pentest-live.sh`.
