-- The Equipment Settings redesign's whole point is to make swapping which
-- trailer goes with which truck trivial -- tap a different trailer card and
-- it just re-pairs. couple_combo() previously hard-rejected that with "One
-- or both pieces of equipment are already coupled", which was correct for
-- the fleet Browse-Fleet-and-Couple flow (silently stealing someone else's
-- active pairing would be a real bug there) but wrong for this screen.
--
-- Adds p_force: when true, any conflicting active combo(s) are deactivated
-- first (same simple deactivation as decouple_combo(uuid): active=false,
-- claimed_by/claimed_at cleared -- NOT the heavier decouple_combo(text, ...)
-- overload, which runs the full status-update/audit-log "stud" workflow
-- this new screen exists to replace). Defaults to false, so the existing
-- fleet Couple flow (FleetModal) is completely unaffected.

-- CREATE OR REPLACE with an added parameter creates a new overload rather
-- than replacing the existing signature -- drop the old one explicitly so
-- callers that omit p_force can't hit "could not choose the best candidate
-- function" ambiguity between two overlapping optional-arg signatures.
drop function if exists public.couple_combo(uuid, uuid, numeric, numeric, numeric);

create or replace function public.couple_combo(
  p_truck_id uuid,
  p_trailer_id uuid,
  p_tare_lbs numeric default null,
  p_target_weight numeric default null,
  p_buffer_lbs numeric default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_combo_id     uuid;
  v_tare_lbs     numeric;
  v_created      boolean := false;
  v_company_id   uuid;
  v_truck_name   text;
  v_trailer_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use active company (not just first membership)
  v_company_id := get_active_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company set. Please select a company first.';
  END IF;

  -- Release any combo the user currently holds
  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = auth.uid()
     AND active     = true;

  IF p_force THEN
    -- Deactivate whatever combo(s) currently hold this truck or trailer,
    -- preserving them as history (same as decouple_combo(uuid)'s simple
    -- deactivation) rather than raising.
    UPDATE public.equipment_combos
       SET active     = false,
           claimed_by = NULL,
           claimed_at = NULL
     WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
       AND active = true;
  ELSE
    -- Guard: reject if either piece is already in an active combo
    IF EXISTS (
      SELECT 1 FROM public.equipment_combos
       WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
         AND active = true
    ) THEN
      RAISE EXCEPTION 'One or both pieces of equipment are already coupled';
    END IF;
  END IF;

  -- Look for most-recent historical (inactive) combo for this exact pair
  SELECT combo_id, tare_lbs
    INTO v_combo_id, v_tare_lbs
    FROM public.equipment_combos
   WHERE truck_id   = p_truck_id
     AND trailer_id = p_trailer_id
     AND active     = false
   ORDER BY claimed_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.equipment_combos
       SET active        = true,
           claimed_by    = auth.uid(),
           claimed_at    = now(),
           company_id    = v_company_id,
           target_weight = COALESCE(p_target_weight, target_weight)
     WHERE combo_id = v_combo_id;
  ELSE
    IF p_tare_lbs IS NULL OR p_tare_lbs <= 0 THEN
      RAISE EXCEPTION 'No historical combo found. Please provide a tare weight.';
    END IF;

    SELECT truck_name   INTO v_truck_name   FROM public.trucks   WHERE truck_id   = p_truck_id;
    SELECT trailer_name INTO v_trailer_name FROM public.trailers WHERE trailer_id = p_trailer_id;

    v_combo_id := gen_random_uuid();
    v_tare_lbs := p_tare_lbs;

    INSERT INTO public.equipment_combos (
      combo_id, combo_name, truck_id, trailer_id,
      tare_lbs, target_weight,
      active, claimed_by, claimed_at, company_id
    ) VALUES (
      v_combo_id,
      COALESCE(v_truck_name, '') || ' / ' || COALESCE(v_trailer_name, ''),
      p_truck_id,
      p_trailer_id,
      p_tare_lbs,
      COALESCE(p_target_weight, 80000),
      true,
      auth.uid(),
      now(),
      v_company_id
    );

    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$;
