"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in...");

  useEffect(() => {
    async function run() {
      // Supabase reads the token from the URL and stores a session automatically.
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setMsg("Auth error: " + error.message);
        return;
      }

      if (data.session) {
        router.replace("/calculator");
        return;
      }

      // Sometimes session isn't ready instantly; retry once.
      setTimeout(async () => {
        const { data: d2, error: e2 } = await supabase.auth.getSession();
        if (e2) setMsg("Auth error: " + e2.message);
        else if (d2.session) router.replace("/calculator");
        else setMsg("No session found. Try logging in again.");
      }, 800);
    }

    run();
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signing in…</h1>
      <p style={{ marginTop: 12 }}>{msg}</p>
    </main>
  );
}
