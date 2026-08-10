-- Records which named preset (1-5, mapped to A-E in the UI) was active when
-- a load began, purely for display -- the Planner's post-load "recap" card
-- (below the LOAD/RELOAD button) needs to say which plan and when a load
-- was completed, so it reads as a recap of a specific past load rather than
-- an ambiguous number that looks like it should track live plan edits.
-- Nullable: older rows and any load begun before this shipped simply show
-- no plan letter.
alter table load_log add column if not exists plan_slot smallint;
