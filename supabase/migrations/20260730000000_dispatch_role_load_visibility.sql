-- Dispatch role: extend "view other drivers' loads" from admin+lead to
-- admin+dispatch, per the Fleet Tier permission matrix (CLAUDE.md, "Fleet
-- Tier -- Build Spec"): Lead Driver does NOT get cross-driver load
-- visibility, only Dispatch and Admin do.
--
-- These two policies exist live today but were never captured into a
-- migration (confirmed via a live `pg_policies` query 2026-07-29) --
-- writing them here both applies the dispatch change and finally gets them
-- into version control. Exact prior definitions, for the record:
--
--   load_log "admins can read company member loads" (SELECT):
--     uc.role = ANY (ARRAY['admin','lead'])
--   load_lines "admins can read company member load lines" (SELECT):
--     uc.role = ANY (ARRAY['admin','lead'])
--
-- This is a real behavior change, not purely additive: leads lose an
-- ability they currently have (reading other drivers' loads in this
-- company). That's intentional per the matrix, not a mistake.
--
-- NOT applied automatically -- no live DB write access when this was
-- written. Run manually in the Supabase SQL editor.

drop policy if exists "admins can read company member loads" on public.load_log;
create policy "admins can read company member loads"
  on public.load_log
  as permissive
  for select
  to public
  using (
    exists (
      select 1
      from public.user_companies uc
      join public.user_settings us on us.user_id = uc.user_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and us.active_company_id = uc.company_id
        and load_log.user_id in (
          select uc2.user_id from public.user_companies uc2 where uc2.company_id = uc.company_id
        )
    )
  );

drop policy if exists "admins can read company member load lines" on public.load_lines;
create policy "admins can read company member load lines"
  on public.load_lines
  as permissive
  for select
  to public
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
