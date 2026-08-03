-- Follow-up to 20260810000000_terminal_racks_lanes_arms.sql: rack_product_status
-- doubles as "which products this rack carries" (row exists = carried) in
-- addition to its original out-of-stock/API/temp tracking role. Adding an
-- `active` flag matches the terminal_products convention exactly (never
-- delete a row, toggle active instead) so last_api/last_temp_f history for a
-- product a rack previously curated is never lost by removing it from the
-- rack's product list and re-adding it later.

alter table rack_product_status
  add column active boolean not null default true;
