-- company_subscriptions: one row per company, reflecting the CURRENT
-- entitlement state (what's paid for, what's active) -- not a Stripe
-- mirror. The actual source of truth for "why" a row has these values is
-- Stripe (or, once native apps exist, RevenueCat); this table is what the
-- app itself reads to gate access and render seat usage, kept in sync by
-- a webhook handler (not built yet) that's the only thing allowed to
-- write to it -- same "no direct client write" shape as load_points.
--
-- Seat model: two independent pools, matching the pricing already decided
-- in CLAUDE.md ("Roles & permissions" -> Pricing) -- base Fleet plan =
-- 1 admin seat + 4 non-admin seats included, additional seats of either
-- kind priced/tracked separately. Solo tier rows just carry
-- paid_admin_seats = 1, paid_other_seats = 0 (a solo company is always a
-- single admin, per the existing solo-provisioning design -- see
-- "Key existing infrastructure").
--
-- Actual USAGE is deliberately not stored here -- it's derived live from
-- user_companies (count of role='admin' vs role in the other three) so it
-- can never drift out of sync with reality the way a cached counter could.

create table public.company_subscriptions (
  company_id           uuid primary key references public.companies(company_id) on delete cascade,
  tier                 text not null default 'solo' check (tier in ('solo', 'fleet')),
  status               text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  paid_admin_seats     integer not null default 1,
  paid_other_seats     integer not null default 0,
  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  stripe_customer_id   text,
  stripe_subscription_id text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger trg_company_subscriptions_updated_at
  before update on public.company_subscriptions
  for each row execute function set_updated_at();

alter table public.company_subscriptions enable row level security;

-- Any staff member (admin/lead/dispatch) can read their own company's row,
-- for the seat-usage indicator and invite-time capacity check -- same
-- read-visibility precedent as everything else company-wide in this app.
-- No self-serve driver read: seat/billing info isn't relevant to a driver.
create policy company_subscriptions_staff_read
  on public.company_subscriptions
  for select
  using (public.is_company_staff(company_id));

-- No insert/update/delete policy at all -- this table is only ever
-- written by a service-role webhook handler (bypasses RLS entirely),
-- never by an authenticated client directly. Mirrors load_points' own
-- "no direct client write" shape.
