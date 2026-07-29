-- Fleet Tier Section 2: Incentive system ("Recovered Gallons"). See
-- CLAUDE.md "Incentive system" for the full product spec this implements.
--
-- Scope of THIS migration: core data model + server-side calc engine only.
-- The payroll report (pay-period table, CSV export, edit-and-recalculate
-- with stale-report flagging, edit history) is a separate, larger UI
-- deliverable deferred to a follow-up pass -- see CLAUDE.md. This migration
-- still includes the pay-period *settings* columns on incentive_settings
-- (period type + anchor date) since they're config, not report logic, and
-- adding them now avoids a second migration touching the same table later.
--
-- NOT applied automatically -- no live DB write access this session. Run
-- manually in the Supabase SQL editor.

-- ── incentive_settings ────────────────────────────────────────────────────
-- One row per company. Off by default -- admin opts in explicitly.
create table public.incentive_settings (
  company_id uuid primary key references public.companies(company_id) on delete cascade,
  enabled boolean not null default false,
  weight_cap_lbs numeric not null default 80000,
  pay_period_type text not null default 'biweekly'
    check (pay_period_type in ('weekly','biweekly','semi_monthly','monthly')),
  pay_period_anchor_date date,
  updated_at timestamptz not null default now()
);

alter table public.incentive_settings enable row level security;

-- Any company member can read (drivers need to know if it's enabled so the
-- "you earned X points" confirmation knows whether to show at all).
create policy incentive_settings_company_read on public.incentive_settings
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = incentive_settings.company_id
    )
  );

-- Only admin can configure (matches CLAUDE.md permission matrix: "Incentive
-- benchmark settings" is admin-only, not even lead/dispatch).
create policy incentive_settings_admin_write on public.incentive_settings
  for all using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = incentive_settings.company_id
        and uc.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = incentive_settings.company_id
        and uc.role = 'admin'
    )
  );

-- ── product_benchmarks ────────────────────────────────────────────────────
-- Company-wide benchmark gallons per product (not per equipment class).
--
-- reference_density is a snapshot (lbs/gal at 60F, computed from
-- products.api_60 + products.alpha_per_f via the same lbsPerGallonAtTemp
-- formula already used for planning -- see lib app/calculator/utils/planMath.ts)
-- taken at benchmark-set time. It is INFORMATIONAL ONLY -- shown to the admin
-- for context (e.g. "~X lbs") when they set a gallons figure. The live point
-- calc (calculate_load_points below) always uses *today's* actual load
-- density per the finalized spec, never this snapshot. This resolves the
-- CLAUDE.md open question about a company-specific density override path:
-- since the static reference is never used in the math, there's nothing to
-- override.
create table public.product_benchmarks (
  company_id uuid not null references public.companies(company_id) on delete cascade,
  product_id uuid not null references public.products(product_id) on delete cascade,
  benchmark_gallons numeric not null check (benchmark_gallons >= 0),
  reference_density numeric,
  updated_at timestamptz not null default now(),
  primary key (company_id, product_id)
);

alter table public.product_benchmarks enable row level security;

create policy product_benchmarks_company_read on public.product_benchmarks
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = product_benchmarks.company_id
    )
  );

create policy product_benchmarks_admin_write on public.product_benchmarks
  for all using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = product_benchmarks.company_id
        and uc.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = product_benchmarks.company_id
        and uc.role = 'admin'
    )
  );

-- ── load_points ───────────────────────────────────────────────────────────
-- One row per (load, compartment) that had a configured benchmark at calc
-- time. Written ONLY by calculate_load_points() below (SECURITY DEFINER) --
-- no direct client insert/update, same pattern as user_companies. Recalc
-- (deferred payroll pass) will UPDATE these rows in place and log the
-- change elsewhere rather than re-insert.
create table public.load_points (
  load_id uuid not null references public.load_log(load_id) on delete cascade,
  comp_number int not null,
  driver_id uuid not null,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  product_id uuid not null references public.products(product_id),
  benchmark_gallons_used numeric not null,
  actual_gallons numeric not null,
  density_at_load numeric not null,
  recovered_gallons numeric not null,
  -- v1: 1:1 with recovered_gallons. Stored as its own column (per spec) so a
  -- future non-1:1 multiplier doesn't require a schema change.
  recovered_points numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (load_id, comp_number)
);

alter table public.load_points enable row level security;

create policy load_points_own_read on public.load_points
  for select using (driver_id = auth.uid());

create policy load_points_admin_read on public.load_points
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = load_points.company_id
        and uc.role = 'admin'
    )
  );

create policy load_points_no_direct_write on public.load_points
  for all using (false) with check (false);

-- ── calculate_load_points ─────────────────────────────────────────────────
-- Called client-side right after complete_load succeeds (fire-and-forget,
-- non-fatal on failure -- same pattern as update_terminal_temp_bias in
-- useLoadWorkflow.ts). Idempotent (safe to call more than once for the same
-- load -- upserts on (load_id, comp_number)).
--
-- Implements the finalized split-load formula from CLAUDE.md verbatim; a
-- single-compartment load is just the n=1 case of the same math, so there's
-- no separate "single-product" code path.
create or replace function public.calculate_load_points(p_load_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id           uuid;
  v_tare_lbs          numeric;
  v_company_id        uuid;
  v_enabled           boolean;
  v_weight_cap_lbs    numeric;
  v_total_gallons     numeric;
  v_total_actual_lbs  numeric;
  v_effective_lbs     numeric;
  v_total_recovered   numeric;
begin
  select user_id, coalesce(tare_lbs, 0)
    into v_user_id, v_tare_lbs
    from load_log
   where load_id = p_load_id;

  if not found then
    raise exception 'load_not_found: %', p_load_id;
  end if;

  if v_user_id != auth.uid() then
    raise exception 'unauthorized: load does not belong to current user';
  end if;

  v_company_id := get_active_company_id();

  select enabled, weight_cap_lbs
    into v_enabled, v_weight_cap_lbs
    from incentive_settings
   where company_id = v_company_id;

  if not found or not v_enabled then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  select coalesce(sum(actual_gallons), 0), coalesce(sum(actual_lbs), 0)
    into v_total_gallons, v_total_actual_lbs
    from load_lines
   where load_id = p_load_id
     and actual_gallons is not null and actual_gallons > 0
     and actual_lbs is not null;

  if v_total_gallons <= 0 then
    return jsonb_build_object('ok', true, 'enabled', true, 'recovered_gallons', 0);
  end if;

  -- Cap: stop accruing beyond weight_cap_lbs GVW. Clamp the payload weight
  -- used in the proration, not the raw actual (never mutates load_lines).
  v_effective_lbs := least(v_total_actual_lbs, greatest(v_weight_cap_lbs - v_tare_lbs, 0));

  with lines as (
    select
      ll.comp_number,
      ll.product_id,
      ll.actual_gallons,
      ll.actual_lbs,
      (ll.actual_lbs / ll.actual_gallons) as lbs_per_gal_today,
      (ll.actual_gallons / v_total_gallons) as pct_of_load
    from load_lines ll
    where ll.load_id = p_load_id
      and ll.actual_gallons is not null and ll.actual_gallons > 0
      and ll.actual_lbs is not null
  ),
  scored as (
    select
      l.comp_number,
      l.product_id,
      l.actual_gallons,
      l.lbs_per_gal_today,
      pb.benchmark_gallons,
      greatest(
        0,
        (l.pct_of_load * v_effective_lbs)
          - (l.pct_of_load * pb.benchmark_gallons * l.lbs_per_gal_today)
      ) / l.lbs_per_gal_today as recovered_gallons
    from lines l
    join product_benchmarks pb
      on pb.company_id = v_company_id and pb.product_id = l.product_id
  )
  insert into load_points (
    load_id, comp_number, driver_id, company_id, product_id,
    benchmark_gallons_used, actual_gallons, density_at_load,
    recovered_gallons, recovered_points, updated_at
  )
  select
    p_load_id, s.comp_number, v_user_id, v_company_id, s.product_id,
    s.benchmark_gallons, s.actual_gallons, s.lbs_per_gal_today,
    s.recovered_gallons, s.recovered_gallons, now()
  from scored s
  on conflict (load_id, comp_number) do update set
    driver_id              = excluded.driver_id,
    company_id              = excluded.company_id,
    product_id              = excluded.product_id,
    benchmark_gallons_used  = excluded.benchmark_gallons_used,
    actual_gallons          = excluded.actual_gallons,
    density_at_load         = excluded.density_at_load,
    recovered_gallons       = excluded.recovered_gallons,
    recovered_points        = excluded.recovered_points,
    updated_at              = now();

  select coalesce(sum(recovered_gallons), 0) into v_total_recovered
    from load_points where load_id = p_load_id;

  return jsonb_build_object('ok', true, 'enabled', true, 'recovered_gallons', v_total_recovered);
end;
$function$;
