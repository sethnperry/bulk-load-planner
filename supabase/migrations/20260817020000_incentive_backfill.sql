-- One-time (but safe to re-run) historical backfill for the incentive
-- system, per explicit user request following the always-calculate change
-- in 20260817010000_incentive_calc_always_runs.sql. That migration only
-- prevents FUTURE gaps (a load completed before it ships never got a
-- chance to call calculate_load_points at all, regardless of the enabled
-- toggle) -- this migration is what actually reaches back and calculates
-- load_points for loads that already happened.
--
-- calculate_load_points(p_load_id) is owner-gated (raises "unauthorized"
-- if the calling user isn't the load's own driver) -- correct for its
-- normal caller (a driver's own client, right after their own load
-- completes), but useless for an admin backfilling every driver's history
-- at once. Rather than duplicate the whole split-load formula a second
-- time (drift risk -- two copies of the same math silently diverging is
-- exactly the class of bug this project has hit before with duplicated
-- logic, see CustomSelect.tsx/ServiceTypeManager.tsx's own header
-- comments), the shared math is extracted into a private
-- _calculate_load_points_core() with NO auth checks of its own -- callers
-- are responsible for verifying authorization before calling it, exactly
-- once each, from the two public entry points below.

-- ── Shared core: the actual calc + upsert, unchanged from
--    20260817010000's version of calculate_load_points, just parameterized
--    instead of reading v_user_id/v_company_id from auth.uid()/load_log
--    directly, and with no auth check at all.
create or replace function public._calculate_load_points_core(
  p_load_id uuid,
  p_user_id uuid,
  p_company_id uuid,
  p_tare_lbs numeric
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
    recovered_gallons, recovered_points, updated_at
  )
  select
    p_load_id, s.comp_number, p_user_id, p_company_id, s.product_id,
    s.benchmark_gallons, s.actual_gallons, s.lbs_per_gal_today,
    s.recovered_gallons, s.recovered_gallons, now()
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
    updated_at               = now();

  select coalesce(sum(recovered_gallons), 0) into v_total_recovered
    from load_points where load_id = p_load_id;

  return jsonb_build_object('ok', true, 'recovered_gallons', v_total_recovered);
end;
$function$;

-- Not directly callable via PostgREST -- only the two auth-checked entry
-- points below (and each other, as function owners) can reach it.
revoke execute on function public._calculate_load_points_core(uuid, uuid, uuid, numeric)
  from public, anon, authenticated;

-- ── calculate_load_points -- unchanged public signature/behavior, now
--    just delegates its math to the shared core after its own owner check.
create or replace function public.calculate_load_points(p_load_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id     uuid;
  v_tare_lbs    numeric;
  v_company_id  uuid;
  v_enabled     boolean;
  v_core        jsonb;
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

  select enabled into v_enabled
    from incentive_settings
   where company_id = v_company_id;

  if not found then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  v_core := _calculate_load_points_core(p_load_id, v_user_id, v_company_id, v_tare_lbs);

  return jsonb_build_object(
    'ok', true, 'enabled', v_enabled,
    'recovered_gallons', coalesce(v_core->'recovered_gallons', to_jsonb(0))
  );
end;
$function$;

-- ── backfill_incentive_points -- new, admin-only. Loops every completed
--    load belonging to a CURRENT member of p_company_id and runs the same
--    core calc for each -- idempotent (upsert-on-conflict, same as a
--    normal load completion), so safe to re-run any time (e.g. after
--    adding a benchmark that didn't exist on the first pass). p_since is
--    optional -- omitted (default null) backfills the company's entire
--    history, matching "calculates all the loads" as asked; a caller can
--    pass a cutoff to scope a re-run narrower if ever needed later.
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
begin
  select role into v_caller_role
    from user_companies
   where user_id = auth.uid() and company_id = p_company_id;

  if v_caller_role is distinct from 'admin' then
    raise exception 'unauthorized: admin only';
  end if;

  for v_load in
    select ll.load_id, ll.user_id, coalesce(ll.tare_lbs, 0) as tare_lbs
      from load_log ll
      join user_companies uc
        on uc.user_id = ll.user_id and uc.company_id = p_company_id
     where ll.status = 'completed'
       and (p_since is null or ll.completed_at >= p_since)
  loop
    v_core := _calculate_load_points_core(v_load.load_id, v_load.user_id, p_company_id, v_load.tare_lbs);
    v_loads_processed := v_loads_processed + 1;
    v_total_recovered := v_total_recovered + coalesce((v_core->>'recovered_gallons')::numeric, 0);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'loads_processed', v_loads_processed,
    'total_recovered_gallons', v_total_recovered
  );
end;
$function$;
