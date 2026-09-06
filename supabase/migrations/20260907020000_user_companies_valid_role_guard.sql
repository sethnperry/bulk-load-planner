-- ============================================================================
-- Pre-audit remediation: constrain user_companies.role to the known role set
-- ============================================================================
-- Finding (2026-09-06 pentest, item #8): a plain driver CANNOT change roles
-- (the user_companies UPDATE policy is is_company_admin-gated -- verified: the
-- moment a member's role is not owner/admin it can no longer self-update), so
-- there is no cross-role privilege ESCALATION path for a non-admin. But an
-- existing company admin -- legitimately allowed to reassign roles -- could
-- write an ARBITRARY role string (e.g. 'superadmin'), which (a) is meaningless
-- to the app's Role union ("driver"|"lead"|"admin"|"dispatch") and (b) fails
-- is_company_admin()/is_company_staff(), so it silently strips the member of
-- the very admin rights needed to undo it -- a self-inflicted lockout, with no
-- non-service-role way back.
--
-- This guard rejects any write that sets role outside the known set. It is a
-- BEFORE INSERT OR UPDATE trigger (not a CHECK constraint) deliberately: a
-- trigger validates only rows being written, so it applies cleanly to live
-- even while a pre-existing invalid row exists, and that bad row is corrected
-- by the ordinary recovery UPDATE (which sets a valid role and thus passes).
--
-- 'owner' is included: is_company_admin()/is_company_staff() both treat it as a
-- real role even though the app UI only offers driver/lead/dispatch/admin.
-- ============================================================================

create or replace function public.enforce_valid_user_company_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.role is null or new.role not in ('owner','admin','lead','dispatch','driver') then
    raise exception 'Invalid role: %', coalesce(new.role, '<null>')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_valid_user_company_role on public.user_companies;
create trigger trg_enforce_valid_user_company_role
  before insert or update on public.user_companies
  for each row execute function public.enforce_valid_user_company_role();
