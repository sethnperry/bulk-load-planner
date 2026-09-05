-- Payload Utilization — Phase 1 apply checklist
-- Paste into the Supabase SQL editor. Two blocks: run PART 1 before applying
-- the migrations, PART 2 after. Both are read-only and safe to re-run.
--
-- PART 1 exists because of this repo's own rule: the migrations folder lags
-- the live database, so the columns a migration references get spot-checked
-- against information_schema before it runs — not assumed.
--
-- Each PART is ONE query returning ONE result set, deliberately. The Supabase
-- SQL editor only displays the LAST result set when you run several statements
-- at once, so an earlier version of this file (three separate selects per part)
-- would have silently hidden two of its three checks. A summary row sorts to
-- the top so a pass/fail is readable without scanning every row.
--
-- Both parts were verified against a real PostgreSQL 16: PART 1 on an empty
-- database (correctly reported 37 problems) and on a complete stub schema
-- (40 passed), then both migrations applied and PART 2 run (9 passed).

-- ════════════════════════════════════════════════════════════════════
-- PART 1 — PRE-FLIGHT. Run this FIRST. Must say ALL CHECKS PASSED.
-- ════════════════════════════════════════════════════════════════════
with required_columns(tbl, col) as (values
  ('load_log','load_id'), ('load_log','user_id'), ('load_log','combo_id'),
  ('load_log','terminal_id'), ('load_log','tare_lbs'), ('load_log','cg_bias'),
  ('load_log','loaded_at'), ('load_log','completed_at'),
  ('load_lines','load_id'), ('load_lines','comp_number'), ('load_lines','product_id'),
  ('load_lines','actual_gallons'), ('load_lines','actual_lbs'),
  ('load_lines','temp_f'), ('load_lines','actual_temp_f'), ('load_lines','actual_api'),
  ('equipment_combos','combo_id'), ('equipment_combos','trailer_id'),
  ('equipment_combos','tare_lbs'), ('equipment_combos','target_weight'),
  ('trailer_compartments','trailer_id'), ('trailer_compartments','comp_number'),
  ('trailer_compartments','cap_gallons'), ('trailer_compartments','max_gallons'),
  ('trailer_compartments','position'),
  ('products','product_id'), ('products','api_60'), ('products','alpha_per_f'),
  ('companies','company_id'),
  ('incentive_settings','company_id'),
  ('terminal_outage_reports','report_type'), ('terminal_outage_reports','reporter_user_id'),
  ('terminal_outage_reports','terminal_id'), ('terminal_outage_reports','product_id'),
  ('terminal_outage_reports','created_at')
),
col_checks as (
  select r.tbl || '.' || r.col as item,
         case when c.column_name is null then 'MISSING COLUMN' else 'OK' end as status
    from required_columns r
    left join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col
),
fn_checks as (
  select 'function ' || r.fn,
         case when p.proname is null then 'MISSING FUNCTION' else 'OK' end
    from (values ('get_active_company_id'), ('is_company_staff')) r(fn)
    left join pg_proc p
      on p.proname = r.fn
     and p.pronamespace = (select oid from pg_namespace where nspname = 'public')
),
name_checks as (
  select 'new table ' || x.name,
         case when t.table_name is null then 'OK' else 'NAME ALREADY TAKEN' end
    from (values ('load_capacity_snapshot'), ('load_constraints'), ('load_utilization')) x(name)
    left join information_schema.tables t
      on t.table_schema = 'public' and t.table_name = x.name
),
all_checks as (
  select * from col_checks
  union all select * from fn_checks
  union all select * from name_checks
)
select 0 as sort,
       case when (select count(*) from all_checks where status <> 'OK') = 0
            then 'ALL ' || (select count(*)::text from all_checks) || ' CHECKS PASSED - safe to apply'
            else (select count(*)::text from all_checks where status <> 'OK') || ' PROBLEM(S) - DO NOT APPLY, see rows below'
       end as item,
       '' as status
union all
select 1, item, status from all_checks where status <> 'OK'
order by sort, item;

-- ════════════════════════════════════════════════════════════════════
-- Now apply, in this order:
--   1. supabase/migrations/20260905000000_payload_utilization_phase1.sql
--   2. supabase/migrations/20260905010000_record_load_utilization.sql
-- The second depends on the first (it writes the tables the first creates).
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- PART 2 — POST-APPLY. Run after both migrations. Must say ALL CHECKS PASSED.
-- ════════════════════════════════════════════════════════════════════
with expected_tables(name, want_policies) as (values
  ('load_capacity_snapshot', 2), ('load_constraints', 2), ('load_utilization', 3)
),
table_checks as (
  select 'table ' || e.name as item,
         case when t.table_name is null then 'MISSING TABLE'
              when not c.relrowsecurity then 'RLS IS OFF'
              else 'OK' end as status
    from expected_tables e
    left join information_schema.tables t
      on t.table_schema = 'public' and t.table_name = e.name
    left join pg_namespace n on n.nspname = 'public'
    left join pg_class c on c.relname = e.name and c.relnamespace = n.oid
),
policy_checks as (
  select 'policies on ' || e.name,
         case when coalesce(pc.n, 0) = e.want_policies then 'OK'
              else 'EXPECTED ' || e.want_policies || ', FOUND ' || coalesce(pc.n, 0) end
    from expected_tables e
    left join (
      select tablename, count(*) as n from pg_policies
       where schemaname = 'public' group by tablename
    ) pc on pc.tablename = e.name
),
column_checks as (
  select 'incentive_settings.' || x.col,
         case when c.column_name is null then 'MISSING COLUMN'
              when c.column_default is null then 'NO DEFAULT'
              else 'OK (default ' || c.column_default || ')' end
    from (values ('target_gross_lbs'), ('legal_gross_lbs')) x(col)
    left join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = 'incentive_settings'
     and c.column_name = x.col
),
function_checks as (
  select 'function record_load_utilization',
         case when count(*) = 0 then 'MISSING FUNCTION'
              when count(*) > 1 then 'DUPLICATE OVERLOADS' else 'OK' end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_load_utilization'
),
all_checks as (
  select * from table_checks
  union all select * from policy_checks
  union all select * from column_checks
  union all select * from function_checks
)
select 0 as sort,
       case when (select count(*) from all_checks where status not like 'OK%') = 0
            then 'ALL ' || (select count(*)::text from all_checks) || ' CHECKS PASSED - Phase 1 is live'
            else (select count(*)::text from all_checks where status not like 'OK%') || ' PROBLEM(S) - see rows below'
       end as item,
       '' as status
union all
select 1, item, status from all_checks
order by sort, item;
