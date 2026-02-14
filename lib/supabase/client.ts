// lib/supabase/client.ts
import { createClient } from "@supabase/supabase-js";

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
 * Browser-only storage for auth persistence.
 * In App Router, modules can be imported in server contexts;
 * avoid touching window/localStorage when it's not available.
 */
const storage =
  typeof window !== "undefined"
    ? window.localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
  },
});
