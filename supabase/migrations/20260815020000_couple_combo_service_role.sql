-- Adds a service-role-only overload of couple_combo, mirroring the existing
-- claim_combo(p_combo_id, p_user_id) pattern -- needed so admin full-app
-- impersonation ("Use app as {driver}", 2026-08-04) can actually couple
-- equipment on the TARGET driver's behalf, not the real admin's own
-- auth.uid(). Root cause of "won't allow me to select equipment" while
-- impersonating: SoloEquipmentModal.tsx (which this demo company routes
-- into, since it's flagged is_solo=true despite having multiple real
-- members -- see CLAUDE.md's 2026-08-06 finding) calls couple_combo
-- directly via the browser's own session, which only ever has ONE
-- overload, hardcoded to auth.uid() throughout, unlike claim_combo which
-- already had a service-role variant for exactly this. That claim landed
-- on the real admin's own account, so useEquipment.ts's setup-mode
-- selectedComboId derivation (only shows combos claimed_by the target
-- user) immediately reverted the selection back to empty.
--
-- Body is a verbatim copy of the existing single-overload couple_combo,
-- with every auth.uid() replaced by p_user_id and the active-company
-- resolution inlined to match get_active_company_id()'s own logic exactly
-- (that function itself can't be reused as-is since it's hardcoded to
-- auth.uid(), not an arbitrary target user).

create or replace function public.couple_combo(
  p_truck_id uuid,
  p_trailer_id uuid,
  p_user_id uuid,
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
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Mirrors get_active_company_id()'s own COALESCE(active_company_id, oldest membership)
  -- logic exactly, just resolved for p_user_id instead of auth.uid().
  SELECT COALESCE(
    (SELECT active_company_id FROM public.user_settings WHERE user_id = p_user_id AND active_company_id IS NOT NULL),
    (SELECT company_id FROM public.user_companies WHERE user_id = p_user_id ORDER BY created_at LIMIT 1)
  ) INTO v_company_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company set. Please select a company first.';
  END IF;

  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = p_user_id
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
           claimed_by    = p_user_id,
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
      p_user_id,
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
