-- Links the Terminal tab's STUD ("Product Status Update") system to the
-- same terminal-outage banner Complete-screen's "Report Terminal Issue"
-- already posts to -- see CLAUDE.md "STUD linked to the outage banner"
-- (2026-09-06). Marking a product "Out" via STUD now also posts an
-- out_of_product terminal_outage_reports row (same banner, same 6am/12pm/
-- 6pm/12am clearing schedule); marking it back "Available" clears any
-- active out_of_product report for that terminal+product.
--
-- The clear side is the reason this migration is needed at all: STUD is
-- open to any role (see the original Terminal Tier spec -- "crowdsourced
-- for this first pass, open to any role, including drivers"), and the
-- existing 20260829000000 DELETE policy is deliberately reporter-only
-- ("I fixed my own mistake," not a moderation tool) -- so a driver who
-- didn't file the original report couldn't clear it via STUD even though
-- STUD itself represents the terminal's own current physical status, not
-- a personal claim. This adds a second, additive DELETE policy scoped to
-- out_of_product rows only (permissive policies OR together, so the
-- existing reporter-only policy is untouched and still applies as-is,
-- including to out_of_allocation rows) -- any authenticated user can
-- clear an out_of_product report regardless of who filed it, matching
-- the same "wide open to any role" precedent rack_product_status itself
-- already has. Out of Allocation stays reporter-only, unchanged -- per
-- explicit direction, that's company-specific, not a physical terminal
-- fact STUD has any business overriding.

create policy terminal_outage_reports_delete_product_any on terminal_outage_reports
  for delete using (
    report_type = 'out_of_product'
  );
