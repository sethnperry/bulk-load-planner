-- Self-collected rolling ambient-temperature history, per city. Replaces
-- reliance on OpenWeather's OneCall "hourly" field as a stand-in for past
-- conditions -- that field is a *forecast* (current hour forward), not
-- history, which was the root bug in the old fuel-temp predictor: it
-- simulated forward through 24 forecast hours and returned the value at the
-- far end (~23h in the future) as "now". This table lets the predictor walk
-- forward through REAL past readings ending at "now" instead.
--
-- Populated by app/api/fuel-temp/route.ts on a throttle (roughly one insert
-- per city per ~20 minutes, regardless of how many users/requests hit that
-- city in the meantime) -- no external historical-weather API needed, since
-- this app already polls current conditions constantly on its own.
--
-- RLS enabled with no policies, mirroring fuel_temp_cache's own precedent
-- (server-only table, touched exclusively via the service-role client in
-- the API route -- no direct client access needed or granted).
create table if not exists ambient_temp_history (
  city_key text not null,
  ts timestamptz not null,
  temp_f numeric not null,
  primary key (city_key, ts)
);

alter table ambient_temp_history enable row level security;

create index if not exists ambient_temp_history_city_ts_idx
  on ambient_temp_history (city_key, ts desc);
