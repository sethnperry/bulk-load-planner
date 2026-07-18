-- Super-admin "Companies" help-desk tool: lets an existing super_admin (see
-- is_super_admin(), already live) view and edit any company. The companies
-- table currently has SELECT-only RLS (companies_select_member_or_super /
-- "company members can read") and no write policies at all, so a
-- SECURITY DEFINER RPC is used instead of opening a raw UPDATE policy --
-- matching the existing pattern (delete_truck, couple_combo,
-- provision_solo_company are all SECURITY DEFINER RPCs, not RLS writes).

create or replace function public.super_admin_update_company(
  p_company_id uuid,
  p_company_name text,
  p_is_solo boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;

  update public.companies
  set company_name = p_company_name,
      is_solo = p_is_solo
  where company_id = p_company_id;

  if not found then
    raise exception 'Company not found: %', p_company_id;
  end if;
end;
$$;
