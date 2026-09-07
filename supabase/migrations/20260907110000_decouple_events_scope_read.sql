-- F-E (audit pass 1): decouple_events SELECT policy was `qual = true` for role
-- `authenticated`, so ANY authenticated user could read EVERY company's
-- decouple history -- including equipment GPS (truck_lat/lon), locations, and
-- free-text notes. Proven live: two users in different companies saw the
-- identical full row set. The table is written only by the decouple_combo
-- SECURITY DEFINER RPC (its INSERT policy is correctly self-scoped:
-- user_id = auth.uid()) and is never SELECTed by the app, so scoping the read
-- down breaks nothing.
--
-- New read scope: the actor who logged it, OR staff of the equipment's own
-- company (joined via truck/trailer -> company_id). No cross-company reads.

drop policy if exists "Users can read decouple events" on public.decouple_events;

create policy "decouple_events_read_scoped" on public.decouple_events
  as permissive for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.trucks t
                where t.truck_id = decouple_events.truck_id
                  and public.is_company_staff(t.company_id))
    or exists (select 1 from public.trailers tr
                where tr.trailer_id = decouple_events.trailer_id
                  and public.is_company_staff(tr.company_id))
  );
