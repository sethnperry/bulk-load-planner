-- Replaces the count+reversed computed labeling scheme with explicit,
-- directly-editable labels per lane and per arm. Driven by real user
-- feedback: some lanes have more or fewer arms than others within the same
-- rack (the old rack-wide lane_count/arm_count couldn't represent that at
-- all), and the admin wants full manual control over what each lane/arm is
-- called, not just a numbering scheme with a reverse toggle.
--
-- rack_lanes was previously sparse (a row only existed once a lane's
-- down-status had been touched); it's now the source of truth for which
-- lanes exist at all, so every lane referenced by an existing rack_arms row
-- gets backfilled here. terminal_racks.lane_count/lane_reversed/
-- arm_count/arm_reversed/lane_alpha/arm_alpha are now fully unused --
-- left in place rather than dropped, same as the alpha columns already
-- were when the letter option was removed.

alter table rack_lanes add column label text;
alter table rack_arms add column label text;

insert into rack_lanes (rack_id, lane_number, label, is_down)
select distinct ra.rack_id, ra.lane_number, ra.lane_number::text, false
from rack_arms ra
where not exists (
  select 1 from rack_lanes rl where rl.rack_id = ra.rack_id and rl.lane_number = ra.lane_number
);

-- Simple numeric backfill for existing rows (not a reconstruction of the
-- old continuous-across-racks/reversed display) -- this is test/demo data
-- at this point, not production data users depend on, and every label is
-- immediately editable from here on regardless.
update rack_lanes set label = lane_number::text where label is null;
update rack_arms set label = arm_number::text where label is null;
