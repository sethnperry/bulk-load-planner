-- Solo-tier company provisioning. Lets a self-signup driver (organic
-- /login magic link, no invite) land in the calculator with their own
-- writable equipment list instead of being stuck with no company.
--
-- companies.is_solo distinguishes a solo company from a real fleet --
-- role alone (`admin`) is not the right signal for that, since solo
-- users are deliberately given role = 'admin' rather than a new 'owner'
-- role, to avoid auditing every role === "admin" || "lead" check in the
-- app. owner_user_id is unique/nullable, enforcing at most one solo
-- company per user.
--
-- provision_solo_company() is idempotent: any existing user_companies
-- membership (solo, invited, or admin-assigned) is left untouched and its
-- oldest company_id is returned, so it's safe to call unconditionally from
-- both app/auth/callback/CallbackClient.tsx and app/auth/confirm/page.tsx
-- right before landing in the app.

alter table public.companies
  add column if not exists is_solo boolean not null default false,
  add column if not exists owner_user_id uuid unique references auth.users(id);

create or replace function public.provision_solo_company()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id      uuid := auth.uid();
  v_existing_id  uuid;
  v_company_id   uuid;
  v_name_seed    text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Idempotent: any existing membership (solo, invited, admin-assigned) means
  -- there's nothing to provision. Return their oldest membership's company_id
  -- so callers can always trust the return value as "their active-ish company".
  select company_id into v_existing_id
  from public.user_companies
  where user_id = v_user_id
  order by created_at
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  -- Hidden display name -- never surfaced as "your company" in solo-tier UI,
  -- but companies.company_name is NOT NULL, so it needs something reasonable
  -- in case it ever leaks into an admin/support view.
  select coalesce(p.display_name, split_part(au.email, '@', 1))
    into v_name_seed
  from auth.users au
  left join public.profiles p on p.user_id = au.id
  where au.id = v_user_id;

  insert into public.companies (company_name, is_solo, owner_user_id)
  values (coalesce(v_name_seed, 'Driver') || '''s Equipment', true, v_user_id)
  returning company_id into v_company_id;

  insert into public.user_companies (user_id, company_id, role, created_at)
  values (v_user_id, v_company_id, 'admin', now());

  insert into public.user_settings (user_id, active_company_id, updated_at)
  values (v_user_id, v_company_id, now())
  on conflict (user_id) do update
    set active_company_id = coalesce(public.user_settings.active_company_id, excluded.active_company_id),
        updated_at = now();

  return v_company_id;
end;
$function$;
