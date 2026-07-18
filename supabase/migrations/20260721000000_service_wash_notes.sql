-- Adds a notes field to service_records and wash_records, per driver
-- feedback while testing the Equipment Settings redesign -- a service done
-- on both units at once needs somewhere to record specifics beyond
-- shop/location/reading.

alter table service_records add column if not exists notes text;
alter table wash_records add column if not exists notes text;
