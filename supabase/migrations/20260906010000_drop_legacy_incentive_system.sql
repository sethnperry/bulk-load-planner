-- Legacy incentive system teardown ("Recovered Gallons"), superseded by the
-- payload-utilization engine. See docs/incentive-redesign-plan.md section 1.
--
-- APPROVED TO RUN 2026-09-06. Every app-code consumer was removed the same
-- day -- no screen reads load_points or product_benchmarks, and nothing calls
-- calculate_load_points anymore -- and the operator confirmed the historical
-- incentive numbers carry no audit value ("There's no audit value. all good
-- to go."), so the data loss here is intentional and accepted.
--
-- This IS destructive and irreversible: it permanently deletes the recovered
-- gallons/points history and the per-product benchmarks.
--
-- Run docs/legacy-incentive-drop-checklist.sql PART 1 first. If its SUMMARY
-- row does not read "SAFE TO DROP", stop -- something outside the drop set
-- points into these tables and `cascade` would remove it silently. Run PART 2
-- afterwards; every row must read PASS.
--
-- Verified end to end against a throwaway PostgreSQL 16 before being handed
-- over, including a re-run to confirm it is idempotent.
--
-- Order matters: dependents before the tables they hang off.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Functions. Dropped by NAME across every overload rather than by
--    signature: several of these were recreated with changed parameter
--    lists over their life (_calculate_load_points_core gained p_load_date
--    in 20260819000000), and this repo's migrations folder is documented as
--    lagging the live database -- so a hardcoded signature here is exactly
--    the kind of thing that silently drops nothing.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'calculate_load_points',
        '_calculate_load_points_core',
        'recalculate_load_points',
        'backfill_incentive_points',
        -- Admin per-compartment edit + its points recalculation. Dropped
        -- because it CALLS recalculate_load_points: left behind it would be
        -- a function that raises the moment anyone calls it. Its audit log
        -- (load_edit_history) is deliberately NOT dropped -- that is real
        -- history, not machinery.
        'edit_load_line',
        -- AFTER UPDATE trigger fn on load_points: flagged an exported
        -- payroll_reports row stale when an edit changed points after the
        -- fact. Nothing can change points anymore.
        'flag_stale_payroll_reports'
      )
  loop
    execute format('drop function if exists %s cascade', fn.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Tables. load_points first: product_benchmarks is what fed it.
-- ─────────────────────────────────────────────────────────────────────────
drop table if exists public.load_points cascade;
drop table if exists public.product_benchmarks cascade;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. incentive_settings survives -- it is now the utilization system's own
--    config row. Only the benchmark-era weight cap goes; the driver's
--    ceiling is the per-combo target_weight, with target_gross_lbs /
--    legal_gross_lbs as the company-level fallbacks (added in Phase 1).
--
--    `enabled` is deliberately kept even though measurement must never read
--    it (spec sections 9/21, TEST K): a future incentive/payout layer is a
--    legitimate consumer, and dropping a boolean buys nothing.
--
--    pay_period_type / pay_period_anchor_date are load-bearing -- the Period
--    Report and the driver's own utilization window both read them, and
--    Period Report now owns their editing UI.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.incentive_settings drop column if exists weight_cap_lbs;

-- payroll_reports is NOT dropped: Period Report still writes a row per CSV
-- export. Its is_stale column is now inert (nothing flips it) but harmless.
