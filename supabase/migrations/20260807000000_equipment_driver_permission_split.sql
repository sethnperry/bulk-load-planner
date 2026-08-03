-- Post-join permission split (Fleet Tier spec, "Roles & permissions" open
-- item): drivers keep full read + status-update access to company equipment
-- (unchanged), but lose the ability to create/delete equipment or edit core
-- specs (VIN, plate, make/model/year, permit dates, compartments, notes,
-- active flag). Admin/lead/dispatch are unaffected.
--
-- Verified live before writing this (2026-08-07), per this repo's standing
-- "don't trust the migrations folder" rule:
--   - trucks_insert_active_company / trailers_insert_active_company (INSERT)
--     and trucks_delete_active_company / trailers_delete_active_company
--     (DELETE) exist live with NO role check at all -- just
--     `company_id = get_active_company_id()`. Confirmed via a direct
--     pg_policies query. This migration is a precise diff against that.
--   - trucks_update_active_company / trailers_update_active_company (UPDATE)
--     is likewise company-scoped only, but is left UNTOUCHED here on
--     purpose -- see the trigger note below.
--   - delete_truck(p_truck_id, p_company_id) / delete_trailer(...) are
--     SECURITY DEFINER RPCs (confirmed via pg_get_functiondef) that already
--     enforce role = 'admin' internally -- that's the actual enforcement
--     path the UI uses (EquipmentDetails.tsx calls these RPCs, never a raw
--     `.delete()`). The bare table DELETE policy was still wide open to any
--     company member for anyone bypassing the RPC directly via the client
--     SDK, though -- this migration closes that gap to match the RPC's own
--     admin-only rule exactly (not the broader admin/lead/dispatch set used
--     below for INSERT), so the RLS backstop can't be looser than the
--     app's own intended behavior.
--   - No RPC or gate exists anywhere for INSERT (TruckModal/TrailerModal's
--     save() call `.from("trucks"/"trailers").insert(...)` directly) --
--     this is the one genuinely ungated write path. Gated here to
--     admin/lead/dispatch, matching the precedent already set for equipment
--     cap/Unit# editing (2026-08-06), not a new/different role set.
--
-- Column-level enforcement (why a trigger, not just RLS): Postgres RLS
-- policies don't have access to OLD alongside NEW inside a bare USING/
-- WITH CHECK expression, so "block changes to columns other than status_*"
-- can't be expressed as a policy -- it needs a BEFORE UPDATE trigger that
-- can see both rows. Uses an allow-list (jsonb diff minus the known status
-- columns) rather than a deny-list of "core spec" columns, deliberately --
-- this repo's own "Architecture reality" section documents trucks/trailers
-- having several live columns (vin_number, make, model, year, plate_number,
-- every reg_*/inspection_*/ifta_*/phmsa_*/alliance_*/fleet_ins_*/
-- hazmat_lic_*/inner_bridge_*/tank_*/trailer_reg_*/trailer_inspection_*
-- pair, notes) that were never confirmed complete or present in any
-- migration file. An allow-list of the ~6 confirmed-live status columns is
-- safe regardless of what else exists on the table; a deny-list would risk
-- either missing a real column (leaving it writable by drivers) or
-- referencing one that doesn't exist (breaking every update outright).

-- ── INSERT: admin/lead/dispatch only ──────────────────────────────────

drop policy if exists "trucks_insert_active_company" on public.trucks;
create policy "trucks_insert_active_company"
  on public.trucks
  as permissive for insert
  to authenticated
  with check (
    company_id = get_active_company_id()
    and is_company_staff(company_id)
  );

drop policy if exists "trailers_insert_active_company" on public.trailers;
create policy "trailers_insert_active_company"
  on public.trailers
  as permissive for insert
  to authenticated
  with check (
    company_id = get_active_company_id()
    and is_company_staff(company_id)
  );

-- ── DELETE: admin only, matching delete_truck/delete_trailer's existing
--    internal role check exactly (defense-in-depth backstop, not a new
--    behavior -- the RPCs are still the only app-code path to this today) ──

drop policy if exists "trucks_delete_active_company" on public.trucks;
create policy "trucks_delete_active_company"
  on public.trucks
  as permissive for delete
  to authenticated
  using (
    company_id = get_active_company_id()
    and is_company_admin(company_id)
  );

drop policy if exists "trailers_delete_active_company" on public.trailers;
create policy "trailers_delete_active_company"
  on public.trailers
  as permissive for delete
  to authenticated
  using (
    company_id = get_active_company_id()
    and is_company_admin(company_id)
  );

-- ── UPDATE: unchanged at the RLS level (still company-scoped only); a
--    BEFORE UPDATE trigger enforces the column-level split instead ──────

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
  if public.is_company_staff(new.company_id) then
    return new;
  end if;

  if (to_jsonb(old) - v_status_cols) is distinct from (to_jsonb(new) - v_status_cols) then
    raise exception 'Only status fields can be updated by this role';
  end if;

  return new;
end;
$function$;

drop trigger if exists trucks_status_only_update on public.trucks;
create trigger trucks_status_only_update
  before update on public.trucks
  for each row execute function public.enforce_equipment_status_only_update();

drop trigger if exists trailers_status_only_update on public.trailers;
create trigger trailers_status_only_update
  before update on public.trailers
  for each row execute function public.enforce_equipment_status_only_update();
