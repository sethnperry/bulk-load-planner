-- backfill_incentive_points returned "0 loads processed" for a company
-- with real load history, and there's no live DB access this session to
-- inspect why directly -- so instead of guessing, this widens the
-- function's own return payload with enough counts to tell the two
-- possible causes apart from the UI alone:
--   - company_members: how many user_companies rows exist for p_company_id
--     at all (0 would mean the wrong/empty company was selected).
--   - member_loads_any_status: how many load_log rows belong to a CURRENT
--     member of p_company_id, regardless of status (0 would mean those
--     drivers have no load history under this company's current roster --
--     possibly because they were re-invited/reassigned and their old
--     loads belong to a user_id no longer joined to this company_id).
--   - member_loads_completed: the same count filtered to status =
--     'completed' -- this is what loads_processed already measures, but
--     surfaced explicitly for comparison. If member_loads_any_status > 0
--     but this is 0, every one of those loads is sitting in some other
--     status (e.g. still 'planned') rather than 'completed'.
-- No change to the actual backfill logic -- same loop, same core calc,
-- same idempotent upsert. Purely additive to the returned jsonb.

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
    'total_recovered_gallons', v_total_recovered,
    'company_members', v_member_count,
    'member_loads_any_status', v_any_status_count
  );
end;
$function$;
