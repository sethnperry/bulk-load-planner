// app/join/JoinClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

// Deterministically wait for the magic-link session to be established instead
// of assuming a fixed delay is "enough" (the old setTimeout(1000) was a timing
// assumption, not synchronization -- a slow device could miss it, a fast one
// wasted the second). We first check for an existing session, then subscribe
// to onAuthStateChange so we react the instant the token in the URL is
// processed, with a bounded fallback poll and a hard timeout that fails
// cleanly rather than proceeding without a session.
function waitForSession(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  timeoutMs = 12000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try { sub?.subscription.unsubscribe(); } catch {}
      clearInterval(poll);
      clearTimeout(hardStop);
      resolve(ok);
    };

    // React immediately to the auth event the magic link fires.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user) finish(true);
    });

    // Also poll, in case the session was already present before we subscribed.
    const poll = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) finish(true);
    }, 250);

    // Check once up front too (covers the already-signed-in case).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) finish(true);
    });

    const hardStop = setTimeout(() => finish(false), timeoutMs);
  });
}

export default function JoinClient() {
  const router  = useRouter();
  const sp      = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [msg,    setMsg]    = useState("Setting up your account…");

  useEffect(() => {
    async function join() {
      try {
        const hasSession = await waitForSession(supabase);
        if (!hasSession) {
          // No session ever arrived -- the link was already used, expired, or
          // opened in a browser that never received the token. Send the user
          // back to request a fresh one rather than deeper into the app.
          setStatus("error");
          setMsg("That sign-in link has expired or was already used. Request a new one from the login screen.");
          return;
        }

        const companyId = sp.get("company");
        // Set this company as active so the app loads it immediately. This RPC
        // is membership-checked server-side -- it will reject a company the
        // user is not actually a member of, so it cannot be used to jump into
        // a company they were not invited to.
        if (companyId) {
          await supabase.rpc("set_active_company", { p_company_id: companyId });
        }

        // The invite API route already created the user_companies row.
        setStatus("success");
        setMsg("You're in! Taking you to the app…");
        setTimeout(() => router.replace("/planner"), 800);

      } catch (e: any) {
        // Never surface a raw Supabase error to the driver.
        console.error("[join] error:", e?.message ?? e);
        setStatus("error");
        setMsg("We couldn't finish setting up your account. Please request a new link and try again.");
      }
    }
    join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = status === "error" ? "#f87171" : status === "success" ? "#4ade80" : "rgba(255,255,255,0.7)";
  const icon  = status === "error" ? "✕" : status === "success" ? "✓" : "…";

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", padding: "40px 32px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", maxWidth: 360, width: "100%", margin: "0 16px" }}>
        <div style={{ fontSize: 48, marginBottom: 16, color }}>{icon}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>
          {status === "loading" ? "Setting up your account" : status === "success" ? "Welcome aboard!" : "Something went wrong"}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{msg}</div>
        {status === "error" && (
          <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => router.replace("/login")}
              style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", fontSize: 14 }}>
              Back to login
            </button>
            <button onClick={() => window.location.reload()}
              style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", fontSize: 14 }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
