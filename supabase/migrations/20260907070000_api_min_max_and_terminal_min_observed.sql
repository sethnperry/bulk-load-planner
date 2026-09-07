-- Stale-API safety seeding for the Loading-modal "Good / Better / Best"
-- decision overlay (operator design item, 2026-09-05).
--
-- When a driver taps LOAD and a planned product's API reading at this
-- terminal is stale (or missing), the app offers three ways to proceed:
--
--   Safest  -> assume the product is at its published heaviest
--              (lowest API in the published range)  -> products.api_min
--   Safe    -> assume it's at the heaviest THIS TERMINAL has ever seen
--              (lowest API observed on this rack)   -> rack_product_status.min_api_observed
--   Ignore  -> proceed with the last-known API (Not Safe)
--
-- Lower API = denser = heavier = fewer safe gallons, so both min values
-- make the plan solve conservatively (see planMath / CLAUDE.md: "if diesel
-- ranges 33-38 we use 33").
--
-- Purely additive: three nullable columns, no RLS change (columns inherit
-- each table's existing policies), no behavior change until the app reads
-- them. Backfills from the values already present so the feature has real,
-- non-null numbers to work with on day one -- but note api_min/api_max are
-- seeded EQUAL to api_60 here as a conservative placeholder; the real
-- published min/max per product is a data-entry task (see CLAUDE.md: "that
-- api_60 was just to seed the DB... we really do need to look at the table
-- and seed the DB with min/max"). Until those are entered, "Safest" simply
-- equals the reference API -- correct and safe, just not yet distinct from
-- the reference.

-- ── products: published API range ──────────────────────────────────────────
alter table public.products add column if not exists api_min numeric;
alter table public.products add column if not exists api_max numeric;

update public.products
   set api_min = api_60
 where api_min is null and api_60 is not null;

update public.products
   set api_max = api_60
 where api_max is null and api_60 is not null;

-- ── rack_product_status: lowest API this rack has ever observed ─────────────
-- Maintained going forward by the load write-through (useLoadWorkflow.ts):
-- every completed load's observed API folds in via LEAST(existing, api).
alter table public.rack_product_status add column if not exists min_api_observed numeric;

update public.rack_product_status
   set min_api_observed = last_api
 where min_api_observed is null and last_api is not null;
