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
      console.log("[AuthCallback] href:", window.location.href);

      // Let Supabase auto-detect tokens in URL
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setMsg("Auth error: " + error.message);
        return;
      }

      if (!data.session) {
        setMsg("No session found. Open the newest magic link.");
        return;
      }

      router.replace("/calculator");
    } catch (e: any) {
      setMsg("Auth error: " + (e?.message ?? String(e)));
    }
  })();
}, [router]);


  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signing in…</h1>

      <p style={{ opacity: 0.7, fontSize: 12, wordBreak: "break-all" }}>
        href: {typeof window !== "undefined" ? window.location.href : ""}
      </p>

      <p style={{ marginTop: 12 }}>{msg}</p>
    </main>
  );
}

