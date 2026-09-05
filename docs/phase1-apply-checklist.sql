-- Payload Utilization — Phase 1 apply checklist
-- Paste into the Supabase SQL editor. Two blocks: run PART 1 before applying
-- the migrations, PART 2 after. Both are read-only and safe to re-run.
--
-- PART 1 exists because of this repo's own rule: the migrations folder lags
-- the live database, so the columns a migration references get spot-checked
-- against information_schema before it runs — not assumed.

-- ════════════════════════════════════════════════════════════════════
-- PART 1 — PRE-FLIGHT. Run this FIRST. Every row must say OK.
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
  -- Out of Allocation auto-link reads these:
  ('terminal_outage_reports','report_type'), ('terminal_outage_reports','reporter_user_id'),
  ('terminal_outage_reports','terminal_id'), ('terminal_outage_reports','product_id'),
  ('terminal_outage_reports','created_at')
)
select
  r.tbl || '.' || r.col as checking,
  case when c.column_name is null then '>>> MISSING — STOP' else 'OK' end as status
from required_columns r
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col
order by status desc, checking;

-- Helper functions the new RLS policies call. Written as a LEFT JOIN off a
-- values list, not a filtered scan of pg_proc: a plain `where proname in (...)`
-- returns NO ROW for a missing function, so absence would read as silence
-- rather than a failure. (Caught by deliberately dropping one and finding this
-- check said nothing.)
with required_functions(fn) as (values ('get_active_company_id'), ('is_company_staff'))
select r.fn as checking,
       case when p.proname is null then '>>> MISSING — STOP' else 'OK' end as status
  from required_functions r
  left join pg_proc p on p.proname = r.fn
   and p.pronamespace = (select oid from pg_namespace where nspname = 'public')
 order by status desc, checking;

-- Should return ZERO rows. Anything here means a name already exists and the
-- migration would collide rather than create cleanly.
select 'ALREADY EXISTS: ' || table_name as warning
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('load_capacity_snapshot','load_constraints','load_utilization');

-- ════════════════════════════════════════════════════════════════════
-- Now apply, in this order:
--   1. supabase/migrations/20260905000000_payload_utilization_phase1.sql
--   2. supabase/migrations/20260905010000_record_load_utilization.sql
-- The second depends on the first (it writes the tables the first creates).
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- PART 2 — POST-APPLY. Run after both migrations. Every row must say OK.
-- ════════════════════════════════════════════════════════════════════
with expected(kind, name) as (values
  ('table','load_capacity_snapshot'), ('table','load_constraints'), ('table','load_utilization')
)
select e.name as checking,
       case when t.table_name is null then '>>> MISSING' else 'OK' end as created,
       case when c.relrowsecurity then 'OK' else '>>> RLS OFF' end as rls
  from expected e
  left join information_schema.tables t
    on t.table_schema = 'public' and t.table_name = e.name
  left join pg_class c on c.relname = e.name
  left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 order by e.name;

-- The company target/legal columns the driver's denominator comes from.
select 'incentive_settings.' || c.column_name as checking, 'OK' as status, c.column_default
  from information_schema.columns c
 where c.table_schema = 'public' and c.table_name = 'incentive_settings'
   and c.column_name in ('target_gross_lbs','legal_gross_lbs');

-- The write path.
select 'record_load_utilization()' as checking,
       case when count(*) = 1 then 'OK' else '>>> MISSING' end as status
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'record_load_utilization';

-- Policies. Expect: load_utilization 3, load_capacity_snapshot 2,
-- load_constraints 2.
select tablename as checking, count(*) as policies
  from pg_policies
 where schemaname = 'public'
   and tablename in ('load_utilization','load_capacity_snapshot','load_constraints')
 group by tablename order by tablename;
