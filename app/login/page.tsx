"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

/**
 * A throwaway, implicit-flow client used ONLY to fire signInWithOtp below --
 * never for reading/holding a session (persistSession: false, no storage
 * writes). The shared `supabase` singleton forces flowType: "pkce" (via
 * createBrowserClient, see lib/supabase/client.ts), which means the emailed
 * magic link needs the code_verifier cookie from this exact browser to
 * complete -- fine on the same device/browser, but breaks the moment the
 * link is opened somewhere else (a different device, a mail app's in-app
 * browser, or a security scanner that pre-fetches the link), surfacing as a
 * generic "link expired" error in CallbackClient.tsx even though the link
 * itself was fine. Sending the OTP request through an implicit-flow client
 * instead makes the resulting link carry session tokens directly in the URL
 * fragment (#access_token=...) -- no stored secret required on the
 * clicking end, so it completes correctly regardless of where it's opened.
 * CallbackClient.tsx's existing getSession()/detectSessionInUrl fallback
 * (the `else` branch, for whenever no ?code= is present) already handles
 * this without any further changes there.
 */
const otpUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const otpKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const otpOnlyClient = createClient(otpUrl, otpKey, {
  auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export default function LoginPage() {
  const router = useRouter();
  // This page must never be shown to someone who's already signed in --
  // otherwise a stale PWA start_url (or a WebAPK install that snapshotted
  // an old manifest/session state) can trap a genuinely logged-in user
  // into re-sending a magic link every time they open the app, even
  // though their session was fine the whole time. getSession() (not
  // getUser()) reads the local session with no auth-server round trip --
  // same reasoning as the CalculatorShellContext auth gate fix.
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        router.replace("/planner");
        return;
      }
      setCheckingSession(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email.");
      return;
    }

    setSending(true);
    try {
     const siteUrl =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://www.protankr.com";

const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent("/planner")}`;
      const { error: otpError } = await otpOnlyClient.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo },
      });

      if (otpError) throw otpError;

      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send magic link.");
    } finally {
      setSending(false);
    }
  }

  if (checkingSession) {
    return (
      <main style={{ maxWidth: 420, margin: "40px auto", padding: 16, color: "rgba(255,255,255,0.55)" }}>
        Checking session…
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Login</h1>

      {error && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: "rgba(255,0,0,0.08)" }}>
          {error}
        </div>
      )}

      {sent ? (
        <div style={{ padding: 12, borderRadius: 10, background: "rgba(0,255,0,0.08)" }}>
          Magic link sent. Check your email and open the link to finish signing in.
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              inputMode="email"
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={sending}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
        After signing in you’ll be redirected to: <code>/planner</code>
      </div>
    </main>
  );
}