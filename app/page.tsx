"use client";
// app/page.tsx

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/calculator");
      } else {
        router.replace("/login");
      }
    });
  }, [router]);

  // Blank dark screen while session resolves — no flash
  return <div style={{ minHeight: "100dvh", background: "#111111" }} />;
}
