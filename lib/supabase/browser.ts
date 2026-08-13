// lib/supabase/browser.ts
// Previously created its own separate createClient() instance, backed by
// localStorage. Now that lib/supabase/client.ts's singleton is a
// cookie-backed createBrowserClient, a second independently-storaged client
// here would read/write a different session than the rest of the app --
// delegating to the one real singleton instead.
import { supabase } from "@/lib/supabase/client";

export function createSupabaseBrowser() {
  return supabase;
}
