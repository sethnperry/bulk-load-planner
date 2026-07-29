-- Fleet Tier Section 1.3 (Terminal Card / Credential Management), part 1:
-- fleet-wide "who's carded where" visibility for admin+dispatch. Priority
-- terminal flagging (the other half of this spec section) is deliberately
-- NOT included here -- the training-load-count threshold and exact
-- driver-facing surfacing location are genuinely ambiguous product
-- decisions, not something to guess at; see CLAUDE.md.
--
-- This is a purely ADDITIVE new SELECT policy -- it does not drop or
-- modify whatever existing policy already governs terminal_access (unknown
-- exact shape, no live DB write access to check pg_policies this session).
-- Postgres RLS combines multiple permissive policies for the same
-- command with OR, so adding this cannot reduce anyone's existing access,
-- only extend admin/dispatch's own read reach to cover other drivers'
-- rows too.
--
-- Deliberately does NOT touch user_terminal_cards (card_number/pin) --
-- the fleet view only needs carded_on/expiry status, not the actual card
-- credentials, so there's no reason to widen access to those columns.
--
-- NOT applied automatically -- no live DB write access when this was
-- written. Run manually in the Supabase SQL editor.

create policy terminal_access_admin_dispatch_read on public.terminal_access
  for select using (
    exists (
      select 1
      from public.user_companies uc
      join public.user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = terminal_access.user_id
    )
  );
