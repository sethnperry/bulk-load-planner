"use client";
// hooks/useDemoWatchdog.ts
//
// Backs the shareable demo accounts: enforces "only one active session per
// persona, newest link-visit always wins" plus an idle-timeout backstop.
// Entirely a no-op for every real user -- gated on authUserId matching one
// of the known demo account ids, so this has zero effect outside those
// accounts.
//
// Follows this codebase's existing lightweight polling idiom (see
// useLocation.ts's ambient-temp heartbeat) rather than introducing Supabase
// Realtime, which nothing else in the app uses.
//
// Session model (agreed with the user):
//   - A fresh tab/visit (no stored sessionStorage token) calls
//     demo_commandeer() itself, which mints a new active_token server-side
//     and implicitly kicks whoever held the previous one -- this is what
//     makes "open the link again" == "take over." demo_commandeer acts on
//     auth.uid(), so each persona's session tracking is independent --
//     alpha and beta never kick each other.
//   - A same-tab page refresh reuses the token already in sessionStorage,
//     so it does NOT self-commandeer/kick itself out.
//   - Polling every ~15s detects a mismatch (someone else commandeered) and
//     signs this tab out.
//   - True tab-close detection isn't reliable across browsers, so an idle
//     timeout is the real backstop; a best-effort pagehide handler is added
//     on top but isn't relied on.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const TOKEN_KEY = "protankr_demo_token_v1";
const POLL_MS = 15_000;
const IDLE_MS = 20 * 60 * 1000; // 20 minutes
const IDLE_CHECK_MS = 30_000;

// "alpha:uuid1,beta:uuid2" -- keeps the persona key available for the
// ended-page redirect instead of guessing it back from list position.
function parseDemoPersonas(): Map<string, string> {
  const raw = process.env.NEXT_PUBLIC_DEMO_USER_IDS ?? "";
  const map = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const [key, id] = entry.split(":").map((s) => s.trim());
    if (key && id) map.set(id, key);
  }
  return map;
}

export function useDemoWatchdog(authUserId: string) {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const endedRef = useRef(false);

  const demoPersonasById = parseDemoPersonas();
  const personaKey = demoPersonasById.get(authUserId);
  const isDemo = !!personaKey;

  useEffect(() => {
    if (!isDemo) return;
    endedRef.current = false;

    async function endSession(reason: string) {
      if (endedRef.current) return;
      endedRef.current = true;
      try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
      try { await supabase.auth.signOut(); } catch {}
      router.replace(`/demo/ended?reason=${reason}&persona=${personaKey}`);
    }

    async function ensureCommandeered() {
      let token: string | null = null;
      try { token = sessionStorage.getItem(TOKEN_KEY); } catch {}
      if (token) return;
      try {
        const { data, error } = await supabase.rpc("demo_commandeer");
        if (error) throw error;
        try { sessionStorage.setItem(TOKEN_KEY, String(data)); } catch {}
      } catch (e) {
        console.warn("demo_commandeer failed (non-fatal):", e);
      }
    }

    async function checkSuperseded() {
      let myToken: string | null = null;
      try { myToken = sessionStorage.getItem(TOKEN_KEY); } catch {}
      if (!myToken) return;
      const { data, error } = await supabase
        .from("demo_sessions")
        .select("active_token")
        .eq("user_id", authUserId)
        .maybeSingle();
      if (error) return; // transient read failure -- don't kick on a fluke
      if (data && data.active_token !== myToken) {
        void endSession("commandeered");
      }
    }

    function bumpActivity() {
      lastActivityRef.current = Date.now();
    }

    function checkIdle() {
      if (Date.now() - lastActivityRef.current > IDLE_MS) {
        void endSession("idle");
      }
    }

    function onPageHide() {
      // Best-effort only -- browsers don't guarantee this fires or completes.
      void supabase.auth.signOut({ scope: "local" });
    }

    void ensureCommandeered();

    const pollId = setInterval(() => void checkSuperseded(), POLL_MS);
    const idleId = setInterval(checkIdle, IDLE_CHECK_MS);

    const activityEvents = ["mousemove", "keydown", "touchstart", "scroll"] as const;
    for (const ev of activityEvents) window.addEventListener(ev, bumpActivity, { passive: true });
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(pollId);
      clearInterval(idleId);
      for (const ev of activityEvents) window.removeEventListener(ev, bumpActivity);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isDemo, personaKey, authUserId, router]);
}
