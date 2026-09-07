-- F-C (audit pass 1): user_companies has no unique constraint on
-- (user_id, company_id) -- both demo users had TWO identical membership rows.
-- Duplicates inflate roster/member counts and can double-fire membership
-- logic. Dedupe (keep the strongest-role / earliest row per pair) then add the
-- constraint. Runs as the migration role, unaffected by the client DELETE
-- revoke from 20260907060000.

delete from public.user_companies uc
where uc.ctid <> (
  select uc2.ctid
  from public.user_companies uc2
  where uc2.user_id = uc.user_id and uc2.company_id = uc.company_id
  order by case uc2.role
             when 'owner' then 0 when 'admin' then 1
             when 'lead' then 2 when 'dispatch' then 3 else 4 end,
           uc2.created_at
  limit 1
);

alter table public.user_companies
  add constraint user_companies_user_company_uniq unique (user_id, company_id);
