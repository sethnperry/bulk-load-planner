-- ============================================================================
-- Pre-audit remediation: remove permissive `using (true)` SELECT policies that
-- expose company-OWNED data
-- ============================================================================
-- The base schema dump (20260222172537_remote_schema.sql) declares BOTH a
-- correct company-scoped SELECT policy AND a broad `using (true)` policy on the
-- equipment tables. RLS policies are permissive-OR, so the broad one defeats
-- the scoped one. Live production has already dropped these broad policies
-- (verified 2026-09-06: two isolated demo companies cannot read each other's
-- trucks/trailers/trailer_compartments), so on the LIVE database each DROP
-- below is a no-op -- but a from-scratch rebuild from the migration files would
-- reinstall the holes. This migration makes the declared policy set match the
-- safe live reality and is the single source of truth going forward.
--
-- Only genuinely company-OWNED tables are touched. Global reference data
-- (products, terminals, terminal_products, cities, states) is intentionally
-- readable by every authenticated user and is deliberately left alone.
--
-- Idempotent and safe to re-run.
-- ============================================================================

-- ── trucks / trailers: the company-scoped `*_select` policies already exist;
--    just remove the broad companions. ──────────────────────────────────────
drop policy if exists "trucks_read_auth"   on public.trucks;
drop policy if exists "trailers_read_auth" on public.trailers;

-- Re-assert the canonical company-scoped SELECT policies so a rebuild always
-- has them even if the base dump changes (drop+create = idempotent).
drop policy if exists "trucks_select" on public.trucks;
create policy "trucks_select" on public.trucks
  as permissive for select to authenticated
  using (company_id in (
    select company_id from public.user_companies where user_id = auth.uid()
  ));

drop policy if exists "trailers_select" on public.trailers;
create policy "trailers_select" on public.trailers
  as permissive for select to authenticated
  using (company_id in (
    select company_id from public.user_companies where user_id = auth.uid()
  ));

-- ── trailer_compartments: has NO company-scoped policy in the dump at all --
--    only two `using (true)` policies. Drop both and scope reads through the
--    parent trailer's company (equipment is shared fleet property, so every
--    company member may read its trailers' compartments -- matches trucks/
--    trailers). ──────────────────────────────────────────────────────────────
drop policy if exists "read trailer_compartments" on public.trailer_compartments;
drop policy if exists "trailer_comps_read_auth"   on public.trailer_compartments;

drop policy if exists "trailer_compartments_select_company" on public.trailer_compartments;
create policy "trailer_compartments_select_company" on public.trailer_compartments
  as permissive for select to authenticated
  using (trailer_id in (
    select t.trailer_id from public.trailers t
     where t.company_id in (
       select company_id from public.user_companies where user_id = auth.uid()
     )
  ));
