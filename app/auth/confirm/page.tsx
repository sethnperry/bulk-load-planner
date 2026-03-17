"use client";
// app/auth/confirm/page.tsx

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const LOGO_PATH =
  "M 41.28,85.61 L40.14,85.38 L39.51,84.29 L39.51,29.70 L39.97,28.44 L41.86,27.35 L75.00,27.35 L76.43,26.38 L76.66,24.20 L74.77,22.76 L21.90,22.65 L19.15,21.62 L16.57,19.50 L9.12,11.24 L8.66,10.21 L8.89,8.72 L10.32,7.51 L75.11,7.40 L79.36,8.08 L82.91,9.58 L87.90,13.65 L91.34,19.72 L92.14,26.38 L91.46,30.05 L90.08,33.37 L85.67,38.70 L82.57,40.77 L79.13,42.14 L75.92,42.72 L55.85,42.72 L54.99,43.35 L54.42,72.36 L52.92,74.89 L41.28,85.61 Z";

// ── Inner component uses useSearchParams — must be inside <Suspense> ──────────
function ConfirmInner() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    async function exchange() {
      const tokenHash = params.get("token_hash");
      const type = (params.get("type") ?? "invite") as
        | "invite" | "magiclink" | "recovery" | "signup" | "email";

      if (!tokenHash) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { router.replace("/profile"); return; }
        setErrMsg("No token found in this link. It may have already been used or has expired.");
        setStatus("error");
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        setErrMsg(error.message ?? "This link is invalid or has expired.");
        setStatus("error");
        return;
      }

      router.replace("/profile");
    }
    exchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") return <LoadingScreen />;
  return <ErrorScreen msg={errMsg} />;
}

// ── Page export wraps inner in Suspense ───────────────────────────────────────
export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ConfirmInner />
    </Suspense>
  );
}

// ── Loading screen — animated PT logo ────────────────────────────────────────
function LoadingScreen() {
  const [phase, setPhase] = useState<"spin" | "settle">("spin");

  useEffect(() => {
    const t = setTimeout(() => setPhase("settle"), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#111111",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: 72,
        height: 72,
        animation: phase === "spin" ? "pt-flip 0.9s ease-in-out forwards" : "none",
      }}>
        <svg viewBox="0 0 100 92.1" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
          <path d={LOGO_PATH} fill="white" />
        </svg>
      </div>

      <div style={{
        marginTop: 20,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.15em",
        textTransform: "uppercase" as const,
        color: "rgba(255,255,255,0.28)",
        opacity: phase === "spin" ? 0 : 1,
        transition: "opacity 0.3s ease 0.1s",
      }}>
        ProTankr
      </div>

      <div style={{
        marginTop: 8,
        fontSize: 13,
        color: "rgba(255,255,255,0.30)",
        opacity: phase === "spin" ? 0 : 1,
        transition: "opacity 0.3s ease 0.2s",
      }}>
        Signing you in…
      </div>

      <style>{`
        @keyframes pt-flip {
          0%   { transform: perspective(400px) rotateY(0deg) scaleX(1); }
          40%  { transform: perspective(400px) rotateY(-180deg) scaleX(0.85); }
          70%  { transform: perspective(400px) rotateY(-340deg) scaleX(1.05); }
          100% { transform: perspective(400px) rotateY(-360deg) scaleX(1); }
        }
      `}</style>
    </div>
  );
}

// ── Error screen ──────────────────────────────────────────────────────────────
function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 20px",
      background: "#111111",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ width: 48, height: 48, marginBottom: 20 }}>
        <svg viewBox="0 0 100 92.1" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
          <path d={LOGO_PATH} fill="white" />
        </svg>
      </div>

      <div style={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.15em",
        textTransform: "uppercase" as const,
        color: "rgba(255,255,255,0.28)",
        marginBottom: 28,
      }}>
        ProTankr
      </div>

      <div style={{
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "24px 28px",
        maxWidth: 380,
        width: "100%",
        textAlign: "center" as const,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
          Link expired or already used
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 16 }}>
          {msg}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
          Ask your administrator to send a new invite.
        </div>
      </div>
    </div>
  );
}
