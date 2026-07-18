-- Supports editable service types (rename/change interval/soft-delete) and
-- the generalized "done alongside the other unit" display in the Service
-- History redesign. Previously the only signal for "this type doesn't apply
-- to trailers" was interval_kind = miles/hours (trailers don't track
-- mileage/engine hours). That's not general enough for a type that's
-- conceptually trailer-only (e.g. a tank Clean & Purge) and would need to
-- show "(with Trailer 3151)" on a truck's record -- there's no existing
-- column that expresses that. applies_to makes it explicit instead of
-- inferring it from interval_kind.
--
-- is_active supports "delete" meaning "stop offering this for future
-- entries" rather than a real delete -- existing service_records keep
-- referencing the row and its name/interval untouched.

alter table service_types
  add column if not exists is_active boolean not null default true,
  add column if not exists applies_to text not null default 'both';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_types_applies_to_check'
  ) then
    alter table service_types
      add constraint service_types_applies_to_check
      check (applies_to in ('truck', 'trailer', 'both'));
  end if;
end $$;

-- Backfill: existing miles/hours types are truck-only in practice (no
-- trailer has an odometer or engine-hour meter).
update service_types set applies_to = 'truck'
where interval_kind in ('miles', 'hours') and applies_to = 'both';
