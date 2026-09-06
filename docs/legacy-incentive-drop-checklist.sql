-- ═══════════════════════════════════════════════════════════════════════════
-- Legacy incentive teardown -- pre-flight and post-check.
-- Companion to supabase/migrations/20260906010000_drop_legacy_incentive_system.sql
--
-- Run PART 1 first. Read it. Then run the migration. Then run PART 2.
--
-- Each PART is ONE query on purpose: the Supabase SQL editor only renders the
-- LAST result set when several statements run together, so a checklist split
-- into separate SELECTs silently hides all but the final one -- the exact flaw
-- found in the Phase 1 checklist before it was handed over.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── PART 1 — BEFORE. What exists, what dies, and what it would take with it.
-- Safe to run in either state: every reference to a doomed table is guarded by
-- to_regclass, so this reports "already gone" rather than erroring if the
-- migration has already been applied.
with doomed as (
  select oid, relname from pg_class
  where relnamespace = 'public'::regnamespace
    and relname in ('load_points','product_benchmarks')
),
target_fns as (
  select p.oid::regprocedure::text as sig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'calculate_load_points','_calculate_load_points_core','recalculate_load_points',
    'backfill_incentive_points','edit_load_line','flag_stale_payroll_reports')
),
-- The one that would actually hurt: a foreign key pointing INTO a doomed
-- table from a table OUTSIDE the drop set. `drop table ... cascade` removes
-- those constraints silently, de-linking something nobody meant to touch.
--
-- Written as NOT IN over a SUBQUERY, never over a list of to_regclass()
-- calls: if a doomed table is already absent that list contains NULL, and
-- `x NOT IN (NULL)` evaluates to NULL rather than true -- which would return
-- zero rows and report "safe" precisely when the check matters. An empty
-- subquery makes NOT IN true, which is the behaviour wanted here.
inbound_fks as (
  select c.conrelid::regclass::text as referencing_table, c.conname
  from pg_constraint c
  where c.contype = 'f'
    and c.confrelid in (select oid from doomed)
    and c.conrelid not in (select oid from doomed)
),
dependent_views as (
  select distinct v.viewname
  from pg_views v
  where v.schemaname = 'public'
    and (v.definition ilike '%load_points%' or v.definition ilike '%product_benchmarks%')
),
-- Exact row counts without naming the tables statically -- a bare
-- `select count(*) from public.load_points` is a PARSE error when the table
-- is gone, which no coalesce can rescue. CASE is lazily evaluated, so the
-- query_to_xml branch never runs for an absent table.
counts as (
  select
    case when to_regclass('public.load_points') is null then 'already gone'
         else (xpath('/row/c/text()', query_to_xml(
                'select count(*) as c from public.load_points', false, true, '')))[1]::text
    end as load_points_rows,
    case when to_regclass('public.product_benchmarks') is null then 'already gone'
         else (xpath('/row/c/text()', query_to_xml(
                'select count(*) as c from public.product_benchmarks', false, true, '')))[1]::text
    end as benchmark_rows
)
select * from (
  select 0 as ord, 'SUMMARY' as item,
         (select count(*)::text from target_fns) || ' fns, ' ||
         (select count(*)::text from inbound_fks) || ' inbound FKs, ' ||
         (select count(*)::text from dependent_views) || ' dependent views' as detail,
         case when (select count(*) from inbound_fks) = 0
               and (select count(*) from dependent_views) = 0
              then 'SAFE TO DROP'
              else '*** STOP - read the CASCADE RISK rows below ***' end as status
  union all
  select 1, 'rows destroyed: load_points', (select load_points_rows from counts), 'destroyed'
  union all
  select 2, 'rows destroyed: product_benchmarks', (select benchmark_rows from counts), 'destroyed'
  union all
  select 3, 'function', sig, 'dropped' from target_fns
  union all
  select 4, 'CASCADE RISK: inbound FK', referencing_table || ' (' || conname || ')',
         '*** would be silently dropped ***' from inbound_fks
  union all
  select 5, 'CASCADE RISK: dependent view', viewname,
         '*** would be silently dropped ***' from dependent_views
  union all
  select 6, 'column: incentive_settings.weight_cap_lbs',
         coalesce((select data_type from information_schema.columns
                   where table_schema='public' and table_name='incentive_settings'
                     and column_name='weight_cap_lbs'), 'already gone'), 'dropped'
  union all
  -- Explicitly NOT in the drop set. Listed so survival is visible, not assumed.
  select 7, 'KEPT: ' || t,
         case when to_regclass('public.' || t) is null then '*** MISSING ***' else 'present' end,
         'must survive'
  from unnest(array['payroll_reports','load_edit_history','incentive_settings',
                    'load_utilization','load_capacity_snapshot','load_constraints']) as t
) x order by ord, item;


-- ─── PART 2 — AFTER. Everything below must read PASS.
select * from (
  select 0 as ord, 'SUMMARY' as check_name,
         case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname in (
                      'calculate_load_points','_calculate_load_points_core',
                      'recalculate_load_points','backfill_incentive_points',
                      'edit_load_line','flag_stale_payroll_reports')) = 0
               and to_regclass('public.load_points') is null
               and to_regclass('public.product_benchmarks') is null
               and not exists (select 1 from information_schema.columns
                               where table_schema='public' and table_name='incentive_settings'
                                 and column_name='weight_cap_lbs')
               and to_regclass('public.load_utilization') is not null
               and to_regclass('public.payroll_reports') is not null
               and to_regclass('public.load_edit_history') is not null
               and exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='incentive_settings'
                             and column_name='pay_period_type')
              then 'ALL CHECKS PASSED' else '*** SOMETHING IS OFF — see rows ***' end as result
  union all
  select 1, 'legacy functions gone',
         case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname in (
                      'calculate_load_points','_calculate_load_points_core',
                      'recalculate_load_points','backfill_incentive_points',
                      'edit_load_line','flag_stale_payroll_reports')) = 0
              then 'PASS' else 'FAIL — still present' end
  union all
  select 2, 'load_points gone',
         case when to_regclass('public.load_points') is null then 'PASS' else 'FAIL' end
  union all
  select 3, 'product_benchmarks gone',
         case when to_regclass('public.product_benchmarks') is null then 'PASS' else 'FAIL' end
  union all
  select 4, 'weight_cap_lbs gone',
         case when not exists (select 1 from information_schema.columns
                               where table_schema='public' and table_name='incentive_settings'
                                 and column_name='weight_cap_lbs') then 'PASS' else 'FAIL' end
  union all
  select 5, 'utilization tables intact',
         case when to_regclass('public.load_utilization') is not null
               and to_regclass('public.load_capacity_snapshot') is not null
               and to_regclass('public.load_constraints') is not null
              then 'PASS' else 'FAIL — cascade took too much' end
  union all
  select 6, 'payroll_reports intact (CSV export marker)',
         case when to_regclass('public.payroll_reports') is not null then 'PASS' else 'FAIL' end
  union all
  select 7, 'load_edit_history intact (audit log)',
         case when to_regclass('public.load_edit_history') is not null then 'PASS' else 'FAIL' end
  union all
  select 8, 'period settings intact (Period Report + driver window read these)',
         case when exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='incentive_settings'
                             and column_name='pay_period_type')
               and exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='incentive_settings'
                             and column_name='pay_period_anchor_date')
              then 'PASS' else 'FAIL' end
) y order by ord;
