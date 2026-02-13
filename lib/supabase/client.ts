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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
