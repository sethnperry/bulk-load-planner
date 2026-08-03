-- Fix for enforce_equipment_status_only_update() (from
-- 20260807000000_equipment_driver_permission_split.sql), found during live
-- verification of that migration, same day.
--
-- Bug: the trigger's staff check, is_company_staff(new.company_id), resolves
-- against auth.uid() internally -- but auth.uid() is NULL for any write made
-- through a service-role Postgres connection (no end-user JWT attached),
-- which is exactly how app/api/admin/setup/route.ts's serviceSupabase client
-- operates (already gated by its own verifyAdmin() check at the API layer
-- before it ever touches the DB). With auth.uid() null, is_company_staff()
-- returns false, so the trigger would treat a fully-trusted, already-
-- authorized server-side write as if it came from an unprivileged driver --
-- incorrectly blocking any future service-role update to trucks/trailers
-- that touches a non-status column, regardless of who's really behind it.
--
-- Fix: treat a null auth.uid() as a trusted/system context and bypass the
-- restriction entirely -- the calling layer (an API route, a RPC with its
-- own role check, etc.) is responsible for its own authorization in that
-- case; this trigger's job is only to stop an authenticated end-user's own
-- direct client-side write from exceeding their role, not to re-check
-- already-privileged server-side paths.

create or replace function public.enforce_equipment_status_only_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status_cols text[] := array[
    'status_code', 'status_location', 'status_lat', 'status_lon',
    'status_notes', 'status_updated_at'
  ];
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_company_staff(new.company_id) then
    return new;
  end if;

  if (to_jsonb(old) - v_status_cols) is distinct from (to_jsonb(new) - v_status_cols) then
    raise exception 'Only status fields can be updated by this role';
  end if;

  return new;
end;
$function$;
