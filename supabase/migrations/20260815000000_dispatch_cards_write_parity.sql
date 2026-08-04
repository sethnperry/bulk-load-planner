-- Cards tab full edit parity for dispatch/admin viewing a selected driver.
-- Per explicit user direction: "all the cards should look identical for
-- every role... the only difference is whose cards they belong to" --
-- supersedes the original 2026-08-04 Dispatch-tab Cards decision, which was
-- deliberately read-only ("full write parity would need a deliberate
-- follow-up decision, not something to assume" -- this is that follow-up).
--
-- Live pg_policies query (2026-08-04) confirmed before writing this:
--   - my_terminals: zero admin/dispatch access at all (not even SELECT) --
--     only owner-scoped INSERT/UPDATE/DELETE/SELECT.
--   - terminal_access / user_terminal_cards: owner-scoped write policies
--     plus an existing admin/dispatch SELECT-only policy
--     (terminal_access_admin_dispatch_read / user_terminal_cards_admin_dispatch_read)
--     from the 20260812000000 migration -- read already worked, write did not.
--   - my_terminals_with_status (the view useTerminals() actually queries)
--     is a plain `security_invoker=on` view over my_terminals/terminals/
--     terminal_access -- it has no security logic of its own, so granting
--     the underlying tables' RLS is sufficient; no view change needed.
--
-- Every new policy mirrors the exact EXISTS shape already used by
-- terminal_access_admin_dispatch_read / user_terminal_cards_admin_dispatch_read,
-- scoped to admin+dispatch only (not lead -- lead never reaches this
-- contextual view; the Dispatch tab itself is admin/dispatch-only).

-- ── my_terminals: nothing existed before, needs full CRUD ──────────────────

create policy my_terminals_admin_dispatch_select on my_terminals
  for select to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = my_terminals.user_id
    )
  );

create policy my_terminals_admin_dispatch_insert on my_terminals
  for insert to authenticated
  with check (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = my_terminals.user_id
    )
  );

create policy my_terminals_admin_dispatch_update on my_terminals
  for update to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = my_terminals.user_id
    )
  )
  with check (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = my_terminals.user_id
    )
  );

create policy my_terminals_admin_dispatch_delete on my_terminals
  for delete to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = my_terminals.user_id
    )
  );

-- ── terminal_access: SELECT already existed, add write ──────────────────────

create policy terminal_access_admin_dispatch_insert on terminal_access
  for insert to authenticated
  with check (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = terminal_access.user_id
    )
  );

create policy terminal_access_admin_dispatch_update on terminal_access
  for update to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = terminal_access.user_id
    )
  )
  with check (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = terminal_access.user_id
    )
  );

create policy terminal_access_admin_dispatch_delete on terminal_access
  for delete to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = terminal_access.user_id
    )
  );

-- ── user_terminal_cards: SELECT already existed, add write ──────────────────

create policy user_terminal_cards_admin_dispatch_insert on user_terminal_cards
  for insert to authenticated
  with check (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = user_terminal_cards.user_id
    )
  );

create policy user_terminal_cards_admin_dispatch_update on user_terminal_cards
  for update to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = user_terminal_cards.user_id
    )
  )
  with check (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = user_terminal_cards.user_id
    )
  );

create policy user_terminal_cards_admin_dispatch_delete on user_terminal_cards
  for delete to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = user_terminal_cards.user_id
    )
  );
