-- Fleet-wide underloading dashboard (Fleet Tier Build Spec) needs
-- lead/dispatch to read company-wide load_points, not just admin --
-- confirmed via migration read that load_points_admin_read (from
-- 20260802000000_incentive_system.sql) is admin-only, no lead/dispatch
-- carve-out. Purely additive: the existing load_points_own_read (driver's
-- own rows) and load_points_admin_read policies are untouched, this just
-- OR's in a third permissive SELECT policy using the same
-- is_company_staff(p_company_id) helper already established for this
-- exact admin+lead+dispatch shape (2026-08-05 roster-visibility fix,
-- 2026-08-06 fleet-terminal-card/credential visibility).

create policy load_points_staff_read on public.load_points
  for select using (is_company_staff(company_id));
