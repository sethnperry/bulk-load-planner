-- Load Planner redesign, Phase 2: separates "total volume" (physical tank
-- capacity, informational only) from "cap" (the overflow-prevention
-- ceiling actually used by the load-balancing solver). Previously the only
-- ceiling concept was a client-only, localStorage-only "headspace %"
-- (protankr_headspace_v1:{trailerId}) with no server persistence at all --
-- it didn't sync across devices and wasn't part of saved presets.
--
-- cap_gallons becomes the real, persisted ceiling, editable per compartment
-- in the trailer's Binder settings (see BinderModal.tsx's new Compartments
-- subsection). Backfilled to max_gallons so existing behavior is a no-op
-- until a driver actually lowers a cap.

alter table trailer_compartments
  add column if not exists cap_gallons numeric;

update trailer_compartments
set cap_gallons = max_gallons
where cap_gallons is null;
