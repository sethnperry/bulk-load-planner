-- Equipment modal rework (2026-08-29 note): Region and Local Area become
-- real company-managed catalogs instead of free text, per explicit user
-- direction ("Managed catalog") -- mirrors the service_types/permit_types
-- pattern exactly (see 20260723000000_permit_types_binder.sql,
-- 20260222172537_remote_schema.sql's service_types): company-scoped,
-- soft-delete only (is_active, never a hard delete), no DB-level role
-- gate -- add/edit/remove is gated in the UI (admin/dispatch/lead, or
-- solo's always-admin role), same precedent PermitTypeEditorModal already
-- established for its own soft-delete confirm copy.
--
-- trucks.region / trucks.local_area (and the trailer equivalents) are
-- UNCHANGED, plain text columns -- no FK swap here. The new catalogs are
-- purely a managed pick-list feeding those existing text fields; renaming
-- or removing a catalog entry only affects future selections, exactly
-- like permit_types/service_types's own "future entries only" behavior.

create table if not exists public.equipment_regions (
  region_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_local_areas (
  local_area_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.equipment_regions enable row level security;
alter table public.equipment_local_areas enable row level security;

create policy equipment_regions_select_active_company on public.equipment_regions
  for select using (company_id = get_active_company_id());
create policy equipment_regions_insert_active_company on public.equipment_regions
  for insert with check (company_id = get_active_company_id());
create policy equipment_regions_update_active_company on public.equipment_regions
  for update using (company_id = get_active_company_id());
create policy equipment_regions_delete_active_company on public.equipment_regions
  for delete using (company_id = get_active_company_id());

create policy equipment_local_areas_select_active_company on public.equipment_local_areas
  for select using (company_id = get_active_company_id());
create policy equipment_local_areas_insert_active_company on public.equipment_local_areas
  for insert with check (company_id = get_active_company_id());
create policy equipment_local_areas_update_active_company on public.equipment_local_areas
  for update using (company_id = get_active_company_id());
create policy equipment_local_areas_delete_active_company on public.equipment_local_areas
  for delete using (company_id = get_active_company_id());

-- ─── Backfill ────────────────────────────────────────────────────────────
-- Whatever region/local_area text already exists on real trucks/trailers
-- becomes a real catalog entry, per company -- so nothing already on file
-- silently disappears from the new picker once this ships.

insert into public.equipment_regions (company_id, name)
select distinct t.company_id, t.region
from public.trucks t
where t.region is not null and t.region <> ''
union
select distinct tr.company_id, tr.region
from public.trailers tr
where tr.region is not null and tr.region <> '';

insert into public.equipment_local_areas (company_id, name)
select distinct t.company_id, t.local_area
from public.trucks t
where t.local_area is not null and t.local_area <> ''
union
select distinct tr.company_id, tr.local_area
from public.trailers tr
where tr.local_area is not null and tr.local_area <> '';
