"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function CalculatorPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("(loading...)");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "(no email)");
    }
    load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Calculator (placeholder)</h1>
      <p style={{ marginTop: 12 }}>
        Logged in as: <b>{email}</b>
      </p>
      <button onClick={signOut} style={{ marginTop: 16, padding: 10 }}>
        Sign out
      </button>
    </main>
  );
}
