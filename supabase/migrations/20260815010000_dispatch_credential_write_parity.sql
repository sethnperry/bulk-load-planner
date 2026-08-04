-- Extends the credential tables' existing admin-only write access to
-- dispatch too, for the same "all the cards should look identical for
-- every role" Cards-tab parity request as the 20260815000000 migration --
-- this covers the Badges (driver_port_ids) and Credentials (driver_licenses/
-- driver_medical_cards/driver_twic_cards) sub-tabs, reversing the original
-- FleetCredentialsModal "status-only, not full record access" scope-down
-- from the 2026-08-06 pass for this specific in-context editing flow.
--
-- Live pg_policies query (2026-08-04) confirmed before writing this: each of
-- the four tables already has an admin-only ALL policy
-- (dl_admin/dmc_admin/dpid_admin/dtc_admin) checking that auth.uid() has
-- role = 'admin' in the row's own company_id -- notably NOT scoped to the
-- row's own user_id, so any company admin already has full CRUD on every
-- driver's record in that company. Plus an admin+dispatch READ-only policy
-- from 20260806000000_dispatch_credential_visibility.sql. Dispatch write was
-- the only gap. These new policies are purely additive, mirroring each
-- table's own xx_admin shape exactly but for role = 'dispatch' -- doesn't
-- touch _admin/_own/_admin_dispatch_read at all.
--
-- Noted in passing, NOT fixed here (pre-existing, unrelated, flagged
-- separately): xx_own is SELECT-only on all four tables -- there is no
-- own-row INSERT/UPDATE/DELETE policy at all, so a non-admin driver's own
-- Credentials-tab save would fail under RLS today unless they happen to be
-- their solo company's sole admin (solo companies are always role='admin').

create policy dl_dispatch_write on driver_licenses
  for all to authenticated
  using (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_licenses.company_id
        and user_companies.role = 'dispatch'
    )
  )
  with check (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_licenses.company_id
        and user_companies.role = 'dispatch'
    )
  );

create policy dmc_dispatch_write on driver_medical_cards
  for all to authenticated
  using (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_medical_cards.company_id
        and user_companies.role = 'dispatch'
    )
  )
  with check (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_medical_cards.company_id
        and user_companies.role = 'dispatch'
    )
  );

create policy dtc_dispatch_write on driver_twic_cards
  for all to authenticated
  using (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_twic_cards.company_id
        and user_companies.role = 'dispatch'
    )
  )
  with check (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_twic_cards.company_id
        and user_companies.role = 'dispatch'
    )
  );

create policy dpid_dispatch_write on driver_port_ids
  for all to authenticated
  using (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_port_ids.company_id
        and user_companies.role = 'dispatch'
    )
  )
  with check (
    exists (
      select 1 from user_companies
      where user_companies.user_id = auth.uid()
        and user_companies.company_id = driver_port_ids.company_id
        and user_companies.role = 'dispatch'
    )
  );
