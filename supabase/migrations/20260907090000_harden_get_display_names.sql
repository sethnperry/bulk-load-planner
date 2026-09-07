-- R3 (sibling): get_display_names has the same shape as get_display_names_full
-- -- SECURITY DEFINER, no authorization check -- so any authenticated user
-- could enumerate every user's display name across every company. Lesser than
-- _full (names only, no other PII) but the same cross-company enumeration
-- hole. Confirmed live 2026-09-07 via pg_get_functiondef.
--
-- Same fix as _full: identical signature/return shape, add a WHERE gate
-- (super admin, own row, or shares a company with the caller), pin
-- search_path, fully-qualify references. Verified all five call sites are
-- covered: app/superadmin (owners across companies -> super-admin branch),
-- app/admin roster + EquipmentModal claimants (same company), and the
-- self-lookup (own row).

CREATE OR REPLACE FUNCTION public.get_display_names(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT p.user_id, p.display_name
  FROM public.profiles p
  WHERE p.user_id = ANY(p_user_ids)
    AND p.display_name IS NOT NULL
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
