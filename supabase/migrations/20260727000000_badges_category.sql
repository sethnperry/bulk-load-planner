-- Badges sub-tab (Cards tab, renamed/broadened from "Ports"): drivers may
-- carry facility-access badges beyond port terminals (rail yard, refinery,
-- other), so driver_port_ids gets an optional free-text category alongside
-- its existing port_name/expiration_date. Nullable -- existing rows (and
-- any badge a driver doesn't bother categorizing) are left uncategorized.

ALTER TABLE public.driver_port_ids
  ADD COLUMN IF NOT EXISTS category text;
