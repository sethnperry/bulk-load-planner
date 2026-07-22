-- Canonical product grouping: rack-injected-variance products (e.g. dyed
-- diesel) should keep their own selectable identity (driver-facing label,
-- DOT/placard info) but pool their API/temp tracking into the same
-- terminal_products row as the "main" product they're drawn from at the
-- rack, instead of building up a separate, thinner sample history.
--
-- Mapping is explicit and hand-reviewed, NOT auto-matched by api_60/
-- alpha_per_f -- five products in this catalog (Heating Oil, MGO, Off-road
-- Dyed Diesel, Renewable Diesel HVO, ULSD Diesel #2) all share the exact
-- same simplified api_60/alpha_per_f constants despite being different real
-- products, so a numeric-equality match silently grouped Off-road Dyed
-- Diesel under Marine Gas Oil the first time this was tried live -- caught
-- and reverted before it touched any real terminal_products data.
--
-- Only "Off-road Dyed Diesel" is grouped here, under "ULSD Diesel #2" --
-- matches the docx's literal example (same tank, dye injected at the rack).
-- "Renewable Diesel (HVO)" also carries is_dyed = true in existing data but
-- is a genuinely different product (different feedstock/process, not "same
-- tank + dye") -- deliberately left ungrouped; needs the user's explicit
-- confirmation before merging its bias tracking with anything.
--
-- Off-spec/blended products (Transmix, Jet, etc.) are untouched -- they
-- stay fully distinct, per the hard constraint that volumetric/density-
-- relevant differences must never be merged.

alter table products
  add column if not exists canonical_product_id uuid references products(product_id);

update products
set canonical_product_id = (select product_id from products where product_name = 'ULSD Diesel #2')
where product_name = 'Off-road Dyed Diesel'
  and canonical_product_id is null;

-- complete_load(payload jsonb): resolve product_id through canonical_product_id
-- before writing terminal_products.last_api, so a dyed-diesel delivery's
-- observed API pools into the same row as plain diesel from the same tank.
create or replace function public.complete_load(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_load_id        uuid;
  v_completed_at   timestamptz;
  v_user_id        uuid;
  v_status         text;
  v_terminal_id    uuid;
  v_planned_lbs    numeric;
  v_actual_total   numeric := 0;
  v_diff_lbs       numeric;
  v_line           jsonb;
  v_update         jsonb;
  v_comp           int;
  v_actual_gallons numeric;
  v_actual_lbs     numeric;
  v_actual_temp    numeric;
  v_actual_api     numeric;
  v_product_id     uuid;
  v_write_product_id uuid;
begin

  v_load_id      := (payload->>'load_id')::uuid;
  v_completed_at := coalesce(
                      (payload->>'completed_at')::timestamptz,
                      (payload->>'loaded_at')::timestamptz,
                      now()
                    );

  select user_id, status, terminal_id
    into v_user_id, v_status, v_terminal_id
    from load_log
   where load_id = v_load_id;

  if not found then
    raise exception 'load_not_found: %', v_load_id;
  end if;

  if v_user_id != auth.uid() then
    raise exception 'unauthorized: load does not belong to current user';
  end if;

  -- Removed already_completed guard — allows re-completion with updated values

  for v_line in select * from jsonb_array_elements(payload->'lines')
  loop
    v_comp           := (v_line->>'comp_number')::int;
    v_actual_gallons := (v_line->>'actual_gallons')::numeric;
    v_actual_lbs     := (v_line->>'actual_lbs')::numeric;
    v_actual_temp    := (v_line->>'temp_f')::numeric;

    update load_lines
       set actual_gallons = v_actual_gallons,
           actual_lbs     = v_actual_lbs,
           actual_temp_f  = v_actual_temp,
           updated_at     = now()
     where load_id    = v_load_id
       and comp_number = v_comp;
  end loop;

  for v_update in select * from jsonb_array_elements(payload->'product_updates')
  loop
    v_product_id := (v_update->>'product_id')::uuid;
    v_actual_api := (v_update->>'api')::numeric;
    v_actual_temp:= (v_update->>'temp_f')::numeric;

    update load_lines
       set actual_api    = v_actual_api,
           actual_temp_f = coalesce(actual_temp_f, v_actual_temp),
           updated_at    = now()
     where load_id    = v_load_id
       and product_id::text = v_update->>'product_id';
  end loop;

  select coalesce(sum(actual_lbs), 0)
    into v_actual_total
    from load_lines
   where load_id = v_load_id
     and actual_lbs is not null;

  select coalesce(planned_total_lbs, 0)
    into v_planned_lbs
    from load_log
   where load_id = v_load_id;

  v_diff_lbs := v_actual_total - v_planned_lbs;

  update load_log
     set status           = 'loaded',
         completed_at     = v_completed_at,
         actual_total_lbs = v_actual_total,
         diff_lbs         = v_diff_lbs,
         updated_at       = now()
   where load_id = v_load_id;

  for v_update in select * from jsonb_array_elements(payload->'product_updates')
  loop
    v_product_id := (v_update->>'product_id')::uuid;
    v_actual_api := (v_update->>'api')::numeric;

    if v_actual_api is not null and v_actual_api > 0 then
      -- Pool onto the canonical product's row when this product is a
      -- rack-injected-variance flagged variant (e.g. dyed diesel) --
      -- falls back to its own id for every ungrouped product, unchanged.
      select coalesce(canonical_product_id, product_id) into v_write_product_id
        from products where product_id = v_product_id;

      -- Insert-if-missing, not a plain update: a terminal can curate only
      -- the variant (confirmed live -- Kinder Morgan offers dyed diesel
      -- with no plain D2 row at all), so the canonical row may not exist
      -- yet. `active` defaults to true on this table -- explicitly false
      -- on insert keeps an auto-created pooling row from silently becoming
      -- a new driver-selectable product nobody curated. On conflict
      -- (row already exists), `active` is deliberately left out of the
      -- SET clause so an existing curated row's flag is never touched.
      insert into terminal_products (terminal_id, product_id, active, last_api, updated_at)
      values (v_terminal_id, coalesce(v_write_product_id, v_product_id), false, v_actual_api, now())
      on conflict (terminal_id, product_id) do update
        set last_api   = excluded.last_api,
            updated_at = excluded.updated_at;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',               true,
    'load_id',          v_load_id,
    'planned_lbs',      v_planned_lbs,
    'actual_lbs',       v_actual_total,
    'diff_lbs',         v_diff_lbs,
    'completed_at',     v_completed_at
  );

exception
  when others then
    raise;
end;
$function$;
