-- Equipment settings redesign: service records, wash records, and the
-- company-scoped reference lists (service types, shop names, locations)
-- that back them. None of this existed live as of 2026-07-17 (confirmed
-- against information_schema before writing this) -- the "Wet Service Due"
-- / "Washed on" data in the redesign mockup was purely visual, not backed
-- by any existing table.
--
-- Truck/trailer reference uses two nullable FK columns (rather than a
-- single unit_type/unit_id pair) so Postgres can enforce real
-- ON DELETE CASCADE -- a single column can't validly FK to two different
-- tables. delete_truck()/delete_trailer() need no changes: the cascade is
-- now handled by the FK itself, same as trailer_compartments/
-- truck_other_permits already work today.

create table service_types (
  service_type_id uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(company_id),
  name            text not null,
  interval_kind   text not null check (interval_kind in ('miles','hours','duration','none')),
  interval_value  numeric, -- null only when interval_kind = 'none'
  created_at      timestamptz not null default now(),
  unique (company_id, name)
);

-- Predictive-autocomplete lists, company-scoped. Populated by upsert-on-save
-- from free-text input in the Service/Wash modals, not a hard picklist.
create table service_shops (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(company_id),
  name       text not null,
  unique (company_id, name)
);

create table service_locations (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(company_id),
  name       text not null,
  unique (company_id, name)
);
-- shared by the Service modal's Location field and the Wash modal's Location field

create table service_records (
  service_record_id uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(company_id),
  truck_id        uuid references trucks(truck_id) on delete cascade,
  trailer_id      uuid references trailers(trailer_id) on delete cascade,
  service_type_id uuid not null references service_types(service_type_id),
  date            date not null,
  shop_name       text,
  location        text,
  -- Odometer miles or engine-hours at time of service. Required only when
  -- the selected type's interval_kind is 'miles' or 'hours' -- without this,
  -- those interval kinds have no way to compute a next-due value.
  reading_value   numeric,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  check ((truck_id is not null) <> (trailer_id is not null))
);

create table wash_records (
  wash_record_id uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(company_id),
  truck_id    uuid references trucks(truck_id) on delete cascade,
  trailer_id  uuid references trailers(trailer_id) on delete cascade,
  location    text,
  washed_at   timestamptz not null,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  check ((truck_id is not null) <> (trailer_id is not null))
);

create index service_records_truck_id_idx   on service_records (truck_id);
create index service_records_trailer_id_idx on service_records (trailer_id);
create index wash_records_truck_id_idx      on wash_records (truck_id);
create index wash_records_trailer_id_idx    on wash_records (trailer_id);

-- RLS: mirrors the existing trucks/trailers pattern exactly -- any member of
-- the row's active company gets full SELECT/INSERT, not role-gated (matches
-- how equipment itself works today; see CLAUDE.md architecture notes).

alter table service_types     enable row level security;
alter table service_shops     enable row level security;
alter table service_locations enable row level security;
alter table service_records   enable row level security;
alter table wash_records      enable row level security;

create policy service_types_select_active_company on service_types
  for select using (company_id = get_active_company_id());
create policy service_types_insert_active_company on service_types
  for insert with check (company_id = get_active_company_id());
create policy service_types_update_active_company on service_types
  for update using (company_id = get_active_company_id()) with check (company_id = get_active_company_id());
create policy service_types_delete_active_company on service_types
  for delete using (company_id = get_active_company_id());

create policy service_shops_select_active_company on service_shops
  for select using (company_id = get_active_company_id());
create policy service_shops_insert_active_company on service_shops
  for insert with check (company_id = get_active_company_id());

create policy service_locations_select_active_company on service_locations
  for select using (company_id = get_active_company_id());
create policy service_locations_insert_active_company on service_locations
  for insert with check (company_id = get_active_company_id());

create policy service_records_select_active_company on service_records
  for select using (company_id = get_active_company_id());
create policy service_records_insert_active_company on service_records
  for insert with check (company_id = get_active_company_id());
create policy service_records_update_active_company on service_records
  for update using (company_id = get_active_company_id()) with check (company_id = get_active_company_id());
create policy service_records_delete_active_company on service_records
  for delete using (company_id = get_active_company_id());

create policy wash_records_select_active_company on wash_records
  for select using (company_id = get_active_company_id());
create policy wash_records_insert_active_company on wash_records
  for insert with check (company_id = get_active_company_id());
create policy wash_records_update_active_company on wash_records
  for update using (company_id = get_active_company_id()) with check (company_id = get_active_company_id());
create policy wash_records_delete_active_company on wash_records
  for delete using (company_id = get_active_company_id());
