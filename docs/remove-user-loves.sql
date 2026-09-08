-- Remove all traces of a user so their email can be reused for a fresh signup.
-- Run in the Supabase SQL editor (service role / postgres -- bypasses RLS).
-- IRREVERSIBLE. Run PART 1 first and confirm it shows the account you expect,
-- THEN run PART 2.
--
-- Safe by construction:
--   * only deletes PERSONAL rows (user_id / driver_id / reporter_user_id) + the
--     auth.users row; it NULLs authorship pointers (created_by/uploaded_by/...)
--     on shared records instead of deleting them.
--   * only deletes a solo company they own IF they are its sole member.
--   * one transaction -- any unexpected FK error rolls the whole thing back.

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1 — VERIFY (read-only). Confirm this is the right account.
-- ────────────────────────────────────────────────────────────────────────────
select
  u.id  as user_id,
  u.email,
  u.created_at,
  (select count(*) from public.load_log      l  where l.user_id  = u.id) as loads,
  (select count(*) from public.user_companies uc where uc.user_id = u.id) as memberships,
  (select count(*) from public.companies c
     where c.owner_user_id = u.id and coalesce(c.is_solo, false))         as solo_companies_owned
from auth.users u
where lower(u.email) = lower('seth.perry@loves.com');


-- ────────────────────────────────────────────────────────────────────────────
-- PART 2 — DELETE. Irreversible. Run only after PART 1 looks right.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_email   text := 'seth.perry@loves.com';
  v_uid     uuid;
  v_company uuid;
  r         record;
  n         bigint;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise notice 'No auth user for % -- nothing to do.', v_email;
    return;
  end if;
  raise notice 'Removing user % (%).', v_email, v_uid;

  -- 1) Per-load children first (they FK to load_log).
  for r in select t from unnest(array[
      'load_lines','load_points','load_utilization','load_capacity_snapshot','load_edit_history'
    ]) as t loop
    if to_regclass('public.'||r.t) is not null then
      execute format(
        'delete from public.%I where load_id in (select load_id from public.load_log where user_id = $1)',
        r.t) using v_uid;
    end if;
  end loop;

  -- 2) Solo companies they OWN and are the SOLE member of -> remove the company
  --    and everything scoped to it. (Never touches a shared fleet.)
  for v_company in
    select c.company_id from public.companies c
    where c.owner_user_id = v_uid
      and coalesce(c.is_solo, false)
      and (select count(*) from public.user_companies uc where uc.company_id = c.company_id) <= 1
  loop
    for r in
      select col.table_name from information_schema.columns col
      join information_schema.tables tb
        on tb.table_schema = col.table_schema and tb.table_name = col.table_name and tb.table_type = 'BASE TABLE'
      where col.table_schema = 'public' and col.column_name = 'company_id'
    loop
      execute format('delete from public.%I where company_id::text = $1', r.table_name) using v_company::text;
    end loop;
    delete from public.companies where company_id = v_company;
    raise notice '  deleted solo company %', v_company;
  end loop;

  -- 3) Release ownership / equipment claims that could block the auth delete.
  update public.companies set owner_user_id = null where owner_user_id = v_uid;
  if to_regclass('public.equipment_combos') is not null then
    update public.equipment_combos set claimed_by = null where claimed_by::text = v_uid::text;
  end if;

  -- 4) Every public table with a PERSONAL-owner column = this user.
  for r in
    select col.table_name, col.column_name
    from information_schema.columns col
    join information_schema.tables tb
      on tb.table_schema = col.table_schema and tb.table_name = col.table_name and tb.table_type = 'BASE TABLE'
    where col.table_schema = 'public'
      and col.column_name in ('user_id','driver_id','reporter_user_id')
  loop
    execute format('delete from public.%I where %I::text = $1', r.table_name, r.column_name) using v_uid::text;
    get diagnostics n = row_count;
    if n > 0 then raise notice '  deleted % row(s) from %(%)', n, r.table_name, r.column_name; end if;
  end loop;

  -- 4b) Release (null) authorship pointers on SHARED records so the auth row can
  --     be deleted without removing company data they happened to author/update.
  for r in
    select col.table_name, col.column_name
    from information_schema.columns col
    join information_schema.tables tb
      on tb.table_schema = col.table_schema and tb.table_name = col.table_name and tb.table_type = 'BASE TABLE'
    where col.table_schema = 'public'
      and col.column_name in ('created_by','uploaded_by','updated_by','last_updated_by','author_id','claimed_by')
      and col.is_nullable = 'YES'
  loop
    execute format('update public.%I set %I = null where %I::text = $1', r.table_name, r.column_name, r.column_name) using v_uid::text;
  end loop;

  -- 5) Finally the auth user -> frees the email (cascades auth.identities/sessions).
  delete from auth.users where id = v_uid;
  raise notice 'DONE: % fully removed; the email is free to reuse.', v_email;
end $$;
