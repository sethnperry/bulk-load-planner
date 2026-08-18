-- Real bug: backfill_incentive_points filtered on load_log.status =
-- 'completed', copied from the DEAD 4-arg complete_load(p_load_id,
-- p_completed_at, p_lines, p_product_updates) overload -- see CLAUDE.md's
-- "Fuel temp prediction system (architecture)" section, which already
-- documented that overload as dead code, never called by the client.
--
-- The overload the app actually calls (lib/supabase/load.ts's
-- complete_load({ payload })) sets status = 'loaded', not 'completed' --
-- confirmed directly against its live definition in
-- 20260722000000_product_canonical_grouping.sql. Every real finished load
-- in this app has status='loaded', which is why the backfill's own new
-- diagnostic (20260818010000) correctly reported real load history
-- existing for the company's members, but zero of them matching
-- status='completed' -- there's nothing wrong with the data, the query
-- was checking the wrong value.
--
-- Only the status filter changes -- same loop, same core calc, same
-- diagnostic counts from the previous migration.

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
    select ll.load_id, ll.user_id, coalesce(ll.tare_lbs, 0) as tare_lbs
      from load_log ll
      join user_companies uc
        on uc.user_id = ll.user_id and uc.company_id = p_company_id
     where ll.status = 'loaded'
       and (p_since is null or ll.completed_at >= p_since)
  loop
    v_core := _calculate_load_points_core(v_load.load_id, v_load.user_id, p_company_id, v_load.tare_lbs);
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
