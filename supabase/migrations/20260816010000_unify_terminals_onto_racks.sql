-- Rack-aware loading, unified (see CLAUDE.md "rack-aware loading"
-- discussion, 2026-08-16, both halves): the first pass added an optional
-- rack overlay on top of the terminal-wide terminal_products pool, kept
-- as two parallel systems (terminal-wide fallback + per-rack override).
-- Per direct follow-up, that dual-path is more complexity than the
-- problem warrants and repeats a "two stores that can drift" shape this
-- codebase has been bitten by more than once already. This migration
-- collapses it: every terminal gets a real rack (auto-named "Main Rack"
-- for the ~1,200+ terminals that have never touched the rack system), and
-- rack_product_status becomes the one place a product's curation (active)
-- and last-known reading (last_api/last_temp_f) live, at every terminal,
-- not just the two that had manually-configured racks before this.
--
-- terminal_products itself is deliberately left in place, not dropped or
-- altered -- same "leave deprecated stuff, don't touch what's working"
-- call already made repeatedly elsewhere in this project (lane_alpha/
-- arm_alpha columns, the dead 4-arg complete_load overload, etc.). The
-- app stops reading/writing it as of this same commit's app-code changes;
-- the live complete_load RPC's own unconditional terminal_products.last_api
-- write (see CLAUDE.md "Fuel temp prediction system") is left untouched
-- too -- a harmless, unread legacy write, not worth a second migration to
-- touch a working SECURITY DEFINER function for.

with new_racks as (
  insert into terminal_racks (terminal_id, rack_name)
  select t.terminal_id, 'Main Rack'
  from terminals t
  where not exists (
    select 1 from terminal_racks r where r.terminal_id = t.terminal_id
  )
  returning rack_id, terminal_id
)
-- Backfill rack_product_status from terminal_products onto exactly the
-- racks just created above -- terminals that already had real racks
-- (Global South, Marathon, as of this writing) keep their own
-- independently-curated per-rack data completely untouched. Blindly
-- copying the old terminal-wide pooled number onto an already-existing
-- rack would recreate the exact "same value pooled across racks" problem
-- this whole effort exists to fix.
insert into rack_product_status (rack_id, product_id, active, is_out, last_api, last_temp_f, updated_at)
select
  nr.rack_id,
  tp.product_id,
  coalesce(tp.active, true),
  coalesce(tp.is_out_of_stock, false),
  tp.last_api,
  tp.last_temp_f,
  coalesce(tp.updated_at, now())
from terminal_products tp
join new_racks nr on nr.terminal_id = tp.terminal_id;
