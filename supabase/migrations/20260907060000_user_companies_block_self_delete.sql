-- ============================================================================
-- R4 FIX: a user could delete their OWN user_companies membership
-- ============================================================================
-- Proven live 2026-09-06: an authenticated user issued a direct DELETE on their
-- own user_companies row and removed themselves from their company. Because
-- user_companies_no_direct_insert blocks client INSERTs, there is no client path
-- back in -- the user is locked out and, for a solo / sole-admin company, the
-- company is orphaned.
--
-- Product decision (operator, 2026-09-07): a driver must NOT be able to remove
-- themselves from a company. Legit member removal already goes through the
-- admin-gated SECURITY DEFINER RPC admin_remove_member (verified live: it
-- rejects a non-admin / cross-company caller with "Admin access required"), so
-- NO direct client DELETE on this table is needed at all.
--
-- Fix: revoke the direct DELETE privilege from the client roles. admin_remove_member
-- runs as its owner (SECURITY DEFINER) and is unaffected, so admins can still
-- remove members. This does not touch joining a new company (that is an INSERT
-- via redeem_invite) or multi-company membership -- a re-hired driver keeps the
-- same account/email and is simply added to the new company.
-- Idempotent.
-- ============================================================================

revoke delete on table public.user_companies from authenticated;
revoke delete on table public.user_companies from anon;

-- Belt-and-suspenders: drop any DELETE policy so the intent is explicit even if
-- the grant is ever re-added. (No-op if none exists.)
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname='public' and tablename='user_companies' and cmd = 'DELETE'
  loop
    execute format('drop policy if exists %I on public.user_companies', pol.policyname);
  end loop;
end $$;
