-- F-G / F-H (audit pass 1): three SECURITY DEFINER functions verified the
-- CALLER is an admin of p_company_id but never that the TARGET (p_user_id)
-- is actually a member of it. Because they write by user_id, an admin of any
-- company could act on arbitrary users:
--   * upsert_driver_profile [MEDIUM] -- profiles is keyed by user_id alone
--     (global), so an admin could overwrite ANY user's profile PII
--     (display_name, employee_number, hire_date), including users in other
--     companies. Also had no pinned search_path.
--   * admin_get_carded / admin_remove_terminal_access [LOW] -- could
--     create/delete terminal_access for arbitrary users. Also no search_path.
--
-- Fix: the admin branch now also requires the target to be a member of
-- p_company_id, and search_path is pinned. Self-branch (p_user_id = auth.uid())
-- is unchanged. Bodies otherwise reproduced verbatim from live.

-- ── admin_get_carded ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_carded(p_user_id uuid, p_terminal_id uuid, p_carded_on date, p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    p_user_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM user_companies WHERE user_id = auth.uid() AND company_id = p_company_id AND role = 'admin')
      AND EXISTS (SELECT 1 FROM user_companies WHERE user_id = p_user_id AND company_id = p_company_id)
    )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO terminal_access (user_id, terminal_id, carded_on)
  VALUES (p_user_id, p_terminal_id, p_carded_on)
  ON CONFLICT (user_id, terminal_id) DO UPDATE SET carded_on = EXCLUDED.carded_on;
END;
$function$;

-- ── admin_remove_terminal_access ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_remove_terminal_access(p_user_id uuid, p_terminal_id uuid, p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    p_user_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM user_companies WHERE user_id = auth.uid() AND company_id = p_company_id AND role = 'admin')
      AND EXISTS (SELECT 1 FROM user_companies WHERE user_id = p_user_id AND company_id = p_company_id)
    )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM terminal_access WHERE user_id = p_user_id AND terminal_id = p_terminal_id;
END;
$function$;

-- ── upsert_driver_profile ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_driver_profile(p_user_id uuid, p_company_id uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lic  jsonb;
  v_med  jsonb;
  v_twic jsonb;
  v_port jsonb;
BEGIN
  IF NOT (
    p_user_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM user_companies WHERE user_id = auth.uid() AND company_id = p_company_id AND role = 'admin')
      AND EXISTS (SELECT 1 FROM user_companies WHERE user_id = p_user_id AND company_id = p_company_id)
    )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO profiles (user_id, display_name, hire_date, division, region, local_area, employee_number)
  VALUES (p_user_id, p_data->>'display_name', NULLIF(p_data->>'hire_date','')::date,
    p_data->>'division', p_data->>'region', p_data->>'local_area', p_data->>'employee_number')
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, hire_date = EXCLUDED.hire_date,
    division = EXCLUDED.division, region = EXCLUDED.region,
    local_area = EXCLUDED.local_area, employee_number = EXCLUDED.employee_number;

  v_lic := p_data->'license';
  IF v_lic IS NOT NULL AND v_lic != 'null'::jsonb THEN
    INSERT INTO driver_licenses (user_id, company_id, license_class, license_number, state_code,
      endorsements, restrictions, issue_date, expiration_date,
      hazmat_linked_to_license, hazmat_issue_date, hazmat_expiration_date, updated_at)
    VALUES (p_user_id, p_company_id,
      v_lic->>'license_class', v_lic->>'license_number', v_lic->>'state_code',
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(v_lic->'endorsements') x), '{}'),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(v_lic->'restrictions') x), '{}'),
      NULLIF(v_lic->>'issue_date','')::date,
      NULLIF(v_lic->>'expiration_date','')::date,
      COALESCE((v_lic->>'hazmat_linked_to_license')::boolean, false),
      NULLIF(v_lic->>'hazmat_issue_date','')::date,
      NULLIF(v_lic->>'hazmat_expiration_date','')::date,
      now())
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      license_class = EXCLUDED.license_class,
      license_number = EXCLUDED.license_number,
      state_code = EXCLUDED.state_code,
      endorsements = EXCLUDED.endorsements,
      restrictions = EXCLUDED.restrictions,
      issue_date = EXCLUDED.issue_date,
      expiration_date = EXCLUDED.expiration_date,
      hazmat_linked_to_license = EXCLUDED.hazmat_linked_to_license,
      hazmat_issue_date = EXCLUDED.hazmat_issue_date,
      hazmat_expiration_date = EXCLUDED.hazmat_expiration_date,
      updated_at = now();
  END IF;

  IF p_data ? 'hazmat_linked_to_license' THEN
    UPDATE driver_licenses
    SET hazmat_linked_to_license = (p_data->>'hazmat_linked_to_license')::boolean
    WHERE user_id = p_user_id AND company_id = p_company_id;
  END IF;

  v_med := p_data->'medical';
  IF v_med IS NOT NULL AND v_med != 'null'::jsonb THEN
    INSERT INTO driver_medical_cards (user_id, company_id, issue_date, expiration_date, examiner_name, attached_to_license, updated_at)
    VALUES (p_user_id, p_company_id,
      NULLIF(v_med->>'issue_date','')::date,
      NULLIF(v_med->>'expiration_date','')::date,
      v_med->>'examiner_name',
      COALESCE((v_med->>'attached_to_license')::boolean, false),
      now())
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      issue_date = EXCLUDED.issue_date,
      expiration_date = EXCLUDED.expiration_date,
      examiner_name = EXCLUDED.examiner_name,
      attached_to_license = EXCLUDED.attached_to_license,
      updated_at = now();
  END IF;

  v_twic := p_data->'twic';
  IF v_twic IS NOT NULL AND v_twic != 'null'::jsonb THEN
    INSERT INTO driver_twic_cards (user_id, company_id, card_number, issue_date, expiration_date, updated_at)
    VALUES (p_user_id, p_company_id, v_twic->>'card_number',
      NULLIF(v_twic->>'issue_date','')::date, NULLIF(v_twic->>'expiration_date','')::date, now())
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      card_number = EXCLUDED.card_number, issue_date = EXCLUDED.issue_date,
      expiration_date = EXCLUDED.expiration_date, updated_at = now();
  END IF;

  IF p_data ? 'port_ids' THEN
    DELETE FROM driver_port_ids WHERE user_id = p_user_id AND company_id = p_company_id;
    FOR v_port IN SELECT * FROM jsonb_array_elements(p_data->'port_ids') LOOP
      INSERT INTO driver_port_ids (user_id, company_id, port_name, expiration_date)
      VALUES (p_user_id, p_company_id, v_port->>'port_name', NULLIF(v_port->>'expiration_date','')::date);
    END LOOP;
  END IF;
END;
$function$;
