-- The Vault tab: a private, PIN-gated notebook for credentials that don't
-- fit anywhere else in the app (dispatch software, Transflo, truck tablet
-- login, employee number, company purchase account IDs, credit cards,
-- 401k, other company website logins, fuel cards, ELD, Slack, email --
-- whatever a driver needs to keep track of). Strictly private per driver --
-- never shared within a company, unlike almost everything else in this
-- schema which is company-scoped. The PIN is a simple app-level gate (a
-- SHA-256 hash compared client-side after entry), not real encryption --
-- vault_entries.secret is stored the same way any other RLS-protected
-- column in this app is, matching the "simple PIN gate" security level the
-- user explicitly chose over real client-side encryption.

CREATE TABLE IF NOT EXISTS public.user_vault_pin (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_vault_pin ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_vault_pin_select_own ON public.user_vault_pin
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_vault_pin_insert_own ON public.user_vault_pin
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_vault_pin_update_own ON public.user_vault_pin
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_vault_pin_delete_own ON public.user_vault_pin
  FOR DELETE USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.vault_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label      text NOT NULL,
  category   text,
  username   text,
  secret     text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_entries_select_own ON public.vault_entries
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY vault_entries_insert_own ON public.vault_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY vault_entries_update_own ON public.vault_entries
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY vault_entries_delete_own ON public.vault_entries
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS vault_entries_user_id_idx ON public.vault_entries(user_id);
