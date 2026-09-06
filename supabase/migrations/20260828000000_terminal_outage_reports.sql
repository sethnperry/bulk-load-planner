-- Terminal outage banners: Out of Product + Out of Allocation
-- See CLAUDE.md "Terminal outage banners" for the full design.
--
-- APPLIED 2026-08-28, and re-confirmed live 2026-09-06 (terminal_outage_reports
-- returns real rows over PostgREST). The stale "not yet applied" header this
-- line replaces is the same contradiction that cost a cycle on the legacy
-- incentive drop: when a file's own header disagrees with reality, the header
-- is what people act on. Column
-- types below are written to match this project's established naming
-- (terminals.terminal_id, terminal_racks.rack_id, products.product_id,
-- companies.company_id all confirmed as uuid PKs elsewhere in this repo's
-- own migrations/code), but per this repo's own "verify against live DB,
-- don't trust assumptions" rule, spot-check these against
-- information_schema.columns before running if anything looks off.

create table if not exists terminal_outage_reports (
  report_id         uuid primary key default gen_random_uuid(),
  terminal_id       uuid not null references terminals(terminal_id),
  -- Null-safe: Out of Allocation reports don't resolve/need a rack.
  rack_id           uuid references terminal_racks(rack_id),
  product_id        uuid not null references products(product_id),
  report_type       text not null check (report_type in ('out_of_product', 'out_of_allocation')),
  company_id        uuid not null references companies(company_id),
  reporter_user_id  uuid not null references auth.users(id),
  -- Snapshot of the truck's unit number at report time (not a live join --
  -- keeps the banner's message stable even if the truck's own name/unit
  -- number is edited later).
  truck_label       text,
  created_at        timestamptz not null default now()
);

alter table terminal_outage_reports enable row level security;

-- Out-of-Product rows are readable by anyone (matches rack_product_status's
-- own existing "wide open to any authenticated user" precedent -- the
-- Terminal Tier spec's crowdsourcing model). Out-of-Allocation rows only by
-- the reporter's own company, via get_active_company_id() (same function
-- used throughout this app's other company-scoped RLS policies).
create policy terminal_outage_reports_select on terminal_outage_reports
  for select using (
    report_type = 'out_of_product' or company_id = get_active_company_id()
  );

-- Any authenticated user can post a report, same as rack_product_status's
-- own STUD write access -- but only attributed to themselves/their own
-- active company, never spoofable.
create policy terminal_outage_reports_insert on terminal_outage_reports
  for insert with check (
    reporter_user_id = auth.uid() and company_id = get_active_company_id()
  );

-- No update/delete policy -- reports are never edited, and "clearing" is
-- done by filtering on created_at in the read query (see
-- mostRecentClearingCheckpoint in app/planner/utils/dates.ts), not by
-- deleting rows. A periodic sweep to actually remove old rows is a
-- reasonable later addition, not needed for this pass since the table
-- stays small.

create index if not exists terminal_outage_reports_terminal_created_idx
  on terminal_outage_reports (terminal_id, created_at desc);
