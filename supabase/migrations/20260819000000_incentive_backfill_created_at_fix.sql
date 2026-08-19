-- Real bug: _calculate_load_points_core's INSERT into load_points never
-- included created_at in its column list at all -- it silently fell
-- through to the table's `default now()`. For a live load this happened
-- to be approximately correct (calculate_load_points fires right after
-- complete_load succeeds, so "now" IS roughly the load's own date), which
-- is exactly why this was never caught until the backfill ran calc for
-- weeks/months of historical loads all at once -- every one of them got
-- stamped with the BACKFILL'S run time, not its own real date. Every
-- period-based read in the app (the Planner's running-average card, and
-- Period Report's `.gte("created_at", ...)`/`.lte(...)` filtering AND its
-- own displayed "date" column) keys off `load_points.created_at` as the
-- load's date -- so every backfilled load silently landed in "today's"
-- period regardless of when it actually happened, breaking period
-- sorting exactly as reported.
--
-- Fix: thread the load's own real date (load_log.completed_at) through
-- into the core, and set created_at explicitly to that value on BOTH the
-- insert and the on-conflict update path -- not just insert, since this
-- migration itself needs to CORRECT the already-wrong rows the previous
-- backfill run created, and re-running the (idempotent) backfill is
-- exactly how that correction happens. This also fixes calculate_load_points's
-- day-to-day precision: recalculating a load's points later (e.g. via the
-- Period Report's edit-and-recalculate flow) will no longer risk drifting
-- created_at to the moment of the RECALC instead of the load's own date.
--
-- Only the load-date plumbing changes here -- same split-load formula,
-- same diagnostics, same 'loaded' status filter from the last two
-- migrations.

drop function if exists public._calculate_load_points_core(uuid, uuid, uuid, numeric);

create or replace function public._calculate_load_points_core(
  p_load_id uuid,
  p_user_id uuid,
  p_company_id uuid,
  p_tare_lbs numeric,
  p_load_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_weight_cap_lbs    numeric;
  v_total_gallons     numeric;
  v_total_actual_lbs  numeric;
  v_effective_lbs     numeric;
  v_total_recovered   numeric;
begin
  select weight_cap_lbs into v_weight_cap_lbs
    from incentive_settings
   where company_id = p_company_id;

  if not found then
    return jsonb_build_object('ok', true, 'recovered_gallons', 0);
  end if;

  select coalesce(sum(actual_gallons), 0), coalesce(sum(actual_lbs), 0)
    into v_total_gallons, v_total_actual_lbs
    from load_lines
   where load_id = p_load_id
     and actual_gallons is not null and actual_gallons > 0
     and actual_lbs is not null;

  if v_total_gallons <= 0 then
    return jsonb_build_object('ok', true, 'recovered_gallons', 0);
  end if;

  v_effective_lbs := least(v_total_actual_lbs, greatest(v_weight_cap_lbs - p_tare_lbs, 0));

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
      on pb.company_id = p_company_id and pb.product_id = l.product_id
  )
  insert into load_points (
    load_id, comp_number, driver_id, company_id, product_id,
    benchmark_gallons_used, actual_gallons, density_at_load,
    recovered_gallons, recovered_points, created_at, updated_at
  )
  select
    p_load_id, s.comp_number, p_user_id, p_company_id, s.product_id,
    s.benchmark_gallons, s.actual_gallons, s.lbs_per_gal_today,
    s.recovered_gallons, s.recovered_gallons, p_load_date, now()
  from scored s
  on conflict (load_id, comp_number) do update set
    driver_id               = excluded.driver_id,
    company_id               = excluded.company_id,
    product_id               = excluded.product_id,
    benchmark_gallons_used   = excluded.benchmark_gallons_used,
    actual_gallons           = excluded.actual_gallons,
    density_at_load          = excluded.density_at_load,
    recovered_gallons        = excluded.recovered_gallons,
    recovered_points         = excluded.recovered_points,
    created_at               = excluded.created_at,
    updated_at               = now();

  select coalesce(sum(recovered_gallons), 0) into v_total_recovered
    from load_points where load_id = p_load_id;

  return jsonb_build_object('ok', true, 'recovered_gallons', v_total_recovered);
end;
$function$;

revoke execute on function public._calculate_load_points_core(uuid, uuid, uuid, numeric, timestamptz)
  from public, anon, authenticated;

create or replace function public.calculate_load_points(p_load_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id      uuid;
  v_tare_lbs     numeric;
  v_completed_at timestamptz;
  v_company_id   uuid;
  v_enabled      boolean;
  v_core         jsonb;
begin
  select user_id, coalesce(tare_lbs, 0), coalesce(completed_at, now())
    into v_user_id, v_tare_lbs, v_completed_at
    from load_log
   where load_id = p_load_id;

  if not found then
    raise exception 'load_not_found: %', p_load_id;
  end if;

  if v_user_id != auth.uid() then
    raise exception 'unauthorized: load does not belong to current user';
  end if;

  v_company_id := get_active_company_id();

  select enabled into v_enabled
    from incentive_settings
   where company_id = v_company_id;

  if not found then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  v_core := _calculate_load_points_core(p_load_id, v_user_id, v_company_id, v_tare_lbs, v_completed_at);

  return jsonb_build_object(
    'ok', true, 'enabled', v_enabled,
    'recovered_gallons', coalesce(v_core->'recovered_gallons', to_jsonb(0))
  );
end;
$function$;

create or replace function public.backfill_incentive_points(
  p_company_id uuid,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_role      text;
  v_load             record;
  v_loads_processed  int := 0;
  v_total_recovered  numeric := 0;
  v_core             jsonb;
  v_member_count     int;
  v_any_status_count int;
begin
  select role into v_caller_role
    from user_companies
   where user_id = auth.uid() and company_id = p_company_id;

  if v_caller_role is distinct from 'admin' then
    raise exception 'unauthorized: admin only';
  end if;

  select count(*) into v_member_count
    from user_companies
   where company_id = p_company_id;

  select count(*) into v_any_status_count
    from load_log ll
    join user_companies uc
      on uc.user_id = ll.user_id and uc.company_id = p_company_id;

  for v_load in
    select ll.load_id, ll.user_id, coalesce(ll.tare_lbs, 0) as tare_lbs,
           coalesce(ll.completed_at, ll.created_at, now()) as load_date
      from load_log ll
      join user_companies uc
        on uc.user_id = ll.user_id and uc.company_id = p_company_id
     where ll.status = 'loaded'
       and (p_since is null or ll.completed_at >= p_since)
  loop
    v_core := _calculate_load_points_core(v_load.load_id, v_load.user_id, p_company_id, v_load.tare_lbs, v_load.load_date);
    v_loads_processed := v_loads_processed + 1;
    v_total_recovered := v_total_recovered + coalesce((v_core->>'recovered_gallons')::numeric, 0);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'loads_processed', v_loads_processed,
    'total_recovered_gallons', v_total_recovered,
    'company_members', v_member_count,
    'member_loads_any_status', v_any_status_count
  );
end;
$function$;
