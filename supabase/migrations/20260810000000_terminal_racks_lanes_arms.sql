-- Terminal Tier: rack/lane/arm schema backing the new Terminal tab.
-- See CLAUDE.md "Terminal Tier — Build Spec" for full context.
--
-- RLS is intentionally wide open to any authenticated user on all three
-- tables here, matching the existing terminals/terminal_products
-- precedent (confirmed live via pg_policies before writing this) — those
-- tables are a shared, cross-company catalog with no company_id at all,
-- so there's no company-scoped role check (is_company_staff, etc.) that
-- could apply here. "Edit Terminal" being hidden from drivers is enforced
-- in the UI only, same as equipment CRUD was before its 2026-08-07
-- permission-split migration. Everyone (including drivers) can write
-- rack_arms.status / rack_product_status by design — the STUD actions are
-- meant to be crowdsourced for this first pass.

create table terminal_racks (
  rack_id       uuid primary key default gen_random_uuid(),
  terminal_id   uuid not null references terminals(terminal_id) on delete cascade,
  rack_name     text not null,
  lane_count    int  not null default 5,
  lane_reversed boolean not null default false,
  lane_alpha    boolean not null default false,  -- false = 1,2,3.. / true = A,B,C..
  arm_count     int  not null default 6,
  arm_reversed  boolean not null default false,
  arm_alpha     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (terminal_id, rack_name)
);

-- One row per physical (lane, arm) position within a rack. lane_number/
-- arm_number are logical 1-based indices — display labels (reversed order,
-- numeric vs alphabetic) are derived client-side from the rack's own
-- lane_reversed/lane_alpha/arm_reversed/arm_alpha config, never stored
-- per-arm.
create table rack_arms (
  arm_id            uuid primary key default gen_random_uuid(),
  rack_id           uuid not null references terminal_racks(rack_id) on delete cascade,
  lane_number       int  not null,
  arm_number        int  not null,
  product_id        uuid references products(product_id),
  status            text,  -- null = ok; else a canned value like 'Arm Down' (open list, not yet enumerated)
  status_updated_at timestamptz,
  status_updated_by uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (rack_id, lane_number, arm_number)
);

-- Rack-level "this product is out at this rack" flag — the bottom STUD
-- button on the rack screen, distinct from the per-arm status above.
-- last_api/last_temp_f are captured here for display only; the client is
-- responsible for separately calling the existing update_terminal_temp_bias
-- RPC with a computed error, same as useLoadWorkflow.ts already does after
-- a load completes — no new bias-tracking path is introduced here.
create table rack_product_status (
  rack_id     uuid not null references terminal_racks(rack_id) on delete cascade,
  product_id  uuid not null references products(product_id),
  is_out      boolean not null default false,
  last_api    numeric,
  last_temp_f numeric,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  primary key (rack_id, product_id)
);

create index idx_terminal_racks_terminal_id on terminal_racks(terminal_id);
create index idx_rack_arms_rack_id on rack_arms(rack_id);
create index idx_rack_arms_product_id on rack_arms(product_id);
create index idx_rack_product_status_product_id on rack_product_status(product_id);

create trigger trg_terminal_racks_updated_at
  before update on terminal_racks
  for each row execute function set_updated_at();

create trigger trg_rack_arms_updated_at
  before update on rack_arms
  for each row execute function set_updated_at();

create trigger trg_rack_product_status_updated_at
  before update on rack_product_status
  for each row execute function set_updated_at();

alter table terminal_racks enable row level security;
alter table rack_arms enable row level security;
alter table rack_product_status enable row level security;

create policy allow_all_authenticated on terminal_racks
  for all to authenticated using (true) with check (true);

create policy allow_all_authenticated on rack_arms
  for all to authenticated using (true) with check (true);

create policy allow_all_authenticated on rack_product_status
  for all to authenticated using (true) with check (true);
