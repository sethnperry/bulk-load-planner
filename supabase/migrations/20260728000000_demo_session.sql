-- Backs the shareable demo-account feature: a single "who's currently
-- active" token for the demo user, so a lightweight client-side poll can
-- detect it's been superseded by a newer visit and sign itself out
-- ("commandeer" semantics -- opening the demo link again always wins).
--
-- demo_commandeer() takes no arguments and only ever acts on auth.uid() --
-- it's called by the client while already authenticated as the demo
-- account (gated client-side on user id), so it never needs to trust a
-- caller-supplied identity. SECURITY DEFINER bypasses RLS for the upsert,
-- matching begin_load/delete_load's existing pattern in this migrations
-- folder; the table itself only needs a self-select policy for the client's
-- own polling read.

CREATE TABLE IF NOT EXISTS public.demo_sessions (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_token uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_sessions_select_self ON public.demo_sessions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.demo_commandeer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_token   uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.demo_sessions (user_id, active_token, updated_at)
  VALUES (v_user_id, v_token, now())
  ON CONFLICT (user_id) DO UPDATE
    SET active_token = v_token, updated_at = now();

  RETURN v_token;
END;
$function$;
