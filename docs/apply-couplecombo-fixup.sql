-- ============================================================================
-- Pre-audit remediation FIX-UP: harden the correct couple_combo overload
-- ============================================================================
-- 20260907000000 hardened couple_combo(uuid,uuid,numeric,numeric,numeric) --
-- but that 5-arg overload had been DROPPED by 20260720000000, which replaced it
-- with a 6-arg version carrying `p_force`. The client calls the 6-arg. So the
-- first pass (a) RE-CREATED the 5-arg, reintroducing the exact
-- "could not choose the best candidate function" (PGRST203) ambiguity that
-- 20260720000000 deliberately removed, and (b) left the actually-live 6-arg
-- overload UNprotected. The 6-arg is in fact the worse hole: under p_force it
-- deactivates any active combo holding the truck OR trailer *by id* and
-- re-stamps them into the caller's active company, with no ownership check --
-- i.e. it can forcibly steal another company's already-coupled equipment.
--
-- This migration:
--   1. Drops the errant 5-arg overload the first pass created.
--   2. Re-defines the 6-arg overload with the company-ownership check: the
--      truck AND trailer must both belong to the caller's active company.
--      All other behavior (p_force deactivation, historical-combo reuse,
--      get_active_company_id, tare/target handling) is preserved verbatim.
-- Idempotent and safe to re-run.
-- ============================================================================

-- 1) Remove the 5-arg overload re-created by 20260907000000 (restores the
--    single-client-overload state 20260720000000 intended; no client uses it).
drop function if exists public.couple_combo(uuid, uuid, numeric, numeric, numeric);

-- 2) Harden the live 6-arg (p_force) overload.
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
  v_truck_co     uuid;
  v_trailer_co   uuid;
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

  -- AUTHORIZATION: the truck AND trailer being coupled must both belong to the
  -- caller's active company. Without this, a caller could force-couple (and,
  -- under p_force, forcibly decouple) another company's equipment by id.
  -- Generic error whether the piece is missing or foreign -- no existence oracle.
  SELECT company_id INTO v_truck_co   FROM public.trucks   WHERE truck_id   = p_truck_id;
  SELECT company_id INTO v_trailer_co FROM public.trailers WHERE trailer_id = p_trailer_id;
  IF v_truck_co IS NULL OR v_trailer_co IS NULL
     OR v_truck_co <> v_company_id
     OR v_trailer_co <> v_company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Release any combo the user currently holds
  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = auth.uid()
     AND active     = true;

  IF p_force THEN
    UPDATE public.equipment_combos
       SET active     = false,
           claimed_by = NULL,
           claimed_at = NULL
     WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
       AND active = true;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.equipment_combos
       WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
         AND active = true
    ) THEN
      RAISE EXCEPTION 'One or both pieces of equipment are already coupled';
    END IF;
  END IF;

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
