-- Fleet Tier Section 1.3 (Terminal Card / Credential Management), part 2:
-- fleet-wide read-only credential visibility for dispatch, completing what
-- 20260801000000_fleet_terminal_card_visibility.sql started for terminal
-- cards. Deferred at that time pending a real product decision (flagged in
-- CLAUDE.md) -- confirmed 2026-08-06: dispatch gets VIEW ONLY, not the
-- admin-only tables' full ALL/CRUD access. Giving dispatch full CRUD would
-- let them edit/delete another driver's license/medical/TWIC record, which
-- is more than "view who's carded where" implies.
--
-- Live pg_policies query (2026-08-06) confirmed the actual current shape:
--   driver_licenses / driver_medical_cards / driver_port_ids / driver_twic_cards:
--     `xx_admin` (ALL, admin-only, company-scoped) + `xx_own` (SELECT, self-row only)
--   attachments:
--     `Company members can read attachments` (SELECT) is ALREADY company-wide,
--     no role restriction at all -- dispatch (as any company member) can
--     already read these, so attachments needs NO change here. Only the
--     four credential tables have the gap.
--
-- Purely additive new SELECT policies (admin+dispatch, company-scoped),
-- mirroring the terminal_access_admin_dispatch_read pattern from the
-- terminal-card migration above. Does not touch the existing `xx_admin`
-- (ALL) or `xx_own` (SELECT) policies -- permissive policies OR together,
-- so this only extends admin/dispatch's own read reach to cover other
-- drivers' rows, never reduces anyone's existing access.
--
-- NOT applied automatically -- no live DB write access this session. Run
-- manually in the Supabase SQL editor.

create policy dl_admin_dispatch_read on public.driver_licenses
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid()
        and uc.company_id = driver_licenses.company_id
        and uc.role = any (array['admin','dispatch'])
    )
  );

create policy dmc_admin_dispatch_read on public.driver_medical_cards
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid()
        and uc.company_id = driver_medical_cards.company_id
        and uc.role = any (array['admin','dispatch'])
    )
  );

create policy dpid_admin_dispatch_read on public.driver_port_ids
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid()
        and uc.company_id = driver_port_ids.company_id
        and uc.role = any (array['admin','dispatch'])
    )
  );

create policy dtc_admin_dispatch_read on public.driver_twic_cards
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid()
        and uc.company_id = driver_twic_cards.company_id
        and uc.role = any (array['admin','dispatch'])
    )
  );
