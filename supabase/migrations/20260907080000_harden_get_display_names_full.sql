-- R3 (pre-launch audit): get_display_names_full is SECURITY DEFINER and
-- returned PII (display_name, hire_date, division, region, local_area,
-- employee_number) for ANY user_ids passed, with no authorization check --
-- so any authenticated user could enumerate every user's PII across every
-- company by passing their ids. Confirmed live 2026-09-07 via
-- pg_get_functiondef.
--
-- Fix: keep the identical signature + return shape, add a WHERE gate so a
-- row is returned only when the caller is a super admin, is looking up their
-- own row, or shares at least one company with the target user. Unauthorized
-- ids silently return no row -- callers map results by id and already render
-- a missing id as "Unknown", so legitimate same-company lookups (admin
-- roster, Dispatch, fleet views) are unaffected while cross-company
-- enumeration returns nothing.
--
-- Also pins search_path (SECURITY DEFINER hardening) and fully-qualifies
-- every reference so the definer body can't be redirected by a caller's
-- search_path.

CREATE OR REPLACE FUNCTION public.get_display_names_full(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, display_name text, hire_date date, division text, region text, local_area text, employee_number text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT p.user_id, p.display_name, p.hire_date, p.division, p.region, p.local_area, p.employee_number
  FROM public.profiles p
  WHERE p.user_id = ANY(p_user_ids)
    AND (
      public.is_super_admin()
      OR p.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_companies uc_self
        JOIN public.user_companies uc_target
          ON uc_target.company_id = uc_self.company_id
        WHERE uc_self.user_id = auth.uid()
          AND uc_target.user_id = p.user_id
      )
    );
$function$;
