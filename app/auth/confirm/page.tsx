"use client";
// app/auth/confirm/page.tsx

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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

// ── Shared UI ─────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#0f0f0f", color: "#e8e8e8",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ fontSize: 28, marginBottom: 16 }}>⛽</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f97316", marginBottom: 8 }}>ProTankr</div>
      <div style={{ fontSize: 14, color: "#888" }}>Signing you in…</div>
      <div style={{
        marginTop: 32, width: 36, height: 36,
        border: "3px solid #333", borderTopColor: "#f97316",
        borderRadius: "50%", animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "0 20px",
      background: "#0f0f0f", color: "#e8e8e8",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ fontSize: 28, marginBottom: 16 }}>⛽</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f97316", marginBottom: 20 }}>ProTankr</div>
      <div style={{
        background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12,
        padding: "24px 28px", maxWidth: 400, width: "100%", textAlign: "center" as const,
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Link expired or already used</div>
        <div style={{ fontSize: 14, color: "#888", lineHeight: 1.6, marginBottom: 20 }}>{msg}</div>
        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
          Ask your administrator to send a new invite, or contact support.
        </div>
      </div>
    </div>
  );
}
