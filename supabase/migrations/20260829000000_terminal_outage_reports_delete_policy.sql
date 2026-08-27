-- Terminal outage banners: "Clear Issue" -- lets a driver clear their OWN
-- report early instead of waiting for the next 6am/12pm/6pm/12am checkpoint.
-- See CLAUDE.md "Terminal outage banners" (follow-up, 2026-08-28) for the
-- full design. Additive on top of 20260828000000_terminal_outage_reports.sql
-- -- no existing policy touched.
--
-- Deliberately reporter-only, not company-staff-wide -- this is "I fixed
-- my own mistake / the situation resolved while I was still there," not a
-- moderation tool. A broader "any admin can clear any report" capability
-- is a real, separate product decision, not guessed at here.

create policy terminal_outage_reports_delete on terminal_outage_reports
  for delete using (
    reporter_user_id = auth.uid()
  );
