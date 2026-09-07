-- F-D (audit pass 1): the "Company members can read co-worker profiles" SELECT
-- policy on profiles allowed ANY company member (incl. a plain driver) to read
-- a co-worker's FULL profile row -- employee_number, hire_date, division,
-- region -- not just their name. RLS can't restrict columns, so a driver could
-- select employee_number for any co-worker.
--
-- Narrowed so only STAFF (owner/admin/lead/dispatch) of a company the target
-- belongs to can read co-worker profiles directly. Verified safe against every
-- direct profiles read in the app: all are self-reads (own-profile policy,
-- untouched) or admin/dispatch tools (staff, still allowed). Drivers that need
-- a co-worker's display name use the get_display_names SECURITY DEFINER RPC
-- (already gated to shares-a-company), which is unaffected by this table policy.

drop policy if exists "Company members can read co-worker profiles" on public.profiles;

create policy "Staff can read co-worker profiles" on public.profiles
  as permissive for select to authenticated
  using (
    exists (
      select 1
      from public.user_companies uc_self
      join public.user_companies uc_target
        on uc_target.company_id = uc_self.company_id
      where uc_self.user_id = auth.uid()
        and uc_self.role in ('owner','admin','lead','dispatch')
        and uc_target.user_id = profiles.user_id
    )
  );
