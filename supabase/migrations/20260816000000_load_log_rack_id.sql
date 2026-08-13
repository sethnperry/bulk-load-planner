-- Rack-aware loading (see CLAUDE.md discussion 2026-08-16): the Planner's
-- load flow has never known which physical rack a driver was loading at,
-- even though a single terminal can have multiple racks (see "Terminal
-- Tier" spec) each drawing from genuinely different tanks/batches of "the
-- same" product. Every load's actual observed API/temp has been pooling
-- into one shared terminal_products row regardless of which rack it came
-- from, and the Terminal tab's rack-level STUD button writes to that same
-- pooled row too -- so two racks with real, different API readings would
-- silently blend into one number.
--
-- This column records which rack (if any -- terminals without racks
-- configured, or a driver who never gets a rack-selection prompt because
-- the terminal only has one/zero racks, leave this null) a load actually
-- happened at. `on delete set null`, not cascade -- deleting a rack via
-- Edit Terminal (already a supported action, see CLAUDE.md "no way to
-- delete a whole rack") shouldn't destroy load history, just orphan the
-- reference.

alter table load_log add column rack_id uuid references terminal_racks(rack_id) on delete set null;

create index idx_load_log_rack_id on load_log(rack_id) where rack_id is not null;
