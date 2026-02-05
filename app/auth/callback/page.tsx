"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in...");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (!code) {
          setMsg("No code found in the URL. Try logging in again.");
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMsg("Auth error: " + error.message);
          return;
        }

        // Session should now exist on THIS origin (localhost or LAN IP)
        router.replace("/calculator");
      } catch (e: any) {
        setMsg("Auth error: " + (e?.message ?? String(e)));
      }
    })();
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signing in…</h1>
      <p style={{ marginTop: 12 }}>{msg}</p>
    </main>
  );
}

