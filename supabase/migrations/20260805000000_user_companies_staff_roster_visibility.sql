-- Fixes a real, confirmed bug: the live SELECT policy on user_companies
-- (`user_companies_select_own_or_super`, confirmed via a live pg_policies
-- query 2026-08-05) is `is_super_admin() OR user_id = auth.uid()` -- there
-- is NO carve-out for a company admin/lead/dispatch to read *other*
-- members' rows in their own company.
--
-- Three client call sites assumed this worked and do a raw
-- `.select("user_id, role").eq("company_id", cid)` for the whole company's
-- roster: app/admin/page.tsx (member roster), app/admin/FleetCardsModal.tsx
-- (per-terminal driver list), app/calculator/lead/DriverAssignmentModal.tsx
-- (driver picker). For any non-super-admin, all three silently collapse to
-- "just my own row" once a company has more than one member -- this was
-- invisible all session because the only test company available has
-- exactly one member (the caller), so `user_id = auth.uid()` alone already
-- returned the full (1-row) result set.
--
-- Fix mirrors the existing `is_company_admin(p_company_id)` pattern (used
-- safely today by the UPDATE/DELETE policies on this same table) rather
-- than an inline `role in (...)` check in the policy itself, which would
-- self-reference user_companies under RLS evaluation and risk recursion.
-- SECURITY DEFINER sidesteps that the same way is_company_admin() does.
--
-- Deliberately admin+lead+dispatch, not admin-only -- lead needs the
-- roster for Driver Assignment (Lead tab), dispatch needs it for Fleet
-- Cards (both admin+dispatch per the Fleet Tier permission matrix). Plain
-- drivers are NOT included -- they keep exactly the access the existing
-- self-row policy already gives them, nothing more.
--
-- Purely additive: a new PERMISSIVE policy OR's with the existing
-- `user_companies_select_own_or_super` policy, which is left untouched.
--
-- NOT applied automatically -- no live DB write access this session. Run
-- manually in the Supabase SQL editor.

create or replace function public.is_company_staff(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_super_admin() then
    return true;
  end if;

  return exists (
    select 1
    from public.user_companies uc
    where uc.user_id = auth.uid()
      and uc.company_id = p_company_id
      and coalesce(uc.role,'') in ('owner','admin','lead','dispatch')
  );
end;
$function$;

create policy user_companies_select_company_staff on public.user_companies
  for select using (
    public.is_company_staff(company_id)
  );
