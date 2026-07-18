-- Binder redesign (equipment-settings-spec.md §7). Replaces the ~17
-- hardcoded expiration-date columns on trucks/trailers (reg_expiration_date,
-- ifta_expiration_date, tank_v_expiration_date, etc. -- see CLAUDE.md) with
-- a company-managed permit_types + equipment_permits system, mirroring the
-- service_types/service_records pattern exactly: user can create, rename,
-- and soft-delete permit categories per company, scoped to truck/trailer/
-- both via applies_to.
--
-- Scope of this pass (explicitly NOT done here, by design):
--  - The old hardcoded columns, truck_other_permits, and equipment_attachments'
--    `category` text column are left untouched. The fleet-tier admin screen
--    (app/admin/page.tsx, lib/ui/driver/EquipmentDetails.tsx -- used by both
--    the fleet "Browse Equipment" flow AND today's solo "+" add-truck/add-
--    trailer flow via AdminTruckModal/AdminTrailerModal) keeps reading/
--    writing the old columns. Migrating that screen to the new system is a
--    separate future pass, consistent with this app's solo-tier-first
--    rollout (Gemini Motor Transport is the only live company today, kept
--    solo deliberately during this build-out).
--  - useExpirations.ts (the "expired/expiring" badge) DOES move to read
--    from this new system in this same pass (confirmed with user) -- so the
--    badge and Binder always agree for the solo tier. If a future fleet
--    company is created and still only uses the old add/edit form, its
--    equipment won't populate equipment_permits and its badge will go
--    quiet; that's an accepted gap until the admin screen is migrated too
--    (there is no live fleet company today, so this is not an active risk).

create table if not exists public.permit_types (
  permit_type_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id),
  name text not null,
  applies_to text not null default 'both' check (applies_to in ('truck', 'trailer', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_permits (
  equipment_permit_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id),
  truck_id uuid references public.trucks(truck_id) on delete cascade,
  trailer_id uuid references public.trailers(trailer_id) on delete cascade,
  permit_type_id uuid not null references public.permit_types(permit_type_id),
  expiration_date date,
  enforcement_date date,
  issue_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((truck_id is not null) <> (trailer_id is not null))
);

-- One current record per (unit, permit type) -- renewing overwrites the
-- date rather than logging a new row, matching the old single-column
-- behavior (no history of past renewals, same as before).
create unique index if not exists equipment_permits_truck_type_uniq
  on public.equipment_permits (truck_id, permit_type_id) where truck_id is not null;
create unique index if not exists equipment_permits_trailer_type_uniq
  on public.equipment_permits (trailer_id, permit_type_id) where trailer_id is not null;

-- New nullable linkage on equipment_attachments so Binder-driven uploads
-- can reference a dynamic permit_type_id instead of the fixed `category`
-- string the old system uses. `category`/`category_label` stay untouched.
alter table public.equipment_attachments
  add column if not exists permit_type_id uuid references public.permit_types(permit_type_id);

alter table public.permit_types enable row level security;
alter table public.equipment_permits enable row level security;

create policy permit_types_select_active_company on public.permit_types
  for select using (company_id = get_active_company_id());
create policy permit_types_insert_active_company on public.permit_types
  for insert with check (company_id = get_active_company_id());
create policy permit_types_update_active_company on public.permit_types
  for update using (company_id = get_active_company_id());
create policy permit_types_delete_active_company on public.permit_types
  for delete using (company_id = get_active_company_id());

create policy equipment_permits_select_active_company on public.equipment_permits
  for select using (company_id = get_active_company_id());
create policy equipment_permits_insert_active_company on public.equipment_permits
  for insert with check (company_id = get_active_company_id());
create policy equipment_permits_update_active_company on public.equipment_permits
  for update using (company_id = get_active_company_id());
create policy equipment_permits_delete_active_company on public.equipment_permits
  for delete using (company_id = get_active_company_id());

-- ─── Backfill ────────────────────────────────────────────────────────────
-- Registration and Annual Inspection are the same real-world requirement
-- for either unit type, so they get one shared type (applies_to = 'both')
-- instead of separate truck/trailer types -- everything else is inherently
-- truck-only or trailer-only (IFTA, PHMSA/Alliance HazMat, tank certs, etc).

do $$
declare
  co record;
  v_registration uuid;
  v_annual_inspection uuid;
  v_ifta uuid;
  v_phmsa uuid;
  v_alliance uuid;
  v_fleet_ins uuid;
  v_hazmat_lic uuid;
  v_inner_bridge uuid;
  v_tank_v uuid;
  v_tank_k uuid;
  v_tank_l uuid;
  v_tank_t uuid;
  v_tank_i uuid;
  v_tank_p uuid;
  v_tank_uc uuid;
begin
  for co in select company_id from public.companies loop
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'Registration', 'both') returning permit_type_id into v_registration;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'Annual Inspection', 'both') returning permit_type_id into v_annual_inspection;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'IFTA Permit + Decals', 'truck') returning permit_type_id into v_ifta;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'PHMSA HazMat Permit', 'truck') returning permit_type_id into v_phmsa;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'Alliance HazMat Permit', 'truck') returning permit_type_id into v_alliance;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'Fleet Insurance Cab Card', 'truck') returning permit_type_id into v_fleet_ins;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'HazMat Transportation Lic', 'truck') returning permit_type_id into v_hazmat_lic;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'Inner Bridge Permit', 'truck') returning permit_type_id into v_inner_bridge;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'V — External Visual', 'trailer') returning permit_type_id into v_tank_v;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'K — Leakage Test', 'trailer') returning permit_type_id into v_tank_k;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'L — Lining Inspection', 'trailer') returning permit_type_id into v_tank_l;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'T — Thickness Test', 'trailer') returning permit_type_id into v_tank_t;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'I — Internal Visual', 'trailer') returning permit_type_id into v_tank_i;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'P — Pressure Test', 'trailer') returning permit_type_id into v_tank_p;
    insert into public.permit_types (company_id, name, applies_to) values (co.company_id, 'UC — Upper Coupler', 'trailer') returning permit_type_id into v_tank_uc;

    -- Trucks
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date, enforcement_date)
      select co.company_id, truck_id, v_registration, reg_expiration_date, reg_enforcement_date
      from public.trucks where company_id = co.company_id and reg_expiration_date is not null;
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date)
      select co.company_id, truck_id, v_annual_inspection, inspection_expiration_date
      from public.trucks where company_id = co.company_id and inspection_expiration_date is not null;
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date, enforcement_date)
      select co.company_id, truck_id, v_ifta, ifta_expiration_date, ifta_enforcement_date
      from public.trucks where company_id = co.company_id and ifta_expiration_date is not null;
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date)
      select co.company_id, truck_id, v_phmsa, phmsa_expiration_date
      from public.trucks where company_id = co.company_id and phmsa_expiration_date is not null;
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date)
      select co.company_id, truck_id, v_alliance, alliance_expiration_date
      from public.trucks where company_id = co.company_id and alliance_expiration_date is not null;
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date)
      select co.company_id, truck_id, v_fleet_ins, fleet_ins_expiration_date
      from public.trucks where company_id = co.company_id and fleet_ins_expiration_date is not null;
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date)
      select co.company_id, truck_id, v_hazmat_lic, hazmat_lic_expiration_date
      from public.trucks where company_id = co.company_id and hazmat_lic_expiration_date is not null;
    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date)
      select co.company_id, truck_id, v_inner_bridge, inner_bridge_expiration_date
      from public.trucks where company_id = co.company_id and inner_bridge_expiration_date is not null;

    -- Trailers
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date, enforcement_date)
      select co.company_id, trailer_id, v_registration, trailer_reg_expiration_date, trailer_reg_enforcement_date
      from public.trailers where company_id = co.company_id and trailer_reg_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_annual_inspection, trailer_inspection_expiration_date
      from public.trailers where company_id = co.company_id and trailer_inspection_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_tank_v, tank_v_expiration_date
      from public.trailers where company_id = co.company_id and tank_v_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_tank_k, tank_k_expiration_date
      from public.trailers where company_id = co.company_id and tank_k_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_tank_l, tank_l_expiration_date
      from public.trailers where company_id = co.company_id and tank_l_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_tank_t, tank_t_expiration_date
      from public.trailers where company_id = co.company_id and tank_t_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_tank_i, tank_i_expiration_date
      from public.trailers where company_id = co.company_id and tank_i_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_tank_p, tank_p_expiration_date
      from public.trailers where company_id = co.company_id and tank_p_expiration_date is not null;
    insert into public.equipment_permits (company_id, trailer_id, permit_type_id, expiration_date)
      select co.company_id, trailer_id, v_tank_uc, tank_uc_expiration_date
      from public.trailers where company_id = co.company_id and tank_uc_expiration_date is not null;

    -- truck_other_permits: custom per-truck labels, each distinct label
    -- becomes its own permit_type (applies_to='truck') within the company.
    insert into public.permit_types (company_id, name, applies_to)
      select distinct co.company_id, top.label, 'truck'
      from public.truck_other_permits top
      join public.trucks t on t.truck_id = top.truck_id
      where t.company_id = co.company_id and top.label is not null and top.label <> '';

    insert into public.equipment_permits (company_id, truck_id, permit_type_id, expiration_date)
      select co.company_id, top.truck_id, pt.permit_type_id, top.expiration_date
      from public.truck_other_permits top
      join public.trucks t on t.truck_id = top.truck_id
      join public.permit_types pt on pt.company_id = co.company_id and pt.name = top.label and pt.applies_to = 'truck'
      where t.company_id = co.company_id;

    -- equipment_attachments: link existing rows whose free-text category
    -- matches one of the default types just created, by name. "Trailer
    -- Registration" is the old trailer-specific label for what's now the
    -- unified "Registration" type; category='other' has no equivalent
    -- (there's no generic bucket in the new dynamic system) and is left
    -- unlinked.
    update public.equipment_attachments ea
      set permit_type_id = pt.permit_type_id
      from public.permit_types pt
      where ea.company_id = co.company_id
        and pt.company_id = co.company_id
        and ea.permit_type_id is null
        and pt.name = (case when ea.category_label = 'Trailer Registration' then 'Registration' else ea.category_label end);
  end loop;
end $$;
