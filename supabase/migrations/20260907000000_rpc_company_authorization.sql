-- ============================================================================
-- Pre-audit remediation: company-ownership authorization for equipment RPCs
-- ============================================================================
-- Every function below is SECURITY DEFINER and therefore bypasses RLS. Before
-- this migration each one verified only authentication + row existence/active
-- status, never that the caller's company actually owns the combo/truck/
-- trailer it was handed. A caller who knew (or guessed) another company's UUIDs
-- could claim, couple, begin loads against, or decouple that company's
-- equipment -- proven live for begin_load and claim_combo against two isolated
-- demo companies (2026-09-06 pre-audit pentest).
--
-- The fix: each function now independently resolves the owning company of every
-- caller-supplied id and confirms auth.uid() is a member of it, raising a
-- single generic 'Not authorized' that does not distinguish "does not exist"
-- from "not yours" (no existence oracle). RLS is NOT relied on -- these run as
-- definer. All other behavior (release-current-claim, historical-combo reuse,
-- force recouple, status writes, decouple_events, load insertion) is preserved
-- verbatim from the pre-fix bodies.
--
-- Membership (any role) is the authorization boundary, matching the pre-fix
-- functions which never role-gated coupling/claiming -- a plain driver
-- legitimately claims and couples their OWN company's equipment. Cross-company
-- is the only thing being closed.
-- ============================================================================

-- ── Reusable authorization helpers ─────────────────────────────────────────

-- True iff auth.uid() is a member of p_company_id. STABLE + definer so it can
-- be called from other definer functions and read user_companies regardless of
-- the caller's own RLS view.
create or replace function public._caller_in_company(p_company_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $$
  select p_company_id is not null
     and auth.uid() is not null
     and exists (
       select 1 from public.user_companies
        where user_id = auth.uid()
          and company_id = p_company_id
     );
$$;

-- Company that owns a combo (null if the combo does not exist).
create or replace function public._combo_company(p_combo_id uuid)
returns uuid
language sql
security definer
set search_path to 'public'
stable
as $$
  select company_id from public.equipment_combos where combo_id = p_combo_id;
$$;

revoke all on function public._caller_in_company(uuid) from public, anon, authenticated;
revoke all on function public._combo_company(uuid)     from public, anon, authenticated;

-- ── begin_load(payload) ────────────────────────────────────────────────────
-- Adds: caller must be a member of the combo's company. Body otherwise verbatim.
create or replace function public.begin_load(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_load_id     uuid;
  v_combo       record;
  v_lines_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF (payload ? 'combo_id') IS FALSE OR (payload ? 'terminal_id') IS FALSE THEN
    RAISE EXCEPTION 'Missing combo_id or terminal_id';
  END IF;

  SELECT combo_id, tare_lbs, target_weight, active, company_id
    INTO v_combo
    FROM public.equipment_combos
   WHERE combo_id = (payload->>'combo_id')::uuid;

  -- AUTHORIZATION: the combo must belong to a company the caller is in.
  -- Generic error whether the combo is missing or foreign -- no existence oracle.
  IF v_combo.combo_id IS NULL OR NOT public._caller_in_company(v_combo.company_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_combo.active IS NOT TRUE THEN RAISE EXCEPTION 'Equipment combo is not active'; END IF;

  INSERT INTO public.load_log (
    user_id, combo_id, terminal_id, state_code, city_id,
    cg_bias, ambient_temp_f, product_temp_f, planned_snapshot,
    tare_lbs, gross_limit_lbs, buffer_lbs,
    planned_total_gal, planned_total_lbs, planned_gross_lbs,
    status, started_at
  ) VALUES (
    v_user_id,
    (payload->>'combo_id')::uuid,
    (payload->>'terminal_id')::uuid,
    NULLIF(payload->>'state_code', ''),
    CASE WHEN payload ? 'city_id' THEN (payload->>'city_id')::uuid ELSE NULL END,
    CASE WHEN payload ? 'cg_bias'        THEN (payload->>'cg_bias')::numeric        ELSE NULL END,
    CASE WHEN payload ? 'ambient_temp_f' THEN (payload->>'ambient_temp_f')::numeric ELSE NULL END,
    CASE WHEN payload ? 'product_temp_f' THEN (payload->>'product_temp_f')::numeric ELSE NULL END,
    payload->'planned_snapshot',
    v_combo.tare_lbs,
    v_combo.target_weight,
    0,
    (payload->'planned_totals'->>'planned_total_gal')::numeric,
    (payload->'planned_totals'->>'planned_total_lbs')::numeric,
    (payload->'planned_totals'->>'planned_gross_lbs')::numeric,
    'planned',
    now()
  ) RETURNING load_id INTO v_load_id;

  INSERT INTO public.load_lines (
    load_id, comp_number, product_id, planned_gallons, planned_lbs, temp_f
  )
  SELECT
    v_load_id,
    (x->>'comp_number')::int,
    (x->>'product_id')::uuid,
    CASE WHEN x ? 'planned_gallons' THEN (x->>'planned_gallons')::numeric ELSE NULL END,
    CASE WHEN x ? 'planned_lbs'     THEN (x->>'planned_lbs')::numeric     ELSE NULL END,
    CASE WHEN x ? 'temp_f'          THEN (x->>'temp_f')::numeric          ELSE NULL END
  FROM jsonb_array_elements(COALESCE(payload->'lines', '[]'::jsonb)) x;

  GET DIAGNOSTICS v_lines_count = ROW_COUNT;

  RETURN jsonb_build_object('load_id', v_load_id, 'lines_inserted', v_lines_count);
END;
$function$;

-- ── claim_combo(p_combo_id) ────────────────────────────────────────────────
create or replace function public.claim_combo(p_combo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT company_id INTO v_company_id
    FROM public.equipment_combos
   WHERE combo_id = p_combo_id AND active = true;

  -- AUTHORIZATION: combo exists, active, and owned by the caller's company.
  IF v_company_id IS NULL OR NOT public._caller_in_company(v_company_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.equipment_combos
     SET claimed_by = NULL, claimed_at = NULL
   WHERE claimed_by = auth.uid() AND active = true;

  UPDATE public.equipment_combos
     SET claimed_by = auth.uid(), claimed_at = now()
   WHERE combo_id = p_combo_id;

  RETURN jsonb_build_object('combo_id', p_combo_id, 'claimed_by', auth.uid());
END;
$function$;

-- ── slip_seat_combo(p_combo_id) ────────────────────────────────────────────
create or replace function public.slip_seat_combo(p_combo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_prev_claimed_by uuid;
  v_company_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT claimed_by, company_id
    INTO v_prev_claimed_by, v_company_id
    FROM public.equipment_combos
   WHERE combo_id = p_combo_id AND active = true;

  -- AUTHORIZATION: combo exists, active, owned by the caller's company.
  IF v_company_id IS NULL OR NOT public._caller_in_company(v_company_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_prev_claimed_by = auth.uid() THEN
    RAISE EXCEPTION 'You already have this equipment selected';
  END IF;

  UPDATE public.equipment_combos
     SET claimed_by = NULL, claimed_at = NULL
   WHERE claimed_by = auth.uid() AND active = true;

  UPDATE public.equipment_combos
     SET claimed_by = auth.uid(), claimed_at = now()
   WHERE combo_id = p_combo_id;

  RETURN jsonb_build_object(
    'combo_id', p_combo_id,
    'new_claimed_by', auth.uid(),
    'prev_claimed_by', v_prev_claimed_by
  );
END;
$function$;

-- ── couple_combo(truck, trailer, tare, target, buffer) 5-arg client overload ─
-- Adds: both pieces of equipment must belong to the SAME company, and the
-- caller must be a member of it. The new combo is stamped with that company
-- (derived from the equipment, never a client-supplied or arbitrary-first
-- membership). Historical-combo reuse and the tare/target logic are preserved.
create or replace function public.couple_combo(
  p_truck_id uuid, p_trailer_id uuid,
  p_tare_lbs numeric default null, p_target_weight numeric default null,
  p_buffer_lbs numeric default null
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT company_id INTO v_truck_co   FROM public.trucks   WHERE truck_id   = p_truck_id;
  SELECT company_id INTO v_trailer_co FROM public.trailers WHERE trailer_id = p_trailer_id;

  -- AUTHORIZATION: both exist, belong to the same company, and the caller is
  -- a member of it. Generic error for missing/foreign/mismatched -- no oracle.
  IF v_truck_co IS NULL OR v_trailer_co IS NULL
     OR v_truck_co <> v_trailer_co
     OR NOT public._caller_in_company(v_truck_co) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  v_company_id := v_truck_co;

  UPDATE public.equipment_combos
     SET claimed_by = NULL, claimed_at = NULL
   WHERE claimed_by = auth.uid() AND active = true;

  IF EXISTS (
    SELECT 1 FROM public.equipment_combos
     WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id) AND active = true
  ) THEN
    RAISE EXCEPTION 'One or both pieces of equipment are already coupled';
  END IF;

  SELECT combo_id, tare_lbs
    INTO v_combo_id, v_tare_lbs
    FROM public.equipment_combos
   WHERE truck_id = p_truck_id AND trailer_id = p_trailer_id AND active = false
   ORDER BY claimed_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.equipment_combos
       SET active = true, claimed_by = auth.uid(), claimed_at = now(),
           company_id = v_company_id,
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
      combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight,
      active, claimed_by, claimed_at, company_id
    ) VALUES (
      v_combo_id, COALESCE(v_truck_name,'') || ' / ' || COALESCE(v_trailer_name,''),
      p_truck_id, p_trailer_id, p_tare_lbs, COALESCE(p_target_weight, 80000),
      true, auth.uid(), now(), v_company_id
    );
    v_created := true;
  END IF;

  RETURN jsonb_build_object('combo_id', v_combo_id, 'tare_lbs', v_tare_lbs, 'created', v_created);
END;
$function$;

-- ── create_combo(...) ──────────────────────────────────────────────────────
-- No client caller today, but live-callable. Add the same ownership check,
-- stamp the derived company_id (previously left NULL), and pin search_path.
create or replace function public.create_combo(
  p_truck_id uuid, p_trailer_id uuid, p_tare_lbs numeric,
  p_gross_limit_lbs numeric, p_buffer_lbs numeric default 0
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_combo_id    uuid;
  v_combo_name  text;
  v_existing_id uuid;
  v_truck_co    uuid;
  v_trailer_co  uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT company_id INTO v_truck_co   FROM public.trucks   WHERE truck_id   = p_truck_id;
  SELECT company_id INTO v_trailer_co FROM public.trailers WHERE trailer_id = p_trailer_id;
  IF v_truck_co IS NULL OR v_trailer_co IS NULL
     OR v_truck_co <> v_trailer_co
     OR NOT public._caller_in_company(v_truck_co) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_tare_lbs <= 0 THEN RAISE EXCEPTION 'tare_lbs must be positive'; END IF;
  IF p_gross_limit_lbs <= p_tare_lbs THEN
    RAISE EXCEPTION 'gross_limit_lbs must be greater than tare_lbs';
  END IF;

  SELECT combo_id INTO v_existing_id
    FROM public.equipment_combos
   WHERE truck_id = p_truck_id AND trailer_id = p_trailer_id AND active = true
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object('combo_id', v_existing_id, 'created', false);
  END IF;

  v_combo_name := substring(p_truck_id::text,1,8) || ' / ' || substring(p_trailer_id::text,1,8);

  INSERT INTO public.equipment_combos (
    combo_id, combo_name, truck_id, trailer_id,
    tare_lbs, gross_limit_lbs, buffer_lbs, active, company_id
  ) VALUES (
    gen_random_uuid(), v_combo_name, p_truck_id, p_trailer_id,
    p_tare_lbs, p_gross_limit_lbs, p_buffer_lbs, true, v_truck_co
  ) RETURNING combo_id INTO v_combo_id;

  RETURN json_build_object('combo_id', v_combo_id, 'created', true);
END;
$function$;

-- ── decouple_combo(p_combo_id uuid) short overload ─────────────────────────
-- DROP first: the live return type differs from this definition, and
-- CREATE OR REPLACE cannot change a function's return type.
drop function if exists public.decouple_combo(uuid);
create or replace function public.decouple_combo(p_combo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_truck_id   uuid;
  v_trailer_id uuid;
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- AUTHORIZATION before mutating: the combo must be owned by the caller's company.
  SELECT company_id INTO v_company_id
    FROM public.equipment_combos WHERE combo_id = p_combo_id AND active = true;
  IF v_company_id IS NULL OR NOT public._caller_in_company(v_company_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.equipment_combos
     SET active = false
   WHERE combo_id = p_combo_id AND active = true
  RETURNING truck_id, trailer_id INTO v_truck_id, v_trailer_id;

  RETURN jsonb_build_object('combo_id', p_combo_id, 'truck_id', v_truck_id, 'trailer_id', v_trailer_id);
END;
$function$;

-- ── decouple_combo(text, 12-arg) client overload ───────────────────────────
-- Adds the ownership check AND a pinned search_path (the pre-fix definition
-- had none). Body otherwise verbatim. DROP first in case the live return
-- type differs from this definition (CREATE OR REPLACE cannot change it).
drop function if exists public.decouple_combo(
  text, text, text, text, double precision, double precision, text,
  text, text, double precision, double precision, text);
create or replace function public.decouple_combo(
  p_combo_id text, p_scenario text, p_truck_status text,
  p_truck_location text default null, p_truck_lat double precision default null,
  p_truck_lon double precision default null, p_truck_notes text default null,
  p_trailer_status text default 'PARK', p_trailer_location text default null,
  p_trailer_lat double precision default null, p_trailer_lon double precision default null,
  p_trailer_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_truck_id    text;
  v_trailer_id  text;
  v_user_id     uuid := auth.uid();
  v_company_id  uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- AUTHORIZATION: resolve the combo's company and confirm membership before
  -- deactivating it or writing any truck/trailer status.
  SELECT truck_id::text, trailer_id::text, company_id
    INTO v_truck_id, v_trailer_id, v_company_id
    FROM equipment_combos
   WHERE combo_id = p_combo_id::uuid AND active = true;

  IF v_company_id IS NULL OR NOT public._caller_in_company(v_company_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE equipment_combos
     SET active = false, claimed_by = NULL, claimed_at = NULL
   WHERE combo_id = p_combo_id::uuid;

  UPDATE trucks
     SET status_code = p_truck_status, status_location = p_truck_location,
         status_lat = p_truck_lat, status_lon = p_truck_lon,
         status_notes = p_truck_notes, status_updated_at = now()
   WHERE truck_id = v_truck_id::uuid;

  UPDATE trailers
     SET status_code = p_trailer_status, status_location = p_trailer_location,
         status_lat = p_trailer_lat, status_lon = p_trailer_lon,
         status_notes = p_trailer_notes, status_updated_at = now()
   WHERE trailer_id = v_trailer_id::uuid;

  INSERT INTO decouple_events (
    combo_id, truck_id, trailer_id, user_id, scenario,
    truck_status, truck_location, truck_lat, truck_lon, truck_notes,
    trailer_status, trailer_location, trailer_lat, trailer_lon, trailer_notes
  ) VALUES (
    p_combo_id, v_truck_id, v_trailer_id, v_user_id, p_scenario,
    p_truck_status, p_truck_location, p_truck_lat, p_truck_lon, p_truck_notes,
    p_trailer_status, p_trailer_location, p_trailer_lat, p_trailer_lon, p_trailer_notes
  );

  RETURN jsonb_build_object('ok', true, 'truck_id', v_truck_id,
    'trailer_id', v_trailer_id, 'scenario', p_scenario);
END;
$function$;

-- Dropping a function removes its privileges, so re-grant EXECUTE on the two
-- decouple overloads that were dropped above (the CREATE OR REPLACE functions
-- kept their existing grants and need no re-grant).
grant execute on function public.decouple_combo(uuid) to authenticated, service_role;
grant execute on function public.decouple_combo(
  text, text, text, text, double precision, double precision, text,
  text, text, double precision, double precision, text) to authenticated, service_role;
