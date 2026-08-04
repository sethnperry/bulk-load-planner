-- Terminal Tier redesign per the user's mockup + punch-list review
-- (2026-08-04): blender arms (up to 3 products per arm), structured
-- Lane Down / Arm Down / Product Out states replacing the old free-text
-- rack_arms.status. See CLAUDE.md "Terminal Tier — Build Spec" for the
-- full layered-visual-state reasoning (an arm renders "fully down" —
-- circle-slash — when every product on it is out, either because the arm
-- itself is flagged down or because all its products are individually/
-- rack-wide out; otherwise a single out product on a multi-product arm
-- just gets a strikethrough while the arm stays usable).

-- Lane-level down flag -- new concept, one row per (rack, lane).
create table rack_lanes (
  rack_id     uuid not null references terminal_racks(rack_id) on delete cascade,
  lane_number int  not null,
  is_down     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  primary key (rack_id, lane_number)
);

create trigger trg_rack_lanes_updated_at
  before update on rack_lanes
  for each row execute function set_updated_at();

alter table rack_lanes enable row level security;
create policy allow_all_authenticated on rack_lanes
  for all to authenticated using (true) with check (true);

-- Arms: product_id -> product_ids (blenders carry up to 3 products on one
-- arm, per the mockup -- e.g. an arm showing both "D2" and "DYED" stacked).
-- Existing single assignments are preserved, not discarded.
alter table rack_arms add column product_ids uuid[] not null default '{}';
update rack_arms set product_ids = array[product_id] where product_id is not null;
alter table rack_arms drop column product_id;

-- Structured status replacing the old free-text column: an explicit
-- whole-arm down flag, plus which of this arm's own products (if any) are
-- individually flagged out. (rack_product_status.is_out, from the
-- rack-level STUD button, is a third, separate signal -- read at render
-- time, not duplicated into this row.)
alter table rack_arms add column is_down boolean not null default false;
alter table rack_arms add column out_product_ids uuid[] not null default '{}';
alter table rack_arms drop column status;
