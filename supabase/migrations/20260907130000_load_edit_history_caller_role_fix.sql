-- LOW (audit pass 1): load_edit_history_admin_read checked the wrong user's
-- role. Its qual joined the LOAD OWNER to user_companies and required
-- `uc.role = 'admin'` on that owner row -- i.e. it granted the read when the
-- load's OWNER is an admin of the caller's active company, regardless of the
-- CALLER's own role. Effects (all intra-company -- it is keyed to
-- get_active_company_id(), so never cross-company): a plain driver could read
-- the edit history of loads owned by an admin, while an admin could NOT read a
-- regular driver's load edit history. Corrected to check the CALLER is an
-- admin of the load owner's company.

drop policy if exists load_edit_history_admin_read on public.load_edit_history;

create policy load_edit_history_admin_read on public.load_edit_history
  as permissive for select to authenticated
  using (
    exists (
      select 1
      from public.load_log ll
      join public.user_companies uc_owner on uc_owner.user_id = ll.user_id
      join public.user_companies uc_caller on uc_caller.company_id = uc_owner.company_id
      where ll.load_id = load_edit_history.load_id
        and uc_caller.user_id = auth.uid()
        and uc_caller.role = 'admin'
        and uc_caller.company_id = get_active_company_id()
    )
  );
