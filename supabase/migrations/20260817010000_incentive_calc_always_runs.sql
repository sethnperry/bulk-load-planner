-- calculate_load_points() used to no-op entirely whenever
-- incentive_settings.enabled was false, meaning a company that flips
-- incentives on later has a permanent gap: every load completed while it
-- was off never got load_points rows written at all, and there was no way
-- to fill that gap short of a bespoke one-time backfill.
--
-- Per explicit product direction: always run the calculation (as long as
-- the company has an incentive_settings row at all -- i.e. an admin has
-- opened Incentive Settings at least once, so weight_cap_lbs/benchmarks
-- exist to calculate against), and let `enabled` control DISPLAY only, not
-- calculation. This makes future "I turned it on late" gaps impossible
-- without ever needing a backfill again -- load_points is always kept
-- current for every completed load, and the UI decides whether to surface
-- it. Does NOT retroactively backfill loads that completed before this
-- migration -- those never called calculate_load_points at all, so there
-- is nothing this change can do about the true historical past; a
-- deliberate one-time backfill would still be needed for that, and was
-- explicitly not requested here.
--
-- The client (useLoadWorkflow.ts) already reads the RPC's own returned
-- `enabled` field to decide whether to show the driver-facing "You earned
-- X points" line -- so the returned value must still reflect the real
-- company setting (v_enabled), not a hardcoded `true`, even though
-- calculation itself no longer depends on it. That's the only other change
-- in this function -- everything else (the split-load formula, the
-- idempotent upsert-on-conflict, the weight cap) is verbatim from
-- 20260802000000_incentive_system.sql.
--
-- NOT applied automatically -- run manually in the Supabase SQL editor.

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

  -- Only bail if the company has never configured incentives at all (no
  -- settings row -- nothing to calculate against). No longer bails just
  -- because `enabled` is false -- that now only gates display, not calc.
  if not found then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  select coalesce(sum(actual_gallons), 0), coalesce(sum(actual_lbs), 0)
    into v_total_gallons, v_total_actual_lbs
    from load_lines
   where load_id = p_load_id
     and actual_gallons is not null and actual_gallons > 0
     and actual_lbs is not null;

  if v_total_gallons <= 0 then
    return jsonb_build_object('ok', true, 'enabled', v_enabled, 'recovered_gallons', 0);
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

  return jsonb_build_object('ok', true, 'enabled', v_enabled, 'recovered_gallons', v_total_recovered);
end;
$function$;
