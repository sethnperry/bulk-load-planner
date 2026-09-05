-- Payload Utilization -- Phase 1 (measurement engine).
-- See docs/incentive-redesign-plan.md for the full design this implements.
--
-- PURELY ADDITIVE. Nothing is dropped here. The legacy incentive system
-- (product_benchmarks, load_points, calculate_load_points and friends) is
-- untouched and keeps working -- its removal is a separate migration that runs
-- only once this engine has been validated, so a rollback during Phase 1 never
-- leaves the app with no incentive system at all.
--
-- APPLIED 2026-09-05 via the Supabase SQL editor. The pre-flight in
-- docs/phase1-apply-checklist.sql ran first and returned ALL 40 CHECKS PASSED,
-- confirming every referenced column and helper function existed live and none
-- of the three new table names collided -- this repo's own "Architecture
-- reality" rule, since the migrations folder is known to lag the live database.
-- PART 2 after applying returned ALL 9 CHECKS PASSED.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Company target gross weight (the driver's 100% mark)
-- ─────────────────────────────────────────────────────────────────────────
-- The target is now the denominator of every utilization number, so it can no
-- longer live only as a per-combo field that any driver can edit through an
-- ungated modal (ScaleTicketModal, confirmed to have no role check at all).
-- This is the company number; equipment_combos.target_weight stays as a
-- staff-gated per-combo override for equipment that genuinely can't hit it.
--
-- Fleet tier only in effect, with no branch needed: a solo company's sole
-- member is always role='admin' by the existing solo-provisioning design, so
-- the same admin check lets a solo driver set their own target.
--
-- Deliberately on incentive_settings rather than companies: it is a
-- measurement setting, it sits beside the period config the reports already
-- read, and incentive_settings survives the legacy teardown (see the plan's
-- section 2) while product_benchmarks and load_points do not.
alter table public.incentive_settings
  add column if not exists target_gross_lbs numeric not null default 79500,
  add column if not exists legal_gross_lbs  numeric not null default 80000;

comment on column public.incentive_settings.target_gross_lbs is
  'Company target gross weight -- the 100% mark for driver payload utilization. Staff-gated.';
comment on column public.incentive_settings.legal_gross_lbs is
  'Legal gross ceiling for this company. Stored per company rather than hardcoded so per-state and permitted limits above 80,000 are a data change later, not a math change.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. load_capacity_snapshot -- immutable inputs + outputs, one row per load
-- ─────────────────────────────────────────────────────────────────────────
-- Everything needed to recompute a load's capacity WITHOUT reading a mutable
-- table. trailer_compartments.cap_gallons, products.api_60/alpha_per_f and
-- equipment_combos.tare_lbs can all legitimately change after a load; reading
-- them live months later would silently rewrite history (spec section 23).
--
-- calc_version is the stability guarantee: a stored row keeps the version that
-- produced it and is never recomputed in place. A change to the engine bumps
-- the constant, which affects new loads only.
create table if not exists public.load_capacity_snapshot (
  load_id            uuid primary key references public.load_log(load_id) on delete cascade,
  calc_version       int         not null,

  -- Weight inputs, as they were at load time.
  tare_lbs           numeric     not null,
  target_gross_lbs   numeric     not null,
  legal_gross_lbs    numeric     not null,
  cg_bias            numeric     not null default 0,

  -- Per-compartment inputs. One object per compartment: comp_number, position,
  -- cap_gallons (as CONFIGURED -- never the driver's capOverride),
  -- cap_override_gallons (recorded for explanation only, never used in the
  -- math), product_id, api_60, alpha_per_f, observed_api, observed_api_temp_f,
  -- temp_f. Density is re-derived from these rather than stored precomputed,
  -- so a snapshot shows WHY capacity was what it was.
  compartments       jsonb       not null,

  -- Computed outputs.
  available_gallons        numeric not null,  -- within the company target
  available_payload_lbs    numeric not null,
  capacity_at_legal_gallons numeric not null, -- fleet headroom only
  total_volume_gallons     numeric not null,
  limiting_factor          text    not null
    check (limiting_factor in ('volume','company_target','legal_weight','none')),

  created_at         timestamptz not null default now()
);

alter table public.load_capacity_snapshot enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. load_constraints -- external limits (spec section 11)
-- ─────────────────────────────────────────────────────────────────────────
-- constrained_gallons is nullable on purpose. An Out of Allocation outage
-- report proves a terminal capped a driver but carries no gallon figure, and
-- that is still worth recording: a quantified cap re-baselines the driver's
-- denominator, while an unquantified one excludes the load rather than
-- measuring it against capacity it was never allowed to use.
create table if not exists public.load_constraints (
  constraint_id      uuid primary key default gen_random_uuid(),
  load_id            uuid not null references public.load_log(load_id) on delete cascade,
  constraint_type    text not null
    check (constraint_type in ('dispatch_cap','customer_cap','terminal_cap','product_unavailable','equipment','other')),
  constrained_gallons numeric,
  source             text not null default 'DRIVER'
    check (source in ('CALCULATED','PLANNER','DRIVER','MANAGER','RACK_TICKET','TMS','DISPATCH','API','OCR','IMPORT')),
  notes              text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

create index if not exists load_constraints_load_idx on public.load_constraints (load_id);

alter table public.load_constraints enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. load_utilization -- the read model
-- ─────────────────────────────────────────────────────────────────────────
-- utilization_pct is nullable: an excluded load has no score, and a null is
-- honest where a 0 would read as "this driver loaded nothing."
--
-- actual_gallons_source exists from day one even though Phase 1 always writes
-- PLANNER. Moving a company to genuinely measured gallons later is then a
-- source swap rather than a migration, and history stays interpretable across
-- the cutover instead of silently mixing two meanings under one label.
create table if not exists public.load_utilization (
  load_id            uuid primary key references public.load_log(load_id) on delete cascade,
  driver_id          uuid not null,
  company_id         uuid not null references public.companies(company_id) on delete cascade,
  loaded_at          timestamptz,

  available_gallons           numeric not null,
  effective_available_gallons numeric not null,
  actual_gallons              numeric not null,
  unused_gallons              numeric not null,
  utilization_pct             numeric,

  eligibility        text not null
    check (eligibility in ('eligible','excluded_constraint','excluded_safety','excluded_incomplete_data')),
  exception_reason   text,

  actual_gallons_source text not null default 'PLANNER'
    check (actual_gallons_source in ('CALCULATED','PLANNER','DRIVER','MANAGER','RACK_TICKET','TMS','DISPATCH','API','OCR','IMPORT')),

  calc_version       int not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists load_utilization_company_loaded_idx
  on public.load_utilization (company_id, loaded_at desc);
create index if not exists load_utilization_driver_loaded_idx
  on public.load_utilization (driver_id, loaded_at desc);

alter table public.load_utilization enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────
-- Mirrors load_points' established shape exactly: own-row read for the driver,
-- company-wide read for staff via is_company_staff() (the admin+lead+dispatch
-- helper already used by load_points_staff_read and the credential/roster
-- visibility policies), and NO client write policy at all -- these tables are
-- written only by the SECURITY DEFINER function below.

create policy load_utilization_own_read on public.load_utilization
  for select using (driver_id = auth.uid());

create policy load_utilization_staff_read on public.load_utilization
  for select using (is_company_staff(company_id));

create policy load_utilization_no_direct_write on public.load_utilization
  for all using (false) with check (false);

-- The snapshot and constraint tables have no company_id of their own; both
-- scope through the load they belong to, which is how load_lines' own policies
-- already work.
create policy load_capacity_snapshot_read on public.load_capacity_snapshot
  for select using (
    exists (
      select 1 from public.load_utilization lu
      where lu.load_id = load_capacity_snapshot.load_id
        and (lu.driver_id = auth.uid() or is_company_staff(lu.company_id))
    )
  );

create policy load_capacity_snapshot_no_direct_write on public.load_capacity_snapshot
  for all using (false) with check (false);

create policy load_constraints_read on public.load_constraints
  for select using (
    exists (
      select 1 from public.load_log ll
      where ll.load_id = load_constraints.load_id
        and (ll.user_id = auth.uid() or is_company_staff(get_active_company_id()))
    )
  );

-- Constraints ARE client-writable, unlike the other two: a driver reporting
-- "the terminal capped me" is a first-class action, and it is self-attributed
-- only (you can only add a constraint to your own load, as yourself), matching
-- terminal_outage_reports' own insert policy shape.
create policy load_constraints_insert_own on public.load_constraints
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.load_log ll
      where ll.load_id = load_constraints.load_id and ll.user_id = auth.uid()
    )
  );
