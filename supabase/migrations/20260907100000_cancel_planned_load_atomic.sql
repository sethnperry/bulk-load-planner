-- Atomic, server-enforced cancellation of a PLANNED load.
--
-- Problem (audit follow-up): cancelActiveLoad did a client-side read-then-
-- delete -- SELECT status, then (if not 'loaded') delete_load. That's a
-- TOCTOU window: if complete_load committed status='loaded' but its response
-- was lost to a network drop, the client can still think the load is active,
-- and a "Back to Planner" would blind-delete a genuinely completed load. The
-- client guard narrowed but did not close the race, and the decision lived on
-- the client, not the server.
--
-- Fix: a dedicated RPC that deletes ONLY while the row is still 'planned' and
-- owned by the caller, made atomic with SELECT ... FOR UPDATE. The row lock
-- means any concurrent complete_load blocks until this transaction finishes:
--   * if completion already committed, we read 'loaded' and keep the load;
--   * if not, completion waits behind our lock and only runs after we've
--     deleted the planned row (then finds nothing, which it already handles).
-- A completed load can therefore never be destroyed by a cancel, regardless
-- of timing. Children deleted first, so this is correct with or without an
-- ON DELETE CASCADE on load_lines.
--
-- delete_load (used by "My Loads" to remove a load the driver can see,
-- including completed ones on purpose) is intentionally left unchanged -- it
-- is a deliberate user action on a visible row, not the in-flight cancel path.
-- Returns true iff a planned load was actually cancelled.

CREATE OR REPLACE FUNCTION public.cancel_planned_load(p_load_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Row lock: a concurrent complete_load on this load blocks here until we
  -- commit, so the status we read cannot change under us.
  SELECT status INTO v_status
    FROM public.load_log
   WHERE load_id = p_load_id
     AND user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;  -- not owned by caller / already gone
  END IF;

  IF v_status IS DISTINCT FROM 'planned' THEN
    RETURN false;  -- already loaded (or any non-planned state) -- keep it
  END IF;

  DELETE FROM public.load_lines WHERE load_id = p_load_id;
  DELETE FROM public.load_log  WHERE load_id = p_load_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_planned_load(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_planned_load(uuid) TO authenticated, service_role;
