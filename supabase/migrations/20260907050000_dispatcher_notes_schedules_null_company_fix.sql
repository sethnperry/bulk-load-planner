-- ============================================================================
-- P0/P1 RLS FIX: NULL-company carve-out on dispatcher_notes / driver_schedules
-- ============================================================================
-- Both tables' staff policy was:
--     using / with check (company_id is null or is_company_staff(company_id))
-- The `company_id is null or` branch means a row with company_id = NULL is
-- readable AND writable by ANY authenticated user of ANY company. Proven live
-- 2026-09-06: Company A's admin inserted a dispatcher_notes row with
-- company_id = NULL and Company B (a different company) read it back. Any
-- authenticated user can therefore plant globally-visible/writable rows, and
-- any accidental NULL-company write silently becomes cross-tenant.
--
-- The app always sets company_id on both upserts (app/planner/dispatch/page.tsx),
-- and both tables are empty live, so this fix breaks nothing:
--   * policies tightened to strict is_company_staff(company_id) -- a NULL
--     company_id now fails is_company_staff() and the row is denied (a NULL
--     insert is rejected by WITH CHECK, exactly the desired behavior);
--   * company_id set NOT NULL as a schema-level guarantee (safe: 0 rows).
-- driver_schedules_self_read (a driver reading their OWN schedule) is untouched.
-- Idempotent.
-- ============================================================================

-- Tighten the staff policies (drop the NULL-company branch).
drop policy if exists driver_schedules_staff_all on public.driver_schedules;
create policy driver_schedules_staff_all on public.driver_schedules
  for all to authenticated
  using (is_company_staff(company_id))
  with check (is_company_staff(company_id));

drop policy if exists dispatcher_notes_staff_all on public.dispatcher_notes;
create policy dispatcher_notes_staff_all on public.dispatcher_notes
  for all to authenticated
  using (is_company_staff(company_id))
  with check (is_company_staff(company_id));

-- Schema-level guarantee: these rows must belong to a company. Both tables are
-- empty live, so SET NOT NULL applies cleanly; if a NULL row somehow exists the
-- statement fails safely (nothing is silently changed) and can be re-run after
-- cleanup.
alter table public.driver_schedules alter column company_id set not null;
alter table public.dispatcher_notes  alter column company_id set not null;
