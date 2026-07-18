-- Scale Ticket redesign: a real two-weigh scale-ticket reconciliation
-- ("Record Weight" on the Scale Ticket modal), separate from the existing
-- tare_lbs/target_weight settings on equipment_combos.
--
-- Heavy Weight (loaded, at scale) minus Light Weight (empty, at scale) is
-- the actual measured net product weight -- comparable against the most
-- recently completed load's load_log.actual_total_lbs to validate the
-- temp/API density math. Light Weight alone is the actual measured tare,
-- comparable against equipment_combos.tare_lbs to catch drift. Confirmed
-- with user: correcting tare_lbs from a discrepancy is an explicit opt-in
-- action (not automatic), and this never rewrites load_log/load_lines --
-- it's purely its own reconciliation record referencing the load for
-- context.
--
-- planner_weight_lbs and prior_tare_lbs are snapshots taken at record time
-- (not live-joined), so editing/deactivating the referenced load or tare
-- later doesn't retroactively change what this record shows happened.

create table if not exists public.weight_records (
  weight_record_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id),
  combo_id uuid not null references public.equipment_combos(combo_id),
  load_id uuid references public.load_log(load_id),
  heavy_weight_lbs numeric not null,
  light_weight_lbs numeric not null,
  net_weight_lbs numeric generated always as (heavy_weight_lbs - light_weight_lbs) stored,
  planner_weight_lbs numeric,
  prior_tare_lbs numeric,
  tare_updated boolean not null default false,
  notes text,
  recorded_at timestamptz not null default now(),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.weight_records enable row level security;

create policy weight_records_select_active_company on public.weight_records
  for select using (company_id = get_active_company_id());
create policy weight_records_insert_active_company on public.weight_records
  for insert with check (company_id = get_active_company_id());
create policy weight_records_update_active_company on public.weight_records
  for update using (company_id = get_active_company_id());
create policy weight_records_delete_active_company on public.weight_records
  for delete using (company_id = get_active_company_id());
