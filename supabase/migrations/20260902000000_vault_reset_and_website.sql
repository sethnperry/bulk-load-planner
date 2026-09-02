-- Vault redesign: pattern-lock recovery tokens + a Website field on entries.
--
-- No change to user_vault_pin -- it already stores a SHA-256 hash column
-- (pin_hash) compared client-side; the app now hashes a drawn pattern
-- (e.g. "0-4-8-6-2") through that exact same column/mechanism instead of
-- a typed PIN. Renaming the column would be cosmetic only, so it's left
-- as-is (matches this project's own "rename copy, not schema" precedent,
-- e.g. the Payroll -> Period Report rename).

alter table public.vault_entries add column if not exists website text;

-- Backs the new email-confirmation recovery flow, replacing the old
-- instant/unverified "Forgot PIN" bypass. Deliberately has NO client-
-- facing RLS policies at all -- every read/write goes through the two
-- new service-role API routes (app/api/vault/request-reset,
-- app/api/vault/confirm-reset). RLS is enabled with zero policies,
-- which denies all access by default under Postgres RLS semantics --
-- matches this app's own precedent for token-bookkeeping tables with no
-- direct client access.
create table if not exists public.vault_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.vault_reset_tokens enable row level security;

create index if not exists vault_reset_tokens_user_id_idx on public.vault_reset_tokens(user_id);
