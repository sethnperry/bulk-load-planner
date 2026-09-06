-- Restore the demo Alpha account's Company A membership, deleted during the
-- 2026-09-06 user_companies CRUD test (a user CAN delete their own membership;
-- no_direct_insert then blocks re-adding via the client, so this needs the
-- service role). Idempotent -- adds the admin membership only if absent.
insert into public.user_companies (user_id, company_id, role, created_at)
select '605375f1-f4c1-4be0-9cf0-86827906393d',
       '1391e05e-27f1-44d3-85ae-c416b472b183',
       'admin', now()
where not exists (
  select 1 from public.user_companies
   where user_id = '605375f1-f4c1-4be0-9cf0-86827906393d'
     and company_id = '1391e05e-27f1-44d3-85ae-c416b472b183'
);
