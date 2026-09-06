-- ============================================================================
-- P0 RLS FIX: load_lines was globally readable
-- ============================================================================
-- Live pentest 2026-09-06: load_log isolates correctly, but its child
-- load_lines does NOT -- an authenticated user of Company A could read every
-- other company's compartment-level load detail (product, planned/actual
-- gallons, temp). Confirmed: Company A's admin read Company B's load_lines
-- byte-for-byte, and could see line rows from 463 distinct loads (vs its own
-- 283). This is competitive/operational data leaking across every tenant.
--
-- The migration files only ever declared correct, owner-scoped load_lines
-- policies (load_lines_select_own via the parent load_log.user_id, plus the
-- admin/dispatch company-member-read policy). So a BROAD policy exists on the
-- LIVE table that was never captured in version control -- migration drift in
-- the dangerous direction. Because that stray policy's name can't be read from
-- here (no service-role / pg_policies access over PostgREST), this migration
-- drops EVERY policy currently on load_lines via a catalog-driven DO block and
-- reinstalls exactly the intended set, so the result is deterministic
-- regardless of what is there now.
--
-- Intended access after this runs:
--   * a user may read/insert/update/delete load_lines only for a load_log row
--     they OWN (ll.user_id = auth.uid());
--   * admin/dispatch of the load owner's active company may READ their company
--     members' load_lines (mirrors the load_log "admins can read company member
--     loads" policy).
-- Writes in the app go through SECURITY DEFINER RPCs (begin_load / complete_load
-- / delete_load) which bypass RLS, so tightening these table policies does not
-- affect the normal load flow.
-- Idempotent.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'load_lines'
  loop
    execute format('drop policy if exists %I on public.load_lines', pol.policyname);
  end loop;
end $$;

-- Owner-scoped CRUD (via the parent load_log row's owner).
create policy "load_lines_select_own" on public.load_lines
  as permissive for select to authenticated
  using (exists (select 1 from public.load_log ll
                  where ll.load_id = load_lines.load_id and ll.user_id = auth.uid()));

create policy "load_lines_insert_own" on public.load_lines
  as permissive for insert to authenticated
  with check (exists (select 1 from public.load_log ll
                       where ll.load_id = load_lines.load_id and ll.user_id = auth.uid()));

create policy "load_lines_update_own" on public.load_lines
  as permissive for update to authenticated
  using (exists (select 1 from public.load_log ll
                  where ll.load_id = load_lines.load_id and ll.user_id = auth.uid()))
  with check (exists (select 1 from public.load_log ll
                       where ll.load_id = load_lines.load_id and ll.user_id = auth.uid()));

create policy "load_lines_delete_own" on public.load_lines
  as permissive for delete to authenticated
  using (exists (select 1 from public.load_log ll
                  where ll.load_id = load_lines.load_id and ll.user_id = auth.uid()));

-- Admin/dispatch may read their own company members' load lines (mirrors the
-- load_log company-member-read policy from 20260730000000).
create policy "admins can read company member load lines" on public.load_lines
  as permissive for select to public
  using (
    exists (
      select 1
      from public.load_log ll
      join public.user_companies uc on uc.user_id = auth.uid()
      join public.user_settings us on us.user_id = auth.uid()
      join public.user_companies uc2 on uc2.user_id = ll.user_id
      where ll.load_id = load_lines.load_id
        and uc.role = any (array['admin','dispatch'])
        and us.active_company_id = uc.company_id
        and uc2.company_id = uc.company_id
    )
  );
