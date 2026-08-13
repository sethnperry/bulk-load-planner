// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    `Missing Supabase env vars:
NEXT_PUBLIC_SUPABASE_URL=${String(supabaseUrl)}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey ? "[set]" : "[missing]"}`
  );
}

/**
 * @supabase/ssr's createBrowserClient (not plain createClient) -- this is
 * what actually syncs the session to cookies instead of localStorage-only.
 * Every server-side auth helper in lib/authz.ts reads the session via
 * next/headers' cookies(), which was never populated before this change --
 * see CLAUDE.md "Architecture reality" for the full history of why those
 * helpers were dead code.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

/**
 * One-time migration: every already-logged-in user has their session sitting
 * in the OLD client's localStorage key, which this cookie-backed client
 * never reads -- without this, shipping this file would silently log out
 * every currently-signed-in user (dev and production) on their next load.
 * Lifts the legacy session into the new cookie storage via setSession, then
 * clears the old key so this is a no-op on every subsequent load.
 */
if (typeof window !== "undefined") {
  (async () => {
    try {
      const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
      const legacyKey = `sb-${projectRef}-auth-token`;
      const raw = window.localStorage.getItem(legacyKey);
      if (!raw) return;

      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        window.localStorage.removeItem(legacyKey);
        return;
      }

      const parsed = JSON.parse(raw);
      const access_token = parsed?.access_token;
      const refresh_token = parsed?.refresh_token;
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // Best-effort only -- worst case the user has to log in again.
    }
  })();
}
