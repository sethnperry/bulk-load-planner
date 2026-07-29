-- Fleet Tier Section 1.1 (Equipment Sharing), part 1 of the pass shipped
-- 2026-07-31: attribution capture on equipment_attachments (was silently
-- missing -- unlike service_records/wash_records/weight_records, which
-- already had created_by from earlier this session, equipment_attachments'
-- insert call sites never set an uploader at all) + a new admin-only
-- sensitive equipment data table (purchase price, lease terms, insurance
-- claims -- explicitly NOT part of the shared log per the spec).
--
-- `equipment_attachments` itself is not defined anywhere in
-- supabase/migrations/ (confirmed via a repo-wide search) -- another
-- instance of the documented migrations-lag (see CLAUDE.md "Architecture
-- reality"). This migration only ALTERs it (add a nullable column), so it
-- doesn't need the full table definition to be safe to run.
--
-- NOT applied automatically -- no live DB write access when this was
-- written. Run manually in the Supabase SQL editor.

alter table public.equipment_attachments
  add column if not exists uploaded_by uuid references auth.users(id);
-- Nullable and not backfilled -- existing rows predate this column and
-- genuinely have no recorded uploader; new uploads populate it going
-- forward (see DocHub.tsx and BinderModal.tsx upload call sites).

create table if not exists public.equipment_sensitive_data (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(company_id),
  truck_id         uuid references public.trucks(truck_id) on delete cascade,
  trailer_id       uuid references public.trailers(trailer_id) on delete cascade,
  purchase_price   numeric,
  purchase_date    date,
  lease_terms      text,
  insurance_claims text,
  updated_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now(),
  check ((truck_id is not null) <> (trailer_id is not null))
);

create index if not exists equipment_sensitive_data_truck_id_idx   on public.equipment_sensitive_data (truck_id);
create index if not exists equipment_sensitive_data_trailer_id_idx on public.equipment_sensitive_data (trailer_id);

alter table public.equipment_sensitive_data enable row level security;

-- Strictly admin-only -- deliberately NOT admin+lead like the rest of
-- equipment management. This is the one piece of equipment data the spec
-- calls out as not belonging in the general shared log.
create policy equipment_sensitive_data_select_admin on public.equipment_sensitive_data
  for select using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = equipment_sensitive_data.company_id and uc.role = 'admin'
    )
  );
create policy equipment_sensitive_data_insert_admin on public.equipment_sensitive_data
  for insert with check (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = equipment_sensitive_data.company_id and uc.role = 'admin'
    )
  );
create policy equipment_sensitive_data_update_admin on public.equipment_sensitive_data
  for update using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = equipment_sensitive_data.company_id and uc.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = equipment_sensitive_data.company_id and uc.role = 'admin'
    )
  );
create policy equipment_sensitive_data_delete_admin on public.equipment_sensitive_data
  for delete using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = equipment_sensitive_data.company_id and uc.role = 'admin'
    )
  );
