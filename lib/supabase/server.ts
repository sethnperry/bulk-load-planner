// lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // This throws when called from a plain Server Component (e.g.
          // app/planner/layout.tsx, not a Route Handler or Server Action) --
          // Next.js only allows cookie mutation from those two contexts.
          // Supabase's SSR client still calls setAll here whenever it needs
          // to persist a refreshed access token (the access token expires
          // ~hourly, so this fires whenever a session that's been sitting
          // idle -- e.g. the site left open in a browser tab -- gets used
          // again), and with no middleware in this project handling refresh
          // instead, that write was previously unguarded: it threw a real
          // uncaught exception straight out of the layout, which is exactly
          // Next's "Application error: a server-side exception has
          // occurred" -- a genuine code bug, not a cache/install issue, so
          // deleting and reinstalling the app could never have fixed it.
          // Safe to swallow: this is the documented Supabase/Next.js
          // pattern for exactly this case, and lib/supabase/client.ts's own
          // browser-side client independently refreshes the session on its
          // own, so a dropped write here just means this one server render
          // reads the not-yet-refreshed (but still valid) token instead of
          // crashing the page.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}