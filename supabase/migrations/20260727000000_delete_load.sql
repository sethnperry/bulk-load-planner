-- Lets a driver remove their own load_log rows from "My Loads" -- both
-- abandoned "planned" rows (created the instant LOAD is tapped, before the
-- Loading modal's LOADED button is ever reached) and completed ones they
-- just want gone from history. No DELETE grant exists on load_log/load_lines
-- for the authenticated role today (load_lines has an RLS policy for it but
-- the table grant itself is missing, making that policy dead code) -- rather
-- than opening those tables to direct client deletes, this mirrors
-- begin_load/complete_load's own SECURITY DEFINER RPC pattern.

CREATE OR REPLACE FUNCTION public.delete_load(p_load_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.load_log WHERE load_id = p_load_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Load not found or not owned by you';
  END IF;

  DELETE FROM public.load_lines WHERE load_id = p_load_id;
  DELETE FROM public.load_log WHERE load_id = p_load_id;
END;
$function$;
