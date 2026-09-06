// lib/supabase/serviceClient.ts
// Server-side only. Never import this from client components.
// Uses the service role key — bypasses RLS entirely.
//
// The client is built LAZILY, on first call, and never at module scope.
// `next build` imports every route module while collecting page data, so a
// module-scope read of SUPABASE_SERVICE_ROLE_KEY makes the whole build depend
// on a runtime secret being present in the build environment. That is what
// broke the 2026-09-06 production deploy: the key is a runtime value, the
// build environment did not have it, and importing this module threw before
// any request existed. Constructing on demand means a missing key surfaces as
// a 500 on the one route that needs it, not a failed deploy of the entire app.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
